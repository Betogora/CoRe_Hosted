import React from "react";
import { ChevronRight, LoaderCircle, type LucideIcon } from "lucide-react";

const ACTION_VARIANT_CLASS = {
  primary: "core-action-primary",
  secondary: "core-action-secondary",
  destructive: "core-action-destructive",
  ghost: "core-action-ghost",
} as const;

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "primary" | "secondary" | "destructive";
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
        <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={18} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
});

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: LucideIcon;
  variant?: "secondary" | "destructive" | "ghost";
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
      style={variant === "destructive" ? style : { ...style, color: "var(--core-text)" }}
      className={`${ACTION_VARIANT_CLASS[variant]} min-w-11 p-2.5 ${className}`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
});

interface CrossLinkBaseProps {
  children: React.ReactNode;
  className?: string;
}

export type CrossLinkButtonProps = CrossLinkBaseProps & (
  | { href: string; onSelect?: never }
  | { href?: never; onSelect: () => void }
);

const CROSS_LINK_CLASS = "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2";

export function CrossLinkButton({ children, className = "", ...action }: CrossLinkButtonProps) {
  const content = (
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
