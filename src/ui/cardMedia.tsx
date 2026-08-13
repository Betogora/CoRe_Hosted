import React from "react";
import { createAccountMediaStore, resolveCardHtmlMedia } from "../mediaStore.ts";
import type { Deck } from "../coreTypes.ts";

type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;

function mediaScopeSignature(deck: Deck | null | undefined, cardId: string | null) {
  if (!deck) return "";
  const card = cardId ? (deck.cards ?? []).find((candidate) => candidate.id === cardId) : null;
  if (cardId) return JSON.stringify([deck.id, cardId, card?.updatedAt ?? null, card?.mediaRefs ?? null]);
  return JSON.stringify([
    deck.id,
    (deck.mediaAssets ?? []).map((reference) => [reference.id, reference.updatedAt, reference.deletedAt]),
    deck.importMeta?.mediaManifest ?? null,
  ]);
}

function useMediaUrls(deck: Deck | null | undefined, cardId: string | null, mediaStore?: AccountMediaStore | null) {
  const [mediaState, setMediaState] = React.useState<{ urls: Record<string, string>; missing: Array<{ name: string; status: string }> }>({ urls: {}, missing: [] });
  const deckRef = React.useRef(deck);
  deckRef.current = deck;
  const signature = mediaScopeSignature(deck, cardId);

  React.useEffect(() => {
    let cancelled = false;
    let revoke = () => {};
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    setMediaState({ urls: {}, missing: [] });
    if (!deckRef.current || !mediaStore) return;

    const resolve = async () => {
      const currentDeck = deckRef.current;
      if (!currentDeck) return;
      const result = cardId
        ? await mediaStore.resolveCardMedia(currentDeck, cardId)
        : await mediaStore.resolveDeckMedia(currentDeck);
      if (cancelled) { result.revoke(); return; }
      revoke(); revoke = result.revoke;
      setMediaState({ urls: result.urls, missing: result.missing });
      if (result.refreshAfterMs) refreshTimer = setTimeout(() => { void resolve(); }, result.refreshAfterMs);
    };
    void resolve();
    return () => { cancelled = true; if (refreshTimer) clearTimeout(refreshTimer); revoke(); };
  }, [cardId, mediaStore, signature]);

  return mediaState;
}

export function useDeckMediaUrls(deck: Deck | null | undefined, mediaStore?: AccountMediaStore | null) {
  return useMediaUrls(deck, null, mediaStore);
}

export function useCardMediaUrls(deck: Deck | null | undefined, cardId: string | null | undefined, mediaStore?: AccountMediaStore | null) {
  return useMediaUrls(deck, cardId ?? null, mediaStore);
}

export function CardHtml({ html, mediaUrls = {} }: { html?: string; mediaUrls?: Record<string, string> }) {
  const renderedHtml = React.useMemo(() => resolveCardHtmlMedia(html || "<span></span>", mediaUrls), [html, mediaUrls]);
  return <div className="card-html min-w-0 max-w-full overflow-x-auto core-body leading-6 text-inherit" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}
