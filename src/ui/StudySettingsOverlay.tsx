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
import { FlagPicker } from "./flagUi.tsx";
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
  flag: number;
  flagNames: readonly string[];
  reviewOrder: NewReviewOrder;
  pomodoroTimer: PomodoroTimer | null;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onEditCard: () => void;
  onEditDeck: () => void;
  onMarkedChange: (marked: boolean) => void;
  onSuspendedChange: (suspended: boolean) => void;
  onFlagChange: (flag: number) => void;
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
      className="group -mx-2 flex min-h-control w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-inset px-2 py-1 text-left transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:bg-transparent"
    >
      <span className="core-field-label flex min-w-0 items-center gap-2 group-disabled:text-core-muted">
        <Icon className="shrink-0 text-core-muted" size={16} aria-hidden="true" />
        {label}
      </span>
      <ChevronRight className="text-core-muted" size={16} aria-hidden="true" />
    </button>
  );
}

export function StudySettingsOverlay({
  open,
  canEditCard,
  marked,
  suspended,
  flag,
  flagNames,
  reviewOrder,
  pomodoroTimer,
  returnFocusRef,
  onOpenChange,
  onEditCard,
  onEditDeck,
  onMarkedChange,
  onSuspendedChange,
  onFlagChange,
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
        className="core-study-settings-overlay core-overlay flex max-h-[min(88dvh,42rem)] w-full flex-col overflow-hidden rounded-t-overlay border-b-0 md:max-w-xl md:rounded-overlay md:border-b"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-round bg-core-border md:hidden" aria-hidden="true" />
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-core-border px-4 sm:px-6">
          <span className="size-control" aria-hidden="true" />
          <h2 id={titleId} className="core-heading-2 text-center text-core-text">Lerneinstellungen</h2>
          <IconButton ref={closeButtonRef} label="Lerneinstellungen schließen" icon={X} variant="ghost" onClick={closeDialog} />
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <section className="py-4" aria-labelledby={`${titleId}-card`}>
            <h3 id={`${titleId}-card`} className="core-caption font-medium text-core-muted">Karte</h3>
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
              <FlagPicker value={flag} names={flagNames} disabled={!canEditCard} onValueChange={onFlagChange} />
            </div>
          </section>

          <section className="py-4" aria-labelledby={`${titleId}-session`}>
            <h3 id={`${titleId}-session`} className="core-caption font-medium text-core-muted">Sitzung</h3>
            <div className="mt-1">
              <PomodoroTimerControl
                timer={pomodoroTimer}
                variant="study"
                onStart={(minutes) => {
                  onStartPomodoro(minutes);
                  closeDialog();
                }}
              />
              <div className="grid min-h-control gap-2 py-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:items-center">
                <span className="core-field-label flex min-w-0 items-center gap-2">
                  <ListOrdered className="shrink-0 text-core-muted" size={16} aria-hidden="true" />
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
