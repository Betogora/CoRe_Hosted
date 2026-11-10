import assert from "node:assert/strict";
import test from "node:test";
import { cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState, setCardSuspended } from "./coreModel.ts";
import type { Card, ReviewSchedulerState } from "./coreTypes.ts";
import { answerPractice, createHitSessionDecks, createPractice, HIT_SESSION_DECK_ID, hitStudyQuery } from "./hitStudySession.ts";
import { HIT_REVIEW_KIND } from "./reviewEventKinds.ts";
import { answerVariant, createDailyReviewQueue } from "./reviewService.ts";

const NOW = "2026-11-10T10:00:00.000Z";
const LATER = "2026-12-20T00:00:00.000Z";

function card(id: string, deckId: string, state: ReviewSchedulerState, dueAt = NOW): Card {
  const base = createBasicNote(deckId, id, "A").cards[0];
  return { ...base, id, deckId, study: cardStudyFromReviewState(createReviewState({ state, dueAt, reps: state === "new" ? 0 : 3, lastReviewedAt: state === "new" ? null : "2026-11-01T10:00:00.000Z" })) };
}

test("Treffer lernen lernt alle Treffer ohne Fälligkeit und Tageslimits in Listenreihenfolge über Stapel hinweg (KV5)", () => {
  const decks = [
    createCoreDeck({ id: "a", name: "A", deckSettings: { newCardsPerDay: 1, maximumReviewsPerDay: 1 } }),
    createCoreDeck({ id: "b", name: "B" }),
  ];
  const cards = [card("b-new", "b", "new"), card("a-later", "a", "review", LATER), card("a-new-1", "a", "new"), card("a-new-2", "a", "new"), setCardSuspended(card("a-suspended", "a", "review"), true)];
  const session = createHitSessionDecks(decks, cards, "list", NOW);
  assert.equal(session[0].id, HIT_SESSION_DECK_ID);
  assert.deepEqual(session.slice(1).map((deck) => [deck.id, deck.parentDeckId, deck.deckSettings]), [["b", HIT_SESSION_DECK_ID, decks[1].deckSettings], ["a", HIT_SESSION_DECK_ID, decks[0].deckSettings]], "jede Karte behält die Optionen ihres Stapels");

  const queue = createDailyReviewQueue(session, { deckId: HIT_SESSION_DECK_ID, now: NOW, timeZone: "UTC" });
  assert.deepEqual(queue.items.map((item) => item.cardId), ["b-new", "a-later", "a-new-1", "a-new-2"], "noch nicht fällige und neue Karten über dem Limit; ausgesetzte nie");

  const shuffled = createHitSessionDecks(decks, cards.slice(0, 4), "shuffled", NOW, () => 0);
  assert.deepEqual(createDailyReviewQueue(shuffled, { deckId: HIT_SESSION_DECK_ID, now: NOW, timeZone: "UTC" }).items.map((item) => item.cardId), ["a-later", "a-new-1", "a-new-2", "b-new"]);
});

test("Bewertungen aus Treffer lernen verbrauchen keine Tageslimits (KV5)", () => {
  const deck = createCoreDeck({ id: "a", name: "A", deckSettings: { newCardsPerDay: 2 }, cards: [card("first", "a", "new"), card("second", "a", "new"), card("third", "a", "new")] });
  const answer = (flags?: Record<string, unknown>) => answerVariant(deck, "first", null, "good", { now: NOW, timeZone: "UTC", flags }).deck;
  const counted = createDailyReviewQueue(answer(), { now: NOW, timeZone: "UTC" });
  const hit = createDailyReviewQueue(answer({ kind: HIT_REVIEW_KIND }), { now: NOW, timeZone: "UTC" });
  assert.deepEqual([counted.newCardsIntroducedToday, counted.remainingNewCards], [1, 1]);
  assert.deepEqual([hit.newCardsIntroducedToday, hit.remainingNewCards], [0, 2]);
});

test("Treffer lernen lässt ausgesetzte und zurückgestellte Karten über die Suche aus (KV5)", () => {
  assert.equal(hitStudyQuery("  tag:Prüfung or haus "), "tag:Prüfung or haus -is:suspended -is:buried");
  assert.equal(hitStudyQuery(""), "-is:suspended -is:buried");
});

test("Nur üben holt Nochmal nach einigen Karten, Schwer am Ende zurück und endet, wenn jede Karte gewusst wurde (KV5)", () => {
  let practice = createPractice(["a", "b", "c", "d", "e", "a"]);
  assert.deepEqual(practice.queue, ["a", "b", "c", "d", "e"]);
  practice = answerPractice(practice, "again");
  assert.deepEqual(practice.queue, ["b", "c", "d", "a", "e"]);
  practice = answerPractice(practice, "hard");
  assert.deepEqual(practice.queue, ["c", "d", "a", "e", "b"]);
  for (const rating of ["good", "easy", "again", "good", "good", "good", "good"] as const) practice = answerPractice(practice, rating);
  assert.deepEqual(practice.queue, []);
  assert.deepEqual(practice.known, ["c", "d", "e", "b", "a"]);
  assert.deepEqual(practice.againCounts, { a: 2 });
  assert.deepEqual(practice.difficult, ["a", "b"]);
  assert.equal(answerPractice(practice, "good"), practice, "eine beendete Übung bleibt beendet");
});
