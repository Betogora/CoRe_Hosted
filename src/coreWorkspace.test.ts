import assert from "node:assert/strict";
import test from "node:test";
import { createCoreDeck } from "./coreModel.ts";
import {
  createDeckPlacementValidator,
  createWorkspaceDeck,
  restoreSoftDeletedCard,
  softDeleteCard,
  updateDeckTreePlacement,
} from "./coreWorkspace.ts";

function createDeckChain(length: number, prefix = "level") {
  return Array.from({ length }, (_, index) => createCoreDeck({
    id: `${prefix}-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `${prefix}-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "manual",
    cards: [],
  }));
}

test("workspace deck creation keeps sibling names unique without a logical depth limit", () => {
  const root = createWorkspaceDeck([], { name: "Biologie" });
  assert.ok(root);
  const sibling = createWorkspaceDeck([root], { name: "Biologie" });
  assert.equal(sibling?.name, "Biologie+");
  const levels = [root];
  for (let level = 2; level <= 12; level += 1) {
    const deck = createWorkspaceDeck([...levels, sibling!], { name: `Ebene ${level}`, parentDeckId: levels.at(-1)!.id });
    assert.ok(deck);
    levels.push(deck!);
  }

  assert.equal(levels.at(-1)?.hierarchyPath.length, 12);
  assert.equal(createWorkspaceDeck([...levels, sibling!], { name: "Ohne Ziel", parentDeckId: "missing" }), null);
});

test("deck tree placement moves a complete subtree to any depth and back to the main level", () => {
  const chain = createDeckChain(12);
  const movedRoot = createCoreDeck({ id: "moved-root", name: "Verschieben", source: "manual", cards: [] });
  const movedChild = createCoreDeck({ id: "moved-child", parentDeckId: movedRoot.id, name: "Kind", hierarchyPath: ["Verschieben", "Kind"], source: "manual", cards: [] });
  const movedGrandchild = createCoreDeck({ id: "moved-grandchild", parentDeckId: movedChild.id, name: "Enkel", hierarchyPath: ["Verschieben", "Kind", "Enkel"], source: "manual", cards: [] });
  const decks = [...chain, movedRoot, movedChild, movedGrandchild];

  const moved = updateDeckTreePlacement({ decks }, {
    deckId: movedRoot.id,
    parentDeckId: chain.at(-1)!.id,
    changeType: "deck_moved",
    reason: "Test",
  });

  assert.equal(moved.ok, true);
  assert.deepEqual(moved.nextDecks?.find((deck) => deck.id === movedRoot.id)?.hierarchyPath, [...chain.at(-1)!.hierarchyPath, "Verschieben"]);
  assert.deepEqual(moved.nextDecks?.find((deck) => deck.id === movedGrandchild.id)?.hierarchyPath, [...chain.at(-1)!.hierarchyPath, "Verschieben", "Kind", "Enkel"]);
  assert.deepEqual(new Set(moved.changedDeckIds), new Set([movedRoot.id, movedChild.id, movedGrandchild.id]));

  const restored = updateDeckTreePlacement({ decks: moved.nextDecks! }, {
    deckId: movedRoot.id,
    parentDeckId: null,
    changeType: "deck_moved",
    reason: "Test",
  });

  assert.equal(restored.deck?.parentDeckId, null);
  assert.deepEqual(restored.nextDecks?.find((deck) => deck.id === movedGrandchild.id)?.hierarchyPath, ["Verschieben", "Kind", "Enkel"]);
});

test("deck tree placement validates missing targets, no-op, self reference, and descendant cycles", () => {
  const [root, child] = createDeckChain(2);
  const decks = [root, child];
  const validate = createDeckPlacementValidator(decks, root.id);

  assert.equal(createDeckPlacementValidator(decks, "missing")(null), "Stapel nicht gefunden.");
  assert.equal(validate("missing"), "Zielstapel nicht gefunden.");
  assert.match(validate(root.id) ?? "", /sich selbst/);
  assert.match(validate(child.id) ?? "", /eigenen Unterstapel/);
  assert.equal(createDeckPlacementValidator(decks, child.id)(root.id), null);
  const unchanged = updateDeckTreePlacement({ decks }, {
    deckId: child.id,
    parentDeckId: root.id,
    changeType: "deck_moved",
    reason: "Test",
  });
  assert.equal(unchanged.ok, true);
  assert.deepEqual(unchanged.changedDeckIds, []);
});

test("deck tree placement keeps sibling names unique and updates descendant paths", () => {
  const target = createCoreDeck({ id: "target", name: "Ziel", source: "manual", cards: [] });
  const existing = createCoreDeck({ id: "existing", name: "Thema", parentDeckId: target.id, hierarchyPath: ["Ziel", "Thema"], source: "manual", cards: [] });
  const moved = createCoreDeck({ id: "moved", name: "Thema", source: "manual", cards: [] });
  const child = createCoreDeck({ id: "child", name: "Kind", parentDeckId: moved.id, hierarchyPath: ["Thema", "Kind"], source: "manual", cards: [] });
  const result = updateDeckTreePlacement({ decks: [target, existing, moved, child] }, {
    deckId: moved.id,
    parentDeckId: target.id,
    changeType: "deck_moved",
    reason: "Test",
  });

  assert.equal(result.deck?.name, "Thema+");
  assert.deepEqual(result.deck?.hierarchyPath, ["Ziel", "Thema+"]);
  assert.deepEqual(result.nextDecks?.find((deck) => deck.id === child.id)?.hierarchyPath, ["Ziel", "Thema+", "Kind"]);
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
