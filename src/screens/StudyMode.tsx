import React from "react";
import { Anchor, Ban, CheckCircle2, CircleAlert, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { StudyModeProps } from "../appScreenProps.ts";
import { DEFAULT_EASY_DAYS, createEasyDaysDueCounts } from "../easyDays.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { createCoreNoteTypeDefinition, isLearningItemMarked } from "../coreModel.ts";
import { resolveReviewShortcut } from "../reviewShortcuts.ts";
import { createReviewResponseTimer } from "../reviewTiming.ts";
import { formatSimulationDate, formatSimulationDuration } from "../simulationClock.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  createDailyReviewQueue,
  createDailyReviewSessionIndex,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  reconcileDailyReviewSessionState,
  removeDailyReviewSessionItem,
  recordVariantFeedback,
  type DailyReviewSessionState,
  updateDailyReviewSessionIndex,
} from "../reviewService.ts";
import { useCardMediaUrls } from "../ui/cardMedia.tsx";
import { CardPresentationSurface } from "../ui/CardPresentationSurface.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { DailyReviewProgress } from "../ui/DailyReviewProgress.tsx";
import { PomodoroProgress } from "../ui/pomodoroTimerUi.tsx";
import { StudyCardContent } from "../ui/StudyCardContent.tsx";
import { StudySettingsOverlay } from "../ui/StudySettingsOverlay.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { formatReviewIntervalLabel, ratingButtons } from "./screenConstants.ts";
import type { Deck, LearningItemStudyStatePatch, ReviewEvent, ReviewRating, ReviewState } from "../coreTypes.ts";

function formatLimitSummary(hiddenDueCount: number, hiddenNewCount: number) {
  const parts = [
    hiddenDueCount > 0 ? `${hiddenDueCount} ${hiddenDueCount === 1 ? "fällige Karte" : "fällige Karten"}` : "",
    hiddenNewCount > 0 ? `${hiddenNewCount} ${hiddenNewCount === 1 ? "neue Karte" : "neue Karten"}` : "",
  ].filter(Boolean);
  return `${parts.join(" und ")} ${parts.length === 1 ? "bleibt" : "bleiben"} wegen deiner Tageslimits für später vorgemerkt.`;
}

function createEasyDaysContext(decks: Deck[], easyDays: typeof DEFAULT_EASY_DAYS, now: string | number | Date, dayStartHour: number, timeZone?: string) {
  return {
    easyDays,
    dueCountsByDay: createEasyDaysDueCounts(decks.flatMap((candidate) => candidate.cards ?? []), now, { dayStartHour, timeZone }),
    dayStartHour,
    timeZone,
  };
}

