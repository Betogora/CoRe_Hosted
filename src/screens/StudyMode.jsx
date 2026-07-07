import React from "react";
import { Ban, Eye, Flag, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { getLearningItemAnswer, getLearningItemQuestion } from "../coreModel.js";
import { resolveReviewShortcut } from "../reviewShortcuts.js";
import { answerVariant, getNextReviewItem, recordVariantFeedback } from "../reviewService.js";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.jsx";
import { MiniProgress } from "../ui/coreUi.jsx";
import { maturityStageLabels, ratingButtons } from "./screenConstants.js";

export function StudyMode({ deck, variantSession, onExit, onDeckUpdated }) {
  const [sessionDeck, setSessionDeck] = React.useState(deck);
  const [reviewedCount, setReviewedCount] = React.useState(0);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const maxReviews = React.useMemo(() => {
    const activeCards = (deck.cards ?? []).filter((card) => card.status !== "deleted" && card.draftStatus !== "draft");
    return Math.max(1, Math.min(12, activeCards.length));
  }, [deck.id, deck.cards?.length]);
  const current = React.useMemo(() => getNextReviewItem(sessionDeck, { language: "de" }), [sessionDeck, reviewedCount, variantSession]);
  const progress = maxReviews ? (Math.min(reviewedCount + (current ? 1 : 0), maxReviews) / maxReviews) * 100 : 0;
  const sourceCard = current?.learningItem ?? null;
  const isCurrentVariant = Boolean(current?.variant && !current.variant.isOriginal);
  const anchorMiniCard = current?.answerSideAnchorMiniCard;
  const { urls: studyMediaUrls } = useDeckMediaUrls(sessionDeck);

  React.useEffect(() => {
    setSessionDeck(deck);
    setReviewedCount(0);
    setShowAnswer(false);
    setShowAnchor(false);
  }, [deck.id, variantSession]);

  function finishOrNext(nextDeck, nextCount) {
    onDeckUpdated(nextDeck);
    setSessionDeck(nextDeck);
    const nextItem = getNextReviewItem(nextDeck, { language: "de" });
    if (nextItem && nextCount < maxReviews) {
      setReviewedCount(nextCount);
      setShowAnswer(false);
      setShowAnchor(false);
    } else {
      onExit();
    }
  }

  function grade(rating) {
    if (!current) return;
    const result = answerVariant(sessionDeck, current.learningItemId, current.cardVariantId, rating, {
      now: new Date().toISOString(),
    });
    finishOrNext(result.deck, reviewedCount + 1);
  }

  function updateVariant(action) {
    if (!isCurrentVariant) return;
    const result = recordVariantFeedback(sessionDeck, {
      id: current.variantId,
      sourceCardId: current.learningItemId,
      isVariant: true,
    }, { action });
    onDeckUpdated(result.deck);
    setSessionDeck(result.deck);
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
  }, [current, showAnswer, sessionDeck, reviewedCount]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#eef2fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={onExit} className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]" aria-label="Lernmodus verlassen">
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#66709a]">{deck.name}</p>
              <p className="mt-1 text-sm text-[#66709a]">{current ? `${Math.min(reviewedCount + 1, maxReviews)} / ${maxReviews}` : "0 / 0"}</p>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]" aria-label="Lerneinstellungen">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <MiniProgress value={progress} />
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="flex min-h-[56vh] w-full max-w-3xl flex-col justify-center rounded-[28px] border border-[#dfe4f5] bg-white/86 p-8 shadow-[0_30px_90px_rgba(91,105,154,0.18)] sm:p-14">
            {current ? (
              <>
                <div className="mx-auto w-full max-w-2xl">
                  <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">Frage</p>
                  {current.fallbackInfo?.active ? (
                    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                      {current.fallbackInfo.fallbackReason || "CoRe zeigt jetzt wieder eine einfachere Variante, bis diese sitzt."}
                    </div>
                  ) : null}
                  <div className="text-2xl font-semibold leading-relaxed text-[#17214f] sm:text-4xl">
                    <CardHtml html={current.front} mediaUrls={studyMediaUrls} />
                  </div>
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
                <p className="mt-3 text-[#66709a]">Dieser Stapel hat aktuell keine reviewbaren Karten.</p>
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
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
