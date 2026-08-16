import React from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ListOrdered,
  Pencil,
  Settings,
  X,
} from "lucide-react";
import type { NewReviewOrder } from "../coreTypes.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import { IconButton } from "./actionUi.tsx";
import { CardStudyStateControls } from "./CardStudyStateControls.tsx";
import { PomodoroTimerControl } from "./pomodoroTimerUi.tsx";
import { CoreSelect } from "./selectUi.tsx";
import { useModalDialog } from "./useModalDialog.ts";

const REVIEW_ORDER_OPTIONS = [
  { value: "reviews-first", label: "Fällige Karten zuerst" },
  { value: "mixed", label: "Neue und fällige mischen" },
  { value: "new-first", label: "Neue Karten zuerst" },
] as const;

export interface StudySettingsOverlayProps {
  open: boolean;
  canEditCard: boolean;
  marked: boolean;
  suspended: boolean;
  reviewOrder: NewReviewOrder;
  pomodoroTimer: PomodoroTimer | null;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onEditCard: () => void;
  onEditDeck: () => void;
  onMarkedChange: (marked: boolean) => void;
  onSuspendedChange: (suspended: boolean) => void;
  onReviewOrderChange: (order: NewReviewOrder) => void;
  onStartPomodoro: (minutes: number) => void;
}

function EditMenuRow({ icon: Icon, label, disabled = false, onClick }: {
  icon: typeof Pencil;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left core-body font-semibold text-[var(--core-text-secondary)] transition hover:text-[var(--core-text)] disabled:cursor-not-allowed disabled:text-[var(--core-text-muted)]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="shrink-0 text-[var(--core-text)]" size={18} aria-hidden="true" />
        {label}
      </span>
      <ChevronRight className="text-[var(--core-text)]" size={17} aria-hidden="true" />
    </button>
  );
}

export function StudySettingsOverlay({
  open,
  canEditCard,
  marked,
  suspended,
  reviewOrder,
  pomodoroTimer,
  returnFocusRef,
  onOpenChange,
  onEditCard,
  onEditDeck,
  onMarkedChange,
  onSuspendedChange,
  onReviewOrderChange,
  onStartPomodoro,
}: StudySettingsOverlayProps) {
  const titleId = React.useId();
  const closeDialog = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const { dialogRef, initialFocusRef: closeButtonRef } = useModalDialog({ open, onClose: closeDialog, returnFocusRef });

  if (!open) return null;

  const overlay = (
    <div
      className="core-study-settings-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[var(--core-backdrop)] md:items-center md:p-4"
      data-testid="study-settings-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        id="study-settings-overlay"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="study-settings-overlay"
        className="core-study-settings-overlay core-overlay flex max-h-[min(88dvh,42rem)] w-full flex-col overflow-hidden rounded-t-[28px] border-b-0 md:max-w-xl md:rounded-[24px] md:border-b"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--core-border)] md:hidden" aria-hidden="true" />
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[var(--core-border)] px-4 sm:px-5">
          <span className="size-11" aria-hidden="true" />
          <h2 id={titleId} className="core-body-large text-center font-semibold text-[var(--core-text)]">Lerneinstellungen</h2>
          <IconButton ref={closeButtonRef} label="Lerneinstellungen schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <section className="py-3" aria-labelledby={`${titleId}-card`}>
            <h3 id={`${titleId}-card`} className="core-status-label uppercase tracking-wide text-[var(--core-action-secondary)]">Karte</h3>
            <div className="mt-1">
              <EditMenuRow
                icon={Pencil}
                label="Karte bearbeiten"
                disabled={!canEditCard}
                onClick={() => {
                  closeDialog();
                  onEditCard();
                }}
              />
              <EditMenuRow
                icon={Settings}
                label="Stapel bearbeiten"
                onClick={() => {
                  closeDialog();
                  onEditDeck();
                }}
              />
              <CardStudyStateControls
                marked={marked}
                suspended={suspended}
                disabled={!canEditCard}
                onMarkedChange={onMarkedChange}
                onSuspendedChange={onSuspendedChange}
              />
            </div>
          </section>

          <section className="py-3" aria-labelledby={`${titleId}-session`}>
            <h3 id={`${titleId}-session`} className="core-status-label uppercase tracking-wide text-[var(--core-action-secondary)]">Sitzung</h3>
            <div className="mt-1">
              <PomodoroTimerControl
                timer={pomodoroTimer}
                variant="study"
                onStart={(minutes) => {
                  onStartPomodoro(minutes);
                  closeDialog();
                }}
              />
              <div className="grid min-h-11 gap-2 py-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:items-center">
                <span className="flex min-w-0 items-center gap-3 core-body font-semibold text-[var(--core-text-secondary)]">
                  <ListOrdered className="shrink-0 text-[var(--core-text)]" size={18} aria-hidden="true" />
                  <span>Kartenreihenfolge</span>
                </span>
                <CoreSelect
                  value={reviewOrder}
                  options={REVIEW_ORDER_OPTIONS}
                  ariaLabel="Kartenreihenfolge"
                  className="w-full"
                  onValueChange={(value) => onReviewOrderChange(value as NewReviewOrder)}
                />
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
