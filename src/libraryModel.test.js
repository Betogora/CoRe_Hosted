import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.js";
import { createAiJobLedger, createDeckLibraryModel, createStudyHeatmapModel, createVisibleDeckRows } from "./libraryModel.js";

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

test("library model projects deck hierarchies with aggregate parent summaries", () => {
  const childCard = createCoreCard({
    id: "card_child",
    source: "manual",
    originalFront: "Was ist ATP?",
    originalBack: "Ein Energietraeger.",
    reviewState: {
      dueAt: "2026-07-01T07:00:00.000Z",
      repetitions: 0,
    },
  });
  const parent = createCoreDeck({
    id: "deck_parent",
    name: "Medizin",
    source: "manual",
    hierarchyPath: ["Medizin"],
    cards: [],
  });
  const child = createCoreDeck({
    id: "deck_child",
    name: "Anatomie",
    source: "manual",
    parentDeckId: parent.id,
    hierarchyPath: ["Medizin", "Anatomie"],
    cards: [childCard],
  });
  const library = createDeckLibraryModel([parent, child], { now: "2026-07-01T08:00:00.000Z" });
  const parentRow = library.rows.find((row) => row.id === parent.id);
  const childRow = library.rows.find((row) => row.id === child.id);

  assert.equal(library.rows[0].id, parent.id);
  assert.equal(parentRow.depth, 0);
  assert.equal(childRow.depth, 1);
  assert.equal(childRow.parentDeckId, parent.id);
  assert.deepEqual(parentRow.scopeDeckIds, [parent.id, child.id]);
  assert.equal(parentRow.directSummary.totalCards, 0);
  assert.equal(parentRow.summary.totalCards, 1);
  assert.equal(parentRow.summary.newCards, 1);
  assert.equal(childRow.summary.totalCards, 1);
  assert.equal(library.totals.totalCards, 1);
});

test("visible deck rows hide descendants of collapsed parent decks", () => {
  const parent = createCoreDeck({
    id: "deck_parent",
    name: "Medizin",
    source: "manual",
    hierarchyPath: ["Medizin"],
    cards: [],
  });
  const child = createCoreDeck({
    id: "deck_child",
    name: "Anatomie",
    source: "manual",
    parentDeckId: parent.id,
    hierarchyPath: ["Medizin", "Anatomie"],
    cards: [],
  });
  const grandchild = createCoreDeck({
    id: "deck_grandchild",
    name: "Kopf",
    source: "manual",
    parentDeckId: child.id,
    hierarchyPath: ["Medizin", "Anatomie", "Kopf"],
    cards: [],
  });
  const library = createDeckLibraryModel([parent, child, grandchild], { now: "2026-07-01T08:00:00.000Z" });

  assert.deepEqual(
    createVisibleDeckRows(library.rows, new Set([parent.id])).map((row) => row.id),
    [parent.id],
  );
  assert.deepEqual(
    createVisibleDeckRows(library.rows, new Set([child.id])).map((row) => row.id),
    [parent.id, child.id],
  );
});

test("study heatmap counts learned cards by local day", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap",
    name: "Heatmap",
    source: "manual",
    cards: [],
    reviewEvents: [
      { id: "review_1", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_1" },
      { id: "review_2", answeredAt: "2026-07-07T09:00:00.000Z", learningItemId: "card_2" },
      { id: "review_3", createdAt: "2026-07-06T10:00:00.000Z", learningItemId: "card_3" },
      { id: "review_4", reviewedAt: "2026-07-04T10:00:00.000Z", learningItemId: "card_4" },
    ],
  });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
    weeks: 4,
  });

  assert.equal(heatmap.weeks.length, 4);
  assert.equal(heatmap.weekCount, 4);
  assert.equal(heatmap.totalCount, 4);
  assert.equal(heatmap.activeDays, 3);
  assert.equal(heatmap.averagePerActiveDay, 1.3);
  assert.equal(heatmap.currentStreak, 2);
  assert.equal(heatmap.longestStreak, 2);
  assert.equal(heatmap.bestDay.key, "2026-07-07");
  assert.equal(heatmap.bestDay.count, 2);
  assert.equal(heatmap.rangeLabel, "15.06.2026 - 07.07.2026");
  assert.ok(heatmap.monthLabels.includes("Jul"));
  assert.equal(heatmap.days.find((day) => day.key === "2026-07-07").count, 2);
  assert.equal(heatmap.days.find((day) => day.key === "2026-07-07").level, 4);
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
