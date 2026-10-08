import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState, setCardSuspended } from "./coreModel.ts";
import { answerVariant, classifyDailyReviewProgress, createDailyReviewQueue, moveDailyReviewProgress, recordVariantFeedback } from "./reviewService.ts";
import type { Card, ReviewSchedulerState } from "./coreTypes.ts";

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
  assert.equal(variantResult.variant?.performance.avgResponseTimeMs, 1200);
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
