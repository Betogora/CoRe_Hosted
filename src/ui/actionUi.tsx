import React from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

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
      className={`core-action-${variant} ${className}`}
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
  { label, icon: Icon, variant = "secondary", className = "", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      aria-label={label}
      className={`core-action-${variant} min-w-11 p-2.5 ${className}`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
});
