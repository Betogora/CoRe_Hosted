import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote } from "./coreModel.ts";
import { canonicalTagSpelling, createTagDirectoryBuilder, suggestTags } from "./tagDirectory.ts";

function noteWith(tags: string[], importedTags: string[] | null = null) {
  const { note } = createBasicNote("deck", "Frage", "Antwort", { tags });
  return { ...note, importedTags };
}

test("Das lokale Tag-Verzeichnis zählt Inhalte je Tag ohne Rücksicht auf die Schreibweise und trennt die Herkunft", () => {
  const builder = createTagDirectoryBuilder();
  builder.add(noteWith(["#AK::Herz", "Eigen"], ["#AK::Herz"]));
  builder.add(noteWith(["#ak::herz"]));
  builder.add({ ...noteWith(["Gelöscht"]), deletedAt: "2026-10-30T12:00:00.000Z" });
  assert.deepEqual(builder.entries(), [
    { tag: "#AK::Herz", noteCount: 2, importedCount: 1 },
    { tag: "Eigen", noteCount: 1, importedCount: 0 },
  ]);
});

test("Vorschläge sind hierarchisch und häufige Tags zuerst; die gespeicherte Schreibweise gewinnt", () => {
  const directory = [
    { tag: "#AK::Herz::Klappen", noteCount: 3, importedCount: 3 },
    { tag: "#AK::Lunge", noteCount: 9, importedCount: 9 },
    { tag: "Herzinsuffizienz", noteCount: 1, importedCount: 0 },
    { tag: "Pharma::Herzglykoside", noteCount: 5, importedCount: 0 },
  ];
  assert.deepEqual(suggestTags(directory, "herz").map((entry) => entry.tag), ["Herzinsuffizienz", "Pharma::Herzglykoside", "#AK::Herz::Klappen"]);
  assert.deepEqual(suggestTags(directory, "#ak").map((entry) => entry.tag), ["#AK::Lunge", "#AK::Herz::Klappen"]);
  assert.deepEqual(suggestTags(directory, "herz", ["herzinsuffizienz"]).map((entry) => entry.tag), ["Pharma::Herzglykoside", "#AK::Herz::Klappen"]);
  assert.deepEqual(suggestTags(directory, " "), []);
  assert.equal(canonicalTagSpelling(directory, "#ak::lunge"), "#AK::Lunge");
  assert.equal(canonicalTagSpelling(directory, "Neu"), "Neu");
});