export function StudyMode({ deck, decks, noteTypeDefinitions = [], deckId, variantSession, mediaStore, getNow, learningDayKey, dayStartHour = 0, learnAheadMinutes = 20, easyDays = DEFAULT_EASY_DAYS, timeZone, simulationOffsetMinutes, pomodoroTimer, onStartPomodoro, onExit, onReturnToLearn, onEditCard, onEditDeck, onSetCardStudyState, onSetDeckReviewOrder, onCardUpdated, onReview, hasMoreCards = false, onLoadMoreCards }: StudyModeProps) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const sessionIndexRef = React.useRef<ReturnType<typeof createDailyReviewSessionIndex> | null>(null);
  sessionIndexRef.current ??= createDailyReviewSessionIndex(decks);
  const queuePlanRef = React.useRef<{
    key: string;
    easyDaysContext: ReturnType<typeof createEasyDaysContext>;
    queue: ReturnType<typeof createDailyReviewQueue>;
  } | null>(null);
  const [reviewSession, setReviewSession] = React.useState<DailyReviewSessionState | null>(null);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [selectedChoices, setSelectedChoices] = React.useState<string[]>([]);
  const [feedbackStatus, setFeedbackStatus] = React.useState("");
  const answerContentRef = React.useRef<HTMLDivElement>(null);
  const questionContentRef = React.useRef<HTMLDivElement>(null);
  const completionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const feedbackDeckRef = React.useRef<Deck | null>(null);
  const loadingMoreCardsRef = React.useRef(false);
  const effectiveLearningDayKey = learningDayKey || getLearningDayKey(getNow(), { dayStartHour, timeZone }) || "";
  const previousLearningDayKeyRef = React.useRef(effectiveLearningDayKey);
  const setSuccessToast = useSuccessToast();
  const responseTimer = React.useMemo(() => createReviewResponseTimer(), []);
  const rootDeck = sessionDecks.find((candidate) => candidate.id === deckId) ?? deck ?? sessionDecks[0] ?? null;
  const queuePlanKey = JSON.stringify([
    rootDeck?.id ?? null,
    effectiveLearningDayKey,
    dayStartHour,
    learnAheadMinutes,
    timeZone ?? null,
    variantSession,
    easyDays,
    rootDeck?.deckSettings ?? null,
    sessionDecks.map((candidate) => `${candidate.id}:${candidate.cards.length}:${candidate.cards.at(-1)?.id ?? ""}`),
  ]);
  if (
    !queuePlanRef.current
    || queuePlanRef.current.key !== queuePlanKey
  ) {
    const planNow = getNow();
    const easyDaysContext = createEasyDaysContext(sessionDecks, easyDays, planNow, dayStartHour, timeZone);
    queuePlanRef.current = {
      key: queuePlanKey,
      easyDaysContext,
      queue: createDailyReviewQueue(sessionDecks, {
        deckId: rootDeck?.id,
        now: planNow,
        dayStartHour,
        learnAheadMinutes,
        timeZone,
        easyDaysContext,
        language: "de",
        variantSession,
      }),
    };
  }
  const { queue, easyDaysContext } = queuePlanRef.current;
  const effectiveReviewSession = reviewSession ?? createDailyReviewSessionState(queue.items);
  const current = React.useMemo(
    () => getNextDailyReviewSessionItem(sessionDecks, effectiveReviewSession, { deckId: rootDeck?.id, now: getNow(), dayStartHour, learnAheadMinutes, timeZone, easyDaysContext, language: "de", variantSession, sessionIndex: sessionIndexRef.current! }),
    [dayStartHour, easyDaysContext, effectiveLearningDayKey, getNow, learnAheadMinutes, sessionDecks, effectiveReviewSession, rootDeck?.id, timeZone, variantSession],
  );
  const currentDeck = sessionDecks.find((candidate) => candidate.id === current?.deckId) ?? rootDeck;
  const sessionTotal = effectiveReviewSession.initialKeys.length;
  const completedInitialCount = effectiveReviewSession.completedInitialKeys.length;
  const repeatCount = effectiveReviewSession.repeatCount;
  const answeredCount = completedInitialCount + repeatCount;
  const sessionDailyProgress = {
    ...queue.dailyProgress,
    completedTodayCount: Math.min(queue.dailyProgress.total, queue.dailyProgress.completedTodayCount + completedInitialCount),
  };
  const hasWaitingLearningCards = !current && queue.dailyProgress.inProgressCount > 0;
  const limitReachedAtStart = !current && answeredCount === 0 && queue.total === 0 && queue.limitSummary.reached;
  const limitSummaryText = formatLimitSummary(queue.limitSummary.hiddenDueCount, queue.limitSummary.hiddenNewCount);
  const sourceCard = current?.learningItem ?? null;
  const presentationDefinition = React.useMemo(() => {
    if (!sourceCard) return null;
    return noteTypeDefinitions.find((definition) => definition.id === sourceCard.noteTypeDefinitionId)
      ?? createCoreNoteTypeDefinition({
        document: sourceCard.contentDocument,
        kind: sourceCard.kind === "cloze" ? "cloze" : "normal",
        interaction: sourceCard.kind === "single-choice" || sourceCard.kind === "multiple-choice" ? "choice" : undefined,
      });
  }, [noteTypeDefinitions, sourceCard]);
  const isCurrentVariant = Boolean(current?.variant);
  const hasAnswerTools = isCurrentVariant;
  const { urls: studyMediaUrls, missing: studyMissingMedia } = useCardMediaUrls(currentDeck, current?.learningItemId, mediaStore);

  React.useEffect(() => {
    setSessionDecks(decks);
    sessionIndexRef.current = createDailyReviewSessionIndex(decks);
    setReviewSession(null);
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSettings(false);
    setSelectedChoices([]);
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }, [deckId, variantSession, decks.length]);

  React.useEffect(() => {
    setReviewSession((currentSession) => currentSession
      ? reconcileDailyReviewSessionState(currentSession, queue.items)
      : createDailyReviewSessionState(queue.items));
  }, [queue.items]);

  React.useEffect(() => {
    if (!onLoadMoreCards || !hasMoreCards || effectiveReviewSession.remainingInitialKeys.length > 25 || loadingMoreCardsRef.current) return;
    loadingMoreCardsRef.current = true;
    void onLoadMoreCards().then((nextDecks) => {
      if (!nextDecks.length) return;
      setSessionDecks((currentDecks) => {
        const pages = new Map(nextDecks.map((candidate) => [candidate.id, candidate]));
        const merged = currentDecks.map((currentDeck) => {
          const page = pages.get(currentDeck.id);
          if (!page) return currentDeck;
          const cards = new Map(currentDeck.cards.map((card) => [card.id, card]));
          for (const card of page.cards) cards.set(card.id, card);
          const events = new Map(currentDeck.reviewEvents.map((event) => [event.id, event]));
          for (const event of page.reviewEvents) events.set(event.id, event);
          return { ...currentDeck, cards: [...cards.values()], reviewEvents: [...events.values()] };
        });
        sessionIndexRef.current = createDailyReviewSessionIndex(merged);
        return merged;
      });
    }).catch(() => undefined).finally(() => { loadingMoreCardsRef.current = false; });
  }, [effectiveReviewSession.remainingInitialKeys.length, hasMoreCards, onLoadMoreCards]);

  React.useEffect(() => {
    if (previousLearningDayKeyRef.current === effectiveLearningDayKey) return;
    previousLearningDayKeyRef.current = effectiveLearningDayKey;
    setReviewSession(createDailyReviewSessionState([
      current ? { deckId: current.deckId, learningItemId: current.learningItemId } : null,
      ...queue.items,
    ]));
  }, [current, effectiveLearningDayKey, queue.items]);

  React.useEffect(() => {
    setSelectedChoices([]);
    if (current) responseTimer.start();
    else responseTimer.reset();
    return () => responseTimer.reset();
  }, [answeredCount, current?.learningItemId, current?.variantId, responseTimer]);

  function replaceSessionDeck(updatedDeck: Deck, nextDecks = sessionDecks) {
    return nextDecks.map((candidate) => (candidate.id === updatedDeck.id ? updatedDeck : candidate));
  }

  function finishOrNext(updatedDeck: Deck, updatedLearningItem: typeof sourceCard, rating: ReviewRating, nextReviewState: ReviewState, reviewedKey: string) {
    if (updatedLearningItem) updateDailyReviewSessionIndex(sessionIndexRef.current!, updatedDeck, updatedLearningItem);
    setReviewSession((session) => session && reviewedKey
      ? advanceDailyReviewSession(session, { key: reviewedKey, rating, nextReviewState })
      : session);
    setShowAnswer(false);
    setShowAnchor(false);
    setSelectedChoices([]);
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }

  function revealChoiceAnswer() {
    if (showAnswer) return;
    setShowAnswer(true);
  }

  function grade(rating: ReviewRating) {
    if (!current || !currentDeck) return;
    const responseTimeMs = responseTimer.stop();
    const reviewEvents = (sessionIndexRef.current?.reviewEventsByKey.get(current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`) ?? [])
      .filter((event) => Boolean(event.id)) as ReviewEvent[];
    const result = answerVariant({
      ...(feedbackDeckRef.current ?? currentDeck),
      cards: [current.learningItem],
      reviewEvents,
    }, current.learningItemId, current.cardVariantId, rating, {
      now: getNow(),
      dayStartHour,
      timeZone,
      easyDaysContext,
      responseTimeMs,
    });
    onReview(result);
    finishOrNext(result.deck, result.updatedCard, rating, result.updatedCard.reviewState, current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`);
  }

  function updateVariant(action: "disable" | "flag", feedbackType?: "fachlich_falsch" | "unklar_formuliert") {
    if (!isCurrentVariant || !currentDeck || !current) return;
    const result = recordVariantFeedback(feedbackDeckRef.current ?? currentDeck, {
      id: current.variantId,
      sourceCardId: current.learningItemId,
      isVariant: true,
    }, { action, feedbackType });
    feedbackDeckRef.current = result.deck;
    if (result.updatedCard) onCardUpdated(result.deck.id, result.updatedCard);
    setFeedbackStatus(action === "disable" ? "Diese Abfrage wird künftig nicht mehr gezeigt." : "Danke. Der ausgewählte Grund wurde gespeichert.");
  }

  function updateCurrentStudyState(patch: LearningItemStudyStatePatch) {
    if (!current) return;
    const updatedDeck = onSetCardStudyState(current.deckId, current.learningItemId, patch);
    if (!updatedDeck) return;
    const nextDecks = replaceSessionDeck(updatedDeck);
    const updatedLearningItem = (updatedDeck.cards ?? []).find((card) => card.id === current.learningItemId);
    if (updatedLearningItem) updateDailyReviewSessionIndex(sessionIndexRef.current!, updatedDeck, updatedLearningItem);
    setSessionDecks(nextDecks);

    if (patch.suspended !== true) return;
    const currentKey = current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`;
    setShowSettings(false);
    setReviewSession((session) => removeDailyReviewSessionItem(session ?? effectiveReviewSession, currentKey));
    setShowAnswer(false);
    setShowAnchor(false);
    setSelectedChoices([]);
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
    setSuccessToast("Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.");
  }

  function updateReviewOrder(newReviewOrder: Deck["deckSettings"]["newReviewOrder"]) {
    if (!rootDeck || rootDeck.deckSettings.newReviewOrder === newReviewOrder) return;
    const updatedRootDeck = onSetDeckReviewOrder(rootDeck.id, newReviewOrder);
    if (!updatedRootDeck) return;
    const nextDecks = replaceSessionDeck(updatedRootDeck);
    const nextEasyDaysContext = createEasyDaysContext(nextDecks, easyDays, getNow(), dayStartHour, timeZone);
    const nextQueue = createDailyReviewQueue(nextDecks, {
      deckId: updatedRootDeck.id,
      now: getNow(),
      dayStartHour,
      learnAheadMinutes,
      timeZone,
      easyDaysContext: nextEasyDaysContext,
      language: "de",
      variantSession,
    });
    const currentKey = current?.sessionInfo?.key ?? (current ? `${current.deckId}:${current.learningItemId}` : undefined);

    setSessionDecks(nextDecks);
    setReviewSession((session) => reconcileDailyReviewSessionState(
      session ?? effectiveReviewSession,
      nextQueue.items,
      { preserveInitialKey: currentKey },
    ));
  }

  React.useEffect(() => {
    if (showAnswer) answerContentRef.current?.focus();
  }, [showAnswer]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (current) questionContentRef.current?.focus({ preventScroll: true });
      else if (answeredCount > 0 || hasWaitingLearningCards || limitReachedAtStart) completionHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current?.learningItemId, current?.variantId, answeredCount, hasWaitingLearningCards, limitReachedAtStart]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (showSettings) return;
      const action = resolveReviewShortcut(event, { hasCurrent: Boolean(current), showAnswer });
      if (!action) return;

      event.preventDefault();
      if (action.type === "exit") {
        onExit();
      } else if (action.type === "reveal") {
        setShowAnswer(true);
      } else if (action.type === "rate") {
        if (action.rating) grade(action.rating);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, showAnswer, showSettings, sessionDecks, reviewSession]);

  return (
    <main className="min-h-screen bg-core-canvas p-4 text-[var(--core-text)] sm:p-8">
      <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={onExit} className="core-surface grid size-11 place-items-center rounded-full text-[var(--core-text)]" aria-label="Lernmodus verlassen">
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="core-body font-semibold text-[var(--core-text-muted)]">{rootDeck?.name ?? deck?.name}</p>
              <p className="mt-1 core-body text-[var(--core-text-muted)]">
                {current?.sessionInfo?.isRepeat
                  ? `Wiederholung ${repeatCount + 1}`
                  : current
                    ? `${Math.min(completedInitialCount + 1, sessionTotal)} / ${sessionTotal}`
                    : sessionTotal
                      ? `${completedInitialCount} / ${sessionTotal}`
                      : "0 / 0"}
              </p>
            </div>
            <button ref={settingsButtonRef} type="button" onClick={() => setShowSettings((value) => !value)} className="core-surface grid size-11 place-items-center rounded-full text-[var(--core-text)]" aria-label="Lerneinstellungen" aria-haspopup="dialog" aria-expanded={showSettings} aria-controls="study-settings-overlay">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          {simulationOffsetMinutes > 0 ? (
            <p className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 text-center core-body font-semibold text-core-text" role="status">
              Simulation aktiv · {formatSimulationDate(getNow())} · +{formatSimulationDuration(simulationOffsetMinutes)}
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 core-status-label uppercase tracking-wide text-[var(--core-text-muted)]">
              <span>Lernfortschritt</span>
              <span>{sessionDailyProgress.completedTodayCount} / {sessionDailyProgress.total} Karten</span>
            </div>
            <DailyReviewProgress progress={sessionDailyProgress} />
          </div>
          <PomodoroProgress timer={pomodoroTimer} variant="study" />
          {studyMissingMedia.length > 0 ? <p className="core-status-warning text-center core-body" role="status">{studyMissingMedia[0].status}{studyMissingMedia.length > 1 ? ` (${studyMissingMedia.length} Medien)` : ""}</p> : null}
        </header>

        <StudySettingsOverlay
          open={showSettings}
          canEditCard={Boolean(current?.deckId && current.learningItemId)}
          marked={isLearningItemMarked(sourceCard)}
          suspended={sourceCard?.status === "suspended"}
          reviewOrder={rootDeck?.deckSettings.newReviewOrder ?? "reviews-first"}
          pomodoroTimer={pomodoroTimer}
          returnFocusRef={settingsButtonRef}
          onOpenChange={setShowSettings}
          onEditCard={() => {
            if (current?.deckId && current.learningItemId) onEditCard(current.deckId, current.learningItemId);
          }}
          onEditDeck={() => {
            if (rootDeck) onEditDeck(rootDeck.id);
          }}
          onMarkedChange={(marked) => updateCurrentStudyState({ marked })}
          onSuspendedChange={(suspended) => updateCurrentStudyState({ suspended })}
          onReviewOrderChange={updateReviewOrder}
          onStartPomodoro={onStartPomodoro}
        />

        <section className="grid flex-1 place-items-center py-8">
          <div className="core-study-card flex w-full flex-col justify-center py-6 sm:py-10">
            {current ? (
              <>
                <div className="w-full">
                  {current.sessionInfo?.isRepeat ? (
                    <p className="mb-4 core-body font-semibold text-[var(--core-action-secondary)]" role="status">
                      {current.sessionInfo.isEarlyRepeat ? "Vorgezogene Wiederholung" : "Wiederholung"}
                    </p>
                  ) : null}
                  <StudyCardContent
                    item={sourceCard}
                    variant={current.variant}
                    definition={presentationDefinition}
                    mediaUrls={studyMediaUrls}
                    revealed={showAnswer}
                    selectedChoices={selectedChoices}
                    onSelectedChoicesChange={setSelectedChoices}
                    onReveal={revealChoiceAnswer}
                    questionRef={questionContentRef}
                    answerRef={answerContentRef}
                  />
                  {showAnswer ? (
                    <>
                      {hasAnswerTools ? (
                        <div className="mt-8 rounded-2xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4" data-testid="review-answer-tools">
                          <div className="flex flex-wrap gap-2">
                            {isCurrentVariant ? (
                              <button type="button" onClick={() => setShowAnchor((value) => !value)} aria-expanded={showAnchor} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-semibold text-[var(--core-action-primary)]">
                                <Anchor size={16} aria-hidden="true" />
                                {showAnchor ? "Grundkarte ausblenden" : "Grundkarte anzeigen"}
                              </button>
                            ) : null}
                            {isCurrentVariant ? (
                              <button type="button" onClick={() => updateVariant("disable")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-warning bg-core-warning-soft px-3 core-body font-semibold text-core-text">
                                <Ban size={16} aria-hidden="true" />
                                Nicht mehr zeigen
                              </button>
                            ) : null}
                          </div>
                          {isCurrentVariant ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Problem melden">
                              <span className="core-body font-semibold text-[var(--core-text-muted)]">Problem melden:</span>
                              <button type="button" onClick={() => updateVariant("flag", "fachlich_falsch")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-danger bg-core-danger-soft px-3 core-body font-semibold text-core-text">
                                <CircleAlert size={16} aria-hidden="true" />
                                Inhaltlich falsch
                              </button>
                              <button type="button" onClick={() => updateVariant("flag", "unklar_formuliert")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-danger bg-core-danger-soft px-3 core-body font-semibold text-core-text">
                                <CircleAlert size={16} aria-hidden="true" />
                                Unklar formuliert
                              </button>
                            </div>
                          ) : null}
                          {feedbackStatus ? <p className="mt-3 core-body font-semibold text-[var(--core-text-secondary)]" role="status">{feedbackStatus}</p> : null}
                          {isCurrentVariant && showAnchor && sourceCard ? (
                            <div className="mt-4 border-t border-[var(--core-border)] pt-4" data-testid="base-card-reference">
                              <p className="core-body font-semibold text-[var(--core-text-muted)]">Grundkarte</p>
                              <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <div>
                                  <p className="mb-1 core-caption font-semibold text-[var(--core-text-muted)]">Vorderseite</p>
                                  <CardPresentationSurface item={sourceCard} variant={null} definition={presentationDefinition} side="question" surface="review" title="Frage der Grundkarte" mediaUrls={studyMediaUrls} showCompatibility={false} />
                                </div>
                                <div>
                                  <p className="mb-1 core-caption font-semibold text-[var(--core-text-muted)]">Rückseite</p>
                                  <CardPresentationSurface item={sourceCard} variant={null} definition={presentationDefinition} side="answer" surface="review" title="Antwort der Grundkarte" mediaUrls={studyMediaUrls} showCompatibility={false} />
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : limitReachedAtStart ? (
              <div className="text-center">
                <CircleAlert className="mx-auto text-core-warning" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Tageslimit erreicht</h1>
                <p className="mt-3 text-[var(--core-text-muted)]">{limitSummaryText}</p>
                <button type="button" onClick={onReturnToLearn} className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : hasWaitingLearningCards ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto text-core-text" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Für jetzt geschafft</h1>
                <p className="mt-3 text-[var(--core-text-muted)]">Die restlichen Lernkarten sind vorgemerkt und bleiben „Offen“.</p>
                {queue.limitSummary.reached ? <p className="mt-3 rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 core-body text-core-text" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : answeredCount > 0 ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto text-core-text" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Sitzung abgeschlossen</h1>
                <p className="mt-3 text-[var(--core-text-muted)]">
                  {completedInitialCount} {completedInitialCount === 1 ? "Karte" : "Karten"} · {repeatCount} {repeatCount === 1 ? "Wiederholung" : "Wiederholungen"}
                </p>
                {queue.limitSummary.reached ? <p className="mt-3 rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 core-body text-core-text" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="core-heading-2 font-semibold">Keine fälligen Karten</h1>
                <p className="mt-3 text-[var(--core-text-muted)]">Dieser Stapel hat für heute keine Karten in der Lern-Queue.</p>
              </div>
            )}
          </div>
        </section>

        {showAnswer ? (
          <footer className="grid gap-2 sm:grid-cols-4">
            {ratingButtons.map((rating) => {
              const ratingKey = rating.key as ReviewRating;
              const intervalLabel = formatReviewIntervalLabel(current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ?? "");
              return <CoreTooltip key={rating.key} label={`Taste ${rating.shortcutKey}`}>
                <button type="button" onClick={() => grade(ratingKey)} disabled={!current} aria-label={`Bewertung ${rating.label}${intervalLabel ? `: ${intervalLabel}` : ""}`} className={`min-h-14 rounded-xl border px-3 py-1.5 text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
                  <span className="block core-body-large font-semibold leading-5">{rating.label}</span>
                  <span className="mt-0.5 block core-caption font-medium opacity-80">{intervalLabel}</span>
                </button>
              </CoreTooltip>
            })}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
