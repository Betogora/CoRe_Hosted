import React from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), iframe, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialogs of this hook in opening order; only the last one answers Escape. */
const openDialogs: HTMLElement[] = [];

/**
 * Another dialog lies on top, also while the focus rests on the page: a later one of this hook, or a foreign modal
 * such as `ActionDialog` portalled after this one.
 */
function isCoveredByOtherDialog(dialog: HTMLElement | null) {
  if (!dialog) return false;
  if (openDialogs.at(-1) !== dialog) return true;
  return [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
    .some((other) => !openDialogs.includes(other) && Boolean(dialog.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING));
}

function isInsideOtherDialog(target: Element, dialog: HTMLElement | null) {
  const owner = target.closest('[role="dialog"], [role="alertdialog"]');
  return Boolean(owner && owner !== dialog);
}

export function useModalDialog({
  open,
  onClose,
  returnFocusRef,
  stopEscapePropagation = false,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  stopEscapePropagation?: boolean;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const initialFocusRef = React.useRef<HTMLButtonElement | null>(null);
  const fallbackReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return undefined;
    fallbackReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());
    const dialog = dialogRef.current;
    if (dialog) openDialogs.push(dialog);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // An open selection list or a confirmation stacked on top handles its own Escape first.
        if (event.target instanceof Element && (event.target.closest("[data-radix-popper-content-wrapper]") || isInsideOtherDialog(event.target, dialogRef.current))) return;
        if (isCoveredByOtherDialog(dialog)) return;
        event.preventDefault();
        if (stopEscapePropagation) event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // Content of hidden panels stays mounted but cannot take the focus.
      const focusable = [...dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
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
      if (dialog) openDialogs.splice(openDialogs.indexOf(dialog), 1);
      const returnFocus = returnFocusRef?.current ?? fallbackReturnFocusRef.current;
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [open, returnFocusRef, stopEscapePropagation]);

  return { dialogRef, initialFocusRef };
}
