import assert from "node:assert/strict";
import test from "node:test";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import type { AccountMediaStore, MediaSyncResult, MediaSyncStatus } from "./mediaStore.ts";

function syncResult(status: MediaSyncStatus): MediaSyncResult {
  return { status, progress: { completed: 1, total: 1, uploaded: 1, reused: 0, currentName: "bild.png", processedBytes: 4, totalBytes: 4 }, message: "Medien synchronisiert." };
}

function fakeMediaStore({ failRelease = false } = {}) {
  let onStatus: ((result: MediaSyncResult) => void) | undefined;
  let ensureCloudParents: (() => Promise<unknown>) | undefined;
  const calls = { releases: 0, stopped: 0 };
  const mediaStore = {
    startRetryLifecycle(options: { ensureCloudParents(): Promise<unknown>; onStatus?(result: MediaSyncResult): void }) {
      onStatus = options.onStatus;
      ensureCloudParents = options.ensureCloudParents;
      return { async retry() {}, stop() { calls.stopped += 1; } };
    },
    async releaseUnreferencedMedia() {
      calls.releases += 1;
      if (failRelease) throw new Error("storage down");
      return 0;
    },
  } as unknown as AccountMediaStore;
  return { mediaStore, calls, emit: (result: MediaSyncResult) => onStatus?.(result), ensureCloudParents: () => ensureCloudParents?.() };
}

test("Medien-Lebenszyklus gibt beim Start und nach Cloud-Bereitschaft unreferenzierte Medien frei", async () => {
  const store = fakeMediaStore();
  let parentChecks = 0;
  const cleanup = startAppMediaRetryLifecycle({ mediaStore: store.mediaStore, async ensureCloudParents() { parentChecks += 1; } });
  assert.equal(store.calls.releases, 1);

  await store.ensureCloudParents();
  assert.equal(parentChecks, 1);

  for (const status of ["local-pending", "partial", "paused", "cancelled", "blocked"] as const) store.emit(syncResult(status));
  assert.equal(store.calls.releases, 1);

  store.emit(syncResult("cloud-ready"));
  assert.equal(store.calls.releases, 2);
  cleanup();
});

test("Medien-Lebenszyklus stoppt beim Aufräumen und ignoriert verspätete Ergebnisse", () => {
  const store = fakeMediaStore();
  const cleanup = startAppMediaRetryLifecycle({ mediaStore: store.mediaStore, async ensureCloudParents() {} });
  cleanup();
  assert.equal(store.calls.stopped, 1);

  store.emit(syncResult("cloud-ready"));
  assert.equal(store.calls.releases, 1);
});

test("fehlgeschlagene Medienfreigabe bleibt ohne unbehandelte Ablehnung", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const store = fakeMediaStore({ failRelease: true });
    const cleanup = startAppMediaRetryLifecycle({ mediaStore: store.mediaStore, async ensureCloudParents() {} });
    store.emit(syncResult("cloud-ready"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.calls.releases, 2);
    assert.deepEqual(unhandled, []);
    cleanup();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
