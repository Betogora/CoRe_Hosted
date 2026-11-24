import React from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), iframe, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialogs of this hook in opening order; only the last one answers Escape, also while the focus rests on the page. */
const openDialogs: HTMLElement[] = [];
/** Open dialogs share one scroll lock; the page scrolls again once the last one closes, in any closing order. */
let scrollLocks = 0;
let unlockedOverflow = "";

function isInsideOtherDialog(target: Element, dialog: HTMLElement | null) {
  const owner = target.closest('[role="dialog"], [role="alertdialog"]');
  return Boolean(owner && owner !== dialog);
}

export function useModalDialog({
  open,
  onClose,
  returnFocusRef,
  startFocusRef,
  stopEscapePropagation = false,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Receives the focus on opening instead of the returned `initialFocusRef`. */
  startFocusRef?: React.RefObject<HTMLElement | null>;
  stopEscapePropagation?: boolean;
  /** Replaces focusing the return target after closing, even when another element took the focus meanwhile. */
  returnFocus?: (target: HTMLElement | null) => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const initialFocusRef = React.useRef<HTMLButtonElement | null>(null);
  const fallbackReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const returnFocusCallbackRef = React.useRef(returnFocus);

  React.useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusCallbackRef.current = returnFocus;
  }, [onClose, returnFocus]);

  // Before any passive effect: content that focuses its own heading on mount would otherwise become the return target.
  React.useLayoutEffect(() => {
    if (open) fallbackReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    if (scrollLocks++ === 0) {
      unlockedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const frame = window.requestAnimationFrame(() => (startFocusRef ?? initialFocusRef).current?.focus());
    const dialog = dialogRef.current;
    if (dialog) openDialogs.push(dialog);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // An open selection list or a confirmation stacked on top handles its own Escape first.
        if (event.target instanceof Element && (event.target.closest("[data-radix-popper-content-wrapper]") || isInsideOtherDialog(event.target, dialogRef.current))) return;
        if (dialog && openDialogs.at(-1) !== dialog) return;
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
      if (--scrollLocks === 0) document.body.style.overflow = unlockedOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (dialog) openDialogs.splice(openDialogs.indexOf(dialog), 1);
      const target = returnFocusRef?.current ?? fallbackReturnFocusRef.current;
      const returnFocus = returnFocusCallbackRef.current;
      window.requestAnimationFrame(() => {
        if (returnFocus) return returnFocus(target);
        // What opened in the dialog's place, such as `Nur üben`, keeps the focus it took.
        const active = document.activeElement;
        if (active && active !== document.body && !dialog?.contains(active)) return;
        target?.focus();
      });
    };
  }, [open, returnFocusRef, startFocusRef, stopEscapePropagation]);

  return { dialogRef, initialFocusRef };
}
