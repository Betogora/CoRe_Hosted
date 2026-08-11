import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck, updateLearningItemStudyState } from "./coreModel.ts";
import type { LearningItem } from "./coreTypes.ts";
import {
  type CardTableSort,
  createCardTableModel,
  createDeckLibraryModel,
  createStudyHeatmapModel,
  createStudyHeatmapWindow,
} from "./libraryModel.ts";
import { createStudyHeatmapModelFromCounts } from "./studyHeatmapModel.ts";

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
  assert.equal(library.dueCards, 0);
  assert.deepEqual(library.rows.map((row) => row.id), [parent.id, child.id]);
  assert.equal(library.rows[0].summary.totalCards, 1);
});

test("library model keeps new, in-progress and due deck counts disjoint", () => {
  const card = (id: string, state: "new" | "learning" | "review" | "relearning", dueAt: string, reps: number) => createCoreCard({
    id,
    source: "manual",
    originalFront: id,
    originalBack: "Antwort",
    reviewState: { state, dueAt, reps },
  });
  const parent = createCoreDeck({
    id: "status_parent",
    name: "Status",
    source: "manual",
    cards: [card("learning", "learning", "2026-07-01T07:00:00.000Z", 1)],
  });
  const child = createCoreDeck({
    id: "status_child",
    parentDeckId: parent.id,
    name: "Unterstatus",
    source: "manual",
    cards: [
      card("new", "new", "2026-07-01T07:00:00.000Z", 0),
      card("relearning", "relearning", "2026-07-01T07:00:00.000Z", 3),
      card("due", "review", "2026-07-01T07:00:00.000Z", 3),
      card("future", "review", "2026-07-02T07:00:00.000Z", 3),
    ],
  });

  const library = createDeckLibraryModel([parent, child], { now: "2026-07-01T08:00:00.000Z" });
  const parentRow = library.rows.find((row) => row.id === parent.id);
  const childRow = library.rows.find((row) => row.id === child.id);

  assert.ok(parentRow);
  assert.deepEqual(
    {
      newCards: parentRow.summary.newCards,
      inProgressCards: parentRow.summary.inProgressCards,
      dueCards: parentRow.summary.dueCards,
      totalCards: parentRow.summary.totalCards,
    },
    { newCards: 1, inProgressCards: 2, dueCards: 1, totalCards: 5 },
  );
  assert.deepEqual(
    {
      newCards: parentRow.directSummary.newCards,
      inProgressCards: parentRow.directSummary.inProgressCards,
      dueCards: parentRow.directSummary.dueCards,
    },
    { newCards: 0, inProgressCards: 1, dueCards: 0 },
  );
  assert.ok(childRow);
  assert.deepEqual(
    {
      newCards: childRow.directSummary.newCards,
      inProgressCards: childRow.directSummary.inProgressCards,
      dueCards: childRow.directSummary.dueCards,
    },
    { newCards: 1, inProgressCards: 1, dueCards: 1 },
  );
  assert.equal(library.dueCards, 1);
});

