import React from "react";
import type { User } from "@supabase/supabase-js";
import type { AuthPhase } from "./accountSession.ts";
import type { CardEditorValue, CoreMode, Deck, ImportCommitGraph, ImportVerificationScope, LearningItem, LearningItemStudyStatePatch, LearningProfileTemplate, NewReviewOrder, SyncStatus } from "./coreTypes.ts";
import { ArrowRight, Database, Layers } from "lucide-react";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncIdleStatus, createSyncPendingStatus, createSyncSavedStatus, createSyncSavingStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { markCloudBootstrapReady, markCloudSyncReady, markWorkspaceLocalReady } from "./appPerformance.ts";
import { createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import { AiCardVariantContractError } from "./aiCardVariantContract.ts";
import { createReviewReturnContext, createStudyRoute, createViewRoute, reviewReturnContextToViewRoute, type ReviewReturnContext, type SettingsReturnContext, type SettingsTarget } from "./appNavigation.ts";
import { markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.ts";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import { createEmptyApkgImportSession, disposeApkgImportPreview, hasVisibleApkgImportSession, resolveApkgCreationMethod, type ApkgImportSession } from "./apkgImportSession.ts";
import type {
  CardDraftGuard,
  DecksCardPage,
  DecksCardPageRequest,
  SettingsDraftGuard,
} from "./appScreenProps.ts";
import { CreationScreen, DashboardScreen, DeckSettingsScreen, DecksScreen, HelpScreen, LearnScreen, preloadAppView, SettingsScreen, SimulatorScreen, StatisticsScreen, StudyMode } from "./appFeatureLoading.tsx";
import { allowsBrowserSpeculativePreloading, startAdaptiveFeaturePreloading } from "./appFeaturePreload.ts";
import { startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithGoogle, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import { createImportCloudSyncTask, type ImportCloudSyncTask } from "./importCloudSyncTask.ts";
import { addRephrasedVariant, createDefaultDeckSettings, createManualCoreDeck, duplicateLearningItemContent, getCardContentPayload, restoreCardVersion, saveCardEditorValue, saveLearningItemDocumentValues, updateLearningItemStudyState } from "./coreModel.ts";
import { createWorkspaceDeck, restoreSoftDeletedCard, softDeleteCard, updateDeckTreePlacement, type WorkspaceState } from "./coreWorkspace.ts";
import { createWorldCapitalsSeedDecks } from "./fixtures/worldCapitals.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createPortableExport, mergePortableExportIntoState, stringifyPortableExport } from "./dataPortability.ts";
import { getGlobalSchedulerPreferences, markLearningSettingsCustom, normalizeLearningProfileSource, normalizeLearningSettings, withGlobalSchedulerPreferences, type LearningSettingsInput } from "./deckSettings.ts";
import { getLearningDayKey, getNextLearningDayBoundaryDelay } from "./learningDay.ts";
import { createDeckLibraryModel } from "./libraryModel.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import type { StudyHeatmapModel } from "./studyHeatmapModel.ts";
import type { StatisticsDeckSelection, StatisticsPeriod } from "./statisticsModel.ts";
import { createMenuModel } from "./menuModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import { clearPomodoroTimer, createPomodoroTimer, getPomodoroTimerStorageKey, readPomodoroTimer, writePomodoroTimer, type PomodoroTimer } from "./pomodoroTimer.ts";
import { createDailyReviewQueue, updateDeckNewCardLimitForDate, type ReviewAnswerResult } from "./reviewService.ts";
import { formatSimulationDate, getSimulatedNow, normalizeSimulationOffsetMinutes } from "./simulationClock.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import { useAppNavigation, type AppNavigationRequest } from "./useAppNavigation.ts";
import { setDeckExpanded, type DeckExpansionSurface } from "./uiPreferences.ts";
import { requestPersistentWorkspaceStorage, type WorkspaceStorageStatus } from "./workspaceStorage.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { AppNavigation } from "./ui/AppNavigation.tsx";
import { ActionDialog, EmptyState, OrbIcon, SoftPanel } from "./ui/coreUi.tsx";
import { useSuccessToast } from "./ui/feedbackUi.tsx";
import { SettingsSaveBar } from "./ui/SettingsSaveBar.tsx";
import { normalizeDeckSettingsDraft, type DeckLearningSettingsDraft, type DeckSettingsDraft, type GlobalSettingsDraft } from "./settingsDraft.ts";
const menu = createMenuModel();
const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
const magicLinkEnabled = import.meta.env.VITE_ENABLE_MAGIC_LINK === "true";

interface SignInInput { email: string; password: string }
interface SignUpInput extends SignInInput { displayName: string }
interface EmailInput { email: string }
interface PasswordUpdateInput { password: string; passwordRepeat: string }
type CreateDeckInput = Parameters<typeof createWorkspaceDeck>[1];
type CardDocumentValue = { fields: Array<{ id: string; value: string }>; tags?: string[] };
type CardVariantInput = { front: string; back: string; variantLevel?: number; generationSource?: "original" | "ai_generated" | "user_edited" | "imported"; qualityStatus?: "draft" | "active" | "rejected" | "flagged" | "disabled"; isActive?: boolean; meta?: Record<string, unknown> };
type ManualCardInput = Parameters<typeof createManualCoreDeck>[0];
type PendingNavigation = { run: () => void; source: "creation" | "card" };
type PendingSettingsNavigation = { run: () => void };
type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
interface StateRefreshOptions { preserveCardPages?: boolean }
interface EmptyStudyStart {
  deckId: string;
  deckName: string;
  hasAdditionalNewCards: boolean;
  limitReached: boolean;
  returnContext: SettingsReturnContext;
}

function reviewReturnContextToSettingsReturnContext(context: ReviewReturnContext): SettingsReturnContext {
  if (context.view === "today") return { view: "today" };
  if (context.view === "decks") return { view: "decks", ...(context.cardId ? { cardId: context.cardId } : {}) };
  return { view: "learn" };
}

function createEmptyStudyStart(
  deckId: string,
  queue: ReturnType<typeof createDailyReviewQueue>,
  returnContext: ReviewReturnContext,
): EmptyStudyStart {
  return {
    deckId,
    deckName: queue.deckName,
    hasAdditionalNewCards: queue.availableNewCards > 0,
    limitReached: queue.availableDueCards > 0 || queue.limitSummary.hiddenDueCount > 0,
    returnContext: reviewReturnContextToSettingsReturnContext(returnContext),
  };
}

function withDeckLearningSettings(deck: Deck, settings: LearningSettingsInput): Deck {
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
}

function LoadingScreen({ message = "CoRe wird geladen." }: { message?: string }) {
  return (
    <main className="core-centered-viewport grid min-h-dvh min-w-0 place-items-center bg-core-surface px-5 py-10 text-[var(--core-text)]">
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
    <main className="core-centered-viewport grid min-h-dvh min-w-0 place-items-center bg-core-surface px-5 py-10 text-[var(--core-text)]">
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
    </main>
  );
}

export function App() {
  const [supabase, setSupabase] = React.useState<SupabaseBrowserClient | undefined>(undefined);
  const [supabaseUrl, setSupabaseUrl] = React.useState("");
  const navigationItems = React.useMemo(() => menu.listNavigationItems(), []);
  const setSuccessToast = useSuccessToast();
  const bootRunRef = React.useRef(0);
  const initialCloudSyncRef = React.useRef<Promise<unknown> | null>(null);
  const latestStateRef = React.useRef<WorkspaceState | null>(null);
  const lastAcknowledgedStateRef = React.useRef<WorkspaceState | null>(null);
  const [authPhase, setAuthPhase] = React.useState<AuthPhase>(authPhases.checkingSession);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState<"status" | "alert">("status");
  const [migrationMessage, setMigrationMessage] = React.useState("");
  const [workspaceRepository, setWorkspaceRepository] = React.useState<IndexedDbCoreRepository | null>(null);
  const [state, setState] = React.useState<WorkspaceState | null>(null);
  const [cardPages, setCardPages] = React.useState<Record<string, DecksCardPage | undefined>>({});
  const [deckSummaries, setDeckSummaries] = React.useState<ReadonlyMap<string, DeckLibrarySummary>>(new Map());
  const [studyHeatmap, setStudyHeatmap] = React.useState<StudyHeatmapModel | undefined>();
  const [studyDecks, setStudyDecks] = React.useState<Deck[] | null>(null);
  const [studyDefinitions, setStudyDefinitions] = React.useState(state?.noteTypeDefinitions ?? []);
  const [studyHasMoreCards, setStudyHasMoreCards] = React.useState(false);
  const [visibleDefinitions, setVisibleDefinitions] = React.useState(state?.noteTypeDefinitions ?? []);
  const cardPageRequestRef = React.useRef(new Map<string, string>());
  const [cloudUser, setCloudUser] = React.useState<User | null>(null);
  const [legacyState, setLegacyState] = React.useState<NonNullable<ReturnType<typeof readLegacyLocalState>> | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(createSyncIdleStatus);
  const [syncEngine, setSyncEngine] = React.useState<AccountSyncEngine | null>(null);
  const [storageStatus, setStorageStatus] = React.useState<WorkspaceStorageStatus | null>(null);
  const [mediaStore, setMediaStore] = React.useState<AccountMediaStore | null>(null);
  const [apkgImportSession, setApkgImportSessionState] = React.useState<ApkgImportSession>(() => createEmptyApkgImportSession());
  const creationDraftDirtyRef = React.useRef(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation | null>(null);
  const settingsDraftGuardRef = React.useRef<SettingsDraftGuard | null>(null);
  const [settingsDraftOpen, setSettingsDraftOpen] = React.useState(false);
  const [pendingSettingsNavigation, setPendingSettingsNavigation] = React.useState<PendingSettingsNavigation | null>(null);
  const [savingSettingsDraft, setSavingSettingsDraft] = React.useState(false);
  const [emptyStudyStart, setEmptyStudyStart] = React.useState<EmptyStudyStart | null>(null);
  const [savingPendingNavigation, setSavingPendingNavigation] = React.useState(false);
  const [simulationOffsetMinutes, setSimulationOffsetMinutes] = React.useState(0);
  const [learningDayRevision, setLearningDayRevision] = React.useState(0);
  const [pomodoroTimer, setPomodoroTimer] = React.useState<PomodoroTimer | null>(null);
  const featurePreloadingAllowed = syncStatus.status !== "saving" && syncStatus.status !== "pending";
  const pomodoroTimerRef = React.useRef<PomodoroTimer | null>(null);
  const creationDraftFocusRef = React.useRef<(() => void) | null>(null);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const screenRegionRef = React.useRef<HTMLElement | null>(null);
  const preparedStudyKeyRef = React.useRef("");
  const preparingStudyKeyRef = React.useRef("");
  const studyQueueCursorRef = React.useRef<Record<string, { dueAt: string; id: string }>>({});
  const apkgImportSessionRef = React.useRef(apkgImportSession);
  const apkgAccountIdRef = React.useRef<string | null>(null);
  const importCloudTasksRef = React.useRef(new Set<ImportCloudSyncTask>());
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
  const handleBeforeSettingsNavigation = React.useCallback((request: AppNavigationRequest) => {
    if (!settingsDraftGuardRef.current) return false;
    setPendingSettingsNavigation({ run: request.proceed });
    return true;
  }, []);
  const {
    activeView,
    studyRequest,
    focusedDeckId,
    selectedCardId,
    deckCreationParentId,
    creationMethod,
    creationDeckId,
    completedDeckId,
    completedCount,
    completionKind,
    settingsTarget,
    settingsReturnContext,
    cardEditorReturnContext,
    navigateToRoute,
    navigateToView: navigateToViewNow,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
  } = useAppNavigation({ authPhase, defaultViewId: menu.defaultViewId, onBeforeNavigation: handleBeforeSettingsNavigation });
  React.useEffect(() => {
    let active = true;
    if (!cloudUser || !supabase) {
      setMediaStore(null);
      return () => { active = false; };
    }
    void import("./mediaStore.ts").then(({ createAccountMediaStore }) => {
      if (!active) return;
      setMediaStore(createAccountMediaStore({ client: supabase, supabaseUrl, userId: cloudUser.id }));
    }).catch(() => { if (active) setMediaStore(null); });
    return () => { active = false; };
  }, [cloudUser, supabase, supabaseUrl]);

  const setApkgImportSession = React.useCallback((update: React.SetStateAction<ApkgImportSession>) => {
    setApkgImportSessionState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      apkgImportSessionRef.current = next;
      return next;
    });
  }, []);

  const resetApkgImportSession = React.useCallback((disposeWorker = true) => {
    const current = apkgImportSessionRef.current;
    if (disposeWorker && !current.isParsing) disposeApkgImportPreview(current);
    setApkgImportSession(createEmptyApkgImportSession(current.version + 1));
  }, [setApkgImportSession]);

  const isApkgImportSessionCurrent = React.useCallback(
    (version: number) => apkgImportSessionRef.current.version === version,
    [],
  );

  React.useEffect(() => {
    const accountId = cloudUser?.id ?? null;
    if (apkgAccountIdRef.current === accountId) return;
    disposeApkgImportPreview(apkgImportSessionRef.current);
    importCloudTasksRef.current.clear();
    apkgAccountIdRef.current = accountId;
    resetApkgImportSession(false);
  }, [cloudUser?.id, resetApkgImportSession]);

  React.useEffect(() => {
    if (syncStatus.status !== "saved") return;
    for (const task of importCloudTasksRef.current) {
      if (task.status === "local-pending") void task.retry();
    }
  }, [syncStatus]);
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
    if (activeView === "neue-karten" && creationDraftDirtyRef.current) {
      setPendingNavigation({ source: "creation", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    if (activeView === "kartenstapel" && cardDraftGuardRef.current) {
      setPendingNavigation({ source: "card", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    return navigateToViewNow(...args);
  }, [activeView, navigateToViewNow]);

  const handleCreationDraftStateChange = React.useCallback((dirty: boolean, focusDraft: (() => void) | null) => {
    creationDraftDirtyRef.current = dirty;
    creationDraftFocusRef.current = focusDraft;
  }, []);

  const handleCardDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
  }, []);

  const handleSettingsDraftStateChange = React.useCallback((guard: SettingsDraftGuard | null) => {
    settingsDraftGuardRef.current = guard;
    setSettingsDraftOpen(Boolean(guard));
  }, []);

  const requestSettingsContextAction = React.useCallback((action: () => void) => {
    if (settingsDraftGuardRef.current) {
      setPendingSettingsNavigation({ run: action });
      return;
    }
    action();
  }, []);

  function continueAfterSettingsDecision(navigation = pendingSettingsNavigation) {
    setPendingSettingsNavigation(null);
    navigation?.run();
  }

  async function saveSettingsDraft() {
    const guard = settingsDraftGuardRef.current;
    const navigation = pendingSettingsNavigation;
    if (!guard) {
      continueAfterSettingsDecision(navigation);
      return;
    }
    setSavingSettingsDraft(true);
    try {
      if (!await guard.save()) return;
      settingsDraftGuardRef.current = null;
      setSettingsDraftOpen(false);
      continueAfterSettingsDecision(navigation);
    } finally {
      setSavingSettingsDraft(false);
    }
  }

  function discardSettingsDraft() {
    const navigation = pendingSettingsNavigation;
    settingsDraftGuardRef.current?.discard();
    settingsDraftGuardRef.current = null;
    setSettingsDraftOpen(false);
    continueAfterSettingsDecision(navigation);
  }

  React.useEffect(() => {
    if (!settingsDraftOpen) return undefined;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDraftOpen]);

  const pendingCardNavigation = pendingNavigation?.source === "card";

  function runPendingNavigation() {
    const navigation = pendingNavigation;
    setPendingNavigation(null);
    navigation?.run();
  }

  async function confirmPendingNavigation() {
    if (!pendingCardNavigation) {
      creationDraftDirtyRef.current = false;
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

  function setAppState(nextState: WorkspaceState | null, { preserveCardPages = false }: StateRefreshOptions = {}) {
    latestStateRef.current = nextState;
    setState(nextState);
    if (preserveCardPages) return;
    cardPageRequestRef.current.clear();
    setCardPages({});
  }

  const requestCardPage = React.useCallback(async (request: DecksCardPageRequest) => {
    if (!workspaceRepository) return;
    const runId = bootRunRef.current;
    const requestKey = JSON.stringify(request);
    cardPageRequestRef.current.set(request.deckId, requestKey);
    const page = await workspaceRepository.listCardPage(request.deckId, request);
    if (bootRunRef.current !== runId || cardPageRequestRef.current.get(request.deckId) !== requestKey) return;
    const definitionIds = [page.selectedCard, ...page.items].flatMap((card) => card?.noteTypeDefinitionId ? [card.noteTypeDefinitionId] : []);
    const definitions = await workspaceRepository.loadNoteTypeDefinitions(definitionIds);
    if (bootRunRef.current !== runId || cardPageRequestRef.current.get(request.deckId) !== requestKey) return;
    setVisibleDefinitions((current) => [...new Map([...current, ...definitions].map((definition) => [definition.id, definition])).values()]);
    setCardPages((current) => ({
      ...current,
      [request.deckId]: { ...page, deckId: request.deckId, query: request.query, sort: request.sort },
    }));
  }, [workspaceRepository]);

  const queryStatistics = React.useCallback(
    ({ period, deckIds }: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => {
      if (!workspaceRepository) throw new Error("Die lokale Statistik ist noch nicht bereit.");
      return workspaceRepository.queryStatistics({ period, deckIds, now: learningNow, timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
    },
    [globalSchedulerPreferences.dayStartHour, learningNow, learningTimeZone, workspaceRepository],
  );

  React.useEffect(() => {
    if (!workspaceRepository || !state) return;
    let active = true;
    void workspaceRepository.listDeckSummaries({
      now: learningNow,
      dayStartHour: globalSchedulerPreferences.dayStartHour,
      learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
      timeZone: learningTimeZone,
    }).then((result) => {
      if (!active) return;
      setDeckSummaries(result.summaries);
      setStudyHeatmap(result.studyHeatmap);
    });
    return () => { active = false; };
  }, [globalSchedulerPreferences.dayStartHour, globalSchedulerPreferences.learnAheadMinutes, learningNow, learningTimeZone, state?.updatedAt, workspaceRepository]);

  const loadStudyPreparation = React.useCallback(async (
    deckId: string,
    variantSession: boolean,
    cursorByDeck: Record<string, { dueAt: string; id: string }> = {},
  ) => {
    const shellState = latestStateRef.current;
    if (!workspaceRepository || !shellState) return null;
    const scopeIds = new Set<string>([deckId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const deck of shellState.decks) {
        if (deck.parentDeckId && scopeIds.has(deck.parentDeckId) && !scopeIds.has(deck.id)) {
          scopeIds.add(deck.id);
          changed = true;
        }
      }
    }
    const ids = [...scopeIds];
    let nextCursorByDeck = cursorByDeck;
    let loadedMissingVariants = false;
    let waitedForInitialCloudSync = false;
    while (true) {
      const session = await workspaceRepository.loadReviewSession(ids, {
        now: learningNow,
        dayStartHour: globalSchedulerPreferences.dayStartHour,
        timeZone: learningTimeZone,
        limit: 50,
        cursorByDeck: nextCursorByDeck,
      });
      const cardsWithoutVariants = session.cards.filter(({ item }) => item.variants.length === 0);
      if (!loadedMissingVariants && cardsWithoutVariants.length > 0 && supabase && cloudUser) {
        loadedMissingVariants = true;
        const { loadAccountCardVariants } = await import("./cloudRepository.ts");
        const variants = await loadAccountCardVariants(supabase, {
          userId: cloudUser.id,
          cardIds: cardsWithoutVariants.map(({ item }) => item.id),
        });
        if (variants.length > 0) {
          await workspaceRepository.applyCloudPage({ table: "card_variants", entities: variants, reset: false });
          continue;
        }
      }
      const initialCloudSync = initialCloudSyncRef.current;
      if (!waitedForInitialCloudSync && initialCloudSync && cardsWithoutVariants.length > 0) {
        waitedForInitialCloudSync = true;
        await initialCloudSync;
        continue;
      }
      const cardsByDeck = new Map<string, LearningItem[]>();
      for (const { deckId: cardDeckId, item } of session.cards) {
        const bucket = cardsByDeck.get(cardDeckId);
        if (bucket) bucket.push(item);
        else cardsByDeck.set(cardDeckId, [item]);
      }
      const eventsByDeck = new Map<string, typeof session.reviewEvents>();
      for (const event of session.reviewEvents) {
        const bucket = eventsByDeck.get(event.deckId);
        if (bucket) bucket.push(event);
        else eventsByDeck.set(event.deckId, [event]);
      }
      const decks = ids.flatMap((id) => {
        const summary = shellState.decks.find((deck) => deck.id === id);
        if (!summary) return [];
        return [{ ...summary, cards: cardsByDeck.get(id) ?? [], reviewEvents: eventsByDeck.get(id) ?? [] } as Deck];
      });
      const queue = createDailyReviewQueue(decks, {
        deckId,
        now: learningNow,
        dayStartHour: globalSchedulerPreferences.dayStartHour,
        learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
        timeZone: learningTimeZone,
        variantSession,
      });
      const cursorAdvanced = Object.entries(session.cursorByDeck).some(([candidateDeckId, cursor]) => {
        const previous = nextCursorByDeck[candidateDeckId];
        return !previous || previous.dueAt !== cursor.dueAt || previous.id !== cursor.id;
      });
      if (queue.total > 0 || !session.hasMore || !cursorAdvanced) {
        const definitionIds = decks.flatMap((candidate) => candidate.cards.map((card) => card.noteTypeDefinitionId));
        return {
          decks,
          definitions: await workspaceRepository.loadNoteTypeDefinitions(definitionIds),
          queue,
          cursorByDeck: session.cursorByDeck,
          hasMoreCards: session.hasMore && cursorAdvanced,
        };
      }
      nextCursorByDeck = session.cursorByDeck;
    }
  }, [cloudUser, globalSchedulerPreferences.dayStartHour, globalSchedulerPreferences.learnAheadMinutes, learningNow, learningTimeZone, supabase, workspaceRepository]);

  React.useEffect(() => {
    if (!workspaceRepository || !state || !studyRequest) {
      setStudyDecks(null);
      setStudyHasMoreCards(false);
      studyQueueCursorRef.current = {};
      preparedStudyKeyRef.current = "";
      return;
    }
    const preparationKey = `${studyRequest.deckId}:${studyRequest.variantSession ? "variants" : "standard"}`;
    if (preparedStudyKeyRef.current === preparationKey && studyDecks) return;
    let active = true;
    void loadStudyPreparation(studyRequest.deckId, studyRequest.variantSession).then((preparation) => {
      if (!active || !preparation) return;
      studyQueueCursorRef.current = preparation.cursorByDeck;
      setStudyHasMoreCards(preparation.hasMoreCards);
      if (!preparation.decks.some((deck) => deck.id === studyRequest.deckId)) {
        setStudyDecks(preparation.decks);
        setStudyDefinitions(preparation.definitions);
        return;
      }
      if (preparation.queue.total === 0) {
        setEmptyStudyStart(createEmptyStudyStart(studyRequest.deckId, preparation.queue, studyRequest.returnContext));
        setStudyDecks(null);
        navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
        return;
      }
      preparedStudyKeyRef.current = preparationKey;
      studyQueueCursorRef.current = preparation.cursorByDeck;
      setStudyHasMoreCards(preparation.hasMoreCards);
      setStudyDecks(preparation.decks);
      setStudyDefinitions(preparation.definitions);
    });
    return () => { active = false; };
  }, [loadStudyPreparation, navigateToRoute, state, studyDecks, studyRequest, workspaceRepository]);

  const loadMoreStudyCards = React.useCallback(async () => {
    if (!studyRequest) return [];
    const preparation = await loadStudyPreparation(
      studyRequest.deckId,
      studyRequest.variantSession,
      studyQueueCursorRef.current,
    );
    if (!preparation) return [];
    studyQueueCursorRef.current = preparation.cursorByDeck;
    setStudyHasMoreCards(preparation.hasMoreCards);
    setStudyDefinitions((current) => {
      const byId = new Map(current.map((definition) => [definition.id, definition]));
      for (const definition of preparation.definitions) byId.set(definition.id, definition);
      return [...byId.values()];
    });
    setStudyDecks((current) => current?.map((currentDeck) => {
      const page = preparation.decks.find((candidate) => candidate.id === currentDeck.id);
      if (!page) return currentDeck;
      const cards = new Map(currentDeck.cards.map((card) => [card.id, card]));
      for (const card of page.cards) cards.set(card.id, card);
      const events = new Map(currentDeck.reviewEvents.map((event) => [event.id, event]));
      for (const event of page.reviewEvents) events.set(event.id, event);
      return { ...currentDeck, cards: [...cards.values()], reviewEvents: [...events.values()] };
    }) ?? current);
    return preparation.decks;
  }, [loadStudyPreparation, studyRequest]);

  async function bootAuthenticatedUser(user: User) {
    const runId = bootRunRef.current + 1;
    bootRunRef.current = runId;
    setAuthPhase("loading-cloud");
    setAuthMessage("");
    setMigrationMessage("");

    if (!supabase) throw new Error("Supabase ist für diese Umgebung nicht konfiguriert.");
    const boot = await bootAuthenticatedWorkspace(supabase, user);
    initialCloudSyncRef.current = boot.cloudSync;

    if (bootRunRef.current !== runId) return;

    setWorkspaceRepository(boot.repository);
    setCardPages({});
    setSyncEngine(null);
    lastAcknowledgedStateRef.current = boot.state;
    setAppState(boot.state);
    setCloudUser(user);
    setSyncStatus(boot.pendingCount > 0 ? createSyncPendingStatus(boot.pendingCount) : createSyncSavingStatus());
    markWorkspaceLocalReady();

    if (boot.legacyState) {
      setLegacyState(boot.legacyState);
      setAuthPhase("migration-choice");
    } else {
      setLegacyState(null);
      setAuthPhase("ready");
    }

    void boot.cloudBootstrap.then((bootstrap) => {
      if (bootRunRef.current !== runId) return;
      lastAcknowledgedStateRef.current = bootstrap.state;
      setAppState(bootstrap.state, { preserveCardPages: true });
      setSyncStatus(bootstrap.conflictCount > 0 ? createSyncConflictStatus(bootstrap.conflictCount) : createSyncSavingStatus());
      markCloudBootstrapReady();
    }).catch(() => {});

    void boot.cloudSync.then((cloud) => {
      if (bootRunRef.current !== runId) return;
      setSyncEngine(cloud.syncEngine);
      lastAcknowledgedStateRef.current = cloud.state;
      setAppState(cloud.state, { preserveCardPages: true });
      setSyncStatus(
        cloud.conflictCount > 0
          ? createSyncConflictStatus(cloud.conflictCount)
          : cloud.pendingCount > 0
            ? createSyncPendingStatus(cloud.pendingCount)
            : createSyncSavedStatus("Cloud aktuell."),
      );
      markCloudSyncReady();
    }).catch((error) => {
      if (bootRunRef.current !== runId) return;
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Cloud-Abgleich wird später erneut versucht.")));
    }).finally(() => {
      if (initialCloudSyncRef.current === boot.cloudSync) initialCloudSyncRef.current = null;
    });
  }

  React.useEffect(() => {
    if (supabase === undefined) return undefined;
    const recoverPassword = (user: User) => {
      bootRunRef.current += 1;
      setCloudUser(user);
      setWorkspaceRepository(null);
      setCardPages({});
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
      syncIntervalMinutes: state?.profile.uiPreferences.syncIntervalMinutes ?? 5,
      onStatus: setSyncStatus,
      onSynced() {
        if (!workspaceRepository) return;
        setAppState(workspaceRepository.getShellState(), { preserveCardPages: true });
      },
    });
  }, [authPhase, state?.profile.uiPreferences.syncIntervalMinutes, syncEngine, workspaceRepository]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !workspaceRepository || !featurePreloadingAllowed) return undefined;
    return startAdaptiveFeaturePreloading({ preload: preloadAppView });
  }, [authPhase, featurePreloadingAllowed, workspaceRepository]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !workspaceRepository) return;
    let active = true;
    void requestPersistentWorkspaceStorage().then((status) => { if (active) setStorageStatus(status); });
    return () => { active = false; };
  }, [authPhase, workspaceRepository]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !mediaStore || !syncEngine || !workspaceRepository) return undefined;
    return startAppMediaRetryLifecycle({
      mediaStore,
      getState: () => latestStateRef.current,
      ensureCloudParents: async () => { await syncNow(); },
      persistMediaDecks: (decks) => persistImportedDecks(decks, { mediaOnly: true }),
    });
  }, [authPhase, mediaStore, syncEngine, workspaceRepository]);

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
    if (!workspaceRepository || !state || !cloudUser || !legacyState) return;
    setAuthBusy(true);
    setMigrationMessage("");
    try {
      const { replaceAccountCloudState } = await import("./cloudRepository.ts");
      const nextState = mergePortableExportIntoState(state, createPortableExport(legacyState));
      const savedState = workspaceRepository.replaceFullState(nextState);
      setAppState(savedState);
      const result = await replaceAccountCloudState(supabase, savedState, { deviceId: createBrowserSyncDevice().id });
      const acknowledgedState = workspaceRepository.replaceFullState(result.state);
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
    if (!syncEngine) return;
    try {
      const result = await syncEngine.syncNow();
      if (workspaceRepository) setAppState(workspaceRepository.getShellState());
      return result;
    } catch (error) {
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      throw error;
    }
  }

  const listSyncConflicts = React.useCallback(async (options: { refreshRemote?: boolean } = {}) => {
    return syncEngine ? syncEngine.listConflicts(options) : [];
  }, [syncEngine]);

  async function resolveSyncConflict(conflictId: string, decision: Record<string, unknown>) {
    if (!syncEngine || !workspaceRepository) throw new Error("Synchronisierung ist noch nicht bereit.");
    try {
      const result = await syncEngine.resolveConflict(conflictId, decision);
      setAppState(workspaceRepository.getShellState());
      return result;
    } catch (error) {
      if (workspaceRepository) setAppState(workspaceRepository.getShellState());
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
    disposeApkgImportPreview(apkgImportSessionRef.current);
    importCloudTasksRef.current.clear();
    resetApkgImportSession(false);
    setWorkspaceRepository(null);
    setCardPages({});
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

  function refresh(options?: StateRefreshOptions) {
    if (!workspaceRepository) return null;
    const nextState = workspaceRepository.getShellState();
    setAppState(nextState, options);
    return nextState;
  }

  function runRepositoryMutation<T>(mutation: (repository: IndexedDbCoreRepository) => T, refreshOptions?: StateRefreshOptions): T | null {
    if (!workspaceRepository) return null;
    const result = mutation(workspaceRepository);
    refresh(refreshOptions);
    syncEngine?.requestSync();
    return result;
  }

  async function persistImportedDecks(decks: Deck[], { mediaOnly = false, commitGraph }: { mediaOnly?: boolean; commitGraph?: ImportCommitGraph } = {}) {
    if (!workspaceRepository || !syncEngine) throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    const nextDecks = decks;
    if (mediaOnly) {
      workspaceRepository.saveDeckMetadata(nextDecks);
      refresh();
      return { decks: nextDecks, cloudTask: createTrackedImportCloudTask() };
    }
    let importedDecks: Array<{ id: string }>;
    if (commitGraph) {
      importedDecks = await workspaceRepository.commitImportGraph(commitGraph.kind === "worker-import" ? commitGraph : { ...commitGraph, decks: nextDecks });
    } else {
      importedDecks = await workspaceRepository.commitImportGraph({
        decks: nextDecks,
        noteTypeDefinitions: [],
        sourceSnapshots: [],
      });
    }
    const verificationScope = commitGraph?.kind === "worker-import"
      ? await workspaceRepository.createImportVerificationScope(importedDecks.map((deck) => deck.id))
      : null;
    const nextState = refresh();
    const importedIds = new Set(importedDecks.map((deck) => deck.id));
    return {
      decks: nextState?.decks.filter((deck) => importedIds.has(deck.id)) ?? nextDecks,
      cloudTask: createTrackedImportCloudTask(verificationScope),
    };

    function createTrackedImportCloudTask(verificationScope: ImportVerificationScope | null = null) {
      const task = createImportCloudSyncTask(async () => {
        await workspaceRepository!.flush();
        const result = await syncEngine!.flush({ force: true });
        if (result?.paused) {
          return { status: "blocked", message: "Die Karten sind lokal gespeichert. Ein Cloud-Konflikt verhindert den Abschluss der Synchronisierung." };
        }
        if (result?.deferred || syncEngine!.pendingCount() > 0) {
          return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus." };
        }
        if (verificationScope) {
          const { ImportGraphVerificationError, verifyAccountImportGraph } = await import("./cloudRepository.ts");
          try {
            await verifyAccountImportGraph(supabase, verificationScope);
          } catch (error) {
            const status = Number((error as { status?: unknown })?.status ?? 0);
            const retryable = error instanceof ImportGraphVerificationError
              || status >= 500
              || /network|fetch|offline|timeout/i.test(String((error as Error)?.message ?? error));
            if (!retryable) throw error;
            if (error instanceof ImportGraphVerificationError) {
              await workspaceRepository!.requeueImportVerificationScope(verificationScope, error.repairScope);
            }
            return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die vollständige Cloud-Bestätigung steht noch aus." };
          }
        }
        return { status: "cloud-ready", message: "Karten, Wiederholungen und Quell-Snapshots sind in der Cloud bestätigt." };
      });
      importCloudTasksRef.current.add(task);
      const unsubscribe = task.subscribe((result) => {
        if (result.status !== "cloud-ready" && result.status !== "blocked") return;
        importCloudTasksRef.current.delete(task);
        unsubscribe();
      });
      void task.retry();
      return task;
    }
  }

  function recordReview(result: ReviewAnswerResult) {
    if (!workspaceRepository) return;
    workspaceRepository.recordReview(result);
    syncEngine?.requestSync();
  }

  function createDeck(input: CreateDeckInput = {}) {
    const created = state ? createWorkspaceDeck(state.decks, input) : null;
    const saved = created ? runRepositoryMutation((repository) => repository.saveDeckMetadata([created])[0] ?? null) : null;
    if (!saved) return null;
    navigateToViewNow("lernen", { focusedDeckId: saved.id }, { replace: true });
    return saved;
  }

  function updateDeck(deckId: string, updater: (deck: Deck) => Deck) {
    if (!state) return null;
    const deck = latestStateRef.current?.decks.find((candidate) => candidate.id === deckId);
    return deck ? runRepositoryMutation((repository) => repository.saveDeckMetadata([updater(deck)])[0] ?? null) : null;
  }

  async function deleteDeck(deckId: string) {
    if (!workspaceRepository) return null;
    const result = await workspaceRepository.deleteDeckTree(deckId);
    if (!result) return null;
    refresh();
    syncEngine?.requestSync();
    return result;
  }

  function moveDeck(deckId: string, parentDeckId: string | null = null) {
    if (!state) return null;
    const result = updateDeckTreePlacement(state, { deckId, parentDeckId, changeType: "deck_moved", reason: parentDeckId ? "Stapel als Unterstapel verschoben" : "Stapel auf Hauptebene verschoben" });
    if (!result) return null;
    if (result.ok && result.updatedDecks.length) runRepositoryMutation((repository) => repository.saveDeckMetadata(result.updatedDecks));
    return result;
  }

  function setDeckCoreMode(deckId: string, coreMode: CoreMode) {
    return runRepositoryMutation((repository) => repository.updateDeckSettings(deckId, { coreMode }));
  }

  function saveDeckLearningSettings(
    deckId: string,
    settings: LearningSettingsInput = {},
  ) {
    return updateDeck(deckId, (deck) => withDeckLearningSettings(deck, settings));
  }

  function saveDeckSettings(deckId: string, input: DeckSettingsDraft) {
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    const draft = normalizeDeckSettingsDraft(input);
    const placement = updateDeckTreePlacement(currentState, {
      deckId,
      name: draft.name,
      changeType: "deck_settings_saved",
      reason: "Stapeleinstellungen gespeichert",
    });
    if (!placement.ok || !placement.deck) return placement;

    const rootDeck = withDeckLearningSettings(placement.deck, draft.learning);
    const updatedRoot = {
      ...rootDeck,
      deckSettings: createDefaultDeckSettings({
        ...rootDeck.deckSettings,
        appearance: draft.appearance,
      }),
    };
    const updatedDecks = (placement.updatedDecks.length ? placement.updatedDecks : [placement.deck])
      .map((candidate) => candidate.id === deckId ? updatedRoot : candidate);
    const savedDecks = runRepositoryMutation((repository) => repository.saveDeckMetadata(updatedDecks), { preserveCardPages: true });
    const savedDeck = savedDecks?.find((candidate) => candidate.id === deckId) ?? null;
    return {
      ...placement,
      ok: Boolean(savedDeck),
      error: savedDeck ? null : "Die Stapeleinstellungen konnten nicht gespeichert werden.",
      deck: savedDeck,
      updatedDecks: savedDecks ?? [],
      changedDeckIds: [...new Set([...placement.changedDeckIds, deckId])],
    };
  }

  function setCardStudyState(deckId: string, cardId: string, patch: LearningItemStudyStatePatch) {
    return runCardCommand(deckId, workspaceRepository?.updateCard(deckId, cardId, (card) => updateLearningItemStudyState(card, patch, new Date().toISOString())) ?? Promise.resolve(null));
  }

  function setStudyCardStudyState(deckId: string, cardId: string, patch: LearningItemStudyStatePatch) {
    const deck = studyDecks?.find((candidate) => candidate.id === deckId);
    if (!deck) return null;
    const updatedAt = new Date().toISOString();
    const updated = { ...deck, updatedAt, cards: deck.cards.map((card) => card.id === cardId ? updateLearningItemStudyState(card, patch, updatedAt) : card) };
    setStudyDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    void setCardStudyState(deckId, cardId, patch);
    return updated;
  }

  function setStudyDeckReviewOrder(deckId: string, newReviewOrder: NewReviewOrder) {
    const deck = studyDecks?.find((candidate) => candidate.id === deckId);
    if (!deck) return null;
    const nextDeckSettings = {
      ...deck.deckSettings,
      ...markLearningSettingsCustom({ ...deck.deckSettings, newReviewOrder }),
      learningProfileSource: null,
    };
    const updated = {
      ...deck,
      updatedAt: new Date().toISOString(),
      deckSettings: nextDeckSettings,
    };
    setStudyDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    runRepositoryMutation((repository) => repository.updateDeckSettings(deckId, nextDeckSettings), { preserveCardPages: true });
    return updated;
  }

  function saveLearningProfiles(learningProfiles: LearningProfileTemplate[]) {
    if (!state) return null;
    return runRepositoryMutation((repository) => repository.saveProfile(withGlobalSchedulerPreferences(state.profile, { learningProfiles })));
  }

  async function runCardCommand(deckId: string, command: Promise<LearningItem | null>, refreshPage = false) {
    if (!workspaceRepository) throw new Error("Die lokale Kartenablage ist noch nicht bereit.");
    const card = await command;
    if (!card) return null;
    refresh();
    if (refreshPage) setCardPages((current) => ({ ...current, [deckId]: undefined }));
    syncEngine?.requestSync();
    return card;
  }

  async function runCardDeletion(deckId: string, cardId: string) {
    if (!workspaceRepository) throw new Error("Die lokale Kartenablage ist noch nicht bereit.");
    const deleted = await workspaceRepository.updateCard(
      deckId,
      cardId,
      (current) => softDeleteCard(current, new Date().toISOString()),
    );
    if (!deleted) return null;
    refresh();
    setCardPages((pages) => ({ ...pages, [deckId]: undefined }));
    syncEngine?.requestSync();
    return deleted;
  }

  async function saveDeckCard(deckId: string, cardId: string, value: CardEditorValue) {
    if (!workspaceRepository) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const card = await workspaceRepository.loadCard(cardId);
    if (!card) return null;
    const [definition] = await workspaceRepository.loadNoteTypeDefinitions([card.noteTypeDefinitionId]);
    return runCardCommand(deckId, workspaceRepository.updateCard(deckId, cardId, (current) => saveCardEditorValue(current, value, definition)));
  }

  async function saveDeckCardDocument(
    deckId: string,
    cardId: string,
    value: CardDocumentValue,
  ) {
    if (!workspaceRepository) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const current = await workspaceRepository.loadCard(cardId);
    if (!current) return null;
    const [definition] = await workspaceRepository.loadNoteTypeDefinitions([current.noteTypeDefinitionId]);
    if (!definition) throw new Error("Die Notetype-Definition der Karte fehlt.");
    return runCardCommand(deckId, workspaceRepository.updateCard(deckId, cardId, (card) => saveLearningItemDocumentValues({ previous: card, definition, ...value }).item));
  }

  async function deleteDeckCard(deckId: string, cardId: string) {
    return runCardDeletion(deckId, cardId);
  }

  async function duplicateDeckCard(deckId: string, cardId: string) {
    if (!workspaceRepository) return null;
    const source = await workspaceRepository.loadCard(cardId);
    const copy = source ? duplicateLearningItemContent(source) : null;
    return copy ? runCardCommand(deckId, workspaceRepository.insertCard(deckId, copy), true) : null;
  }

  function undoDeleteDeckCard(deckId: string, deletedCard: LearningItem) {
    const tombstone = workspaceRepository?.getCloudTombstones().find((candidate) => candidate.entityTable === "cards" && candidate.entityId === deletedCard.id);
    const restored = restoreSoftDeletedCard({ ...deletedCard, revision: tombstone?.revision ?? deletedCard.revision, updatedByDeviceId: tombstone?.updatedByDeviceId ?? deletedCard.updatedByDeviceId }, new Date().toISOString());
    workspaceRepository?.removeCloudTombstone("cards", restored.id);
    return runCardCommand(deckId, workspaceRepository?.insertCard(deckId, restored) ?? Promise.resolve(null), true);
  }

  async function restoreDeckCard(deckId: string, cardId: string, versionId: string) {
    if (!workspaceRepository) return null;
    const card = await workspaceRepository.loadCard(cardId);
    if (!card) return null;
    const [definition] = await workspaceRepository.loadNoteTypeDefinitions([card.noteTypeDefinitionId]);
    return runCardCommand(deckId, workspaceRepository.updateCard(deckId, cardId, (current) => restoreCardVersion(current, versionId, definition)));
  }

  function addDeckCardVariant(deckId: string, cardId: string, variant: CardVariantInput) {
    return runCardCommand(deckId, workspaceRepository?.updateCard(deckId, cardId, (card) => addRephrasedVariant(card, variant.front, variant.back, {
      ...variant,
      generationSource: variant.generationSource ?? "user_edited",
      meta: { source: "deck-card-editor", ...(variant.meta ?? {}) },
    })) ?? Promise.resolve(null));
  }

  async function generateDeckCardVariant(deckId: string, cardId: string) {
    if (!workspaceRepository) throw new AiCardVariantContractError("workspace_unavailable", "Die Kartenverwaltung ist noch nicht bereit.");
    const sourceCard = await workspaceRepository.loadCard(cardId);
    const sourcePayload = sourceCard ? getCardContentPayload(sourceCard) : null;
    if (!sourcePayload) throw new AiCardVariantContractError("card_not_found", "Die Ausgangskarte ist nicht mehr verfügbar.");
    const generated = await requestAiCardVariant(sourcePayload, supabase ?? null);

    const currentCard = await workspaceRepository.loadCard(cardId);
    const draft = createAiGeneratedVariantDraft(sourcePayload, currentCard, generated);
    const saved = await addDeckCardVariant(deckId, cardId, { ...draft, meta: { ...draft.meta, reason: "KI-Umformulierung" } });
    if (!saved) throw new AiCardVariantContractError("save_failed", "Die KI-Variante konnte nicht gespeichert werden.");
    return generated;
  }

  async function completeCreatedDeck(deck: Deck) {
    await persistImportedDecks([deck]);
    return state?.decks.find((candidate) => candidate.id === deck.id) ?? deck;
  }

  async function completeManualCard(deckId: string, manualDeckInput: ManualCardInput) {
    if (!workspaceRepository) return null;
    const manualDeck = createManualCoreDeck(manualDeckInput);
    const card = manualDeck.cards[0];
    const summary = state?.decks.find((deck) => deck.id === deckId);
    if (!card || !summary) return null;
    const saved = await runCardCommand(deckId, workspaceRepository.insertCard(deckId, card, manualDeck.sourceDocuments ?? []), true);
    return saved ? { ...summary, cards: [saved], reviewEvents: [], sourceDocuments: manualDeck.sourceDocuments ?? [], updatedAt: saved.updatedAt } : null;
  }

  async function createDemo() {
    const decks = createWorldCapitalsSeedDecks().map((deck) => ({ ...deck, reviewEvents: [] }));
    await persistImportedDecks(decks);
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

  function saveGlobalSettings(draft: GlobalSettingsDraft) {
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    const syncIntervalChanged = currentState.profile.uiPreferences.syncIntervalMinutes !== draft.syncIntervalMinutes;
    const profile = withGlobalSchedulerPreferences({
      ...currentState.profile,
      displayName: draft.displayName,
      uiPreferences: {
        ...currentState.profile.uiPreferences,
        syncIntervalMinutes: draft.syncIntervalMinutes,
      },
    }, {
      dayStartHour: draft.dayStartHour,
      learnAheadMinutes: draft.learnAheadMinutes,
      easyDays: draft.easyDays,
    });
    const saved = runRepositoryMutation((repository) => repository.saveProfile(profile));
    if (saved && syncIntervalChanged) void syncNow().catch(() => undefined);
    return saved;
  }

  function saveDeckExpansion(surface: DeckExpansionSurface, deckId: string, expanded: boolean) {
    if (!workspaceRepository || !state) return null;
    const profile = state.profile;
    return runRepositoryMutation((repository) => repository.saveProfile({
      uiPreferences: setDeckExpanded(profile.uiPreferences, surface, deckId, expanded),
    }), { preserveCardPages: true });
  }

  async function createPortableExportText() {
    if (!workspaceRepository) throw new Error("Der Export ist noch nicht bereit.");
    return stringifyPortableExport(await workspaceRepository.materializeFullState());
  }

  async function importPortableExport(value: string) {
    if (!workspaceRepository || !syncEngine || !supabase) throw new Error("Der Import ist noch nicht bereit.");
    const current = await workspaceRepository.materializeFullState();
    const nextState = mergePortableExportIntoState(current, value);
    workspaceRepository.replaceFullState(nextState);
    await workspaceRepository.flush();
    const { replaceAccountCloudState } = await import("./cloudRepository.ts");
    const result = await replaceAccountCloudState(supabase, nextState, { deviceId: createBrowserSyncDevice().id });
    workspaceRepository.replaceFullState(result.state, workspaceRepository.getCloudDeltaCursors());
    await workspaceRepository.flush();
    refresh();
    return syncEngine.syncNow();
  }

  async function prepareDeckStart(deck: { id: string; }, variantSession = false) {
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
    const returnContext = createReviewReturnContext(returnRoute, deck.id);
    const preparationKey = `${deck.id}:${variantSession ? "variants" : "standard"}`;
    if (preparingStudyKeyRef.current === preparationKey) return;
    preparingStudyKeyRef.current = preparationKey;
    try {
      const preparation = await loadStudyPreparation(deck.id, variantSession);
      if (preparingStudyKeyRef.current !== preparationKey) return;
      if (!preparation || !preparation.decks.some((candidate) => candidate.id === deck.id)) return;
      if (preparation.queue.total === 0) {
        setEmptyStudyStart(createEmptyStudyStart(deck.id, preparation.queue, returnContext));
        return;
      }
      preparedStudyKeyRef.current = preparationKey;
      setStudyDecks(preparation.decks);
      setStudyDefinitions(preparation.definitions);
      navigateToRoute(createStudyRoute(deck.id, { variantSession, returnContext }), {
        replace: currentRoute.viewId === "stapel-einstellungen",
      });
    } finally {
      if (preparingStudyKeyRef.current === preparationKey) preparingStudyKeyRef.current = "";
    }
  }

  function startDeck(deck: { id: string; }, variantSession = false) {
    void prepareDeckStart(deck, variantSession);
  }

  function startAdditionalCards(deckId: string, requestedCount: number): { ok: boolean; message?: string } {
    if (!workspaceRepository) return { ok: false, message: "Die zusätzlichen Karten konnten nicht vorbereitet werden." };
    const currentState = state!;
    const currentPreferences = getGlobalSchedulerPreferences(currentState.profile);
    const currentTimeZone = currentState.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const currentPlan = createDeckLibraryModel(currentState.decks, {
      now: getLearningNow(),
      dayStartHour: currentPreferences.dayStartHour,
      learnAheadMinutes: currentPreferences.learnAheadMinutes,
      timeZone: currentTimeZone,
      deckSummaries,
    }).dailyLearningPlan;
    const session = currentPlan.sessions.find((candidate) => candidate.deckId === deckId) ?? null;
    const additionalCount = Math.min(
      Math.max(0, Math.floor(Number(requestedCount) || 0)),
      session?.additionalNewCount ?? 0,
    );

    if (currentPlan.status !== "achieved" || !session || additionalCount === 0) {
      return { ok: false, message: "Für diesen Stapel sind keine zusätzlichen neuen Karten verfügbar." };
    }

    const deck = latestStateRef.current?.decks.find((candidate) => candidate.id === deckId);
    const updatedDeck = deck ? updateDeck(deckId, (current) => updateDeckNewCardLimitForDate(
      current,
      Math.max(session.effectiveNewLimit, session.introducedTodayCount) + additionalCount,
      { dateKey: currentPlan.dateKey, updatedAt: new Date().toISOString() },
    )) : null;
    if (!updatedDeck) return { ok: false, message: "Die zusätzlichen Karten konnten nicht gespeichert werden." };

    startDeck(updatedDeck);
    return { ok: true };
  }

  function openDecks(deckId: string | null = null, cardId: string | null = null) {
    navigateToViewNow("kartenstapel", {
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

  function openDeckSettings(deckId: string, returnContext: SettingsReturnContext = { view: "learn" }, target: SettingsTarget | null = null) {
    navigateToView("stapel-einstellungen", {
      focusedDeckId: deckId,
      settingsReturnContext: returnContext,
      ...(target ? { settingsTarget: target } : {}),
    });
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
          deckSummaries={deckSummaries}
          learningProfiles={globalSchedulerPreferences.learningProfiles}
          settingsTarget={settingsTarget}
          onSaveSettings={saveDeckSettings}
          onApplyLearningProfile={(deckId, learning: DeckLearningSettingsDraft) => saveDeckLearningSettings(deckId, learning)}
          onSaveLearningProfiles={saveLearningProfiles}
          onDraftStateChange={handleSettingsDraftStateChange}
          onRequestContextAction={requestSettingsContextAction}
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
          cardPages={workspaceRepository ? cardPages : undefined}
          onRequestCardPage={workspaceRepository ? requestCardPage : undefined}
          noteTypeDefinitions={visibleDefinitions}
          now={learningNow}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          timeZone={learningTimeZone}
          mediaStore={mediaStore}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onSaveCardDocument={saveDeckCardDocument}
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
      const visibleCreationMethod = resolveApkgCreationMethod(creationMethod, apkgImportSession);
      return (
        <CreationScreen
          decks={state.decks}
          mediaStore={mediaStore}
          persistImportedDecks={persistImportedDecks}
          apkgImportSession={apkgImportSession}
          onApkgImportSessionChange={setApkgImportSession}
          isApkgImportSessionCurrent={isApkgImportSessionCurrent}
          onResetApkgImportSession={resetApkgImportSession}
          initialMethod={visibleCreationMethod}
          initialTargetDeckId={creationDeckId}
          completedDeckId={completedDeckId}
          completedCount={completedCount}
          completionKind={completionKind}
          onMethodChange={(method: "manual" | "import" | "") => {
            if (!method && hasVisibleApkgImportSession(apkgImportSessionRef.current)) resetApkgImportSession();
            navigateToView("neue-karten", method ? {
              creationMethod: method,
              creationDeckId: method === "manual" ? creationDeckId || state.decks[0]?.id : null,
            } : {});
          }}
          onTargetDeckChange={(deckId) => navigateToViewNow("neue-karten", {
            creationMethod: "manual",
            creationDeckId: deckId || null,
          })}
          onCreated={completeCreatedDeck}
          onAppendManualCard={completeManualCard}
          onDraftStateChange={handleCreationDraftStateChange}
          onSessionCompleted={(completion) => navigateToViewNow("neue-karten", {
            completedDeckId: completion.deckId,
            completedCount: completion.createdCount,
            completionKind: completion.kind,
          }, { replace: true })}
          onStartDeck={startDeck}
          onReviewDeck={openDecks}
          onOpenDashboard={() => navigateToViewNow("uebersicht")}
        />
      );
    }
    if (activeView === "lernen") {
      return (
        <LearnScreen
          decks={state.decks}
          deckSummaries={deckSummaries}
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
          queryStatistics={queryStatistics}
          now={learningNow}
          timeZone={learningTimeZone}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          onNavigate={navigateToView}
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
          profile={state.profile}
          syncStatus={syncStatus}
          storageStatus={storageStatus}
          globalSchedulerPreferences={globalSchedulerPreferences}
          onSaveSettings={saveGlobalSettings}
          onDraftStateChange={handleSettingsDraftStateChange}
          onCreateExport={createPortableExportText}
          onImportExport={importPortableExport}
          onSyncNow={syncNow}
          onListConflicts={listSyncConflicts}
          onResolveConflict={resolveSyncConflict}
          onSignOut={() => {
            if (!settingsDraftGuardRef.current) return signOut();
            setPendingSettingsNavigation({ run: () => { void signOut(); } });
            return Promise.resolve();
          }}
          onNavigate={navigateToView}
          simulationOffsetMinutes={simulationOffsetMinutes}
          simulationDateLabel={formatSimulationDate(learningNow)}
          pomodoroTimer={pomodoroTimer}
          onStartPomodoro={startPomodoro}
        />
      );
    }
    return <DashboardScreen state={state} deckSummaries={deckSummaries} studyHeatmap={studyHeatmap} now={learningNow} onNavigate={navigateToView} onStartDeck={startDeck} onStartAdditionalCards={startAdditionalCards} onCreateDemo={createDemo} onSetDeckCoreMode={setDeckCoreMode} onMoveDeck={moveDeck} onOpenDeckSettings={(deckId) => openDeckSettings(deckId, { view: "today" })} onSetDeckExpanded={saveDeckExpansion} />;
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

  if (!shouldShowAppShell(authPhase) || !workspaceRepository || !state) {
    return <LoadingScreen />;
  }

  const studyDeck = studyRequest ? studyDecks?.find((deck) => deck.id === studyRequest.deckId) ?? null : null;
  if (studyRequest && !studyDecks) return <LoadingScreen message="Lernsitzung wird vorbereitet." />;
  if (studyRequest && studyDeck) {
    return (
      <React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={studyDecks ?? [studyDeck]}
          noteTypeDefinitions={studyDefinitions}
          deckId={studyDeck.id}
          variantSession={studyRequest.variantSession}
          variantId={studyRequest.variantId}
          mediaStore={mediaStore}
          getNow={getLearningNow}
          learningDayKey={learningDayKey}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          easyDays={globalSchedulerPreferences.easyDays}
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
          onSetCardStudyState={setStudyCardStudyState}
          onSetDeckReviewOrder={setStudyDeckReviewOrder}
          onCardUpdated={(deckId, card) => { void runCardCommand(deckId, workspaceRepository.updateCard(deckId, card.id, () => card)); }}
          onReview={recordReview}
          hasMoreCards={studyHasMoreCards}
          onLoadMoreCards={loadMoreStudyCards}
        />
      </React.Suspense>
    );
  }

  return (
    <main className="min-h-dvh min-w-0 overflow-x-clip bg-core-surface text-[var(--core-text)]">
      <div className="grid min-h-dvh min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-x-clip bg-core-surface xl:h-dvh xl:min-h-0 xl:grid-cols-[9.5rem_minmax(0,1fr)] xl:grid-rows-1 xl:overflow-hidden">
        <AppNavigation
          navigationItems={navigationItems}
          activeView={activeView}
          simulationOffsetMinutes={simulationOffsetMinutes}
          simulationDateLabel={formatSimulationDate(learningNow)}
          pomodoroTimer={pomodoroTimer}
          syncStatus={syncStatus}
          onSyncNow={() => void syncNow()}
          onPreloadView={(viewId) => {
            if (featurePreloadingAllowed && allowsBrowserSpeculativePreloading()) void preloadAppView(viewId);
          }}
          onNavigate={(viewId) => viewId === "lernen" ? openLearn(focusedDeckId) : navigateToView(viewId)}
          onResetSimulation={() => changeSimulationOffset(0)}
        />

        <section ref={screenRegionRef} className="core-screen-region min-w-0 overflow-x-clip px-2.5 pb-32 pt-8 outline-none sm:px-4 lg:px-6 xl:overflow-x-hidden xl:overflow-y-auto xl:py-12" tabIndex={-1} aria-label="Seiteninhalt">
          <React.Suspense fallback={<ScreenLoadingFallback />}>{renderActiveView()}</React.Suspense>
        </section>
      </div>
      <SettingsSaveBar
        open={settingsDraftOpen}
        saving={savingSettingsDraft}
        onDiscard={discardSettingsDraft}
        onSave={() => { void saveSettingsDraft(); }}
      />
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
      <ActionDialog
        open={Boolean(emptyStudyStart)}
        title={emptyStudyStart?.limitReached ? "Tageslimit erreicht" : "Keine fälligen Karten"}
        description={emptyStudyStart ? (
          <div className="grid gap-2">
            <p>
              {emptyStudyStart.limitReached
                ? `Die heute verfügbaren Karten in „${emptyStudyStart.deckName}“ bleiben wegen deiner Tageslimits für später vorgemerkt.`
                : `Dieser Stapel hat für heute keine Karten in der Lern-Queue.`}
            </p>
            {emptyStudyStart.hasAdditionalNewCards ? (
              <p>Möchtest du die Anzahl neuer Karten pro Tag erhöhen?</p>
            ) : null}
          </div>
        ) : null}
        cancelLabel="Schließen"
        confirmLabel={emptyStudyStart?.hasAdditionalNewCards ? "Neue Karten pro Tag anpassen" : undefined}
        actionIcons={emptyStudyStart?.hasAdditionalNewCards ? { confirm: ArrowRight } : undefined}
        onCancel={() => setEmptyStudyStart(null)}
        onConfirm={emptyStudyStart?.hasAdditionalNewCards ? () => {
          const target = emptyStudyStart;
          setEmptyStudyStart(null);
          openDeckSettings(target.deckId, target.returnContext, "new-cards-per-day");
        } : undefined}
      />
    </main>
  );
}
