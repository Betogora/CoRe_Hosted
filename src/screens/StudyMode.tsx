import React from "react";
import { Anchor, Ban, CheckCircle2, CircleAlert, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { StudyModeProps } from "../appScreenProps.ts";
import { DEFAULT_EASY_DAYS, createEasyDaysDueCounts } from "../easyDays.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { variantPresentation } from "../coreVariantService.ts";
import { resolveReviewShortcut } from "../reviewShortcuts.ts";
import { createReviewResponseTimer } from "../reviewTiming.ts";
import { formatSimulationDate, formatSimulationDuration } from "../simulationClock.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  classifyDailyReviewProgress,
  createDailyReviewQueue,
  createDailyReviewSessionIndex,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  moveDailyReviewProgress,
  reconcileDailyReviewSessionState,
  removeDailyReviewSessionItem,
  recordVariantFeedback,
  type DailyReviewSessionState,
  updateDailyReviewSessionIndex,
} from "../reviewService.ts";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { DailyReviewProgress } from "../ui/DailyReviewProgress.tsx";
import { PomodoroProgress } from "../ui/pomodoroTimerUi.tsx";
import { NoteCardContent } from "../ui/NoteCardContent.tsx";
import { StudySettingsOverlay } from "../ui/StudySettingsOverlay.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { formatReviewIntervalLabel, ratingButtons } from "./screenConstants.ts";
import type { Card, CardStudyState, CardStudyStatePatch, Deck, Note, ReviewEvent, ReviewRating } from "../coreTypes.ts";

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

