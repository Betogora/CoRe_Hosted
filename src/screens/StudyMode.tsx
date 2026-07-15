import React from "react";
import { Ban, CheckCircle2, Eye, Flag, RotateCcw, SlidersHorizontal, X, XCircle } from "lucide-react";
import { getLearningItemAnswer, getLearningItemQuestion } from "../coreModel.ts";
import { resolveReviewShortcut } from "../reviewShortcuts.ts";
import { answerVariant, createDailyReviewQueue, recordVariantFeedback, updateDeckNewCardLimitForDate } from "../reviewService.ts";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { MiniProgress } from "../ui/coreUi.tsx";
import { ratingButtons } from "./screenConstants.ts";
import type { CardVariant, Deck, ReviewRating } from "../coreTypes.ts";

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

export function StudyMode({ deck, decks = [deck].filter(Boolean), deckId = deck?.id, variantSession, mediaStore, onExit, onReturnToLearn = onExit, onDeckUpdated, onReviewEvent }: any) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const [reviewedCount, setReviewedCount] = React.useState(0);
  const [reviewedKeys, setReviewedKeys] = React.useState<any[]>([]);
  const [sessionTargetCount, setSessionTargetCount] = React.useState<number | null>(null);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const [showSource, setShowSource] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [selectedChoice, setSelectedChoice] = React.useState("");
  const [feedbackStatus, setFeedbackStatus] = React.useState("");
  const answerHeadingRef = React.useRef<HTMLParagraphElement>(null);
  const feedbackDeckRef = React.useRef<Deck | null>(null);
  const rootDeck = sessionDecks.find((candidate: any) => candidate.id === deckId) ?? deck ?? sessionDecks[0] ?? null;
  const queue = React.useMemo(
    () =>
      createDailyReviewQueue(sessionDecks, {
        deckId: rootDeck?.id,
        language: "de",
        variantSession,
        excludeKeys: reviewedKeys,
      }),
    [sessionDecks, rootDeck?.id, variantSession, reviewedKeys],
  );
  const current = sessionTargetCount !== null && reviewedCount >= sessionTargetCount ? null : queue.items[0] ?? null;
  const currentDeck = sessionDecks.find((candidate: any) => candidate.id === current?.deckId) ?? rootDeck;
  const sessionTotal = sessionTargetCount ?? queue.total;
  const progress = sessionTotal ? (Math.min(reviewedCount + (current ? 1 : 0), sessionTotal) / sessionTotal) * 100 : 0;
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
    ? "border-[#dfe4f5] bg-[#f8f9fe] text-[#4e5b8c]"
    : selectedChoiceIsCorrect
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  React.useEffect(() => {
    setSessionDecks(decks);
    setReviewedCount(0);
    setReviewedKeys([]);
    setSessionTargetCount(null);
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSource(false);
    setShowSettings(false);
    setSelectedChoice("");
    setFeedbackStatus("");
    feedbackDeckRef.current = null;
  }, [deckId, variantSession, decks.length]);

  React.useEffect(() => {
    if (sessionTargetCount === null) setSessionTargetCount(queue.total);
  }, [queue.total, sessionTargetCount]);

  React.useEffect(() => {
    setSelectedChoice("");
  }, [current?.learningItemId, current?.variantId]);

  function reviewItemKey(item = current) {
    return item ? `${item.deckId}:${item.learningItemId}` : "";
  }

  function replaceSessionDeck(updatedDeck: Deck, nextDecks = sessionDecks) {
    return nextDecks.map((candidate: any) => (candidate.id === updatedDeck.id ? updatedDeck : candidate));
  }

  function finishOrNext(updatedDeck: Deck, nextCount: React.SetStateAction<number>, reviewedKey: string) {
    const nextDecks = replaceSessionDeck(updatedDeck);
    const nextReviewedKeys = [...reviewedKeys, reviewedKey].filter(Boolean);
    onDeckUpdated(updatedDeck);
    setSessionDecks(nextDecks);
    setReviewedKeys(nextReviewedKeys);
    setReviewedCount(nextCount);
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
    const result = answerVariant(feedbackDeckRef.current ?? currentDeck, current.learningItemId, current.cardVariantId, rating, {
      now: new Date().toISOString(),
    });
    onReviewEvent?.(result.event);
    finishOrNext(result.deck, reviewedCount + 1, reviewItemKey());
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

  function setTodayNewCardLimit(limit: unknown) {
    if (!rootDeck) return;
    const updatedRootDeck = updateDeckNewCardLimitForDate(rootDeck, limit);
    onDeckUpdated(updatedRootDeck);
    setSessionDecks((currentDecks: any) => replaceSessionDeck(updatedRootDeck, currentDecks));
  }

  React.useEffect(() => {
    if (showAnswer) answerHeadingRef.current?.focus();
  }, [showAnswer]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
  }, [current, showAnswer, sessionDecks, reviewedCount, reviewedKeys]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#eef2fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={onExit} className="core-surface grid size-11 place-items-center rounded-full text-[#4f5eb1]" aria-label="Lernmodus verlassen">
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#66709a]">{rootDeck?.name ?? deck?.name}</p>
              <p className="mt-1 text-sm text-[#66709a]">{current ? `${Math.min(reviewedCount + 1, sessionTotal)} / ${sessionTotal}` : reviewedCount ? `${reviewedCount} / ${reviewedCount}` : "0 / 0"}</p>
            </div>
            <button type="button" onClick={() => setShowSettings((value) => !value)} className="core-surface grid size-11 place-items-center rounded-full text-[#4f5eb1]" aria-label="Lerneinstellungen">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <MiniProgress value={progress} />
          {studyMissingMedia.length > 0 ? <p className="text-center text-sm text-amber-800" role="status">{studyMissingMedia[0].status}{studyMissingMedia.length > 1 ? ` (${studyMissingMedia.length} Medien)` : ""}</p> : null}
          {showSettings ? (
            <div className="core-surface rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-4">
                <label className="grid gap-1 text-sm font-semibold text-[#4e5b8c]">
                  Neue Karten heute
                  <input
                    className="min-h-11 w-32 rounded-xl border border-[#dfe4f5] px-3 text-[#17214f]"
                    type="number"
                    min="0"
                    max="500"
                    value={queue.newCardsPerDay}
                    onChange={(event) => setTodayNewCardLimit(event.target.value)}
                  />
                </label>
                <div className="grid gap-1 text-sm text-[#66709a]">
                  <span>{queue.newCardsIntroducedToday} heute eingeführt</span>
                  <span>{queue.availableNewCards} neue Karten im Stapel verfügbar</span>
                </div>
                <button type="button" onClick={() => setTodayNewCardLimit(queue.newCardsPerDay + 10)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
                  +10
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="core-surface-raised flex min-h-[56vh] w-full flex-col justify-center rounded-[28px] p-8 sm:p-14">
            {current ? (
              <>
                <div className="w-full">
                  <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">Frage</p>
                  <div className="text-2xl font-semibold leading-relaxed text-[#17214f] sm:text-4xl">
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
                            ? "core-mcq-option-correct border-emerald-300 bg-emerald-50 text-emerald-800"
                            : isWrongSelection
                              ? "core-mcq-option-wrong border-red-300 bg-red-50 text-red-800"
                              : "border-[#dfe4f5] bg-white/72 text-[#66709a]"
                          : isSelected
                            ? "border-[#4f5eb1] bg-[#eef1fb] text-[#24327a]"
                            : "border-[#dfe4f5] bg-white/88 text-[#4e5b8c] hover:border-[#8c96dc] hover:bg-[#f8f9fe]";
                        return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => selectChoice(option)}
                          disabled={showAnswer}
                          aria-pressed={isSelected}
                          aria-label={`Antwortoption ${String.fromCharCode(65 + index)}: ${option}`}
                          className={`core-mcq-option flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-semibold ${stateClass}`}
                        >
                          <span><span className="mr-2 text-xs uppercase tracking-wide opacity-70">{String.fromCharCode(65 + index)}</span>{option}</span>
                          {showAnswer && isCorrect ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : null}
                          {isWrongSelection ? <XCircle className="shrink-0" size={18} aria-hidden="true" /> : null}
                        </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {hasIncompleteMultipleChoice ? (
                    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800" role="alert">
                      Diese Multiple-Choice-Karte hat keine vollständigen Antwortoptionen und wird wie eine normale Karte angezeigt.
                    </div>
                  ) : null}
                  {showAnswer ? (
                    <>
                      <div className="my-8 h-px bg-[#dfe4f5]" />
                      <p ref={answerHeadingRef} tabIndex={-1} className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7] outline-none">Antwort</p>
                      <div className="text-xl font-semibold leading-relaxed text-[#17214f] sm:text-3xl">
                        <CardHtml html={current.back} mediaUrls={studyMediaUrls} />
                      </div>
                      {isMultipleChoice ? (
                        <div className={`mt-5 rounded-2xl border p-4 text-sm ${multipleChoiceFeedbackClass}`}>
                          <p className="font-semibold">{selectedChoice ? (selectedChoiceIsCorrect ? "Richtig ausgewählt." : "Nicht ganz.") : "Lösung aufgedeckt."}</p>
                          <p className="mt-2">Richtige Antwort: {expectedAnswer}</p>
                          {selectedChoice ? <p className="mt-1">Deine Auswahl: {selectedChoice}</p> : null}
                        </div>
                      ) : null}
                      <div className="mt-8 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setShowAnchor((value) => !value)} aria-expanded={showAnchor} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
                            <Eye size={16} aria-hidden="true" />
                            {showAnchor ? "Original ausblenden" : "Original anzeigen"}
                          </button>
                          {sourceAnchor ? (
                            <button type="button" onClick={() => setShowSource((value) => !value)} aria-expanded={showSource} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
                              <Eye size={16} aria-hidden="true" />
                              {showSource ? "Quelle ausblenden" : "Quelle anzeigen"}
                            </button>
                          ) : null}
                          {isCurrentVariant ? (
                            <button type="button" onClick={() => updateVariant("disable")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">
                              <Ban size={16} aria-hidden="true" />
                              Nicht mehr zeigen
                            </button>
                          ) : null}
                        </div>
                        {isCurrentVariant ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Problem melden">
                            <span className="text-sm font-semibold text-[#66709a]">Problem melden:</span>
                            <button type="button" onClick={() => updateVariant("flag", "fachlich_falsch")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700">
                              <Flag size={16} aria-hidden="true" />
                              Inhaltlich falsch
                            </button>
                            <button type="button" onClick={() => updateVariant("flag", "unklar_formuliert")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700">
                              <Flag size={16} aria-hidden="true" />
                              Unklar formuliert
                            </button>
                          </div>
                        ) : null}
                        {feedbackStatus ? <p className="mt-3 text-sm font-semibold text-[#4e5b8c]" role="status">{feedbackStatus}</p> : null}
                        {showAnchor && sourceCard ? (
                          <div className="mt-4 border-t border-[#dfe4f5] pt-4" data-testid="original-anchor">
                            <p className="text-sm font-semibold text-[#66709a]">Originalkarte</p>
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-semibold text-[#66709a]">Vorderseite</p>
                                <CardHtml html={getLearningItemQuestion(sourceCard)} mediaUrls={studyMediaUrls} />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold text-[#66709a]">Rückseite</p>
                                <CardHtml html={getLearningItemAnswer(sourceCard)} mediaUrls={studyMediaUrls} />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {showSource && sourceAnchor ? (
                          <div className="mt-4 border-t border-[#dfe4f5] pt-4" data-testid="source-anchor">
                            <p className="text-sm font-semibold text-[#66709a]">Quelle</p>
                            <p className="mt-2 text-sm text-[#4e5b8c]">{sourceAnchor.documentName}{sourceAnchor.pageNumber ? `, Seite ${sourceAnchor.pageNumber}` : ""}</p>
                            {sourceAnchor.textQuote ? <blockquote className="mt-2 border-l-2 border-[#cbd2ee] pl-3 text-sm text-[#66709a]">{sourceAnchor.textQuote}</blockquote> : null}
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : reviewedCount > 0 ? (
              <div className="text-center" role="status" aria-live="polite">
                <CheckCircle2 className="mx-auto text-emerald-600" size={44} aria-hidden="true" />
                <h1 className="mt-4 text-3xl font-semibold">Sitzung abgeschlossen</h1>
                <p className="mt-3 text-[#66709a]">{reviewedCount} {reviewedCount === 1 ? "Karte" : "Karten"} beantwortet.</p>
                <button type="button" onClick={onReturnToLearn} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
                  Zurück zu Lernen
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="text-3xl font-semibold">Keine fälligen Karten</h1>
                <p className="mt-3 text-[#66709a]">Dieser Stapel hat für heute keine Karten in der Lern-Queue.</p>
              </div>
            )}
          </div>
        </section>

        {showAnswer ? (
          <footer className="grid gap-3 sm:grid-cols-4">
            {ratingButtons.map((rating) => {
              const ratingKey = rating.key as ReviewRating;
              return <button key={rating.key} type="button" onClick={() => grade(ratingKey)} disabled={!current} aria-label={`Bewertung ${rating.label}${current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ? `: ${current.ratingButtonOptions[ratingKey].intervalLabel}` : ""}`} className={`min-h-20 rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
                <span className="block text-2xl font-semibold">{rating.number}</span>
                <span className="mt-1 block text-sm font-semibold">{rating.label}</span>
                <span className="mt-1 block text-xs font-semibold opacity-80">{current?.ratingButtonOptions?.[ratingKey]?.intervalLabel ?? ""}</span>
              </button>
            })}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
