import React from "react";
import type { User } from "@supabase/supabase-js";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncPendingStatus, createSyncSavedStatus, createSyncSavingStatus } from "./accountSession.ts";
import type { AuthPhase } from "./accountSession.ts";
import { markCloudBootstrapReady, markCloudSyncReady, markWorkspaceLocalReady } from "./appPerformance.ts";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle, type AuthenticatedWorkspaceBootResult } from "./authenticatedWorkspaceBoot.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import type { Profile, SyncStatus } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { bindFieldTimingsAccount } from "./fieldTimings.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import type { AccountBaselineState } from "./workspaceReplica.ts";

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
interface SignInInput { email: string; password: string }
interface SignUpInput extends SignInInput { displayName: string }
interface EmailInput { email: string }
interface PasswordUpdateInput { password: string; passwordRepeat: string }

/** What the app does with the account's workspace; the hook owns session, start and cloud bootstrap. */
interface AccountWorkspaceEvents {
  /** The local workspace is open, before the cloud has answered. */
  opened: (boot: AuthenticatedWorkspaceBootResult) => void;
  /** The cloud bootstrap or the first sync brought a newer shell state. */
  cloudState: (state: WorkspaceState, status: SyncStatus) => void;
  syncStatus: (status: SyncStatus) => void;
  /** The workspace was discarded: sign-out, rejected session or password recovery. */
  discarded: () => void;
  /** The account signed out on this device; what outlives a workspace ends as well. */
  signedOut: () => void;
}

/**
 * Supabase client and session, the sign-in, registration, password and sign-out actions, account-bound workspace
 * start and cloud bootstrap (ADR-034, ADR-038). Every start gets a run id; a discarded or newer start makes the
 * results of older ones void.
 */
