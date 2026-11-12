import React from "react";
import type { Card, CardStudyStatePatch, CoreMode, ImportVerificationScope, NewReviewOrder, Note, SyncStatus } from "./coreTypes.ts";
import type { ImportCommitGraph, ImportMediaFile } from "./apkgImport.ts";
import { ArrowRight, Database, Layers, Sparkles } from "lucide-react";
import { authPhases, createSyncErrorStatus, createSyncPendingStatus, createSyncSavingStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { requestAiCardHelp } from "./aiCardHelp.ts";
import { createReviewReturnContext, createStudyRoute, createViewRoute, reviewReturnContextToViewRoute, settingsContentSection, settingsSectionGroup, type GeneralSettingsSection, type LearningSettingsSection } from "./appNavigation.ts";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import { createEmptyApkgImportSession, disposeApkgImportPreview, hasVisibleApkgImportSession, resolveApkgCreationMethod, type ApkgImportSession } from "./apkgImportSession.ts";
import type { ExamPlanningData, StudyModeProps } from "./appScreenProps.ts";
import { CreationScreen, DashboardScreen, DeckSettingsScreen, DecksScreen, ExamPlanningScreen, GlobalCardSettingsScreen, HelpScreen, LearnScreen, prefetchAppView, preloadAppView, preloadSettingsDialog, SettingsDialog, SettingsScreen, SimulatorScreen, StatisticsScreen, StudyMode } from "./appFeatureLoading.tsx";
import { allowsBrowserSpeculativePreloading, startAdaptiveFeaturePreloading } from "./appFeaturePreload.ts";
import { startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import { createImportCloudSyncTask, type ImportCloudSyncTask } from "./importCloudSyncTask.ts";
import { createCardCommands } from "./cardCommands.ts";
import { createDeckCommands, type DeckCommands } from "./deckCommands.ts";
import { applyCardStudyStatePatch, createDefaultDeckSettings } from "./coreModel.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";
import { getGlobalSchedulerPreferences, markLearningSettingsCustom } from "./deckSettings.ts";
import { getLearningDayKey, getLearningDayRange, getLearningTimeZone, getNextLearningDayBoundaryDelay } from "./learningDay.ts";
import { createDeckLibraryModel } from "./libraryModel.ts";
import { formatLimitSummary } from "./screens/screenConstants.ts";
import type { StatisticsDeckSelection, StatisticsPeriod } from "./statisticsModel.ts";
import { createMenuModel } from "./menuModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import { createWorkspaceHydrationService } from "./workspaceHydrationService.ts";
import type { ImportedDeckPersistence } from "./creationWorkflow.ts";
import { clearPomodoroTimer, createPomodoroTimerFromSeconds, pausePomodoroTimer, resumePomodoroTimer, getPomodoroTimerStorageKey, readPomodoroTimer, writePomodoroTimer, type PomodoroTimer } from "./pomodoroTimer.ts";
import { createDailyReviewQueue, updateDeckNewCardLimitForDate, type ReviewAnswerResult } from "./reviewService.ts";
import { EXAM_SESSION_DECK_ID } from "./examPlanSettings.ts";
import { createHitSessionDecks, HIT_SESSION_DECK_ID, type HitStudyOrder } from "./hitStudySession.ts";
import { useStudySession, type StudyPreparation } from "./useStudySession.ts";
import { useAccountWorkspace } from "./useAccountWorkspace.ts";
import { useWorkspaceStore, useWorkspaceValue, WorkspaceStoreContext } from "./useWorkspaceStore.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";
import { formatSimulationDate, getSimulatedNow, normalizeSimulationOffsetMinutes } from "./simulationClock.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import { useNavigationGuard } from "./useNavigationGuard.ts";
import { useSettingsOverlay } from "./useSettingsOverlay.ts";
import { requestPersistentWorkspaceStorage } from "./workspaceStorage.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { AppNavigation } from "./ui/AppNavigation.tsx";
import { ActionDialog, EmptyState, OrbIcon, SoftPanel } from "./ui/coreUi.tsx";
import { ActionButton } from "./ui/actionUi.tsx";
import { CoreWordmark } from "./ui/CoreWordmark.tsx";
import { useSuccessToast } from "./ui/feedbackUi.tsx";
import { NoteLayoutContext, type NoteLayoutSource } from "./ui/noteLayoutContext.ts";
import { useStableCallback } from "./ui/useStableCallback.ts";
import { VariantGenerationBar } from "./ui/VariantGenerationBar.tsx";
import { useCardVariantBatch } from "./useCardVariantBatch.ts";
import { CARD_VARIANT_BATCH_LIMIT } from "./cardVariantBatch.ts";
import { SettingsSaveBar } from "./ui/SettingsSaveBar.tsx";
import type { DeckLearningSettingsDraft } from "./settingsDraft.ts";
const menu = createMenuModel();
const magicLinkEnabled = import.meta.env.VITE_ENABLE_MAGIC_LINK === "true";

interface SignInInput { email: string; password: string }
interface SignUpInput extends SignInInput { displayName: string }
interface EmailInput { email: string }
interface PasswordUpdateInput { password: string; passwordRepeat: string }
type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
interface StateRefreshOptions { preserveCardPages?: boolean }
interface EmptyStudyStart {
  deckId: string;
  deckName: string;
  hasAdditionalNewCards: boolean;
  /** Cards held back only by daily limits, as a sentence; null when the deck has nothing for today. */
  limitSummary: string | null;
}
interface StudyPreparationFailure {
  deckId: string;
  message: string;
}

function studyPreparationFailureMessage(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Du bist offline, und die fälligen Karten dieses Stapels liegen nicht auf diesem Gerät. Versuche es mit Verbindung erneut oder mache den Stapel vorher mit „Offline verfügbar machen“ verfügbar.";
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Die benötigten Karten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.";
}

function createEmptyStudyStart(deckId: string, queue: StudyPreparation["queue"]): EmptyStudyStart {
  return {
    deckId,
    deckName: queue.deckName,
    hasAdditionalNewCards: queue.availableNewCards > 0,
    limitSummary: queue.limitSummary.reached ? formatLimitSummary(queue.limitSummary.hiddenDueCount, queue.limitSummary.hiddenNewCount) : null,
  };
}

function LoadingScreen({ message = "CoRe wird geladen.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <main className="core-centered-viewport grid min-h-dvh min-w-0 place-items-center bg-core-surface px-6 py-10 text-core-text">
      <SoftPanel className="w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <OrbIcon icon={Database} />
          <div>
            <h1 className="core-heading-2"><CoreWordmark /></h1>
            <p className="mt-1 core-body text-core-muted" role="status" aria-live="polite">
              {message}
            </p>
            {onRetry ? <ActionButton variant="primary" className="mt-4" onClick={onRetry}>Erneut versuchen</ActionButton> : null}
          </div>
        </div>
      </SoftPanel>
    </main>
  );
}

function ScreenLoadingFallback() {
  return (
    <div className="grid min-h-[20rem] place-items-center" role="status" aria-live="polite">
      <SoftPanel className="flex items-center gap-3 px-6 py-4 core-body font-medium text-core-muted">
        <span className="size-3 animate-pulse rounded-round bg-[var(--core-action-secondary)]" aria-hidden="true" />
        Bereich wird geladen.
      </SoftPanel>
    </div>
  );
}

export function App() {
  const [workspaceStore] = React.useState(createWorkspaceStore);
  return <WorkspaceStoreContext.Provider value={workspaceStore}><AppContent /></WorkspaceStoreContext.Provider>;
}

function AppContent() {
  const workspaceStore = useWorkspaceStore();
  const [supabase, setSupabase] = React.useState<SupabaseBrowserClient | undefined>(undefined);
  const [supabaseUrl, setSupabaseUrl] = React.useState("");
  const navigationItems = React.useMemo(() => menu.listNavigationItems(), []);
  const setSuccessToast = useSuccessToast();
  const {
    authPhase, setAuthPhase, authMessage, setAuthMessage, authMessageType, setAuthMessageType,
    cloudUser, workspaceRepository, syncEngine, syncEngineRef, accountBaselineState, baselineLoadFailed,
    bootRunRef, boot: bootAuthenticatedUser, discardWorkspace, retryCloudBootstrap,
  } = useAccountWorkspace(supabase, {
    opened(boot) {
      workspaceStore.clear();
      setAppState(boot.state);
      workspaceStore.set({ deckSummaries: boot.initialDeckSummaries.summaries, studyHeatmap: boot.initialDeckSummaries.studyHeatmap });
      setSyncStatus(boot.pendingCount > 0 ? createSyncPendingStatus(boot.pendingCount) : createSyncSavingStatus());
    },
    cloudState(nextState, status) {
      setAppState(nextState, { preserveCardPages: true });
      setSyncStatus(status);
    },
    syncStatus(status) { setSyncStatus(status); },
    discarded() {
      setAppState(null);
      workspaceStore.clear();
    },
  });
  const [authBusy, setAuthBusy] = React.useState(false);
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  // Each answer changes the shell's `updatedAt`; profile and decks keep their identity while their content stays.
  const profile = useWorkspaceValue((snapshot) => snapshot.state?.profile);
  const shellDecks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const workspaceRevision = useWorkspaceValue((snapshot) => snapshot.revision);
  const [mediaStore, setMediaStore] = React.useState<AccountMediaStore | null>(null);
  const [focusedDeckBodyCache, setFocusedDeckBodyCache] = React.useState<{ total: number; cached: number; downloaded: number } | null>(null);
  const [apkgImportSession, setApkgImportSessionState] = React.useState<ApkgImportSession>(() => createEmptyApkgImportSession());
  const [emptyStudyStart, setEmptyStudyStart] = React.useState<EmptyStudyStart | null>(null);
  const [studyPreparationFailure, setStudyPreparationFailure] = React.useState<StudyPreparationFailure | null>(null);
  const [simulationOffsetMinutes, setSimulationOffsetMinutes] = React.useState(0);
  const [learningDayRevision, setLearningDayRevision] = React.useState(0);
  const [pomodoroTimer, setPomodoroTimer] = React.useState<PomodoroTimer | null>(null);
  const featurePreloadingAllowed = () => !["saving", "pending"].includes(workspaceStore.get().syncStatus.status);
  const pomodoroTimerRef = React.useRef<PomodoroTimer | null>(null);
  const screenRegionRef = React.useRef<HTMLElement | null>(null);
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
  const navigation = useNavigationGuard({ authPhase, defaultViewId: menu.defaultViewId, settingsBlocksNavigation: (route) => settings.blocksNavigation(route) });
  const {
    activeView,
    studyRequest,
    focusedDeckId,
    selectedCardId,
    deckContent,
    deckContentTab,
    deckCreationParentId,
    creationMethod,
    creationDeckId,
    completedDeckId,
    completedCount,
    completionKind,
    cardEditorReturnContext,
    cardEditorTab,
    settingsSection,
    deckSettings,
    navigateToRoute,
    navigateToView,
    navigateToViewNow,
    getStudyReturnRoute,
    getCurrentRoute,
    resetBrowserRouteToDefault,
    pendingNavigation,
  } = navigation;
  const settings = useSettingsOverlay(navigation);
  const { openSettings, openDeckSettings } = settings;
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
  const workspaceHydrationService = React.useMemo(() => (
    supabase && workspaceRepository
      ? createWorkspaceHydrationService({ client: supabase, repository: workspaceRepository, mediaStore })
      : null
  ), [mediaStore, supabase, workspaceRepository]);
  // Stable across state changes, so cards do not render again; deck names come from the latest state.
  const noteLayout = React.useMemo<NoteLayoutSource>(() => ({
    loadNoteTypeSource: async (id) => workspaceRepository?.loadNoteTypeSource(id) ?? null,
    deckName: (deckId) => workspaceStore.get().state?.decks.find((deck) => deck.id === deckId)?.hierarchyPath.join("::") ?? "",
  }), [workspaceRepository, workspaceStore]);
  const [coreEnableDeckId, setCoreEnableDeckId] = React.useState<string | null>(null);
  const [generateOnCoreEnable, setGenerateOnCoreEnable] = React.useState(true);
  React.useEffect(() => {
    let active = true;
    if (!workspaceRepository) {
      workspaceStore.set({ offlineDecks: {} });
      return () => { active = false; };
    }
    void workspaceRepository.listOfflineDecks().then((records) => {
      // No download survives a reload; an interrupted one is offered for resumption from its manifest cursor.
      if (active) workspaceStore.set({ offlineDecks: Object.fromEntries(records.map((record) => [record.deckId, record.state === "downloading" ? { ...record, state: "error" } : record])) });
    });
    return () => { active = false; };
  }, [workspaceRepository, workspaceStore]);
  const offlineDeck = useWorkspaceValue((snapshot) => deckSettings ? snapshot.offlineDecks[deckSettings.deckId] ?? null : null);
  React.useEffect(() => {
    let active = true;
    const deckId = deckSettings?.deckId;
    if (!workspaceRepository || !deckId) {
      setFocusedDeckBodyCache(null);
      return () => { active = false; };
    }
    void workspaceRepository.getDeckBodyResidencySummary(deckId).then((summary) => {
      if (active) setFocusedDeckBodyCache(summary);
    });
    return () => { active = false; };
  }, [deckSettings?.deckId, offlineDeck, workspaceRepository]);

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

  function setSyncStatus(status: SyncStatus) {
    workspaceStore.set({ syncStatus: status });
    if (status.status !== "saved") return;
    for (const task of importCloudTasksRef.current) {
      if (task.status === "local-pending") void task.retry();
    }
  }
  const getLearningNow = React.useCallback(
    () => getSimulatedNow(new Date(), simulationOffsetMinutes),
    [simulationOffsetMinutes],
  );
  const globalSchedulerPreferences = React.useMemo(() => getGlobalSchedulerPreferences(profile), [profile]);
  const learningTimeZone = getLearningTimeZone(state?.profile);
  const learningNow = React.useMemo(getLearningNow, [activeView, getLearningNow, learningDayRevision, workspaceRevision]);
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
    const timer = createPomodoroTimerFromSeconds(Math.round(minutes * 60));
    if (!timer) return;
    pomodoroTimerRef.current = timer;
    setPomodoroTimer(timer);
    writePomodoroTimer(cloudUser.id, timer);
  }, [cloudUser?.id]);

  const changePomodoroPause = React.useCallback((paused: boolean) => {
    if (!cloudUser?.id) return;
    const timer = paused ? pausePomodoroTimer(pomodoroTimerRef.current) : resumePomodoroTimer(pomodoroTimerRef.current);
    if (!timer) return;
    pomodoroTimerRef.current = timer;
    setPomodoroTimer(timer);
    writePomodoroTimer(cloudUser.id, timer);
  }, [cloudUser?.id]);

  const resetPomodoro = React.useCallback(() => {
    const timer = pomodoroTimerRef.current;
    if (!cloudUser?.id || !timer) return;
    pomodoroTimerRef.current = null;
    setPomodoroTimer(null);
    clearPomodoroTimer(cloudUser.id, timer.id);
  }, [cloudUser?.id]);

  React.useEffect(() => {
    const userId = cloudUser?.id;
    if (!userId) {
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      return;
    }

    const storedTimer = readPomodoroTimer(userId);
    if (storedTimer && storedTimer.pausedAt === undefined && storedTimer.endsAt <= Date.now()) {
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
      if (nextTimer && nextTimer.pausedAt === undefined && nextTimer.endsAt <= Date.now()) {
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
    if (!userId || !timer || timer.pausedAt !== undefined) return undefined;
    const accountUserId = userId;
    const activeTimer = timer;
    let timeoutId = 0;
    let cancelled = false;

    function checkExpiry() {
      if (cancelled || pomodoroTimerRef.current !== activeTimer) return;
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
    // Every local write and every sync ends here, so a prefetched card never shows an older version than the replica.
    workspaceHydrationService?.forgetPreparedGraphs();
    if (!preserveCardPages) cardCommands?.abortCardPageRequests();
    workspaceStore.set({
      state: nextState,
      ...(workspaceRepository ? { syncConflictCardIds: workspaceRepository.getSyncConflictCardIds() } : {}),
      ...(preserveCardPages ? {} : { cardPages: {} }),
    });
  }

  const queryStatistics = React.useCallback(
    async ({ period, deckIds }: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => {
      if (!workspaceRepository) throw new Error("Die lokale Statistik ist noch nicht bereit.");
      const projection = await workspaceRepository.queryStatistics({ period, deckIds, now: learningNow, timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
      if (!workspaceHydrationService) throw new Error("Die Statistik ist noch nicht bereit.");
      const periodDays = period === "30d" ? 30 : period === "90d" ? 90 : period === "365d" ? 365 : null;
      const startReference = periodDays == null ? null : new Date(Date.parse(learningNow) - (periodDays - 1) * 86_400_000).toISOString();
      const startRange = startReference ? getLearningDayRange(startReference, { timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour }) : null;
      const endRange = getLearningDayRange(learningNow, { timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
      try {
        const snapshot = await workspaceHydrationService.refreshStatistics(
          projection.scopeDeckIds,
          startRange ? new Date(startRange.start).toISOString() : null,
          endRange ? new Date(endRange.end).toISOString() : null,
          learningTimeZone,
          globalSchedulerPreferences.dayStartHour,
        );
        if (!snapshot) throw new Error("Für diese Auswahl ist noch keine vollständige Offline-Statistik gespeichert.");
        const pendingReviews = workspaceRepository.outbox.listPending().flatMap((mutation) => mutation.type === "review-atomic" && (mutation.payload as any)?.event
          ? [(mutation.payload as any).event]
          : []);
        const { mergeAccountStatisticsSnapshot } = await import("./statisticsModel.ts");
        return mergeAccountStatisticsSnapshot(projection, snapshot, pendingReviews);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Statistik konnte nicht geladen werden.");
      }
    },
    [globalSchedulerPreferences.dayStartHour, learningNow, learningTimeZone, workspaceHydrationService, workspaceRepository],
  );

  // Deck counts load only while a view shows them; a study session catches up when it ends.
  const deckCountsShown = !studyRequest || Boolean(deckSettings);
  React.useEffect(() => {
    if (!workspaceRepository || !state || !deckCountsShown) return;
    let active = true;
    void workspaceRepository.listDeckSummaries({
      now: learningNow,
      dayStartHour: globalSchedulerPreferences.dayStartHour,
      learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
      timeZone: learningTimeZone,
    }).then((result) => {
      if (active) workspaceStore.set({ deckSummaries: result.summaries, studyHeatmap: result.studyHeatmap });
    });
    return () => { active = false; };
  }, [deckCountsShown, globalSchedulerPreferences.dayStartHour, globalSchedulerPreferences.learnAheadMinutes, learningNow, learningTimeZone, state, workspaceRepository, workspaceRevision, workspaceStore]);

  const study = useStudySession({
    workspaceRepository,
    workspaceHydrationService,
    workspaceStore,
    now: learningNow,
    dayStartHour: globalSchedulerPreferences.dayStartHour,
    learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
    timeZone: learningTimeZone,
  });
  const { prepare: prepareStudyWindow, adopt: adoptStudyWindow, reset: resetStudySession } = study;

  // The commands live as long as the workspace; what changes within it they read when they run.
  const latestRefresh = useStableCallback(refresh);
  const latestHydration = useStableCallback(() => workspaceHydrationService);
  const latestLearningNow = useStableCallback(getLearningNow);
  const latestSyncNow = useStableCallback(syncNow);
  const cardCommands = React.useMemo(() => workspaceRepository ? createCardCommands({
    store: workspaceStore, repository: workspaceRepository, hydration: latestHydration, cloud: supabase ?? null,
    syncEngine: () => syncEngineRef.current, refresh: latestRefresh, now: latestLearningNow, bootRun: bootRunRef,
  }) : null, [bootRunRef, latestHydration, latestLearningNow, latestRefresh, supabase, syncEngineRef, workspaceRepository, workspaceStore]);
  const deckCommands = React.useMemo(() => workspaceRepository ? createDeckCommands({
    store: workspaceStore, repository: workspaceRepository, refresh: latestRefresh,
    requestSync: () => syncEngineRef.current?.requestSync(), syncNow: latestSyncNow, updateStudyDecks: study.setDecks,
  }) : null, [latestRefresh, latestSyncNow, study.setDecks, syncEngineRef, workspaceRepository, workspaceStore]);
  const flagNamesKey = state?.profile.uiPreferences.flagNames.join("\n") ?? "";
  const cardEditorServices = React.useMemo(() => cardCommands?.createCardEditorServices(flagNamesKey.split("\n"), openSettings) ?? null, [cardCommands, flagNamesKey, openSettings]);
  const variantBatch = useCardVariantBatch({ cards: workspaceHydrationService, generate: (...args) => cardCommands!.generateDeckCardVariant(...args), onToast: setSuccessToast });

  /** Study states for the exam forecast (ADR-042); Heute and Prüfungen share them for a minute or until the next own answer. */
  const examPlanningDataCache = React.useRef<{ deckIds: ReadonlySet<string>; loadedAt: number; cards: ExamPlanningData["cards"] } | null>(null);
  const loadExamPlanningData = React.useCallback(async (deckIds: string[], signal?: AbortSignal, options: { fresh?: boolean } = {}) => {
    if (!workspaceHydrationService) throw new Error("Die Kartenablage ist noch nicht bereit.");
    const cached = examPlanningDataCache.current;
    if (!options.fresh && cached && Date.now() - cached.loadedAt < 60_000 && deckIds.every((id) => cached.deckIds.has(id))) {
      const requested = new Set(deckIds);
      return { cards: cached.cards.filter((card) => requested.has(card.deckId)) };
    }
    const data = await workspaceHydrationService.loadExamPlanningData(deckIds, signal);
    examPlanningDataCache.current = { deckIds: new Set(deckIds), loadedAt: Date.now(), cards: data.cards };
    return data;
  }, [workspaceHydrationService]);

  const loadExamSummaryAvailability = React.useCallback(async (deckId: string) => {
    const current = workspaceStore.get().state;
    if (!current) return false;
    const { loadLearningSummaries } = await import("./learningSummaries.ts");
    const result = await loadLearningSummaries({ userId: current.profile.userId, cloud: supabase ?? null }, deckId);
    return result.summaries.length > 0;
  }, [supabase, workspaceStore]);

  /** Today's exam unit, or one of its blocks, as a study session over exactly the planned cards. */
  const prepareExamUnit = React.useCallback(async (blockId: string | null): Promise<StudyPreparation> => {
    const currentState = workspaceStore.get().state;
    if (!workspaceHydrationService || !currentState) throw new Error("Die Kartenablage ist noch nicht bereit.");
    const preferences = getGlobalSchedulerPreferences(currentState.profile);
    const { exams, capacity } = preferences.examPlanning;
    const now = getLearningNow();
    const civilToday = getLearningDayKey(now, { timeZone: learningTimeZone })!;
    const todayKey = getLearningDayKey(now, { timeZone: learningTimeZone, dayStartHour: preferences.dayStartHour })!;
    const { createExamPortfolioForecast, createExamSessionDecks, getActiveExamDeckIds } = await import("./examPlanning.ts");
    const { getExamSessionTargetIds, reconcileExamDailyTasks } = await import("./examDailyTasks.ts");
    // Today's saved checklist already holds the frozen targets; only calendar blocks or a missing checklist need a new plan.
    const storedTasks = (preferences.examPlanning.dailyTasks ?? []).filter((task) => task.date === todayKey);
    let ids = blockId && !storedTasks.some((task) => task.id === blockId) ? [] : getExamSessionTargetIds(storedTasks, undefined, todayKey, blockId);
    if (!ids.length) {
      const data = await loadExamPlanningData(getActiveExamDeckIds(currentState.decks, exams, civilToday));
      const forecast = await createExamPortfolioForecast(currentState.decks, data.cards, exams, { now, preferences, timeZone: learningTimeZone, capacity, dailyTasks: preferences.examPlanning.dailyTasks });
      const tasks = reconcileExamDailyTasks(preferences.examPlanning, currentState.decks, forecast, data.cards, now, learningTimeZone, preferences.dayStartHour);
      ids = getExamSessionTargetIds(tasks, forecast.days[0], todayKey, blockId);
    }
    if (!ids.length) throw new Error("Für heute ist in der Prüfungsplanung nichts mehr offen.");
    // Offline the unit runs on the target cards already on this device (E12).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      ids = await workspaceHydrationService.listLocalCardIds(ids);
      if (!ids.length) throw new Error("Die Karten der heutigen Einheit sind erst online verfügbar.");
    }
    const bodies = (await workspaceHydrationService.openCards(ids)).filter((body): body is { card: Card; note: Note } => Boolean(body));
    const position = new Map(ids.map((id, index) => [id, index]));
    bodies.sort((a, b) => (position.get(a.card.id) ?? 0) - (position.get(b.card.id) ?? 0));
    const decks = createExamSessionDecks(currentState.decks, bodies.map(({ card }) => card), exams, todayKey);
    const queue = createDailyReviewQueue(decks, { deckId: EXAM_SESSION_DECK_ID, now, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, timeZone: learningTimeZone });
    if (!queue.total) throw new Error("Gerade ist keine Karte der heutigen Einheit fällig.");
    const notes = [...new Map(bodies.map(({ note }) => [note.id, note])).values()];
    return { decks, notes, answeredToday: [], queue, cursorByDeck: {}, hasMoreCards: false, bufferSize: 50, dueForecast: null };
  }, [getLearningNow, learningTimeZone, loadExamPlanningData, workspaceHydrationService, workspaceStore]);

  React.useEffect(() => {
    if (!workspaceRepository || !state || !studyRequest) {
      resetStudySession();
      return;
    }
    const preparationKey = studyRequest.deckId;
    if (study.preparedKeyRef.current === preparationKey && study.decks) return;
    let active = true;
    // After a reload an exam session resumes as today's whole unit.
    // `Treffer lernen` lives only in the screen that started it; after a reload it is gone.
    const preparing = studyRequest.deckId === EXAM_SESSION_DECK_ID ? prepareExamUnit(null)
      : studyRequest.deckId === HIT_SESSION_DECK_ID ? Promise.reject(new Error("Die Treffer sind nach dem Neuladen nicht mehr da. Starte „Treffer lernen“ erneut."))
        : prepareStudyWindow(studyRequest.deckId);
    void preparing.then((preparation) => {
      if (!active || !preparation) return;
      if (!preparation.decks.some((deck) => deck.id === studyRequest.deckId)) {
        adoptStudyWindow(preparation, null);
        return;
      }
      if (preparation.queue.total === 0) {
        setEmptyStudyStart(createEmptyStudyStart(studyRequest.deckId, preparation.queue));
        study.setDecks(null);
        navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
        return;
      }
      adoptStudyWindow(preparation, preparationKey);
    }).catch((error) => {
      if (!active) return;
      setStudyPreparationFailure({
        deckId: studyRequest.deckId,
        message: studyPreparationFailureMessage(error),
      });
      navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
    });
    return () => { active = false; };
  }, [adoptStudyWindow, navigateToRoute, prepareExamUnit, prepareStudyWindow, resetStudySession, state, study.decks, studyRequest, workspaceRepository]);

  // Stable across app renders, so an unchanged session does not draw again (StudyMode is memoized).
  const loadMoreStudyCards = useStableCallback(async () => studyRequest
    ? study.loadMore(studyRequest.deckId)
    : { decks: [], notes: [], hasMoreCards: false, bufferSize: study.bufferSize });
  const leaveStudy = useStableCallback(() => {
    refresh();
    if (studyRequest) navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
  });
  const editStudyCard = useStableCallback((...[deckId, cardId, tab]: Parameters<StudyModeProps["onEditCard"]>) => studyRequest && navigateToViewNow("kartenstapel", {
    focusedDeckId: deckId, selectedCardId: cardId, cardEditorTab: tab, cardEditorReturnContext: { deckId: studyRequest.deckId, returnContext: studyRequest.returnContext },
  }));
  const editStudyDeck = useStableCallback((currentDeckId: string) => currentDeckId === EXAM_SESSION_DECK_ID ? navigateToViewNow("pruefungen") : openDeckSettings(currentDeckId));
  const askStudyCardHelp = useStableCallback((...[request, signal]: Parameters<StudyModeProps["onAskCardHelp"]>) => requestAiCardHelp(request, supabase ?? null, { signal }));
  // The plan a session starts from; deck counts stay as they were at the start while it runs.
  const studyDeckSummaries = useWorkspaceValue((snapshot) => studyRequest ? snapshot.deckSummaries : undefined);
  const studySessionPlan = React.useMemo(() => {
    const session = studyRequest && shellDecks && studyDeckSummaries?.has(studyRequest.deckId)
      ? createDeckLibraryModel(shellDecks, {
          now: learningNow,
          dayStartHour: globalSchedulerPreferences.dayStartHour,
          learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
          timeZone: learningTimeZone,
          deckSummaries: studyDeckSummaries,
        }).rows.find((row) => row.id === studyRequest.deckId)?.dailyLearningSession
      : null;
    return session ? { progress: session.progress, initialCardCount: session.startableCount } : undefined;
    // `learningNow` moves with every sync; the plan only needs the learning day.
  }, [globalSchedulerPreferences, learningDayKey, learningTimeZone, shellDecks, studyDeckSummaries, studyRequest]);

  React.useEffect(() => {
    return startAppSyncLifecycle({
      authPhase,
      syncEngine,
      syncIntervalMinutes: state?.profile.uiPreferences.syncIntervalMinutes ?? 5,
      onStatus: setSyncStatus,
      onSynced(result) {
        if (!workspaceRepository) return;
        // While the catalog is incomplete the cloud serves the card lists; they lack local changes until those are
        // uploaded, so a sync that sent changes loads them again.
        const listsFromCloud = workspaceRepository.getReplicaStatus().catalogCompleteness !== "complete";
        setAppState(workspaceRepository.getShellState(), { preserveCardPages: !(listsFromCloud && (result?.mutations ?? 0) > 0) });
      },
    });
  }, [authPhase, state?.profile.uiPreferences.syncIntervalMinutes, syncEngine, workspaceRepository]);

  // Preloading pauses while a sync runs; following the store directly spares the app a render per status.
  React.useEffect(() => {
    if (authPhase !== "ready" || !workspaceRepository) return undefined;
    let stop: (() => void) | null = null;
    const follow = () => {
      const allowed = featurePreloadingAllowed();
      if (allowed && !stop) stop = startAdaptiveFeaturePreloading({ preload: prefetchAppView });
      if (!allowed && stop) {
        stop();
        stop = null;
      }
    };
    follow();
    const unsubscribe = workspaceStore.subscribe(follow);
    return () => { unsubscribe(); stop?.(); };
  }, [authPhase, workspaceRepository, workspaceStore]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !workspaceRepository) return;
    let active = true;
    void requestPersistentWorkspaceStorage().then(async (status) => {
      if (active) workspaceStore.set({ storageStatus: status });
      if (workspaceHydrationService) {
        await workspaceHydrationService.enforceQuota(study.decks?.flatMap((deck) => deck.cards.map((card) => card.id)) ?? []);
      }
    });
    return () => { active = false; };
  }, [authPhase, study.decks, studyRequest, workspaceHydrationService, workspaceRepository]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !mediaStore || !syncEngine || !workspaceRepository) return undefined;
    return startAppMediaRetryLifecycle({
      mediaStore,
      ensureCloudParents: async () => { await syncNow(); },
    });
  }, [authPhase, mediaStore, syncEngine, workspaceRepository]);

  // K5.4: after a translator release, unedited imports are re-translated once in the background.
  React.useEffect(() => {
    if (authPhase !== "ready" || !syncEngine || !workspaceRepository || !supabase) return undefined;
    let active = true;
    void import("./importRetranslation.ts")
      .then(({ runAccountRetranslation }) => runAccountRetranslation(supabase, workspaceRepository))
      .then((count) => {
        if (!active || count === 0) return;
        setAppState(workspaceRepository.getShellState(), { preserveCardPages: true });
        syncEngine.requestSync();
        setSuccessToast(`${count.toLocaleString("de-DE")} ${count === 1 ? "Inhalt" : "Inhalte"} mit verbesserter Darstellung aktualisiert.`);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [authPhase, supabase, syncEngine, workspaceRepository]);

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
    discardWorkspace();
    resetBrowserRouteToDefault();
    setSimulationOffsetMinutes(0);
    disposeApkgImportPreview(apkgImportSessionRef.current);
    importCloudTasksRef.current.clear();
    resetApkgImportSession(false);
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

  /** Commits an import graph chunk by chunk, applies global defaults to new decks and starts the cloud confirmation. */
  async function commitImport(graph: ImportCommitGraph, { onMedia }: { onMedia: (file: ImportMediaFile) => Promise<void> }): Promise<ImportedDeckPersistence> {
    if (!workspaceRepository) throw new Error("Die lokale Kartenablage ist noch nicht bereit.");
    const repository = workspaceRepository;
    const reimportTargets = workspaceHydrationService ? await workspaceHydrationService.prepareReimport(graph.ankiGuids) : undefined;
    const result = await repository.commitImportGraph(graph, {
      deckSettings: createGlobalDefaultDeckSettings(globalSchedulerPreferences),
      reimportTargets,
      onMedia,
    });
    const nextState = refresh();
    const importedIds = new Set(result.decks.map((deck) => deck.id));
    const decks = nextState?.decks.filter((deck) => importedIds.has(deck.id)) ?? [];
    return {
      decks,
      rootDeck: decks.find((deck) => !deck.parentDeckId || !importedIds.has(deck.parentDeckId)) ?? decks[0] ?? null,
      createdCount: result.scope.cardIds.length,
      keptLocalEdits: result.keptLocalEdits,
      missingInPackage: result.missingInPackage,
      cloudTask: createTrackedImportCloudTask(result.scope),
    };

    function createTrackedImportCloudTask(verificationScope: ImportVerificationScope) {
      const task = createImportCloudSyncTask(async () => {
        await repository.flush();
        const activeSyncEngine = syncEngineRef.current;
        if (!activeSyncEngine) {
          return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus." };
        }
        const result = await activeSyncEngine.flush({ force: true });
        if (result?.paused) {
          return { status: "blocked", message: "Die Karten sind lokal gespeichert. Ein Cloud-Konflikt verhindert den Abschluss der Synchronisierung." };
        }
        if (result?.deferred || activeSyncEngine.pendingCount() > 0) {
          return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus." };
        }
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
            await repository.requeueImportVerificationScope(verificationScope, error.repairScope);
          }
          return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die vollständige Cloud-Bestätigung steht noch aus." };
        }
        return { status: "cloud-ready", message: "Karten und Wiederholungen sind in der Cloud bestätigt." };
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

  async function startExamUnit(blockId: string | null) {
    const { getExamSummaryTaskDeckId } = await import("./examDailyTasks.ts");
    const summaryDeckId = blockId ? getExamSummaryTaskDeckId(blockId) : null;
    if (summaryDeckId) {
      navigateToViewNow("kartenstapel", { focusedDeckId: summaryDeckId, deckContent: true, deckContentTab: "summary" });
      return;
    }
    if (study.preparingKeyRef.current === EXAM_SESSION_DECK_ID) return;
    study.preparingKeyRef.current = EXAM_SESSION_DECK_ID;
    try {
      const preparation = await prepareExamUnit(blockId);
      adoptStudyWindow(preparation, EXAM_SESSION_DECK_ID);
      const returnRoute = createViewRoute(activeView === "pruefungen" ? "pruefungen" : "uebersicht");
      navigateToRoute(createStudyRoute(EXAM_SESSION_DECK_ID, { returnContext: createReviewReturnContext(returnRoute) }));
    } finally {
      study.preparingKeyRef.current = "";
    }
  }

  /** `Treffer lernen` with `Vorziehen` (KV5): a study session over exactly these cards, due or not, without daily limits. */
  async function startHitSession(cardIds: string[], order: HitStudyOrder) {
    const currentState = workspaceStore.get().state;
    if (!workspaceHydrationService || !currentState) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    if (study.preparingKeyRef.current === HIT_SESSION_DECK_ID) return;
    study.preparingKeyRef.current = HIT_SESSION_DECK_ID;
    try {
      const preferences = getGlobalSchedulerPreferences(currentState.profile);
      const now = getLearningNow();
      const ids = typeof navigator !== "undefined" && navigator.onLine === false ? await workspaceHydrationService.listLocalCardIds(cardIds) : cardIds;
      const bodies = (await workspaceHydrationService.openCards(ids)).filter((body): body is { card: Card; note: Note } => Boolean(body));
      const position = new Map(ids.map((id, index) => [id, index]));
      bodies.sort((a, b) => (position.get(a.card.id) ?? 0) - (position.get(b.card.id) ?? 0));
      const decks = createHitSessionDecks(currentState.decks, bodies.map(({ card }) => card), order, now);
      const queue = createDailyReviewQueue(decks, { deckId: HIT_SESSION_DECK_ID, now, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, timeZone: learningTimeZone });
      if (!queue.total) throw new Error(ids.length ? "Keine dieser Karten kann gerade gelernt werden." : "Diese Karten sind erst online verfügbar.");
      const notes = [...new Map(bodies.map(({ note }) => [note.id, note])).values()];
      adoptStudyWindow({ decks, notes, answeredToday: [], queue, cursorByDeck: {}, hasMoreCards: false, bufferSize: 50, dueForecast: null }, HIT_SESSION_DECK_ID);
      navigateToRoute(createStudyRoute(HIT_SESSION_DECK_ID, { returnContext: createReviewReturnContext(getStudyReturnRoute()) }));
    } finally {
      study.preparingKeyRef.current = "";
    }
  }

  const recordReview = useStableCallback((result: ReviewAnswerResult) => {
    if (!workspaceRepository) return;
    examPlanningDataCache.current = null;
    workspaceRepository.recordReview(result);
    syncEngine?.requestSync();
  });

  /** Switching CoRe on from a deck menu first explains it and offers generating variants right away. */
  function requestDeckCoreMode(deckId: string, coreMode: CoreMode) {
    const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
    if (coreMode !== "on" || !deck || createDefaultDeckSettings(deck.deckSettings).coreMode === "on") return deckCommands?.setDeckCoreMode(deckId, coreMode);
    setGenerateOnCoreEnable(!variantBatch.running);
    setCoreEnableDeckId(deckId);
    return undefined;
  }

  function confirmCoreEnable() {
    const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === coreEnableDeckId);
    setCoreEnableDeckId(null);
    if (!deck) return;
    void deckCommands?.setDeckCoreMode(deck.id, "on");
    if (generateOnCoreEnable) variantBatch.start(deck, { deckSettings: { ...deck.deckSettings, coreMode: "on" } });
  }

  function createDeck(input?: Parameters<DeckCommands["createDeck"]>[0]) {
    const saved = deckCommands?.createDeck(input) ?? null;
    if (saved) navigateToViewNow("lernen", { focusedDeckId: saved.id }, { replace: true });
    return saved;
  }

  const setStudyCardStudyState = useStableCallback((deckId: string, cardId: string, patch: CardStudyStatePatch) => {
    const deck = study.decks?.find((candidate) => candidate.id === deckId);
    const card = deck?.cards.find((candidate) => candidate.id === cardId);
    const note = card ? study.notes.find((candidate) => candidate.id === card.noteId) : null;
    if (!deck || !card || !note) return null;
    const updatedAt = new Date().toISOString();
    const { note: nextNote, card: nextCard } = applyCardStudyStatePatch(note, card, patch, updatedAt);
    const updated = { ...deck, updatedAt, cards: deck.cards.map((candidate) => candidate.id === cardId ? nextCard : candidate) };
    study.setDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    study.setNotes((current) => current.map((candidate) => candidate.id === note.id ? nextNote : candidate));
    void cardCommands?.applyCardStudyState(cardId, patch).then(() => {
      refresh({ preserveCardPages: true });
      syncEngine?.requestSync();
    });
    return { deck: updated, note: nextNote };
  });

  const setStudyDeckReviewOrder = useStableCallback((deckId: string, newReviewOrder: NewReviewOrder) => {
    const deck = study.decks?.find((candidate) => candidate.id === deckId);
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
    study.setDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    // A planned session root exists only in the session.
    if (!deck.plannedOrder && workspaceRepository) {
      workspaceRepository.updateDeckSettings(deckId, nextDeckSettings);
      refresh({ preserveCardPages: true });
      syncEngine?.requestSync();
    }
    return updated;
  });

  async function createDemo() {
    const { createWorldCapitalsImportGraph } = await import("./fixtures/worldCapitals.ts");
    const persisted = await commitImport(createWorldCapitalsImportGraph(), { onMedia: async () => {} });
    navigateToView("lernen");
    return persisted.decks;
  }

  async function prepareDeckStart(deck: { id: string; }) {
    const currentRoute = getStudyReturnRoute();
    const returnRoute = activeView === "kartenstapel"
      ? createViewRoute("kartenstapel", {
          focusedDeckId: focusedDeckId ?? deck.id,
          selectedCardId,
          deckContent,
          deckContentTab,
        })
      : activeView === "lernen"
        ? createViewRoute("lernen", { focusedDeckId: deck.id })
        : currentRoute;
    const returnContext = createReviewReturnContext(returnRoute, deck.id);
    const preparationKey = deck.id;
    if (study.preparingKeyRef.current === preparationKey) return;
    study.preparingKeyRef.current = preparationKey;
    try {
      setStudyPreparationFailure(null);
      const preparation = await prepareStudyWindow(deck.id);
      if (study.preparingKeyRef.current !== preparationKey) return;
      if (!preparation || !preparation.decks.some((candidate) => candidate.id === deck.id)) return;
      if (preparation.queue.total === 0) {
        setEmptyStudyStart(createEmptyStudyStart(deck.id, preparation.queue));
        return;
      }
      adoptStudyWindow(preparation, preparationKey);
      navigateToRoute(createStudyRoute(deck.id, { returnContext }));
    } catch (error) {
      setStudyPreparationFailure({
        deckId: deck.id,
        message: studyPreparationFailureMessage(error),
      });
    } finally {
      if (study.preparingKeyRef.current === preparationKey) study.preparingKeyRef.current = "";
    }
  }

  function startDeck(deck: { id: string; }) {
    void prepareDeckStart(deck);
  }

  function startAdditionalCards(deckId: string, requestedCount: number): { ok: boolean; message?: string } {
    if (!workspaceRepository) return { ok: false, message: "Die zusätzlichen Karten konnten nicht vorbereitet werden." };
    const currentState = state!;
    const currentPreferences = getGlobalSchedulerPreferences(currentState.profile);
    const currentTimeZone = getLearningTimeZone(currentState.profile);
    const currentPlan = createDeckLibraryModel(currentState.decks, {
      now: getLearningNow(),
      dayStartHour: currentPreferences.dayStartHour,
      learnAheadMinutes: currentPreferences.learnAheadMinutes,
      timeZone: currentTimeZone,
      deckSummaries: workspaceStore.get().deckSummaries,
    }).dailyLearningPlan;
    const session = currentPlan.sessions.find((candidate) => candidate.deckId === deckId) ?? null;
    const additionalCount = Math.min(
      Math.max(0, Math.floor(Number(requestedCount) || 0)),
      session?.additionalNewCount ?? 0,
    );

    if (currentPlan.status !== "achieved" || !session || additionalCount === 0) {
      return { ok: false, message: "Für diesen Stapel sind keine zusätzlichen neuen Karten verfügbar." };
    }

    const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
    const updatedDeck = deck ? deckCommands?.updateDeck(deckId, (current) => updateDeckNewCardLimitForDate(
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

  function openDeckCreation(parentDeckId = "") {
    navigateToView("lernen", {
      focusedDeckId: parentDeckId || focusedDeckId,
      deckCreationParentId: parentDeckId || "",
    });
  }

  function renderActiveView() {
    if (!state || !cardCommands || !deckCommands || !cardEditorServices) return null;
    if (studyRequest && !state.decks.some((deck) => deck.id === studyRequest.deckId)) {
      return (
        <EmptyState
          icon={Layers}
          title="Stapel nicht gefunden oder nicht verfügbar."
          body="Die verlinkte Lernsitzung kann nicht geöffnet werden, weil der Stapel gelöscht wurde oder in diesem Account nicht verfügbar ist."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => openLearn(null)} className="inline-flex min-h-control items-center rounded-control bg-core-subtle px-6 core-body font-semibold text-core-action">
                Zu Lernen
              </button>
              <button type="button" onClick={() => openDecks(null)} className="inline-flex min-h-control items-center rounded-control border border-core-border bg-core-surface px-6 core-body font-semibold text-core-action">
                Zur Kartenverwaltung
              </button>
            </div>
          }
        />
      );
    }
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          key={deckContent ? `content-${focusedDeckId}` : "library"}
          decks={state.decks}
          onStartDeck={startDeck}
          contentDeckId={deckContent ? focusedDeckId : null}
          contentTab={deckContentTab}
          onOpenDeckContent={(deckId, tab = "children") => navigateToViewNow("kartenstapel", { focusedDeckId: deckId, deckContent: true, deckContentTab: tab })}
          summaryAccountId={state.profile.userId}
          learningContentCloud={supabase ?? null}
          onGenerateSummary={async (input, signal) => {
            const accountId = workspaceStore.get().state?.profile.userId;
            if (!accountId || !workspaceHydrationService || !supabase) throw new Error("Die Anmeldung und Kartenablage sind noch nicht bereit.");
            const { generateLearningSummary } = await import("./aiLearningSummary.ts");
            const result = await generateLearningSummary(input, async (ids, options) => {
              const loaded = await workspaceHydrationService.prepareContentDecks(ids, options);
              if (workspaceStore.get().state?.profile.userId !== accountId) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
              return loaded;
            }, workspaceStore.get().state!.decks, supabase, signal);
            if (workspaceStore.get().state?.profile.userId !== accountId) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
            return result;
          }}
          onRequestCardPage={cardCommands.requestCardPage}
          now={learningNow}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          timeZone={learningTimeZone}
          mediaStore={mediaStore}
          onSetDeckCoreMode={requestDeckCoreMode}
          onSaveNote={cardCommands.saveDeckNote}
          onSetCardStudyState={cardCommands.setCardStudyState}
          onDuplicateNote={cardCommands.duplicateDeckNote}
          onDeleteNote={cardCommands.deleteDeckNote}
          onUndoDeleteNote={cardCommands.undoDeleteDeckNote}
          onRescheduleCards={cardCommands.rescheduleDeckCards}
          onGenerateVariant={cardCommands.generateDeckCardVariant}
          onGenerateCardVariants={workspaceHydrationService ? (deckId, cardIds) => {
            const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
            if (deck) variantBatch.start(deck, { cardIds });
          } : undefined}
          onRunCardBatch={workspaceHydrationService ? cardCommands.runDeckCardBatch : undefined}
          onPrepareTextReplace={workspaceHydrationService ? cardCommands.prepareDeckTextReplace : undefined}
          onStudyHits={workspaceHydrationService ? startHitSession : undefined}
          onFindDuplicates={workspaceHydrationService?.findDuplicates}
          onLoadPracticeCards={workspaceHydrationService ? async (cardIds) => (await workspaceHydrationService.openCards(cardIds)).filter((body): body is { card: Card; note: Note } => Boolean(body)) : undefined}
          onListHitCardIds={workspaceHydrationService ? (request) => workspaceHydrationService.listCardIds(request) : undefined}
          variantGenerationRunning={variantBatch.running}
          onUpdateVariant={cardCommands.updateDeckCardVariant}
          selectedDeckId={focusedDeckId}
          selectedCardId={selectedCardId}
          cardEditorTab={cardEditorTab}
          onCardEditorTabChange={(tab) => navigateToViewNow("kartenstapel", {
            focusedDeckId,
            selectedCardId,
            cardEditorTab: tab,
            deckContent,
            deckContentTab: "cards",
            cardEditorReturnContext: cardEditorReturnContext ?? undefined,
          }, { replace: true })}
          cardEditor={cardEditorServices}
          onSelectDeck={deckContent ? (_deckId, cardId, tab) => navigateToViewNow("kartenstapel", {
            focusedDeckId,
            selectedCardId: cardId,
            cardEditorTab: tab,
            deckContent: true,
            deckContentTab: "cards",
          }) : (deckId, cardId, tab) => navigateToViewNow("kartenstapel", {
            focusedDeckId: deckId || null,
            selectedCardId: deckId && cardId ? cardId : null,
            cardEditorTab: tab,
          })}
          onCloseSelectedCard={cardEditorReturnContext ? () => navigateToRoute(createStudyRoute(
            cardEditorReturnContext.deckId,
            {
              returnContext: cardEditorReturnContext.returnContext,
            },
          ), { replace: true }) : undefined}
          onMoveDeck={deckCommands.moveDeck}
          onOpenLearn={openLearn}
          onOpenCardSettings={() => openSettings("lerntag")}
          onDraftStateChange={navigation.handleCardDraftStateChange}
          savedSearches={state.profile.uiPreferences.savedSearches}
          onSavedSearchesChange={deckCommands.saveSearches}
          onOpenDeckSettings={(deckId) => openDeckSettings(deckId)}
        />
      );
    }
    if (activeView === "neue-karten") {
      const visibleCreationMethod = resolveApkgCreationMethod(creationMethod, apkgImportSession);
      return (
        <CreationScreen
          decks={state.decks}
          mediaStore={mediaStore}
          commitImport={commitImport}
          apkgImportSession={apkgImportSession}
          onApkgImportSessionChange={setApkgImportSession}
          isApkgImportSessionCurrent={isApkgImportSessionCurrent}
          onResetApkgImportSession={resetApkgImportSession}
          initialMethod={visibleCreationMethod}
          initialTargetDeckId={creationDeckId}
          completedDeckId={completedDeckId}
          completedCount={completedCount}
          completionKind={completionKind}
          onMethodChange={(method) => {
            if (!method && hasVisibleApkgImportSession(apkgImportSessionRef.current)) resetApkgImportSession();
            navigateToView("neue-karten", method ? {
              creationMethod: method,
              creationDeckId: method === "manual" ? creationDeckId || state.decks[0]?.id : method === "ai-source" ? creationDeckId || null : null,
            } : {});
          }}
          onTargetDeckChange={(deckId) => navigateToViewNow("neue-karten", {
            creationMethod: "manual",
            creationDeckId: deckId || null,
          })}
          onSaveManualNote={cardCommands.saveManualNote}
          listTagDirectory={cardEditorServices.listTagDirectory}
          onDraftStateChange={navigation.handleCreationDraftStateChange}
          onSessionCompleted={(completion) => navigateToViewNow("neue-karten", {
            completedDeckId: completion.deckId,
            completedCount: completion.createdCount,
            completionKind: completion.kind,
          }, { replace: true })}
          onStartDeck={startDeck}
          // `Karten prüfen` lists the new cards: the deck's own card list, not the whole card management (KV3b).
          onReviewDeck={(deckId) => navigateToViewNow("kartenstapel", { focusedDeckId: deckId, deckContent: true, deckContentTab: "cards" })}
          onOpenDashboard={() => navigateToViewNow("uebersicht")}
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
          onOpenDeckContent={(deckId) => navigateToView("kartenstapel", { focusedDeckId: deckId, deckContent: true })}
          onOpenCardSettings={() => openSettings("lerntag")}
          onOpenDeckSettings={(deckId) => openDeckSettings(deckId)}
          onSetDeckCoreMode={requestDeckCoreMode}
          onMoveDeck={deckCommands.moveDeck}
          collapsedDeckIds={state.profile.uiPreferences.learnCollapsedDeckIds}
          onSetDeckExpanded={deckCommands.saveDeckExpansion}
        />
      );
    }
    if (activeView === "pruefungen") {
      return (
        <ExamPlanningScreen
          state={state}
          now={learningNow}
          onLoadPlanningData={loadExamPlanningData}
          onSavePlanning={deckCommands.saveExamPlanning}
          onSaveTasks={deckCommands.saveExamTasks}
          onStartUnit={startExamUnit}
          onLoadSummaryAvailability={loadExamSummaryAvailability}
          onLoadLocalCardIds={workspaceHydrationService?.listLocalCardIds}
          onDraftStateChange={navigation.handleExamDraftStateChange}
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
    return <DashboardScreen onResetPomodoro={resetPomodoro} onPausePomodoro={() => changePomodoroPause(true)} onResumePomodoro={() => changePomodoroPause(false)} pomodoroTimer={pomodoroTimer} onStartPomodoro={startPomodoro} state={state} now={learningNow} onNavigate={navigateToView} onStartDeck={startDeck} onStartAdditionalCards={startAdditionalCards} onCreateDemo={createDemo} onSetDeckCoreMode={requestDeckCoreMode} onMoveDeck={deckCommands.moveDeck} onOpenDeckSettings={(deckId) => openDeckSettings(deckId)} onSetDeckExpanded={deckCommands.saveDeckExpansion} onStartExamUnit={startExamUnit} onLoadExamPlanningData={loadExamPlanningData} onLoadExamSummaryAvailability={loadExamSummaryAvailability} onLoadExamLocalCardIds={workspaceHydrationService?.listLocalCardIds} onSaveExamTasks={deckCommands.saveExamTasks} />;
  }

  if (authPhase === "checking-session") {
    return <LoadingScreen message="Sitzung wird geprüft." />;
  }

  if (authPhase === "loading-cloud") {
    return (
      <LoadingScreen
        message={baselineLoadFailed && accountBaselineState === "uninitialized"
          ? "Daten konnten auf diesem Gerät noch nicht geladen werden."
          : "Deine Cloud-Daten werden geladen."}
        onRetry={baselineLoadFailed ? retryCloudBootstrap : undefined}
      />
    );
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
        showMagicLink={magicLinkEnabled}
        onUpdatePassword={handleUpdatePassword}
      />
    );
  }

  if (!shouldShowAppShell(authPhase) || !workspaceRepository || !state || !deckCommands || !cardEditorServices) {
    return <LoadingScreen />;
  }

  const studyDeck = studyRequest ? study.decks?.find((deck) => deck.id === studyRequest.deckId) ?? null : null;
  const deckSettingsDialog = deckSettings ? (
    <React.Suspense fallback={null}>
      <DeckSettingsScreen
        section={deckSettings.section}
        onSelectSection={(section) => settings.selectSettingsOverlay({ deckSettings: { deckId: deckSettings.deckId, section } })}
        deck={state.decks.find((deck) => deck.id === deckSettings.deckId) ?? null}
        decks={state.decks}
        learningProfiles={globalSchedulerPreferences.learningProfiles}
        onSaveSettings={deckCommands.saveDeckSettings}
        onApplyLearningProfile={(deckId, learning: DeckLearningSettingsDraft) => deckCommands.saveDeckLearningSettings(deckId, learning)}
        onSaveLearningProfiles={deckCommands.saveLearningProfiles}
        onDraftStateChange={settings.handleSettingsDraftStateChange}
        onRequestContextAction={settings.requestSettingsContextAction}
        onCreateSubdeck={openDeckCreation}
        onDeleteDeck={async (deckId) => {
          const result = await deckCommands.deleteDeck(deckId);
          if (result) {
            const current = getCurrentRoute();
            const deleted = new Set(result.deletedDeckIds);
            navigateToRoute(current.mode === "study"
              ? createViewRoute("lernen")
              : createViewRoute(current.viewId, { ...current, deckSettings: undefined, ...(current.focusedDeckId && deleted.has(current.focusedDeckId) ? { focusedDeckId: undefined, selectedCardId: undefined } : {}) }), { replace: true });
          }
          return result;
        }}
        onSelectDeck={(deckId) => settings.selectSettingsOverlay({ deckSettings: { deckId, section: deckSettings.section } })}
        onOpenGlobalSettings={() => openSettings("tagesrunde")}
        variantGenerationRunning={variantBatch.running}
        onGenerateVariants={workspaceHydrationService ? (deck, mode) => variantBatch.start(deck, { mode }) : undefined}
        offlineDeck={offlineDeck}
        bodyCache={focusedDeckBodyCache}
        onDownloadDeck={workspaceHydrationService && workspaceRepository ? async (deckId) => {
          const refreshDownload = async () => {
            const record = await workspaceRepository.getOfflineDeck(deckId);
            if (record) workspaceStore.set((current) => ({ offlineDecks: { ...current.offlineDecks, [deckId]: record } }));
          };
          await workspaceHydrationService.downloadDeck(deckId, () => { void refreshDownload(); });
          await refreshDownload();
        } : undefined}
        onRemoveDeckDownload={workspaceHydrationService ? async (deckId) => {
          await workspaceHydrationService.removeDeckDownload(deckId);
          workspaceStore.set((current) => ({ offlineDecks: Object.fromEntries(Object.entries(current.offlineDecks).filter(([id]) => id !== deckId)) }));
        } : undefined}
        onClose={settings.closeSettings}
        footer={settings.settingsDraftOpen ? (
          <SettingsSaveBar
            {...settings.saveBar}
            open
            mode={state.decks.some((deck) => deck.parentDeckId === deckSettings.deckId) ? "deck-tree" : "deck"}
          />
        ) : null}
      />
    </React.Suspense>
  ) : null;

  if (studyRequest && !study.decks) return <LoadingScreen message="Lernsitzung wird vorbereitet." />;
  if (studyRequest && studyDeck) {
    return (
      <NoteLayoutContext.Provider value={noteLayout}><React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={study.decks ?? [studyDeck]}
          notes={study.notes}
          answeredToday={study.answeredToday}
          deckId={studyDeck.id}
          mediaStore={mediaStore}
          getNow={getLearningNow}
          learningDayKey={learningDayKey}
          dayStartHour={globalSchedulerPreferences.dayStartHour}
          learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
          easyDays={globalSchedulerPreferences.easyDays}
          dueForecast={study.dueForecast}
          timeZone={learningTimeZone}
          simulationOffsetMinutes={simulationOffsetMinutes}
          pomodoroTimer={pomodoroTimer}
          onStartPomodoro={startPomodoro}
          onExit={leaveStudy}
          onReturnToLearn={leaveStudy}
          onEditCard={editStudyCard}
          onEditDeck={editStudyDeck}
          shortcutsSuspended={Boolean(deckSettings)}
          flagNames={cardEditorServices.flagNames}
          onSetCardStudyState={setStudyCardStudyState}
          onSetDeckReviewOrder={setStudyDeckReviewOrder}
          onReview={recordReview}
          onAskCardHelp={askStudyCardHelp}
          sessionPlan={studySessionPlan}
          bufferSize={study.bufferSize}
          hasMoreCards={study.hasMoreCards}
          onLoadMoreCards={loadMoreStudyCards}
        />
      </React.Suspense>{deckSettingsDialog}</NoteLayoutContext.Provider>
    );
  }

  const pendingCardNavigation = pendingNavigation === "card";
  const coreEnableDeck = coreEnableDeckId ? state.decks.find((deck) => deck.id === coreEnableDeckId) ?? null : null;

  return (
    <main className="min-h-dvh min-w-0 overflow-x-clip bg-core-surface text-core-text xl:h-dvh xl:overflow-y-hidden">
      <div className="grid min-h-dvh min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-x-clip bg-core-canvas xl:h-dvh xl:min-h-0 xl:overflow-hidden">
        <AppNavigation
          navigationItems={navigationItems}
          activeView={activeView === "kartenstapel" && deckContent ? "lernen" : activeView}
          simulationOffsetMinutes={simulationOffsetMinutes}
          simulationDateLabel={formatSimulationDate(learningNow)}
          pomodoroTimer={pomodoroTimer}
          manualSync={state.profile.uiPreferences.syncIntervalMinutes === 0}
          onSyncNow={() => void syncNow()}
          onOpenSyncSettings={(target) => openSettings(target === "sync" ? "daten" : "konflikte")}
          settingsOpen={Boolean(settingsSection)}
          onOpenSettings={() => openSettings("start")}
          onPreloadSettings={() => {
            if (featurePreloadingAllowed() && allowsBrowserSpeculativePreloading()) void preloadSettingsDialog();
          }}
          onPreloadView={(viewId) => {
            if (featurePreloadingAllowed() && allowsBrowserSpeculativePreloading()) void preloadAppView(viewId);
          }}
          onNavigate={(viewId) => navigateToView(viewId, { focusedDeckId })}
          onResetSimulation={() => changeSimulationOffset(0)}
        />

        <section ref={screenRegionRef} className="core-screen-region min-w-0 overflow-x-clip px-4 pb-32 pt-8 outline-none sm:px-6 xl:relative xl:overflow-x-hidden xl:overflow-y-auto xl:py-10" tabIndex={-1} aria-label="Seiteninhalt">
          <div className="mx-auto w-full min-w-0 max-w-7xl">
            <NoteLayoutContext.Provider value={noteLayout}><React.Suspense fallback={<ScreenLoadingFallback />}>{renderActiveView()}</React.Suspense></NoteLayoutContext.Provider>
          </div>
        </section>
      </div>
      {settingsSection ? (
        <React.Suspense fallback={null}>
          <SettingsDialog
            section={settingsSection}
            onSelectSection={(section) => settings.selectSettingsOverlay({ settingsSection: section })}
            onClose={settings.closeSettings}
            footer={settings.settingsDraftOpen ? (
              <SettingsSaveBar
                {...settings.saveBar}
                open
                mode={settingsSectionGroup(settingsSection) === "learning" ? "learning-global" : "global"}
              />
            ) : null}
          >
            <React.Suspense fallback={<ScreenLoadingFallback />}>
              {settingsSectionGroup(settingsSection) === "general" ? (
                <SettingsScreen
                  section={settingsContentSection(settingsSection) as GeneralSettingsSection}
                  focusConflicts={settingsSection === "konflikte"}
                  profile={state.profile}
                  onSaveSettings={deckCommands.saveGeneralSettings}
                  onDraftStateChange={settings.handleSettingsDraftStateChange}
                  onSyncNow={syncNow}
                  onListConflicts={listSyncConflicts}
                  onResolveConflict={resolveSyncConflict}
                  onSignOut={() => settings.requestSettingsContextAction(signOut) ?? Promise.resolve()}
                  onNavigate={navigateToView}
                />
              ) : (
                <GlobalCardSettingsScreen
                  section={settingsContentSection(settingsSection) as LearningSettingsSection}
                  timeZone={learningTimeZone}
                  globalSchedulerPreferences={globalSchedulerPreferences}
                  flagNames={state.profile.uiPreferences.flagNames}
                  learningProfiles={globalSchedulerPreferences.learningProfiles}
                  onSaveLearningProfiles={deckCommands.saveLearningProfiles}
                  onSaveSettings={deckCommands.saveGlobalCardSettings}
                  onDraftStateChange={settings.handleSettingsDraftStateChange}
                  onNavigate={navigateToView}
                  decks={state.decks}
                  onOpenDeckSettings={(deckId) => openDeckSettings(deckId)}
                  simulationOffsetMinutes={simulationOffsetMinutes}
                  simulationDateLabel={formatSimulationDate(learningNow)}
                  pomodoroTimer={pomodoroTimer}
                  onStartPomodoro={startPomodoro}
                />
              )}
            </React.Suspense>
          </SettingsDialog>
        </React.Suspense>
      ) : null}
      {deckSettingsDialog}
      {variantBatch.batch ? (
        <VariantGenerationBar
          deck={variantBatch.batch.deck}
          title={variantBatch.batch.mode === "refresh" ? "Varianten neu generieren" : "Varianten generieren"}
          done={variantBatch.batch.done}
          total={variantBatch.batch.total}
          outcome={variantBatch.batch.outcome}
          onCancel={variantBatch.cancel}
          onClose={variantBatch.dismiss}
        />
      ) : null}
      <ActionDialog
        open={Boolean(coreEnableDeck)}
        title={`CoRe für „${coreEnableDeck?.name ?? ""}“ einschalten`}
        description={(
          <div className="grid gap-3">
            <p>CoRe fragt gut gefestigte Karten auch umformuliert ab, damit du das Wissen statt des Wortlauts lernst. Die Varianten werden automatisch generiert.</p>
            <ul className="grid list-disc gap-1 pl-5 core-body text-core-muted">
              <li>Varianten erscheinen beim Lernen erst, wenn eine Karte die Haltbarkeit des Stapels erreicht (Standard: 21 Tage).</li>
              <li>Nur der bereinigte Text von Frage und Antwort geht an GPT-6 Luna; der Anbieter speichert ihn nicht.</li>
            </ul>
            <label className="flex items-start gap-3 rounded-control border border-core-border p-3 core-body font-semibold text-core-text">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-core-action"
                checked={generateOnCoreEnable}
                disabled={variantBatch.running}
                data-testid="core-enable-generate-variants"
                onChange={(event) => setGenerateOnCoreEnable(event.target.checked)}
              />
              <span>
                Jetzt Varianten für bis zu {CARD_VARIANT_BATCH_LIMIT} Karten generieren
                <span className="mt-0.5 block core-caption font-normal text-core-muted">
                  {variantBatch.running ? "Es läuft bereits eine Generierung; starte sie danach in den Stapeleinstellungen." : "Läuft im Hintergrund, solange CoRe geöffnet ist."}
                </span>
              </span>
            </label>
          </div>
        )}
        confirmLabel="Einschalten"
        cancelLabel="Abbrechen"
        actionIcons={{ confirm: Sparkles }}
        onCancel={() => setCoreEnableDeckId(null)}
        onConfirm={confirmCoreEnable}
      />
      <ActionDialog
        open={Boolean(pendingNavigation)}
        title={pendingCardNavigation ? "Änderungen übernehmen?" : pendingNavigation === "exams" ? "Änderungen verwerfen?" : "Ungespeicherten Entwurf verlassen?"}
        description={pendingCardNavigation
          ? "Du hast ungespeicherte Änderungen an dieser Karte. Speichere oder verwirf sie, bevor du die Kartenverwaltung verlässt."
          : pendingNavigation === "exams"
            ? "Deine Änderungen an der Prüfungsplanung wurden noch nicht gespeichert."
            : creationMethod === "ai-source"
              ? "Deine ausgewählte Quelle und deine Einstellungen werden verworfen."
              : "Deine bereits gespeicherten Karten bleiben erhalten. Nur die aktuell eingegebenen, noch nicht gespeicherten Inhalte würden verworfen."}
        confirmLabel={pendingCardNavigation ? "Speichern" : "Verwerfen und verlassen"}
        cancelLabel="Weiter bearbeiten"
        discardLabel={pendingCardNavigation ? "Verwerfen" : undefined}
        confirmLoading={navigation.savingPendingNavigation}
        destructive={!pendingCardNavigation}
        restoreFocus={(reason) => {
          if (reason !== "cancel") return;
          navigation.focusPendingDraft();
        }}
        onCancel={navigation.cancelPendingNavigation}
        onDiscard={pendingCardNavigation ? navigation.discardPendingNavigation : undefined}
        onConfirm={() => void navigation.confirmPendingNavigation()}
      />
      <ActionDialog
        open={Boolean(emptyStudyStart)}
        title={emptyStudyStart?.limitSummary ? "Tageslimit erreicht" : "Keine fälligen Karten"}
        description={emptyStudyStart ? (
          <div className="grid gap-2">
            <p>
              {emptyStudyStart.limitSummary
                ? `„${emptyStudyStart.deckName}“: ${emptyStudyStart.limitSummary}`
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
          openDeckSettings(target.deckId, "neue-karten");
        } : undefined}
      />
      <ActionDialog
        open={Boolean(studyPreparationFailure)}
        title="Lernsitzung konnte nicht vorbereitet werden"
        description={studyPreparationFailure?.message}
        cancelLabel="Schließen"
        confirmLabel="Erneut versuchen"
        onCancel={() => setStudyPreparationFailure(null)}
        onConfirm={() => {
          const retry = studyPreparationFailure;
          setStudyPreparationFailure(null);
          const deck = retry ? workspaceStore.get().state?.decks.find((candidate) => candidate.id === retry.deckId) : null;
          if (retry && deck) startDeck(deck);
        }}
      />
    </main>
  );
}
