import React from "react";

export type DeckTreeView = "list" | "tiles";

const DECK_TREE_VIEW_STORAGE_KEY = "core.deckView.v1";
const DECK_TREE_VIEW_EVENT = "core:deck-tree-view";

function readStoredDeckTreeView(): DeckTreeView {
  if (typeof window === "undefined") return "list";
  try {
    return window.localStorage.getItem(DECK_TREE_VIEW_STORAGE_KEY) === "tiles" ? "tiles" : "list";
  } catch {
    return "list";
  }
}

/** One browser-local choice for every surface; a change reaches the other mounted surfaces at once. */
export function useStoredDeckTreeView() {
  const [view, setView] = React.useState(readStoredDeckTreeView);
  React.useEffect(() => {
    const follow = (event: Event) => setView((event as CustomEvent<DeckTreeView>).detail);
    window.addEventListener(DECK_TREE_VIEW_EVENT, follow);
    return () => window.removeEventListener(DECK_TREE_VIEW_EVENT, follow);
  }, []);
  const changeView = React.useCallback((next: DeckTreeView) => {
    setView(next);
    try {
      window.localStorage.setItem(DECK_TREE_VIEW_STORAGE_KEY, next);
    } catch {
      // Die Ansicht bleibt ohne browserlokale Speicherung umschaltbar.
    }
    window.dispatchEvent(new CustomEvent(DECK_TREE_VIEW_EVENT, { detail: next }));
  }, []);
  return [view, changeView] as const;
}
