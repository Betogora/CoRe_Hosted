import assert from "node:assert/strict";
import test from "node:test";
import { duplicateFieldNames, findDuplicateGroups } from "./duplicateContents.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

function entry(id: string, noteId: string, front: string, back: string, deckId = "deck-a"): CardCatalogEntry {
  return { id, noteId, deckId, frontPreview: front, sortText: front.toLocaleLowerCase("de"), searchFields: [{ name: "Vorderseite", text: front }, { name: "Rückseite", text: back }] } as CardCatalogEntry;
}

test("Duplikate finden gruppiert Inhalte mit gleichem Feldtext ohne Groß-/Kleinschreibung und Abstände (KV5)", () => {
  const entries = [
    entry("a1", "a", "Hauptstadt von Island", "Reykjavík"),
    entry("a2", "a", "Hauptstadt von Island", "Reykjavík"),
    entry("b1", "b", "hauptstadt  von island ", "Reykjavík", "deck-b"),
    entry("c1", "c", "Hauptstadt von Norwegen", "Oslo"),
    entry("d1", "d", "Hauptstadt von Schweden", "oslo"),
    entry("e1", "e", "Leer", " "),
    entry("f1", "f", "Auch leer", ""),
  ];
  const bySortField = findDuplicateGroups(entries, "sortField");
  assert.deepEqual(bySortField.map((group) => [group.text, group.contents.map((content) => [content.noteId, content.cardIds])]), [
    ["Hauptstadt von Island", [["a", ["a1", "a2"]], ["b", ["b1"]]]],
  ], "ein Inhalt zählt einmal, auch mit mehreren Karten");
  assert.deepEqual(findDuplicateGroups(entries, { field: "rückseite" }).map((group) => group.contents.map((content) => content.noteId)), [["c", "d"], ["a", "b"]], "Feldname wie bei Feld:-Suchen, gleich große Gruppen alphabetisch; leere Felder sind keine Duplikate");
  assert.deepEqual(findDuplicateGroups(entries, { field: "Fehlt" }), []);
  assert.deepEqual(duplicateFieldNames(entries), ["Vorderseite", "Rückseite"]);
  assert.deepEqual(duplicateFieldNames([{ ...entries[0], searchFields: [{ name: "zusatz_info", text: "x" }] }]), ["Zusatz info"], "Suchschlüssel werden lesbar");
});
