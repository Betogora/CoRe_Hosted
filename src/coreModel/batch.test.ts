import assert from "node:assert/strict";
import test from "node:test";
import type { NoteContent } from "../coreTypes.ts";
import { planCardBatchEdit, planCardBatchUndo, type CardBatchEdit } from "./batch.ts";
import { moveCardToDeck, setCardFlag } from "./cards.ts";
import { createNote, setNoteMarked, setNoteTags } from "./notes.ts";

const AT = "2026-11-09T10:00:00.000Z";
const LATER = "2026-11-09T11:00:00.000Z";

function graph(tags: string[] = []) {
  const content: NoteContent = {
    schemaVersion: 1,
    fields: [
      { id: "front", name: "Frage", role: "prompt", html: "Frage" },
      { id: "back", name: "Antwort", role: "answer", html: "Antwort" },
    ],
    interaction: {
      kind: "reveal",
      prompts: ["forward", "reverse"].map((key) => ({ key, name: key, instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null })),
    },
    speech: [],
    tags,
  };
  return createNote({ content, deckId: "deck-a", createdAt: AT });
}

/** The graphs after a plan was saved: changed ones replaced, the rest as they were. */
function saved(graphs: ReturnType<typeof graph>[], plan: ReturnType<typeof planCardBatchEdit>) {
  const next = new Map(plan.changes.map((change) => [change.next.note.id, change.next]));
  return graphs.map((candidate) => next.get(candidate.note.id) ?? candidate);
}

test("Kartenaktionen treffen nur die ausgewählten Karten, Inhaltsaktionen deren Inhalte (KV4)", () => {
  const first = graph();
  const second = graph();
  const selected = new Set([first.cards[0].id, second.cards[1].id]);
  const flagged = planCardBatchEdit([first, second], selected, { kind: "flag", flag: 3 }, LATER);
  assert.deepEqual(flagged.changedCardIds, [first.cards[0].id, second.cards[1].id]);
  assert.equal(flagged.changes[0].next.cards[1], first.cards[1], "die Geschwisterkarte bleibt unverändert");
  assert.equal(flagged.changes[0].next.cards[0].ankiFlag, 3);

  const marked = planCardBatchEdit([first, second], new Set([first.cards[0].id]), { kind: "marked", marked: true }, LATER);
  assert.equal(marked.changes.length, 1);
  assert.equal(marked.changes[0].next.note.marked, true);
  assert.deepEqual(marked.changedCardIds, [first.cards[0].id], "gezählt werden die ausgewählten Karten");

  const moved = planCardBatchEdit([first], new Set(first.cards.map((card) => card.id)), { kind: "deck", deckId: "deck-b" }, LATER);
  assert.deepEqual(moved.changes[0].next.cards.map((card) => card.deckId), ["deck-b", "deck-b"]);
  assert.deepEqual(planCardBatchEdit([first], selected, { kind: "suspended", suspended: false }, LATER).changes, [], "ohne Wirkung keine Änderung");
});

test("Tags hinzufügen und entfernen ohne Rücksicht auf Groß- und Kleinschreibung (KV4)", () => {
  const tagged = graph(["Anatomie::Kopf", "alt"]);
  const plan = planCardBatchEdit([tagged], new Set([tagged.cards[0].id]), { kind: "tags", add: ["neu", "ALT"], remove: ["anatomie::kopf"] }, LATER);
  assert.deepEqual(plan.changes[0].next.note.content.tags, ["alt", "neu"]);
  const undo = planCardBatchUndo(saved([tagged], plan), [tagged], new Set([tagged.cards[0].id]), { kind: "tags", add: ["neu", "ALT"], remove: ["anatomie::kopf"] }, LATER);
  assert.deepEqual(undo.changes[0].next.note.content.tags, ["alt", "Anatomie::Kopf"], "nur was die Aktion geändert hat, kommt zurück");
});

test("Rückgängig stellt frühere Werte als neue Änderung her und überspringt zwischenzeitlich geänderte Karten (KV4)", () => {
  const first = graph();
  const second = graph();
  const selected = new Set([first.cards[0].id, second.cards[0].id]);
  for (const edit of [{ kind: "flag", flag: 2 }, { kind: "deck", deckId: "deck-b" }, { kind: "suspended", suspended: true }, { kind: "marked", marked: true }] as CardBatchEdit[]) {
    const plan = planCardBatchEdit([first, second], selected, edit, AT);
    const after = saved([first, second], plan);
    const undo = planCardBatchUndo(after, [first, second], selected, edit, LATER);
    assert.deepEqual(undo.skippedCardIds, [], edit.kind);
    assert.deepEqual(saved(after, undo).map((candidate) => [candidate.note.marked, candidate.cards.map((card) => [card.deckId, card.ankiFlag, card.status])]),
      [first, second].map((candidate) => [candidate.note.marked, candidate.cards.map((card) => [card.deckId, card.ankiFlag, card.status])]), edit.kind);
    assert.ok(undo.changes.every((change) => change.next.note.revision >= change.previous.note.revision), "eine neue Änderung, kein Zurückspulen");
  }

  const plan = planCardBatchEdit([first, second], selected, { kind: "flag", flag: 2 }, AT);
  const [flaggedFirst, flaggedSecond] = saved([first, second], plan);
  const changedSince = { ...flaggedSecond, cards: [setCardFlag(flaggedSecond.cards[0], 5, LATER), flaggedSecond.cards[1]] };
  const undo = planCardBatchUndo([flaggedFirst, changedSince], [first, second], selected, { kind: "flag", flag: 2 }, LATER);
  assert.deepEqual(undo.skippedCardIds, [second.cards[0].id]);
  assert.deepEqual(undo.changedCardIds, [first.cards[0].id]);

  const movedPlan = planCardBatchEdit([first], new Set([first.cards[0].id]), { kind: "deck", deckId: "deck-b" }, AT);
  const [moved] = saved([first], movedPlan);
  const movedAgain = { ...moved, cards: [moveCardToDeck(moved.cards[0], "deck-c", LATER), moved.cards[1]] };
  assert.deepEqual(planCardBatchUndo([movedAgain], [first], new Set([first.cards[0].id]), { kind: "deck", deckId: "deck-b" }, LATER).skippedCardIds, [first.cards[0].id]);

  const markPlan = planCardBatchEdit([first], new Set([first.cards[0].id]), { kind: "marked", marked: true }, AT);
  const [markedGraph] = saved([first], markPlan);
  const unmarked = { ...markedGraph, note: setNoteMarked(markedGraph.note, false, LATER) };
  assert.deepEqual(planCardBatchUndo([unmarked], [first], new Set([first.cards[0].id]), { kind: "marked", marked: true }, LATER).changes, []);
  const retagged = { ...first, note: setNoteTags(first.note, ["x"], LATER) };
  assert.equal(planCardBatchUndo([retagged], [first], new Set([first.cards[0].id]), { kind: "tags", add: ["x"], remove: [] }, LATER).changes[0].next.note.content.tags.length, 0);
});
