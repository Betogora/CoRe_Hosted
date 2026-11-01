import React from "react";
import { CheckCircle2, ChevronDown, CircleAlert, RotateCcw, Shuffle, SlidersHorizontal, X } from "lucide-react";
import type { StudyModeProps } from "../appScreenProps.ts";
import { DEFAULT_EASY_DAYS, createEasyDaysDueCounts, shiftEasyDaysDueCounts } from "../easyDays.ts";
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
  type DailyReviewSessionState,
  updateDailyReviewSessionIndex,
} from "../reviewService.ts";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { DailyReviewProgress } from "../ui/DailyReviewProgress.tsx";
import { PomodoroProgress } from "../ui/pomodoroTimerUi.tsx";
import { NoteCardContent } from "../ui/NoteCardContent.tsx";
import { StudySettingsOverlay } from "../ui/StudySettingsOverlay.tsx";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreTag } from "../ui/coreUi.tsx";
import { FlagDot } from "../ui/flagUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { formatLimitSummary, formatReviewIntervalLabel, ratingButtons } from "./screenConstants.ts";
import type { Card, CardStudyState, CardStudyStatePatch, Deck, Note, ReviewRating } from "../coreTypes.ts";

function createEasyDaysContext(
  decks: Deck[],
  easyDays: typeof DEFAULT_EASY_DAYS,
  now: string | number | Date,
  dayStartHour: number,
  timeZone: string | undefined,
  account: { forecast: ReadonlyMap<string, number> | null; firstLoadedCards: Map<string, Card> },
) {
  const cards = decks.flatMap((candidate) => candidate.cards ?? []);
  for (const card of cards) if (!account.firstLoadedCards.has(card.id)) account.firstLoadedCards.set(card.id, card);
  const options = { dayStartHour, timeZone };
  return {
    easyDays,
    dueCountsByDay: account.forecast
      ? shiftEasyDaysDueCounts(account.forecast, account.firstLoadedCards.values(), cards, now, options)
      : createEasyDaysDueCounts(cards, now, options),
    dayStartHour,
    timeZone,
  };
}

