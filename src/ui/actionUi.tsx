import React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Play, X, type LucideIcon } from "lucide-react";

const ACTION_VARIANT_CLASS = {
  primary: "core-action-primary",
  secondary: "core-action-secondary",
  destructive: "core-action-destructive",
  "destructive-secondary": "core-action-secondary core-action-destructive-secondary",
  ghost: "core-action-ghost",
  "destructive-quiet": "core-action-ghost core-action-destructive-quiet",
} as const;

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "primary" | "secondary" | "destructive" | "destructive-secondary";
  icon?: LucideIcon;
  loading?: boolean;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { variant, icon: Icon, loading = false, disabled, className = "", children, ...props },
  ref,
) {
  const icon = loading ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : Icon ? <ActionIcon icon={Icon} /> : null;
  const trailing = Icon === ChevronRight;
  return (
    <button
      {...props}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${ACTION_VARIANT_CLASS[variant]} ${className}`}
    >
      {trailing ? null : icon}
      <span>{children}</span>
      {trailing ? icon : null}
    </button>
  );
});

function ActionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={16} fill={Icon === Play ? "currentColor" : "none"} aria-hidden="true" />;
}

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: LucideIcon;
  variant?: "secondary" | "destructive" | "destructive-quiet" | "ghost";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, variant = "secondary", className = "", style, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      aria-label={label}
      style={variant.startsWith("destructive") || props.disabled ? style : { ...style, color: "var(--core-text)" }}
      className={`${ACTION_VARIANT_CLASS[variant]} min-w-button p-2 ${className}`}
    >
      <ActionIcon icon={Icon} />
    </button>
  );
});

export interface CloseButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  label: string;
}

export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(function CloseButton(
  { label, className = "", ...props },
  ref,
) {
  return (
    <button type="button" {...props} ref={ref} aria-label={label} className={`core-action-ghost core-close-button ${className}`.trim()}>
      <X aria-hidden="true" />
    </button>
  );
});

interface CrossLinkBaseProps {
  children: React.ReactNode;
  className?: string;
  direction?: "forward" | "back";
}

export type CrossLinkButtonProps = CrossLinkBaseProps & (
  | { href: string; onSelect?: never }
  | { href?: never; onSelect: () => void }
);

const CROSS_LINK_CLASS = "inline-flex min-h-button items-center gap-1 whitespace-nowrap rounded-control px-1 core-control-label font-semibold text-core-action underline-offset-4 hover:underline";

export function ShowMoreButton({ expanded, hiddenCount, onToggle, controls, context, className = "" }: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
  controls?: string;
  context?: string;
  className?: string;
}) {
  const label = expanded ? "Weniger anzeigen" : `${hiddenCount} weitere anzeigen`;
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button type="button" aria-expanded={expanded} aria-controls={controls} aria-label={context ? `${label}: ${context}` : undefined} onClick={onToggle}
      className={`${EXPANDER_CLASS} core-control-label justify-self-start self-start ${className}`.trim()}>
      <Icon size={14} className="mt-[0.2em] shrink-0" aria-hidden="true" />{label}
    </button>
  );
}

const EXPANDER_CLASS = "core-show-more -ml-1.5 inline-flex items-start gap-1 rounded-inset px-1.5 py-1 text-left font-semibold text-core-action transition-colors hover:bg-core-subtle";

export function Disclosure({ summary, children, className = "", ...props }: Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "children"> & { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className={`core-disclosure min-w-0 ${className}`.trim()} {...props}>
      <summary className={`${EXPANDER_CLASS} core-control-label cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><ChevronDown size={14} className="mt-[0.2em] shrink-0" aria-hidden="true" />{summary}</summary>
      {children}
    </details>
  );
}

export function CrossLinkButton({ children, className = "", direction = "forward", ...action }: CrossLinkButtonProps) {
  const content = direction === "back" ? (
    <>
      <ChevronLeft size={15} aria-hidden="true" />
      {children}
    </>
  ) : (
    <>
      {children}
      <ChevronRight size={15} aria-hidden="true" />
    </>
  );
  const resolvedClassName = `${CROSS_LINK_CLASS} ${className}`;

  return action.href ? (
    <a href={action.href} className={resolvedClassName}>{content}</a>
  ) : (
    <button type="button" onClick={action.onSelect} className={resolvedClassName}>{content}</button>
  );
}
