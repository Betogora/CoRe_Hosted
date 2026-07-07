import React from "react";
import { createDeckMediaUrlMap, resolveCardHtmlMedia } from "../mediaStore.js";

function createMediaSignature(deck) {
  return (deck?.importMeta?.mediaManifest?.assets ?? []).map((asset) => asset.sha1).join("|");
}

export function useDeckMediaUrls(deck) {
  const [mediaState, setMediaState] = React.useState({ urls: {}, missing: [] });
  const signature = createMediaSignature(deck);

  React.useEffect(() => {
    let cancelled = false;
    let revokeUrls = () => {};

    setMediaState({ urls: {}, missing: [] });
    if (!deck?.importMeta?.mediaManifest?.assets?.length) return () => {};

    void createDeckMediaUrlMap(deck).then((result) => {
      if (cancelled) {
        result.revoke();
        return;
      }

      revokeUrls = result.revoke;
      setMediaState({ urls: result.urls, missing: result.missing });
    });

    return () => {
      cancelled = true;
      revokeUrls();
    };
  }, [deck?.id, signature]);

  return mediaState;
}

export function CardHtml({ html, mediaUrls = {} }) {
  const renderedHtml = React.useMemo(() => resolveCardHtmlMedia(html || "<span></span>", mediaUrls), [html, mediaUrls]);

  return (
    <div
      className="card-html min-w-0 max-w-full overflow-x-auto text-sm leading-6 text-inherit"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
