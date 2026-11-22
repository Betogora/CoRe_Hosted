import React from "react";
import type { CardSelectionActionId } from "./CardSelectionBar.tsx";
import { useStableCallback } from "../../ui/useStableCallback.ts";
import type { useCardSearch } from "./useCardSearch.ts";

type CardSearch = ReturnType<typeof useCardSearch>;

export function useCardSelection({ canSelect, hitList, items, cardItems, rowOf, locateCard, deferredQuery, hitScope }: Pick<CardSearch, "hitList" | "items" | "cardItems" | "rowOf" | "locateCard" | "deferredQuery" | "hitScope"> & {
  canSelect: boolean;
}) {
  const [selecting, setSelecting] = React.useState(false);
  const [checkedIds, setCheckedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [allHits, setAllHits] = React.useState(false);
  const selectionAnchorRef = React.useRef<number | null>(null);
  // An action asked for by a key; it ends with the selection, so a new selection never reopens its dialog.
  const [selectionRequest, setSelectionRequest] = React.useState<{ id: CardSelectionActionId; flag?: number; nonce: number } | null>(null);
  const clearSelection = React.useCallback(() => {
    setSelecting(false);
    setSelectionRequest(null);
    setCheckedIds(new Set());
    setAllHits(false);
    selectionAnchorRef.current = null;
  }, []);
  // The scope compares by its decks: a sync renews the deck list without changing it.
  const hitScopeKey = hitScope.join("\n");
  const shownHitsRef = React.useRef("");
  shownHitsRef.current = `${deferredQuery}\n${hitScopeKey}`;
  /**
   * Selects the loaded cards and returns their number; null when a new search or scope came first, which selects
   * nothing. No card ends the selection.
   */
  const selectLoadedCards = React.useCallback(async (load: () => Promise<readonly string[]>) => {
    const hits = shownHitsRef.current;
    const ids = await load();
    if (hits !== shownHitsRef.current) return null;
    setSelectionRequest(null);
    setAllHits(false);
    setCheckedIds(new Set(ids));
    setSelecting(ids.length > 0);
    selectionAnchorRef.current = null;
    return ids.length;
  }, []);
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
  const keyActionRowRef = React.useRef<string | null>(null);
  const [focusRowAfterAction, setFocusRowAfterAction] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusRowAfterAction) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="deck-card-${CSS.escape(focusRowAfterAction)}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    setFocusRowAfterAction(null);
  }, [focusRowAfterAction, items]);
  const handleListKey = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    // Text entry keeps its keys; a checkbox (the header's or a row's) leaves Escape, `/` and undo to the list.
    if (target && (target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName) || (target instanceof HTMLInputElement && target.type !== "checkbox"))) return;
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
  return { selecting, setSelecting, checkedIds, allHits, setAllHits, clearSelection, selectLoadedCards, toggleCheck: stableToggleCheck, selectionCount, selectionRequest, lastUndoRef, keyActionRowRef, setFocusRowAfterAction };
}
