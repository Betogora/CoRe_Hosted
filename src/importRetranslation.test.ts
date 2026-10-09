import assert from "node:assert/strict";
import test from "node:test";
import type { AnkiPackage } from "./apkgImportInternal.ts";
import { translateAnkiPackage, type NoteSource } from "./apkgNoteTranslation.ts";
import { createCardStudy } from "./coreModel.ts";
import type { Card } from "./coreTypes.ts";
import { planRetranslation } from "./importRetranslation.ts";

const IMPORTED_AT = "2026-10-01T12:00:00.000Z";
const UPDATED_AT = "2026-10-08T12:00:00.000Z";

function model(fields: string[], templates: Array<[string, string]>, options: { kind?: number; stock?: number } = {}) {
  return {
    name: "Notiztyp",
    type: options.kind ?? 0,
    config: { kind: options.kind ?? 0, originalStockKind: options.stock ?? 0, css: "" },
    flds: fields.map((name, ord) => ({ name, ord })),
    tmpls: templates.map(([qfmt, afmt], ord) => ({ name: `Karte ${ord + 1}`, ord, qfmt, afmt })),
  };
}

const BASIC = model(["Front", "Back"], [["{{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}"]], { stock: 1 });
const CHANGED_BASIC = model(["Front", "Back"], [["Frage: {{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}"]], { stock: 1 });
const CLOZE = model(["Text", "Back Extra"], [["{{cloze:Text}}", "{{cloze:Text}}<br>{{Back Extra}}"]], { kind: 1, stock: 5 });

function ankiCard(id: string, ord: number) {
  return { id, nid: "100", did: "10", ord, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, odid: 0, odue: 0, flags: 0, data: "" };
}

/** Translates one Anki note and returns the imported content, its cards and the stored sources. */
async function importNote(notetype: ReturnType<typeof model>, fields: string[], ords: number[], tags = "") {
  const pkg: AnkiPackage = {
    file: { name: "test.apkg", size: 1 },
    packageFormat: "latest",
    collectionCreatedAt: null,
    decks: [{ id: "10", name: "Stapel", filtered: false }],
    notes: [{ id: "100", guid: "guid-100", mid: "1", flds: fields.join("\u001f"), tags }],
    cards: ords.map((ord) => ankiCard(String(200 + ord), ord)),
    models: { 1: notetype },
    reviewHistory: { entries: [], totalRows: 0, skippedRows: 0 },
    media: { format: "media-entries", files: [], missing: [] },
  };
  const graph = await translateAnkiPackage(pkg, { importedAt: IMPORTED_AT });
  assert.equal(graph.notes.length, 1);
  return { note: graph.notes[0], cards: graph.cards, source: graph.noteTypeSources[0], noteSource: graph.noteSources[0] };
}

function withFields(noteSource: NoteSource, fields: string[]): NoteSource {
  return { ...noteSource, fields };
}

function studied(card: Card): Card {
  return { ...card, studyRevision: 4, study: { ...createCardStudy("2026-10-20T00:00:00.000Z"), state: "review", reps: 4, stability: 12 } };
}

test("ein unveränderter Inhalt bleibt unverändert", async () => {
  const { note, cards, source, noteSource } = await importNote(BASIC, ["Hauptstadt von Frankreich?", "Paris"], [0], "Geografie");

  assert.deepEqual(planRetranslation(note, cards, source, noteSource, UPDATED_AT), { status: "unchanged" });
});

test("ein geänderter Inhalt wird aktualisiert, ohne den Lernstand der Karten zu berühren", async () => {
  const imported = await importNote(BASIC, ["Hauptstadt von Frankreich?", "Paris"], [0], "Geografie");
  const card = studied(imported.cards[0]);
  const note = { ...imported.note, translator: { id: "anki-basic", version: 0 } };
  const plan = planRetranslation(note, [card], imported.source, withFields(imported.noteSource, ["Hauptstadt von Frankreich?", "<b>Paris</b>"]), UPDATED_AT);

  assert.equal(plan.status, "updated");
  if (plan.status !== "updated") return;
  const { previous, next } = plan.change;
  assert.deepEqual(previous, { note, cards: [card] });
  assert.equal(next.note.id, note.id);
  assert.equal(next.note.contentRevision, 2);
  assert.equal(next.note.importedContentRevision, next.note.contentRevision);
  assert.equal(next.note.revision, note.revision + 1);
  assert.equal(next.note.updatedAt, UPDATED_AT);
  assert.deepEqual(next.note.translator, { id: "anki-basic", version: 1 });
  assert.deepEqual(next.note.content.tags, ["Geografie"]);
  assert.equal(next.note.content.fields.find((field) => field.role === "answer")?.html, "<b>Paris</b>");
  assert.deepEqual(next.cards, [card]);
});

