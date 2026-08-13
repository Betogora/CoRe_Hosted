import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";

function state(decks: any[]) {
  return {
    version: 4,
    profile: { userId: "user-1" },
    decks,
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: [],
    updatedAt: "2026-08-11T00:00:00.000Z",
  } as any;
}

test("plant einen Restore mit der bestätigten Tombstone-Revision", () => {
  const restoredDeck = createCoreDeck({ id: "deck-restored", name: "Wiederhergestellt", source: "manual", cards: [] });
  const previous = {
    ...state([]),
    cloudTombstones: [{
      entityTable: "decks",
      entityId: restoredDeck.id,
      revision: 7,
      deletedAt: "2026-08-11T01:00:00.000Z",
      updatedByDeviceId: "device-a",
    }],
  };
  const mutation = planEntityMutations({ tombstones: previous.cloudTombstones }, { decks: [{ ...restoredDeck, revision: 7, deletedAt: null }] })
    .find((candidate) => candidate.table === "decks");

  assert.ok(mutation);
  assert.equal(mutation.baseRevision, 7);
  assert.equal(mutation.payload.baseRevision, 7);
  assert.equal(mutation.payload.entity.deletedAt, null);
  assert.equal(mutation.payload.tombstone, undefined);
});

test("plant eine Kartenänderung ohne vollständigen Workspace im Outbox-Payload", () => {
  const card = createBasicLearningItem("deck-1", "Frage", "Antwort", { id: "card-1" });
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [card] });
  const nextCard = { ...card, originalFront: "Neu", updatedAt: "2026-08-11T01:00:00.000Z" };
  const nextDeck = { ...deck, cards: [nextCard] };
  const mutations = planEntityMutations({ decks: [deck] }, { decks: [nextDeck] });
  const cardMutation = mutations.find((mutation) => mutation.table === "cards");
  assert.ok(cardMutation);
  assert.equal(cardMutation.payload.entity.id, "card-1");
  assert.equal("variants" in cardMutation.payload.entity, false);
  assert.equal("state" in cardMutation.payload, false);
  assert.equal(mutations.some((mutation) => mutation.table === "decks"), false);
});

test("plant abhängige Löschungen vor dem Deck-Tombstone", () => {
  const card = createBasicLearningItem("deck-1", "Frage", "Antwort", { id: "card-1" });
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [card] });
  const mutations = planEntityMutations({ decks: [deck] }, { decks: [] });
  assert.equal(mutations.at(-1)?.table, "decks");
  assert.equal(mutations.some((mutation) => mutation.table === "cards" && mutation.payload.tombstone), true);
});

test("plans note type definitions before cards that reference them", () => {
  const card = {
    ...createBasicLearningItem("deck-1", "Frage", "Antwort", { id: "card-1" }),
    noteTypeDefinitionId: "note-type-1",
  };
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [card] });
  const previous = state([]);
  const next = state([deck]);
  next.noteTypeDefinitions = [{
    id: "note-type-1",
    revision: 1,
    updatedAt: "2026-08-11T00:00:00.000Z",
  }];

  const mutations = planEntityMutations({}, { decks: next.decks, noteTypeDefinitions: next.noteTypeDefinitions });
  const definitionIndex = mutations.findIndex((mutation) => mutation.table === "note_type_definitions");
  const cardIndex = mutations.findIndex((mutation) => mutation.table === "cards");
  assert.ok(definitionIndex >= 0);
  assert.ok(cardIndex > definitionIndex);
});

test("plant source snapshots as FK-safe entity mutations without a full state payload", () => {
  const card = {
    ...createBasicLearningItem("deck-1", "Frage", "Antwort", { id: "card-1" }),
    latestSourceSnapshotId: "snapshot-1",
  };
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [card] });
  const previous = state([]);
  const next = state([deck]);
  next.learningItemSourceSnapshots = [{
    id: "snapshot-1",
    sourceKind: "csv",
    previousSnapshotId: null,
    definitionVersionId: null,
    sourcePayload: {},
    createdAt: "2026-08-11T00:00:00.000Z",
  }];

  const mutations = planEntityMutations({}, { decks: next.decks, sourceSnapshots: next.learningItemSourceSnapshots });
  const cardMutation = mutations.find((mutation) => mutation.table === "cards");
  const snapshotMutation = mutations.find((mutation) => mutation.table === "learning_item_source_snapshots");
  assert.ok(cardMutation);
  assert.equal(cardMutation.payload.entity.latestSourceSnapshotId, null, "FK-Pointer wird erst nach dem Snapshot gesetzt");
  assert.ok(snapshotMutation);
  assert.equal(snapshotMutation.payload.cardId, "card-1");
  assert.equal(snapshotMutation.payload.attachToCard, true);
  assert.equal(mutations.some((mutation) => mutation.type === "state-patch"), false);
  assert.equal(mutations.some((mutation) => "state" in mutation.payload), false);
});
