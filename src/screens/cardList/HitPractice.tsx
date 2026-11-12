import React from "react";
import { CheckCircle2, RotateCcw, X } from "lucide-react";
import type { Card, Note, ReviewRating } from "../../coreTypes.ts";
import { answerPractice, createPractice } from "../../hitStudySession.ts";
import type { AccountMediaStore } from "../../mediaStore.ts";
import { resolveReviewShortcut } from "../../reviewShortcuts.ts";
import { IconButton } from "../../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../../ui/cardMedia.tsx";
import { NoteCardContent } from "../../ui/NoteCardContent.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import { ratingButtons } from "../screenConstants.ts";
import { cardCount } from "./cardListModel.ts";

export interface HitPracticeProps {
  /** The cards to practise, in order, with their contents. */
  bodies: ReadonlyArray<{ card: Card; note: Note }>;
  mediaStore: AccountMediaStore | null;
  onClose: () => void;
}

/**
 * `Nur üben` (KV5): question, reveal and rating like a session, but study state, due dates and FSRS values stay as they
 * are and no review is written. Ends when every card was known once, with `Nochmal üben` for the difficult ones.
 */
export function HitPractice({ bodies, mediaStore, onClose }: HitPracticeProps) {
  const byId = React.useMemo(() => new Map(bodies.map((body) => [body.card.id, body])), [bodies]);
  const [practice, setPractice] = React.useState(() => createPractice(bodies.map((body) => body.card.id)));
  const [revealed, setRevealed] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const current = byId.get(practice.queue[0] ?? "") ?? null;
  const { urls } = useNoteMediaUrls(current?.note.media, mediaStore);
  const total = practice.known.length + new Set(practice.queue).size;
  const againTotal = Object.values(practice.againCounts).reduce((sum, count) => sum + count, 0);

  function rate(rating: ReviewRating) {
    setPractice((state) => answerPractice(state, rating));
    setRevealed(false);
  }

  function restart(cardIds: readonly string[]) {
    setPractice(createPractice(cardIds));
    setRevealed(false);
  }

  // The start dialog that opened the practice is gone, so the practice takes the focus.
  React.useEffect(() => rootRef.current?.focus(), []);
  React.useEffect(() => {
    if (!current) headingRef.current?.focus();
  }, [current]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      const action = resolveReviewShortcut(event, { hasCurrent: Boolean(current), showAnswer: revealed });
      if (!action) return;
      event.preventDefault();
      if (action.type === "reveal") setRevealed(true);
      else if (action.type === "rate" && action.rating) rate(action.rating as ReviewRating);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, onClose, revealed]);

  return (
    <div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Nur üben" className="fixed inset-0 z-50 overflow-y-auto bg-core-canvas p-4 text-core-text outline-none sm:p-8" data-testid="hit-practice">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6">
        <header className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <IconButton label="Übung beenden" icon={X} variant="secondary" onClick={onClose} />
            <h2 className="core-heading-3 text-core-text">Nur üben</h2>
          </div>
          <div className="flex items-center justify-between gap-3 core-caption font-medium text-core-muted">
            <span>Gewusst</span>
            <span className="tabular-nums">{practice.known.length} / {total} Karten</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-round bg-core-subtle" aria-hidden="true">
            <div className="h-full rounded-round bg-core-action transition-[width] motion-reduce:transition-none" style={{ width: `${total ? (practice.known.length / total) * 100 : 0}%` }} />
          </div>
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="core-study-card flex w-full flex-col justify-center py-6 sm:py-10">
            {current ? (
              <div className="w-full">
                <div role="group" aria-label={revealed ? "Antwort" : "Frage"} className="min-w-0" data-testid="hit-practice-card">
                  <NoteCardContent note={current.note} card={current.card} mediaUrls={urls} revealed={revealed} onReveal={() => setRevealed(true)} />
                </div>
                {revealed ? null : (
                  <button type="button" onClick={() => setRevealed(true)} className="mx-auto mt-12 core-action-primary">
                    <RotateCcw size={16} aria-hidden="true" />
                    Antwort anzeigen
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <CheckCircle2 size={28} className="mx-auto text-core-success" aria-hidden="true" />
                <h1 ref={headingRef} tabIndex={-1} className="mt-3 core-heading-2 text-core-text outline-none">Übung abgeschlossen</h1>
                <p className="mt-2 core-body text-core-secondary">{cardCount(practice.known.length)} geübt · {againTotal}× Nochmal</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {practice.difficult.length ? (
                    <button type="button" onClick={() => restart(practice.difficult)} className="core-action-secondary">
                      Nochmal üben ({practice.difficult.length})
                    </button>
                  ) : null}
                  <button type="button" onClick={onClose} className="core-action-primary">Fertig</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {current && revealed ? (
          <footer className="grid gap-2 sm:grid-cols-4 sm:gap-3">
            {ratingButtons.map((rating) => (
              <CoreTooltip key={rating.key} label={`Taste ${rating.shortcutKey}`}>
                <button type="button" onClick={() => rate(rating.key as ReviewRating)} aria-label={`Bewertung ${rating.label}`} className={`core-rating-button ${rating.className}`}>
                  <span className="core-rating-dot" aria-hidden="true" />
                  <span className="core-control-label">{rating.label}</span>
                </button>
              </CoreTooltip>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
