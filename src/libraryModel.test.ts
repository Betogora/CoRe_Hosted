import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";
import type { LearningItem } from "./coreTypes.ts";
import {
  type CardTableSort,
  createCardTableModel,
  createDeckLibraryModel,
  createStudyHeatmapModel,
  createStudyHeatmapWindow,
  getStudyHeatmapVisibleWeekCount,
} from "./libraryModel.ts";

function createDeckHierarchy(cards: LearningItem[] = []) {
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
  });
}

test("library model hides reviewable-card filtering and deck selection fallback", () => {
  const deck = createDeckWithInactiveCards();
  const library = createDeckLibraryModel([deck], {
    query: "medizin",
    coreMode: "auto",
    now: "2026-07-01T08:00:00.000Z",
  });

  assert.equal(library.dueCards, 1);
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
  assert.ok(parentRow);
  assert.equal(parentRow.depth, 0);
  assert.ok(childRow);
  assert.equal(childRow.depth, 1);
  assert.ok(childRow);
  assert.equal(childRow.parentDeckId, parent.id);
  assert.ok(parentRow);
  assert.deepEqual(parentRow.scopeDeckIds, [parent.id, child.id]);
  assert.ok(parentRow);
  assert.equal(parentRow.directSummary.totalCards, 0);
  assert.ok(parentRow);
  assert.equal(parentRow.summary.totalCards, 1);
  assert.ok(parentRow);
  assert.equal(parentRow.summary.newCards, 1);
  assert.ok(childRow);
  assert.equal(childRow.summary.totalCards, 1);
  assert.equal(library.dueCards, 1);
  assert.deepEqual(library.rows.map((row) => row.id), [parent.id, child.id]);
  assert.equal(library.rows[0].summary.totalCards, 1);
});

test("library model sorts every deck level alphabetically like Anki", () => {
  const root05 = createCoreDeck({ id: "root-05", name: "05", source: "manual", cards: [] });
  const root10 = createCoreDeck({ id: "root-10", name: "Stapel 10", source: "manual", cards: [] });
  const root9 = createCoreDeck({ id: "root-9", name: "Stapel 9", source: "manual", cards: [] });
  const child3 = createCoreDeck({ id: "child-3", parentDeckId: root05.id, name: "05.3", hierarchyPath: ["05", "05.3"], source: "manual", cards: [] });
  const child1 = createCoreDeck({ id: "child-1", parentDeckId: root05.id, name: "05.1", hierarchyPath: ["05", "05.1"], source: "manual", cards: [] });
  const child2 = createCoreDeck({ id: "child-2", parentDeckId: root05.id, name: "05.2", hierarchyPath: ["05", "05.2"], source: "manual", cards: [] });

  const library = createDeckLibraryModel([root9, child3, root05, child1, root10, child2]);

  assert.deepEqual(library.rows.map((row) => row.id), [
    root05.id,
    child1.id,
    child2.id,
    child3.id,
    root10.id,
    root9.id,
  ]);
});

test("card table preserves hierarchy and card order while including empty decks", () => {
  const cards = [
    createCoreCard({ id: "card-first", source: "manual", originalFront: "<b>Erste</b> Frage", originalBack: "Erste Antwort", originalTags: ["alpha"] }),
    createCoreCard({ id: "card-second", source: "manual", originalFront: "Zweite Frage", originalBack: "Gesuchte Rückseite", originalTags: ["beta"] }),
  ];
  const { parent, child } = createDeckHierarchy(cards);
  const model = createCardTableModel([parent, child]);

  assert.deepEqual(model.groups.map((group) => group.id), [parent.id, child.id]);
  assert.equal(model.groups[0].cardRows.length, 0);
  assert.deepEqual(model.groups[1].cardRows.map((row) => row.id), ["card-first", "card-second"]);
  assert.equal(model.groups[1].cardRows[0].frontPreview, "Erste Frage");
  assert.equal(model.groups[1].cardRows[1].backPreview, "Gesuchte Rückseite");

  const cardSearch = createCardTableModel([parent, child], { query: "gesuchte rückseite" });
  assert.deepEqual(cardSearch.groups.map((group) => group.id), [child.id]);
  assert.deepEqual(cardSearch.groups[0].cardRows.map((row) => row.id), ["card-second"]);

  const tagSearch = createCardTableModel([parent, child], { query: "beta" });
  assert.deepEqual(tagSearch.groups[0].cardRows.map((row) => row.id), ["card-second"]);

  const deckSearch = createCardTableModel([parent, child], { query: "medizin / anatomie" });
  assert.deepEqual(deckSearch.groups[0].cardRows.map((row) => row.id), ["card-first", "card-second"]);
});

