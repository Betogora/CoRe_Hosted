import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState, setCardSuspended } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import {
  type CardTableSort,
  createCardTableModel,
  createDeckLibraryModel,
  createStudyHeatmapModel,
  createStudyHeatmapWindow,
} from "./libraryModel.ts";
import { createStudyHeatmapModelFromCounts } from "./studyHeatmapModel.ts";

const notesById = new Map<string, Note>();

/** A basic card with its note registered in `notesById`; `study` is the flat scheduler input. */
function libraryCard(id: string, {
  front = id,
  back = "Antwort",
  tags = [],
  study,
  createdAt,
}: { front?: string; back?: string; tags?: string[]; study?: Record<string, unknown>; createdAt?: string } = {}): Card {
  const { note, cards } = createBasicNote("deck", front, back, { tags, createdAt });
  notesById.set(note.id, note);
  return { ...cards[0], id, ...(study ? { study: cardStudyFromReviewState(createReviewState(study)) } : {}) };
}

function deleted(card: Card, deletedAt = "2026-06-30T08:00:00.000Z"): Card {
  return { ...card, deletedAt };
}

function createDeckHierarchy(cards: Card[] = []) {
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
  const active = addCardVariant(libraryCard("card_active", {
    front: "<b>Welche Funktion hat Myelin?</b>",
    back: "Myelin isoliert Axone und beschleunigt die Erregungsleitung.",
    tags: ["neuro"],
    study: { dueAt: "2026-07-01T07:00:00.000Z", reps: 4, maturityXp: 142 },
  }), {
    id: "variant_active",
    front: "Beschreibe die Funktion von Myelin.",
    back: "Myelin isoliert Axone und beschleunigt die Erregungsleitung.",
  });
  const deletedCard = deleted(libraryCard("card_deleted", {
    front: "Gelöschte Karte",
    back: "Soll nicht zählen.",
    study: { dueAt: "2026-07-01T07:00:00.000Z", reps: 4, maturityXp: 142 },
  }));

  return createCoreDeck({
    id: "deck_neuro",
    name: "Neuro::Myelin",
    source: "manual",
    hierarchyPath: ["Medizin", "Neuro", "Myelin"],
    deckSettings: { coreMode: "on" },
    cards: [active, deletedCard],
  });
}

test("library model hides reviewable-card filtering", () => {
  const deck = createDeckWithInactiveCards();
  const library = createDeckLibraryModel([deck], { now: "2026-07-01T08:00:00.000Z" });
  const [row] = library.rows;

  assert.equal(row.directSummary.dueCards, 1);
  assert.equal(row.path, "Medizin / Neuro / Myelin");
  assert.equal(row.coreMode, "on");
  assert.equal(row.summary.totalCards, 1);
  assert.equal(row.summary.activeVariants, 1);

  const table = createCardTableModel([deck], { now: "2026-07-01T08:00:00.000Z", notesById });
  assert.deepEqual(table.groups[0].cardRows.map((row) => row.id), ["card_active"]);
  assert.equal(table.groups[0].cardRows[0].frontPreview, "Welche Funktion hat Myelin?");
});

test("card table shows a placeholder preview for cards without a loaded note", () => {
  const deck = createDeckWithInactiveCards();
  const table = createCardTableModel([deck], { now: "2026-07-01T08:00:00.000Z" });
  assert.equal(table.groups[0].cardRows[0].frontPreview, "Leere Karte");
  assert.equal(table.groups[0].cardRows[0].hasActiveVariants, true);
});

