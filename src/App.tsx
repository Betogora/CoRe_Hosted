import React from "react";
import type { User } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import type { AuthPhase } from "./accountSession.ts";
import type { AppRoute, StudyRoute, ViewRoute } from "./appNavigation.ts";
import type { Deck, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import { BarChart3, BookOpen, Database, Home, Layers, Network, PlusSquare, Settings, Users } from "lucide-react";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncIdleStatus, createSyncPendingStatus, createSyncSavedStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { appRouteToUrl, areAppRoutesEqual, createAppHistoryState, createStudyRoute, createViewRoute, normalizeAppRoute, parseAppRouteFromUrl, readAppRouteFromHistoryState } from "./appNavigation.ts";
import { createAccountStorage, hasPendingLocalMigration, markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.ts";
import { AI_CHAT_CONSENT_VERSION } from "./aiChatContract.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, readCloudAuthRedirectOutcome, resetCloudPassword, signInCloudAccount, signInWithGoogle, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import { mergeCloudSyncMetadata, replaceAccountCloudState } from "./cloudRepository.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { createCoreWorkspace, type CoreWorkspace, type WorkspaceState } from "./coreWorkspace.ts";
import { createPortableExport, mergePortableExportIntoState } from "./dataPortability.ts";
import { applyLearningSettingsToDeckSettings, getGlobalDeckSettings, withGlobalDeckSettings, type LearningSettingsInput } from "./deckSettings.ts";
import { createMenuModel } from "./menuModel.ts";
import { createAccountMediaStore } from "./mediaStore.ts";
import { createAccountSyncEngine, SYNC_MUTATION_TYPES, type AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import { createSupabaseBrowserClient, getSupabaseBrowserConfig } from "./supabaseClient.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { OrbIcon, SoftPanel } from "./ui/coreUi.tsx";

const AssistantScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/AssistantScreen.tsx").then(({ AssistantScreen }) => ({ default: AssistantScreen })));
const CommunityScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/CommunityScreen.tsx").then(({ CommunityScreen }) => ({ default: CommunityScreen })));
const CreationScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/CreationScreen.tsx").then(({ CreationScreen }) => ({ default: CreationScreen })));
const DashboardScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/DashboardScreen.tsx").then(({ DashboardScreen }) => ({ default: DashboardScreen })));
const DeckSettingsScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/DeckSettingsScreen.tsx").then(({ DeckSettingsScreen }) => ({ default: DeckSettingsScreen })));
const DecksScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/DecksScreen.tsx").then(({ DecksScreen }) => ({ default: DecksScreen })));
const GraphScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/GraphScreen.tsx").then(({ GraphScreen }) => ({ default: GraphScreen })));
const LearnScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/LearnScreen.tsx").then(({ LearnScreen }) => ({ default: LearnScreen })));
const SettingsScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/SettingsScreen.tsx").then(({ SettingsScreen }) => ({ default: SettingsScreen })));
const StatisticsScreen = React.lazy<React.ComponentType<any>>(() => import("./screens/StatisticsScreen.tsx").then(({ StatisticsScreen }) => ({ default: StatisticsScreen })));
const StudyMode = React.lazy<React.ComponentType<any>>(() => import("./screens/StudyMode.tsx").then(({ StudyMode }) => ({ default: StudyMode })));

const menu = createMenuModel();
const AUTOSAVE_DELAY_MS = 900;
const focusedDeckViewIds = new Set(["kartenstapel", "stapel-einstellungen"]);

const iconByKey: Record<string, LucideIcon> = {
  chart: BarChart3,
  community: Users,
  graph: Network,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
  settings: Settings,
};

function getIcon(iconKey: string) {
  return iconByKey[iconKey] ?? Home;
}

function LoadingScreen({ message = "CoRe wird geladen." }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-md p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <h1 className="text-2xl font-semibold text-[#17214f]">CoRe</h1>
              <p className="mt-1 text-sm text-[#66709a]" role="status" aria-live="polite">
                {message}
              </p>
            </div>
          </div>
        </SoftPanel>
      </div>
    </main>
  );
}

function ScreenLoadingFallback() {
  return (
    <div className="grid min-h-[20rem] place-items-center" role="status" aria-live="polite">
      <SoftPanel className="flex items-center gap-3 px-5 py-4 text-sm font-medium text-[#66709a]">
        <span className="size-3 animate-pulse rounded-full bg-[#6672bf]" aria-hidden="true" />
        Bereich wird geladen.
      </SoftPanel>
    </div>
  );
}

interface MigrationChoiceScreenProps {
  legacyState: NonNullable<ReturnType<typeof readLegacyLocalState>>;
  busy?: boolean;
  message?: string;
  onImport: () => void;
  onSkip: () => void;
}

function MigrationChoiceScreen({ legacyState, busy = false, message = "", onImport, onSkip }: MigrationChoiceScreenProps) {
  const deckCount = legacyState?.decks?.length ?? 0;
  const documentCount = legacyState?.documents?.length ?? 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Lokale Daten gefunden</p>
              <h1 className="text-2xl font-semibold text-[#17214f]">Daten in diesen Account übernehmen?</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-[#66709a]">
            In diesem Browser liegen noch lokale CoRe-Daten: {deckCount} Stapel und {documentCount} Dokumente. Du kannst sie in deinen angemeldeten Account übernehmen oder mit einem leeren Cloud-Stand weiterarbeiten.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onImport} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Database size={17} aria-hidden="true" />
              Lokale Daten übernehmen
            </button>
            <button type="button" onClick={onSkip} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              Leer starten
            </button>
          </div>
          {message ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {message}
            </p>
          ) : null}
        </SoftPanel>
      </div>
    </main>
  );
}

