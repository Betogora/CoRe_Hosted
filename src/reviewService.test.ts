import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState, setCardSuspended } from "./coreModel.ts";
import { getSimulatedNow } from "./simulationClock.ts";
import { answerVariant, classifyDailyReviewProgress, createDailyReviewQueue, moveDailyReviewProgress, recordVariantFeedback } from "./reviewService.ts";
import type { Card, Deck, ReviewSchedulerState } from "./coreTypes.ts";

function basicCard(front = "Q", back = "A"): Card {
  return createBasicNote("deck", front, back).cards[0];
}

function cardInPhase(id: string, state: ReviewSchedulerState, dueAt: string): Card {
  return {
    ...basicCard(id),
    id,
    study: cardStudyFromReviewState(createReviewState({ state, dueAt, reps: state === "new" ? 0 : 2 })),
  };
}

test("dueAt sperrt Karten aller Lernphasen bis zum gewählten Lerntag", () => {
  const future = "2026-08-22T04:00:00.000Z";
  const cards = (["new", "learning", "relearning", "review"] as ReviewSchedulerState[]).map((phase) => cardInPhase(phase, phase, future));
  const deck = createCoreDeck({ id: "deck", cards });
  const before = createDailyReviewQueue(deck, { now: "2026-08-21T08:00:00.000Z", dayStartHour: 6, timeZone: "Europe/Berlin" });
  const onDay = createDailyReviewQueue(deck, { now: "2026-08-22T08:00:00.000Z", dayStartHour: 6, timeZone: "Europe/Berlin" });
  assert.equal(before.total, 0);
  assert.equal(onDay.total, 4);
});

test("ausgesetzte Karten erscheinen nicht in der Tagesqueue und lassen sich nicht bewerten", () => {
  const suspended = setCardSuspended(cardInPhase("suspended", "review", "2026-08-21T07:00:00.000Z"), true, "2026-08-21T07:30:00.000Z");
  const deck = createCoreDeck({ id: "deck", cards: [suspended, cardInPhase("active", "review", "2026-08-21T07:00:00.000Z")] });
  const queue = createDailyReviewQueue(deck, { now: "2026-08-21T08:00:00.000Z", timeZone: "UTC" });
  assert.deepEqual(queue.items.map((item) => item.cardId), ["active"]);
  assert.throws(() => answerVariant(deck, "suspended", null, "good", { now: "2026-08-21T08:00:00.000Z" }), /ausgesetzt/);
});

test("eine Tagesqueue vereinigt neue, offene und fällige Karten in der gewählten Reihenfolge", () => {
  const cards = [
    cardInPhase("new", "new", "2026-08-21T07:00:00.000Z"),
    cardInPhase("learning", "learning", "2026-08-21T07:05:00.000Z"),
    cardInPhase("review", "review", "2026-08-21T07:10:00.000Z"),
  ];
  const options = { now: "2026-08-21T08:00:00.000Z", timeZone: "UTC" };
  const reviewsFirst = createDailyReviewQueue(createCoreDeck({
    id: "deck",
    cards,
    deckSettings: { newReviewOrder: "reviews-first" },
  }), options);
  const newFirst = createDailyReviewQueue(createCoreDeck({
    id: "deck",
    cards,
    deckSettings: { newReviewOrder: "new-first" },
  }), options);

  assert.deepEqual(reviewsFirst.items.map((item) => item.cardId), ["learning", "review", "new"]);
  assert.deepEqual(newFirst.items.map((item) => item.cardId), ["new", "learning", "review"]);
  assert.equal(reviewsFirst.total, 3);
  assert.deepEqual(reviewsFirst.dailyProgress, {
    completedTodayCount: 0,
    newCount: 1,
    inProgressCount: 1,
    dueCount: 1,
    total: 3,
  });
});

