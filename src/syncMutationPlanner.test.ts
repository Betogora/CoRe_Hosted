import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createBasicNote, createCoreDeck, planNoteContentChange, planNoteDeletion, planNoteRestore, setCardSuspended } from "./coreModel.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";

const CREATED_AT = "2026-08-11T00:00:00.000Z";
const CHANGED_AT = "2026-08-11T01:00:00.000Z";

function graph() {
  const { note, cards } = createBasicNote("deck-1", "Frage", "Antwort", { reverse: true, createdAt: CREATED_AT });
  return { note, cards: cards.map((card, index) => ({ ...card, deckId: index === 0 ? "deck-1" : "deck-2" })) };
}

test("plant einen Restore mit der Revision des gelöschten Stands", () => {
  const original = graph();
  const deletion = planNoteDeletion(original.note, original.cards, CHANGED_AT);
  const restored = planNoteRestore(deletion.undo, deletion, "2026-08-11T02:00:00.000Z");
  const mutations = planEntityMutations(
    { notes: [deletion.note], cards: deletion.cards },
    { notes: [restored.note], cards: restored.cards },
  );
  const noteMutation = mutations.find((candidate) => candidate.table === "notes");

  assert.ok(noteMutation);
  assert.equal(noteMutation.baseRevision, 2);
  assert.equal(noteMutation.payload.baseRevision, 2);
  assert.equal(noteMutation.payload.entity.revision, 3);
  assert.equal(noteMutation.payload.entity.deletedAt, null);
  assert.equal(noteMutation.payload.tombstone, undefined);
  assert.deepEqual(mutations.filter((candidate) => candidate.table === "cards").map((candidate) => candidate.payload.entity.deletedAt), [null, null]);
});

test("plant eine Kartenänderung ohne vollständigen Workspace im Outbox-Payload", () => {
  const { note, cards } = graph();
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [cards[0]] });
  const suspended = setCardSuspended(cards[0], true, CHANGED_AT);
  const mutations = planEntityMutations({ decks: [deck], notes: [note], cards: [cards[0]] }, { decks: [deck], notes: [note], cards: [suspended] });
  const cardMutation = mutations.find((mutation) => mutation.table === "cards");

  assert.equal(mutations.length, 1);
  assert.ok(cardMutation);
  assert.equal(cardMutation.payload.entity.id, cards[0].id);
  assert.equal(cardMutation.payload.entity.status, "suspended");
  assert.equal(cardMutation.baseRevision, 1);
  assert.equal("variants" in cardMutation.payload.entity, false);
  assert.equal("state" in cardMutation.payload, false);
});

test("eine Inhaltsänderung erzeugt nur eine Inhaltsmutation, auch wenn Geschwister in anderen Stapeln liegen", () => {
  const previous = graph();
  const plan = planNoteContentChange(previous, {
    ...previous.note.content,
    fields: previous.note.content.fields.map((field) => field.id === "front" ? { ...field, html: "Neue Frage" } : field),
  }, CHANGED_AT);
  const mutations = planEntityMutations(
    { notes: [previous.note], cards: previous.cards },
    { notes: [plan.note], cards: [...plan.keptCards, ...plan.newCards] },
  );

  assert.deepEqual(mutations.map((mutation) => mutation.table), ["notes"]);
  assert.equal(mutations[0].payload.entity.contentRevision, 2);
  assert.equal(mutations[0].baseRevision, 1);
});

test("entfernte Entitäten werden zu Tombstones mit ihrer letzten Revision", () => {
  const { note, cards } = graph();
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [cards[0]] });
  const mutations = planEntityMutations({ decks: [deck], notes: [note], cards }, { decks: [], notes: [note], cards: [cards[1]] });

  assert.deepEqual(mutations.map((mutation) => `${mutation.table}:${mutation.entityId}`), ["decks:deck-1", `cards:${cards[0].id}`]);
  assert.equal(mutations.every((mutation) => mutation.payload.tombstone === true && mutation.baseRevision === 1), true);
});

test("plant Inhalte vor Karten und Karten vor ihren Varianten", () => {
  const { note, cards } = graph();
  const withVariant = addCardVariant(cards[0], { front: "Umformuliert", back: "Antwort" }, CREATED_AT);
  const deck = createCoreDeck({ id: "deck-1", name: "Test", source: "manual", cards: [withVariant] });

  const mutations = planEntityMutations({}, { decks: [deck], notes: [note], cards: [withVariant, cards[1]] });

  assert.deepEqual(mutations.map((mutation) => mutation.table), ["decks", "notes", "cards", "cards", "card_variants"]);
  assert.equal(mutations.every((mutation) => mutation.baseRevision === null), true);
});
