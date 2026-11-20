import React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { notePromptLabel } from "../coreModel.ts";
import type { Card, Note } from "../coreTypes.ts";
import { IconButton } from "./actionUi.tsx";
import { CoreSegmentedControl } from "./coreUi.tsx";
import { StatusMessage } from "./feedbackUi.tsx";
import { NoteCardContent } from "./NoteCardContent.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";
import { useModalDialog } from "./useModalDialog.ts";

type PreviewSide = "question" | "answer";

const PREVIEW_SIDE_OPTIONS = [
  { value: "question", label: "Vorderseite" },
  { value: "answer", label: "Rückseite" },
] as const;
const NAVIGATION_END = "disabled:bg-transparent disabled:opacity-40";

export interface CardPreviewDialogProps {
  open: boolean;
  note: Note | null;
  /** Empty while required input is missing. */
  cards: readonly Card[];
  mediaUrls?: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function CardPreviewDialog({
  open,
  note,
  cards,
  mediaUrls = {},
  onOpenChange,
  returnFocusRef,
}: CardPreviewDialogProps) {
  const [side, setSide] = React.useState<PreviewSide>("question");
  const [cardIndex, setCardIndex] = React.useState(0);
  // A new round resets answer input when the front is shown again; revealing keeps the selection for evaluation.
  const [round, setRound] = React.useState(0);
  const shownIndex = Math.min(cardIndex, cards.length - 1);
  const card = cards[shownIndex] ?? null;
  const stageRef = React.useRef<HTMLDivElement>(null);
  const previousButtonRef = React.useRef<HTMLButtonElement>(null);
  const nextButtonRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const closeDialog = React.useCallback(() => {
    setSide("question");
    onOpenChange(false);
  }, [onOpenChange]);
  const { dialogRef } = useModalDialog({
    open,
    onClose: closeDialog,
    returnFocusRef,
    stopEscapePropagation: true,
  });

  React.useEffect(() => {
    if (!open) return;
    setSide("question");
    setCardIndex(0);
  }, [open]);

  function showCard(step: -1 | 1) {
    const next = shownIndex + step;
    if (next < 0 || next >= cards.length) return;
    // The button that reaches an end turns disabled, so its focus moves to the other direction.
    const [pressed, other] = step < 0 ? [previousButtonRef, nextButtonRef] : [nextButtonRef, previousButtonRef];
    if ((next === 0 || next === cards.length - 1) && document.activeElement === pressed.current) other.current?.focus();
    setCardIndex(next);
    setSide("question");
    setRound((current) => current + 1);
  }

  React.useEffect(() => {
    if (open && side === "answer") stageRef.current?.focus();
  }, [open, side]);

  if (!open) return null;

  const dialog = (
    <div
      className="core-card-preview-backdrop fixed inset-0 z-[90] flex items-stretch justify-center bg-[var(--core-backdrop)] sm:items-center sm:p-4"
      data-card-preview-overlay="true"
      data-testid="card-preview-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="card-preview-dialog"
        onKeyDown={(event) => {
          if (cards.length < 2 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
          event.preventDefault();
          showCard(event.key === "ArrowLeft" ? -1 : 1);
        }}
        className="core-card-preview-dialog core-overlay flex h-[100dvh] w-full flex-col overflow-hidden border-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-overlay sm:border"
      >
        <header className="flex min-h-16 items-center gap-4 border-b border-core-border px-4 sm:px-6">
          <h2 id={titleId} className="min-w-0 flex-1 core-heading-2 text-core-text">Kartenvorschau</h2>
          <IconButton label="Kartenvorschau schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain bg-core-surface">
          <div ref={stageRef} tabIndex={-1} className="core-study-card flex min-h-[min(36vh,16rem)] w-full min-w-0 flex-col justify-center py-6 outline-none sm:py-10" data-testid="card-preview-stage">
            {note && card ? (
              <NoteCardContent key={round} note={note} card={card} surface="preview" mediaUrls={mediaUrls} revealed={side === "answer"} onReveal={() => setSide("answer")} />
            ) : (
              <StatusMessage tone="info" className="mx-4 sm:mx-6">Für die Vorschau fehlen noch Pflichtangaben.</StatusMessage>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col items-stretch gap-3 border-t border-core-border bg-core-surface px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-center sm:gap-8 sm:px-6 sm:py-4">
          {note && card && cards.length > 1 ? (
            <div role="group" aria-label="Karte in der Vorschau" className="flex min-w-0 items-center gap-2" data-testid="card-preview-navigation">
              <CoreTooltip label="Vorige Karte · ←">
                <IconButton ref={previousButtonRef} icon={ChevronLeft} label="Vorige Karte" className={NAVIGATION_END} disabled={shownIndex === 0} onClick={() => showCard(-1)} />
              </CoreTooltip>
              <p className="grid min-w-0 flex-1 text-center sm:w-44 sm:flex-none" aria-live="polite" data-testid="card-preview-position">
                <span className="core-body font-semibold tabular-nums text-core-text">Karte {shownIndex + 1} von {cards.length}</span>
                <span className="truncate core-caption text-core-muted">{notePromptLabel(note.content, card.promptKey)}</span>
              </p>
              <CoreTooltip label="Nächste Karte · →">
                <IconButton ref={nextButtonRef} icon={ChevronRight} label="Nächste Karte" className={NAVIGATION_END} disabled={shownIndex === cards.length - 1} onClick={() => showCard(1)} />
              </CoreTooltip>
            </div>
          ) : null}
          <CoreSegmentedControl
            ariaLabel="Kartenseite anzeigen"
            options={PREVIEW_SIDE_OPTIONS}
            value={side}
            onValueChange={(next) => {
              if (next === "question") setRound((current) => current + 1);
              setSide(next);
            }}
            className="w-full sm:w-80"
          />
        </footer>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
