import React from "react";
import { Anchor, Ban, CheckCircle2, CircleAlert, Eye, RotateCcw, SlidersHorizontal, X, XCircle } from "lucide-react";
import type { StudyModeProps } from "../appScreenProps.ts";
import { getLearningItemAnswer, getLearningItemQuestion, isLearningItemMarked } from "../coreModel.ts";
import { resolveReviewShortcut } from "../reviewShortcuts.ts";
import { createReviewResponseTimer } from "../reviewTiming.ts";
import { formatSimulationDate } from "../simulationClock.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  createDailyReviewQueue,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  removeDailyReviewSessionItem,
  recordVariantFeedback,
  type DailyReviewProgressSummary,
  type DailyReviewSessionState,
} from "../reviewService.ts";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { formatLearningCardCount, LEARNING_STATUS_UI } from "../ui/learningStatusUi.ts";
import { StudySettingsOverlay } from "../ui/StudySettingsOverlay.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { ratingButtons } from "./screenConstants.ts";
import type { CardVariant, Deck, LearningItemStudyStatePatch, ReviewRating, ReviewState } from "../coreTypes.ts";

function normalizeReviewCardType(cardType: string, variant: CardVariant|undefined) {
  if (variant?.variantType === "reverse") return "basic-reversed";
  if (cardType === "multiple-choice" || cardType === "cloze" || cardType === "basic-reversed") return cardType;
  return "basic";
}

function normalizeChoiceOptions(value: unknown) {
  if (Array.isArray(value)) return value.map((option) => String(option).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim())
    .filter(Boolean);
}

