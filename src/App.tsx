import React from "react";
import type { CoreMode } from "./coreTypes.ts";
import { ArrowRight, Database, Layers, Sparkles } from "lucide-react";
import { authPhases, createSyncPendingStatus, createSyncSavingStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { settingsSectionGroup, type AppViewId } from "./appNavigation.ts";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import { CreationScreenWiring, DashboardScreenWiring, DeckSettingsScreenWiring, DecksScreenWiring, ExamPlanningScreenWiring, GlobalCardSettingsScreenWiring, HelpScreen, LearnScreenWiring, prefetchAppView, preloadAppView, preloadSettingsDialog, SettingsDialog, SettingsScreenWiring, SimulatorScreenWiring, StatisticsScreenWiring, StudyModeWiring } from "./appFeatureLoading.tsx";
import { allowsBrowserSpeculativePreloading, startAdaptiveFeaturePreloading } from "./appFeaturePreload.ts";
import { createCardCommands } from "./cardCommands.ts";
import { createDeckCommands } from "./deckCommands.ts";
import { createDefaultDeckSettings } from "./coreModel.ts";
import { createImportCommands } from "./importCommands.ts";
import { formatLimitSummary } from "./screens/screenConstants.ts";
import { createMenuModel } from "./menuModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import { createWorkspaceHydrationService } from "./workspaceHydrationService.ts";
import { createStudyPreparation } from "./studyPreparation.ts";
import { useStudySession } from "./useStudySession.ts";
import { useStudyStart } from "./useStudyStart.ts";
import { useAccountWorkspace } from "./useAccountWorkspace.ts";
import { AppServicesContext } from "./useAppServices.ts";
import { useImportSession } from "./useImportSession.ts";
import { useLearningClock } from "./useLearningClock.ts";
import { usePomodoroTimer } from "./usePomodoroTimer.ts";
import { useWorkspaceSync } from "./useWorkspaceSync.ts";
import { useWorkspaceStore, useWorkspaceValue, WorkspaceStoreContext } from "./useWorkspaceStore.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";
import { formatSimulationDate } from "./simulationClock.ts";
import { useNavigationGuard } from "./useNavigationGuard.ts";
import { useSettingsOverlay } from "./useSettingsOverlay.ts";
import { requestPersistentWorkspaceStorage } from "./workspaceStorage.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { AppNavigation } from "./ui/AppNavigation.tsx";
import { ActionDialog, EmptyState, OrbIcon, SoftPanel } from "./ui/coreUi.tsx";
import { ActionButton } from "./ui/actionUi.tsx";
import { CoreCheckbox } from "./ui/formControls.tsx";
import { CoreWordmark } from "./ui/CoreWordmark.tsx";
import { useSuccessToast } from "./ui/feedbackUi.tsx";
import { NoteLayoutContext, type NoteLayoutSource } from "./ui/noteLayoutContext.ts";
import { useStableCallback } from "./ui/useStableCallback.ts";
import { VariantGenerationBar } from "./ui/VariantGenerationBar.tsx";
import { useCardVariantBatch } from "./useCardVariantBatch.ts";
import { CARD_VARIANT_BATCH_LIMIT } from "./cardVariantBatch.ts";
import { SettingsSaveBar } from "./ui/SettingsSaveBar.tsx";
const menu = createMenuModel();
const magicLinkEnabled = import.meta.env.VITE_ENABLE_MAGIC_LINK === "true";

/** Each view's wiring, which assembles its screen's props and loads with the screen. */
const viewScreens: Record<AppViewId, React.ComponentType> = {
  uebersicht: DashboardScreenWiring,
  kartenstapel: DecksScreenWiring,
  "neue-karten": CreationScreenWiring,
  lernen: LearnScreenWiring,
  pruefungen: ExamPlanningScreenWiring,
  statistik: StatisticsScreenWiring,
  simulator: SimulatorScreenWiring,
  hilfe: HelpScreen,
};

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
  const navigationItems = React.useMemo(() => menu.listNavigationItems(), []);
  const setSuccessToast = useSuccessToast();
  const account = useAccountWorkspace({
    opened(boot) {
      workspaceStore.clear();
      sync.setAppState(boot.state);
      workspaceStore.set({ deckSummaries: boot.initialDeckSummaries.summaries, studyHeatmap: boot.initialDeckSummaries.studyHeatmap });
      sync.setSyncStatus(boot.pendingCount > 0 ? createSyncPendingStatus(boot.pendingCount) : createSyncSavingStatus());
    },
    cloudState(nextState, status) {
      sync.setAppState(nextState, { preserveCardPages: true });
      sync.setSyncStatus(status);
    },
    syncStatus(status) { sync.setSyncStatus(status); },
    discarded() {
      sync.setAppState(null);
      workspaceStore.clear();
    },
    signedOut() {
      resetBrowserRouteToDefault();
      clock.changeSimulationOffset(0);
      importSession.discard();
    },
  });
  const { supabase, supabaseUrl, authPhase, cloudUser, workspaceRepository, syncEngine, syncEngineRef, bootRunRef } = account;
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const workspaceRevision = useWorkspaceValue((snapshot) => snapshot.revision);
  const [mediaStore, setMediaStore] = React.useState<AccountMediaStore | null>(null);
  const featurePreloadingAllowed = () => !["saving", "pending"].includes(workspaceStore.get().syncStatus.status);
  const screenRegionRef = React.useRef<HTMLElement | null>(null);
  const navigation = useNavigationGuard({ authPhase, defaultViewId: menu.defaultViewId, settingsBlocksNavigation: (route) => settings.blocksNavigation(route) });
  const { activeView, studyRequest, focusedDeckId, deckContent, creationMethod, settingsSection, deckSettings, navigateToView, navigateToViewNow, resetBrowserRouteToDefault, pendingNavigation } = navigation;
  const settings = useSettingsOverlay(navigation);
  const { openSettings, openDeckSettings } = settings;
  const clock = useLearningClock(activeView);
  const { learningNow, learningTimeZone, globalSchedulerPreferences } = clock;
  const pomodoro = usePomodoroTimer(cloudUser?.id);
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
  const sync = useWorkspaceSync({ authPhase, repository: workspaceRepository, syncEngine, hydration: workspaceHydrationService, abortCardPageRequests: () => cardCommands?.abortCardPageRequests() });

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

  // The commands live as long as the workspace; what changes within it they read when they run.
  const latestRefresh = useStableCallback(sync.refresh);
  const latestHydration = useStableCallback(() => workspaceHydrationService);
  const latestLearningNow = useStableCallback(clock.getLearningNow);
  const latestSyncNow = useStableCallback(sync.syncNow);
  const requestSync = () => syncEngineRef.current?.requestSync();
  const cardCommands = React.useMemo(() => workspaceRepository ? createCardCommands({
    store: workspaceStore, repository: workspaceRepository, hydration: latestHydration, cloud: supabase ?? null,
    syncEngine: () => syncEngineRef.current, refresh: latestRefresh, now: latestLearningNow, bootRun: bootRunRef,
  }) : null, [bootRunRef, latestHydration, latestLearningNow, latestRefresh, supabase, syncEngineRef, workspaceRepository, workspaceStore]);
  const studyPreparation = React.useMemo(() => workspaceRepository ? createStudyPreparation({
    store: workspaceStore, repository: workspaceRepository, hydration: workspaceHydrationService, cloud: supabase ?? null, now: latestLearningNow,
  }) : null, [latestLearningNow, supabase, workspaceHydrationService, workspaceRepository, workspaceStore]);
  const study = useStudySession({ preparation: studyPreparation, repository: workspaceRepository, cardCommands, refresh: latestRefresh, requestSync, now: learningNow });
  const deckCommands = React.useMemo(() => workspaceRepository ? createDeckCommands({
    store: workspaceStore, repository: workspaceRepository, refresh: latestRefresh,
    requestSync: () => syncEngineRef.current?.requestSync(), syncNow: latestSyncNow, updateStudyDecks: study.setDecks,
  }) : null, [latestRefresh, latestSyncNow, study.setDecks, syncEngineRef, workspaceRepository, workspaceStore]);
  const studyStart = useStudyStart({ preparation: studyPreparation, session: study, navigation, deckCommands, clock });
  const importCommands = React.useMemo(() => workspaceRepository ? createImportCommands({
    store: workspaceStore, repository: workspaceRepository, hydration: latestHydration, cloud: supabase ?? null,
    syncEngine: () => syncEngineRef.current, refresh: latestRefresh,
  }) : null, [latestHydration, latestRefresh, supabase, syncEngineRef, workspaceRepository, workspaceStore]);
  const importSession = useImportSession(importCommands, cloudUser?.id ?? null, authPhase === "ready" && Boolean(syncEngine) && Boolean(supabase));
  const flagNamesKey = state?.profile.uiPreferences.flagNames.join("\n") ?? "";
  const cardEditorServices = React.useMemo(() => cardCommands?.createCardEditorServices(flagNamesKey.split("\n"), openSettings) ?? null, [cardCommands, flagNamesKey, openSettings]);
  const variantBatch = useCardVariantBatch({ cards: workspaceHydrationService, generate: (...args) => cardCommands!.generateDeckCardVariant(...args), onToast: setSuccessToast });

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
      ensureCloudParents: async () => { await sync.syncNow(); },
    });
  }, [authPhase, mediaStore, syncEngine, workspaceRepository]);

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

  if (authPhase === "checking-session") {
    return <LoadingScreen message="Sitzung wird geprüft." />;
  }

  if (authPhase === "loading-cloud") {
    return (
      <LoadingScreen
        message={account.baselineLoadFailed && account.accountBaselineState === "uninitialized"
          ? "Daten konnten auf diesem Gerät noch nicht geladen werden."
          : "Deine Cloud-Daten werden geladen."}
        onRetry={account.baselineLoadFailed ? account.retryCloudBootstrap : undefined}
      />
    );
  }

  if (shouldShowAuthGate(authPhase)) {
    return (
      <AuthGateScreen
        configured={Boolean(supabase)}
        recoveryMode={authPhase === authPhases.passwordRecovery}
        busy={account.authBusy}
        message={account.authMessage}
        messageType={account.authMessageType}
        onSignIn={account.signIn}
        onSignUp={account.signUp}
        onResetPassword={account.resetPassword}
        onMagicLink={account.sendMagicLink}
        showMagicLink={magicLinkEnabled}
        onUpdatePassword={account.updatePassword}
      />
    );
  }

  if (!shouldShowAppShell(authPhase) || !workspaceRepository || !state || !cardCommands || !deckCommands || !cardEditorServices || !studyPreparation || !importCommands) {
    return <LoadingScreen />;
  }

  // Built with every render: the wirings render with the shell anyway, and StudyMode only for changed session data.
  const services = {
    navigation, settings, clock, pomodoro, sync, study, studyStart, studyPreparation, cardCommands, cardEditorServices, deckCommands,
    importCommands, importSession, variantBatch, requestDeckCoreMode, signOut: () => account.signOut(workspaceStore.get().state?.profile),
    repository: workspaceRepository, hydration: workspaceHydrationService, cloud: supabase ?? null, mediaStore,
  };
  const studyDeck = studyRequest ? study.decks?.find((deck) => deck.id === studyRequest.deckId) ?? null : null;
  const deckSettingsDialog = deckSettings ? <React.Suspense fallback={null}><DeckSettingsScreenWiring /></React.Suspense> : null;

  if (studyRequest && !study.decks) return <LoadingScreen message="Lernsitzung wird vorbereitet." />;
  if (studyRequest && studyDeck) {
    return (
      <AppServicesContext.Provider value={services}><NoteLayoutContext.Provider value={noteLayout}><React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyModeWiring />
      </React.Suspense>{deckSettingsDialog}</NoteLayoutContext.Provider></AppServicesContext.Provider>
    );
  }

  const ActiveScreen = viewScreens[activeView];
  const pendingCardNavigation = pendingNavigation === "card";
  const coreEnableDeck = coreEnableDeckId ? state.decks.find((deck) => deck.id === coreEnableDeckId) ?? null : null;
  const { emptyStudyStart, studyPreparationFailure } = studyStart;

  return (
    <AppServicesContext.Provider value={services}>
      <main className="min-h-dvh min-w-0 overflow-x-clip bg-core-surface text-core-text xl:h-dvh xl:overflow-y-hidden">
        <div className="grid min-h-dvh min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-x-clip bg-core-canvas xl:h-dvh xl:min-h-0 xl:overflow-hidden">
          <AppNavigation
            navigationItems={navigationItems}
            activeView={activeView === "kartenstapel" && deckContent ? "lernen" : activeView}
            simulationOffsetMinutes={clock.simulationOffsetMinutes}
            simulationDateLabel={formatSimulationDate(learningNow)}
            pomodoroTimer={pomodoro.pomodoroTimer}
            manualSync={state.profile.uiPreferences.syncIntervalMinutes === 0}
            onSyncNow={() => void sync.syncNow()}
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
            onResetSimulation={() => clock.changeSimulationOffset(0)}
          />

          <section ref={screenRegionRef} className="core-screen-region min-w-0 overflow-x-clip px-4 pb-32 pt-8 outline-none sm:px-6 xl:relative xl:overflow-x-hidden xl:overflow-y-auto xl:py-10" tabIndex={-1} aria-label="Seiteninhalt">
            <div className="mx-auto w-full min-w-0 max-w-7xl">
              <NoteLayoutContext.Provider value={noteLayout}><React.Suspense fallback={<ScreenLoadingFallback />}>
                {studyRequest && !state.decks.some((deck) => deck.id === studyRequest.deckId) ? (
                  <EmptyState
                    icon={Layers}
                    title="Stapel nicht gefunden oder nicht verfügbar."
                    body="Die verlinkte Lernsitzung kann nicht geöffnet werden, weil der Stapel gelöscht wurde oder in diesem Account nicht verfügbar ist."
                    action={
                      <div className="flex flex-wrap justify-center gap-3">
                        <button type="button" onClick={() => navigateToView("lernen", { focusedDeckId: null })} className="inline-flex min-h-control items-center rounded-control bg-core-subtle px-6 core-body font-semibold text-core-action">
                          Zu Lernen
                        </button>
                        <button type="button" onClick={() => navigateToViewNow("kartenstapel", { focusedDeckId: null, selectedCardId: null })} className="inline-flex min-h-control items-center rounded-control border border-core-border bg-core-surface px-6 core-body font-semibold text-core-action">
                          Zur Kartenverwaltung
                        </button>
                      </div>
                    }
                  />
                ) : <ActiveScreen key={activeView === "kartenstapel" ? (deckContent ? `content-${focusedDeckId}` : "library") : undefined} />}
              </React.Suspense></NoteLayoutContext.Provider>
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
                {settingsSectionGroup(settingsSection) === "general" ? <SettingsScreenWiring /> : <GlobalCardSettingsScreenWiring />}
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
              <CoreCheckbox
                className="flex rounded-control border border-core-border px-3 py-2"
                checked={generateOnCoreEnable}
                disabled={variantBatch.running}
                data-testid="core-enable-generate-variants"
                onCheckedChange={setGenerateOnCoreEnable}
                label={`Jetzt Varianten für bis zu ${CARD_VARIANT_BATCH_LIMIT} Karten generieren`}
                description={variantBatch.running ? "Es läuft bereits eine Generierung; starte sie danach in den Stapeleinstellungen." : "Läuft im Hintergrund, solange CoRe geöffnet ist."}
              />
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
                  ? `„${emptyStudyStart.deckName}“: ${formatLimitSummary(emptyStudyStart.limitSummary.hiddenDueCount, emptyStudyStart.limitSummary.hiddenNewCount)}`
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
          onCancel={studyStart.dismissEmptyStudyStart}
          onConfirm={emptyStudyStart?.hasAdditionalNewCards ? () => {
            const target = emptyStudyStart;
            studyStart.dismissEmptyStudyStart();
            openDeckSettings(target.deckId, "neue-karten");
          } : undefined}
        />
        <ActionDialog
          open={Boolean(studyPreparationFailure)}
          title="Lernsitzung konnte nicht vorbereitet werden"
          description={studyPreparationFailure?.message}
          cancelLabel="Schließen"
          confirmLabel="Erneut versuchen"
          onCancel={studyStart.dismissStudyPreparationFailure}
          onConfirm={() => {
            const retry = studyPreparationFailure;
            studyStart.dismissStudyPreparationFailure();
            const deck = retry ? workspaceStore.get().state?.decks.find((candidate) => candidate.id === retry.deckId) : null;
            if (retry && deck) studyStart.startDeck(deck);
          }}
        />
      </main>
    </AppServicesContext.Provider>
  );
}
