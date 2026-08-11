import React from "react";
import type { User } from "@supabase/supabase-js";
import type { AuthPhase } from "./accountSession.ts";
import type { CoreMode, Deck, LearningItem, LearningItemStudyStatePatch, LearningProfileTemplate, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import { Database, Layers } from "lucide-react";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncIdleStatus, createSyncPendingStatus, createSyncSavedStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import { AiCardVariantContractError } from "./aiCardVariantContract.ts";
import { createReviewReturnContext, createStudyRoute, createViewRoute, reviewReturnContextToViewRoute, type SettingsReturnContext } from "./appNavigation.ts";
import { markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.ts";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import type {
  CardDraftGuard,
  CreationScreenProps,
  DashboardScreenProps,
  DeckSettingsScreenProps,
  DecksScreenProps,
  LearnScreenProps,
  SettingsScreenProps,
  SimulatorScreenProps,
  StatisticsScreenProps,
  StudyModeProps,
} from "./appScreenProps.ts";
import { startAppAutosaveLifecycle, startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithGoogle, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import { mergeCloudSyncMetadata, replaceAccountCloudState } from "./cloudRepository.ts";
import { createDefaultDeckSettings, getCardContentPayload } from "./coreModel.ts";
import type { CoreWorkspace, WorkspaceState } from "./coreWorkspace.ts";
import { createPortableExport, mergePortableExportIntoState } from "./dataPortability.ts";
import { getGlobalSchedulerPreferences, normalizeLearningProfileSource, normalizeLearningSettings, withGlobalSchedulerPreferences, type LearningSettingsInput } from "./deckSettings.ts";
import { getLearningDayKey, getNextLearningDayBoundaryDelay } from "./learningDay.ts";
import { createMenuModel } from "./menuModel.ts";
import { createAccountMediaStore } from "./mediaStore.ts";
import { clearPomodoroTimer, createPomodoroTimer, getPomodoroTimerStorageKey, readPomodoroTimer, writePomodoroTimer, type PomodoroTimer } from "./pomodoroTimer.ts";
import { formatSimulationDate, getSimulatedNow, normalizeSimulationOffsetMinutes } from "./simulationClock.ts";
import { SYNC_MUTATION_TYPES, type AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import { createSupabaseBrowserClient, getSupabaseBrowserConfig } from "./supabaseClient.ts";
import { useAppNavigation } from "./useAppNavigation.ts";
import { setDeckExpanded, type DeckExpansionSurface } from "./uiPreferences.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { AppNavigation } from "./ui/AppNavigation.tsx";
import { ActionDialog, EmptyState, OrbIcon, SoftPanel } from "./ui/coreUi.tsx";
import { useSuccessToast } from "./ui/feedbackUi.tsx";

const CreationScreen = React.lazy<React.ComponentType<CreationScreenProps>>(() => import("./screens/CreationScreen.tsx").then(({ CreationScreen }) => ({ default: CreationScreen })));
const DashboardScreen = React.lazy<React.ComponentType<DashboardScreenProps>>(() => import("./screens/DashboardScreen.tsx").then(({ DashboardScreen }) => ({ default: DashboardScreen })));
const DeckSettingsScreen = React.lazy<React.ComponentType<DeckSettingsScreenProps>>(() => import("./screens/DeckSettingsScreen.tsx").then(({ DeckSettingsScreen }) => ({ default: DeckSettingsScreen })));
const DecksScreen = React.lazy<React.ComponentType<DecksScreenProps>>(() => import("./screens/DecksScreen.tsx").then(({ DecksScreen }) => ({ default: DecksScreen })));
const HelpScreen = React.lazy(() => import("./screens/HelpScreen.tsx").then(({ HelpScreen }) => ({ default: HelpScreen })));
const LearnScreen = React.lazy<React.ComponentType<LearnScreenProps>>(() => import("./screens/LearnScreen.tsx").then(({ LearnScreen }) => ({ default: LearnScreen })));
const SimulatorScreen = React.lazy<React.ComponentType<SimulatorScreenProps>>(() => import("./screens/SimulatorScreen.tsx").then(({ SimulatorScreen }) => ({ default: SimulatorScreen })));
const SettingsScreen = React.lazy<React.ComponentType<SettingsScreenProps>>(() => import("./screens/SettingsScreen.tsx").then(({ SettingsScreen }) => ({ default: SettingsScreen })));
const StatisticsScreen = React.lazy<React.ComponentType<StatisticsScreenProps>>(() => import("./screens/StatisticsScreen.tsx").then(({ StatisticsScreen }) => ({ default: StatisticsScreen })));
const StudyMode = React.lazy<React.ComponentType<StudyModeProps>>(() => import("./screens/StudyMode.tsx").then(({ StudyMode }) => ({ default: StudyMode })));

const menu = createMenuModel();
const AUTOSAVE_DELAY_MS = 900;
const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
const magicLinkEnabled = import.meta.env.VITE_ENABLE_MAGIC_LINK === "true";

interface SignInInput { email: string; password: string }
interface SignUpInput extends SignInInput { displayName: string }
interface EmailInput { email: string }
interface PasswordUpdateInput { password: string; passwordRepeat: string }
type CreateDeckInput = Parameters<CoreWorkspace["createDeck"]>[0];
type CardEditorValue = Parameters<CoreWorkspace["saveDeckCard"]>[2];
type CardVariantInput = Parameters<CoreWorkspace["addDeckCardVariant"]>[2];
type ManualCardInput = Parameters<CoreWorkspace["addManualCardToDeck"]>[1];
type PendingNavigation = { run: () => void; source: "creation" | "card" };

function LoadingScreen({ message = "CoRe wird geladen." }: { message?: string }) {
  return (
    <main className="min-h-screen bg-core-canvas p-4 text-[var(--core-text)] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[var(--core-border)] bg-core-surface px-5 py-10 shadow-[var(--core-shadow-raised)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-md p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <h1 className="core-heading-2 font-semibold text-[var(--core-text)]">CoRe</h1>
              <p className="mt-1 core-body text-[var(--core-text-muted)]" role="status" aria-live="polite">
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
      <SoftPanel className="flex items-center gap-3 px-5 py-4 core-body font-medium text-[var(--core-text-muted)]">
        <span className="size-3 animate-pulse rounded-full bg-[var(--core-action-secondary)]" aria-hidden="true" />
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
    <main className="min-h-screen bg-core-canvas p-4 text-[var(--core-text)] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[var(--core-border)] bg-core-surface px-5 py-10 shadow-[var(--core-shadow-raised)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <p className="core-body font-semibold uppercase tracking-wide text-[var(--core-action-secondary)]">Lokale Daten gefunden</p>
              <h1 className="core-heading-2 font-semibold text-[var(--core-text)]">Daten in diesen Account übernehmen?</h1>
            </div>
          </div>
          <p className="core-body leading-6 text-[var(--core-text-muted)]">
            In diesem Browser liegen noch lokale CoRe-Daten: {deckCount} Stapel und {documentCount} Dokumente. Du kannst sie in deinen angemeldeten Account übernehmen oder mit einem leeren Cloud-Stand weiterarbeiten.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onImport} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)] disabled:bg-[var(--core-action-disabled-bg)]">
              <Database size={17} aria-hidden="true" />
              Lokale Daten übernehmen
            </button>
            <button type="button" onClick={onSkip} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:text-[var(--core-action-disabled-text)]">
              Leer starten
            </button>
          </div>
          {message ? (
            <p className="mt-4 core-body text-core-text" role="alert">
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
  const setSuccessToast = useSuccessToast();
  const bootRunRef = React.useRef(0);
  const latestStateRef = React.useRef<WorkspaceState | null>(null);
  const lastAcknowledgedStateRef = React.useRef<WorkspaceState | null>(null);
  const [authPhase, setAuthPhase] = React.useState<AuthPhase>(authPhases.checkingSession);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState<"status" | "alert">("status");
  const [migrationMessage, setMigrationMessage] = React.useState("");
  const [workspace, setWorkspace] = React.useState<CoreWorkspace | null>(null);
  const [state, setState] = React.useState<WorkspaceState | null>(null);
  const [cloudUser, setCloudUser] = React.useState<User | null>(null);
  const [legacyState, setLegacyState] = React.useState<NonNullable<ReturnType<typeof readLegacyLocalState>> | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(createSyncIdleStatus);
  const [syncEngine, setSyncEngine] = React.useState<AccountSyncEngine | null>(null);
  const [creationDraftDirty, setCreationDraftDirty] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation | null>(null);
  const [savingPendingNavigation, setSavingPendingNavigation] = React.useState(false);
  const [simulationOffsetMinutes, setSimulationOffsetMinutes] = React.useState(0);
  const [learningDayRevision, setLearningDayRevision] = React.useState(0);
  const [pomodoroTimer, setPomodoroTimer] = React.useState<PomodoroTimer | null>(null);
  const pomodoroTimerRef = React.useRef<PomodoroTimer | null>(null);
  const creationDraftFocusRef = React.useRef<(() => void) | null>(null);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const screenRegionRef = React.useRef<HTMLElement | null>(null);
  const {
    activeView,
    studyRequest,
    focusedDeckId,
    selectedCardId,
    deckCreationParentId,
    creationMethod,
    creationDeckId,
    completedDeckId,
    settingsReturnContext,
    cardEditorReturnContext,
    navigateToRoute,
    navigateToView: navigateToViewNow,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
  } = useAppNavigation({ authPhase, defaultViewId: menu.defaultViewId });
  const mediaStore = React.useMemo(() => cloudUser ? createAccountMediaStore({ client: supabase, supabaseUrl: getSupabaseBrowserConfig().url, userId: cloudUser.id }) : null, [cloudUser, supabase]);
  const getLearningNow = React.useCallback(
    () => getSimulatedNow(new Date(), simulationOffsetMinutes),
    [simulationOffsetMinutes],
  );
  const globalSchedulerPreferences = getGlobalSchedulerPreferences(state?.profile);
  const learningTimeZone = state?.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const learningNow = React.useMemo(getLearningNow, [activeView, getLearningNow, learningDayRevision, state?.decks]);
  const learningDayKey = getLearningDayKey(learningNow, {
    dayStartHour: globalSchedulerPreferences.dayStartHour,
    timeZone: learningTimeZone,
  }) ?? learningNow.slice(0, 10);

  React.useEffect(() => {
    const delay = getNextLearningDayBoundaryDelay(getLearningNow(), {
      dayStartHour: globalSchedulerPreferences.dayStartHour,
      timeZone: learningTimeZone,
    });
    if (delay == null) return undefined;
    const timerId = window.setTimeout(() => setLearningDayRevision((revision) => revision + 1), delay + 25);
    return () => window.clearTimeout(timerId);
  }, [getLearningNow, globalSchedulerPreferences.dayStartHour, learningDayRevision, learningTimeZone]);

  const changeSimulationOffset = React.useCallback((value: number) => {
    setSimulationOffsetMinutes(normalizeSimulationOffsetMinutes(value));
  }, []);

  const startPomodoro = React.useCallback((minutes: number) => {
    if (!cloudUser?.id) return;
    const timer = createPomodoroTimer(minutes);
    if (!timer) return;
    pomodoroTimerRef.current = timer;
    setPomodoroTimer(timer);
    writePomodoroTimer(cloudUser.id, timer);
  }, [cloudUser?.id]);

  React.useEffect(() => {
    const userId = cloudUser?.id;
    if (!userId) {
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      return;
    }

    const storedTimer = readPomodoroTimer(userId);
    if (storedTimer && storedTimer.endsAt <= Date.now()) {
      const removed = clearPomodoroTimer(userId, storedTimer.id);
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      if (removed) setSuccessToast("Timer abgelaufen.");
      return;
    }
    pomodoroTimerRef.current = storedTimer;
    setPomodoroTimer(storedTimer);
  }, [cloudUser?.id, setSuccessToast]);

  React.useEffect(() => {
    const userId = cloudUser?.id;
    if (!userId || typeof window === "undefined") return undefined;
    const accountUserId = userId;
    let storageKey = "";
    try {
      storageKey = getPomodoroTimerStorageKey(accountUserId);
    } catch {
      return undefined;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      const nextTimer = readPomodoroTimer(accountUserId);
      if (nextTimer && nextTimer.endsAt <= Date.now()) {
        const removed = clearPomodoroTimer(accountUserId, nextTimer.id);
        pomodoroTimerRef.current = null;
        setPomodoroTimer(null);
        if (removed) setSuccessToast("Timer abgelaufen.");
        return;
      }
      pomodoroTimerRef.current = nextTimer;
      setPomodoroTimer(nextTimer);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [cloudUser?.id, setSuccessToast]);

  React.useEffect(() => {
    const userId = cloudUser?.id;
    const timer = pomodoroTimer;
    if (!userId || !timer) return undefined;
    const accountUserId = userId;
    const activeTimer = timer;
    let timeoutId = 0;
    let cancelled = false;

    function checkExpiry() {
      if (cancelled || pomodoroTimerRef.current?.id !== activeTimer.id) return;
      const remainingMilliseconds = activeTimer.endsAt - Date.now();
      if (remainingMilliseconds > 0) {
        timeoutId = window.setTimeout(checkExpiry, Math.min(remainingMilliseconds, 60_000));
        return;
      }

      clearPomodoroTimer(accountUserId, activeTimer.id);
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      setSuccessToast("Timer abgelaufen.");
    }

    checkExpiry();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [cloudUser?.id, pomodoroTimer, setSuccessToast]);

  const navigateToView = React.useCallback((...args: Parameters<typeof navigateToViewNow>) => {
    if (activeView === "neue-karten" && creationDraftDirty) {
      setPendingNavigation({ source: "creation", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    if (activeView === "kartenstapel" && cardDraftGuardRef.current) {
      setPendingNavigation({ source: "card", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    return navigateToViewNow(...args);
  }, [activeView, creationDraftDirty, navigateToViewNow]);

  const handleCreationDraftStateChange = React.useCallback((dirty: boolean, focusDraft: (() => void) | null) => {
    setCreationDraftDirty(dirty);
    creationDraftFocusRef.current = focusDraft;
  }, []);

  const handleCardDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
  }, []);

  const pendingCardNavigation = pendingNavigation?.source === "card";

  function runPendingNavigation() {
    const navigation = pendingNavigation;
    setPendingNavigation(null);
    navigation?.run();
  }

  async function confirmPendingNavigation() {
    if (!pendingCardNavigation) {
      setCreationDraftDirty(false);
      runPendingNavigation();
      return;
    }
    setSavingPendingNavigation(true);
    try {
      if (await cardDraftGuardRef.current?.save()) runPendingNavigation();
    } finally {
      setSavingPendingNavigation(false);
    }
  }

  React.useEffect(() => {
    let observer: MutationObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      const region = screenRegionRef.current;
      if (!region) return;
      const heading = region.querySelector<HTMLElement>("[data-screen-heading]");
      if (heading) {
        heading.focus();
      } else {
        region.focus();
      }

      observer = new MutationObserver(() => {
        const loadedHeading = region.querySelector<HTMLElement>("[data-screen-heading]");
        if (!loadedHeading || loadedHeading === heading) return;
        loadedHeading.focus();
        observer?.disconnect();
        observer = null;
      });
      observer.observe(region, { childList: true, subtree: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [activeView, authPhase, studyRequest]);

  function setAppState(nextState: WorkspaceState | null) {
    latestStateRef.current = nextState;
    setState(nextState);
  }

  function applyCloudAcknowledgement(snapshot: WorkspaceState | null, acknowledgedState: WorkspaceState | null | undefined, runId = bootRunRef.current) {
    if (!acknowledgedState || !workspace || bootRunRef.current !== runId) return null;
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    if (currentState === snapshot && acknowledgedState === snapshot) {
      lastAcknowledgedStateRef.current = snapshot;
      return snapshot;
    }
    const savedState = workspace.saveState(mergeCloudSyncMetadata(currentState, acknowledgedState));
    if (currentState === snapshot) lastAcknowledgedStateRef.current = savedState;
    setAppState(savedState);
    return savedState;
  }

  async function bootAuthenticatedUser(user: User) {
    const runId = bootRunRef.current + 1;
    bootRunRef.current = runId;
    setAuthPhase("loading-cloud");
    setAuthMessage("");
    setMigrationMessage("");

    if (!supabase) throw new Error("Supabase ist für diese Umgebung nicht konfiguriert.");
    const boot = await bootAuthenticatedWorkspace(supabase, user);

    if (bootRunRef.current !== runId) return;

    setWorkspace(boot.workspace);
    setSyncEngine(boot.syncEngine);
    lastAcknowledgedStateRef.current = boot.state;
    setAppState(boot.state);
    setCloudUser(user);
    setSyncStatus(
      boot.conflictCount > 0
        ? createSyncConflictStatus(boot.conflictCount)
        : boot.pendingCount > 0
          ? createSyncPendingStatus()
          : createSyncSavedStatus("Cloud geladen."),
    );

    if (boot.legacyState) {
      setLegacyState(boot.legacyState);
      setAuthPhase("migration-choice");
      return;
    }

    setLegacyState(null);
    setAuthPhase("ready");
  }

  React.useEffect(() => {
    const recoverPassword = (user: User) => {
      bootRunRef.current += 1;
      setCloudUser(user);
      setWorkspace(null);
      lastAcknowledgedStateRef.current = null;
      setAppState(null);
      setLegacyState(null);
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage("Bitte lege ein neues Passwort fest.");
      setAuthMessageType("status");
    };
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
      onPasswordRecovery: recoverPassword,
      onBoot: bootAuthenticatedUser,
      onFailure(error) {
        setAuthPhase("signed-out");
        setAuthMessage(formatCloudAuthError(error, "Sitzung konnte nicht geladen werden."));
        setAuthMessageType("alert");
      },
    });
    return () => {
      bootRunRef.current += 1;
      stop();
    };
  }, [supabase]);

  React.useEffect(() => {
    return startAppSyncLifecycle({
      authPhase,
      syncEngine,
      getLatestState: () => latestStateRef.current,
      getRunId: () => bootRunRef.current,
      onStatus: setSyncStatus,
      onAcknowledged: applyCloudAcknowledgement,
    });
  }, [authPhase, syncEngine, workspace]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !mediaStore || !syncEngine || !workspace) return undefined;
    return startAppMediaRetryLifecycle({
      mediaStore,
      getState: () => latestStateRef.current,
      ensureCloudParents: async () => { await syncNow(); },
      persistMediaDecks: (decks) => persistImportedDecks(decks, { mediaOnly: true }),
    });
  }, [authPhase, mediaStore, syncEngine, workspace]);

  React.useEffect(() => {
    return startAppAutosaveLifecycle({
      authPhase,
      syncEngine,
      state,
      lastAcknowledgedState: lastAcknowledgedStateRef.current,
      runId: bootRunRef.current,
      delayMs: AUTOSAVE_DELAY_MS,
      onAcknowledged: applyCloudAcknowledgement,
      onStatus: setSyncStatus,
      formatError: (error) => formatCloudAuthError(error, "Synchronisierung fehlgeschlagen."),
    });
  }, [authPhase, state, syncEngine, workspace]);

  async function handleSignIn({ email, password }: SignInInput) {
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

  async function handleSignUp({ displayName, email, password }: SignUpInput) {
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

  async function handleResetPassword({ email }: EmailInput) {
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

  async function handleMagicLink({ email }: EmailInput) {
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

  async function handleUpdatePassword({ password, passwordRepeat }: PasswordUpdateInput) {
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

  async function resolveSyncConflict(conflictId: string, decision: Record<string, unknown>) {
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
    setSimulationOffsetMinutes(0);
    setWorkspace(null);
    setSyncEngine(null);
    lastAcknowledgedStateRef.current = null;
    setAppState(null);
    setCloudUser(null);
    setLegacyState(null);
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
    const nextDecks = Array.isArray(deck) ? deck : [deck];
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveDecks(nextDecks));
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

  function createDeck(input: CreateDeckInput = {}) {
    const saved = runWorkspaceMutation((currentWorkspace) => currentWorkspace.createDeck(input));
    if (!saved) return null;
    navigateToViewNow("lernen", { focusedDeckId: saved.id }, { replace: true });
    return saved;
  }

  function updateDeck(deckId: string, updater: (deck: Deck) => Deck) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.updateDeck(deckId, updater));
  }

  async function deleteDeck(deckId: string) {
    const result = await runSyncedWorkspaceMutation((currentWorkspace) => currentWorkspace.deleteDeckTree(deckId));
    if (!result) return null;
    return result;
  }

  function renameDeck(deckId: string, name: string) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.renameDeck(deckId, name));
    if (!result) return null;
    return result;
  }

  function moveDeck(deckId: string, parentDeckId: string | null = null) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.moveDeck(deckId, parentDeckId));
    if (!result) return null;
    return result;
  }

  function setDeckCoreMode(deckId: string, coreMode: CoreMode) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.setDeckCoreMode(deckId, coreMode));
  }

  function saveDeckLearningSettings(
    deckId: string,
    settings: LearningSettingsInput = {},
  ) {
    return updateDeck(deckId, (deck) => {
      const normalized = normalizeLearningSettings(settings);
      const variantThresholdXp = settings.variantThresholdXp == null ? undefined : Number(settings.variantThresholdXp);
      const maxActiveVariantsPerCard = settings.maxActiveVariantsPerCard == null ? undefined : Number(settings.maxActiveVariantsPerCard);
      const nextDeckSettings = createDefaultDeckSettings({
        ...deck.deckSettings,
        ...normalized,
        learningProfileSource: normalizeLearningProfileSource(settings.learningProfileSource),
        coreMode: settings.coreMode === "off" || settings.coreMode === "auto" || settings.coreMode === "manual" ? settings.coreMode : deck.deckSettings.coreMode,
        ...(Number.isFinite(variantThresholdXp) ? { variantThresholdXp } : {}),
        ...(Number.isFinite(maxActiveVariantsPerCard) ? { maxActiveVariantsPerCard } : {}),
        ...(settings.newCardsPerDay !== undefined && settings.newCardsPerDay !== deck.deckSettings.newCardsPerDay
          ? { newCardsTodayOverride: null }
          : {}),
      });

      return {
        ...deck,
        deckSettings: nextDeckSettings,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function setCardStudyState(deckId: string, cardId: string, patch: LearningItemStudyStatePatch) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.setDeckCardStudyState(deckId, cardId, patch));
  }

  function saveDeckAppearance(deckId: string, appearance: Deck["deckSettings"]["appearance"]) {
    return updateDeck(deckId, (deck: Deck) => ({
      ...deck,
      deckSettings: { ...deck.deckSettings, appearance },
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveGlobalSchedulerPreferences(settings: { dayStartHour: number; learnAheadMinutes: number }) {
    if (!state) return null;
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile(withGlobalSchedulerPreferences(state.profile, settings)));
  }

  function saveLearningProfiles(learningProfiles: LearningProfileTemplate[]) {
    if (!state) return null;
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile(withGlobalSchedulerPreferences(state.profile, { learningProfiles })));
  }

  async function saveDeckCard(deckId: string, cardId: string, value: CardEditorValue) {
    if (!workspace || !syncEngine) throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    const runId = bootRunRef.current;
    const currentSnapshot = workspace.getState();
    try {
      const pendingResult = await syncEngine.flush(currentSnapshot, { force: true });
      applyCloudAcknowledgement(currentSnapshot, pendingResult.saved?.state, runId);
    } catch {
      // Der definitive Snapshot nach der lokalen Kartenmutation versucht die Synchronisierung erneut.
    }
    const savedCard = workspace.saveDeckCard(deckId, cardId, value);
    const snapshot = workspace.getState();
    setAppState(snapshot);
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
    const result = await syncEngine.flush(undefined, { force: true });
    const acknowledged = applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
    if (!acknowledged) throw new Error("Die Kartenänderung wurde nicht von der Cloud bestätigt.");
    return savedCard;
  }

  async function runSyncedWorkspaceMutation<T>(mutation: (currentWorkspace: CoreWorkspace) => T): Promise<T | null> {
    if (!workspace || !syncEngine) return null;
    const result = runWorkspaceMutation(mutation);
    if (result == null) return null;
    const snapshot = workspace.getState();
    const runId = bootRunRef.current;
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
    const syncResult = await syncEngine.flush(undefined, { force: true });
    const acknowledged = applyCloudAcknowledgement(snapshot, syncResult.saved?.state, runId);
    if (!acknowledged) throw new Error("Die Änderung wurde nicht von der Cloud bestätigt.");
    return result;
  }

  async function deleteDeckCard(deckId: string, cardId: string) {
    if (!workspace || !syncEngine) return null;
    const result = workspace.deleteDeckCard(deckId, cardId);
    const snapshot = refresh();
    if (!result || !snapshot) return null;

    const runId = bootRunRef.current;
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
    void syncEngine.flush(undefined, { force: true }).then(({ saved }) => {
      applyCloudAcknowledgement(snapshot, saved?.state, runId);
    }).catch(() => {
      // Die lokal persistierte Löschung bleibt in der Outbox; der Sync-Status zeigt den Fehler separat.
    });
    return result;
  }

  function duplicateDeckCard(deckId: string, cardId: string) {
    return runSyncedWorkspaceMutation((currentWorkspace) => currentWorkspace.duplicateDeckCard(deckId, cardId));
  }

  function undoDeleteDeckCard(deckId: string, deletedCard: LearningItem) {
    return runSyncedWorkspaceMutation((currentWorkspace) => currentWorkspace.restoreDeletedDeckCard(deckId, deletedCard));
  }

  function restoreDeckCard(deckId: string, cardId: string, versionId: string) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.restoreDeckCardVersion(deckId, cardId, versionId));
  }

  function addDeckCardVariant(deckId: string, cardId: string, variant: CardVariantInput) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addDeckCardVariant(deckId, cardId, variant));
  }

  async function generateDeckCardVariant(deckId: string, cardId: string) {
    if (!workspace) throw new AiCardVariantContractError("workspace_unavailable", "Die Kartenverwaltung ist noch nicht bereit.");
    const sourceCard = workspace.getState().decks.find((deck) => deck.id === deckId)?.cards.find((card) => card.id === cardId && !card.deletedAt);
    const sourcePayload = sourceCard ? getCardContentPayload(sourceCard) : null;
    if (!sourcePayload) throw new AiCardVariantContractError("card_not_found", "Die Ausgangskarte ist nicht mehr verfügbar.");
    const generated = await requestAiCardVariant(sourcePayload, supabase);

    const currentCard = workspace.getState().decks.find((deck) => deck.id === deckId)?.cards.find((card) => card.id === cardId && !card.deletedAt);
    const draft = createAiGeneratedVariantDraft(sourcePayload, currentCard, generated);
    const saved = await runSyncedWorkspaceMutation((currentWorkspace) => currentWorkspace.addDeckCardVariant(deckId, cardId, draft, "KI-Umformulierung"));
    if (!saved) throw new AiCardVariantContractError("save_failed", "Die KI-Variante konnte nicht gespeichert werden.");
    return generated;
  }

  function addManualCardToDeck(deckId: string, manualDeckInput: ManualCardInput) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addManualCardToDeck(deckId, manualDeckInput));
  }

  async function completeCreatedDeck(deck: Deck) {
    await persistImportedDecks([deck]);
    return workspace?.getState().decks.find((candidate) => candidate.id === deck.id) ?? null;
  }

  async function completeManualCard(deckId: string, manualDeckInput: ManualCardInput) {
    const deck = addManualCardToDeck(deckId, manualDeckInput);
    if (deck) await persistImportedDecks([deck]);
    return deck;
  }

  async function createDemo() {
    const decks = runWorkspaceMutation((currentWorkspace: { createWorldCapitalsDemo: () => Deck[] }) => currentWorkspace.createWorldCapitalsDemo());
    if (decks?.length) await persistImportedDecks(decks);
    navigateToView("lernen");
    return decks;
  }

  function deckSettingsSourceViewRoute(deckId: string | null, clearSelection = false) {
    if (settingsReturnContext?.view === "today") return createViewRoute("uebersicht");
    if (settingsReturnContext?.view === "decks") {
      return createViewRoute("kartenstapel", clearSelection ? {} : {
        focusedDeckId: deckId,
        selectedCardId: deckId ? settingsReturnContext.cardId : null,
      });
    }
    return createViewRoute("lernen", clearSelection ? {} : { focusedDeckId: deckId });
  }

  function deckSettingsReturnRoute(deckId: string | null, clearSelection = false) {
    if (settingsReturnContext?.view !== "review") {
      return deckSettingsSourceViewRoute(deckId, clearSelection);
    }
    if (clearSelection) return createViewRoute("lernen");
    return createStudyRoute(settingsReturnContext.reviewReturnContext.deckId, {
      variantSession: settingsReturnContext.reviewReturnContext.variantSession,
      variantId: settingsReturnContext.reviewReturnContext.variantId,
      returnContext: settingsReturnContext.reviewReturnContext.returnContext,
    });
  }

  function saveProfile(profile: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile(profile));
  }

  function saveDeckExpansion(surface: DeckExpansionSurface, deckId: string, expanded: boolean) {
    if (!workspace) return null;
    const profile = workspace.getState().profile;
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile({
      uiPreferences: setDeckExpanded(profile.uiPreferences, surface, deckId, expanded),
    }));
  }

  function saveState(nextState: WorkspaceState) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveState(nextState));
  }

  function startDeck(deck: { id: string; }, variantSession = false) {
    const currentRoute = getStudyReturnRoute();
    const returnRoute = activeView === "kartenstapel"
      ? createViewRoute("kartenstapel", {
          focusedDeckId: focusedDeckId ?? deck.id,
          selectedCardId,
        })
      : activeView === "stapel-einstellungen"
        ? settingsReturnContext?.view === "review"
          ? reviewReturnContextToViewRoute(settingsReturnContext.reviewReturnContext.returnContext)
          : deckSettingsSourceViewRoute(deck.id)
        : activeView === "lernen"
        ? createViewRoute("lernen", { focusedDeckId: deck.id })
        : currentRoute;
    navigateToRoute(createStudyRoute(deck.id, {
      variantSession,
      returnContext: createReviewReturnContext(returnRoute, deck.id),
    }), { replace: activeView === "stapel-einstellungen" });
  }

  function openDecks(deckId: string | null = null, cardId: string | null = null) {
    navigateToView("kartenstapel", {
      focusedDeckId: deckId || null,
      selectedCardId: deckId && cardId ? cardId : null,
    });
  }

  function openLearn(deckId: string | null = null) {
    navigateToView("lernen", { focusedDeckId: deckId || null });
  }

  function openCardCreation(deckId: string | null = null) {
    navigateToView("neue-karten", {
      creationMethod: "manual",
      creationDeckId: deckId || null,
    });
  }

  function openDeckSettings(deckId: string, returnContext: SettingsReturnContext = { view: "learn" }) {
    navigateToView("stapel-einstellungen", { focusedDeckId: deckId, settingsReturnContext: returnContext });
  }

  function openDeckCreation(parentDeckId = "") {
    navigateToView("lernen", {
      focusedDeckId: parentDeckId || focusedDeckId,
      deckCreationParentId: parentDeckId || "",
    });
  }

  function renderActiveView() {
    if (!state) return null;
    if (studyRequest && !state.decks.some((deck) => deck.id === studyRequest.deckId)) {
      return (
        <EmptyState
          icon={Layers}
          title="Stapel nicht gefunden oder nicht verfügbar."
          body="Die verlinkte Lernsitzung kann nicht geöffnet werden, weil der Stapel gelöscht wurde oder in diesem Account nicht verfügbar ist."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => openLearn(null)} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--core-surface-muted)] px-5 core-body font-semibold text-[var(--core-action-primary)]">
                Zu Lernen
              </button>
              <button type="button" onClick={() => openDecks(null)} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--core-border)] bg-core-surface px-5 core-body font-semibold text-[var(--core-action-primary)]">
                Zur Kartenverwaltung
              </button>
            </div>
          }
        />
      );
    }
    if (activeView === "stapel-einstellungen") {
      const returnsToReview = settingsReturnContext?.view === "review";
      const returnsToDashboard = settingsReturnContext?.view === "today";
      const returnsToDecks = settingsReturnContext?.view === "decks";
      return (
        <DeckSettingsScreen
          deck={state.decks.find((deck) => deck.id === focusedDeckId) ?? null}
          decks={state.decks}
          learningProfiles={globalSchedulerPreferences.learningProfiles}
          onSave={saveDeckLearningSettings}
          onSaveLearningProfiles={saveLearningProfiles}
          onSaveAppearance={saveDeckAppearance}
          onRenameDeck={renameDeck}
          onCreateSubdeck={openDeckCreation}
          onStartDeck={startDeck}
          onDeleteDeck={async (deckId) => {
            const result = await deleteDeck(deckId);
            if (result) navigateToRoute(deckSettingsReturnRoute(null, true));
            return result;
          }}
          onSelectDeck={(deckId) => navigateToViewNow("stapel-einstellungen", { focusedDeckId: deckId }, { replace: true })}
          onOpenGlobalSettings={() => navigateToView("einstellungen")}
          backLabel={returnsToReview ? "Zurück zur Sitzung" : returnsToDashboard ? "Zurück zur Übersicht" : returnsToDecks ? "Zurück zur Kartenverwaltung" : "Zurück zu Lernen"}
          onBack={() => navigateToRoute(deckSettingsReturnRoute(focusedDeckId))}
        />
      );
    }
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          decks={state.decks}
          now={learningNow}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          timeZone={learningTimeZone}
          mediaStore={mediaStore}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onSetCardStudyState={setCardStudyState}
          onDuplicateCard={duplicateDeckCard}
          onDeleteCard={deleteDeckCard}
          onUndoDeleteCard={undoDeleteDeckCard}
          onRestoreCard={restoreDeckCard}
          onAddVariant={addDeckCardVariant}
          onGenerateVariant={generateDeckCardVariant}
          selectedDeckId={focusedDeckId}
          selectedCardId={selectedCardId}
          onSelectDeck={openDecks}
          onCloseSelectedCard={cardEditorReturnContext ? () => navigateToRoute(createStudyRoute(
            cardEditorReturnContext.deckId,
            {
              variantSession: cardEditorReturnContext.variantSession,
              variantId: cardEditorReturnContext.variantId,
              returnContext: cardEditorReturnContext.returnContext,
            },
          ), { replace: true }) : undefined}
          onMoveDeck={moveDeck}
          onOpenCardCreation={() => openCardCreation(focusedDeckId)}
          onOpenLearn={openLearn}
          onDraftStateChange={handleCardDraftStateChange}
          expandedDeckIds={state.profile.uiPreferences.deckManagerExpandedDeckIds}
          onSetDeckExpanded={saveDeckExpansion}
          onOpenDeckSettings={(deckId) => openDeckSettings(deckId, {
            view: "decks",
            ...(selectedCardId ? { cardId: selectedCardId } : {}),
          })}
        />
      );
    }
    if (activeView === "neue-karten") {
      return (
        <CreationScreen
          decks={state.decks}
          mediaStore={mediaStore}
          persistImportedDecks={persistImportedDecks}
          initialMethod={creationMethod}
          initialTargetDeckId={creationDeckId}
          completedDeckId={completedDeckId}
          onMethodChange={(method: "manual" | "import" | "") => navigateToView("neue-karten", method ? {
            creationMethod: method,
            creationDeckId: method === "manual" ? creationDeckId || state.decks[0]?.id : null,
          } : {})}
          onTargetDeckChange={(deckId) => navigateToViewNow("neue-karten", {
            creationMethod: "manual",
            creationDeckId: deckId || null,
          })}
          onCreated={completeCreatedDeck}
          onAppendManualCard={completeManualCard}
          onDraftStateChange={handleCreationDraftStateChange}
          onSessionCompleted={(deckId) => navigateToViewNow("neue-karten", { completedDeckId: deckId }, { replace: true })}
          onStartDeck={startDeck}
          onReviewDeck={openDecks}
        />
      );
    }
    if (activeView === "lernen") {
      return (
        <LearnScreen
          decks={state.decks}
          now={learningNow}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          timeZone={learningTimeZone}
          onStartDeck={startDeck}
          onCreateDeck={createDeck}
          focusedDeckId={focusedDeckId}
          initialParentDeckId={deckCreationParentId}
          onDeckCreationHandled={() => navigateToViewNow("lernen", { focusedDeckId }, { replace: true })}
          onFocusDeck={openLearn}
          onOpenCardCreation={() => openCardCreation(focusedDeckId)}
          onOpenDecks={openDecks}
          onOpenDeckSettings={(deckId) => openDeckSettings(deckId, { view: "learn" })}
          onSetDeckCoreMode={setDeckCoreMode}
          onMoveDeck={moveDeck}
          collapsedDeckIds={state.profile.uiPreferences.learnCollapsedDeckIds}
          onSetDeckExpanded={saveDeckExpansion}
        />
      );
    }
    if (activeView === "statistik") {
      return (
        <StatisticsScreen
          decks={state.decks}
          now={learningNow}
          timeZone={learningTimeZone}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          onNavigate={navigateToView}
          onStartDeck={(deckId) => {
            const deck = state.decks.find((candidate) => candidate.id === deckId);
            if (deck) startDeck(deck);
          }}
          onOpenCard={openDecks}
        />
      );
    }
    if (activeView === "simulator") {
      return (
        <SimulatorScreen
          systemNow={new Date().toISOString()}
          offsetMinutes={simulationOffsetMinutes}
          onOffsetChange={changeSimulationOffset}
        />
      );
    }
    if (activeView === "hilfe") {
      return <HelpScreen />;
    }
    if (activeView === "einstellungen") {
      return (
        <SettingsScreen
          appState={state}
          profile={state.profile}
          syncStatus={syncStatus}
          onSaveProfile={saveProfile}
          globalSchedulerPreferences={globalSchedulerPreferences}
          onSaveGlobalSchedulerPreferences={saveGlobalSchedulerPreferences}
          onSaveState={saveState}
          onSyncNow={syncNow}
          onListConflicts={listSyncConflicts}
          onResolveConflict={resolveSyncConflict}
          onSignOut={signOut}
          onNavigate={navigateToView}
          simulationOffsetMinutes={simulationOffsetMinutes}
          simulationDateLabel={formatSimulationDate(learningNow)}
          pomodoroTimer={pomodoroTimer}
          onStartPomodoro={startPomodoro}
        />
      );
    }
    return <DashboardScreen state={state} now={learningNow} onNavigate={navigateToView} onStartDeck={startDeck} onCreateDemo={createDemo} onSetDeckCoreMode={setDeckCoreMode} onMoveDeck={moveDeck} onOpenDeckSettings={(deckId) => openDeckSettings(deckId, { view: "today" })} onSetDeckExpanded={saveDeckExpansion} />;
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
        showMagicLink={magicLinkEnabled}
        showGoogleSignIn={googleAuthEnabled}
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

  const studyDeck = studyRequest ? state.decks.find((deck) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={state.decks}
          deckId={studyDeck.id}
          variantSession={studyRequest.variantSession}
          variantId={studyRequest.variantId}
          mediaStore={mediaStore}
          getNow={getLearningNow}
          learningDayKey={learningDayKey}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          timeZone={learningTimeZone}
          simulationOffsetMinutes={simulationOffsetMinutes}
          pomodoroTimer={pomodoroTimer}
          onStartPomodoro={startPomodoro}
          onExit={() => {
            refresh();
            navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
          }}
          onReturnToLearn={() => {
            refresh();
            navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
          }}
          onEditCard={(currentDeckId, cardId) => navigateToViewNow("kartenstapel", {
            focusedDeckId: currentDeckId,
            selectedCardId: cardId,
            cardEditorReturnContext: {
              deckId: studyRequest.deckId,
              variantSession: studyRequest.variantSession,
              variantId: studyRequest.variantId,
              returnContext: studyRequest.returnContext,
            },
          })}
          onEditDeck={(currentDeckId) => navigateToViewNow("stapel-einstellungen", {
            focusedDeckId: currentDeckId,
            settingsReturnContext: {
              view: "review",
              reviewReturnContext: {
                deckId: studyRequest.deckId,
                variantSession: studyRequest.variantSession,
                variantId: studyRequest.variantId,
                returnContext: studyRequest.returnContext,
              },
            },
          })}
          onSetCardStudyState={setCardStudyState}
          onDeckUpdated={saveDeck}
          onReviewEvent={enqueueReviewEvent}
        />
      </React.Suspense>
    );
  }

  return (
    <main className="min-h-dvh overflow-x-clip bg-core-canvas p-4 text-[var(--core-text)] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-[var(--core-border)] bg-core-surface shadow-[var(--core-shadow-raised)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] xl:h-[calc(100dvh-4rem)] xl:min-h-0 xl:grid-cols-[13rem_minmax(0,1fr)] xl:grid-rows-1">
        <AppNavigation
          navigationItems={navigationItems}
          activeView={activeView}
          simulationOffsetMinutes={simulationOffsetMinutes}
          simulationDateLabel={formatSimulationDate(learningNow)}
          pomodoroTimer={pomodoroTimer}
          onNavigate={navigateToView}
          onResetSimulation={() => changeSimulationOffset(0)}
        />

        <section ref={screenRegionRef} className="min-w-0 overflow-x-hidden px-5 pb-32 pt-8 outline-none sm:px-8 lg:px-12 xl:overflow-y-auto xl:py-12" tabIndex={-1} aria-label="Seiteninhalt">
          <React.Suspense fallback={<ScreenLoadingFallback />}>{renderActiveView()}</React.Suspense>
        </section>
      </div>
      <ActionDialog
        open={Boolean(pendingNavigation)}
        title={pendingCardNavigation ? "Änderungen übernehmen?" : "Ungespeicherten Entwurf verlassen?"}
        description={pendingCardNavigation
          ? "Du hast ungespeicherte Änderungen an dieser Karte. Speichere oder verwirf sie, bevor du die Kartenverwaltung verlässt."
          : "Deine bereits gespeicherten Karten bleiben erhalten. Nur die aktuell eingegebenen, noch nicht gespeicherten Inhalte würden verworfen."}
        confirmLabel={pendingCardNavigation ? "Speichern" : "Verwerfen und verlassen"}
        cancelLabel="Weiter bearbeiten"
        discardLabel={pendingCardNavigation ? "Verwerfen" : undefined}
        confirmLoading={savingPendingNavigation}
        destructive={!pendingCardNavigation}
        restoreFocus={(reason) => {
          if (reason !== "cancel") return;
          if (pendingCardNavigation) cardDraftGuardRef.current?.focus();
          else creationDraftFocusRef.current?.();
        }}
        onCancel={() => setPendingNavigation(null)}
        onDiscard={pendingCardNavigation ? runPendingNavigation : undefined}
        onConfirm={() => void confirmPendingNavigation()}
      />
    </main>
  );
}
