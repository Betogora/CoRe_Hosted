import assert from "node:assert/strict";
import test from "node:test";
import { duplicateContents, groupDuplicates, surplusDuplicateCardIds } from "./duplicateContents.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

function entry(id: string, noteId: string, front: string, reps = 0, createdAt = "2026-11-01T00:00:00.000Z"): CardCatalogEntry {
  return { id, noteId, frontPreview: front, sortText: front.toLocaleLowerCase("de"), reps, createdAt } as CardCatalogEntry;
}

test("Duplikate sind Inhalte mit gleicher Vorderseite ohne Groß-/Kleinschreibung und Abstände; ein Inhalt zählt einmal", () => {
  const entries = [
    entry("a1", "a", "Hauptstadt von Island"),
    entry("a2", "a", "Hauptstadt von Island"),
    entry("b1", "b", "hauptstadt  von island "),
    entry("c1", "c", "Hauptstadt von Norwegen"),
    entry("d1", "d", ""),
    entry("e1", "e", " "),
  ];
  const duplicates = duplicateContents(entries);
  assert.deepEqual([...duplicates].sort(), [["a", "hauptstadt von island"], ["b", "hauptstadt von island"]], "leere Vorderseiten sind keine Duplikate");
  assert.equal(duplicateContents(entries.slice(0, 2)).size, 0, "Karten desselben Inhalts");
  assert.deepEqual(groupDuplicates([entries[0], entries[3], entries[1], entries[2]], duplicates).map((row) => row.id), ["a1", "a2", "b1", "c1"]);
  assert.deepEqual(groupDuplicates([entries[3], entries[0], entries[4], entries[2], { ...entries[3], id: "c2" }], duplicates).map((row) => row.id), ["c1", "a1", "b1", "d1", "c2"], "Karten außerhalb der Duplikate behalten ihren Platz, auch Geschwister");
});

test("Überzählige sind je Gruppe alle Inhalte außer dem mit dem meisten Lernstand, dann dem ältesten", () => {
  const entries = [
    entry("a1", "a", "Herz", 2, "2026-11-01T00:00:00.000Z"),
    entry("b1", "b", "herz", 1, "2026-10-01T00:00:00.000Z"),
    entry("b2", "b", "herz", 3, "2026-10-01T00:00:00.000Z"),
    entry("c1", "c", "Herz", 0, "2026-09-01T00:00:00.000Z"),
    entry("d1", "d", "Lunge", 0, "2026-11-02T00:00:00.000Z"),
    entry("e1", "e", "Lunge", 0, "2026-11-01T00:00:00.000Z"),
    entry("f1", "f", "Leber", 9),
  ];
  assert.deepEqual(surplusDuplicateCardIds(entries), ["a1", "c1", "d1"], "b hat zusammen die meisten Wiederholungen, e ist älter; ein Inhalt allein bleibt");
});
