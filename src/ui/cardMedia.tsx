import React from "react";
import type { AccountMediaStore } from "../mediaStore.ts";

interface NoteMediaState {
  urls: Record<string, string>;
  missing: Array<{ name: string; status: string }>;
}
type ResolvedMedia = Awaited<ReturnType<AccountMediaStore["resolveMedia"]>>;
interface MediaEntry { promise: Promise<ResolvedMedia>; value?: ResolvedMedia; holders: number; releaseTimer?: ReturnType<typeof setTimeout> }

const EMPTY_MEDIA: NoteMediaState = { urls: {}, missing: [] };
// Shared per store and media set: the current card and prefetched upcoming cards resolve each file once, and a card
// that becomes current finds its blob URLs ready. URLs are revoked shortly after the last holder lets go.
const mediaCache = new WeakMap<AccountMediaStore, Map<string, MediaEntry>>();
const RELEASE_DELAY_MS = 5000;

const mediaSignature = (media: Record<string, string> | null | undefined) =>
  media && Object.keys(media).length ? JSON.stringify(Object.entries(media).sort(([left], [right]) => left.localeCompare(right))) : "";

function acquireMedia(mediaStore: AccountMediaStore, signature: string): MediaEntry {
  let entries = mediaCache.get(mediaStore);
  if (!entries) mediaCache.set(mediaStore, entries = new Map());
  let entry = entries.get(signature);
  if (!entry) {
    const created: MediaEntry = { promise: mediaStore.resolveMedia(Object.fromEntries(JSON.parse(signature))), holders: 0 };
    created.promise.then((value) => { created.value = value; }, () => entries.delete(signature));
    entries.set(signature, entry = created);
  }
  clearTimeout(entry.releaseTimer);
  entry.holders += 1;
  return entry;
}

function releaseMedia(mediaStore: AccountMediaStore, signature: string) {
  const entries = mediaCache.get(mediaStore);
  const entry = entries?.get(signature);
  if (!entries || !entry || --entry.holders > 0) return;
  entry.releaseTimer = setTimeout(() => {
    if (entry.holders > 0) return;
    entries.delete(signature);
    void entry.promise.then((value) => value.revoke(), () => undefined);
  }, RELEASE_DELAY_MS);
}

/** Local blob URLs for the media a content references by name; prefetched media are available on the first render. */
export function useNoteMediaUrls(media: Record<string, string> | null | undefined, mediaStore?: AccountMediaStore | null): NoteMediaState {
  const signature = mediaSignature(media);
  const [resolved, setResolved] = React.useState<{ signature: string; state: NoteMediaState } | null>(null);

  React.useEffect(() => {
    if (!mediaStore || !signature) return undefined;
    let active = true;
    const entry = acquireMedia(mediaStore, signature);
    entry.promise.then((value) => { if (active) setResolved({ signature, state: { urls: value.urls, missing: value.missing } }); }, () => undefined);
    return () => { active = false; releaseMedia(mediaStore, signature); };
  }, [mediaStore, signature]);

  if (!mediaStore || !signature) return EMPTY_MEDIA;
  if (resolved?.signature === signature) return resolved.state;
  return mediaCache.get(mediaStore)?.get(signature)?.value ?? EMPTY_MEDIA;
}

/** Resolves the media of upcoming cards ahead, so they are not downloaded while the card appears. */
export function useNoteMediaPrefetch(mediaSets: ReadonlyArray<Record<string, string> | null | undefined>, mediaStore?: AccountMediaStore | null) {
  const signatures = [...new Set(mediaSets.map(mediaSignature).filter(Boolean))].sort().join("\n");
  React.useEffect(() => {
    if (!mediaStore || !signatures) return undefined;
    const held = signatures.split("\n");
    for (const signature of held) void acquireMedia(mediaStore, signature).promise.catch(() => undefined);
    return () => { for (const signature of held) releaseMedia(mediaStore, signature); };
  }, [mediaStore, signatures]);
}
