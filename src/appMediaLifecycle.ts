import type { WorkspaceState } from "./coreWorkspace.ts";
import type { Deck } from "./coreTypes.ts";
import type { AccountMediaStore } from "./mediaStore.ts";

interface MediaRetryLifecycleOptions {
  mediaStore: AccountMediaStore;
  getState: () => WorkspaceState | null;
  ensureCloudParents: () => Promise<unknown>;
  persistMediaDecks: (decks: Deck[]) => Promise<unknown>;
}

export function startAppMediaRetryLifecycle({
  mediaStore,
  getState,
  ensureCloudParents,
  persistMediaDecks,
}: MediaRetryLifecycleOptions): () => void {
  let active = true;
  const lifecycle = mediaStore.startRetryLifecycle({
    getDecks: () => getState()?.decks ?? [],
    ensureCloudParents,
    onStatus(result) {
      if (!active || result.status !== "cloud-ready" || result.referencesByDeck.size === 0) return;
      const changed = (getState()?.decks ?? [])
        .filter((deck) => result.referencesByDeck.has(deck.id))
        .map((deck) => ({ ...deck, mediaAssets: result.referencesByDeck.get(deck.id) ?? deck.mediaAssets }));
      void persistMediaDecks(changed);
    },
  });
  return () => {
    active = false;
    lifecycle.stop();
  };
}
