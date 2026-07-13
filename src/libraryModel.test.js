import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.js";
import {
  createAiJobLedger,
  createDeckLibraryModel,
  createPerformanceStatisticsModel,
  createStudyHeatmapModel,
  createStudyHeatmapWindow,
  createVisibleDeckRows,
  getStudyHeatmapVisibleWeekCount,
} from "./libraryModel.js";

function createDeckHierarchy(cards = []) {
  const parent = createCoreDeck({ id: "deck_parent", name: "Medizin", source: "manual", hierarchyPath: ["Medizin"], cards: [] });
  const child = createCoreDeck({
    id: "deck_child",
    name: "Anatomie",
    source: "manual",
    parentDeckId: parent.id,
    hierarchyPath: ["Medizin", "Anatomie"],
    cards,
  });
  return { parent, child };
}

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
  const { parent, child } = createDeckHierarchy([childCard]);
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
  assert.deepEqual(library.dashboardRows.map((row) => row.id), [parent.id]);
  assert.equal(library.dashboardRows[0].summary.totalCards, 1);
});

test("visible deck rows hide descendants of collapsed parent decks", () => {
  const { parent, child } = createDeckHierarchy();
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

test("study heatmap labels the visible year change on January", () => {
  const heatmap = createStudyHeatmapModel([], {
    now: "2026-02-10T12:00:00.000Z",
    weeks: 12,
  });
  const monthLabels = heatmap.monthLabels.filter(Boolean);

  assert.ok(monthLabels.includes("Dez"));
  assert.ok(monthLabels.includes("Jan 2026"));
  assert.ok(monthLabels.includes("Feb"));
  assert.equal(monthLabels.includes("Jan"), false);
});

test("study heatmap defaults to the current calendar year and pads whole weeks", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap_year",
    name: "Heatmap Jahr",
    source: "manual",
    cards: [],
    reviewEvents: [
      { id: "review_previous_year", reviewedAt: "2025-12-31T08:00:00.000Z", learningItemId: "card_previous_year" },
      { id: "review_january", reviewedAt: "2026-01-02T08:00:00.000Z", learningItemId: "card_january" },
      { id: "review_today", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_today" },
      { id: "review_next_year", reviewedAt: "2027-01-01T08:00:00.000Z", learningItemId: "card_next_year" },
    ],
  });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
  });

  assert.equal(heatmap.isCalendarYear, true);
  assert.equal(heatmap.displayYear, 2026);
  assert.equal(heatmap.calendarStartKey, "2026-01-01");
  assert.equal(heatmap.calendarEndKey, "2026-12-31");
  assert.equal(heatmap.weeks.length, 53);
  assert.equal(heatmap.days[0].key, "2025-12-29");
  assert.equal(heatmap.days[0].isOutsideDisplayYear, true);
  assert.equal(heatmap.days.at(-1).key, "2027-01-03");
  assert.equal(heatmap.days.at(-1).isOutsideDisplayYear, true);
  assert.equal(heatmap.totalCount, 2);
  assert.equal(heatmap.days.find((day) => day.key === "2025-12-31").count, 0);
  assert.equal(heatmap.days.find((day) => day.key === "2026-01-02").count, 1);
  assert.equal(heatmap.monthLabels.filter(Boolean)[0], "Jan 2026");
  assert.ok(heatmap.monthLabels.includes("Dez"));
});

test("study heatmap window fits whole weeks to viewport width and navigates by arrows", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap_window",
    name: "Heatmap Window",
    source: "manual",
    cards: [],
    reviewEvents: [
      { id: "review_latest", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_latest" },
      { id: "review_previous", reviewedAt: "2026-06-11T08:00:00.000Z", learningItemId: "card_previous" },
      { id: "review_old", reviewedAt: "2025-08-05T08:00:00.000Z", learningItemId: "card_old" },
    ],
  });
  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
    weeks: 53,
  });

  assert.equal(getStudyHeatmapVisibleWeekCount(320, heatmap.weekCount), 22);

  const latestWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320 });
  assert.equal(latestWindow.weeks.length, 22);
  assert.equal(latestWindow.days.length, 154);
  assert.equal(latestWindow.endWeekIndex, heatmap.weekCount);
  assert.equal(latestWindow.canShowPrevious, true);
  assert.equal(latestWindow.canShowNext, false);
  assert.equal(latestWindow.totalCount, 2);
  assert.equal(latestWindow.rangeEndKey, "2026-07-07");

  const explicitDefaultWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320, endWeekIndex: null });
  assert.equal(explicitDefaultWindow.endWeekIndex, heatmap.weekCount);
  assert.equal(explicitDefaultWindow.rangeEndKey, "2026-07-07");

  const previousWindow = createStudyHeatmapWindow(heatmap, {
    viewportWidth: 320,
    endWeekIndex: latestWindow.previousEndWeekIndex,
  });

  assert.equal(previousWindow.weeks.length, 22);
  assert.equal(previousWindow.days.length, 154);
  assert.equal(previousWindow.endWeekIndex, latestWindow.endWeekIndex - 4);
  assert.equal(previousWindow.canShowNext, true);
  assert.equal(previousWindow.weeks.every((week) => week.length === 7), true);
});