test("library model projects deck hierarchies with aggregate parent summaries", () => {
  const childCard = libraryCard("card_child", {
    front: "Was ist ATP?",
    back: "Ein Energieträger.",
    study: { dueAt: "2026-07-01T07:00:00.000Z", reps: 0 },
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
  assert.equal(childRow.parentDeckId, parent.id);
  assert.equal(parentRow.descendantCount, 1);
  assert.equal(parentRow.directSummary.totalCards, 0);
  assert.equal(parentRow.summary.totalCards, 1);
  assert.equal(parentRow.summary.newCards, 1);
  assert.equal(childRow.summary.totalCards, 1);
  assert.equal(library.rows.reduce((total, row) => total + row.directSummary.dueCards, 0), 0);
  assert.deepEqual(library.rows.map((row) => row.id), [parent.id, child.id]);
  assert.equal(library.rows[0].summary.totalCards, 1);
});

test("library model keeps new, in-progress and due deck counts disjoint", () => {
  const card = (id: string, state: "new" | "learning" | "review" | "relearning", dueAt: string, reps: number) => libraryCard(id, { study: { state, dueAt, reps } });
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
  assert.equal(library.rows.reduce((total, row) => total + row.directSummary.dueCards, 0), 1);
});

test("daily learning plan aggregates sorted root sessions without counting descendants twice", () => {
  const parent = createCoreDeck({
    id: "root-alpha",
    name: "Alpha",
    source: "manual",
    deckSettings: { newCardsPerDay: 2, maximumReviewsPerDay: 2 },
    cards: [],
  });
  const child = createCoreDeck({
    id: "child-alpha",
    parentDeckId: parent.id,
    name: "Kind",
    source: "manual",
    cards: [libraryCard("new-child", { study: { state: "new", dueAt: "2026-07-01T07:00:00.000Z", reps: 0 } })],
  });
  const secondRoot = createCoreDeck({
    id: "root-beta",
    name: "Beta",
    source: "manual",
    cards: [libraryCard("due-root", { study: { state: "review", dueAt: "2026-07-01T07:00:00.000Z", reps: 3 } })],
  });

  const plan = createDeckLibraryModel([secondRoot, child, parent], { now: "2026-07-01T08:00:00.000Z" }).dailyLearningPlan;

  assert.deepEqual(plan.sessions.map((session) => session.deckId), [parent.id, secondRoot.id]);
  assert.deepEqual(plan.progress, {
    completedTodayCount: 0,
    newCount: 1,
    inProgressCount: 0,
    dueCount: 1,
    total: 2,
  });
  assert.equal(plan.firstStartableDeckId, parent.id);
  assert.equal(plan.status, "open");
});

test("daily learning plan separates future same-day learning from currently startable cards", () => {
  const deck = createCoreDeck({
    id: "root-waiting",
    name: "Warten",
    source: "manual",
    cards: [libraryCard("waiting-item", { study: { state: "learning", dueAt: "2026-07-01T10:00:00.000Z", reps: 1 } })],
  });

  const plan = createDeckLibraryModel([deck], {
    now: "2026-07-01T08:00:00.000Z",
    learnAheadMinutes: 20,
  }).dailyLearningPlan;

  assert.equal(plan.status, "waiting");
  assert.equal(plan.firstStartableDeckId, null);
  assert.equal(plan.progress.inProgressCount, 1);
  assert.equal(plan.sessions[0].startableCount, 0);
});

test("daily learning sessions expose only new cards beyond the selected daily limit as additional stock", () => {
  const deck = createCoreDeck({
    id: "root-extra",
    name: "Zusatz",
    source: "manual",
    deckSettings: { newCardsPerDay: 1 },
    cards: [1, 2, 3].map((number) => libraryCard(`new-${number}`, { study: { state: "new", dueAt: "2026-07-01T07:00:00.000Z", reps: 0 } })),
  });

  const session = createDeckLibraryModel([deck], { now: "2026-07-01T08:00:00.000Z" }).dailyLearningPlan.sessions[0];

  assert.equal(session.progress.newCount, 1);
  assert.equal(session.startableCount, 1);
  assert.equal(session.additionalNewCount, 2);
  assert.equal(session.effectiveNewLimit, 1);
  assert.equal(session.introducedTodayCount, 0);
});

test("deck counters and overall status distribution exclude blocked cards while the card table keeps suspended ones", () => {
  const card = (id: string, state: "new" | "learning" | "review" | "relearning", dueAt: string, reps: number) => libraryCard(id, { study: { state, dueAt, reps } });
  const activeNew = card("active_new", "new", "2026-07-01T07:00:00.000Z", 0);
  const activeLearning = card("active_learning", "learning", "2026-07-01T10:00:00.000Z", 1);
  const activeRelearning = card("active_relearning", "relearning", "2026-07-02T10:00:00.000Z", 3);
  const activeDue = card("active_due", "review", "2026-07-01T07:00:00.000Z", 3);
  const activeDueAtNow = card("active_due_at_now", "review", "2026-07-01T08:00:00.000Z", 3);
  const activeLearned = card("active_learned", "review", "2026-07-02T08:00:00.000Z", 3);
  const suspendedLearning = setCardSuspended(card("suspended_learning", "learning", "2026-07-01T07:00:00.000Z", 1), true);
  const suspendedDue = setCardSuspended(card("suspended_due", "review", "2026-07-01T07:00:00.000Z", 3), true);
  const deletedDue = deleted(card("deleted_due", "review", "2026-07-01T07:00:00.000Z", 3));
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
      deletedDue,
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
    { newCards: 0, inProgressCards: 1, dueCards: 1, totalCards: 6 },
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
    "suspended_due",
    "suspended_learning",
  ]));
  assert.equal(table.groups[0].cardRows.find((cardRow) => cardRow.id === "suspended_due")?.nextStudyLabel, "01.07.2026");
  assert.equal(table.groups[0].cardRows.find((cardRow) => cardRow.id === "suspended_due")?.entry.reviewable, false);
});

