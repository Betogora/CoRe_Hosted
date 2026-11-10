import assert from "node:assert/strict";
import test from "node:test";
import type { NoteContent } from "../coreTypes.ts";
import { addCardVariant } from "./cards.ts";
import { createNote } from "./notes.ts";
import { planTextReplace, planTextReplaceUndo, replaceInNoteContent, type TextReplace } from "./replace.ts";

const AT = "2026-11-10T10:00:00.000Z";
const LATER = "2026-11-10T11:00:00.000Z";

function content(front: string, back = "Antwort", interaction: NoteContent["interaction"] = { kind: "reveal", prompts: [{ key: "forward", name: "forward", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null }] }): NoteContent {
  return {
    schemaVersion: 1,
    fields: [
      { id: "front", name: "Frage", role: "prompt", html: front },
      { id: "back", name: "Antwort", role: "answer", html: back },
    ],
    interaction,
    speech: [],
    tags: ["Geo::Europa", "alt"],
  };
}

const graph = (front: string, back?: string) => createNote({ content: content(front, back), deckId: "deck-a", createdAt: AT });
const edit = (find: string, replace: string, more: Partial<TextReplace> = {}): TextReplace => ({ find, replace, target: "all", matchCase: false, ...more });
const html = (value: NoteContent, field = 0) => value.fields[field].html;

test("Ersetzen ändert nur Text zwischen Tags, wörtlich und mit wählbarer Groß-/Kleinschreibung (KV5)", () => {
  const value = content('<a href="berlin.html">Berlin</a> &amp; BERLIN, $1 (a+b)', "berlin");
  assert.equal(html(replaceInNoteContent(value, edit("berlin", "Paris")).content), '<a href="berlin.html">Paris</a> &amp; Paris, $1 (a+b)', "Attribute bleiben, Entities bleiben");
  assert.equal(html(replaceInNoteContent(value, edit("Berlin", "Paris", { matchCase: true })).content), '<a href="berlin.html">Paris</a> &amp; BERLIN, $1 (a+b)');
  assert.equal(html(replaceInNoteContent(value, edit("(a+b)", "<c> & $&")).content), '<a href="berlin.html">Berlin</a> &amp; BERLIN, $1 &lt;c&gt; &amp; $&amp;', "Sonderzeichen und $-Muster gelten wörtlich");
  assert.equal(html(replaceInNoteContent(value, edit("& B", "und B")).content), '<a href="berlin.html">Berlin</a> und BERLIN, $1 (a+b)', "gesucht wird im sichtbaren Text");
  assert.equal(html(replaceInNoteContent(content("&#99999999; x"), edit("x", "y")).content), "&amp;#99999999; y", "ungültige Entities brechen nichts");
  assert.equal(html(replaceInNoteContent(content("Bad&nbsp;Ems"), edit("ems", "Tölz")).content), "Bad&nbsp;Tölz", "geschützte Leerzeichen bleiben");

  const field = replaceInNoteContent(value, edit("berlin", "Paris", { target: { field: "antwort" } }));
  assert.equal(html(field.content), html(value), "andere Felder bleiben");
  assert.equal(html(field.content, 1), "Paris");
  assert.equal(field.snippet?.place, "Antwort");

  const tags = replaceInNoteContent(value, edit("europa", "EU", { target: "tags" }));
  assert.deepEqual(tags.content.tags, ["Geo::EU", "alt"]);
  assert.equal(html(tags.content), html(value), "Tags-Ersetzen lässt die Felder");
  assert.equal(replaceInNoteContent(value, edit("fehlt", "x")).content, value, "ohne Treffer bleibt der Inhalt identisch");
});

test("Ersetzen zählt als lokale Bearbeitung, macht Varianten veraltet und lässt Inhalte mit sich ändernden Karten aus (KV5)", () => {
  const plain = graph("Hauptstadt von Frankreich");
  const withVariant = { ...plain, cards: [addCardVariant(plain.cards[0], { front: "Frankreichs Hauptstadt?", back: "Paris" }, AT)] };
  const untouched = graph("Hauptstadt von Spanien");
  const clozeNote = createNote({ content: content("{{c1::Paris}} liegt in Frankreich", "", { kind: "cloze" }), deckId: "deck-a", createdAt: AT });
  const selected = new Set([withVariant, untouched, clozeNote].map((candidate) => candidate.cards[0].id));

  const unchangedCards = planTextReplace([withVariant, untouched, clozeNote], selected, edit("Frankreich", "Belgien"), LATER);
  assert.equal(unchangedCards.changes.length, 2, "die Lücke bleibt c1, die Karte bleibt dieselbe");
  const plan = planTextReplace([withVariant, untouched, clozeNote], selected, edit("c1", "c2"), LATER);
  assert.deepEqual(plan.changes, [], "eine neue Lückennummer würde Karten tauschen");
  assert.deepEqual(plan.skippedCardIds, [clozeNote.cards[0].id]);

  const [changed] = unchangedCards.changes;
  assert.equal(changed.next.note.contentRevision, withVariant.note.contentRevision + 1);
  assert.equal(changed.next.cards[0].variants[0].meta.outdated, true);
  assert.equal(changed.next.cards[0].study, withVariant.cards[0].study, "der Lernstand bleibt");
  assert.deepEqual(unchangedCards.previews[0], { noteId: withVariant.note.id, place: "Frage", before: "Hauptstadt von Frankreich", after: "Hauptstadt von Belgien" });
  assert.deepEqual(planTextReplace([withVariant], new Set(), edit("Frankreich", "Belgien")).changes, [], "nur ausgewählte Karten zählen");
});

test("Rückgängig stellt den früheren Text her und lässt inzwischen bearbeitete Inhalte (KV5)", () => {
  const first = graph("Hauptstadt von Frankreich");
  const second = graph("Frankreich im Westen");
  const selected = new Set([first.cards[0].id, second.cards[0].id]);
  const plan = planTextReplace([first, second], selected, edit("Frankreich", "Belgien"), AT);
  const [firstAfter, secondAfter] = plan.changes.map((change) => change.next);
  const secondEdited = planTextReplace([secondAfter], selected, edit("Westen", "Norden"), LATER).changes[0].next;

  const undo = planTextReplaceUndo([firstAfter, secondEdited], plan.changes, selected, LATER);
  assert.deepEqual(undo.changedCardIds, [first.cards[0].id]);
  assert.deepEqual(undo.skippedCardIds, [second.cards[0].id]);
  assert.equal(html(undo.changes[0].next.note.content), "Hauptstadt von Frankreich");
});