test("study heatmap calendar year shows the whole year when possible and anchors narrow windows near today", () => {
  const heatmap = createStudyHeatmapModel([], {
    now: "2026-07-07T12:00:00.000Z",
  });

  assert.equal(getStudyHeatmapVisibleWeekCount(900, heatmap.weekCount), heatmap.weekCount);

  const fullYearWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 900 });
  assert.equal(fullYearWindow.weeks.length, heatmap.weekCount);
  assert.equal(fullYearWindow.canShowPrevious, false);
  assert.equal(fullYearWindow.canShowNext, false);

  const narrowWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320 });
  assert.equal(narrowWindow.weeks.length, 22);
  assert.equal(narrowWindow.endWeekIndex, heatmap.defaultEndWeekIndex);
  assert.equal(narrowWindow.canShowPrevious, true);
  assert.equal(narrowWindow.canShowNext, true);
  assert.equal(narrowWindow.days.some((day) => day.key === "2026-07-07"), true);
  assert.equal(narrowWindow.days.some((day) => day.key === "2026-12-31"), false);
});

test("performance statistics summarize ratings, trends and weak decks", () => {
  const neuroCard = createCoreCard({
    id: "card_neuro",
    source: "manual",
    originalFront: "Was macht Myelin?",
    originalBack: "Es isoliert Axone.",
    reviewState: {
      dueAt: "2026-07-07T06:00:00.000Z",
      repetitions: 3,
      maturityXp: 64,
    },
    variants: [
      {
        id: "variant_neuro_rephrase",
        sourceCardId: "card_neuro",
        front: "Welche Rolle hat Myelin?",
        back: "Myelin isoliert Axone.",
        variantLevel: 2,
        variantType: "rephrase",
        qualityStatus: "active",
      },
    ],
  });
  const anatomyCard = createCoreCard({
    id: "card_anatomy",
    source: "manual",
    originalFront: "Was ist ATP?",
    originalBack: "Ein Energietraeger.",
    reviewState: {
      dueAt: "2026-07-09T06:00:00.000Z",
      repetitions: 2,
      maturityXp: 42,
    },
  });
  const neuro = createCoreDeck({
    id: "deck_neuro_stats",
    name: "Neuro",
    source: "manual",
    cards: [neuroCard],
    reviewEvents: [
      {
        id: "review_good",
        rating: "good",
        reviewedAt: "2026-07-07T08:00:00.000Z",
        learningItemId: neuroCard.id,
        reviewableType: "card",
        responseTimeMs: 1200,
      },
      {
        id: "review_again_variant",
        rating: "again",
        reviewedAt: "2026-07-06T08:00:00.000Z",
        learningItemId: neuroCard.id,
        variantId: "variant_neuro_rephrase",
        reviewableType: "variant",
        variantLevel: 2,
        responseTimeMs: 3000,
      },
      {
        id: "review_hard",
        rating: "hard",
        reviewedAt: "2026-07-05T08:00:00.000Z",
        learningItemId: neuroCard.id,
        reviewableType: "card",
        responseTimeMs: 1800,
      },
    ],
  });
  const anatomy = createCoreDeck({
    id: "deck_anatomy_stats",
    name: "Anatomie",
    source: "manual",
    cards: [anatomyCard],
    reviewEvents: [
      {
        id: "review_easy",
        rating: "easy",
        reviewedAt: "2026-07-07T09:00:00.000Z",
        learningItemId: anatomyCard.id,
        reviewableType: "card",
        responseTimeMs: 2000,
      },
    ],
  });

  const statistics = createPerformanceStatisticsModel([neuro, anatomy], {
    now: "2026-07-07T12:00:00.000Z",
    recentDayCount: 4,
  });

  assert.equal(statistics.hasReviewEvents, true);
  assert.equal(statistics.totals.reviewCount, 4);
  assert.equal(statistics.totals.successPercent, 75);
  assert.equal(statistics.totals.strongPercent, 50);
  assert.equal(statistics.totals.averageResponseSeconds, 2);
  assert.equal(statistics.totals.variantReviewCount, 1);
  assert.equal(statistics.totals.variantSuccessPercent, 0);
  assert.equal(statistics.ratingBreakdown.find((row) => row.rating === "again").count, 1);
  assert.equal(statistics.ratingBreakdown.find((row) => row.rating === "easy").percent, 25);
  assert.equal(statistics.recentDays.length, 4);
  assert.deepEqual(
    statistics.recentDays.map((day) => day.reviews),
    [0, 1, 1, 2],
  );
  assert.equal(statistics.deckRows[0].id, neuro.id);
  assert.equal(statistics.deckRows[0].successPercent, 67);
  assert.equal(statistics.weakDeckRows[0].id, neuro.id);
  assert.equal(statistics.latestReview.id, "review_easy");
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
