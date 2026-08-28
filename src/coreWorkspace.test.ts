import assert from "node:assert/strict";
import test from "node:test";
import { createCoreDeck } from "./coreModel.ts";
import {
  createDeckPlacementValidator,
  createWorkspaceDeck,
  DECK_DEPTH_ERROR,
  restoreSoftDeletedCard,
  softDeleteCard,
  updateDeckTreePlacement,
} from "./coreWorkspace.ts";

test("workspace deck creation keeps sibling names unique and limits nesting", () => {
  const root = createWorkspaceDeck([], { name: "Biologie" });
  assert.ok(root);
  const sibling = createWorkspaceDeck([root], { name: "Biologie" });
  assert.equal(sibling?.name, "Biologie+");
  const levels = [root];
  for (let level = 2; level <= 8; level += 1) {
    const deck = createWorkspaceDeck([...levels, sibling!], { name: `Ebene ${level}`, parentDeckId: levels.at(-1)!.id });
    assert.ok(deck);
    levels.push(deck);
  }
  const rejected = createWorkspaceDeck([...levels, sibling!], { name: "Ebene 9", parentDeckId: levels.at(-1)!.id });

  assert.equal(rejected, null);
});

test("deck tree placement rejects a subtree that would reach level nine", () => {
  const chain = Array.from({ length: 7 }, (_, index) => createCoreDeck({
    id: `level-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `level-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "manual",
    cards: [],
  }));
  const movedRoot = createCoreDeck({ id: "moved-root", name: "Verschieben", source: "manual", cards: [] });
  const movedChild = createCoreDeck({ id: "moved-child", parentDeckId: movedRoot.id, name: "Kind", hierarchyPath: ["Verschieben", "Kind"], source: "manual", cards: [] });

  assert.match(createDeckPlacementValidator([...chain, movedRoot, movedChild], movedRoot.id)(chain.at(-1)!.id) ?? "", /acht Stapel-Ebenen/);
});

test("deck tree placement no longer permits a still-too-deep legacy relocation", () => {
  const chain = Array.from({ length: 10 }, (_, index) => createCoreDeck({
    id: `legacy-level-${index + 1}`,
    name: `Legacy-Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `legacy-level-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Legacy-Ebene ${pathIndex + 1}`),
    source: "anki-apkg",
    cards: [],
  }));

  assert.equal(createDeckPlacementValidator(chain, "legacy-level-2")(null), DECK_DEPTH_ERROR);
});

test("deck tree placement renames descendants and rejects cycles", () => {
  const root = createCoreDeck({ id: "root", name: "Alt", source: "manual", hierarchyPath: ["Alt"], cards: [] });
  const child = createCoreDeck({ id: "child", name: "Kind", source: "manual", parentDeckId: root.id, hierarchyPath: ["Alt", "Kind"], cards: [] });
  const renamed = updateDeckTreePlacement({ decks: [root, child] }, {
    deckId: root.id,
    name: "Neu",
    changeType: "deck_renamed",
    reason: "Test",
  });

  assert.equal(renamed.ok, true);
  assert.deepEqual(renamed.nextDecks?.find((deck) => deck.id === child.id)?.hierarchyPath, ["Neu", "Kind"]);
  assert.match(createDeckPlacementValidator([root, child], root.id)(child.id) ?? "", /eigenen Unterstapel/);
});

test("soft delete and restore preserve the previous card status", () => {
  const card = createCoreDeck({ name: "Test", source: "manual", cards: [] }).cards[0] ?? {
    id: "card-1",
    status: "suspended",
    deletedAt: null,
    updatedAt: "2026-08-12T10:00:00.000Z",
  } as any;
  const deleted = softDeleteCard(card, "2026-08-12T11:00:00.000Z");
  const restored = restoreSoftDeletedCard(deleted, "2026-08-12T12:00:00.000Z", card.status);

  assert.equal(deleted.status, "deleted");
  assert.equal(restored.status, "suspended");
  assert.equal(restored.deletedAt, null);
});