test("card table sorts all columns and projects due and variant labels", () => {
  const newCard = createCoreCard({ id: "card-new", source: "manual", originalFront: "Äpfel", originalBack: "Neu" });
  const laterBase = createCoreCard({ id: "card-later", source: "manual", originalFront: "Zebra", originalBack: "Später" });
  const earlierBase = createCoreCard({
    id: "card-earlier",
    source: "manual",
    originalFront: "Berlin",
    originalBack: "Früher",
    variants: [{
      id: "variant-earlier",
      sourceCardId: "card-earlier",
      front: "Welche Stadt ist Berlin?",
      back: "Eine Hauptstadt.",
      qualityStatus: "active",
    }],
  });
  const laterState = { ...laterBase.reviewState, state: "review" as const, dueAt: "2026-09-20T08:00:00.000Z", reps: 2, lastReviewedAt: "2026-08-01T08:00:00.000Z" };
  const earlierState = { ...earlierBase.reviewState, state: "review" as const, dueAt: "2026-08-10T08:00:00.000Z", reps: 2, lastReviewedAt: "2026-08-01T08:00:00.000Z" };
  const later = { ...laterBase, reviewState: laterState, learningItemState: laterState };
  const earlier = { ...earlierBase, reviewState: earlierState, learningItemState: earlierState };
  const deck = createCoreDeck({ id: "deck-sort", name: "Sortierung", source: "manual", cards: [later, newCard, earlier] });

  const defaultRows = createCardTableModel([deck]).groups[0].cardRows;
  assert.deepEqual(defaultRows.map((row) => row.id), ["card-new", "card-earlier", "card-later"]);
  assert.deepEqual(defaultRows.map((row) => row.dueLabel), ["Neu", "10.08.2026", "20.09.2026"]);
  assert.deepEqual(defaultRows.map((row) => row.variantsLabel), ["Nein", "Ja", "Nein"]);

  for (const [cardSort, expected] of [
    [{ field: "sortField", direction: "desc" }, ["card-later", "card-earlier", "card-new"]],
    [{ field: "due", direction: "asc" }, ["card-earlier", "card-later", "card-new"]],
    [{ field: "due", direction: "desc" }, ["card-new", "card-later", "card-earlier"]],
    [{ field: "variants", direction: "asc" }, ["card-later", "card-new", "card-earlier"]],
    [{ field: "variants", direction: "desc" }, ["card-earlier", "card-later", "card-new"]],
  ] satisfies Array<[CardTableSort, string[]]>) {
    assert.deepEqual(createCardTableModel([deck], { cardSort }).groups[0].cardRows.map((row) => row.id), expected);
  }
});

test("card table does not truncate large libraries", () => {
  const cards = Array.from({ length: 4_900 }, (_, index) => createCoreCard({
    id: "large-card-" + index,
    source: "manual",
    originalFront: "Frage " + index,
    originalBack: "Antwort " + index,
  }));
  const deck = createCoreDeck({ id: "large-deck", name: "Groß", source: "manual", cards });
  const model = createCardTableModel([deck]);

  assert.equal(model.cardCount, 4_900);
  assert.equal(model.groups[0].cardRows.length, 4_900);
  assert.ok(model.groups[0].cardRows.some((row) => row.id === "large-card-4899"));
});

test("study heatmap counts learned cards by local day", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap",
    name: "Heatmap",
    source: "manual",
    cards: [],
    reviewEvents: [
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_1", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_1" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_2", answeredAt: "2026-07-07T09:00:00.000Z", learningItemId: "card_2" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_3", createdAt: "2026-07-06T10:00:00.000Z", learningItemId: "card_3" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_4", reviewedAt: "2026-07-04T10:00:00.000Z", learningItemId: "card_4" },
    ],
  });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
    weeks: 4,
  });
  const window = createStudyHeatmapWindow(heatmap);

  assert.equal(heatmap.totalWeekCount, 4);
  assert.equal([...heatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 4);
  assert.equal("activeDays" in heatmap, false);
  assert.equal("averagePerActiveDay" in heatmap, false);
  assert.equal("longestStreak" in heatmap, false);
  assert.ok(window.monthLabels.includes("Jul"));
  assert.equal(window.days.find((day) => day.key === "2026-07-07")?.count, 2);
  assert.equal(window.days.find((day) => day.key === "2026-07-07")?.level, 4);
});