export function StudyMode({ deck, decks, notes, answeredToday, deckId, mediaStore, getNow, learningDayKey, dayStartHour = 0, learnAheadMinutes = 20, easyDays = DEFAULT_EASY_DAYS, dueForecast = null, timeZone, simulationOffsetMinutes, pomodoroTimer, onStartPomodoro, onExit, onReturnToLearn, onEditCard, onEditDeck, flagNames, onSetCardStudyState, onSetDeckReviewOrder, onReview, sessionPlan, bufferSize = 50, hasMoreCards = false, onLoadMoreCards }: StudyModeProps) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const [sessionNotes, setSessionNotes] = React.useState(() => new Map(notes.map((note) => [note.id, note])));
  const sessionIndexRef = React.useRef<ReturnType<typeof createDailyReviewSessionIndex> | null>(null);
  sessionIndexRef.current ??= createDailyReviewSessionIndex(decks);
  const easyDaysAccountRef = React.useRef({ forecast: dueForecast, firstLoadedCards: new Map<string, Card>() });
  if (easyDaysAccountRef.current.forecast !== dueForecast) easyDaysAccountRef.current = { forecast: dueForecast, firstLoadedCards: new Map() };
  const queuePlanRef = React.useRef<{
    key: string;
    easyDaysContext: ReturnType<typeof createEasyDaysContext>;
    queue: ReturnType<typeof createDailyReviewQueue>;
  } | null>(null);
  const [reviewSession, setReviewSession] = React.useState<DailyReviewSessionState | null>(null);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showOriginal, setShowOriginal] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [moreCardsAvailable, setMoreCardsAvailable] = React.useState(hasMoreCards);
  const [activeBufferSize, setActiveBufferSize] = React.useState(Math.max(1, bufferSize));
  const [loadingMoreCards, setLoadingMoreCards] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState("");
  /** Loading stopped because the device is offline; it resumes by itself when the connection returns. */
  const [pausedOffline, setPausedOffline] = React.useState(false);
  const answerContentRef = React.useRef<HTMLDivElement>(null);
  const questionContentRef = React.useRef<HTMLDivElement>(null);
  const completionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
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
    easyDays,
    rootDeck?.deckSettings ?? null,
    sessionDecks.map((candidate) => `${candidate.id}:${candidate.updatedAt}:${candidate.cards.length}:${candidate.reviewEvents.length}:${candidate.cards.at(-1)?.id ?? ""}`),
  ]);
  if (
    !queuePlanRef.current
    || queuePlanRef.current.key !== queuePlanKey
  ) {
    const planNow = getNow();
    const easyDaysContext = createEasyDaysContext(sessionDecks, easyDays, planNow, dayStartHour, timeZone, easyDaysAccountRef.current);
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
        answeredToday,
      }),
    };
  }
  const { queue, easyDaysContext } = queuePlanRef.current;
  const [sessionDailyProgress, setSessionDailyProgress] = React.useState(() => sessionPlan?.progress ?? queue.dailyProgress);
  const effectiveReviewSession = reviewSession ?? createDailyReviewSessionState(queue.items);
  const current = React.useMemo(
    () => getNextDailyReviewSessionItem(sessionDecks, effectiveReviewSession, { deckId: rootDeck?.id, now: getNow(), dayStartHour, learnAheadMinutes, timeZone, easyDaysContext, sessionIndex: sessionIndexRef.current! }),
    [dayStartHour, easyDaysContext, effectiveLearningDayKey, getNow, learnAheadMinutes, sessionDecks, effectiveReviewSession, rootDeck?.id, timeZone],
  );
  const currentDeck = sessionDecks.find((candidate) => candidate.id === current?.deckId) ?? rootDeck;
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
  const { urls: studyMediaUrls, missing: studyMissingMedia } = useNoteMediaUrls(currentNote?.media, mediaStore);

  React.useEffect(() => {
    setSessionDecks(decks);
    setSessionNotes(new Map(notes.map((note) => [note.id, note])));
    sessionIndexRef.current = createDailyReviewSessionIndex(decks);
    setReviewSession(null);
    setSessionDailyProgress(sessionPlan?.progress ?? queue.dailyProgress);
    setMoreCardsAvailable(hasMoreCards);
    setActiveBufferSize(Math.max(1, bufferSize));
    setLoadingMoreCards(false);
    setLoadMoreError("");
    setPausedOffline(false);
    setShowAnswer(false);
    setShowOriginal(false);
    setShowSettings(false);
  }, [deckId, decks.length]);

  React.useEffect(() => {
    setMoreCardsAvailable(hasMoreCards);
    setActiveBufferSize(Math.max(1, bufferSize));
  }, [bufferSize, hasMoreCards]);

  React.useEffect(() => {
    // A sibling buried by the last answer leaves the session and its counts.
    const buried = new Set(queue.buriedKeys);
    const newlyBuried = (reviewSession?.remainingInitialKeys ?? []).filter((key) => buried.has(key));
    if (newlyBuried.length > 0) {
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
      setPausedOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      setLoadMoreError("Weitere Karten konnten nicht geladen werden. Deine bisherige Sitzung bleibt erhalten.");
    }).finally(() => {
      setLoadingMoreCards(false);
    });
  }, [effectiveReviewSession.remainingInitialKeys.length, loadMoreError, loadingMoreCards, moreCardsAvailable, onLoadMoreCards, preloadThreshold]);

  React.useEffect(() => {
    if (!pausedOffline) return undefined;
    const resume = () => {
      setPausedOffline(false);
      setLoadMoreError("");
    };
    window.addEventListener("online", resume);
    // The connection may have returned before this listener existed.
    if (navigator.onLine) resume();
    return () => window.removeEventListener("online", resume);
  }, [pausedOffline]);

  React.useEffect(() => {
    if (previousLearningDayKeyRef.current === effectiveLearningDayKey) return;
    previousLearningDayKeyRef.current = effectiveLearningDayKey;
    setSessionDailyProgress(sessionPlan?.progress ?? queue.dailyProgress);
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
    setShowOriginal(false);
  }

  function revealAnswer() {
    if (showAnswer) return;
    setShowAnswer(true);
  }

  function grade(rating: ReviewRating) {
    if (!current || !currentDeck) return;
    const responseTimeMs = responseTimer.stop();
    const result = answerVariant({
      ...currentDeck,
      cards: [current.card],
      reviewEvents: [],
    }, current.cardId, current.variant?.id ?? null, rating, {
      now: getNow(),
      dayStartHour,
      timeZone,
      easyDaysContext,
      responseTimeMs,
    });
    onReview(result);
    if (result.leechTriggered) {
      // Once per trigger: the learner may fix the content right away (W22).
      const { deckId: leechDeckId, cardId: leechCardId } = current;
      setSuccessToast(`Lernbremse: ${result.updatedCard.study.lapses}-mal vergessen`, {
        appearance: "neutral",
        action: { label: "Bearbeiten", onAction: () => onEditCard(leechDeckId, leechCardId) },
      });
    }
    finishOrNext(result.deck, result.updatedCard, rating, current.card.study, result.updatedCard.study, current.sessionInfo?.key ?? `${current.deckId}:${current.cardId}`);
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
    setShowSettings(false);
    setReviewSession((session) => removeDailyReviewSessionItem(session ?? effectiveReviewSession, currentKey));
    setShowAnswer(false);
    setShowOriginal(false);
    setSuccessToast("Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.");
  }

  function updateReviewOrder(newReviewOrder: Deck["deckSettings"]["newReviewOrder"]) {
    if (!rootDeck || rootDeck.deckSettings.newReviewOrder === newReviewOrder) return;
    const updatedRootDeck = onSetDeckReviewOrder(rootDeck.id, newReviewOrder);
    if (!updatedRootDeck) return;
    const nextDecks = replaceSessionDeck(updatedRootDeck);
    const nextEasyDaysContext = createEasyDaysContext(nextDecks, easyDays, getNow(), dayStartHour, timeZone, easyDaysAccountRef.current);
    const nextQueue = createDailyReviewQueue(nextDecks, {
      deckId: updatedRootDeck.id,
      now: getNow(),
      dayStartHour,
      learnAheadMinutes,
      timeZone,
      easyDaysContext: nextEasyDaysContext,
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
      // Strg+1–7 switches the flag like in Anki; the dot in the header shows it, without a toast (W20).
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && /^[1-7]$/.test(event.key) && current) {
        event.preventDefault();
        const flag = Number(event.key);
        updateCurrentStudyState({ flag: current.card.ankiFlag === flag ? 0 : flag });
        return;
      }
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
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between gap-4">
            <IconButton type="button" onClick={onExit} label="Lernmodus verlassen" icon={X} />
            <div className="flex min-w-0 items-center justify-center gap-2 text-center">
              <p className="min-w-0 truncate core-heading-3 text-core-text">{rootDeck?.name ?? deck?.name}</p>
              {current?.card.ankiFlag ? <FlagDot flag={current.card.ankiFlag} names={flagNames} /> : null}
            </div>
            <IconButton ref={settingsButtonRef} type="button" onClick={() => setShowSettings((value) => !value)} label="Lerneinstellungen" icon={SlidersHorizontal} aria-haspopup="dialog" aria-expanded={showSettings} aria-controls="study-settings-overlay" />
          </div>
          {simulationOffsetMinutes > 0 ? (
            <p className="core-status-warning text-center font-semibold" role="status">
              Simulation aktiv · {formatSimulationDate(getNow())} · +{formatSimulationDuration(simulationOffsetMinutes)}
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 core-caption font-medium text-core-muted">
              <span>Lernfortschritt</span>
              <span className="tabular-nums">{sessionDailyProgress.completedTodayCount} / {sessionDailyProgress.total} Karten</span>
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
          flag={current?.card.ankiFlag ?? 0}
          flagNames={flagNames}
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
          onFlagChange={(flag) => updateCurrentStudyState({ flag })}
          onReviewOrderChange={updateReviewOrder}
          onStartPomodoro={onStartPomodoro}
        />

        <section className="grid flex-1 place-items-center py-8">
          <div className="core-study-card flex w-full flex-col justify-center py-6 sm:py-10">
            {current ? (
              <>
                <div className="w-full">
                  {current.sessionInfo?.isRepeat ? (
                    <p className="mb-4 inline-flex min-h-5 items-center rounded-round bg-core-info-soft px-2 core-caption font-semibold text-core-action" role="status">
                      {current.sessionInfo.isEarlyRepeat ? "Vorgezogene Wiederholung" : "Wiederholung"}
                    </p>
                  ) : null}
                  {showAnswer && isCurrentVariant ? (
                    <CoreTag tone="info" className="mb-4" data-testid="review-variant-badge">Variante</CoreTag>
                  ) : null}
                  <div ref={showAnswer ? answerContentRef : questionContentRef} tabIndex={-1} role="group" aria-label={showAnswer ? "Antwort" : "Frage"} className="min-w-0 outline-none" data-testid="study-card-content">
                    {presented ? (
                      <NoteCardContent note={presented.note} card={presented.card} mediaUrls={studyMediaUrls} revealed={showAnswer} onReveal={revealAnswer} />
                    ) : (
                      <p className="core-body text-core-muted" role="status">Karteninhalt wird geladen …</p>
                    )}
                  </div>
                  {showAnswer ? (
                    isCurrentVariant && currentNote ? (
                      <div className="mt-8 grid justify-items-end gap-4" data-testid="review-answer-tools">
                        <section className="w-full rounded-panel border border-core-border bg-core-surface shadow-soft" data-testid="base-card-reference">
                          <button type="button" onClick={() => setShowOriginal((value) => !value)} aria-expanded={showOriginal} aria-controls="study-original-card" className="flex min-h-control w-full items-center justify-between gap-3 p-4 text-left sm:px-5">
                            <CoreTag tone="neutral">Originalkarte</CoreTag>
                            <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-core-muted transition-transform motion-reduce:transition-none ${showOriginal ? "rotate-180" : ""}`} />
                          </button>
                          {showOriginal ? (
                            <div id="study-original-card" className="border-t border-core-border p-4 sm:p-5">
                              <NoteCardContent note={currentNote} card={current.card} surface="preview" mediaUrls={studyMediaUrls} revealed onReveal={() => undefined} />
                            </div>
                          ) : null}
                        </section>
                        <ActionButton variant="secondary" icon={Shuffle} onClick={() => onEditCard(current.deckId, current.cardId, "variants")}>
                          Varianten verwalten
                        </ActionButton>
                      </div>
                    ) : null
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 core-action-primary">
                      <RotateCcw size={16} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : loadMoreError && pausedOffline ? (
              <div className="text-center" role="status">
                <span className="core-surface mx-auto grid size-12 place-items-center rounded-control text-core-warning" aria-hidden="true"><CircleAlert size={24} /></span>
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">Lernen pausiert – du bist offline</h1>
                <p className="mt-2 core-body text-core-secondary">Die nächsten fälligen Karten liegen nicht auf diesem Gerät. Deine Bewertungen sind gespeichert; sobald die Verbindung zurück ist, geht es automatisch weiter.</p>
                <p className="mt-2 core-body text-core-secondary">Stapel, die du ohne Verbindung lernen willst, machst du vorher mit „Offline verfügbar machen“ verfügbar.</p>
              </div>
            ) : loadMoreError ? (
              <div className="text-center">
                <span className="core-surface mx-auto grid size-12 place-items-center rounded-control text-core-warning" aria-hidden="true"><CircleAlert size={24} /></span>
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">Weitere Karten konnten nicht geladen werden</h1>
                <p className="mt-2 core-body text-core-secondary">{loadMoreError}</p>
                <button type="button" onClick={() => setLoadMoreError("")} className="mt-6 core-action-primary">
                  Erneut versuchen
                </button>
              </div>
            ) : loadingMoreCards || moreCardsAvailable ? (
              <div className="text-center" role="status">
                <h1 ref={completionHeadingRef} tabIndex={-1} className="core-heading-2 text-core-text outline-none">Weitere Karten werden geladen</h1>
                <p className="mt-2 core-body text-core-secondary">Deine bisherige Sitzung bleibt erhalten.</p>
              </div>
            ) : limitReachedAtStart ? (
              <div className="text-center">
                <span className="core-surface mx-auto grid size-12 place-items-center rounded-control text-core-warning" aria-hidden="true"><CircleAlert size={24} /></span>
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">Tageslimit erreicht</h1>
                <p className="mt-2 core-body text-core-secondary">{limitSummaryText}</p>
                <button type="button" onClick={onReturnToLearn} className="mt-6 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : hasWaitingLearningCards ? (
              <div className="text-center">
                <span className="core-surface mx-auto grid size-12 place-items-center rounded-control text-core-success" aria-hidden="true"><CheckCircle2 size={24} /></span>
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">Für jetzt geschafft</h1>
                <p className="mt-2 core-body text-core-secondary">Die restlichen Lernkarten sind vorgemerkt und bleiben „Offen“.</p>
                {queue.limitSummary.reached ? <p className="mt-4 core-status-warning" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-6 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : answeredCount > 0 ? (
              <div className="text-center">
                <span className="core-surface mx-auto grid size-12 place-items-center rounded-control text-core-success" aria-hidden="true"><CheckCircle2 size={24} /></span>
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">Sitzung abgeschlossen</h1>
                <p className="mt-2 core-body text-core-secondary">
                  {completedInitialCount} {completedInitialCount === 1 ? "Karte" : "Karten"} · {repeatCount} {repeatCount === 1 ? "Wiederholung" : "Wiederholungen"}
                </p>
                {queue.limitSummary.reached ? <p className="mt-4 core-status-warning" role="status">{limitSummaryText}</p> : null}
                <button type="button" onClick={onReturnToLearn} className="mt-6 core-action-primary">
                  Zurück zum Ausgangspunkt
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="core-heading-2 text-core-text">Keine fälligen Karten</h1>
                <p className="mt-2 core-body text-core-secondary">Dieser Stapel hat für heute keine Karten in der Lern-Queue.</p>
              </div>
            )}
          </div>
        </section>

        {showAnswer ? (
          <footer className="grid gap-2 sm:grid-cols-4 sm:gap-3">
            {ratingButtons.map((rating) => {
              const ratingKey = rating.key as ReviewRating;
              const intervalLabel = formatReviewIntervalLabel(current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ?? "");
              return <CoreTooltip key={rating.key} label={`Taste ${rating.shortcutKey}`}>
                <button type="button" onClick={() => grade(ratingKey)} disabled={!current} aria-label={`Bewertung ${rating.label}${intervalLabel ? `: ${intervalLabel}` : ""}`} className={`core-rating-button ${rating.className}`}>
                  <span className="core-rating-dot" aria-hidden="true" />
                  <span className="core-control-label">{rating.label}</span>
                  {intervalLabel ? <span className="core-caption font-medium tabular-nums text-core-secondary">{intervalLabel}</span> : null}
                </button>
              </CoreTooltip>
            })}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