test("deck counters and overall status distribution exclude blocked cards while the card table keeps them", () => {
  const card = (id: string, state: "new" | "learning" | "review" | "relearning", dueAt: string, reps: number) => createCoreCard({
    id,
    source: "manual",
    originalFront: id,
    originalBack: "Antwort",
    reviewState: { state, dueAt, reps },
  });
  const activeNew = card("active_new", "new", "2026-07-01T07:00:00.000Z", 0);
  const activeLearning = card("active_learning", "learning", "2026-07-01T10:00:00.000Z", 1);
  const activeRelearning = card("active_relearning", "relearning", "2026-07-02T10:00:00.000Z", 3);
  const activeDue = card("active_due", "review", "2026-07-01T07:00:00.000Z", 3);
  const activeDueAtNow = card("active_due_at_now", "review", "2026-07-01T08:00:00.000Z", 3);
  const activeLearned = card("active_learned", "review", "2026-07-02T08:00:00.000Z", 3);
  const suspendedLearning = updateLearningItemStudyState(
    card("suspended_learning", "learning", "2026-07-01T07:00:00.000Z", 1),
    { suspended: true },
  );
  const suspendedDue = updateLearningItemStudyState(
    card("suspended_due", "review", "2026-07-01T07:00:00.000Z", 3),
    { suspended: true },
  );
  const buriedDue = createCoreCard({
    ...card("buried_due", "review", "2026-07-01T07:00:00.000Z", 3),
    meta: { buried: true },
  });
  const deletedDue = createCoreCard({
    ...card("deleted_due", "review", "2026-07-01T07:00:00.000Z", 3),
    status: "deleted",
  });
  const draftDue = createCoreCard({
    ...card("draft_due", "review", "2026-07-01T07:00:00.000Z", 3),
    draftStatus: "draft",
  });
  const deck = createCoreDeck({
    id: "deck_suspended_counts",
    name: "Ausgesetzt",
    source: "manual",
    deckSettings: { newCardsPerDay: 1, maximumReviewsPerDay: 1 },
    cards: [
      activeNew,
      activeLearning,
      activeRelearning,
      activeDue,
      activeDueAtNow,
      activeLearned,
      suspendedLearning,
      suspendedDue,
      buriedDue,
      deletedDue,
      draftDue,
    ],
  });
  const library = createDeckLibraryModel([deck], { now: "2026-07-01T08:00:00.000Z" });
  const row = library.rows[0];
  const table = createCardTableModel([deck], { now: "2026-07-01T08:00:00.000Z" });

  assert.deepEqual(
    {
      newCards: row.summary.newCards,
      inProgressCards: row.summary.inProgressCards,
      dueCards: row.summary.dueCards,
      totalCards: row.summary.totalCards,
    },
    { newCards: 1, inProgressCards: 1, dueCards: 1, totalCards: 6 },
  );
  assert.deepEqual(row.statusDistribution, {
    newCards: 1,
    inProgressCards: 2,
    dueCards: 2,
    learnedCards: 1,
  });
  assert.deepEqual(row.directStatusDistribution, row.statusDistribution);
  assert.deepEqual(new Set(table.groups[0].cardRows.map((cardRow) => cardRow.id)), new Set([
    "active_due",
    "active_due_at_now",
    "active_learned",
    "active_learning",
    "active_new",
    "active_relearning",
    "buried_due",
    "suspended_due",
    "suspended_learning",
  ]));
  assert.equal(table.groups[0].cardRows.find((cardRow) => cardRow.id === "suspended_due")?.nextStudyLabel, "01.07.2026");
});

