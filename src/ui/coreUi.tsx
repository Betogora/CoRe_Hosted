import React, { type HTMLAttributes, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CoreMode } from "../coreTypes.ts";
import type { ProductSurface } from "../productSurfaces.ts";

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
  destructive = false,
}: ActionDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onCancelRef = React.useRef(onCancel);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  React.useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
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
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17214f]/45 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="core-surface-raised w-full max-w-lg rounded-[18px] p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-2xl font-semibold text-[#17214f]">{title}</h2>
        <div id={descriptionId} className="mt-3 text-sm leading-6 text-[#66709a]">{description}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-4 text-sm font-semibold text-[#4f5eb1]">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white ${destructive ? "bg-red-700" : "bg-[#4f5eb1]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrbIcon({ icon: Icon, className = "bg-[#eceefd] text-[#6672bf]" }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

export function MiniProgress({ value = 0 }: { value?: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#6fb7ae] via-[#7d89d9] to-[#596bc4]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DonutValue({ value }: { value: number }) {
  return (
    <div
      className="grid size-10 place-items-center rounded-full"
      style={{ background: `conic-gradient(#6c78cf ${value * 3.6}deg, #e9edf8 0deg)` }}
      aria-label={`${value} Prozent`}
    >
      <span className="block size-7 rounded-full bg-white" />
    </div>
  );
}

interface StatTileProps {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}

export function StatTile({ icon: Icon, label, value, hint, accent = "text-[#6672bf]" }: StatTileProps) {
  return (
    <SoftPanel className="p-6">
      {Icon ? <OrbIcon icon={Icon} className={`bg-[#eef1fb] ${accent}`} /> : null}
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#66709a]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#17214f]">{value}</p>
      {hint ? <p className="mt-1 text-sm leading-6 text-[#66709a]">{hint}</p> : null}
    </SoftPanel>
  );
}

export function PageHeader({ eyebrow, title }: { eyebrow: ReactNode; title: ReactNode }) {
  return (
    <header className="min-w-0">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">{eyebrow}</p>
      <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#17214f] outline-none" data-screen-heading tabIndex={-1}>{title}</h2>
    </header>
  );
}

export function LabsNotice({ surfaces }: { surfaces: ProductSurface | ProductSurface[] }) {
  const items = Array.isArray(surfaces) ? surfaces : [surfaces];
  const reasons = [...new Set(items.map((surface) => surface.reason).filter(Boolean))];

  return (
    <aside aria-label="Labs-Hinweis" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-950">
      <FlaskConical className="mt-0.5 shrink-0 text-amber-700" size={18} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">Experimentelle Labs-Funktion</p>
        {reasons.length > 0 ? <p className="mt-1 text-sm leading-6 text-amber-900">{reasons.join(" ")}</p> : null}
      </div>
    </aside>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <SoftPanel className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Icon} />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">{title}</h3>
            {body ? <p className="mt-1 text-[#66709a]">{body}</p> : null}
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
    <div className="inline-grid min-h-10 grid-cols-3 overflow-hidden rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] text-xs font-semibold text-[#596489]">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          aria-pressed={value === mode.value}
          className={`px-3 transition ${value === mode.value ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
