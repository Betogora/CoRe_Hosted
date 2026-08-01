import React from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "compact" | "default" | "large";
  icon?: LucideIcon;
  loading?: boolean;
}

const actionSizeClasses = {
  compact: "min-h-9 px-3 py-1.5",
  default: "min-h-11 px-4 py-2.5",
  large: "min-h-12 px-5 py-3 core-body-large leading-6",
} as const;

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { variant, size = "default", icon: Icon, loading = false, disabled, className = "", children, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`core-action-${variant} ${actionSizeClasses[size]} ${className}`}
    >
      {loading ? (
        <LoaderCircle className="animate-spin" size={size === "large" ? 20 : 18} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={size === "large" ? 20 : 18} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
});

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: LucideIcon;
  variant?: "secondary" | "tertiary" | "destructive";
  size?: "compact" | "default";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, variant = "tertiary", size = "default", className = "", ...props },
  ref,
) {
  const variantClass = variant === "tertiary" ? "core-icon-action" : `core-action-${variant}`;
  return (
    <button
      {...props}
      ref={ref}
      aria-label={label}
      className={`${variantClass} ${size === "compact" ? "min-h-9 min-w-9 p-2" : "min-h-11 min-w-11 p-2.5"} ${className}`}
    >
      <Icon size={size === "compact" ? 18 : 20} aria-hidden="true" />
    </button>
  );
});