test("overall status distribution aggregates descendants while preserving direct deck values", () => {
  const parent = createCoreDeck({
    id: "distribution_parent",
    name: "Eltern",
    source: "manual",
    cards: [createCoreCard({ id: "parent_new", source: "manual", reviewState: { state: "new", reps: 0 } })],
  });
  const child = createCoreDeck({
    id: "distribution_child",
    parentDeckId: parent.id,
    name: "Kind",
    source: "manual",
    cards: [createCoreCard({
      id: "child_learned",
      source: "manual",
      reviewState: { state: "review", dueAt: "2026-07-02T08:00:00.000Z", reps: 3 },
    })],
  });
  const parentRow = createDeckLibraryModel([parent, child], { now: "2026-07-01T08:00:00.000Z" }).rows[0];

  assert.deepEqual(parentRow.directStatusDistribution, {
    newCards: 1,
    inProgressCards: 0,
    dueCards: 0,
    learnedCards: 0,
  });
  assert.deepEqual(parentRow.statusDistribution, {
    newCards: 1,
    inProgressCards: 0,
    dueCards: 0,
    learnedCards: 1,
  });
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

test("card table sorts all columns and projects next-study and variant labels", () => {
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
  assert.deepEqual(defaultRows.map((row) => row.nextStudyLabel), ["Neu", "10.08.2026", "20.09.2026"]);
  assert.deepEqual(defaultRows.map((row) => row.variantsLabel), ["Nein", "Ja", "Nein"]);

  for (const [cardSort, expected] of [
    [{ field: "sortField", direction: "desc" }, ["card-later", "card-earlier", "card-new"]],
    [{ field: "nextStudyDate", direction: "asc" }, ["card-earlier", "card-later", "card-new"]],
    [{ field: "nextStudyDate", direction: "desc" }, ["card-new", "card-later", "card-earlier"]],
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

test("study heatmap counts only rated reviews by profile day and derives the current streak", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap",
    name: "Heatmap",
    source: "manual",
    cards: [],
    reviewEvents: [
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_1", rating: "good", reviewedAt: "2026-07-07T08:00:00.000Z", learningItemId: "card_1" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_2", rating: "again", answeredAt: "2026-07-07T09:00:00.000Z", learningItemId: "card_2" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_3", rating: "hard", createdAt: "2026-07-06T10:00:00.000Z", learningItemId: "card_3" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_4", rating: "easy", reviewedAt: "2026-07-05T10:00:00.000Z", learningItemId: "card_4" },
// @ts-expect-error -- Eine fehlende Bewertung darf nicht als Lernfortschritt zählen.
      { id: "review_unrated", reviewedAt: "2026-07-04T10:00:00.000Z", learningItemId: "card_unrated" },
// @ts-expect-error -- Ein zukünftiges Review bleibt relativ zur simulierten Uhr unsichtbar.
      { id: "review_future", rating: "good", reviewedAt: "2026-07-08T10:00:00.000Z", learningItemId: "card_future" },
    ],
  });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-07-07T12:00:00.000Z",
    timeZone: "Europe/Berlin",
  });
  const window = createStudyHeatmapWindow(heatmap);

  assert.equal([...heatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 4);
  assert.equal(heatmap.firstActivityKey, "2026-07-05");
  assert.equal(heatmap.currentStreak, 3);
  assert.equal("activeDays" in heatmap, false);
  assert.equal("averagePerActiveDay" in heatmap, false);
  assert.equal("longestStreak" in heatmap, false);
  assert.equal(window.days.find((day) => day.key === "2026-07-07")?.count, 2);
  assert.equal(window.days.find((day) => day.key === "2026-07-07")?.level, 4);
  assert.equal(heatmap.countsByDay.has("2026-07-08"), false);
});

test("study heatmap forecasts each active learning item once by its next due day", () => {
  const forecastCard = createCoreCard({
    id: "card_forecast",
    source: "manual",
    originalFront: "Wann bin ich fällig?",
    originalBack: "Übermorgen.",
    reviewState: { state: "review", dueAt: "2026-08-07T22:30:00.000Z", repetitions: 2 },
    variants: [
      { id: "variant_forecast", sourceCardId: "card_forecast", front: "Variante", back: "Antwort", qualityStatus: "active" },
    ],
  });
  const excludedCards = [
    createCoreCard({ id: "card_deleted_forecast", source: "manual", status: "deleted", reviewState: { dueAt: "2026-08-08T08:00:00.000Z" } }),
    createCoreCard({ id: "card_suspended_forecast", source: "manual", status: "suspended", reviewState: { dueAt: "2026-08-08T08:00:00.000Z" } }),
    createCoreCard({ id: "card_draft_forecast", source: "manual", draftStatus: "draft", reviewState: { dueAt: "2026-08-08T08:00:00.000Z" } }),
    createCoreCard({ id: "card_buried_forecast", source: "manual", meta: { buried: true }, reviewState: { dueAt: "2026-08-08T08:00:00.000Z" } }),
    createCoreCard({ id: "card_too_late_forecast", source: "manual", reviewState: { dueAt: "2027-08-08T08:00:00.000Z" } }),
  ];
  const deck = createCoreDeck({ name: "Prognose", source: "manual", cards: [forecastCard, ...excludedCards] });

  const heatmap = createStudyHeatmapModel([deck], {
    now: "2026-08-06T10:00:00.000Z",
    timeZone: "Europe/Berlin",
  });

  assert.equal(heatmap.forecastEndKey, "2027-08-06");
  assert.deepEqual([...heatmap.forecastCountsByDay], [["2026-08-08", 1]]);
});

test("study heatmap defaults to the rolling last seven calendar days", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-08-12",
    countsByDay: new Map([["2026-08-01", 1], ["2026-08-12", 2]]),
  });
  const window = createStudyHeatmapWindow(heatmap);

  assert.equal(window.period, "week");
  assert.equal(window.rangeStartKey, "2026-08-06");
  assert.equal(window.rangeEndKey, "2026-08-12");
  assert.equal(window.days.length, 7);
  assert.equal(window.days[0].key, "2026-08-06");
  assert.equal(window.days.at(-1)?.key, "2026-08-12");
  assert.equal(window.days.every((day) => !day.isOutsideRange), true);
  assert.equal(window.canShowPrevious, true);
  assert.equal(window.canShowNext, true);
});

