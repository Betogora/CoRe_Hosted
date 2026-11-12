import React, { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./actionUi.tsx";
import { useModalDialog } from "./useModalDialog.ts";

export interface DialogFrameProps {
  open: boolean;
  title: ReactNode;
  /** Line below the title, e.g. a type and state marks; not part of the dialog's name. */
  subtitle?: ReactNode;
  /** Controls before the title, e.g. paging through a list. */
  leading?: ReactNode;
  /** Actions between the title and the close button. */
  actions?: ReactNode;
  onClose: () => void;
  /** Width from 768 px: `s` 28 rem, `m` 40 rem (default), `l` 60 rem. Below 768 px the frame fills the screen. */
  size?: "s" | "m" | "l";
  /** Row below the title, typically `CoreTabs`. */
  tabs?: ReactNode;
  /** Fixed row below the scrolling content, typically the dialog actions. */
  footer?: ReactNode;
  /** Accessible name of the close button; it receives the initial focus. */
  closeLabel?: string;
  /** Element that receives focus after closing; otherwise the element focused before opening. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  testId?: string;
  /** Extra class on the dialog surface for a caller's own width, height or tone. */
  className?: string;
  /** Keys pressed anywhere in the dialog, e.g. shortcuts of its content. */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/**
 * Shared modal frame on `useModalDialog`: 56 px title row with the title left and a borderless close button right,
 * optional tab row, scrolling content and optional fixed footer. Escape, the backdrop and the close button call
 * `onClose`; focus trap, scroll lock and focus return belong to the hook.
 */
export function DialogFrame({ open, title, subtitle, leading, actions, onClose, size = "m", tabs, footer, closeLabel = "Schließen", returnFocusRef, testId, className, onKeyDown, children }: DialogFrameProps) {
  const titleId = React.useId();
  const { dialogRef, initialFocusRef } = useModalDialog({ open, onClose, returnFocusRef, stopEscapePropagation: true });
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