test("overall status distribution aggregates descendants while preserving direct deck values", () => {
  const parent = createCoreDeck({
    id: "distribution_parent",
    name: "Eltern",
    source: "manual",
    cards: [libraryCard("parent_new", { study: { state: "new", reps: 0 } })],
  });
  const child = createCoreDeck({
    id: "distribution_child",
    parentDeckId: parent.id,
    name: "Kind",
    source: "manual",
    cards: [libraryCard("child_learned", { study: { state: "review", dueAt: "2026-07-02T08:00:00.000Z", reps: 3 } })],
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
    libraryCard("card-first", { front: "<b>Erste</b> Frage", back: "Erste Antwort", tags: ["alpha"] }),
    libraryCard("card-second", { front: "Zweite Frage", back: "Gesuchte Rückseite", tags: ["beta"] }),
  ];
  const { parent, child } = createDeckHierarchy(cards);
  const model = createCardTableModel([parent, child], { notesById });

  assert.deepEqual(model.groups.map((group) => group.id), [parent.id, child.id]);
  assert.equal(model.groups[0].cardRows.length, 0);
  assert.deepEqual(model.groups[1].cardRows.map((row) => row.id), ["card-first", "card-second"]);
  assert.equal(model.groups[1].cardRows[0].frontPreview, "Erste Frage");

  const cardSearch = createCardTableModel([parent, child], { query: "gesuchte rückseite", notesById });
  assert.deepEqual(cardSearch.groups.map((group) => group.id), [child.id]);
  assert.deepEqual(cardSearch.groups[0].cardRows.map((row) => row.id), ["card-second"]);

  const tagSearch = createCardTableModel([parent, child], { query: "beta", notesById });
  assert.deepEqual(tagSearch.groups[0].cardRows.map((row) => row.id), ["card-second"]);

  const deckSearch = createCardTableModel([parent, child], { query: "medizin / anatomie", notesById });
  assert.deepEqual(deckSearch.groups[0].cardRows.map((row) => row.id), ["card-first", "card-second"]);
});

test("deck and card searches use the complete logical hierarchy path", () => {
  const hierarchyPath = Array.from({ length: 12 }, (_, index) => `Ebene ${index + 1}`);
  const deck = createCoreDeck({
    id: "deep-deck",
    name: hierarchyPath.at(-1)!,
    source: "anki-apkg",
    hierarchyPath,
    cards: [libraryCard("source-card", { front: "Frage", back: "Antwort" })],
  });

  assert.deepEqual(createCardTableModel([deck], { query: "ebene 10 / ebene 11 / ebene 12", notesById }).groups.map((group) => group.id), [deck.id]);
});

test("library model projects a large deep hierarchy iteratively with logical depths and aggregates", () => {
  const deepDecks = Array.from({ length: 2_000 }, (_, index) => createCoreDeck({
    id: `deep-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `deep-${index}`,
    hierarchyPath: [`Ebene ${index + 1}`],
    source: "manual",
    cards: [],
  }));

  const rows = createDeckLibraryModel(deepDecks).rows;
  assert.equal(rows.length, deepDecks.length);
  assert.equal(rows.at(-1)?.depth, deepDecks.length - 1);
  assert.equal(rows[0].descendantCount, deepDecks.length - 1);
  assert.equal(rows[1].descendantCount, deepDecks.length - 2);
  assert.equal(rows.at(-1)?.descendantCount, 0);
});

test("card table sorts all columns and projects next-study labels and variant status", () => {
  const newCard = libraryCard("card-new", { front: "Äpfel", back: "Neu" });
  const later = libraryCard("card-later", {
    front: "Zebra",
    back: "Später",
    study: { state: "review", dueAt: "2026-09-20T08:00:00.000Z", reps: 2, lastReviewedAt: "2026-08-01T08:00:00.000Z" },
  });
  const earlier = addCardVariant(libraryCard("card-earlier", {
    front: "Berlin",
    back: "Früher",
    study: { state: "review", dueAt: "2026-08-10T08:00:00.000Z", reps: 2, lastReviewedAt: "2026-08-01T08:00:00.000Z" },
  }), { id: "variant-earlier", front: "Welche Stadt ist Berlin?", back: "Eine Hauptstadt." });
  const deck = createCoreDeck({ id: "deck-sort", name: "Sortierung", source: "manual", cards: [later, newCard, earlier] });

  const defaultRows = createCardTableModel([deck], { notesById }).groups[0].cardRows;
  assert.deepEqual(defaultRows.map((row) => row.id), ["card-new", "card-earlier", "card-later"]);
  assert.deepEqual(defaultRows.map((row) => row.nextStudyLabel), ["Neu", "10.08.2026", "20.09.2026"]);
  assert.deepEqual(defaultRows.map((row) => row.hasActiveVariants), [false, true, false]);

  for (const [cardSort, expected] of [
    [{ field: "sortField", direction: "desc" }, ["card-later", "card-earlier", "card-new"]],
    [{ field: "nextStudyDate", direction: "asc" }, ["card-earlier", "card-later", "card-new"]],
    [{ field: "nextStudyDate", direction: "desc" }, ["card-new", "card-later", "card-earlier"]],
    [{ field: "variants", direction: "asc" }, ["card-later", "card-new", "card-earlier"]],
    [{ field: "variants", direction: "desc" }, ["card-earlier", "card-later", "card-new"]],
  ] satisfies Array<[CardTableSort, string[]]>) {
    assert.deepEqual(createCardTableModel([deck], { cardSort, notesById }).groups[0].cardRows.map((row) => row.id), expected);
  }
});

test("card table pages large libraries and finds late cards deterministically", () => {
  const cards = Array.from({ length: 10_000 }, (_, index) => libraryCard("large-card-" + index, {
    front: "Frage " + index,
    back: "Antwort " + index,
  }));
  const deck = createCoreDeck({ id: "large-deck", name: "Groß", source: "manual", cards });
  const model = createCardTableModel([deck], { notesById });

  assert.equal(model.cardCount, 10_000);
  assert.equal(model.groups[0].cardRows.length, 50);
  assert.equal(model.groups[0].pageCount, 200);

  const lateMatch = createCardTableModel([deck], { query: "Frage 9999", notesById });
  assert.equal(lateMatch.cardCount, 1);
  assert.deepEqual(lateMatch.groups[0].cardRows.map((row) => row.id), ["large-card-9999"]);

  const secondPage = createCardTableModel([deck], { notesById, cardPageByDeckId: { [deck.id]: 1 } });
  assert.equal(secondPage.groups[0].page, 1);
  assert.equal(secondPage.groups[0].cardRows.length, 50);
  assert.notDeepEqual(secondPage.groups[0].cardRows.map((row) => row.id), model.groups[0].cardRows.map((row) => row.id));
});

test("study heatmap counts only rated reviews by profile day and derives the current streak", () => {
  const deck = createCoreDeck({
    id: "deck_heatmap",
    name: "Heatmap",
    source: "manual",
    cards: [],
    reviewEvents: [
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_1", rating: "good", answeredAt: "2026-07-07T08:00:00.000Z", cardId: "card_1" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_2", rating: "again", answeredAt: "2026-07-07T09:00:00.000Z", cardId: "card_2" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_3", rating: "hard", createdAt: "2026-07-06T10:00:00.000Z", cardId: "card_3" },
// @ts-expect-error -- Die Fixture prüft bewusst nur die von der Heatmap benötigte Laufzeitform.
      { id: "review_4", rating: "easy", answeredAt: "2026-07-05T10:00:00.000Z", cardId: "card_4" },
// @ts-expect-error -- Eine manuelle Neuplanung darf nicht als Lernfortschritt zählen.
      { id: "review_manual", rating: "manual", answeredAt: "2026-07-07T10:00:00.000Z", cardId: "card_4" },
// @ts-expect-error -- Eine fehlende Bewertung darf nicht als Lernfortschritt zählen.
      { id: "review_unrated", reviewedAt: "2026-07-04T10:00:00.000Z", cardId: "card_unrated" },
// @ts-expect-error -- Ein zukünftiges Review bleibt relativ zur simulierten Uhr unsichtbar.
      { id: "review_future", rating: "good", reviewedAt: "2026-07-08T10:00:00.000Z", cardId: "card_future" },
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

test("study heatmap forecasts each active card once by its next due day", () => {
  const forecastCard = addCardVariant(libraryCard("card_forecast", {
    front: "Wann bin ich fällig?",
    back: "Übermorgen.",
    study: { state: "review", dueAt: "2026-08-07T22:30:00.000Z", reps: 2 },
  }), { id: "variant_forecast", front: "Variante", back: "Antwort" });
  const excludedCards = [
    deleted(libraryCard("card_deleted_forecast", { study: { dueAt: "2026-08-08T08:00:00.000Z" } })),
    setCardSuspended(libraryCard("card_suspended_forecast", { study: { dueAt: "2026-08-08T08:00:00.000Z" } }), true),
    libraryCard("card_too_late_forecast", { study: { dueAt: "2027-08-08T08:00:00.000Z" } }),
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
  const card = libraryCard("card_shifted_day", {
    front: "Frühe Karte",
    back: "Antwort",
    study: { state: "review", reps: 4, dueAt: "2026-07-11T00:30:00.000Z" },
  });
  const deck = createCoreDeck({
    id: "deck_shifted_day",
    name: "Verschobener Tag",
    source: "manual",
    cards: [card],
    reviewEvents: [{
      id: "event_shifted_day",
      deckId: "deck_shifted_day",
      cardId: card.id,
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
  const heatmap = createStudyHeatmapModel([deck], options);
  const table = createCardTableModel([deck], options);

  assert.equal(library.rows[0].statusDistribution.dueCards, 1);
  assert.equal(heatmap.todayKey, "2026-07-10");
  assert.equal(heatmap.countsByDay.get("2026-07-10"), 1);
  assert.equal(table.groups[0].cardRows[0].nextStudyLabel, "10.07.2026");
});