test("study heatmap projects complete calendar months and 53 or 54 week years", () => {
  const leapMonth = createStudyHeatmapWindow(createStudyHeatmapModelFromCounts({
    todayKey: "2028-02-15",
    countsByDay: new Map(),
  }), { period: "month" });
  assert.equal(leapMonth.rangeStartKey, "2028-02-01");
  assert.equal(leapMonth.rangeEndKey, "2028-02-29");
  assert.equal(leapMonth.days.filter((day) => !day.isOutsideRange).length, 29);
  assert.equal(leapMonth.days.length % 7, 0);

  const regularYear = createStudyHeatmapWindow(createStudyHeatmapModelFromCounts({
    todayKey: "2026-07-07",
    countsByDay: new Map(),
  }), { period: "year" });
  assert.equal(regularYear.rangeStartKey, "2026-01-01");
  assert.equal(regularYear.rangeEndKey, "2026-12-31");
  assert.equal(regularYear.weeks.length, 53);
  assert.equal(regularYear.days[0].isOutsideRange, true);
  assert.equal(regularYear.monthLabels.filter(Boolean)[0], "Jan 2026");

  const longLeapYear = createStudyHeatmapWindow(createStudyHeatmapModelFromCounts({
    todayKey: "2012-06-01",
    countsByDay: new Map(),
  }), { period: "year" });
  assert.equal(longLeapYear.weeks.length, 54);
});

test("study heatmap navigation moves whole periods across history and the 365-day forecast", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-07-07",
    countsByDay: new Map([["2026-06-11", 1], ["2026-07-07", 1]]),
  });

  const currentWeek = createStudyHeatmapWindow(heatmap, { period: "week" });
  const previousWeek = createStudyHeatmapWindow(heatmap, { period: "week", anchorKey: currentWeek.previousAnchorKey });
  assert.equal(previousWeek.rangeEndKey, "2026-06-30");
  assert.equal(previousWeek.canShowNext, true);

  const currentMonth = createStudyHeatmapWindow(heatmap, { period: "month" });
  const previousMonth = createStudyHeatmapWindow(heatmap, { period: "month", anchorKey: currentMonth.previousAnchorKey });
  assert.equal(previousMonth.rangeStartKey, "2026-06-01");
  assert.equal(previousMonth.canShowPrevious, false);
  assert.equal(previousMonth.canShowNext, true);
  assert.equal(currentMonth.canShowNext, true);

  const currentYear = createStudyHeatmapWindow(heatmap, { period: "year" });
  assert.equal(currentYear.canShowPrevious, false);
  assert.equal(currentYear.canShowNext, true);
});

