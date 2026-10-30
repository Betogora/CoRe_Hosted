import assert from "node:assert/strict";
import test from "node:test";
import { setCardFlag } from "./cards.ts";
import { createBasicNote, planNoteContentChange, setNoteTags } from "./notes.ts";
import { mergeImportedTags, normalizeTags, splitAnkiSystemTags, tagSearchKeys } from "./tags.ts";

test("Tags behalten Anki-Rohtexte im AnKing-Stil und verlieren nur Leerraum, Steuerzeichen und Duplikate", () => {
  assert.deepEqual(
    normalizeTags(["#AK_Step1_v12::#B&B::01_Cell", "#ak_step1_v12::#b&b::01_cell", "Pharma::(Sympathikus)/^Rezeptoren", "a::::b", " Zel\u0007le "]),
    ["#AK_Step1_v12::#B&B::01_Cell", "Pharma::(Sympathikus)/^Rezeptoren", "a::blank::b", "Zelle"],
  );
  assert.deepEqual(normalizeTags("Biologie,Zelle  #Zelle;x"), ["Biologie,Zelle", "#Zelle;x"]);
  assert.deepEqual(normalizeTags(["Café"]), ["Café"], "NFC");
});

test("Suchschlüssel enthalten jedes Tag und alle Elternpfade in Kleinschreibung", () => {
  assert.deepEqual(tagSearchKeys(["#AK::Herz::Klappen", "Pharma"]), ["#ak", "#ak::herz", "#ak::herz::klappen", "pharma"]);
});

test("marked und leech sind Systemtags ohne Rücksicht auf Groß-/Kleinschreibung", () => {
  assert.deepEqual(splitAnkiSystemTags(["Marked", "LEECH", "Herz"]), { tags: ["Herz"], marked: true, leech: true });
  assert.deepEqual(splitAnkiSystemTags(["Herz"]), { tags: ["Herz"], marked: false, leech: false });
});

test("Reimport-Tags: lokal ∪ (neu − Basis) − (Basis − neu)", () => {
  assert.deepEqual(mergeImportedTags(["Alt", "Eigen", "Entfällt"], ["Alt", "Entfällt", "Gelöscht"], ["alt", "Gelöscht", "Neu"]), ["Alt", "Eigen", "Neu"]);
  assert.deepEqual(mergeImportedTags(["Eigen"], null, ["Paket"]), ["Eigen", "Paket"], "ohne Basis kommt alles Neue dazu");
});

test("Eine Tag-Änderung erhöht die Revision, nicht die Inhaltsrevision", () => {
  const graph = createBasicNote("deck", "Frage", "Antwort", { tags: ["A"] });
  const tagged = setNoteTags(graph.note, ["A", "b", "B"], "2026-10-30T12:00:00.000Z");
  assert.deepEqual(tagged.content.tags, ["A", "b"]);
  assert.deepEqual([tagged.revision, tagged.contentRevision], [2, 1]);
  assert.equal(setNoteTags(tagged, ["A", "b"]), tagged);

  const plan = planNoteContentChange(graph, { ...graph.note.content, tags: ["Neu"] });
  assert.deepEqual([plan.changed, plan.note.revision, plan.note.contentRevision], [true, 2, 1]);
  const edited = planNoteContentChange(graph, { ...graph.note.content, fields: graph.note.content.fields.map((field) => ({ ...field, html: `${field.html}!` })) });
  assert.equal(edited.note.contentRevision, 2);
});

test("Flaggen sind 0 bis 7 und erhöhen die Kartenrevision", () => {
  const [card] = createBasicNote("deck", "Frage", "Antwort").cards;
  const flagged = setCardFlag(card, 4, "2026-10-30T12:00:00.000Z");
  assert.deepEqual([flagged.ankiFlag, flagged.revision, flagged.studyRevision], [4, 2, 0]);
  assert.equal(setCardFlag(flagged, 4), flagged);
  assert.throws(() => setCardFlag(card, 8), /Flagge/);
});
