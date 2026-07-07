import React from "react";
import { Ban, Eye, Flag, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { getLearningItemAnswer, getLearningItemQuestion } from "../coreModel.js";
import { resolveReviewShortcut } from "../reviewShortcuts.js";
import { answerVariant, createDailyReviewQueue, getLocalReviewDateKey, recordVariantFeedback } from "../reviewService.js";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.jsx";
import { MiniProgress } from "../ui/coreUi.jsx";
import { maturityStageLabels, ratingButtons } from "./screenConstants.js";

export function StudyMode({ deck, decks = [deck].filter(Boolean), deckId = deck?.id, variantSession, onExit, onDeckUpdated }) {
  const [sessionDecks, setSessionDecks] = React.useState(decks);
  const [reviewedCount, setReviewedCount] = React.useState(0);
  const [reviewedKeys, setReviewedKeys] = React.useState([]);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [selectedChoice, setSelectedChoice] = React.useState("");
  const [typedAnswer, setTypedAnswer] = React.useState("");
  const rootDeck = sessionDecks.find((candidate) => candidate.id === deckId) ?? deck ?? sessionDecks[0] ?? null;
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
  const current = queue.items[0] ?? null;
  const currentDeck = sessionDecks.find((candidate) => candidate.id === current?.deckId) ?? rootDeck;
  const sessionTotal = reviewedCount + queue.total;
  const progress = sessionTotal ? (Math.min(reviewedCount + (current ? 1 : 0), sessionTotal) / sessionTotal) * 100 : 0;
  const sourceCard = current?.learningItem ?? null;
  const isCurrentVariant = Boolean(current?.variant && !current.variant.isOriginal);
  const anchorMiniCard = current?.answerSideAnchorMiniCard;
  const { urls: studyMediaUrls } = useDeckMediaUrls(currentDeck);
  const cardType = sourceCard?.kind ?? sourceCard?.cardType ?? current?.variant?.meta?.cardType ?? "basic";
  const answerOptions = current?.variant?.answerOptionsJson ?? sourceCard?.meta?.answerOptions ?? [];
  const expectedAnswer = current?.variant?.expectedAnswerJson ?? sourceCard?.meta?.correctAnswer ?? sourceCard?.meta?.expectedAnswer ?? current?.back ?? "";
  const isMultipleChoice = cardType === "multiple-choice" && Array.isArray(answerOptions) && answerOptions.length > 0;
  const isFreeText = cardType === "free-text";

  React.useEffect(() => {
    setSessionDecks(decks);
    setReviewedCount(0);
    setReviewedKeys([]);
    setShowAnswer(false);
    setShowAnchor(false);
    setShowSettings(false);
    setSelectedChoice("");
    setTypedAnswer("");
  }, [deckId, variantSession, decks.length]);

  React.useEffect(() => {
    setSelectedChoice("");
    setTypedAnswer("");
  }, [current?.learningItemId, current?.variantId]);

  function reviewItemKey(item = current) {
    return item ? `${item.deckId}:${item.learningItemId}` : "";
  }

  function replaceSessionDeck(updatedDeck, nextDecks = sessionDecks) {
    return nextDecks.map((candidate) => (candidate.id === updatedDeck.id ? updatedDeck : candidate));
  }

  function finishOrNext(updatedDeck, nextCount, reviewedKey) {
    const nextDecks = replaceSessionDeck(updatedDeck);
    const nextReviewedKeys = [...reviewedKeys, reviewedKey].filter(Boolean);
    const nextQueue = createDailyReviewQueue(nextDecks, {
      deckId: rootDeck?.id,
      language: "de",
      variantSession,
      excludeKeys: nextReviewedKeys,
    });

    onDeckUpdated(updatedDeck);
    setSessionDecks(nextDecks);
    setReviewedKeys(nextReviewedKeys);
    setReviewedCount(nextCount);
    setShowAnswer(false);
    setShowAnchor(false);
    setSelectedChoice("");
    setTypedAnswer("");

    if (nextQueue.total === 0) {
      onExit();
    }
  }

  function grade(rating) {
    if (!current || !currentDeck) return;
    const result = answerVariant(currentDeck, current.learningItemId, current.cardVariantId, rating, {
      now: new Date().toISOString(),
    });
    finishOrNext(result.deck, reviewedCount + 1, reviewItemKey());
  }

  function updateVariant(action) {
    if (!isCurrentVariant || !currentDeck) return;
    const result = recordVariantFeedback(currentDeck, {
      id: current.variantId,
      sourceCardId: current.learningItemId,
      isVariant: true,
    }, { action });
    onDeckUpdated(result.deck);
    setSessionDecks((currentDecks) => replaceSessionDeck(result.deck, currentDecks));
  }

  function setTodayNewCardLimit(limit) {
    if (!rootDeck) return;
    const nextLimit = Math.max(0, Math.round(Number(limit) || 0));
    const updatedRootDeck = {
      ...rootDeck,
      deckSettings: {
        ...rootDeck.deckSettings,
        newCardsTodayOverride: {
          date: getLocalReviewDateKey(),
          limit: nextLimit,
        },
      },
      updatedAt: new Date().toISOString(),
    };
    onDeckUpdated(updatedRootDeck);
    setSessionDecks((currentDecks) => replaceSessionDeck(updatedRootDeck, currentDecks));
  }

  React.useEffect(() => {
    function handleKeyDown(event) {
      const action = resolveReviewShortcut(event, { hasCurrent: Boolean(current), showAnswer });
      if (!action) return;

      event.preventDefault();
      if (action.type === "exit") {
        onExit();
      } else if (action.type === "reveal") {
        setShowAnswer(true);
      } else if (action.type === "rate") {
        grade(action.rating);
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
              <p className="mt-1 text-sm text-[#66709a]">{current ? `${Math.min(reviewedCount + 1, sessionTotal)} / ${sessionTotal}` : "0 / 0"}</p>
            </div>
            <button type="button" onClick={() => setShowSettings((value) => !value)} className="core-surface grid size-11 place-items-center rounded-full text-[#4f5eb1]" aria-label="Lerneinstellungen">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <MiniProgress value={progress} />
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
                  {current.fallbackInfo?.active ? (
                    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                      {current.fallbackInfo.fallbackReason || "CoRe zeigt jetzt wieder eine einfachere Variante, bis diese sitzt."}
                    </div>
                  ) : null}
                  <div className="text-2xl font-semibold leading-relaxed text-[#17214f] sm:text-4xl">
                    <CardHtml html={current.front} mediaUrls={studyMediaUrls} />
                  </div>
                  {isMultipleChoice ? (
                    <div className="mt-6 grid gap-2">
                      {answerOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSelectedChoice(option)}
                          className={`min-h-11 rounded-xl border px-4 text-left text-sm font-semibold ${
                            selectedChoice === option ? "border-[#4f5eb1] bg-[#eef1fb] text-[#24327a]" : "border-[#dfe4f5] bg-white/80 text-[#4e5b8c]"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {isFreeText && !showAnswer ? (
                    <label className="mt-6 grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                      Deine Antwort
                      <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] bg-white/80 p-3 text-base leading-7 text-[#17214f]" value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} />
                    </label>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[#66709a]">
                    <span className="rounded-lg bg-[#eef1fb] px-2 py-1">{isCurrentVariant ? `Variante Level ${current.variant.variantLevel ?? 1}` : "Originalkarte"}</span>
                    <span className="rounded-lg bg-[#f8f9fe] px-2 py-1">{current.maturity?.label ?? maturityStageLabels[current.maturity?.stage] ?? "Reifegrad"}</span>
                    <span className="rounded-lg bg-[#f8f9fe] px-2 py-1">{current.reviewState?.schedulerVersion ?? "fsrs_v1"}</span>
                  </div>
                  {showAnswer ? (
                    <>
                      <div className="my-8 h-px bg-[#dfe4f5]" />
                      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">Antwort</p>
                      <div className="text-xl font-semibold leading-relaxed text-[#17214f] sm:text-3xl">
                        <CardHtml html={current.back} mediaUrls={studyMediaUrls} />
                      </div>
                      {isMultipleChoice ? (
                        <div className="mt-5 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-4 text-sm text-[#4e5b8c]">
                          <p className="font-semibold text-[#17214f]">Richtige Antwort: {expectedAnswer}</p>
                          {selectedChoice ? <p className="mt-2">Deine Auswahl: {selectedChoice}</p> : null}
                        </div>
                      ) : null}
                      {isFreeText && typedAnswer.trim() ? (
                        <div className="mt-5 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-4 text-sm text-[#4e5b8c]">
                          <p className="font-semibold text-[#17214f]">Deine Antwort</p>
                          <p className="mt-2 whitespace-pre-wrap">{typedAnswer}</p>
                        </div>
                      ) : null}
                      {anchorMiniCard?.shouldShow ? (
                        <div className="mt-6 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-[#66709a]">Ursprungskarte</p>
                          <p className="mt-2 text-sm text-[#66709a]">Diese Variante gehört zu dieser Grundkarte und löst keinen eigenen Review aus.</p>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Originalfrage</p>
                              <CardHtml html={anchorMiniCard.front} mediaUrls={studyMediaUrls} />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Originalantwort</p>
                              <CardHtml html={anchorMiniCard.back} mediaUrls={studyMediaUrls} />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-8 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowAnchor((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">
                          <Eye size={16} aria-hidden="true" />
                          Original anzeigen
                        </button>
                        {isCurrentVariant ? (
                          <>
                            <button type="button" onClick={() => updateVariant("disable")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">
                              <Ban size={16} aria-hidden="true" />
                              Nicht mehr zeigen
                            </button>
                            <button type="button" onClick={() => updateVariant("flag")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700">
                              <Flag size={16} aria-hidden="true" />
                              Fehler melden
                            </button>
                          </>
                        ) : null}
                      </div>
                      {showAnchor && sourceCard ? (
                        <div className="mt-5 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-[#66709a]">Originalanker</p>
                          <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Front</p>
                              <CardHtml html={getLearningItemQuestion(sourceCard)} mediaUrls={studyMediaUrls} />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Back</p>
                              <CardHtml html={getLearningItemAnswer(sourceCard)} mediaUrls={studyMediaUrls} />
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-[#66709a]">Quelle: {sourceCard?.sourceAnchors?.[0]?.documentName || "Originalkarte"} {current.variant?.transformType ? `· Variation: ${current.variant.transformType}` : ""}</p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
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
            {ratingButtons.map((rating) => (
              <button key={rating.key} type="button" onClick={() => grade(rating.key)} disabled={!current} className={`min-h-20 rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
                <span className="block text-2xl font-semibold">{rating.number}</span>
                <span className="mt-1 block text-sm font-semibold">{rating.label}</span>
                <span className="mt-1 block text-xs font-semibold opacity-80">{current?.ratingButtonOptions?.[rating.key]?.intervalLabel ?? ""}</span>
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
