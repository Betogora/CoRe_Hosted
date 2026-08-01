import type { HTMLAttributes } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export interface StatusMessageProps extends HTMLAttributes<HTMLDivElement> {
  tone: "info" | "success" | "warning" | "error";
  announce?: false | "polite" | "assertive";
  icon?: LucideIcon;
}

const defaultIcons: Record<StatusMessageProps["tone"], LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

export function StatusMessage({
  tone,
  announce = false,
  icon,
  className = "",
  children,
  ...props
}: StatusMessageProps) {
  const Icon = icon ?? defaultIcons[tone];
  const accessibility = announce === "assertive"
    ? { role: "alert" as const }
    : announce === "polite"
      ? { role: "status" as const, "aria-live": "polite" as const }
      : {};

  return (
    <div {...props} {...accessibility} className={`core-status-${tone} flex items-start gap-3 ${className}`}>
      <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
