import React from "react";
import type { User } from "@supabase/supabase-js";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncPendingStatus, createSyncSavedStatus, createSyncSavingStatus } from "./accountSession.ts";
import type { AuthPhase } from "./accountSession.ts";
import { markCloudBootstrapReady, markCloudSyncReady, markWorkspaceLocalReady } from "./appPerformance.ts";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle, type AuthenticatedWorkspaceBootResult } from "./authenticatedWorkspaceBoot.ts";
import { formatCloudAuthError } from "./cloudAuth.ts";
import type { SyncStatus } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import type { AccountBaselineState } from "./workspaceReplica.ts";

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

/** What the app does with the account's workspace; the hook owns session, start and cloud bootstrap. */
interface AccountWorkspaceEvents {
  /** The local workspace is open, before the cloud has answered. */
  opened: (boot: AuthenticatedWorkspaceBootResult) => void;
  /** The cloud bootstrap or the first sync brought a newer shell state. */
  cloudState: (state: WorkspaceState, status: SyncStatus) => void;
  syncStatus: (status: SyncStatus) => void;
  /** The workspace was discarded: sign-out, rejected session or password recovery. */
  discarded: () => void;
}

/**
 * Supabase session, account-bound workspace start and cloud bootstrap (ADR-024, ADR-038). Every start gets a run id;
 * a discarded or newer start makes the results of older ones void.
 */
export function useAccountWorkspace(supabase: SupabaseBrowserClient | undefined, events: AccountWorkspaceEvents) {
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

  return {
    authPhase,
    setAuthPhase,
    authMessage,
    setAuthMessage,
    authMessageType,
    setAuthMessageType,
    cloudUser,
    workspaceRepository,
    syncEngine,
    syncEngineRef,
    accountBaselineState,
    baselineLoadFailed,
    bootRunRef,
    boot,
    discardWorkspace,
    retryCloudBootstrap() {
      setBaselineLoadFailed(false);
      retryCloudBootstrapRef.current?.();
    },
  };
}