test("study heatmap labels the visible year change on January", () => {
  const heatmap = createStudyHeatmapModel([], {
    now: "2026-02-10T12:00:00.000Z",
    weeks: 12,
  });
  const monthLabels = createStudyHeatmapWindow(heatmap).monthLabels.filter(Boolean);

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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_previous_year", reviewedAt: "2025-12-31T08:00:00.000Z", learningItemId: "card_previous_year" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_january", reviewedAt: "2026-01-02T08:00:00.000Z", learningItemId: "card_january" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_today", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_today" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_next_year", reviewedAt: "2027-01-01T08:00:00.000Z", learningItemId: "card_next_year" },
    ],
  });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
  });
  const window = createStudyHeatmapWindow(heatmap);

  assert.equal(heatmap.rangeStartKey, "2026-01-01");
  assert.equal(heatmap.rangeEndKey, "2026-12-31");
  assert.equal(heatmap.totalWeekCount, 53);
  assert.equal(window.days[0].key, "2025-12-29");
  assert.equal(window.days[0].isOutsideRange, true);
  assert.equal(window.days.at(-1)?.key, "2027-01-03");
  assert.equal(window.days.at(-1)?.isOutsideRange, true);
  assert.equal([...heatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 2);
  assert.equal(window.days.find((day) => day.key === "2025-12-31")?.count, 0);
  assert.equal(window.days.find((day) => day.key === "2026-01-02")?.count, 1);
  assert.equal(window.monthLabels.filter(Boolean)[0], "Jan 2026");
  assert.ok(window.monthLabels.includes("Dez"));
});

test("study heatmap window fits whole weeks to viewport width and navigates by arrows", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap_window",
    name: "Heatmap Window",
    source: "manual",
    cards: [],
    reviewEvents: [
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_latest", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_latest" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_previous", reviewedAt: "2026-06-11T08:00:00.000Z", learningItemId: "card_previous" },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      { id: "review_old", reviewedAt: "2025-08-05T08:00:00.000Z", learningItemId: "card_old" },
    ],
  });
  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
    weeks: 53,
  });

  assert.equal(getStudyHeatmapVisibleWeekCount(320, heatmap.totalWeekCount), 12);

  const latestWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320 });
  assert.equal(latestWindow.weeks.length, 12);
  assert.equal(latestWindow.days.length, 84);
  assert.equal(latestWindow.endWeekIndex, heatmap.totalWeekCount);
  assert.equal(latestWindow.canShowPrevious, true);
  assert.equal(latestWindow.canShowNext, false);
  assert.equal(latestWindow.days.reduce((sum, day) => sum + day.count, 0), 2);
  assert.equal(latestWindow.visibleRangeEndKey, "2026-07-12");

  const explicitDefaultWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320, endWeekIndex: null });
  assert.equal(explicitDefaultWindow.endWeekIndex, heatmap.totalWeekCount);
  assert.equal(explicitDefaultWindow.visibleRangeEndKey, "2026-07-12");

  const previousWindow = createStudyHeatmapWindow(heatmap, {
    viewportWidth: 320,
    endWeekIndex: latestWindow.previousEndWeekIndex,
  });

  assert.equal(previousWindow.weeks.length, 12);
  assert.equal(previousWindow.days.length, 84);
  assert.equal(previousWindow.endWeekIndex, latestWindow.endWeekIndex - 4);
  assert.equal(previousWindow.canShowNext, true);
  assert.equal(previousWindow.weeks.every((week) => week.length === 7), true);
});

test("study heatmap calendar year shows the whole year when possible and anchors narrow windows near today", () => {
  const heatmap = createStudyHeatmapModel([], {
    now: "2026-07-07T12:00:00.000Z",
  });

  assert.equal(getStudyHeatmapVisibleWeekCount(320, heatmap.totalWeekCount), 12);
  assert.equal(getStudyHeatmapVisibleWeekCount(900, heatmap.totalWeekCount), 37);
  assert.equal(getStudyHeatmapVisibleWeekCount(1_255, heatmap.totalWeekCount), heatmap.totalWeekCount);

  const fullYearWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 1_255 });
  assert.equal(fullYearWindow.weeks.length, heatmap.totalWeekCount);
  assert.equal(fullYearWindow.canShowPrevious, false);
  assert.equal(fullYearWindow.canShowNext, false);

  const narrowWindow = createStudyHeatmapWindow(heatmap, { viewportWidth: 320 });
  assert.equal(narrowWindow.weeks.length, 12);
  assert.equal(narrowWindow.endWeekIndex, heatmap.defaultEndWeekIndex);
  assert.equal(narrowWindow.canShowPrevious, true);
  assert.equal(narrowWindow.canShowNext, true);
  assert.equal(narrowWindow.days.some((day) => day.key === "2026-07-07"), true);
  assert.equal(narrowWindow.days.some((day) => day.key === "2026-12-31"), false);
});

test("study heatmap hides month labels that cannot fit completely at window edges", () => {
  const heatmap = createStudyHeatmapModel([], {
    now: "2026-07-07T12:00:00.000Z",
  });

  const lateFebruaryWindow = createStudyHeatmapWindow(heatmap, {
    viewportWidth: 128,
    endWeekIndex: 11,
  });
  assert.deepEqual(lateFebruaryWindow.monthLabels, ["", "Mär", "", ""]);

  const earlyAugustWindow = createStudyHeatmapWindow(heatmap, {
    viewportWidth: 128,
    endWeekIndex: 31,
  });
  assert.deepEqual(earlyAugustWindow.monthLabels, ["Jul", "", "", ""]);
});