test("eine normale Bewertung aktualisiert nur den Karten-Lernstatus", () => {
  const card = basicCard();
  const result = answerVariant(createCoreDeck({ id: "deck", cards: [card] }), card.id, null, "good", { now: "2026-08-20T08:00:00.000Z" });
  assert.equal(result.updatedCard.study.reps, 1);
  assert.equal(result.updatedCard.studyRevision, card.studyRevision + 1);
  assert.equal(result.updatedCard.revision, card.revision);
  assert.equal(result.event.cardId, card.id);
  assert.equal(result.event.deckId, "deck");
  assert.equal(result.event.variantId, null);
  assert.equal(result.variant, null);
  assert.deepEqual(result.deck.reviewEvents, [result.event]);
  assert.deepEqual(result.event.schedulerBefore, {
    card: {
      state: "new",
      dueAt: card.study.dueAt,
      intervalDays: 0,
      intervalMinutes: null,
      stability: 0,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      learningStepIndex: 0,
      lastReviewedAt: null,
    },
  });
  const after = (result.event.schedulerAfter as { card: Record<string, unknown> }).card;
  assert.equal(after.state, result.updatedCard.study.state);
  assert.equal(after.dueAt, result.updatedCard.study.dueAt);
  assert.equal(after.reps, 1);

  const withVariant = addCardVariant(card, { front: "Q2", back: "A2" });
  const variantId = withVariant.variants[0].id;
  const variantResult = answerVariant(createCoreDeck({ id: "deck", cards: [withVariant] }), card.id, variantId, "good", { now: "2026-08-20T08:00:00.000Z", responseTimeMs: 1200 });
  assert.equal(variantResult.updatedCard.study.reps, result.updatedCard.study.reps);
  assert.equal(variantResult.updatedCard.study.dueAt, result.updatedCard.study.dueAt);
  assert.equal(variantResult.event.variantId, variantId);
  assert.equal(variantResult.variant?.id, variantId);
  assert.equal(variantResult.variant?.performance.attempts, 1);
  assert.equal(variantResult.variant?.performance.averageResponseTimeMs, 1200);
  assert.equal("study" in variantResult.updatedCard.variants[0], false);
});

test("Bewertungen unbekannter Karten oder Varianten werden abgewiesen", () => {
  const card = basicCard();
  const deck = createCoreDeck({ id: "deck", cards: [card] });
  assert.throws(() => answerVariant(deck, "missing", null, "good"), /Karte nicht gefunden/);
  assert.throws(() => answerVariant(deck, card.id, "missing-variant", "good"), /Variante nicht gefunden/);
});

test("Variantenfeedback markiert oder deaktiviert nur die betroffene Variante", () => {
  const card = addCardVariant(addCardVariant(basicCard(), { id: "v1", front: "Q2", back: "A2" }), { id: "v2", front: "Q3", back: "A3" });
  const deck = createCoreDeck({ id: "deck", cards: [card] });
  const flagged = recordVariantFeedback(deck, { cardId: card.id, variantId: "v1" }, { feedbackType: "unklar_formuliert", note: "zu lang", now: "2026-08-20T08:00:00.000Z" });
  const flaggedVariant = flagged.updatedCard?.variants.find((variant) => variant.id === "v1");
  assert.equal(flaggedVariant?.qualityStatus, "flagged");
  assert.equal(flaggedVariant?.isActive, false);
  assert.deepEqual(flaggedVariant?.feedback.map((entry) => [entry.type, entry.note]), [["unklar_formuliert", "zu lang"]]);
  assert.equal(flagged.updatedCard?.variants.find((variant) => variant.id === "v2")?.qualityStatus, "active");
  assert.deepEqual(flagged.updatedCard?.study, card.study);

  const disabled = recordVariantFeedback(deck, { cardId: card.id, variantId: "v2" }, { action: "disable" });
  assert.equal(disabled.updatedCard?.variants.find((variant) => variant.id === "v2")?.qualityStatus, "disabled");

  const missing = recordVariantFeedback(deck, { cardId: card.id, variantId: "unknown" });
  assert.equal(missing.deck, deck);
  assert.equal(missing.updatedCard, null);
});

test("Tagesfortschritt verschiebt Karten zwischen offenem und erledigtem Anteil ohne Doppelzählung", () => {
  const initial = { completedTodayCount: 0, newCount: 1, inProgressCount: 5, dueCount: 1, total: 7 };
  const completedNew = moveDailyReviewProgress(initial, "new", "completed");
  const relearningDue = moveDailyReviewProgress(completedNew, "due", "in-progress");
  const completedDue = moveDailyReviewProgress(relearningDue, "in-progress", "completed");

  assert.deepEqual(completedNew, { completedTodayCount: 1, newCount: 0, inProgressCount: 5, dueCount: 1, total: 7 });
  assert.deepEqual(relearningDue, { completedTodayCount: 1, newCount: 0, inProgressCount: 6, dueCount: 0, total: 7 });
  assert.deepEqual(completedDue, { completedTodayCount: 2, newCount: 0, inProgressCount: 5, dueCount: 0, total: 7 });
});

