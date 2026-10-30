import assert from "node:assert/strict";
import { existsSync, openAsBlob, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { readAnkiPackage } from "./apkgImportInternal.ts";
import { translateAnkiPackage } from "./apkgNoteTranslation.ts";
import { noteEditorValue, planNoteContentChange, validateNoteEditorValue } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";

// W15 on real decks (AnKing-based Ankizin, Ankiphil, …): opening and closing the editor changes nothing, and editing
// one field leaves every other field byte for byte. Decks stay local (ADR-035); without them the test is skipped.
const corpusDir = resolve(process.env.CORE_APKG_CORPUS ?? "fixtures/apkg/corpus");
const files = existsSync(corpusDir) ? readdirSync(corpusDir).filter((name) => /\.apkg$/i.test(name)).sort() : [];
const NOTES_PER_DECK = 400;

function assertFidelity(note: Note, cards: Card[], label: string) {
  const graph = { note, cards };
  const value = noteEditorValue(note);
  const untouched = validateNoteEditorValue(note, value);
  assert.ok(untouched.ok, `${label}: unchanged draft is valid`);
  assert.equal(planNoteContentChange(graph, untouched.content).changed, false, `${label}: open and close changes nothing`);
  const edited = note.content.fields.find((field) => field.html.trim());
  if (!edited) return;
  const validation = validateNoteEditorValue(note, { ...value, fields: { ...value.fields, [edited.id]: `${edited.html} ergänzt` } });
  assert.ok(validation.ok, `${label}: edited draft is valid`);
  for (const field of note.content.fields) {
    if (field.id === edited.id) continue;
    assert.equal(validation.content.fields.find((candidate) => candidate.id === field.id)?.html, field.html, `${label}: field ${field.name} stays unchanged`);
  }
}

test("editing one field of an imported note leaves the others untouched (W15)", { skip: files.length === 0 && "kein lokaler APKG-Korpus" }, async () => {
  for (const name of files) {
    const graph = await translateAnkiPackage(await readAnkiPackage(Object.assign(await openAsBlob(join(corpusDir, name)), { name })));
    for (const note of graph.notes.slice(0, NOTES_PER_DECK)) assertFidelity(note, graph.cards.filter((card) => card.noteId === note.id), `${name} ${note.ankiGuid}`);
  }
});
