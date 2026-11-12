import React from "react";
import type { CardSelectionActionId } from "./CardSelectionBar.tsx";
import { useStableCallback } from "../../ui/useStableCallback.ts";
import type { useCardSearch } from "./useCardSearch.ts";

type CardSearch = ReturnType<typeof useCardSearch>;

/**
 * Selection of the card list for mass actions (KV4) and the keys of the list (KV6): checked cards or every hit, cleared
 * by a new search or scope; the row a key action started from takes the focus back once the action ran.
 */
export function useCardSelection({ canSelect, hitList, items, cardItems, rowOf, locateCard, deferredQuery, hitScope }: Pick<CardSearch, "hitList" | "items" | "cardItems" | "rowOf" | "locateCard" | "deferredQuery" | "hitScope"> & {
  canSelect: boolean;
}) {
  // Selection for mass actions (KV4): card ids, or every hit of the flat list; a new search or scope clears it.
  const [selecting, setSelecting] = React.useState(false);
  const [checkedIds, setCheckedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [allHits, setAllHits] = React.useState(false);
  const selectionAnchorRef = React.useRef<number | null>(null);
  const clearSelection = React.useCallback(() => {
    setSelecting(false);
    setCheckedIds(new Set());
    setAllHits(false);
    selectionAnchorRef.current = null;
  }, []);
  // The scope compares by its decks: a sync renews the deck list without changing it.
  const hitScopeKey = hitScope.join("\n");
  React.useEffect(() => {
    if (selecting || allHits || checkedIds.size) clearSelection();
    // Only a new search or scope clears; without a selection nothing changes, so no extra render follows.
  }, [deferredQuery, hitScopeKey]);
  function toggleCheck(cardId: string, range: boolean) {
    if (!canSelect) return;
    const position = locateCard(cardId)?.card ?? null;
    const anchor = selectionAnchorRef.current;
    setSelecting(true);
    setAllHits(false);
    setCheckedIds((current) => {
      const next = new Set(current);
      if (range && anchor !== null && position !== null) {
        // A range takes the loaded rows between the last toggled row and this one.
        for (let index = Math.min(anchor, position); index <= Math.max(anchor, position); index += 1) {
          const row = rowOf(cardItems[index]);
          if (row) next.add(row.id);
        }
      } else if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    selectionAnchorRef.current = position;
  }
  const stableToggleCheck = useStableCallback(toggleCheck);
  const selectionCount = allHits ? hitList?.totalCardCount ?? 0 : checkedIds.size;
  const lastUndoRef = React.useRef<(() => void) | null>(null);
  // The row a key action started from takes the focus back once the action ran, so the keyboard flow goes on.
  const keyActionRowRef = React.useRef<string | null>(null);
  const [focusRowAfterAction, setFocusRowAfterAction] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusRowAfterAction) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="deck-card-${CSS.escape(focusRowAfterAction)}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    setFocusRowAfterAction(null);
  }, [focusRowAfterAction, items]);
  const [selectionRequest, setSelectionRequest] = React.useState<{ id: CardSelectionActionId; flag?: number; nonce: number } | null>(null);
  // Keys of the card list (KV6): `/` searches; on a focused row ↑/↓ move, Enter opens, X selects, Escape clears the
  // selection, and the action keys open the confirmation of the selection or of the focused card. Dialogs, menus, the
  // editor and text fields keep their own keys; browser shortcuts stay untouched.
  const handleListKey = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (target?.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]') || document.querySelector('[aria-modal="true"]')) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() !== "z" || event.shiftKey || !lastUndoRef.current) return;
      event.preventDefault();
      lastUndoRef.current();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('input[aria-label="Karten durchsuchen"]')?.focus();
      return;
    }
    if (event.key === "Escape" && selecting) {
      event.preventDefault();
      clearSelection();
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
      toggleCheck(cardId, event.shiftKey);
      return;
    }
    const entry = [...hitList.rowsByIndex.values()].find((row) => row.id === cardId)?.entry;
    const request: { id: CardSelectionActionId; flag?: number } | null = /^[1-7]$/.test(key) ? { id: "flag", flag: Number(key) }
      : key === "0" ? { id: "flag-remove" }
        : key === "m" ? { id: entry?.marked ? "unmark" : "mark" }
          : key === "a" ? { id: entry && !entry.reviewable ? "unsuspend" : "suspend" }
            : key === "s" ? { id: "deck" }
              : key === "t" ? { id: "tags-add" }
                : event.key === "Delete" ? { id: "delete" } : null;
    if (!request) return;
    event.preventDefault();
    // Without a selection the action takes the focused card.
    if (!selecting || (!allHits && !checkedIds.size)) {
      setSelecting(true);
      setAllHits(false);
      setCheckedIds(new Set([cardId]));
    }
    keyActionRowRef.current = cardId;
    setSelectionRequest({ ...request, nonce: Date.now() });
  });
  React.useEffect(() => {
    window.addEventListener("keydown", handleListKey);
    return () => window.removeEventListener("keydown", handleListKey);
  }, [handleListKey]);
  return { selecting, setSelecting, checkedIds, allHits, setAllHits, clearSelection, toggleCheck: stableToggleCheck, selectionCount, selectionRequest, lastUndoRef, keyActionRowRef, setFocusRowAfterAction };
}