export function App() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const navigationItems = React.useMemo(() => menu.listNavigationItems(), []);
  const bootRunRef = React.useRef(0);
  const latestStateRef = React.useRef<WorkspaceState | null>(null);
  const lastAcknowledgedStateRef = React.useRef<WorkspaceState | null>(null);
  const historyInitializedRef = React.useRef(false);
  const currentRouteRef = React.useRef<AppRoute>(createViewRoute(menu.defaultViewId));
  const [authPhase, setAuthPhase] = React.useState<AuthPhase>(authPhases.checkingSession);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState("status");
  const [migrationMessage, setMigrationMessage] = React.useState("");
  const [workspace, setWorkspace] = React.useState<CoreWorkspace | null>(null);
  const [state, setState] = React.useState<WorkspaceState | null>(null);
  const [cloudUser, setCloudUser] = React.useState<User | null>(null);
  const [legacyState, setLegacyState] = React.useState<NonNullable<ReturnType<typeof readLegacyLocalState>> | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(createSyncIdleStatus);
  const [syncEngine, setSyncEngine] = React.useState<AccountSyncEngine | null>(null);
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const [studyRequest, setStudyRequest] = React.useState<StudyRoute | null>(null);
  const [focusedDeckId, setFocusedDeckId] = React.useState<string | null>(null);
  const [deckCreationParentId, setDeckCreationParentId] = React.useState("");
  const mediaStore = React.useMemo(() => cloudUser ? createAccountMediaStore({ client: supabase, supabaseUrl: getSupabaseBrowserConfig().url, userId: cloudUser.id }) : null, [cloudUser, supabase]);

  function setAppState(nextState: WorkspaceState | null) {
    latestStateRef.current = nextState;
    setState(nextState);
  }

  function applyCloudAcknowledgement(snapshot: WorkspaceState | null, acknowledgedState: WorkspaceState | null, runId = bootRunRef.current) {
    if (!acknowledgedState || !workspace || bootRunRef.current !== runId) return null;
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    const savedState = workspace.saveState(mergeCloudSyncMetadata(currentState, acknowledgedState));
    if (currentState === snapshot) lastAcknowledgedStateRef.current = savedState;
    setAppState(savedState);
    return savedState;
  }

  function getValidDeckIds() {
    return state?.decks?.map((deck: { id: any; }) => deck.id) ?? [];
  }

  function applyRouteState(route: unknown) {
    const normalized = normalizeAppRoute(route, { validDeckIds: getValidDeckIds() });
    currentRouteRef.current = normalized;

    if (normalized.mode === "study") {
      const returnRoute = normalized.returnRoute ?? createViewRoute("lernen");
      setActiveView(returnRoute.viewId);
      setFocusedDeckId(focusedDeckViewIds.has(returnRoute.viewId) ? (returnRoute.focusedDeckId ?? null) : null);
      setDeckCreationParentId(returnRoute.viewId === "lernen" ? (returnRoute.deckCreationParentId ?? "") : "");
      setStudyRequest(normalized);
      return normalized;
    }

    setStudyRequest(null);
    setActiveView(normalized.viewId);
    setFocusedDeckId(focusedDeckViewIds.has(normalized.viewId) ? (normalized.focusedDeckId ?? null) : null);
    setDeckCreationParentId(normalized.viewId === "lernen" ? (normalized.deckCreationParentId ?? "") : "");
    return normalized;
  }

  function writeBrowserRoute(route: unknown, { replace = false, apply = true }: { replace?: boolean; apply?: boolean } = {}) {
    const validDeckIds = getValidDeckIds();
    const normalized = normalizeAppRoute(route, { validDeckIds });
    const url = appRouteToUrl(normalized, { validDeckIds });

    if (typeof window !== "undefined" && window.history?.pushState) {
      const historyState = createAppHistoryState(normalized, { validDeckIds, currentState: window.history.state });
      if (replace) {
        window.history.replaceState(historyState, "", url);
      } else {
        window.history.pushState(historyState, "", url);
      }
    }

    currentRouteRef.current = normalized;
    if (apply) applyRouteState(normalized);
    return normalized;
  }

  function navigateToRoute(route: unknown, { replace = false }: { replace?: boolean } = {}) {
    const validDeckIds = getValidDeckIds();
    const normalized = normalizeAppRoute(route, { validDeckIds });
    const nextUrl = appRouteToUrl(normalized, { validDeckIds });
    const currentUrl = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;

    if (!replace && currentUrl === nextUrl && areAppRoutesEqual(currentRouteRef.current, normalized, { validDeckIds })) {
      return applyRouteState(normalized);
    }

    return writeBrowserRoute(normalized, { replace });
  }

  function navigateToView(viewId: string | undefined, fields: Parameters<typeof createViewRoute>[1] = {}, options: { replace?: boolean } = {}) {
    return navigateToRoute(createViewRoute(viewId, fields, { validDeckIds: getValidDeckIds() }), options);
  }

  function getStudyReturnRoute() {
    const currentRoute = currentRouteRef.current;
    if (currentRoute?.mode === "view") return currentRoute;
    return currentRoute?.returnRoute ?? createViewRoute("lernen");
  }

  function resetBrowserRouteToDefault() {
    historyInitializedRef.current = false;
    writeBrowserRoute(createViewRoute(menu.defaultViewId), { replace: true, apply: false });
  }

  async function bootAuthenticatedUser(user: User) {
    const runId = bootRunRef.current + 1;
    bootRunRef.current = runId;
    historyInitializedRef.current = false;
    setAuthPhase("loading-cloud");
    setAuthMessage("");
    setMigrationMessage("");

    const accountStorage = createAccountStorage(user.id);
    const device = createBrowserSyncDevice();
    const nextWorkspace = createCoreWorkspace(createCoreRepository(accountStorage, { seedDefaultDecks: false }));
    const nextSyncEngine = createAccountSyncEngine(supabase, {
      userId: user.id,
      storage: accountStorage,
      device,
      persistSnapshot: (nextState: WorkspaceState) => nextWorkspace.saveState(nextState),
    });
    const fallbackState = nextWorkspace.getState();
    const cloudState = await nextSyncEngine.loadSnapshot(fallbackState);
    const savedState = nextWorkspace.saveState(cloudState);
    let conflicts: unknown[] = [];
    try {
      conflicts = await nextSyncEngine.listConflicts();
    } catch (error) {
      if (nextSyncEngine.pendingCount() === 0) throw error;
    }

    if (bootRunRef.current !== runId) return;

    setWorkspace(nextWorkspace);
    setSyncEngine(nextSyncEngine);
    lastAcknowledgedStateRef.current = savedState;
    setAppState(savedState);
    setCloudUser(user);
    setStudyRequest(null);
    setFocusedDeckId(null);
    setDeckCreationParentId("");
    setActiveView(menu.defaultViewId);
    setSyncStatus(
      conflicts.length > 0
        ? createSyncConflictStatus(conflicts.length)
        : nextSyncEngine.pendingCount() > 0
          ? createSyncPendingStatus()
          : createSyncSavedStatus("Cloud geladen."),
    );

    const pendingLegacyState = readLegacyLocalState();
    if (hasPendingLocalMigration(user.id) && pendingLegacyState) {
      setLegacyState(pendingLegacyState);
      setAuthPhase("migration-choice");
      return;
    }

    setLegacyState(null);
    setAuthPhase("ready");
  }

  React.useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!supabase) {
        setAuthPhase(authPhaseForSession({ configured: false, user: null }));
        setAuthMessage("");
        setAuthMessageType("status");
        return;
      }

      try {
        const redirectOutcome = readCloudAuthRedirectOutcome();
        if (redirectOutcome.kind === "error") {
          clearCloudAuthRedirectParams();
          setAuthPhase(authPhases.signedOut);
          setAuthMessage(redirectOutcome.message);
          setAuthMessageType("alert");
          return;
        }
        const user = await getCloudUser(supabase);
        if (cancelled) return;
        if (!user) {
          setAuthPhase(authPhaseForSession({ configured: true, user: null }));
          return;
        }
        if (redirectOutcome.kind === "recovery") {
          setCloudUser(user);
          setWorkspace(null);
          lastAcknowledgedStateRef.current = null;
          setAppState(null);
          setAuthPhase(authPhases.passwordRecovery);
          setAuthMessage("Bitte lege ein neues Passwort fest.");
          setAuthMessageType("status");
          return;
        }
        await bootAuthenticatedUser(user);
      } catch (error) {
        if (cancelled) return;
        setAuthPhase("signed-out");
        setAuthMessage(formatCloudAuthError(error, "Sitzung konnte nicht geladen werden."));
        setAuthMessageType("alert");
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  React.useEffect(() => {
    if (!supabase?.auth?.onAuthStateChange) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY" || !session?.user) return;
      bootRunRef.current += 1;
      historyInitializedRef.current = false;
      setCloudUser(session.user);
      setWorkspace(null);
      lastAcknowledgedStateRef.current = null;
      setAppState(null);
      setLegacyState(null);
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage("Bitte lege ein neues Passwort fest.");
      setAuthMessageType("status");
    });

    return () => {
      data?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase) || !state) {
      if (authPhase !== "ready") historyInitializedRef.current = false;
      return;
    }
    if (historyInitializedRef.current) return;

    const validDeckIds = getValidDeckIds();
    const route = parseAppRouteFromUrl(window.location.href, { validDeckIds });
    const normalized = normalizeAppRoute(route, { validDeckIds });
    historyInitializedRef.current = true;
    writeBrowserRoute(normalized, { replace: true });
  }, [authPhase, state]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase) || !state) return undefined;

    function handlePopState(event: { state: { [x: string]: any; }; }) {
      const validDeckIds = getValidDeckIds();
      const route = readAppRouteFromHistoryState(event.state, { validDeckIds }) ?? parseAppRouteFromUrl(window.location.href, { validDeckIds });
      applyRouteState(route);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [authPhase, state]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !syncEngine) return undefined;
    const runId = bootRunRef.current;
    return syncEngine.startSyncLifecycle({
      onStatus: setSyncStatus,
      onFlush(result: { saved: { state: any; }; }) {
        const snapshot = latestStateRef.current;
        applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      },
    });
  }, [authPhase, syncEngine, workspace]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !mediaStore || !syncEngine || !workspace) return undefined;
    const lifecycle = mediaStore.startRetryLifecycle({
      getDecks: () => latestStateRef.current?.decks ?? [],
      ensureCloudParents: async () => { await syncNow(); },
      onStatus(result) {
        if (result.status !== "cloud-ready" || result.referencesByDeck.size === 0) return;
        const currentDecks = latestStateRef.current?.decks ?? [];
        const changed = currentDecks
          .filter((deck) => result.referencesByDeck.has(deck.id))
          .map((deck) => ({ ...deck, mediaAssets: result.referencesByDeck.get(deck.id) ?? deck.mediaAssets }));
        void persistImportedDecks(changed, { mediaOnly: true });
      },
    });
    return () => lifecycle.stop();
  }, [authPhase, mediaStore, syncEngine, workspace]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !syncEngine || !state || state === lastAcknowledgedStateRef.current) return undefined;

    let cancelled = false;
    const snapshot = state;
    const runId = bootRunRef.current;
    const timer = window.setTimeout(async () => {
      try {
        syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
        const result = await syncEngine.flush();
        applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      } catch (error) {
        if (!cancelled) setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authPhase, state, syncEngine, workspace]);

  async function handleSignIn({ email, password }: any) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInCloudAccount(supabase, { email }, password);
      const user = await getCloudUser(supabase);
      if (!user) throw new Error("Anmeldung konnte nicht bestätigt werden.");
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Anmeldung fehlgeschlagen."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignUp({ displayName, email, password }: any) {
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
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Account konnte nicht erstellt werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword({ email }: any) {
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

  async function handleMagicLink({ email }: any) {
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

  async function handleGoogleSignIn() {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithGoogle(supabase);
      setAuthMessage("Weiterleitung zu Google wird geöffnet.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Google-Anmeldung konnte nicht gestartet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleUpdatePassword({ password, passwordRepeat }: any) {
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
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage(formatCloudAuthError(error, "Passwort konnte nicht gespeichert werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function importLegacyLocalState() {
    if (!workspace || !state || !cloudUser || !legacyState) return;
    setAuthBusy(true);
    setMigrationMessage("");
    try {
      const nextState = mergePortableExportIntoState(state, createPortableExport(legacyState));
      const savedState = workspace.saveState(nextState);
      setAppState(savedState);
      const result = await replaceAccountCloudState(supabase, savedState, { deviceId: createBrowserSyncDevice().id });
      const acknowledgedState = workspace.saveState(result.state);
      lastAcknowledgedStateRef.current = acknowledgedState;
      setAppState(acknowledgedState);
      markLocalMigrationHandled(cloudUser.id, "imported");
      setLegacyState(null);
      setSyncStatus(createSyncSavedStatus("Lokale Daten übernommen und synchronisiert."));
      setAuthPhase("ready");
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "Lokale Daten konnten nicht übernommen werden.");
    } finally {
      setAuthBusy(false);
    }
  }

  function skipLegacyLocalState() {
    if (cloudUser) markLocalMigrationHandled(cloudUser.id, "skipped");
    setLegacyState(null);
    setAuthPhase("ready");
  }

  async function syncNow() {
    if (!syncEngine || !state) return;
    const snapshot = state;
    const runId = bootRunRef.current;
    try {
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
      const result = await syncEngine.flush(undefined, { force: true });
      applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      return result;
    } catch (error) {
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      throw error;
    }
  }

  const listSyncConflicts = React.useCallback(async () => {
    return syncEngine ? syncEngine.listConflicts() : [];
  }, [syncEngine]);

  async function resolveSyncConflict(conflictId: any, decision: any) {
    if (!syncEngine || !workspace || !latestStateRef.current) throw new Error("Synchronisierung ist noch nicht bereit.");
    try {
      const result = await syncEngine.resolveConflict(conflictId, decision, latestStateRef.current);
      const savedState = workspace.saveState(result.nextState);
      lastAcknowledgedStateRef.current = savedState;
      setAppState(savedState);
      return result;
    } catch (error) {
      setAppState(workspace.getState());
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Konfliktentscheidung konnte nicht gespeichert werden.")));
      throw error;
    }
  }

  async function signOut() {
    if (supabase && state?.profile) {
      await signOutCloudAccount(supabase, state.profile);
    }
    bootRunRef.current += 1;
    resetBrowserRouteToDefault();
    setWorkspace(null);
    setSyncEngine(null);
    lastAcknowledgedStateRef.current = null;
    setAppState(null);
    setCloudUser(null);
    setLegacyState(null);
    setStudyRequest(null);
    setFocusedDeckId(null);
    setDeckCreationParentId("");
    setActiveView(menu.defaultViewId);
    setSyncStatus(createSyncIdleStatus());
    setAuthPhase("signed-out");
    setAuthMessage("Du bist abgemeldet.");
    setAuthMessageType("status");
  }

  function refresh() {
    if (!workspace) return null;
    const nextState = workspace.getState();
    setAppState(nextState);
    return nextState;
  }

  function runWorkspaceMutation<T>(mutation: (currentWorkspace: CoreWorkspace) => T): T | null {
    if (!workspace) return null;
    const result = mutation(workspace);
    refresh();
    return result;
  }

  function saveDeck(deck: Deck | Deck[]) {
    const existingDeckIds = new Set(state?.decks?.map((item: { id: any; }) => item.id) ?? []);
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const applyDefaults = (item: { id: unknown; deckSettings: any; }) => existingDeckIds.has(item.id)
      ? item
      : {
          ...item,
          deckSettings: {
            ...applyLearningSettingsToDeckSettings(item.deckSettings, globalSettings),
            coreMode: globalSettings.coreMode,
          },
        };
    const nextDeck = Array.isArray(deck) ? deck.map(applyDefaults) : applyDefaults(deck);
    return runWorkspaceMutation((currentWorkspace: { saveDecks: (arg0: any) => any; }) => currentWorkspace.saveDecks(nextDeck));
  }

  async function persistImportedDecks(decks: Deck[], { mediaOnly = false }: { mediaOnly?: boolean } = {}) {
    if (!workspace || !syncEngine) throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    const currentDecks = workspace.getState().decks;
    const nextDecks = mediaOnly ? decks.map((deck) => {
      const current = currentDecks.find((candidate) => candidate.id === deck.id);
      return current ? { ...current, mediaAssets: deck.mediaAssets } : deck;
    }) : decks;
    saveDeck(nextDecks);
    const snapshot = workspace.getState();
    const runId = bootRunRef.current;
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
    const result = await syncEngine.flush(undefined, { force: true });
    applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
    return result;
  }

  function enqueueReviewEvent(event: ReviewEvent) {
    if (!syncEngine || !event?.id) return;
    syncEngine.enqueueMutation({
      id: `review_${event.id}`,
      type: SYNC_MUTATION_TYPES.reviewEventAppend,
      table: "review_events",
      entityId: event.id,
      payload: { event },
    });
  }

  function createDeck(input: { deckSettings: { coreMode: any; }; }) {
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const saved = runWorkspaceMutation((currentWorkspace: { createDeck: (arg0: any) => any; }) => currentWorkspace.createDeck({
      ...input,
      deckSettings: {
        ...applyLearningSettingsToDeckSettings(input?.deckSettings, globalSettings),
        coreMode: input?.deckSettings?.coreMode ?? globalSettings.coreMode,
      },
    }));
    if (!saved) return null;
    setFocusedDeckId(saved.id);
    setDeckCreationParentId("");
    return saved;
  }

  function updateDeck(deckId: any, updater: (deck: any) => any) {
    return runWorkspaceMutation((currentWorkspace: { updateDeck: (arg0: any,arg1: any) => any; }) => currentWorkspace.updateDeck(deckId, updater));
  }

  function deleteDeck(deckId: any) {
    const result = runWorkspaceMutation((currentWorkspace: { deleteDeckTree: (arg0: any) => any; }) => currentWorkspace.deleteDeckTree(deckId));
    if (!result) return null;
    setFocusedDeckId(result.nextSelectedDeckId);
    return result;
  }

  function renameDeck(deckId: any, name: any) {
    const result = runWorkspaceMutation((currentWorkspace: { renameDeck: (arg0: any,arg1: any) => any; }) => currentWorkspace.renameDeck(deckId, name));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function moveDeck(deckId: any, parentDeckId = null) {
    const result = runWorkspaceMutation((currentWorkspace: { moveDeck: (arg0: any,arg1: null) => any; }) => currentWorkspace.moveDeck(deckId, parentDeckId));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function setDeckCoreMode(deckId: any, coreMode: any) {
    return runWorkspaceMutation((currentWorkspace: { setDeckCoreMode: (arg0: any,arg1: any) => any; }) => currentWorkspace.setDeckCoreMode(deckId, coreMode));
  }

  function saveDeckLearningSettings(deckId: string, settings: LearningSettingsInput = {}) {
    return updateDeck(deckId, (deck: { deckSettings: { coreMode: any; }; }) => ({
      ...deck,
      deckSettings: {
        ...applyLearningSettingsToDeckSettings(deck.deckSettings, settings),
        coreMode: settings.coreMode ?? deck.deckSettings?.coreMode ?? "auto",
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveGlobalLearningSettings(settings: LearningSettingsInput = {}) {
    if (!state) return null;
    return runWorkspaceMutation((currentWorkspace: { saveProfile: (arg0: any) => void; updateAllDecks: (arg0: (deck: any) => any) => any; }) => {
      currentWorkspace.saveProfile(withGlobalDeckSettings(state.profile, settings));
      return currentWorkspace.updateAllDecks((deck: { deckSettings: { coreMode: any; }; }) => ({
        ...deck,
        deckSettings: {
          ...applyLearningSettingsToDeckSettings(deck.deckSettings, settings),
          coreMode: settings.coreMode ?? deck.deckSettings?.coreMode ?? "auto",
        },
        updatedAt: new Date().toISOString(),
      }));
    });
  }

  function saveDeckCard(deckId: any, cardId: any, patch: any) {
    return runWorkspaceMutation((currentWorkspace: { saveDeckCardContent: (arg0: any,arg1: any,arg2: any) => any; }) => currentWorkspace.saveDeckCardContent(deckId, cardId, patch));
  }

  function deleteDeckCard(deckId: any, cardId: any) {
    return runWorkspaceMutation((currentWorkspace: { deleteDeckCard: (arg0: any,arg1: any) => any; }) => currentWorkspace.deleteDeckCard(deckId, cardId));
  }

  function addDeckCardVariant(deckId: any, cardId: any, variant: any) {
    return runWorkspaceMutation((currentWorkspace: { addDeckCardVariant: (arg0: any,arg1: any,arg2: any) => any; }) => currentWorkspace.addDeckCardVariant(deckId, cardId, variant));
  }

  function addManualCardToDeck(deckId: any, manualDeckInput: any) {
    return runWorkspaceMutation((currentWorkspace: { addManualCardToDeck: (arg0: any,arg1: any) => any; }) => currentWorkspace.addManualCardToDeck(deckId, manualDeckInput));
  }

  function applyVariantJson(deckId: any, cardId: any, response: any, options: any) {
    return runWorkspaceMutation((currentWorkspace: { applyVariantGenerationResponse: (arg0: any,arg1: any,arg2: any,arg3: any) => any; }) => currentWorkspace.applyVariantGenerationResponse(deckId, cardId, response, options));
  }

  function saveProfile(profile: any) {
    return runWorkspaceMutation((currentWorkspace: { saveProfile: (arg0: any) => any; }) => currentWorkspace.saveProfile(profile));
  }

  async function getAiAccessToken() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  }

  async function acceptAiChatConsent() {
    if (!workspace || !syncEngine || !latestStateRef.current) {
      throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    }
    const previousProfile = workspace.getState().profile;
    const consent = {
      version: AI_CHAT_CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
      adultConfirmed: true as const,
    };
    workspace.saveProfile({
      ...previousProfile,
      privacy: { ...previousProfile.privacy, aiChatConsent: consent },
    });
    const snapshot = workspace.getState();
    const runId = bootRunRef.current;
    setAppState(snapshot);
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });

    try {
      const result = await syncEngine.flush(undefined, { force: true });
      const acknowledged = applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      if (!acknowledged) throw new Error("Die KI-Einwilligung wurde nicht von der Cloud bestätigt.");
      return consent;
    } catch (error) {
      workspace.saveProfile(previousProfile);
      const rollback = workspace.getState();
      setAppState(rollback);
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: rollback } });
      throw new Error(formatCloudAuthError(error, "Die KI-Einwilligung konnte nicht gespeichert werden."));
    }
  }

  function saveCommunity(community: any) {
    return runWorkspaceMutation((currentWorkspace: { saveCommunity: (arg0: any) => any; }) => currentWorkspace.saveCommunity(community));
  }

  function saveJob(job: any) {
    return runWorkspaceMutation((currentWorkspace: { saveAiJob: (arg0: any) => any; }) => currentWorkspace.saveAiJob(job));
  }

  function saveChat(exchange: any) {
    return runWorkspaceMutation((currentWorkspace: { saveChatExchange: (arg0: any) => any; }) => currentWorkspace.saveChatExchange(exchange));
  }

  function savePlan(plan: any) {
    return runWorkspaceMutation((currentWorkspace: { saveLearningPlan: (arg0: any) => any; }) => currentWorkspace.saveLearningPlan(plan));
  }

  function saveState(nextState: any) {
    return runWorkspaceMutation((currentWorkspace: { saveState: (arg0: any) => any; }) => currentWorkspace.saveState(nextState));
  }

  function startDeck(deck: { id: string; }, variantSession = false) {
    navigateToRoute(createStudyRoute(deck.id, { variantSession, returnRoute: getStudyReturnRoute() }, { validDeckIds: getValidDeckIds() }));
  }

  function openDecks(deckId: string | null = null) {
    navigateToView("kartenstapel", { focusedDeckId: deckId || null });
  }

  function openDeckSettings(deckId: any) {
    navigateToView("stapel-einstellungen", { focusedDeckId: deckId });
  }

  function openDeckCreation(parentDeckId = "") {
    navigateToView("lernen", { deckCreationParentId: parentDeckId || "" });
  }

  function openGraph(deck: { id: any; }) {
    navigateToView("graph");
    runWorkspaceMutation((currentWorkspace: { ensureDeckGraph: (arg0: any) => any; }) => currentWorkspace.ensureDeckGraph(deck.id));
  }

  function shareDeck(deck: { id: any; }) {
    navigateToView("community");
    runWorkspaceMutation((currentWorkspace: { shareDeckToDefaultCommunity: (arg0: any) => any; }) => currentWorkspace.shareDeckToDefaultCommunity(deck.id));
  }

  function renderActiveView() {
    if (!state) return null;
    if (activeView === "stapel-einstellungen") {
      return (
        <DeckSettingsScreen
          deck={state.decks.find((deck) => deck.id === focusedDeckId) ?? null}
          onSave={saveDeckLearningSettings}
          onBack={() => navigateToView("lernen")}
        />
      );
    }
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          decks={state.decks}
          mediaStore={mediaStore}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onDeleteCard={deleteDeckCard}
          onAddVariant={addDeckCardVariant}
          onApplyVariantJson={applyVariantJson}
          onStartDeck={startDeck}
          initialSelectedDeckId={focusedDeckId}
          onDeleteDeck={deleteDeck}
          onRenameDeck={renameDeck}
          onOpenCardCreation={() => navigateToView("neue-karten")}
          onPrepareSubdeckCreation={openDeckCreation}
          onOpenGraph={openGraph}
          onShareDeck={shareDeck}
        />
      );
    }
    if (activeView === "neue-karten") {
      return <CreationScreen decks={state.decks} mediaStore={mediaStore} persistImportedDecks={persistImportedDecks} onCreated={saveDeck} onAppendManualCard={addManualCardToDeck} onJob={saveJob} />;
    }
    if (activeView === "lernen") {
      return (
        <LearnScreen
          decks={state.decks}
          onStartDeck={startDeck}
          onCreateDeck={createDeck}
          initialParentDeckId={deckCreationParentId}
          onDeckCreationHandled={() => setDeckCreationParentId("")}
          onOpenCardCreation={() => navigateToView("neue-karten")}
          onOpenDecks={openDecks}
          onOpenDeckSettings={openDeckSettings}
          onMoveDeck={moveDeck}
        />
      );
    }
    if (activeView === "statistik") {
      return <StatisticsScreen decks={state.decks} onNavigate={navigateToView} />;
    }
    if (activeView === "graph") {
      return <GraphScreen decks={state.decks} onUpdateDeck={updateDeck} />;
    }
    if (activeView === "community") {
      return <CommunityScreen decks={state.decks} communities={state.communities} onSaveCommunity={saveCommunity} onSaveDeck={saveDeck} />;
    }
    if (activeView === "assistent") {
      return (
        <AssistantScreen
          decks={state.decks}
          transcript={state.chatTranscript}
          plans={state.learningPlans}
          profile={state.profile}
          getAccessToken={getAiAccessToken}
          onAcceptAiChatConsent={acceptAiChatConsent}
          onSaveChat={saveChat}
          onSavePlan={savePlan}
        />
      );
    }
    if (activeView === "einstellungen") {
      return (
        <SettingsScreen
          appState={state}
          profile={state.profile}
          decks={state.decks}
          syncStatus={syncStatus}
          onSaveProfile={saveProfile}
          globalDeckSettings={getGlobalDeckSettings(state.profile)}
          onSaveGlobalLearningSettings={saveGlobalLearningSettings}
          onSaveState={saveState}
          onSyncNow={syncNow}
          onListConflicts={listSyncConflicts}
          onResolveConflict={resolveSyncConflict}
          onSignOut={signOut}
        />
      );
    }
    return <DashboardScreen state={state} onSaveProfile={saveProfile} onNavigate={navigateToView} onStartDeck={startDeck} />;
  }

  if (authPhase === "checking-session") {
    return <LoadingScreen message="Sitzung wird geprüft." />;
  }

  if (authPhase === "loading-cloud") {
    return <LoadingScreen message="Deine Cloud-Daten werden geladen." />;
  }

  if (shouldShowAuthGate(authPhase)) {
    return (
      <AuthGateScreen
        configured={Boolean(supabase)}
        recoveryMode={authPhase === authPhases.passwordRecovery}
        busy={authBusy}
        message={authMessage}
        messageType={authMessageType}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onResetPassword={handleResetPassword}
        onMagicLink={handleMagicLink}
        onGoogleSignIn={handleGoogleSignIn}
        onUpdatePassword={handleUpdatePassword}
      />
    );
  }

  if (authPhase === "migration-choice" && legacyState) {
    return <MigrationChoiceScreen legacyState={legacyState} busy={authBusy} message={migrationMessage} onImport={importLegacyLocalState} onSkip={skipLegacyLocalState} />;
  }

  if (!shouldShowAppShell(authPhase) || !workspace || !state) {
    return <LoadingScreen />;
  }

  const studyDeck = studyRequest ? state.decks.find((deck: { id: any; }) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={state.decks}
          deckId={studyDeck.id}
          variantSession={studyRequest.variantSession}
          mediaStore={mediaStore}
          onExit={() => {
            refresh();
            navigateToRoute(studyRequest.returnRoute ?? createViewRoute("lernen"), { replace: true });
          }}
          onDeckUpdated={saveDeck}
          onReviewEvent={enqueueReviewEvent}
        />
      </React.Suspense>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[22px] border border-[#dce2f4] bg-white/52 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-[#dce2f4] bg-white/42 md:border-b-0 md:border-r">
          <div className="flex h-full flex-col px-5 py-7 sm:px-8 md:px-4 md:py-8 lg:px-5 lg:py-10">
            <div>
              <h1 className="text-5xl font-semibold tracking-normal text-[#17214f]">CoRe</h1>
              <p className="mt-2 text-base text-[#66709a]">Content Repetition</p>
            </div>

            <nav aria-label="Hauptmenü" className="mt-12 grid max-w-[14rem] gap-2 md:mt-10 md:max-w-none">
              {navigationItems.map((view) => {
                const NavIcon = getIcon(view.iconKey);
                const isActive = view.id === activeView;

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => navigateToView(view.id)}
                    className={`flex min-h-12 w-full max-w-[14rem] items-center gap-2.5 rounded-xl px-3 text-left text-base font-medium transition md:max-w-none ${
                      isActive ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#4f5a86] hover:bg-white/70 hover:text-[#17214f]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <NavIcon className="shrink-0" size={21} aria-hidden="true" />
                    <span className="min-w-0 truncate">{view.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-[#dce2f4] pt-6">
              <button
                type="button"
                onClick={() => navigateToView("einstellungen")}
                className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left transition ${
                  activeView === "einstellungen" ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#24327a] hover:bg-white/70"
                }`}
                aria-label="Einstellungen öffnen"
                aria-current={activeView === "einstellungen" ? "page" : undefined}
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe4fb] text-sm font-semibold">{(state.profile.displayName || "CO").slice(0, 2).toUpperCase()}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]">
                  <Settings size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.profile.displayName}</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <React.Suspense fallback={<ScreenLoadingFallback />}>{renderActiveView()}</React.Suspense>
        </section>
      </div>
    </main>
  );
}
