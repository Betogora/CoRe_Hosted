import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { CardVariant, LearningItem, NoteTypeDefinitionV1 } from "../coreTypes.ts";
import { IconButton } from "./actionUi.tsx";
import { CoreSegmentedControl } from "./coreUi.tsx";
import { StudyCardContent } from "./StudyCardContent.tsx";
import { useModalDialog } from "./useModalDialog.ts";

type PreviewSide = "question" | "answer";

const PREVIEW_SIDE_OPTIONS = [
  { value: "question", label: "Vorderseite" },
  { value: "answer", label: "Rückseite" },
] as const;

export interface CardPreviewDialogProps {
  open: boolean;
  item?: LearningItem | null;
  variant?: CardVariant | null;
  definition?: NoteTypeDefinitionV1 | null;
  mediaUrls?: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function CardPreviewDialog({
  open,
  item,
  variant,
  definition,
  mediaUrls = {},
  onOpenChange,
  returnFocusRef,
}: CardPreviewDialogProps) {
  const [side, setSide] = React.useState<PreviewSide>("question");
  const [selectedChoice, setSelectedChoice] = React.useState("");
  const answerRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const closeDialog = React.useCallback(() => {
    setSide("question");
    setSelectedChoice("");
    onOpenChange(false);
  }, [onOpenChange]);
  const { dialogRef, initialFocusRef: closeButtonRef } = useModalDialog({
    open,
    onClose: closeDialog,
    returnFocusRef,
    stopEscapePropagation: true,
  });

  React.useEffect(() => {
    if (open) {
      setSide("question");
      setSelectedChoice("");
    }
  }, [open]);

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
        className="core-card-preview-dialog core-overlay flex h-[100dvh] w-full flex-col overflow-hidden border-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-[24px] sm:border"
      >
        <header className="flex min-h-16 items-center gap-4 border-b border-[var(--core-border)] px-4 sm:px-6">
          <h2 id={titleId} className="min-w-0 flex-1 core-heading-3 text-[var(--core-text)]">Kartenvorschau</h2>
          <IconButton ref={closeButtonRef} label="Kartenvorschau schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--core-surface-muted)] p-3 sm:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-center">
            <StudyCardContent
              item={item}
              variant={variant}
              definition={definition}
              mediaUrls={mediaUrls}
              revealed={side === "answer"}
              selectedChoice={selectedChoice}
              onSelectChoice={(option) => {
                setSelectedChoice(option);
                setSide("answer");
              }}
              answerRef={answerRef}
            />
          </div>
        </div>

        <footer className="flex shrink-0 justify-center border-t border-[var(--core-border)] bg-[var(--core-surface-raised)] px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <CoreSegmentedControl
            ariaLabel="Kartenseite anzeigen"
            options={PREVIEW_SIDE_OPTIONS}
            value={side}
            onValueChange={(nextSide) => {
              setSide(nextSide);
              if (nextSide === "question") setSelectedChoice("");
              else window.requestAnimationFrame(() => answerRef.current?.focus());
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
