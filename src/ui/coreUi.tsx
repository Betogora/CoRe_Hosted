import React, { type HTMLAttributes, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { readCoreTheme, toggleCoreTheme } from "../coreTheme.ts";
import type { CoreMode } from "../coreTypes.ts";
import { ActionButton } from "./actionUi.tsx";

interface SoftPanelProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

interface ActionDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  restoreFocus?: (reason: "cancel" | "confirm") => void;
  destructive?: boolean;
}

export function SoftPanel({ children, className = "", ...props }: SoftPanelProps) {
  return (
    <section {...props} className={`core-surface-raised min-w-0 rounded-[18px] ${className}`}>
      {children}
    </section>
  );
}

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  restoreFocus,
  destructive = false,
}: ActionDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const closeReasonRef = React.useRef<"cancel" | "confirm" | null>(null);
  const onCancelRef = React.useRef(onCancel);
  const onConfirmRef = React.useRef(onConfirm);
  const restoreFocusRef = React.useRef(restoreFocus);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onCancelRef.current = onCancel;
    onConfirmRef.current = onConfirm;
    restoreFocusRef.current = restoreFocus;
  }, [onCancel, onConfirm, restoreFocus]);

  function cancelDialog() {
    closeReasonRef.current = "cancel";
    onCancelRef.current();
  }

  function confirmDialog() {
    closeReasonRef.current = "confirm";
    onConfirmRef.current();
  }

  React.useEffect(() => {
    if (!open) return undefined;
    closeReasonRef.current = null;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDialog();
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
      document.removeEventListener("keydown", handleKeyDown);
      const closeReason = closeReasonRef.current;
      const restoreFocus = restoreFocusRef.current;
      window.requestAnimationFrame(() => {
        if (closeReason && restoreFocus) {
          restoreFocus(closeReason);
          return;
        }
        returnFocusRef.current?.focus();
      });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--core-backdrop)] p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="core-surface-raised w-full max-w-lg rounded-[18px] p-6 shadow-2xl"
      >
        <h2 id={titleId} className="core-heading-2 text-core-text">{title}</h2>
        <div id={descriptionId} className="core-body-large mt-3 text-core-secondary">{description}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <ActionButton ref={cancelRef} type="button" variant="secondary" onClick={cancelDialog}>
            {cancelLabel}
          </ActionButton>
          <ActionButton
            type="button"
            variant={destructive ? "destructive" : "primary"}
            onClick={confirmDialog}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

export function OrbIcon({ icon: Icon, className = "bg-core-subtle text-core-action" }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

export function MiniProgress({ value = 0 }: { value?: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-core-subtle">
      <div className="h-full rounded-full bg-core-action" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DonutValue({ value }: { value: number }) {
  return (
    <span
      className="grid size-10 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--core-action-primary) ${value * 3.6}deg, var(--core-surface-muted) 0deg)` }}
      aria-label={`${value} Prozent`}
    >
      <span className="block size-7 rounded-full bg-core-surface" />
    </span>
  );
}

interface StatTileProps {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}

export function StatTile({ icon: Icon, label, value, hint, accent = "text-core-action" }: StatTileProps) {
  return (
    <SoftPanel className="p-6">
      {Icon ? <OrbIcon icon={Icon} className={`bg-core-subtle ${accent}`} /> : null}
      <p className="core-status-label mt-5 uppercase tracking-wide text-core-muted">{label}</p>
      <p className="core-heading-2 mt-2 text-core-text">{value}</p>
      {hint ? <p className="core-body mt-1 text-core-muted">{hint}</p> : null}
    </SoftPanel>
  );
}

export function PageHeader({ eyebrow, title }: { eyebrow: ReactNode; title: ReactNode }) {
  return (
    <header className="min-w-0">
      <p className="core-control-label uppercase tracking-wide text-core-action">{eyebrow}</p>
      <h2 className="core-heading-1 mt-2 text-core-text outline-none" data-screen-heading tabIndex={-1}>{title}</h2>
    </header>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <SoftPanel className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Icon} />
          <div>
            <h3 className="core-heading-3 text-core-text">{title}</h3>
            {body ? <p className="core-body-large mt-1 text-core-muted">{body}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </SoftPanel>
  );
}

export function CoreModeControl({ value, onChange }: { value: CoreMode; onChange: (value: CoreMode) => void }) {
  const modes: Array<{ value: CoreMode; label: string }> = [
    { value: "off", label: "Aus" },
    { value: "auto", label: "Auto" },
    { value: "manual", label: "Manuell" },
  ];

  return (
    <div className="core-status-label inline-grid min-h-10 grid-cols-3 overflow-hidden rounded-xl border border-core-border bg-core-subtle text-core-secondary">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          aria-pressed={value === mode.value}
          className={`px-3 transition ${value === mode.value ? "bg-core-action text-[var(--core-text-on-accent)]" : "hover:bg-core-surface"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = React.useState(readCoreTheme);
  const darkModeActive = theme === "dark";
  const ThemeIcon = darkModeActive ? Moon : Sun;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={darkModeActive}
      aria-label={`Dark Mode ${darkModeActive ? "ausschalten" : "einschalten"}`}
      onClick={() => setTheme(toggleCoreTheme(theme))}
      className={`flex h-11 w-[4.75rem] items-center rounded-full border border-core-border-strong bg-core-subtle p-1 shadow-sm transition-colors hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--core-surface)] ${className}`}
    >
      <ThemeIcon
        aria-hidden="true"
        size={36}
        className={`rounded-full bg-core-surface p-2 shadow-sm transition-transform ${darkModeActive ? "translate-x-0 text-core-action" : "translate-x-8 text-[var(--core-warning)]"}`}
      />
    </button>
  );
}
