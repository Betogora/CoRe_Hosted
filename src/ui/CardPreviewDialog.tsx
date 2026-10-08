import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Card, Note } from "../coreTypes.ts";
import { IconButton } from "./actionUi.tsx";
import { CoreSegmentedControl } from "./coreUi.tsx";
import { StatusMessage } from "./feedbackUi.tsx";
import { NoteCardContent } from "./NoteCardContent.tsx";
import { useModalDialog } from "./useModalDialog.ts";

type PreviewSide = "question" | "answer";

const PREVIEW_SIDE_OPTIONS = [
  { value: "question", label: "Vorderseite" },
  { value: "answer", label: "Rückseite" },
] as const;

export interface CardPreviewDialogProps {
  open: boolean;
  note: Note | null;
  card: Card | null;
  mediaUrls?: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function CardPreviewDialog({
  open,
  note,
  card,
  mediaUrls = {},
  onOpenChange,
  returnFocusRef,
}: CardPreviewDialogProps) {
  const [side, setSide] = React.useState<PreviewSide>("question");
  // A new round resets answer input when the front is shown again; revealing keeps the selection for evaluation.
  const [round, setRound] = React.useState(0);
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
    if (open) setSide("question");
  }, [open]);

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
        className="core-card-preview-dialog core-overlay flex h-[100dvh] w-full flex-col overflow-hidden border-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-overlay sm:border"
      >
        <header className="flex min-h-16 items-center gap-4 border-b border-core-border px-4 sm:px-6">
          <h2 id={titleId} className="min-w-0 flex-1 core-heading-3 text-core-text">Kartenvorschau</h2>
          <IconButton ref={closeButtonRef} label="Kartenvorschau schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-core-subtle p-3 sm:p-6">
          <div className="mx-auto grid min-h-full w-full max-w-5xl place-items-center">
            <div className="core-card-preview-stage core-study-card flex min-h-[56vh] w-full flex-col justify-center rounded-panel border border-core-border bg-core-surface px-4 py-6 shadow-raised sm:px-8 sm:py-10">
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

        <footer className="flex shrink-0 justify-center border-t border-core-border bg-core-raised px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <CoreSegmentedControl
            ariaLabel="Kartenseite anzeigen"
            options={PREVIEW_SIDE_OPTIONS}
            value={side}
            onValueChange={(next) => {
              if (next === "question") setRound((current) => current + 1);
              setSide(next);
            }}
            size="regular"
            className="w-full max-w-sm"
          />
        </footer>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
