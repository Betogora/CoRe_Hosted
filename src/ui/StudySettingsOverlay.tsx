import React from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  ChevronRight,
  ListOrdered,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Timer,
  X,
} from "lucide-react";
import { IconButton } from "./actionUi.tsx";
import { CardMarkButton, CoreSwitch } from "./coreUi.tsx";

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export interface StudySettingsOverlayProps {
  open: boolean;
  canEditCard: boolean;
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  marked: boolean;
  suspended: boolean;
  onOpenChange: (open: boolean) => void;
  onEditCard: () => void;
  onMarkedChange: (marked: boolean) => void;
  onSuspendedChange: (suspended: boolean) => void;
  onNewCardsPerDayChange: (value: number) => void;
  onMaximumReviewsPerDayChange: (value: number) => void;
}

function NumberStepper({ label, value, min, max, step, onChange }: NumberStepperProps) {
  const decrease = Math.max(min, value - step);
  const increase = Math.min(max, value + step);
  const Icon = label === "Neue Karten pro Tag" ? ListOrdered : RefreshCw;

  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--core-border)] py-2 last:border-b-0">
      <span className="flex min-w-0 items-center gap-3 core-body font-semibold text-[var(--core-text-secondary)]">
        <Icon className="shrink-0 text-[var(--core-action-secondary)]" size={18} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-xl border border-[var(--core-border)] bg-core-surface p-0.5">
        <IconButton
          label={`${label} verringern`}
          icon={Minus}
          variant="ghost"
          disabled={value <= min}
          onClick={() => onChange(decrease)}
        />
        <output className="min-w-10 text-center core-body font-semibold text-[var(--core-text)]" aria-label={label}>
          {value}
        </output>
        <IconButton
          label={`${label} erhöhen`}
          icon={Plus}
          variant="ghost"
          disabled={value >= max}
          onClick={() => onChange(increase)}
        />
      </span>
    </div>
  );
}

function StudyStateRow({ icon: Icon, label, children, disabled = false }: {
  icon: typeof Star;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--core-border)] py-2 last:border-b-0" aria-disabled={disabled || undefined}>
      <span className={`flex min-w-0 items-center gap-3 core-body font-semibold ${disabled ? "text-[var(--core-text-muted)]" : "text-[var(--core-text-secondary)]"}`}>
        <Icon className="shrink-0" size={18} aria-hidden="true" />
        <span>{label}</span>
      </span>
      {children}
    </div>
  );
}

function DisabledMenuRow({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={
        value === "Noch nicht verfügbar"
          ? `${label} – noch nicht verfügbar`
          : `${label}: ${value} – noch nicht verfügbar`
      }
      className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--core-border)] py-2 text-left last:border-b-0 disabled:cursor-not-allowed"
    >
      <span className="flex min-w-0 items-center gap-3 core-body font-semibold text-[var(--core-text-muted)]">
        <Icon className="shrink-0" size={18} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 core-body text-[var(--core-text-muted)]">
        {value}
        <ChevronRight size={17} aria-hidden="true" />
      </span>
    </button>
  );
}

export function StudySettingsOverlay({
  open,
  canEditCard,
  newCardsPerDay,
  maximumReviewsPerDay,
  marked,
  suspended,
  onOpenChange,
  onEditCard,
  onMarkedChange,
  onSuspendedChange,
  onNewCardsPerDayChange,
  onMaximumReviewsPerDayChange,
}: StudySettingsOverlayProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  const overlay = (
    <div
      className="core-study-settings-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[var(--core-backdrop)] md:items-center md:p-4"
      data-testid="study-settings-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        id="study-settings-overlay"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="study-settings-overlay"
        className="core-study-settings-overlay core-overlay flex max-h-[min(88dvh,48rem)] w-full flex-col overflow-hidden rounded-t-[28px] border-b-0 md:max-w-2xl md:rounded-[24px] md:border-b"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--core-border)] md:hidden" aria-hidden="true" />
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--core-border)] px-4 sm:px-5">
          <span className="size-11" aria-hidden="true" />
          <h2 id={titleId} className="core-heading-3 text-center text-[var(--core-text)]">Lerneinstellungen</h2>
          <IconButton ref={closeButtonRef} label="Lerneinstellungen schließen" icon={X} variant="ghost" onClick={() => onOpenChange(false)} />
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <section className="py-4" aria-labelledby={`${titleId}-card`}>
            <h3 id={`${titleId}-card`} className="core-status-label uppercase tracking-wide text-[var(--core-action-secondary)]">Karte</h3>
            <div className="mt-2">
              <button
                type="button"
                disabled={!canEditCard}
                onClick={() => {
                  onOpenChange(false);
                  onEditCard();
                }}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--core-border)] py-2 text-left core-body font-semibold text-[var(--core-text-secondary)] transition hover:text-[var(--core-text)] disabled:cursor-not-allowed disabled:text-[var(--core-text-muted)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Pencil className="shrink-0 text-[var(--core-action-secondary)]" size={18} aria-hidden="true" />
                  Karte bearbeiten
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              <StudyStateRow icon={Star} label="Markieren" disabled={!canEditCard}>
                <CardMarkButton marked={marked} disabled={!canEditCard} onMarkedChange={onMarkedChange} />
              </StudyStateRow>
              <StudyStateRow icon={Ban} label="Aussetzen" disabled={!canEditCard}>
                <CoreSwitch
                  checked={suspended}
                  ariaLabel={suspended ? "Karte reaktivieren" : "Karte aussetzen"}
                  disabled={!canEditCard}
                  onCheckedChange={onSuspendedChange}
                />
              </StudyStateRow>
            </div>
          </section>

          <section className="border-t border-[var(--core-border)] py-4" aria-labelledby={`${titleId}-session`}>
            <h3 id={`${titleId}-session`} className="core-status-label uppercase tracking-wide text-[var(--core-action-secondary)]">Sitzung</h3>
            <div className="mt-2">
              <DisabledMenuRow icon={Timer} label="Pomodoro" value="25 Min." />
              <DisabledMenuRow icon={ListOrdered} label="Kartenreihenfolge" value="Noch nicht verfügbar" />
            </div>
          </section>

          <section className="border-t border-[var(--core-border)] py-4" aria-labelledby={`${titleId}-deck`}>
            <h3 id={`${titleId}-deck`} className="core-status-label uppercase tracking-wide text-[var(--core-action-secondary)]">Stapel</h3>
            <div className="mt-2">
              <NumberStepper label="Neue Karten pro Tag" value={newCardsPerDay} min={0} max={100} step={1} onChange={onNewCardsPerDayChange} />
              <NumberStepper label="Max. Wiederholungen" value={maximumReviewsPerDay} min={0} max={500} step={10} onChange={onMaximumReviewsPerDayChange} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
