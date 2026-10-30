import { createContext, useCallback, useContext, useState, type AnimationEvent, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, RotateCcw, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { ActionButton, IconButton } from "./actionUi.tsx";

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

/** An optional undo-like action; the toast then stays while pointer or focus rest on it (W7). */
export interface SuccessToastAction {
  label: string;
  onAction: () => void;
}

export interface SuccessToastProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  onDismiss: () => void;
  dismissLabel?: string;
  appearance?: "success" | "neutral";
  action?: SuccessToastAction;
}

export function SuccessToast({
  onDismiss,
  dismissLabel = "Erfolgsmeldung schließen",
  appearance = "success",
  action,
  onAnimationEnd,
  className = "",
  children,
  ...props
}: SuccessToastProps) {
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    onAnimationEnd?.(event);
    if (event.currentTarget === event.target) onDismiss();
  };

  const toast = (
    <StatusMessage
      {...props}
      tone="success"
      announce="polite"
      data-success-toast-region="true"
      data-appearance={appearance}
      onAnimationEnd={handleAnimationEnd}
      className={`core-success-toast pointer-events-auto fixed right-4 top-4 z-[75] !w-fit max-w-[calc(100vw-2rem)] !items-center rounded-panel py-4 pl-6 pr-2 shadow-raised [&>svg]:!mt-0 sm:right-8 sm:top-8 sm:max-w-[calc(100vw-4rem)] ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1 break-words core-body-large font-medium">{children}</div>
        {action ? (
          <ActionButton variant="secondary" icon={RotateCcw} className="shrink-0" onClick={() => {
            onDismiss();
            action.onAction();
          }}>{action.label}</ActionButton>
        ) : null}
        <IconButton label={dismissLabel} icon={X} variant="ghost" className="shrink-0" onClick={onDismiss} />
      </div>
    </StatusMessage>
  );

  return typeof document === "undefined" ? toast : createPortal(toast, document.body);
}

interface SuccessToastOptions {
  appearance?: SuccessToastProps["appearance"];
  action?: SuccessToastAction;
}

type SuccessToastSetter = (message: string, options?: SuccessToastOptions) => void;
const SuccessToastContext = createContext<SuccessToastSetter>(() => {
  throw new Error("SuccessToastProvider fehlt.");
});

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; appearance: NonNullable<SuccessToastProps["appearance"]>; action?: SuccessToastAction } | null>(null);
  const setMessage = useCallback((message: string, options?: SuccessToastOptions) => {
    setToast((current) => message ? {
      id: (current?.id ?? 0) + 1,
      message,
      appearance: options?.appearance ?? "success",
      action: options?.action,
    } : null);
  }, []);

  return (
    <SuccessToastContext.Provider value={setMessage}>
      {children}
      {toast ? (
        <SuccessToast
          key={toast.id}
          appearance={toast.appearance}
          action={toast.action}
          onDismiss={() => setToast((current) => current?.id === toast.id ? null : current)}
        >
          {toast.message}
        </SuccessToast>
      ) : null}
    </SuccessToastContext.Provider>
  );
}

export function useSuccessToast() {
  return useContext(SuccessToastContext);
}
