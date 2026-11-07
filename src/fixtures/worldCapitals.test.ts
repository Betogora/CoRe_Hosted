import assert from "node:assert/strict";
import test from "node:test";
import { createWorldCapitalsImportGraph } from "./worldCapitals.ts";

test("Welt-Hauptstädte: deutsche Hauptstädte, Fragen mit Artikel und eine Farbe je Kontinent", async () => {
  const decks: Array<{ name: string; appearance?: { iconColor: string } }> = [];
  const notes: Array<{ content: { fields: Array<{ html: string }> } }> = [];
  await createWorldCapitalsImportGraph().streamChunks(async (chunk) => {
    if (chunk.kind === "decks") decks.push(...chunk.decks);
    if (chunk.kind === "notes") notes.push(...chunk.notes);
  });
  const fronts = new Map(notes.map((note) => [note.content.fields[0].html, note.content.fields[1].html]));
  assert.equal(fronts.get("Was ist die Hauptstadt der Schweiz?"), "Bern");
  assert.equal(fronts.get("Was ist die Hauptstadt von Österreich?"), "Wien");
  assert.equal(fronts.get("Was ist die Hauptstadt der Vereinigten Staaten?"), "Washington, D.C.");
  const continentColors = decks.filter((deck) => deck.name !== "Welt-Hauptstädte").map((deck) => deck.appearance?.iconColor);
  assert.equal(new Set(continentColors).size, 7, "jeder Kontinent hat eine eigene Farbe");
});
