import React from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), iframe, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalDialog({
  open,
  onClose,
  stopEscapePropagation = false,
}: {
  open: boolean;
  onClose: () => void;
  stopEscapePropagation?: boolean;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const initialFocusRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (stopEscapePropagation) event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open, stopEscapePropagation]);

  return { dialogRef, initialFocusRef };
}
