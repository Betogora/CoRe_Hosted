import React from "react";
import { resolvePresentationMedia } from "../cardPresentationFrame.ts";
import type { AccountMediaStore } from "../mediaStore.ts";

interface NoteMediaState {
  urls: Record<string, string>;
  missing: Array<{ name: string; status: string }>;
}

/** Local blob URLs for the media a content references by name; they are revoked when the content changes. */
export function useNoteMediaUrls(media: Record<string, string> | null | undefined, mediaStore?: AccountMediaStore | null): NoteMediaState {
  const [state, setState] = React.useState<NoteMediaState>({ urls: {}, missing: [] });
  const signature = media ? JSON.stringify(Object.entries(media).sort(([left], [right]) => left.localeCompare(right))) : "";

  React.useEffect(() => {
    let cancelled = false;
    let revoke = () => {};
    setState({ urls: {}, missing: [] });
    const current: Record<string, string> = signature ? Object.fromEntries(JSON.parse(signature)) : {};
    if (!mediaStore || !Object.keys(current).length) return;
    void mediaStore.resolveMedia(current).then((result) => {
      if (cancelled) { result.revoke(); return; }
      revoke = result.revoke;
      setState({ urls: result.urls, missing: result.missing });
    }).catch(() => undefined);
    return () => { cancelled = true; revoke(); };
  }, [mediaStore, signature]);

  return state;
}

export function CardHtml({ html, mediaUrls = {} }: { html?: string; mediaUrls?: Record<string, string> }) {
  const renderedHtml = React.useMemo(() => resolvePresentationMedia(html || "<span></span>", mediaUrls), [html, mediaUrls]);
  return <div className="card-html min-w-0 max-w-full overflow-x-auto core-body leading-6 text-inherit" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}
