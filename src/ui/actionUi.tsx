import React from "react";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, LoaderCircle, type LucideIcon } from "lucide-react";

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
  return (
    <button
      {...props}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${ACTION_VARIANT_CLASS[variant]} ${className}`}
    >
      {loading ? (
        <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={16} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
});

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
      style={variant.startsWith("destructive") ? style : { ...style, color: "var(--core-text)" }}
      className={`${ACTION_VARIANT_CLASS[variant]} min-w-button p-2 ${className}`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
});

interface CrossLinkBaseProps {
  children: React.ReactNode;
  className?: string;
  /** `back` leads with an arrow to the parent surface instead of the trailing chevron. */
  direction?: "forward" | "back";
}

export type CrossLinkButtonProps = CrossLinkBaseProps & (
  | { href: string; onSelect?: never }
  | { href?: never; onSelect: () => void }
);

const CROSS_LINK_CLASS = "inline-flex min-h-button items-center gap-1 whitespace-nowrap rounded-control px-1 core-control-label font-semibold text-core-action underline-offset-4 hover:underline";

/**
 * Opens the rest of a shortened list in place (`N weitere anzeigen`) or folds it again (`Weniger anzeigen`). `context`
 * names the list for screen readers when several of them stand side by side.
 */
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
      className={`core-show-more -ml-1.5 inline-flex items-start gap-1 justify-self-start self-start rounded-inset px-1.5 py-1 text-left core-control-label font-semibold text-core-action transition-colors hover:bg-core-subtle ${className}`.trim()}>
      <Icon size={14} className="mt-[0.2em] shrink-0" aria-hidden="true" />{label}
    </button>
  );
}

export function CrossLinkButton({ children, className = "", direction = "forward", ...action }: CrossLinkButtonProps) {
  const content = direction === "back" ? (
    <>
      <ArrowLeft size={15} aria-hidden="true" />
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
