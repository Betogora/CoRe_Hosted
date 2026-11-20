import type { AccountMediaStore } from "./mediaStore.ts";

interface MediaRetryLifecycleOptions {
  mediaStore: AccountMediaStore;
  ensureCloudParents: () => Promise<unknown>;
}

export function startAppMediaRetryLifecycle({ mediaStore, ensureCloudParents }: MediaRetryLifecycleOptions): () => void {
  let active = true;
  const lifecycle = mediaStore.startRetryLifecycle({
    ensureCloudParents,
    onStatus(result) {
      if (!active || result.status !== "cloud-ready") return;
      void mediaStore.releaseUnreferencedMedia().catch(() => undefined);
    },
  });
  void mediaStore.releaseUnreferencedMedia().catch(() => undefined);
  return () => {
    active = false;
    lifecycle.stop();
  };
}
