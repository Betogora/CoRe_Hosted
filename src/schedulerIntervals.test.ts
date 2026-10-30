import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createDefaultDeckSettings, createReviewState } from "./coreModel.ts";
import { DEFAULT_EASY_DAYS } from "./easyDays.ts";
import { calculateRetrievability, createReviewChain, createReviewChainMemo, getDurabilityDays, getReviewButtonOptions, scheduleWithFsrs, simulateRatingOutcome } from "./scheduler.ts";

const now = "2026-08-21T10:00:00.000Z";

test("eine neue Karte durchläuft die Lernschritte vor dem längeren FSRS-7-Modellintervall; Leicht beendet die Lernphase", () => {
  const [card] = createBasicNote("deck", "Q", "A").cards;
  const options = getReviewButtonOptions(card, null, { now });
  assert.deepEqual(Object.keys(options), ["again", "hard", "good", "easy"]);
  assert.deepEqual([options.again, options.hard, options.good].map((option) => [option?.nextState, option?.intervalMinutes]), [["learning", 1], ["learning", 6], ["learning", 10]]);
  assert.equal(options.easy?.nextState, "review");
  assert.equal(getDurabilityDays({ state: "new", stability: 0, stabilityFast: 0, difficulty: 0 }), 0);
});

test("jede echte Bewertung erhöht Wiederholungen und setzt lastReviewedAt", () => {
  for (const rating of ["again", "hard", "good", "easy"] as const) {
    const state = createReviewState({ state: "review", dueAt: now, reps: 4, stability: 10, difficulty: 5 });
    const next = scheduleWithFsrs(state, rating, { now });
    assert.equal(next.reps, 5);
    assert.equal(next.lastReviewedAt, now);
    assert.equal(next.lastRating, rating);
  }
});

test("eine KI-Darstellung ändert nicht die FSRS-Planung der Karte", () => {
  const [base] = createBasicNote("deck", "Q", "A").cards;
  const card = addCardVariant({ ...base, study: cardStudyFromReviewState(createReviewState({ state: "review", dueAt: now, reps: 4 })) }, { front: "Q2", back: "A2" });
  const deckSettings = createDefaultDeckSettings();
  const original = simulateRatingOutcome({ card, variant: null, rating: "good", now, deckSettings });
  const variant = simulateRatingOutcome({ card, variant: card.variants[0], rating: "good", now, deckSettings });
  assert.equal(original.previousReviewState.reps, 4);
  for (const key of ["state", "dueAt", "stability", "difficulty", "reps", "lapses", "intervalDays"] as const) {
    assert.equal(variant.nextReviewState[key], original.nextReviewState[key], key);
  }
});

test("Retrievability bleibt auf den Bereich null bis eins begrenzt", () => {
  const state = createReviewState({ state: "review", stability: 20, difficulty: 5, lastReviewedAt: "2026-08-01T10:00:00.000Z" });
  const value = calculateRetrievability(state, now);
  assert.equal(value >= 0 && value <= 1, true);
});

test("Prognoseketten planen jede Antwort wie scheduleWithFsrs, auch mit Easy Days, Wiederlernschritten und geteilten Ergebnissen", () => {
  const deckSettings = createDefaultDeckSettings(), ratings = ["again", "hard", "good", "easy"] as const;
  const easyDaysContext = { easyDays: { ...DEFAULT_EASY_DAYS, saturday: "minimum", sunday: "reduced" } as const, dueCountsByDay: new Map([["2026-09-02", 40]]), timeZone: "Europe/Berlin", dayStartHour: 3 };
  const starts = [
    createReviewState({ state: "new", reps: 0, dueAt: now }),
    createReviewState({ state: "review", dueAt: now, reps: 6, lapses: 1, stability: 14, stabilityFast: 5, difficulty: 7.2, intervalDays: 12, lastReviewedAt: "2026-08-09T18:30:00.000Z" }),
    createReviewState({ state: "relearning", dueAt: now, reps: 9, stability: 2, difficulty: 8, learningStepIndex: 0, lastReviewedAt: "2026-08-21T09:50:00.000Z" }),
  ];
  // Each start runs a second time five days and 17 minutes later; with the shared memo it reuses the first run's library results.
  const shifted = (state: typeof starts[number], ms: number) => ({ ...state, dueAt: new Date(Date.parse(state.dueAt) + ms).toISOString(), lastReviewedAt: state.lastReviewedAt && new Date(Date.parse(state.lastReviewedAt) + ms).toISOString() });
  for (const context of [{ timeZone: "UTC", dayStartHour: 0 }, { timeZone: "Europe/Berlin", dayStartHour: 3, easyDaysContext }]) {
    const memo = createReviewChainMemo();
    for (const [index, start] of [...starts, ...starts.map((state) => shifted(state, 5 * 86_400_000 + 17 * 60_000))].entries()) {
      let state = start, seed = index % starts.length + 1;
      const chain = createReviewChain(start, { ...context, deckSettings }, memo);
      for (let answer = 0; answer < 40; answer++) {
        seed = (seed * 48271) % 2147483647;
        const rating = ratings[seed % 4], at = new Date(Math.max(Date.parse(state.dueAt), Date.parse(state.lastReviewedAt ?? now) + 60_000));
        const due = chain.review(rating, at);
        state = scheduleWithFsrs(state, rating, { now: at.toISOString(), ...context, deckSettings });
        assert.equal(due, Date.parse(state.dueAt), `${context.timeZone} ${index} ${answer}`);
      }
      const examDay = new Date(Date.parse(state.dueAt) + 3 * 86_400_000);
      assert.equal(chain.retrievability(examDay), calculateRetrievability(state, examDay));
    }
  }
});
