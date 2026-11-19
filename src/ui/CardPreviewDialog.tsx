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

export interface CardPreviewDialogProps {
  open: boolean;
  note: Note | null;
  /** Every card the draft would create, in order; empty while required input is missing. */
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
  const answerContentRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const closeDialog = React.useCallback(() => {
    setSide("question");
    onOpenChange(false);
  }, [onOpenChange]);
  const { dialogRef, initialFocusRef: closeButtonRef } = useModalDialog({
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

  /** Steps through the cards in a circle; every card starts on its front. */
  function showCard(step: number) {
    setCardIndex((shownIndex + step + cards.length) % cards.length);
    setSide("question");
    setRound((current) => current + 1);
  }

  React.useEffect(() => {
    if (open && side === "answer") answerContentRef.current?.focus();
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
        className="core-card-preview-dialog core-overlay flex h-[100dvh] w-full flex-col overflow-hidden border-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-overlay sm:border"
      >
        <header className="flex min-h-16 items-center gap-4 border-b border-core-border px-4 sm:px-6">
          <h2 id={titleId} className="min-w-0 flex-1 core-heading-2 text-core-text">Kartenvorschau</h2>
          <IconButton ref={closeButtonRef} label="Kartenvorschau schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-core-canvas p-3 sm:p-6">
          <div className="mx-auto grid min-h-full w-full max-w-5xl place-items-center">
            <div className="core-card-preview-stage core-study-card flex min-h-[56vh] w-full flex-col justify-center rounded-panel border border-core-border bg-core-surface px-4 py-6 sm:px-8 sm:py-10">
              {note && card ? (
                <div ref={answerContentRef} tabIndex={-1} className="min-w-0 outline-none">
                  <NoteCardContent key={round} note={note} card={card} surface="preview" mediaUrls={mediaUrls} revealed={side === "answer"} onReveal={() => setSide("answer")} />
                </div>
              ) : (
                <StatusMessage tone="info">Für die Vorschau fehlen noch Pflichtangaben.</StatusMessage>
              )}
            </div>
          </div>
        </div>

        <footer className={`flex shrink-0 flex-col items-stretch gap-3 border-t border-core-border bg-core-surface px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:px-6 sm:py-4 ${cards.length > 1 ? "sm:justify-between" : "sm:justify-center"}`}>
          {note && card && cards.length > 1 ? (
            <div role="group" aria-label="Karte in der Vorschau" className="flex min-w-0 items-center gap-2" data-testid="card-preview-navigation">
              <CoreTooltip label="Vorige Karte · ←">
                <IconButton icon={ChevronLeft} label="Vorige Karte" onClick={() => showCard(-1)} />
              </CoreTooltip>
              <p className="grid min-w-0 flex-1 text-center sm:w-44 sm:flex-none" aria-live="polite" data-testid="card-preview-position">
                <span className="core-body font-semibold tabular-nums text-core-text">Karte {shownIndex + 1} von {cards.length}</span>
                <span className="truncate core-caption text-core-muted">{notePromptLabel(note.content, card.promptKey)}</span>
              </p>
              <CoreTooltip label="Nächste Karte · →">
                <IconButton icon={ChevronRight} label="Nächste Karte" onClick={() => showCard(1)} />
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
            className="w-full sm:max-w-sm"
          />
        </footer>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