test("Fortschrittsklassifizierung erhält Same-Day-Schritte offen und schließt Folgetagsschritte ab", () => {
  const now = "2026-08-21T08:00:00.000Z";
  const options = { timeZone: "UTC" };
  assert.equal(classifyDailyReviewProgress({ state: "new", reps: 0, dueAt: now }, false, now, options), "new");
  assert.equal(classifyDailyReviewProgress({ state: "review", reps: 2, dueAt: now }, false, now, options), "due");
  assert.equal(classifyDailyReviewProgress({ state: "learning", reps: 1, dueAt: "2026-08-21T08:20:00.000Z" }, true, now, options), "in-progress");
  assert.equal(classifyDailyReviewProgress({ state: "learning", reps: 1, dueAt: "2026-08-22T08:20:00.000Z" }, true, now, options), "completed");
  assert.equal(classifyDailyReviewProgress({ state: "review", reps: 2, dueAt: "2026-08-22T08:20:00.000Z" }, true, now, options), "completed");
});

const BURY_ALL = { buryNewSiblings: true, buryReviewSiblings: true, buryInterdayLearningSiblings: true };
const NOW = "2026-08-21T12:00:00.000Z";

function sibling(id: string, noteId: string, state: ReviewSchedulerState, { dueAt = "2026-08-21T07:00:00.000Z", lastReviewedAt = null as string | null } = {}): Card {
  return {
    ...basicCard(id),
    id,
    noteId,
    createdAt: `2026-08-01T00:00:${id.length.toString().padStart(2, "0")}.000Z`,
    study: cardStudyFromReviewState(createReviewState({ state, dueAt, reps: state === "new" ? 0 : 2, lastReviewedAt })),
  };
}

function queueIds(cards: Card[], deckSettings: Record<string, unknown> = {}, options: Parameters<typeof createDailyReviewQueue>[1] = {}) {
  const queue = createDailyReviewQueue(createCoreDeck({ id: "deck", cards, deckSettings }), { now: NOW, timeZone: "UTC", ...options });
  return { ids: queue.items.map((item) => item.cardId), buried: queue.buriedKeys, queue };
}

const siblingSet = () => [
  sibling("n-review", "note-n", "review"),
  sibling("n-new", "note-n", "new"),
  sibling("m-learning", "note-m", "learning", { dueAt: "2026-08-21T11:50:00.000Z", lastReviewedAt: "2026-08-21T11:40:00.000Z" }),
  sibling("m-review", "note-m", "review", { dueAt: "2026-08-21T06:00:00.000Z" }),
  sibling("p-new", "note-p", "new"),
];

test("ausgeschaltetes Begraben lässt die Tagesqueue unverändert", () => {
  const cards = siblingSet();
  const standard = queueIds(cards);
  const off = queueIds(cards, { buryNewSiblings: false, buryReviewSiblings: false, buryInterdayLearningSiblings: false });
  assert.deepEqual(off.ids, standard.ids);
  assert.deepEqual(off.queue.dailyProgress, standard.queue.dailyProgress);
  assert.deepEqual(standard.ids, ["m-learning", "m-review", "n-review", "n-new", "p-new"]);
  assert.deepEqual(standard.buried, []);
});

test("Begraben bevorzugt wie Anki Lernschritte, dann fällige und zuletzt neue Geschwister", () => {
  const all = queueIds(siblingSet(), { ...BURY_ALL, newReviewOrder: "new-first" });
  assert.deepEqual(all.ids, ["p-new", "m-learning", "n-review"], "Auch bei neuen Karten zuerst gewinnt das fällige Geschwister.");
  assert.deepEqual(all.buried.sort(), ["deck:m-review", "deck:n-new"]);
  assert.equal(all.queue.dailyProgress.total, 3);
  assert.equal(all.queue.limitSummary.reached, false);

  const onlyNew = queueIds(siblingSet(), { buryNewSiblings: true });
  assert.deepEqual(onlyNew.ids, ["m-learning", "m-review", "n-review", "p-new"]);

  const interday = [sibling("i-learning", "note-i", "learning", { dueAt: "2026-08-21T06:00:00.000Z", lastReviewedAt: "2026-08-20T09:00:00.000Z" }), sibling("i-review", "note-i", "review")];
  assert.deepEqual(queueIds(interday, { buryReviewSiblings: true }).ids, ["i-learning"]);
  assert.deepEqual(queueIds(interday.reverse(), { buryInterdayLearningSiblings: true }).ids, ["i-learning", "i-review"], "Das tagesübergreifende Lerngeschwister wird zuerst gesehen und begräbt nur mit der Review-Option.");
});

