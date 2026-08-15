import React, { type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CoreMode } from "../coreTypes.ts";
import { ActionButton } from "./actionUi.tsx";

interface SoftPanelProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}
interface ActionDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel: string;
  onConfirm?: () => void;
  onCancel: () => void;
  actionIcons?: { cancel?: LucideIcon; confirm?: LucideIcon };
  discardLabel?: string;
  onDiscard?: () => void;
  confirmLoading?: boolean;
  restoreFocus?: (reason: "cancel" | "discard" | "confirm") => void;
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
  actionIcons,
  discardLabel,
  onDiscard,
  confirmLoading = false,
  restoreFocus,
  destructive = false,
}: ActionDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const closeReasonRef = React.useRef<"cancel" | "discard" | "confirm" | null>(null);
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
    if (!onConfirmRef.current) return;
    closeReasonRef.current = "confirm";
    onConfirmRef.current();
  }

  function discardDialog() {
    closeReasonRef.current = "discard";
    onDiscard?.();
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

  const compact = description == null;
  const dialog = (
    <div
      className={`fixed inset-0 z-[80] grid place-items-center bg-[var(--core-backdrop)] ${compact ? "p-2 sm:p-4" : "p-4"}`}
      role="presentation"
      data-testid="action-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) cancelDialog();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description == null ? undefined : descriptionId}
        className={`core-surface-raised w-full max-w-lg rounded-[18px] shadow-2xl ${compact ? "flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:p-6" : "p-6"}`}
      >
        <h2 id={titleId} className={`core-heading-2 text-core-text ${compact ? "min-w-0 flex-1 whitespace-nowrap !text-xl !leading-7 sm:!text-[1.75rem] sm:!leading-9" : ""}`}>{title}</h2>
        {description == null ? null : <div id={descriptionId} className="core-body-large mt-3 text-core-secondary">{description}</div>}
        <div className={`${compact ? "shrink-0 gap-2 sm:gap-3" : "mt-6 gap-3"} flex flex-wrap justify-end`}>
          <ActionButton ref={cancelRef} type="button" variant="secondary" icon={actionIcons?.cancel} disabled={confirmLoading} onClick={cancelDialog}>
            {cancelLabel}
          </ActionButton>
          {discardLabel && onDiscard ? (
            <ActionButton type="button" variant="destructive" disabled={confirmLoading} onClick={discardDialog}>
              {discardLabel}
            </ActionButton>
          ) : null}
          {confirmLabel && onConfirm ? (
            <ActionButton
              type="button"
              variant={destructive ? "destructive" : compact ? "secondary" : "primary"}
              icon={actionIcons?.confirm}
              loading={confirmLoading}
              disabled={confirmLoading}
              onClick={confirmDialog}
            >
              {confirmLabel}
            </ActionButton>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export function OrbIcon({ icon: Icon, className = "bg-core-subtle text-core-action" }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

export interface SegmentedDonutSegment {
  key: string;
  value: number;
  color: string;
}

interface SegmentedDonutProps {
  segments: SegmentedDonutSegment[];
  ariaLabel: string;
  size?: "default" | "compact" | "responsive";
}

const DONUT_CENTER = 20;
const DONUT_OUTER_RADIUS = 19;
const DONUT_INNER_RADIUS = 13.5;
const FULL_DONUT_PATH = [
  `M ${DONUT_CENTER} ${DONUT_CENTER - DONUT_OUTER_RADIUS}`,
  `A ${DONUT_OUTER_RADIUS} ${DONUT_OUTER_RADIUS} 0 1 1 ${DONUT_CENTER} ${DONUT_CENTER + DONUT_OUTER_RADIUS}`,
  `A ${DONUT_OUTER_RADIUS} ${DONUT_OUTER_RADIUS} 0 1 1 ${DONUT_CENTER} ${DONUT_CENTER - DONUT_OUTER_RADIUS}`,
  "Z",
  `M ${DONUT_CENTER} ${DONUT_CENTER - DONUT_INNER_RADIUS}`,
  `A ${DONUT_INNER_RADIUS} ${DONUT_INNER_RADIUS} 0 1 1 ${DONUT_CENTER} ${DONUT_CENTER + DONUT_INNER_RADIUS}`,
  `A ${DONUT_INNER_RADIUS} ${DONUT_INNER_RADIUS} 0 1 1 ${DONUT_CENTER} ${DONUT_CENTER - DONUT_INNER_RADIUS}`,
  "Z",
].join(" ");

function donutPoint(radius: number, angle: number): [number, number] {
  const radians = (angle - 90) * Math.PI / 180;
  return [
    DONUT_CENTER + radius * Math.cos(radians),
    DONUT_CENTER + radius * Math.sin(radians),
  ];
}

function donutSegmentPath(startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 360) return FULL_DONUT_PATH;
  const [outerStartX, outerStartY] = donutPoint(DONUT_OUTER_RADIUS, startAngle);
  const [outerEndX, outerEndY] = donutPoint(DONUT_OUTER_RADIUS, endAngle);
  const [innerEndX, innerEndY] = donutPoint(DONUT_INNER_RADIUS, endAngle);
  const [innerStartX, innerStartY] = donutPoint(DONUT_INNER_RADIUS, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStartX} ${outerStartY}`,
    `A ${DONUT_OUTER_RADIUS} ${DONUT_OUTER_RADIUS} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
    `L ${innerEndX} ${innerEndY}`,
    `A ${DONUT_INNER_RADIUS} ${DONUT_INNER_RADIUS} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}`,
    "Z",
  ].join(" ");
}

export function SegmentedDonut({ segments, ariaLabel, size = "default" }: SegmentedDonutProps) {
  const compact = size === "compact";
  const responsive = size === "responsive";
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const total = visibleSegments.reduce((sum, segment) => sum + segment.value, 0);
  let angle = 0;

  return (
    <span
      className={`block shrink-0 ${compact || responsive ? "size-8" : "size-10"} ${responsive ? "core-donut-responsive" : ""}`}
    >
      <svg viewBox="0 0 40 40" className="block size-full overflow-visible" role="img" aria-label={ariaLabel}>
        {total === 0 ? (
          <path
            d={FULL_DONUT_PATH}
            fill="var(--core-surface-muted)"
            fillRule="evenodd"
            stroke="var(--core-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            data-donut-empty="true"
          />
        ) : visibleSegments.map((segment) => {
          const startAngle = angle;
          angle += segment.value / total * 360;
          return (
            <path
              key={segment.key}
              d={donutSegmentPath(startAngle, angle)}
              fill={segment.color}
              fillRule="evenodd"
              stroke="var(--core-border)"
              strokeWidth="1"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              data-donut-segment={segment.key}
              data-donut-value={segment.value}
            />
          );
        })}
      </svg>
    </span>
  );
}

type StatTileProps = Omit<HTMLAttributes<HTMLDListElement>, "children"> & {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  size?: "default" | "compact";
};

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent = "text-core-action",
  size = "default",
  className = "",
  ...props
}: StatTileProps) {
  const compact = size === "compact";
  return (
    <dl
      {...props}
      data-size={size}
      className={`${compact ? "rounded-xl bg-core-subtle p-3" : "core-surface-raised rounded-[18px] p-6"} min-w-0 ${className}`.trim()}
    >
      <dt className={`${compact ? "core-caption !font-semibold" : "core-status-label"} uppercase tracking-wide text-core-muted`}>
        {Icon ? <OrbIcon icon={Icon} className={`bg-core-subtle ${accent}`} /> : null}
        <span className={Icon ? "mt-5 block" : undefined}>{label}</span>
      </dt>
      <dd className={`${compact ? "core-heading-3 mt-1" : "core-heading-2 mt-2"} text-core-text`}>{value}</dd>
      {hint ? <dd className="core-body mt-1 text-core-muted">{hint}</dd> : null}
    </dl>
  );
}

export function PageHeader({ eyebrow, title }: { eyebrow?: ReactNode; title: ReactNode }) {
  return (
    <header className="min-w-0 space-y-2">
      {eyebrow ? <p className="core-control-label uppercase tracking-wide text-core-action">{eyebrow}</p> : null}
      <h2 className="core-heading-1 text-core-text outline-none" data-screen-heading tabIndex={-1}>{title}</h2>
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

export interface CoreSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface CoreSegmentedControlProps<T extends string> {
  ariaLabel: string;
  options: ReadonlyArray<CoreSegmentedControlOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  size?: "regular" | "compact";
  disabled?: boolean;
  className?: string;
}

const CORE_MODE_OPTIONS: ReadonlyArray<CoreSegmentedControlOption<CoreMode>> = [
  { value: "off", label: "Aus" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manuell" },
];

export function CoreSegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onValueChange,
  size = "regular",
  disabled = false,
  className = "",
}: CoreSegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-size={size}
      className={`core-segmented-control core-status-label ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onValueChange(option.value)}
          className="core-segmented-control-option"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CoreModeControl({ value, onChange }: { value: CoreMode; onChange: (value: CoreMode) => void }) {
  return (
    <CoreSegmentedControl
      ariaLabel="CoRe-Modus"
      options={CORE_MODE_OPTIONS}
      value={value}
      onValueChange={onChange}
      size="regular"
    />
  );
}

export interface CoreSwitchProps {
  checked: boolean;
  ariaLabel: string;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  thumb?: ReactNode;
}

export function CoreSwitch({ checked, ariaLabel, onCheckedChange, disabled = false, className = "", thumb = null }: CoreSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`grid size-11 shrink-0 place-items-center rounded-xl transition hover:bg-[var(--core-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span className={`relative h-6 w-11 rounded-full border transition-colors ${checked ? "border-[var(--core-warning)] bg-[var(--core-warning)]" : "border-[var(--core-border-interactive)] bg-[var(--core-surface-muted)]"}`} aria-hidden="true">
        <span className={`absolute left-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-core-surface text-[var(--core-action-primary)] shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}>
          {thumb}
        </span>
      </span>
    </button>
  );
}

export function CardMarkButton({ marked, onMarkedChange, disabled = false, className = "" }: {
  marked: boolean;
  onMarkedChange: (marked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={marked}
      aria-label={marked ? "Markierung entfernen" : "Karte markieren"}
      disabled={disabled}
      onClick={() => onMarkedChange(!marked)}
      className={`grid size-11 shrink-0 place-items-center rounded-xl text-[var(--core-warning)] transition hover:bg-[var(--core-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <Star size={22} fill={marked ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
