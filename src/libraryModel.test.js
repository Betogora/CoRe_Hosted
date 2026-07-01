import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.js";
import { createAiJobLedger, createDeckLibraryModel } from "./libraryModel.js";

function createDeckWithInactiveCards() {
  const active = createCoreCard({
    id: "card_active",
    source: "manual",
    originalFront: "<b>Welche Funktion hat Myelin?</b>",
    originalBack: "Myelin isoliert Axone und beschleunigt die Erregungsleitung.",
    originalTags: ["neuro"],
    reviewState: {
      dueAt: "2026-07-01T07:00:00.000Z",
      repetitions: 4,
      maturityXp: 142,
    },
    variants: [
      {
        id: "variant_active",
        sourceCardId: "card_active",
        front: "Beschreibe die Funktion von Myelin.",
        back: "Myelin isoliert Axone und beschleunigt die Erregungsleitung.",
        qualityStatus: "active",
      },
    ],
  });
  const deleted = createCoreCard({
    id: "card_deleted",
    source: "manual",
    originalFront: "Geloeschte Karte",
    originalBack: "Soll nicht zaehlen.",
    status: "deleted",
    reviewState: {
      dueAt: "2026-07-01T07:00:00.000Z",
      repetitions: 4,
      maturityXp: 142,
    },
  });
  const draft = createCoreCard({
    id: "card_draft",
    source: "manual",
    originalFront: "Draft",
    originalBack: "Soll nicht zaehlen.",
    draftStatus: "draft",
  });

  return createCoreDeck({
    id: "deck_neuro",
    name: "Neuro::Myelin",
    source: "manual",
    hierarchyPath: ["Medizin", "Neuro", "Myelin"],
    deckSettings: { coreMode: "auto" },
    cards: [active, deleted, draft],
    aiJobs: [
      {
        id: "job_variants",
        jobType: "variant_generation",
        status: "succeeded",
        deckId: "deck_neuro",
        createdAt: "2026-07-01T08:00:00.000Z",
        resultRef: { generatedVariantIds: ["variant_active", "variant_extra"] },
      },
    ],
  });
}

test("library model hides reviewable-card filtering and deck selection fallback", () => {
  const deck = createDeckWithInactiveCards();
  const library = createDeckLibraryModel([deck], {
    query: "medizin",
    coreMode: "auto",
    now: "2026-07-01T08:00:00.000Z",
  });

  assert.equal(library.totals.deckCount, 1);
  assert.equal(library.totals.totalCards, 1);
  assert.equal(library.totals.dueCards, 1);
  assert.equal(library.totals.matureCards, 1);
  assert.equal(library.totals.activeVariants, 1);
  assert.equal(library.totals.completionPercent, 100);
  assert.equal(library.filteredRows.length, 1);
  assert.equal(library.selectedRow.id, deck.id);
  assert.equal(library.selectedRow.path, "Medizin / Neuro / Myelin");
  assert.equal(library.selectedRow.cardRows.length, 1);
  assert.equal(library.selectedRow.cardRows[0].frontPreview, "Welche Funktion hat Myelin?");
});

test("library model keeps an explicitly selected deck even when filters hide it", () => {
  const deck = createDeckWithInactiveCards();
  const library = createDeckLibraryModel([deck], {
    query: "anatomie",
    selectedDeckId: deck.id,
  });

  assert.equal(library.filteredRows.length, 0);
  assert.equal(library.selectedRow.id, deck.id);
});

test("AI job ledger merges global and deck jobs with stable counts", () => {
  const deck = createDeckWithInactiveCards();
  const ledger = createAiJobLedger({
    decks: [deck],
    jobs: [
      {
        id: "job_global",
        jobType: "card_generation",
        status: "failed",
        createdAt: "2026-07-01T09:00:00.000Z",
        resultRef: { cardCount: 3 },
      },
    ],
  });

  assert.equal(ledger.total, 2);
  assert.equal(ledger.succeeded, 1);
  assert.equal(ledger.failed, 1);
  assert.equal(ledger.jobs[0].id, "job_global");
  assert.equal(ledger.jobs[0].scopeLabel, "global");
  assert.equal(ledger.jobs[0].resultLabel, "3 Karten");
  assert.equal(ledger.jobs[1].deckName, deck.name);
  assert.equal(ledger.jobs[1].resultLabel, "2 Varianten");
});