test("heute beantwortete Geschwister begraben bis zur Tagesgrenze, auch im Zeitsimulator", () => {
  const answered = sibling("a-answered", "note-a", "new");
  const answer = answerVariant(createCoreDeck({ id: "deck", cards: [answered] }), "a-answered", null, "easy", { now: "2026-08-21T07:00:00.000Z", dayStartHour: 6, timeZone: "UTC" });
  const deck = createCoreDeck({ id: "deck", cards: [sibling("a-new", "note-a", "new"), sibling("b-new", "note-b", "new")], deckSettings: { buryNewSiblings: true }, reviewEvents: [answer.event] });
  const answeredToday = [{ cardId: "a-answered", noteId: "note-a", deckId: "deck" }];
  const ids = (now: string) => createDailyReviewQueue(deck, { now, dayStartHour: 6, timeZone: "UTC", answeredToday }).items.map((item) => item.cardId);
  assert.deepEqual(ids(NOW), ["b-new"]);
  assert.deepEqual(ids("2026-08-22T05:59:00.000Z"), ["b-new"], "Vor dem Tagesbeginn um 6 Uhr gilt noch der alte Lerntag.");
  assert.deepEqual(ids("2026-08-22T06:00:00.000Z"), ["a-new", "b-new"]);
  assert.deepEqual(ids(getSimulatedNow(NOW, 24 * 60)), ["a-new", "b-new"], "Ein simulierter Folgetag hebt das Begraben auf.");
  assert.equal(deck.cards.find((card) => card.id === "a-new")!.study.dueAt, "2026-08-21T07:00:00.000Z", "Lernstand und Fälligkeit bleiben unverändert.");

  const loaded = createCoreDeck({ id: "deck", cards: [answer.updatedCard, sibling("a-new", "note-a", "new")], deckSettings: { buryNewSiblings: true }, reviewEvents: [answer.event] });
  assert.deepEqual(createDailyReviewQueue(loaded, { now: NOW, dayStartHour: 6, timeZone: "UTC" }).items.map((item) => item.cardId), [], "Eine Antwort in der laufenden Sitzung begräbt das noch offene Geschwister.");
});

test("Begraben folgt den Optionen des zuerst gesehenen Geschwisters über Unterstapel hinweg", () => {
  const decks = (parentSettings: Record<string, unknown>, childSettings: Record<string, unknown>) => [
    createCoreDeck({ id: "parent", name: "Eltern", cards: [sibling("p-new", "note-s", "new")], deckSettings: parentSettings }),
    createCoreDeck({ id: "child", name: "Eltern::Kind", parentDeckId: "parent", cards: [sibling("c-review", "note-s", "review")], deckSettings: childSettings }),
  ];
  const ids = (input: Deck[], deckId: string, options = {}) => createDailyReviewQueue(input, { deckId, now: NOW, timeZone: "UTC", ...options }).items.map((item) => item.cardId);
  assert.deepEqual(ids(decks(BURY_ALL, {}), "parent"), ["c-review", "p-new"], "Das fällige Geschwister im Unterstapel begräbt nicht, weil sein Stapel es nicht vorsieht.");
  assert.deepEqual(ids(decks(BURY_ALL, BURY_ALL), "parent"), ["c-review"]);
  const answeredInParent = [{ cardId: "p-other", noteId: "note-s", deckId: "parent" }];
  assert.deepEqual(ids(decks({}, BURY_ALL), "child", { answeredToday: answeredInParent }), [], "Eine Antwort außerhalb des gelernten Stapels gilt mit dessen Optionen.");
  assert.deepEqual(ids(decks({}, {}), "child", { answeredToday: answeredInParent }), ["c-review"]);
});

test("begrabene Karten verbrauchen keine Tageslimits", () => {
  const cards = [sibling("n-new-1", "note-n", "new"), sibling("n-new-2", "note-n", "new"), sibling("p-new", "note-p", "new"), sibling("q-new", "note-q", "new")]
    .map((card, index) => ({ ...card, createdAt: `2026-08-01T00:00:0${index}.000Z` }));
  const buried = queueIds(cards, { buryNewSiblings: true, newCardsPerDay: 2 });
  assert.deepEqual(buried.ids, ["n-new-1", "p-new"]);
  assert.deepEqual(buried.queue.limitSummary, { hiddenDueCount: 0, hiddenNewCount: 1, reached: true });
  assert.equal(buried.queue.availableNewCards, 3);
  const plain = queueIds(cards, { newCardsPerDay: 2 });
  assert.deepEqual(plain.ids, ["n-new-1", "n-new-2"]);
  assert.equal(plain.queue.limitSummary.hiddenNewCount, 2);
});
