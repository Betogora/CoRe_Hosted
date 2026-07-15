import assert from "node:assert/strict";
import test from "node:test";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { Deck, MediaAssetReference } from "./coreTypes.ts";
import type { AccountMediaStore, MediaSyncResult } from "./mediaStore.ts";

const originalReference = { name: "old.png" } as unknown as MediaAssetReference;
const cloudReference = { name: "new.png" } as unknown as MediaAssetReference;
const deck = { id: "deck-1", mediaAssets: [originalReference] } as Deck;
const state = { decks: [deck] } as unknown as WorkspaceState;

test("media retry lifecycle persists cloud references and stops on cleanup", async () => {
  let onStatus: ((result: MediaSyncResult) => void) | undefined;
  let stopped = false;
  const persisted: Deck[][] = [];
  const mediaStore = {
    startRetryLifecycle(options: { onStatus?(result: MediaSyncResult): void }) {
      onStatus = options.onStatus;
      return { async retry() {}, stop() { stopped = true; } };
    },
  } as unknown as AccountMediaStore;

  const cleanup = startAppMediaRetryLifecycle({
    mediaStore,
    getState: () => state,
    async ensureCloudParents() {},
    async persistMediaDecks(decks) { persisted.push(decks); },
  });
  onStatus?.({
    status: "cloud-ready",
    referencesByDeck: new Map([[deck.id, [cloudReference]]]),
    progress: { completed: 1, total: 1, uploaded: 1, reused: 0, currentName: "new.png" },
    message: "Medien synchronisiert.",
  });
  await Promise.resolve();

  assert.deepEqual(persisted[0]?.[0]?.mediaAssets, [cloudReference]);
  cleanup();
  assert.equal(stopped, true);

  onStatus?.({
    status: "cloud-ready",
    referencesByDeck: new Map([[deck.id, [originalReference]]]),
    progress: { completed: 1, total: 1, uploaded: 0, reused: 1, currentName: "old.png" },
    message: "Verspätetes Ergebnis.",
  });
  assert.equal(persisted.length, 1);
});
