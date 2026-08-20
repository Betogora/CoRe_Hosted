import assert from "node:assert/strict";
import test from "node:test";
import { importNormalizedDeck } from "./importService.ts";

test("normalisierter Import materialisiert jede Quellkarte als volle Karte", () => {
  const result = importNormalizedDeck({
    schemaVersion: 1,
    title: "Anki",
    sourceType: "anki_import",
    items: [{
      canonicalQuestion: "Notiz",
      canonicalAnswer: "Antwort",
      cards: [
        { front: "Q1", back: "A1", sourceExternalId: "anki-card-1" },
        { front: "Q2", back: "A2", sourceExternalId: "anki-card-2" },
      ],
    }],
  }, { dryRun: false });
  assert.equal(result.deck?.cards.length, 2);
  assert.deepEqual(result.deck?.cards.map((card: any) => card.sourceCardId), ["1", "2"]);
  assert.equal(result.deck?.cards.every((card: any) => card.variants.length === 0), true);
});