export function StudyMode({ deck, decks, notes, answeredToday, deckId, variantSession, mediaStore, getNow, learningDayKey, dayStartHour = 0, learnAheadMinutes = 20, easyDays = DEFAULT_EASY_DAYS, timeZone, simulationOffsetMinutes, pomodoroTimer, onStartPomodoro, onExit, onReturnToLearn, onEditCard, onEditDeck, onSetCardStudyState, onSetDeckReviewOrder, onCardUpdated, onReview, sessionPlan, bufferSize = 50, hasMoreCards = false, onLoadMoreCards }: StudyModeProps) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const [sessionNotes, setSessionNotes] = React.useState(() => new Map(notes.map((note) => [note.id, note])));
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
  const [feedbackStatus, setFeedbackStatus] = React.useState("");
  const [moreCardsAvailable, setMoreCardsAvailable] = React.useState(hasMoreCards);
  const [activeBufferSize, setActiveBufferSize] = React.useState(Math.max(1, bufferSize));
  const [loadingMoreCards, setLoadingMoreCards] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState("");
  const answerContentRef = React.useRef<HTMLDivElement>(null);
  const questionContentRef = React.useRef<HTMLDivElement>(null);
  const completionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const feedbackDeckRef = React.useRef<Deck | null>(null);
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
    sessionDecks.map((candidate) => `${candidate.id}:${candidate.updatedAt}:${candidate.cards.length}:${candidate.reviewEvents.length}:${candidate.cards.at(-1)?.id ?? ""}`),
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
        answeredToday,
      }),
    };
  }
  const { queue, easyDaysContext } = queuePlanRef.current;
  const [sessionDailyProgress, setSessionDailyProgress] = React.useState(() => sessionPlan?.progress ?? queue.dailyProgress);
  const [plannedSessionTotal, setPlannedSessionTotal] = React.useState(() => Math.max(0, sessionPlan?.initialCardCount ?? queue.total));
  const effectiveReviewSession = reviewSession ?? createDailyReviewSessionState(queue.items);
  const current = React.useMemo(
    () => getNextDailyReviewSessionItem(sessionDecks, effectiveReviewSession, { deckId: rootDeck?.id, now: getNow(), dayStartHour, learnAheadMinutes, timeZone, easyDaysContext, language: "de", variantSession, sessionIndex: sessionIndexRef.current! }),
    [dayStartHour, easyDaysContext, effectiveLearningDayKey, getNow, learnAheadMinutes, sessionDecks, effectiveReviewSession, rootDeck?.id, timeZone, variantSession],
  );
  const currentDeck = sessionDecks.find((candidate) => candidate.id === current?.deckId) ?? rootDeck;
  const sessionTotal = Math.max(plannedSessionTotal, effectiveReviewSession.initialKeys.length);
  const completedInitialCount = effectiveReviewSession.completedInitialKeys.length;
  const repeatCount = effectiveReviewSession.repeatCount;
  const answeredCount = completedInitialCount + repeatCount;
  const sessionCanFinish = !moreCardsAvailable && !loadingMoreCards && !loadMoreError;
  const hasWaitingLearningCards = !current && sessionCanFinish && sessionDailyProgress.inProgressCount > 0;
  const limitReachedAtStart = !current && sessionCanFinish && answeredCount === 0 && queue.total === 0 && queue.limitSummary.reached;
  const limitSummaryText = formatLimitSummary(queue.limitSummary.hiddenDueCount, queue.limitSummary.hiddenNewCount);
  const currentNote = current ? sessionNotes.get(current.noteId) ?? null : null;
  const presented = React.useMemo(
    () => current && currentNote && current.variant ? variantPresentation(currentNote, current.card, current.variant) : current && currentNote ? { note: currentNote, card: current.card } : null,
    [current, currentNote],
  );
  const isCurrentVariant = Boolean(current?.variant);
  const hasAnswerTools = isCurrentVariant;
  const { urls: studyMediaUrls, missing: studyMissingMedia } = useNoteMediaUrls(currentNote?.media, mediaStore);

  React.useEffect(() => {
    setSessionDecks(decks);
    setSessionNotes(new Map(notes.map((note) => [note.id, note])));
    sessionIndexRef.current = createDailyReviewSessionIndex(decks);
    setReviewSession(null);
    setSessionDailyProgress(sessionPlan?.progress ?? queue.dailyProgress);
    setPlannedSessionTotal(Math.max(0, sessionPlan?.initialCardCount ?? queue.total));
    setMoreCardsAvailable(hasMoreCards);
    setActiveBufferSize(Math.max(1, bufferSize));
    setLoadingMoreCards(false);
    setLoadMoreError("");
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSettings(false);
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }, [deckId, variantSession, decks.length]);

  React.useEffect(() => {
    setMoreCardsAvailable(hasMoreCards);
    setActiveBufferSize(Math.max(1, bufferSize));
  }, [bufferSize, hasMoreCards]);

  React.useEffect(() => {
    // A sibling buried by the last answer leaves the session and its counts.
    const buried = new Set(queue.buriedKeys);
    const newlyBuried = (reviewSession?.remainingInitialKeys ?? []).filter((key) => buried.has(key));
    if (newlyBuried.length > 0) {
      setPlannedSessionTotal((total) => Math.max(0, total - newlyBuried.length));
      setSessionDailyProgress((progress) => newlyBuried.reduce((next, key) => {
        const study = sessionIndexRef.current?.entriesByKey.get(key)?.card.study;
        return study ? moveDailyReviewProgress(next, classifyDailyReviewProgress(study, false, getNow(), { dayStartHour, timeZone }), null) : next;
      }, progress));
    }
    setReviewSession((currentSession) => currentSession
      ? reconcileDailyReviewSessionState(currentSession, queue.items)
      : createDailyReviewSessionState(queue.items));
  }, [queue.items]);

  const preloadThreshold = Math.max(1, Math.floor(activeBufferSize / 2));
  React.useEffect(() => {
    if (!onLoadMoreCards || !moreCardsAvailable || loadingMoreCards || loadMoreError || effectiveReviewSession.remainingInitialKeys.length > preloadThreshold) return;
    setLoadingMoreCards(true);
    void onLoadMoreCards().then((result) => {
      setMoreCardsAvailable(result.hasMoreCards);
      setActiveBufferSize(Math.max(1, result.bufferSize));
      if (result.notes.length) setSessionNotes((currentNotes) => new Map([...currentNotes, ...result.notes.map((note) => [note.id, note] as const)]));
      if (!result.decks.length) return;
      setSessionDecks((currentDecks) => {
        const pages = new Map(result.decks.map((candidate) => [candidate.id, candidate]));
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
    }).catch(() => {
      setLoadMoreError("Weitere Karten konnten nicht geladen werden. Deine bisherige Sitzung bleibt erhalten.");
    }).finally(() => {
      setLoadingMoreCards(false);
    });
  }, [effectiveReviewSession.remainingInitialKeys.length, loadMoreError, loadingMoreCards, moreCardsAvailable, onLoadMoreCards, preloadThreshold]);

  React.useEffect(() => {
    if (previousLearningDayKeyRef.current === effectiveLearningDayKey) return;
    previousLearningDayKeyRef.current = effectiveLearningDayKey;
    setSessionDailyProgress(sessionPlan?.progress ?? queue.dailyProgress);
    setPlannedSessionTotal(Math.max(0, sessionPlan?.initialCardCount ?? queue.total));
    setReviewSession(createDailyReviewSessionState([
      current ? { deckId: current.deckId, cardId: current.cardId } : null,
      ...queue.items,
    ]));
  }, [current, effectiveLearningDayKey, queue.items]);

  React.useEffect(() => {
    if (current) responseTimer.start();
    else responseTimer.reset();
    return () => responseTimer.reset();
  }, [answeredCount, current?.cardId, current?.variantId, responseTimer]);

  function replaceSessionDeck(updatedDeck: Deck, nextDecks = sessionDecks) {
    return nextDecks.map((candidate) => (candidate.id === updatedDeck.id ? updatedDeck : candidate));
  }

  function finishOrNext(updatedDeck: Deck, updatedCard: Card, rating: ReviewRating, previousStudy: CardStudyState, nextStudy: CardStudyState, reviewedKey: string) {
    const existingDeck = sessionDecks.find((candidate) => candidate.id === updatedDeck.id);
    const mergedDeck = existingDeck ? {
      ...existingDeck,
      updatedAt: updatedDeck.updatedAt,
      cards: existingDeck.cards.map((card) => card.id === updatedCard.id ? updatedCard : card),
      reviewEvents: [
        ...updatedDeck.reviewEvents,
        ...existingDeck.reviewEvents.filter((event) => !updatedDeck.reviewEvents.some((candidate) => candidate.id === event.id)),
      ],
    } : updatedDeck;
    updateDailyReviewSessionIndex(sessionIndexRef.current!, mergedDeck, updatedCard);
    setSessionDecks((currentDecks) => replaceSessionDeck(mergedDeck, currentDecks));
    setSessionDailyProgress((progress) => moveDailyReviewProgress(
      progress,
      classifyDailyReviewProgress(previousStudy, false, getNow(), { dayStartHour, timeZone }),
      classifyDailyReviewProgress(nextStudy, true, getNow(), { dayStartHour, timeZone }),
    ));
    setReviewSession((session) => session && reviewedKey
      ? advanceDailyReviewSession(session, { key: reviewedKey, rating, nextReviewState: nextStudy })
      : session);
    setShowAnswer(false);
    setShowAnchor(false);
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }

  function revealAnswer() {
    if (showAnswer) return;
    setShowAnswer(true);
  }

  function grade(rating: ReviewRating) {
    if (!current || !currentDeck) return;
    const responseTimeMs = responseTimer.stop();
    const reviewEvents = (sessionIndexRef.current?.reviewEventsByKey.get(current.sessionInfo?.key ?? `${current.deckId}:${current.cardId}`) ?? [])
      .filter((event) => Boolean(event.id)) as ReviewEvent[];
    const feedbackCard = feedbackDeckRef.current?.cards.find((card) => card.id === current.cardId);
    const result = answerVariant({
      ...(feedbackDeckRef.current ?? currentDeck),
      cards: [feedbackCard ?? current.card],
      reviewEvents,
    }, current.cardId, current.variant?.id ?? null, rating, {
      now: getNow(),
      dayStartHour,
      timeZone,
      easyDaysContext,
      responseTimeMs,
    });
    onReview(result);
    finishOrNext(result.deck, result.updatedCard, rating, current.card.study, result.updatedCard.study, current.sessionInfo?.key ?? `${current.deckId}:${current.cardId}`);
  }

  function updateVariant(action: "disable" | "flag", feedbackType?: "fachlich_falsch" | "unklar_formuliert") {
    if (!isCurrentVariant || !currentDeck || !current) return;
    const result = recordVariantFeedback(feedbackDeckRef.current ?? currentDeck, { cardId: current.cardId, variantId: current.variantId }, { action, feedbackType });
    feedbackDeckRef.current = result.deck;
    if (result.updatedCard) onCardUpdated(result.deck.id, result.updatedCard);
    setFeedbackStatus(action === "disable" ? "Diese Abfrage wird künftig nicht mehr gezeigt." : "Danke. Der ausgewählte Grund wurde gespeichert.");
  }

  function updateCurrentStudyState(patch: CardStudyStatePatch) {
    if (!current) return;
    const updated = onSetCardStudyState(current.deckId, current.cardId, patch);
    if (!updated) return;
    const { deck: updatedDeck, note: updatedNote } = updated;
    setSessionNotes((currentNotes) => new Map(currentNotes).set(updatedNote.id, updatedNote));
    const nextDecks = replaceSessionDeck(updatedDeck);
    const updatedCard = (updatedDeck.cards ?? []).find((card) => card.id === current.cardId);
    if (updatedCard) updateDailyReviewSessionIndex(sessionIndexRef.current!, updatedDeck, updatedCard);
    setSessionDecks(nextDecks);

    if (patch.suspended !== true) return;
    const currentKey = current.sessionInfo?.key ?? `${current.deckId}:${current.cardId}`;
    setSessionDailyProgress((progress) => moveDailyReviewProgress(
      progress,
      classifyDailyReviewProgress(current.card.study, Boolean(current.sessionInfo?.isRepeat), getNow(), { dayStartHour, timeZone }),
      null,
    ));
    setPlannedSessionTotal((total) => Math.max(0, total - 1));
    setShowSettings(false);
    setReviewSession((session) => removeDailyReviewSessionItem(session ?? effectiveReviewSession, currentKey));
    setShowAnswer(false);
    setShowAnchor(false);
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
      answeredToday,
    });
    const currentKey = current?.sessionInfo?.key ?? (current ? `${current.deckId}:${current.cardId}` : undefined);

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

  // While a card is shown, loading further cards in the background must not take the focus away.
  const focusTarget = current
    ? `card:${current.cardId}:${current.variantId ?? ""}:${answeredCount}`
    : `completion:${answeredCount}:${hasWaitingLearningCards}:${limitReachedAtStart}:${Boolean(loadMoreError)}:${loadingMoreCards}:${moreCardsAvailable}`;
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (current) questionContentRef.current?.focus({ preventScroll: true });
      else if (answeredCount > 0 || hasWaitingLearningCards || limitReachedAtStart || loadMoreError || loadingMoreCards || moreCardsAvailable) completionHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTarget]);

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
    <main className="min-h-screen bg-core-canvas p-4 text-core-text sm:p-8">
      <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={onExit} className="core-surface grid size-10 place-items-center rounded-control text-core-text" aria-label="Lernmodus verlassen">
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="core-body font-semibold text-core-muted">{rootDeck?.name ?? deck?.name}</p>
              <p className="mt-1 core-body text-core-muted">
                {current?.sessionInfo?.isRepeat
                  ? `Wiederholung ${repeatCount + 1}`
                  : current
                    ? `${Math.min(completedInitialCount + 1, sessionTotal)} / ${sessionTotal}`
                    : sessionTotal
                      ? `${completedInitialCount} / ${sessionTotal}`
                      : "0 / 0"}
              </p>
            </div>
            <button ref={settingsButtonRef} type="button" onClick={() => setShowSettings((value) => !value)} className="core-surface grid size-10 place-items-center rounded-control text-core-text" aria-label="Lerneinstellungen" aria-haspopup="dialog" aria-expanded={showSettings} aria-controls="study-settings-overlay">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          {simulationOffsetMinutes > 0 ? (
            <p className="rounded-control border border-core-warning bg-core-warning-soft px-4 py-3 text-center core-body font-semibold text-core-text" role="status">
              Simulation aktiv · {formatSimulationDate(getNow())} · +{formatSimulationDuration(simulationOffsetMinutes)}
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 core-status-label text-core-muted">
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
          canEditCard={Boolean(current?.deckId && current.cardId)}
          marked={currentNote?.marked === true}
          suspended={current?.card.status === "suspended"}
          reviewOrder={rootDeck?.deckSettings.newReviewOrder ?? "reviews-first"}
          pomodoroTimer={pomodoroTimer}
          returnFocusRef={settingsButtonRef}
          onOpenChange={setShowSettings}
          onEditCard={() => {
            if (current?.deckId && current.cardId) onEditCard(current.deckId, current.cardId);
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
                  <div ref={showAnswer ? answerContentRef : questionContentRef} tabIndex={-1} role="group" aria-label={showAnswer ? "Antwort" : "Frage"} className="min-w-0 outline-none" data-testid="study-card-content">
                    {presented ? (
                      <NoteCardContent note={presented.note} card={presented.card} mediaUrls={studyMediaUrls} revealed={showAnswer} onReveal={revealAnswer} />
                    ) : (
                      <p className="core-body text-core-muted" role="status">Karteninhalt wird geladen …</p>
                    )}
                  </div>
                  {showAnswer ? (
                    <>
                      {hasAnswerTools ? (
                        <div className="mt-8 rounded-panel border border-core-border bg-core-subtle p-4" data-testid="review-answer-tools">
                          <div className="flex flex-wrap gap-2">
                            {isCurrentVariant ? (
                              <button type="button" onClick={() => setShowAnchor((value) => !value)} aria-expanded={showAnchor} className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 core-body font-semibold text-core-action">
                                <Anchor size={16} aria-hidden="true" />
                                {showAnchor ? "Grundkarte ausblenden" : "Grundkarte anzeigen"}
                              </button>
                            ) : null}
                            {isCurrentVariant ? (
                              <button type="button" onClick={() => updateVariant("disable")} className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-warning bg-core-warning-soft px-3 core-body font-semibold text-core-text">
                                <Ban size={16} aria-hidden="true" />
                                Nicht mehr zeigen
                              </button>
                            ) : null}
                          </div>
                          {isCurrentVariant ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Problem melden">
                              <span className="core-body font-semibold text-core-muted">Problem melden:</span>
                              <button type="button" onClick={() => updateVariant("flag", "fachlich_falsch")} className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-danger bg-core-danger-soft px-3 core-body font-semibold text-core-text">
                                <CircleAlert size={16} aria-hidden="true" />
                                Inhaltlich falsch
                              </button>
                              <button type="button" onClick={() => updateVariant("flag", "unklar_formuliert")} className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-danger bg-core-danger-soft px-3 core-body font-semibold text-core-text">
                                <CircleAlert size={16} aria-hidden="true" />
                                Unklar formuliert
                              </button>
                            </div>
                          ) : null}
                          {feedbackStatus ? <p className="mt-3 core-body font-semibold text-core-secondary" role="status">{feedbackStatus}</p> : null}
                          {isCurrentVariant && showAnchor && currentNote ? (
                            <div className="mt-4 border-t border-core-border pt-4" data-testid="base-card-reference">
                              <p className="mb-3 core-body font-semibold text-core-muted">Grundkarte</p>
                              <NoteCardContent note={currentNote} card={current.card} surface="preview" mediaUrls={studyMediaUrls} revealed onReveal={() => undefined} />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 core-action-primary">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : loadMoreError ? (
              <div className="text-center">
                <CircleAlert className="mx-auto text-core-warning" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Weitere Karten konnten nicht geladen werden</h1>
                <p className="mt-3 text-core-muted">{loadMoreError}</p>
                <button type="button" onClick={() => setLoadMoreError("")} className="mt-8 core-action-primary">
                  Erneut versuchen
                </button>
              </div>
            ) : loadingMoreCards || moreCardsAvailable ? (
              <div className="text-center" role="status">
                <h1 ref={completionHeadingRef} tabIndex={-1} className="core-heading-2 font-semibold outline-none">Weitere Karten werden geladen</h1>
                <p className="mt-3 text-core-muted">Deine bisherige Sitzung bleibt erhalten.</p>
              </div>
            ) : limitReachedAtStart ? (
              <div className="text-center">
                <CircleAlert className="mx-auto text-core-warning" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Tageslimit erreicht</h1>
                <p className="mt-3 text-core-muted">{limitSummaryText}</p>
                <button type="button" onClick={onReturnToLearn} className="mt-8 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : hasWaitingLearningCards ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto text-core-text" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Für jetzt geschafft</h1>
                <p className="mt-3 text-core-muted">Die restlichen Lernkarten sind vorgemerkt und bleiben „Offen“.</p>
                {queue.limitSummary.reached ? <p className="mt-3 rounded-control border border-core-warning bg-core-warning-soft px-4 py-3 core-body text-core-text" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-8 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : answeredCount > 0 ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto text-core-text" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Sitzung abgeschlossen</h1>
                <p className="mt-3 text-core-muted">
                  {completedInitialCount} {completedInitialCount === 1 ? "Karte" : "Karten"} · {repeatCount} {repeatCount === 1 ? "Wiederholung" : "Wiederholungen"}
                </p>
                {queue.limitSummary.reached ? <p className="mt-3 rounded-control border border-core-warning bg-core-warning-soft px-4 py-3 core-body text-core-text" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-8 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="core-heading-2 font-semibold">Keine fälligen Karten</h1>
                <p className="mt-3 text-core-muted">Dieser Stapel hat für heute keine Karten in der Lern-Queue.</p>
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
                <button type="button" onClick={() => grade(ratingKey)} disabled={!current} aria-label={`Bewertung ${rating.label}${intervalLabel ? `: ${intervalLabel}` : ""}`} className={`min-h-14 rounded-control border px-3 py-1.5 text-center shadow-soft transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
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