test("eine neue Abfrage wird zu einer neuen Karte", async () => {
  const imported = await importNote(CLOZE, ["{{c1::Paris}} liegt an der Seine.", ""], [0]);
  const card = studied(imported.cards[0]);
  const plan = planRetranslation(imported.note, [card], imported.source, withFields(imported.noteSource, ["{{c1::Paris}} liegt an der {{c2::Seine}}.", ""]), UPDATED_AT);

  assert.equal(plan.status, "updated");
  if (plan.status !== "updated") return;
  const [kept, added] = plan.change.next.cards;
  assert.equal(plan.change.next.cards.length, 2);
  assert.equal(kept, card);
  assert.equal(added.promptKey, "cloze:2");
  assert.equal(added.noteId, imported.note.id);
  assert.equal(added.deckId, card.deckId);
  assert.equal(added.study.state, "new");
  assert.equal(added.ankiCardId, null);
  assert.equal(added.deletedAt, null);
});

test("entfiele eine Karte mit Lernstand, bleibt der Inhalt erhalten", async () => {
  const imported = await importNote(CLOZE, ["{{c1::Paris}} liegt an der {{c2::Seine}}.", ""], [0, 1]);
  const cards = [imported.cards[0], studied(imported.cards[1])];

  assert.deepEqual(
    planRetranslation(imported.note, cards, imported.source, withFields(imported.noteSource, ["{{c1::Paris}} liegt an der Seine.", ""]), UPDATED_AT),
    { status: "kept" },
  );
});

test("eine entfallende Karte ohne Lernstand wird weich gelöscht", async () => {
  const imported = await importNote(CLOZE, ["{{c1::Paris}} liegt an der {{c2::Seine}}.", ""], [0, 1]);
  const [first, second] = imported.cards;
  const plan = planRetranslation(imported.note, [first, second], imported.source, withFields(imported.noteSource, ["{{c1::Paris}} liegt an der Seine.", ""]), UPDATED_AT);

  assert.equal(plan.status, "updated");
  if (plan.status !== "updated") return;
  const nextCards = plan.change.next.cards;
  assert.deepEqual(nextCards.map((card) => card.id), [first.id, second.id]);
  assert.equal(nextCards[0], first);
  assert.equal(nextCards[1].deletedAt, UPDATED_AT);
  assert.equal(nextCards[1].promptKey, "cloze:2");
  assert.equal(plan.change.next.note.deletedAt, null);
});

// Known defect: planRetranslation re-keys the cards before planNoteContentChange, which looks up the deck through the
// previous content's prompt keys (anki-N) and therefore finds no card; the plan ends as "kept" instead of "updated".
test("generische anki-N-Schlüssel erhalten den Abfrageschlüssel des besseren Übersetzers", async () => {
  const generic = await importNote(CHANGED_BASIC, ["Hauptstadt von Frankreich?", "Paris"], [0]);
  assert.deepEqual(generic.note.translator, { id: "generic", version: 1 });
  assert.deepEqual(generic.cards.map((card) => card.promptKey), ["anki-0"]);
  const stock = await importNote(BASIC, ["Hauptstadt von Frankreich?", "Paris"], [0]);
  const card = studied(generic.cards[0]);
  const plan = planRetranslation(generic.note, [card], stock.source, generic.noteSource, UPDATED_AT);

  assert.equal(plan.status, "updated");
  if (plan.status !== "updated") return;
  const [rekeyed] = plan.change.next.cards;
  assert.equal(plan.change.next.cards.length, 1);
  assert.equal(rekeyed.id, card.id);
  assert.equal(rekeyed.promptKey, "forward");
  assert.equal(rekeyed.revision, card.revision + 1);
  assert.equal(rekeyed.updatedAt, UPDATED_AT);
  assert.equal(rekeyed.ankiCardId, card.ankiCardId);
  assert.equal(rekeyed.study, card.study);
  assert.equal(rekeyed.studyRevision, card.studyRevision);
  assert.deepEqual(plan.change.next.note.translator, { id: "anki-basic", version: 1 });
  assert.deepEqual(plan.change.previous?.cards, [card]);
});

test("Felder, die der Übersetzer nicht ausdrücken kann, lassen den Inhalt unverändert", async () => {
  const imported = await importNote(CLOZE, ["{{c1::Paris}} liegt an der Seine.", ""], [0]);

  assert.deepEqual(planRetranslation(imported.note, imported.cards, imported.source, withFields(imported.noteSource, ["", ""]), UPDATED_AT), { status: "kept" });
});
