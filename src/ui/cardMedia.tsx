import React from "react";
import { createAccountMediaStore, resolveCardHtmlMedia } from "../mediaStore.ts";
import type { Deck } from "../coreTypes.ts";

type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;

export function useDeckMediaUrls(deck: Deck | null | undefined, mediaStore?: AccountMediaStore | null) {
  const [mediaState, setMediaState] = React.useState<{ urls: Record<string, string>; missing: Array<{ name: string; status: string }> }>({ urls: {}, missing: [] });

  React.useEffect(() => {
    let cancelled = false;
    let revoke = () => {};
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    setMediaState({ urls: {}, missing: [] });
    if (!deck || !mediaStore) return;

    const resolve = async () => {
      const result = await mediaStore.resolveDeckMedia(deck);
      if (cancelled) { result.revoke(); return; }
      revoke(); revoke = result.revoke;
      setMediaState({ urls: result.urls, missing: result.missing });
      if (result.refreshAfterMs) refreshTimer = setTimeout(() => { void resolve(); }, result.refreshAfterMs);
    };
    void resolve();
    return () => { cancelled = true; if (refreshTimer) clearTimeout(refreshTimer); revoke(); };
  }, [deck, mediaStore]);

  return mediaState;
}

export function CardHtml({ html, mediaUrls = {} }: { html?: string; mediaUrls?: Record<string, string> }) {
  const renderedHtml = React.useMemo(() => resolveCardHtmlMedia(html || "<span></span>", mediaUrls), [html, mediaUrls]);
  return <div className="card-html min-w-0 max-w-full overflow-x-auto text-sm leading-6 text-inherit" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}
