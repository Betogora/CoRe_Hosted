import React, { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./actionUi.tsx";
import { useModalDialog } from "./useModalDialog.ts";

export interface DialogFrameProps {
  open: boolean;
  title: ReactNode;
  /** Not part of the dialog's accessible name. */
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  size?: "s" | "m" | "l";
  tabs?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  /** Element that receives focus after closing; otherwise the element focused before opening. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Element that receives focus on opening; otherwise the close button. */
  startFocusRef?: React.RefObject<HTMLElement | null>;
  testId?: string;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function DialogFrame({ open, title, subtitle, leading, actions, onClose, size = "m", tabs, footer, closeLabel = "Schließen", returnFocusRef, startFocusRef, testId, className, onKeyDown, children }: DialogFrameProps) {
  const titleId = React.useId();
  const { dialogRef, initialFocusRef } = useModalDialog({ open, onClose, returnFocusRef, startFocusRef, stopEscapePropagation: true });
  if (!open) return null;

  const dialog = (
    <div
      className="core-dialog-frame-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-size={size} data-testid={testId} className={className ? `core-dialog-frame ${className}` : "core-dialog-frame"} onKeyDown={onKeyDown}>
        <header className="core-dialog-frame-header" data-tabs={tabs ? "true" : undefined}>
          {leading}
          {subtitle ? (
            <div className="core-dialog-frame-heading">
              <h2 id={titleId} className="core-dialog-frame-title">{title}</h2>
              <div className="core-dialog-frame-subtitle">{subtitle}</div>
            </div>
          ) : <h2 id={titleId} className="core-dialog-frame-title">{title}</h2>}
          {actions}
          <IconButton ref={initialFocusRef} label={closeLabel} icon={X} variant="ghost" onClick={onClose} />
        </header>
        {tabs ? <div className="core-dialog-frame-tabs">{tabs}</div> : null}
        <div className="core-dialog-frame-body">{children}</div>
        {footer ? <footer className="core-dialog-frame-footer">{footer}</footer> : null}
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