export function useAccountWorkspace(events: AccountWorkspaceEvents) {
  const [supabase, setSupabase] = React.useState<SupabaseBrowserClient | undefined>(undefined);
  const [supabaseUrl, setSupabaseUrl] = React.useState("");
  const [authBusy, setAuthBusy] = React.useState(false);
  const eventsRef = React.useRef(events);
  eventsRef.current = events;
  const bootRunRef = React.useRef(0);
  const retryCloudBootstrapRef = React.useRef<(() => void) | null>(null);
  const stopCloudBootstrapRetryRef = React.useRef<(() => void) | null>(null);
  const syncEngineRef = React.useRef<AccountSyncEngine | null>(null);
  const [authPhase, setAuthPhase] = React.useState<AuthPhase>(authPhases.checkingSession);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState<"status" | "alert">("status");
  const [cloudUser, setCloudUser] = React.useState<User | null>(null);
  const [workspaceRepository, setWorkspaceRepository] = React.useState<IndexedDbCoreRepository | null>(null);
  const [syncEngine, setSyncEngine] = React.useState<AccountSyncEngine | null>(null);
  const [accountBaselineState, setAccountBaselineState] = React.useState<AccountBaselineState>("uninitialized");
  const [baselineLoadFailed, setBaselineLoadFailed] = React.useState(false);

  const stopCloudBootstrapRetry = () => {
    stopCloudBootstrapRetryRef.current?.();
    stopCloudBootstrapRetryRef.current = null;
    retryCloudBootstrapRef.current = null;
  };

  /** Ends the current workspace; results of a start still running are dropped. */
  function discardWorkspace(user: User | null = null) {
    bootRunRef.current += 1;
    stopCloudBootstrapRetry();
    syncEngineRef.current = null;
    setSyncEngine(null);
    setWorkspaceRepository(null);
    setCloudUser(user);
    bindFieldTimingsAccount(null);
    eventsRef.current.discarded();
  }

  async function boot(user: User) {
    const runId = bootRunRef.current + 1;
    bootRunRef.current = runId;
    setAuthPhase("loading-cloud");
    setAuthMessage("");
    setBaselineLoadFailed(false);
    stopCloudBootstrapRetry();

    if (!supabase) throw new Error("Supabase ist für diese Umgebung nicht konfiguriert.");
    const started = await bootAuthenticatedWorkspace(supabase, user);
    if (bootRunRef.current !== runId) {
      started.stopCloudBootstrapRetry();
      return;
    }
    retryCloudBootstrapRef.current = started.retryCloudBootstrap;
    stopCloudBootstrapRetryRef.current = started.stopCloudBootstrapRetry;

    setWorkspaceRepository(started.repository);
    syncEngineRef.current = null;
    setSyncEngine(null);
    setCloudUser(user);
    bindFieldTimingsAccount(user.id);
    setAccountBaselineState(started.baselineState);
    eventsRef.current.opened(started);
    markWorkspaceLocalReady();
    setAuthPhase(started.baselineState !== "uninitialized" ? "ready" : "loading-cloud");

    void started.bootstrapFirstAttempt.catch(() => {
      if (bootRunRef.current === runId) setBaselineLoadFailed(true);
    });

    void started.cloudBootstrap.then((bootstrap) => {
      if (bootRunRef.current !== runId) return;
      setAccountBaselineState(started.repository.getReplicaStatus().accountBaselineState);
      setBaselineLoadFailed(false);
      eventsRef.current.cloudState(
        started.repository.getShellState(),
        bootstrap.conflictCount > 0 ? createSyncConflictStatus(bootstrap.conflictCount) : createSyncSavingStatus(),
      );
      setAuthPhase("ready");
      markCloudBootstrapReady();
    }).catch(() => {});

    void started.cloudSync.then((cloud) => {
      if (bootRunRef.current !== runId) return;
      syncEngineRef.current = cloud.syncEngine;
      setSyncEngine(cloud.syncEngine);
      eventsRef.current.cloudState(
        started.repository.getShellState(),
        cloud.conflictCount > 0
          ? createSyncConflictStatus(cloud.conflictCount)
          : cloud.pendingCount > 0
            ? createSyncPendingStatus(cloud.pendingCount)
            : createSyncSavedStatus("Cloud aktuell."),
      );
      markCloudSyncReady();
    }).catch((error) => {
      if (bootRunRef.current !== runId) return;
      eventsRef.current.syncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Cloud-Abgleich wird später erneut versucht.")));
    });
  }

  React.useEffect(() => {
    let active = true;
    void import("./supabaseClient.ts").then(({ createSupabaseBrowserClient, getSupabaseBrowserConfig }) => {
      if (!active) return;
      setSupabaseUrl(getSupabaseBrowserConfig().url);
      setSupabase(createSupabaseBrowserClient());
    }).catch(() => {
      if (!active) return;
      setAuthPhase(authPhases.signedOut);
      setAuthMessage("Anmeldung konnte nicht geladen werden. Bitte lade die Seite neu.");
      setAuthMessageType("alert");
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (supabase === undefined) return undefined;
    const stop = startAuthenticatedWorkspaceSessionLifecycle({
      supabase,
      onUnavailable() {
        setAuthPhase(authPhaseForSession({ configured: false, user: null }));
        setAuthMessage("");
        setAuthMessageType("status");
      },
      onSignedOut() {
        setAuthPhase(authPhaseForSession({ configured: true, user: null }));
      },
      onRedirectError(message) {
        setAuthPhase(authPhases.signedOut);
        setAuthMessage(message);
        setAuthMessageType("alert");
      },
      onPasswordRecovery(user) {
        discardWorkspace(user);
        setAuthPhase(authPhases.passwordRecovery);
        setAuthMessage("Bitte lege ein neues Passwort fest.");
        setAuthMessageType("status");
      },
      onBoot: boot,
      onSessionRejected(error) {
        discardWorkspace();
        setAuthPhase(authPhases.signedOut);
        setAuthMessage(error ? formatCloudAuthError(error, "Sitzung konnte nicht geladen werden.") : "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
        setAuthMessageType(error ? "alert" : "status");
      },
      onFailure(error) {
        setAuthPhase("signed-out");
        setAuthMessage(formatCloudAuthError(error, "Sitzung konnte nicht geladen werden."));
        setAuthMessageType("alert");
      },
    });
    return () => {
      bootRunRef.current += 1;
      stopCloudBootstrapRetry();
      stop();
    };
  }, [supabase]);

  async function signIn({ email, password }: SignInInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInCloudAccount(supabase, { email }, password);
      const user = await getCloudUser(supabase);
      if (!user) throw new Error("Anmeldung konnte nicht bestätigt werden.");
      await boot(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Anmeldung fehlgeschlagen."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signUp({ displayName, email, password }: SignUpInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const profile = await signUpCloudAccount(supabase, { displayName, email }, password);
      if (profile.account?.status === "pending-email-confirmation") {
        setAuthPhase("signed-out");
        setAuthMessage("Account erstellt. Bitte bestätige deine E-Mail-Adresse und melde dich danach an.");
        setAuthMessageType("status");
        return;
      }
      const user = await getCloudUser(supabase);
      if (!user) throw new Error("Account wurde erstellt, aber die Sitzung konnte nicht geladen werden.");
      await boot(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Account konnte nicht erstellt werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword({ email }: EmailInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await resetCloudPassword(supabase, email);
      setAuthMessage("Wenn diese E-Mail registriert ist, wurde ein Reset-Link verschickt.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Reset-Link konnte nicht gesendet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendMagicLink({ email }: EmailInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithMagicLink(supabase, email);
      setAuthMessage("Wenn dieser Account existiert, wurde ein Magic Link verschickt.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Magic Link konnte nicht gesendet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function updatePassword({ password, passwordRepeat }: PasswordUpdateInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (password !== passwordRepeat) throw new Error("Die Passwörter stimmen nicht überein.");
      await updateCloudPassword(supabase, password);
      clearCloudAuthRedirectParams();
      const user = (await getCloudUser(supabase)) ?? cloudUser;
      if (!user) throw new Error("Passwort wurde gespeichert, aber die Sitzung konnte nicht geladen werden.");
      setAuthMessage("Passwort aktualisiert.");
      setAuthMessageType("status");
      await boot(user);
    } catch (error) {
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage(formatCloudAuthError(error, "Passwort konnte nicht gespeichert werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  /** Signs the profile's account out of the cloud and discards the workspace on this device. */
  async function signOut(profile: Profile | undefined) {
    if (supabase && profile) {
      await signOutCloudAccount(supabase, profile);
    }
    discardWorkspace();
    eventsRef.current.signedOut();
    setAuthPhase("signed-out");
    setAuthMessage("Du bist abgemeldet.");
    setAuthMessageType("status");
  }

  return {
    supabase,
    supabaseUrl,
    authPhase,
    authMessage,
    authMessageType,
    authBusy,
    signIn,
    signUp,
    resetPassword,
    sendMagicLink,
    updatePassword,
    signOut,
    cloudUser,
    workspaceRepository,
    syncEngine,
    syncEngineRef,
    accountBaselineState,
    baselineLoadFailed,
    bootRunRef,
    retryCloudBootstrap() {
      setBaselineLoadFailed(false);
      retryCloudBootstrapRef.current?.();
    },
  };
}
