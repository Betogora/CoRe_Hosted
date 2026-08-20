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

test("workspace deck creation keeps sibling names unique and limits nesting", () => {
  const root = createWorkspaceDeck([], { name: "Biologie" });
  assert.ok(root);
  const sibling = createWorkspaceDeck([root], { name: "Biologie" });
  assert.equal(sibling?.name, "Biologie+");
  const child = createWorkspaceDeck([root, sibling!], { name: "Zellen", parentDeckId: root.id });
  const grandchild = createWorkspaceDeck([root, sibling!, child!], { name: "Kern", parentDeckId: child!.id });
  const fourth = createWorkspaceDeck([root, sibling!, child!, grandchild!], { name: "DNA", parentDeckId: grandchild!.id });
  const rejected = createWorkspaceDeck([root, sibling!, child!, grandchild!, fourth!], { name: "Gen", parentDeckId: fourth!.id });

  assert.ok(fourth);
  assert.equal(rejected, null);
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
