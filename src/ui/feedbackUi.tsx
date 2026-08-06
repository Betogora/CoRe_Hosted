import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { IconButton } from "./actionUi.tsx";

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

export interface SuccessToastProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  onDismiss: () => void;
  dismissLabel?: string;
}

export function SuccessToast({
  onDismiss,
  dismissLabel = "Erfolgsmeldung schließen",
  className = "",
  children,
  ...props
}: SuccessToastProps) {
  const toast = (
    <StatusMessage
      {...props}
      tone="success"
      announce="polite"
      data-success-toast-region="true"
      className={`pointer-events-auto fixed inset-x-4 top-4 z-[75] rounded-2xl py-4 pl-5 pr-2 shadow-[var(--core-shadow-raised)] sm:left-auto sm:right-8 sm:top-8 sm:w-full sm:max-w-xl ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1 core-body-large font-medium">{children}</div>
        <IconButton label={dismissLabel} icon={X} variant="ghost" className="shrink-0" onClick={onDismiss} />
      </div>
    </StatusMessage>
  );

  return typeof document === "undefined" ? toast : createPortal(toast, document.body);
}

type SuccessToastSetter = (message: string) => void;
const SuccessToastContext = createContext<SuccessToastSetter>(() => {
  throw new Error("SuccessToastProvider fehlt.");
});

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");

  return (
    <SuccessToastContext.Provider value={setMessage}>
      {children}
      {message ? <SuccessToast onDismiss={() => setMessage("")}>{message}</SuccessToast> : null}
    </SuccessToastContext.Provider>
  );
}

export function useSuccessToast() {
  return useContext(SuccessToastContext);
}
