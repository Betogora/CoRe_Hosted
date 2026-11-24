import React from "react";
import { hitStudyQuery } from "../../hitStudySession.ts";
import type { CardTableSort } from "../../libraryModel.ts";
import { useStableCallback } from "../../ui/useStableCallback.ts";
import { emptyCardSelection, isCardChecked, reduceCardSelection, selectedCardIds, selectedStudyIds, selectionCount, type CardSelectionRequest, type HitRows } from "./cardSelectionModel.ts";

export type CardSelectionState = ReturnType<typeof useCardSelection>;

export function useCardSelection({ canSelect, hitList, deferredQuery, hitScope, cardSort, listHitIds }: {
  canSelect: boolean;
  hitList: { rowsByIndex: HitRows; totalCardCount: number };
  deferredQuery: string;
  hitScope: readonly string[];
  cardSort: CardTableSort;
  /** Every hit of a search in the selection's decks; absent where the list cannot name them. */
  listHitIds: ((query: string, sort?: CardTableSort) => Promise<string[]>) | undefined;
}) {
  // The scope compares by its decks: a sync renews the deck list without changing it.
  const scope = `${deferredQuery}\n${hitScope.join("\n")}`;
  const [selection, dispatch] = React.useReducer(reduceCardSelection, scope, emptyCardSelection);
  // Emptied while rendering the new scope, so no render shows it with the old selection.
  if (selection.scope !== scope) dispatch({ type: "scope", scope });
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  /**
   * Selects the loaded cards and returns their number; null when a new search or scope came first, which selects
   * nothing. No card ends the selection.
   */
  const selectLoadedCards = React.useCallback(async (load: () => Promise<readonly string[]>) => {
    const loadedFor = scopeRef.current;
    const ids = await load();
    if (loadedFor !== scopeRef.current) return null;
    dispatch({ type: "select", ids });
    return ids.length;
  }, []);
  const toggle = useStableCallback((cardId: string, range: boolean) => {
    if (canSelect) dispatch({ type: "toggle", cardId, range, rows: hitList.rowsByIndex });
  });
  const requestAction = React.useCallback((cardId: string, request: Omit<CardSelectionRequest, "nonce">) => {
    dispatch({ type: "key-action", cardId, request: { ...request, nonce: Date.now() } });
  }, []);
  const resolveSelectedIds = useStableCallback(() => selectedCardIds(selection, listHitIds && (() => listHitIds(deferredQuery))));
  /** Studyable hits in list order; `onlySelection` narrows them to the selection. */
  const idsForStudy = useStableCallback(async (onlySelection: boolean) => {
    const ids = await listHitIds!(hitStudyQuery(deferredQuery), cardSort);
    return onlySelection ? selectedStudyIds(selection, ids) : ids;
  });
  return {
    selecting: selection.selecting,
    allHits: selection.allHits,
    count: selectionCount(selection, hitList.totalCardCount),
    request: selection.request,
    isChecked: (cardId: string) => isCardChecked(selection, cardId),
    start: React.useCallback(() => dispatch({ type: "start" }), []),
    toggle,
    selectAllHits: React.useCallback(() => dispatch({ type: "all-hits" }), []),
    clear: React.useCallback(() => dispatch({ type: "clear" }), []),
    requestAction,
    selectLoadedCards,
    resolveSelectedIds,
    idsForStudy,
  };
}
