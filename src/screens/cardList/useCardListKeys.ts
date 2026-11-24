import React from "react";
import type { createCardTableRow } from "../../libraryModel.ts";
import { useStableCallback } from "../../ui/useStableCallback.ts";
import type { CardSelectionRequest } from "./cardSelectionModel.ts";
import type { CardSelectionState } from "./useCardSelection.ts";

/**
 * Routes the card list's keys to the selection; returns what restores the focus once the action a key asked for ends,
 * on the row that asked, as soon as the reloaded list renders it.
 */
export function useCardListKeys({ selection, canSelect, rows, undo }: {
  selection: Pick<CardSelectionState, "selecting" | "toggle" | "clear" | "requestAction">;
  canSelect: boolean;
  rows: ReadonlyMap<number, ReturnType<typeof createCardTableRow>>;
  /** Undoes the last action with Ctrl+Z; null without one. */
  undo: (() => void) | null;
}) {
  const keyActionRowRef = React.useRef<string | null>(null);
  const [focusRowAfterAction, setFocusRowAfterAction] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusRowAfterAction) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="deck-card-${CSS.escape(focusRowAfterAction)}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    setFocusRowAfterAction(null);
  }, [focusRowAfterAction, rows]);
  const handleListKey = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    // Text entry keeps its keys; a checkbox (the header's or a row's) leaves Escape, `/` and undo to the list.
    if (target && (target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName) || (target instanceof HTMLInputElement && target.type !== "checkbox"))) return;
    if (target?.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]') || document.querySelector('[aria-modal="true"]')) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() !== "z" || event.shiftKey || !undo) return;
      event.preventDefault();
      undo();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('input[aria-label="Karten durchsuchen"]')?.focus();
      return;
    }
    if (event.key === "Escape" && selection.selecting) {
      event.preventDefault();
      selection.clear();
      return;
    }
    const cardId = target?.dataset.testid?.startsWith("deck-card-") ? target.dataset.testid.slice("deck-card-".length) : null;
    if (!cardId) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = (row: Element | null | undefined) => event.key === "ArrowDown" ? row?.nextElementSibling : row?.previousElementSibling;
      let row = step(target!.closest("tr"));
      while (row && !(row as HTMLElement).dataset.cardRow) row = step(row);
      const next = row?.querySelector<HTMLElement>('[data-testid^="deck-card-"]');
      if (!next) return;
      event.preventDefault();
      next.focus();
      return;
    }
    if (!canSelect) return;
    const key = event.key.toLowerCase();
    if (key === "x") {
      event.preventDefault();
      selection.toggle(cardId, event.shiftKey);
      return;
    }
    const entry = [...rows.values()].find((row) => row.id === cardId)?.entry;
    const request: Omit<CardSelectionRequest, "nonce"> | null = /^[1-7]$/.test(key) ? { id: "flag", flag: Number(key) }
      : key === "0" ? { id: "flag-remove" }
        : key === "m" ? { id: entry?.marked ? "unmark" : "mark" }
          : key === "a" ? { id: entry && !entry.reviewable ? "unsuspend" : "suspend" }
            : key === "s" ? { id: "deck" }
              : key === "t" ? { id: "tags-add" }
                : event.key === "Delete" ? { id: "delete" } : null;
    if (!request) return;
    event.preventDefault();
    keyActionRowRef.current = cardId;
    selection.requestAction(cardId, request);
  });
  React.useEffect(() => {
    window.addEventListener("keydown", handleListKey);
    return () => window.removeEventListener("keydown", handleListKey);
  }, [handleListKey]);
  return React.useCallback(() => {
    setFocusRowAfterAction(keyActionRowRef.current);
    keyActionRowRef.current = null;
  }, []);
}
