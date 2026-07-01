import assert from "node:assert/strict";
import test from "node:test";
import { createCoreRepository } from "./coreRepository.js";
import { createCoreWorkspace, createDemoAnatomyDeck } from "./coreWorkspace.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function createTestWorkspace() {
  return createCoreWorkspace(createCoreRepository(createMemoryStorage()));
}

test("workspace creates the demo deck behind one interface", () => {
  const workspace = createTestWorkspace();
  const demo = workspace.createDemoDeck();

  assert.equal(demo.name, "Demo / Anatomie");
  assert.equal(demo.cards.length, 2);
  assert.equal(workspace.getState().decks.length, 1);
  assert.equal(workspace.getState().decks[0].cards[0].coreState.isCoreReady, true);
});

test("workspace graph and community commands hide app orchestration", () => {
  const workspace = createTestWorkspace();
  const demo = workspace.createDemoDeck();
  const graphed = workspace.ensureDeckGraph(demo.id);
  const shared = workspace.shareDeckToDefaultCommunity(demo.id);

  assert.equal(graphed.graph.status, "ready");
  assert.equal(shared.community.sharedDecks.length, 1);
  assert.equal(shared.sharedRef.deckId, demo.id);
  assert.equal(workspace.getState().communities[0].sharedDecks[0].deckName, demo.name);
});

test("workspace updates all decks without React callers looping over repository state", () => {
  const workspace = createTestWorkspace();
  workspace.createDemoDeck();
  workspace.saveDeck(createDemoAnatomyDeck());

  const updated = workspace.updateAllDecks((deck) => ({
    ...deck,
    deckSettings: { ...deck.deckSettings, coreMode: "off" },
  }));

  assert.equal(updated.length, 2);
  assert.equal(workspace.getState().decks.every((deck) => deck.deckSettings.coreMode === "off"), true);
});
