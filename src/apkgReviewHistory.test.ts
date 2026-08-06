import assert from "node:assert/strict";
import test from "node:test";
import { applyAnkiReviewHistory, normalizeAnkiReviewHistory } from "./apkgImport.ts";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";

function importedDeckFixture() {
  const card = createCoreCard({
    id: "item_anki",
    source: "anki-apkg",
    originalFront: "Frage",
    originalBack: "Antwort",
    reviewState: { state: "new", dueAt: "2026-08-01T08:00:00.000Z" },
  });
  const original = card.variants.find((variant) => variant.isOriginal);
  assert.ok(original);
  const withIdentity = {
    ...card,
    variants: [{
      ...original,
      meta: {
        ...original.meta,
        ankiImportIdentityV1: {
          version: 1,
          kind: "card",
          guid: "guid",
          noteId: "10",
          cardId: "20",
          notetypeId: "1",
          templateOrdinal: 0,
          templateName: "Card 1",
          deckId: "30",
          deckPath: "Import",
          importGroupId: "group",
        },
      },
    }],
  };
  const deck = createCoreDeck({ id: "deck_anki", name: "Import", source: "anki-apkg", cards: [withIdentity] });
  return { deck, state: deck.cards[0].learningItemState };
}

test("Anki revlog rows map ratings, response time and negative learning intervals", () => {
  const payload = normalizeAnkiReviewHistory([
    { id: 1_700_000_000_000, cid: 20, ease: 1, type: 2, lastIvl: -120, ivl: -600, factor: 2500, time: 75_000 },
    { id: 1_700_000_001_000, cid: 20, ease: 0, type: 4, lastIvl: 1, ivl: 2, time: 10 },
    { id: 1_700_000_002_000, cid: 20, ease: 3, type: 4, lastIvl: 2, ivl: 3, time: 10 },
  ]);

  assert.equal(payload.totalRows, 3);
  assert.equal(payload.skippedRows, 2);
  assert.equal(payload.entries[0].rating, "again");
  assert.equal(payload.entries[0].beforeState, "relearning");
  assert.equal(payload.entries[0].beforeIntervalMinutes, 2);
  assert.equal(payload.entries[0].afterIntervalMinutes, 10);
  assert.equal(payload.entries[0].responseTimeMs, 60_000);
});

test("analytics-only revlog import is deterministic and never mutates current scheduling", () => {
  const { deck, state } = importedDeckFixture();
  const payload = normalizeAnkiReviewHistory([
    { id: 1_700_000_000_000, cid: 20, ease: 3, type: 1, lastIvl: 10, ivl: 25, factor: 2400, time: 1_500 },
    { id: 1_700_000_002_000, cid: 999, ease: 4, type: 1, lastIvl: 25, ivl: 60, factor: 2500, time: 900 },
  ]);

  const first = applyAnkiReviewHistory([deck], payload);
  assert.equal(first.summary.imported, 1);
  assert.equal(first.summary.unmapped, 1);
  assert.equal(first.decks[0].reviewEvents.length, 1);
  assert.deepEqual(first.decks[0].cards[0].learningItemState, state);
  assert.equal(first.decks[0].reviewEvents[0].flags.source, "anki_revlog");

  const second = applyAnkiReviewHistory(first.decks, payload);
  assert.equal(second.summary.imported, 0);
  assert.equal(second.summary.duplicates, 1);
  assert.equal(second.decks[0].reviewEvents.length, 1);
});
