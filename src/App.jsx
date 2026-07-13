import React from "react";
import { BarChart3, BookOpen, Database, Home, Layers, Network, PlusSquare, Settings, Users } from "lucide-react";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncIdleStatus, createSyncPendingStatus, createSyncSavedStatus, createSyncSavingStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.js";
import { appRouteToUrl, areAppRoutesEqual, createAppHistoryState, createStudyRoute, createViewRoute, normalizeAppRoute, parseAppRouteFromUrl, readAppRouteFromHistoryState } from "./appNavigation.js";
import { createAccountStorage, hasPendingLocalMigration, markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.js";
import { formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithGoogle, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.js";
import { mergeCloudSyncMetadata, replaceAccountCloudState } from "./cloudRepository.js";
import { createCoreRepository } from "./coreRepository.js";
import { createCoreWorkspace } from "./coreWorkspace.js";
import { createPortableExport, mergePortableExportIntoState } from "./dataPortability.js";
import { applyLearningSettingsToDeckSettings, getGlobalDeckSettings, withGlobalDeckSettings } from "./deckSettings.js";
import { createMenuModel } from "./menuModel.js";
import { createAccountSyncEngine, SYNC_MUTATION_TYPES } from "./syncEngine.js";
import { createBrowserSyncDevice } from "./syncDevice.js";
import { createSupabaseBrowserClient } from "./supabaseClient.js";
import { AuthGateScreen } from "./screens/AuthGateScreen.jsx";
import { OrbIcon, SoftPanel } from "./ui/coreUi.jsx";

function lazyNamedExport(loader, exportName) {
  return React.lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const AssistantScreen = lazyNamedExport(() => import("./screens/AssistantScreen.jsx"), "AssistantScreen");
const CommunityScreen = lazyNamedExport(() => import("./screens/CommunityScreen.jsx"), "CommunityScreen");
const CreationScreen = lazyNamedExport(() => import("./screens/CreationScreen.jsx"), "CreationScreen");
const DashboardScreen = lazyNamedExport(() => import("./screens/DashboardScreen.jsx"), "DashboardScreen");
const DeckSettingsScreen = lazyNamedExport(() => import("./screens/DeckSettingsScreen.jsx"), "DeckSettingsScreen");
const DecksScreen = lazyNamedExport(() => import("./screens/DecksScreen.jsx"), "DecksScreen");
const GraphScreen = lazyNamedExport(() => import("./screens/GraphScreen.jsx"), "GraphScreen");
const LearnScreen = lazyNamedExport(() => import("./screens/LearnScreen.jsx"), "LearnScreen");
const SettingsScreen = lazyNamedExport(() => import("./screens/SettingsScreen.jsx"), "SettingsScreen");
const StatisticsScreen = lazyNamedExport(() => import("./screens/StatisticsScreen.jsx"), "StatisticsScreen");
const StudyMode = lazyNamedExport(() => import("./screens/StudyMode.jsx"), "StudyMode");

const menu = createMenuModel();
const AUTOSAVE_DELAY_MS = 900;
const focusedDeckViewIds = new Set(["kartenstapel", "stapel-einstellungen"]);

const iconByKey = {
  chart: BarChart3,
  community: Users,
  graph: Network,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
  settings: Settings,
};

function getIcon(iconKey) {
  return iconByKey[iconKey] ?? Home;
}

function hasPasswordRecoveryIntent() {
  if (typeof window === "undefined") return false;
  const authUrl = `${window.location.search ?? ""} ${window.location.hash ?? ""}`;
  return /type=recovery|password_recovery/i.test(authUrl);
}

function clearAuthRedirectParams() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function LoadingScreen({ message = "CoRe wird geladen." }) {
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

function MigrationChoiceScreen({ legacyState, busy = false, message = "", onImport, onSkip }) {
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
  const latestStateRef = React.useRef(null);
  const lastAcknowledgedStateRef = React.useRef(null);
  const historyInitializedRef = React.useRef(false);
  const currentRouteRef = React.useRef(createViewRoute(menu.defaultViewId));
  const [authPhase, setAuthPhase] = React.useState("checking-session");
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState("status");
  const [migrationMessage, setMigrationMessage] = React.useState("");
  const [workspace, setWorkspace] = React.useState(null);
  const [state, setState] = React.useState(null);
  const [cloudUser, setCloudUser] = React.useState(null);
  const [legacyState, setLegacyState] = React.useState(null);
  const [syncStatus, setSyncStatus] = React.useState(createSyncIdleStatus);
  const [syncEngine, setSyncEngine] = React.useState(null);
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const [studyRequest, setStudyRequest] = React.useState(null);
  const [focusedDeckId, setFocusedDeckId] = React.useState(null);
  const [deckCreationParentId, setDeckCreationParentId] = React.useState("");

  function setAppState(nextState) {
    latestStateRef.current = nextState;
    setState(nextState);
  }

  function applyCloudAcknowledgement(snapshot, acknowledgedState, runId = bootRunRef.current) {
    if (!acknowledgedState || !workspace || bootRunRef.current !== runId) return null;
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    const savedState = workspace.saveState(mergeCloudSyncMetadata(currentState, acknowledgedState));
    if (currentState === snapshot) lastAcknowledgedStateRef.current = savedState;
    setAppState(savedState);
    return savedState;
  }

  function getValidDeckIds() {
    return state?.decks?.map((deck) => deck.id) ?? [];
  }

  function applyRouteState(route) {
    const normalized = normalizeAppRoute(route, { validDeckIds: getValidDeckIds() });
    currentRouteRef.current = normalized;

    if (normalized.mode === "study") {
      const returnRoute = normalized.returnRoute ?? createViewRoute("lernen");
      setActiveView(returnRoute.viewId);
      setFocusedDeckId(focusedDeckViewIds.has(returnRoute.viewId) ? (returnRoute.focusedDeckId ?? null) : null);
      setDeckCreationParentId(returnRoute.viewId === "lernen" ? (returnRoute.deckCreationParentId ?? "") : "");
      setStudyRequest({
        deckId: normalized.deckId,
        variantSession: normalized.variantSession,
        returnRoute,
      });
      return normalized;
    }

    setStudyRequest(null);
    setActiveView(normalized.viewId);
    setFocusedDeckId(focusedDeckViewIds.has(normalized.viewId) ? (normalized.focusedDeckId ?? null) : null);
    setDeckCreationParentId(normalized.viewId === "lernen" ? (normalized.deckCreationParentId ?? "") : "");
    return normalized;
  }

  function writeBrowserRoute(route, { replace = false, apply = true } = {}) {
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

  function navigateToRoute(route, { replace = false } = {}) {
    const validDeckIds = getValidDeckIds();
    const normalized = normalizeAppRoute(route, { validDeckIds });
    const nextUrl = appRouteToUrl(normalized, { validDeckIds });
    const currentUrl = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;

    if (!replace && currentUrl === nextUrl && areAppRoutesEqual(currentRouteRef.current, normalized, { validDeckIds })) {
      return applyRouteState(normalized);
    }

    return writeBrowserRoute(normalized, { replace });
  }

  function navigateToView(viewId, fields = {}, options = {}) {
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

  async function bootAuthenticatedUser(user) {
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
      persistSnapshot: (nextState) => nextWorkspace.saveState(nextState),
    });
    const fallbackState = nextWorkspace.getState();
    const cloudState = await nextSyncEngine.loadSnapshot(fallbackState);
    const savedState = nextWorkspace.saveState(cloudState);
    let conflicts = [];
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
        const user = await getCloudUser(supabase);
        if (cancelled) return;
        if (!user) {
          setAuthPhase(authPhaseForSession({ configured: true, user: null }));
          return;
        }
        if (hasPasswordRecoveryIntent()) {
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

    function handlePopState(event) {
      const validDeckIds = getValidDeckIds();
      const route = readAppRouteFromHistoryState(event.state, { validDeckIds }) ?? parseAppRouteFromUrl(window.location.href, { validDeckIds });
      applyRouteState(route);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [authPhase, state]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !syncEngine || !state || state === lastAcknowledgedStateRef.current) return undefined;

    setSyncStatus((current) => (current.status === "saving" ? current : createSyncPendingStatus()));
    let cancelled = false;
    const snapshot = state;
    const runId = bootRunRef.current;
    const timer = window.setTimeout(async () => {
      setSyncStatus(createSyncSavingStatus());
      try {
        syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
        const result = await syncEngine.flush();
        applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
        if (!cancelled) setSyncStatus(result.conflicts?.length ? createSyncConflictStatus(result.conflicts.length) : createSyncSavedStatus());
      } catch (error) {
        if (!cancelled) setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authPhase, state, syncEngine, workspace]);

  async function handleSignIn({ email, password }) {
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

  async function handleSignUp({ displayName, email, password }) {
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

  async function handleResetPassword({ email }) {
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

  async function handleMagicLink({ email }) {
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

  async function handleUpdatePassword({ password, passwordRepeat }) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (password !== passwordRepeat) throw new Error("Die Passwörter stimmen nicht überein.");
      await updateCloudPassword(supabase, password);
      clearAuthRedirectParams();
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
    setSyncStatus(createSyncSavingStatus());
    const snapshot = state;
    const runId = bootRunRef.current;
    try {
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
      const result = await syncEngine.flush();
      applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      setSyncStatus(result.conflicts?.length ? createSyncConflictStatus(result.conflicts.length) : createSyncSavedStatus());
    } catch (error) {
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
    }
  }

  const listSyncConflicts = React.useCallback(async () => {
    return syncEngine ? syncEngine.listConflicts() : [];
  }, [syncEngine]);

  async function resolveSyncConflict(conflictId, decision) {
    if (!syncEngine || !workspace || !latestStateRef.current) throw new Error("Synchronisierung ist noch nicht bereit.");
    setSyncStatus(createSyncSavingStatus());
    try {
      const result = await syncEngine.resolveConflict(conflictId, decision, latestStateRef.current);
      const savedState = workspace.saveState(result.nextState);
      lastAcknowledgedStateRef.current = savedState;
      setAppState(savedState);
      setSyncStatus(result.syncStatus);
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

  function runWorkspaceMutation(mutation) {
    if (!workspace) return null;
    const result = mutation(workspace);
    refresh();
    return result;
  }

  function saveDeck(deck) {
    const existingDeckIds = new Set(state?.decks?.map((item) => item.id) ?? []);
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const applyDefaults = (item) => existingDeckIds.has(item.id)
      ? item
      : {
          ...item,
          deckSettings: {
            ...applyLearningSettingsToDeckSettings(item.deckSettings, globalSettings),
            coreMode: globalSettings.coreMode,
          },
        };
    const nextDeck = Array.isArray(deck) ? deck.map(applyDefaults) : applyDefaults(deck);
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveDecks(nextDeck));
  }

  function enqueueReviewEvent(event) {
    if (!syncEngine || !event?.id) return;
    syncEngine.enqueueMutation({
      id: `review_${event.id}`,
      type: SYNC_MUTATION_TYPES.reviewEventAppend,
      table: "review_events",
      entityId: event.id,
      payload: { event },
    });
  }

  function createDeck(input) {
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const saved = runWorkspaceMutation((currentWorkspace) => currentWorkspace.createDeck({
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

  function updateDeck(deckId, updater) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.updateDeck(deckId, updater));
  }

  function deleteDeck(deckId) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.deleteDeckTree(deckId));
    if (!result) return null;
    setFocusedDeckId(result.nextSelectedDeckId);
    return result;
  }

  function renameDeck(deckId, name) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.renameDeck(deckId, name));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function moveDeck(deckId, parentDeckId = null) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.moveDeck(deckId, parentDeckId));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function setDeckCoreMode(deckId, coreMode) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.setDeckCoreMode(deckId, coreMode));
  }

  function saveDeckLearningSettings(deckId, settings) {
    return updateDeck(deckId, (deck) => ({
      ...deck,
      deckSettings: {
        ...applyLearningSettingsToDeckSettings(deck.deckSettings, settings),
        coreMode: settings.coreMode ?? deck.deckSettings?.coreMode ?? "auto",
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveGlobalLearningSettings(settings) {
    return runWorkspaceMutation((currentWorkspace) => {
      currentWorkspace.saveProfile(withGlobalDeckSettings(state.profile, settings));
      return currentWorkspace.updateAllDecks((deck) => ({
        ...deck,
        deckSettings: {
          ...applyLearningSettingsToDeckSettings(deck.deckSettings, settings),
          coreMode: settings.coreMode ?? deck.deckSettings?.coreMode ?? "auto",
        },
        updatedAt: new Date().toISOString(),
      }));
    });
  }

  function saveDeckCard(deckId, cardId, patch) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveDeckCardContent(deckId, cardId, patch));
  }

  function deleteDeckCard(deckId, cardId) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.deleteDeckCard(deckId, cardId));
  }

  function addDeckCardVariant(deckId, cardId, variant) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addDeckCardVariant(deckId, cardId, variant));
  }

  function addManualCardToDeck(deckId, manualDeckInput) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addManualCardToDeck(deckId, manualDeckInput));
  }

  function applyVariantJson(deckId, cardId, response, options) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.applyVariantGenerationResponse(deckId, cardId, response, options));
  }

  function saveProfile(profile) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile(profile));
  }

  function saveCommunity(community) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveCommunity(community));
  }

  function saveJob(job) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveAiJob(job));
  }

  function saveChat(exchange) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveChatExchange(exchange));
  }

  function savePlan(plan) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveLearningPlan(plan));
  }

  function saveState(nextState) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveState(nextState));
  }

  function startDeck(deck, variantSession = false) {
    navigateToRoute(createStudyRoute(deck.id, { variantSession, returnRoute: getStudyReturnRoute() }, { validDeckIds: getValidDeckIds() }));
  }

  function openDecks(deckId = null) {
    navigateToView("kartenstapel", { focusedDeckId: deckId || null });
  }

  function openDeckSettings(deckId) {
    navigateToView("stapel-einstellungen", { focusedDeckId: deckId });
  }

  function openDeckCreation(parentDeckId = "") {
    navigateToView("lernen", { deckCreationParentId: parentDeckId || "" });
  }

  function openGraph(deck) {
    navigateToView("graph");
    runWorkspaceMutation((currentWorkspace) => currentWorkspace.ensureDeckGraph(deck.id));
  }

  function shareDeck(deck) {
    navigateToView("community");
    runWorkspaceMutation((currentWorkspace) => currentWorkspace.shareDeckToDefaultCommunity(deck.id));
  }

  function renderActiveView() {
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
      return <CreationScreen decks={state.decks} onCreated={saveDeck} onAppendManualCard={addManualCardToDeck} onJob={saveJob} />;
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
      return <AssistantScreen decks={state.decks} transcript={state.chatTranscript} plans={state.learningPlans} onSaveChat={saveChat} onSavePlan={savePlan} />;
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

  if (authPhase === "migration-choice") {
    return <MigrationChoiceScreen legacyState={legacyState} busy={authBusy} message={migrationMessage} onImport={importLegacyLocalState} onSkip={skipLegacyLocalState} />;
  }

  if (!shouldShowAppShell(authPhase) || !workspace || !state) {
    return <LoadingScreen />;
  }

  const studyDeck = studyRequest ? state.decks.find((deck) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={state.decks}
          deckId={studyDeck.id}
          variantSession={studyRequest.variantSession}
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