test("study heatmap keeps forecast intensity separate and marks the final partial week", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-08-12",
    countsByDay: new Map([["2026-08-12", 100]]),
    forecastCountsByDay: new Map([
      ["2026-08-13", 1],
      ["2026-08-14", 4],
      ["2027-08-12", 2],
      ["2027-08-13", 8],
    ]),
  });
  const nextWeek = createStudyHeatmapWindow(heatmap, { period: "week", anchorKey: "2026-08-19" });

  assert.equal(nextWeek.maxCount, 0);
  assert.equal(nextWeek.maxForecastCount, 4);
  assert.equal(nextWeek.days.find((day) => day.key === "2026-08-13")?.forecastLevel, 2);
  assert.equal(nextWeek.days.find((day) => day.key === "2026-08-14")?.forecastLevel, 4);
  assert.equal(nextWeek.canShowPrevious, true);

  let finalWeek = createStudyHeatmapWindow(heatmap);
  while (finalWeek.canShowNext) {
    finalWeek = createStudyHeatmapWindow(heatmap, { period: "week", anchorKey: finalWeek.nextAnchorKey });
  }
  assert.equal(finalWeek.rangeStartKey, heatmap.forecastEndKey);
  assert.equal(finalWeek.days[0].isForecastAvailable, true);
  assert.equal(finalWeek.days[0].forecastCount, 2);
  assert.equal(finalWeek.days[1].isForecastAvailable, false);
  assert.equal(finalWeek.canShowPrevious, true);
});

test("study heatmap keeps yesterday's unbroken streak until the current day ends", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-07-07",
    countsByDay: new Map([["2026-07-05", 3], ["2026-07-06", 1], ["2026-07-08", 5]]),
  });

  assert.equal(heatmap.currentStreak, 2);
  assert.equal(heatmap.countsByDay.has("2026-07-08"), false);
});

test("study heatmap streak crosses calendar years and intensity follows the displayed period", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-01-01",
    countsByDay: new Map([
      ["2025-06-01", 100],
      ["2025-12-30", 1],
      ["2025-12-31", 1],
      ["2026-01-01", 2],
    ]),
  });

  assert.equal(heatmap.currentStreak, 3);
  const currentWeek = createStudyHeatmapWindow(heatmap, { period: "week" });
  assert.equal(currentWeek.maxCount, 2);
  assert.equal(currentWeek.days.find((day) => day.key === "2025-12-31")?.level, 3);
  assert.equal(currentWeek.days.find((day) => day.key === "2026-01-01")?.level, 4);

  const historicalMonth = createStudyHeatmapWindow(heatmap, { period: "month", anchorKey: "2025-06-01" });
  assert.equal(historicalMonth.maxCount, 100);
  assert.equal(historicalMonth.days.find((day) => day.key === "2025-06-01")?.level, 4);
});

test("library metrics, card dates and heatmap share the configured learning day", () => {
  const card = createCoreCard({
    id: "card_shifted_day",
    source: "manual",
    originalFront: "Frühe Karte",
    originalBack: "Antwort",
    reviewState: {
      state: "review",
      reps: 4,
      dueAt: "2026-07-11T00:30:00.000Z",
    },
  });
  const deck = createCoreDeck({
    id: "deck_shifted_day",
    name: "Verschobener Tag",
    source: "manual",
    cards: [card],
    reviewEvents: [{
      id: "event_shifted_day",
      deckId: "deck_shifted_day",
      learningItemId: card.id,
      answeredAt: "2026-07-11T00:30:00.000Z",
      rating: "good",
    }] as any,
  });
  const options = {
    now: "2026-07-11T00:45:00.000Z",
    timeZone: "Europe/Berlin",
    dayStartHour: 3,
  };

  const library = createDeckLibraryModel([deck], options);
  const table = createCardTableModel([deck], options);

  assert.equal(library.rows[0].statusDistribution.dueCards, 1);
  assert.equal(library.studyHeatmap.todayKey, "2026-07-10");
  assert.equal(library.studyHeatmap.countsByDay.get("2026-07-10"), 1);
  assert.equal(table.groups[0].cardRows[0].nextStudyLabel, "10.07.2026");
});