function normalizeExpectedAnswer(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function sameAnswer(left: string, right: string) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

const studyProgressSegments = [
  { key: "learned", countKey: "learnedTodayCount", ...LEARNING_STATUS_UI.learned },
  { key: "new", countKey: "newCount", ...LEARNING_STATUS_UI.new },
  { key: "in-progress", countKey: "inProgressCount", ...LEARNING_STATUS_UI.inProgress },
  { key: "due", countKey: "dueCount", ...LEARNING_STATUS_UI.due },
] as const;

function DailyReviewProgress({ progress }: { progress: DailyReviewProgressSummary }) {
  const valueText = studyProgressSegments
    .map((segment) => `${segment.label}: ${formatLearningCardCount(progress[segment.countKey])}`)
    .join(", ");

  return (
    <div
      className="flex h-3 overflow-hidden rounded-full bg-core-subtle"
      role="progressbar"
      aria-label="Lernfortschritt"
      aria-valuemin={0}
      aria-valuemax={Math.max(1, progress.total)}
      aria-valuenow={progress.learnedTodayCount}
      aria-valuetext={valueText}
      data-testid="study-daily-progress"
    >
      {studyProgressSegments.map((segment) => {
        const count = progress[segment.countKey];
        return count > 0 ? (
          <CoreTooltip key={segment.key} label={segment.label} swatchColor={segment.color} value={formatLearningCardCount(count)}>
            <span
              aria-hidden="true"
              data-study-progress-segment={segment.key}
              className="h-full"
              style={{ backgroundColor: segment.color, flexBasis: 0, flexGrow: count }}
            />
          </CoreTooltip>
        ) : null;
      })}
    </div>
  );
}

export function StudyMode({ deck, decks, deckId, variantSession, mediaStore, getNow, simulationDayOffset, onExit, onReturnToLearn, onEditCard, onEditDeck, onSetCardStudyState, onDeckUpdated, onReviewEvent }: StudyModeProps) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const [reviewSession, setReviewSession] = React.useState<DailyReviewSessionState | null>(null);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const [showSource, setShowSource] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [selectedChoice, setSelectedChoice] = React.useState("");
  const [feedbackStatus, setFeedbackStatus] = React.useState("");
  const answerHeadingRef = React.useRef<HTMLParagraphElement>(null);
  const questionHeadingRef = React.useRef<HTMLParagraphElement>(null);
  const completionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const feedbackDeckRef = React.useRef<Deck | null>(null);
  const setSuccessToast = useSuccessToast();
  const responseTimer = React.useMemo(() => createReviewResponseTimer(), []);
  const rootDeck = sessionDecks.find((candidate) => candidate.id === deckId) ?? deck ?? sessionDecks[0] ?? null;
  const queue = React.useMemo(
    () =>
      createDailyReviewQueue(sessionDecks, {
        deckId: rootDeck?.id,
        now: getNow(),
        language: "de",
        variantSession,
      }),
    [getNow, sessionDecks, rootDeck?.id, variantSession],
  );
  const effectiveReviewSession = reviewSession ?? createDailyReviewSessionState(queue.items);
  const current = React.useMemo(
    () => getNextDailyReviewSessionItem(sessionDecks, effectiveReviewSession, { deckId: rootDeck?.id, now: getNow(), language: "de", variantSession }),
    [getNow, sessionDecks, effectiveReviewSession, rootDeck?.id, variantSession],
  );
  const currentDeck = sessionDecks.find((candidate) => candidate.id === current?.deckId) ?? rootDeck;
  const sessionTotal = effectiveReviewSession.initialKeys.length;
  const completedInitialCount = effectiveReviewSession.completedInitialKeys.length;
  const repeatCount = effectiveReviewSession.repeatCount;
  const answeredCount = completedInitialCount + repeatCount;
  const sourceCard = current?.learningItem ?? null;
  const isCurrentVariant = Boolean(current?.variant && !current.variant.isOriginal);
  const sourceAnchor = current?.variant?.sourceAnchors?.[0] ?? sourceCard?.sourceAnchors?.[0] ?? null;
  const { urls: studyMediaUrls, missing: studyMissingMedia } = useDeckMediaUrls(currentDeck, mediaStore);
  const rawCardType = String(sourceCard?.kind ?? sourceCard?.cardType ?? current?.variant?.meta?.cardType ?? "basic");
  const cardType = normalizeReviewCardType(rawCardType, current?.variant);
  const answerOptions = normalizeChoiceOptions(current?.variant?.answerOptionsJson ?? sourceCard?.meta?.answerOptions ?? []);
  const expectedAnswer = normalizeExpectedAnswer(current?.variant?.expectedAnswerJson ?? sourceCard?.meta?.correctAnswer ?? sourceCard?.meta?.expectedAnswer ?? current?.back ?? "");
  const isMultipleChoice = cardType === "multiple-choice" && answerOptions.length >= 2 && expectedAnswer && answerOptions.some((option) => sameAnswer(option, expectedAnswer));
  const hasIncompleteMultipleChoice = cardType === "multiple-choice" && !isMultipleChoice;
  const selectedChoiceIsCorrect = Boolean(isMultipleChoice && selectedChoice && sameAnswer(selectedChoice, expectedAnswer));
  const multipleChoiceFeedbackClass = !selectedChoice
    ? "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-secondary)]"
    : selectedChoiceIsCorrect
      ? "border-core-success bg-core-success-soft text-core-text"
      : "border-core-danger bg-core-danger-soft text-core-text";

  React.useEffect(() => {
    setSessionDecks(decks);
    setReviewSession(null);
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSource(false);
    setShowSettings(false);
    setSelectedChoice("");
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }, [deckId, variantSession, decks.length]);

  React.useEffect(() => {
    if (reviewSession === null) setReviewSession(createDailyReviewSessionState(queue.items));
  }, [queue.items, reviewSession]);

  React.useEffect(() => {
    setSelectedChoice("");
    if (current) responseTimer.start();
    else responseTimer.reset();
    return () => responseTimer.reset();
  }, [answeredCount, current?.learningItemId, current?.variantId, responseTimer]);

  function replaceSessionDeck(updatedDeck: Deck, nextDecks = sessionDecks) {
    return nextDecks.map((candidate) => (candidate.id === updatedDeck.id ? updatedDeck : candidate));
  }

  function finishOrNext(updatedDeck: Deck, rating: ReviewRating, nextReviewState: ReviewState, reviewedKey: string) {
    const nextDecks = replaceSessionDeck(updatedDeck);
    onDeckUpdated(updatedDeck);
    setSessionDecks(nextDecks);
    setReviewSession((session) => session && reviewedKey
      ? advanceDailyReviewSession(session, { key: reviewedKey, rating, nextReviewState })
      : session);
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSource(false);
    setSelectedChoice("");
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }

  function selectChoice(option: React.SetStateAction<string>) {
    if (!isMultipleChoice || showAnswer) return;
    setSelectedChoice(option);
    setShowAnswer(true);
  }

  function grade(rating: ReviewRating) {
    if (!current || !currentDeck) return;
    const responseTimeMs = responseTimer.stop();
    const result = answerVariant(feedbackDeckRef.current ?? currentDeck, current.learningItemId, current.cardVariantId, rating, {
      now: getNow(),
      responseTimeMs,
    });
    onReviewEvent?.(result.event);
    finishOrNext(result.deck, rating, result.updatedCard.reviewState, current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`);
  }

  function updateVariant(action: "disable" | "flag", feedbackType?: "fachlich_falsch" | "unklar_formuliert") {
    if (!isCurrentVariant || !currentDeck || !current) return;
    const result = recordVariantFeedback(feedbackDeckRef.current ?? currentDeck, {
      id: current.variantId,
      sourceCardId: current.learningItemId,
      isVariant: true,
    }, { action, feedbackType });
    feedbackDeckRef.current = result.deck;
    onDeckUpdated(result.deck);
    setFeedbackStatus(action === "disable" ? "Diese Abfrage wird künftig nicht mehr gezeigt." : "Danke. Der ausgewählte Grund wurde gespeichert.");
  }

  function updateCurrentStudyState(patch: LearningItemStudyStatePatch) {
    if (!current) return;
    const updatedDeck = onSetCardStudyState(current.deckId, current.learningItemId, patch);
    if (!updatedDeck) return;
    const nextDecks = replaceSessionDeck(updatedDeck);
    setSessionDecks(nextDecks);

    if (patch.suspended !== true) return;
    const currentKey = current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`;
    setShowSettings(false);
    setReviewSession((session) => removeDailyReviewSessionItem(session ?? effectiveReviewSession, currentKey));
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSource(false);
    setSelectedChoice("");
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
    setSuccessToast("Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.");
  }

  React.useEffect(() => {
    if (showAnswer) answerHeadingRef.current?.focus();
  }, [showAnswer]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (current) questionHeadingRef.current?.focus();
      else if (answeredCount > 0) completionHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current?.learningItemId, current?.variantId, answeredCount]);

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
            <button type="button" onClick={onExit} className="core-surface grid size-11 place-items-center rounded-full text-[var(--core-action-primary)]" aria-label="Lernmodus verlassen">
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
            <button ref={settingsButtonRef} type="button" onClick={() => setShowSettings((value) => !value)} className="core-surface grid size-11 place-items-center rounded-full text-[var(--core-action-primary)]" aria-label="Lerneinstellungen" aria-haspopup="dialog" aria-expanded={showSettings} aria-controls="study-settings-overlay">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          {simulationDayOffset > 0 ? (
            <p className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 text-center core-body font-semibold text-core-text" role="status">
              Simulation aktiv · {formatSimulationDate(getNow())} · +{simulationDayOffset} Tage
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 core-status-label uppercase tracking-wide text-[var(--core-text-muted)]">
              <span>Lernfortschritt</span>
              <span>{queue.dailyProgress.learnedTodayCount} / {queue.dailyProgress.total} Karten</span>
            </div>
            <DailyReviewProgress progress={queue.dailyProgress} />
          </div>
          <div className="grid gap-2" aria-label="Pomodoro: 25 Minuten – noch nicht verfügbar">
            <div className="flex items-center justify-between gap-3 core-status-label uppercase tracking-wide text-[var(--core-text-muted)]">
              <span>Pomodoro · 25 Min.</span>
              <span>Noch nicht verfügbar</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-core-subtle" data-testid="study-pomodoro-progress" aria-hidden="true">
              <div className="h-full w-full rounded-full bg-core-action" />
            </div>
          </div>
          {studyMissingMedia.length > 0 ? <p className="core-status-warning text-center core-body" role="status">{studyMissingMedia[0].status}{studyMissingMedia.length > 1 ? ` (${studyMissingMedia.length} Medien)` : ""}</p> : null}
        </header>

        <StudySettingsOverlay
          open={showSettings}
          canEditCard={Boolean(current?.deckId && current.learningItemId)}
          marked={isLearningItemMarked(sourceCard)}
          suspended={sourceCard?.status === "suspended"}
          onOpenChange={setShowSettings}
          onEditCard={() => {
            if (current?.deckId && current.learningItemId) onEditCard(current.deckId, current.learningItemId);
          }}
          onEditDeck={() => {
            if (rootDeck) onEditDeck(rootDeck.id);
          }}
          onMarkedChange={(marked) => updateCurrentStudyState({ marked })}
          onSuspendedChange={(suspended) => updateCurrentStudyState({ suspended })}
        />

        <section className="grid flex-1 place-items-center py-8">
          <div className="core-study-card core-surface-raised flex min-h-[56vh] w-full flex-col justify-center rounded-[28px] p-6 sm:p-14">
            {current ? (
              <>
                <div className="w-full">
                  {current.sessionInfo?.isRepeat ? (
                    <p className="mb-4 core-body font-semibold text-[var(--core-action-secondary)]" role="status">
                      {current.sessionInfo.isEarlyRepeat ? "Vorgezogene Wiederholung" : "Wiederholung"}
                    </p>
                  ) : null}
                  <p ref={questionHeadingRef} tabIndex={-1} className="mb-5 core-body font-semibold uppercase tracking-[0.18em] text-[var(--core-action-secondary)] outline-none">Frage</p>
                  <div className="core-study-card-front text-[var(--core-text)]">
                    <CardHtml html={current.front} mediaUrls={studyMediaUrls} />
                  </div>
                  {isMultipleChoice ? (
                    <div className="mt-6 grid gap-3">
                      {answerOptions.map((option, index) => {
                        const isSelected = sameAnswer(option, selectedChoice);
                        const isCorrect = sameAnswer(option, expectedAnswer);
                        const isWrongSelection = showAnswer && isSelected && !isCorrect;
                        const stateClass = showAnswer
                          ? isCorrect
                            ? "core-mcq-option-correct border-core-success bg-core-success-soft text-core-text"
                            : isWrongSelection
                              ? "core-mcq-option-wrong border-core-danger bg-core-danger-soft text-core-text"
                              : "border-[var(--core-border)] bg-core-surface text-[var(--core-text-muted)]"
                          : isSelected
                            ? "border-[var(--core-action-primary)] bg-[var(--core-surface-muted)] text-[var(--core-text)]"
                            : "border-[var(--core-border)] bg-core-surface text-[var(--core-text-secondary)] hover:border-[var(--core-border-interactive)] hover:bg-[var(--core-surface-muted)]";
                        return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => selectChoice(option)}
                          disabled={showAnswer}
                          aria-pressed={isSelected}
                          aria-label={`Antwortoption ${String.fromCharCode(65 + index)}: ${option}`}
                          className={`core-mcq-option flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left core-body font-semibold ${stateClass}`}
                        >
                          <span><span className="mr-2 core-caption uppercase tracking-wide opacity-70">{String.fromCharCode(65 + index)}</span>{option}</span>
                          {showAnswer && isCorrect ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : null}
                          {isWrongSelection ? <XCircle className="shrink-0" size={18} aria-hidden="true" /> : null}
                        </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {hasIncompleteMultipleChoice ? (
                    <div className="mt-6 rounded-2xl border border-core-warning bg-core-warning-soft p-4 core-body font-semibold text-core-text" role="alert">
                      Diese Multiple-Choice-Karte hat keine vollständigen Antwortoptionen und wird wie eine normale Karte angezeigt.
                    </div>
                  ) : null}
                  {showAnswer ? (
                    <>
                      <div className="my-8 h-px bg-[var(--core-border)]" />
                      <p ref={answerHeadingRef} tabIndex={-1} className="mb-4 core-body font-semibold uppercase tracking-[0.18em] text-[var(--core-action-secondary)] outline-none">Antwort</p>
                      <div className="core-study-card-back text-[var(--core-text)]">
                        <CardHtml html={current.back} mediaUrls={studyMediaUrls} />
                      </div>
                      {isMultipleChoice ? (
                        <div className={`core-mcq-feedback mt-5 rounded-2xl border p-4 ${multipleChoiceFeedbackClass}`}>
                          <p className="font-semibold">{selectedChoice ? (selectedChoiceIsCorrect ? "Richtig ausgewählt." : "Nicht ganz.") : "Lösung aufgedeckt."}</p>
                          <p className="mt-2">Richtige Antwort: {expectedAnswer}</p>
                          {selectedChoice ? <p className="mt-1">Deine Auswahl: {selectedChoice}</p> : null}
                        </div>
                      ) : null}
                      <div className="mt-8 rounded-2xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
                        <div className="flex flex-wrap gap-2">
                          {isCurrentVariant ? (
                            <button type="button" onClick={() => setShowAnchor((value) => !value)} aria-expanded={showAnchor} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-semibold text-[var(--core-action-primary)]">
                              <Anchor size={16} aria-hidden="true" />
                              {showAnchor ? "Original ausblenden" : "Original anzeigen"}
                            </button>
                          ) : null}
                          {sourceAnchor ? (
                            <button type="button" onClick={() => setShowSource((value) => !value)} aria-expanded={showSource} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-semibold text-[var(--core-action-primary)]">
                              <Eye size={16} aria-hidden="true" />
                              {showSource ? "Quelle ausblenden" : "Quelle anzeigen"}
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
                          <div className="mt-4 border-t border-[var(--core-border)] pt-4" data-testid="original-anchor">
                            <p className="core-body font-semibold text-[var(--core-text-muted)]">Originalkarte</p>
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                              <div>
                                <p className="mb-1 core-caption font-semibold text-[var(--core-text-muted)]">Vorderseite</p>
                                <CardHtml html={getLearningItemQuestion(sourceCard)} mediaUrls={studyMediaUrls} />
                              </div>
                              <div>
                                <p className="mb-1 core-caption font-semibold text-[var(--core-text-muted)]">Rückseite</p>
                                <CardHtml html={getLearningItemAnswer(sourceCard)} mediaUrls={studyMediaUrls} />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {showSource && sourceAnchor ? (
                          <div className="mt-4 border-t border-[var(--core-border)] pt-4" data-testid="source-anchor">
                            <p className="core-body font-semibold text-[var(--core-text-muted)]">Quelle</p>
                            <p className="mt-2 core-body text-[var(--core-text-secondary)]">{sourceAnchor.documentName}{sourceAnchor.pageNumber ? `, Seite ${sourceAnchor.pageNumber}` : ""}</p>
                            {sourceAnchor.textQuote ? <blockquote className="mt-2 border-l-2 border-[var(--core-border)] pl-3 core-body text-[var(--core-text-muted)]">{sourceAnchor.textQuote}</blockquote> : null}
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : answeredCount > 0 ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto text-core-text" size={44} aria-hidden="true" />
                <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 font-semibold outline-none">Sitzung abgeschlossen</h1>
                <p className="mt-3 text-[var(--core-text-muted)]">
                  {completedInitialCount} {completedInitialCount === 1 ? "Karte" : "Karten"} · {repeatCount} {repeatCount === 1 ? "Wiederholung" : "Wiederholungen"}
                </p>
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
          <footer className="grid gap-3 sm:grid-cols-4">
            {ratingButtons.map((rating) => {
              const ratingKey = rating.key as ReviewRating;
              return <button key={rating.key} type="button" onClick={() => grade(ratingKey)} disabled={!current} aria-label={`Bewertung ${rating.label}${current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ? `: ${current.ratingButtonOptions[ratingKey].intervalLabel}` : ""}`} className={`min-h-20 rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
                <span className="block core-heading-2 font-semibold">{rating.number}</span>
                <span className="mt-1 block core-body font-semibold">{rating.label}</span>
                <span className="mt-1 block core-caption font-semibold opacity-80">{current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ?? ""}</span>
              </button>
            })}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
