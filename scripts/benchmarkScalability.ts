import { performance } from "node:perf_hooks";
import { createCoreCard, createCoreDeck } from "../src/coreModel.ts";
import type { Deck, ReviewEvent, ReviewRating } from "../src/coreTypes.ts";
import { createCardTableModel, createDeckLibraryModel } from "../src/libraryModel.ts";
import { createDailyReviewQueue } from "../src/reviewService.ts";

const CARD_COUNT = 10_000;
const REVIEW_EVENT_COUNT = 250_000;
const RUNS = 3;
const NOW = "2026-08-11T12:00:00.000Z";

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure(action: () => unknown) {
  const values = Array.from({ length: RUNS }, () => {
    const startedAt = performance.now();
    action();
    return performance.now() - startedAt;
  });
  return { medianMs: Number(median(values).toFixed(2)), runsMs: values.map((value) => Number(value.toFixed(2))) };
}

const template = createCoreCard({
  id: "scale-card-0",
  source: "manual",
  originalFront: "Skalierungsfrage",
  originalBack: "Skalierungsantwort",
  reviewState: {
    state: "review",
    dueAt: "2026-08-10T12:00:00.000Z",
    intervalDays: 30,
    difficulty: 5,
    stability: 30,
    reps: 10,
    repetitions: 10,
    lastReviewedAt: "2026-08-01T12:00:00.000Z",
  },
});
const cards = Array.from({ length: CARD_COUNT }, (_, index) => {
  const id = `scale-card-${index}`;
  return {
    ...template,
    id,
    title: `Karte ${index}`,
    canonicalQuestion: `Skalierungsfrage ${index}`,
    originalFront: `Skalierungsfrage ${index}`,
    variants: template.variants.map((variant) => ({ ...variant, id: `${id}-original`, learningItemId: id, anchorVariantId: `${id}-original` })),
  };
});
const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const events: ReviewEvent[] = Array.from({ length: REVIEW_EVENT_COUNT }, (_, index) => {
  const card = cards[index % cards.length];
  const variantId = card.variants[0].id;
  const answeredAt = new Date(Date.parse(NOW) - index * 60_000).toISOString();
  return {
    id: `scale-review-${index}`,
    userId: "scale-user",
    deckId: "scale-deck",
    learningItemId: card.id,
    variantId,
    reviewableType: "variant",
    reviewableId: variantId,
    sourceCardId: card.id,
    rating: ratings[index % ratings.length],
    answeredAt,
    responseTimeMs: 1_000,
    schedulerBefore: {},
    schedulerAfter: {},
    flags: {},
    createdAt: answeredAt,
  };
});
const deck = createCoreDeck({ id: "scale-deck", name: "Skalierungsstapel", source: "manual", cards, reviewEvents: events }) as Deck;
const state = { version: 3, profile: { userId: "scale-user" }, decks: [deck], documents: [], cloudTombstones: [], updatedAt: NOW };

const report = {
  fixture: { cards: CARD_COUNT, reviewEvents: REVIEW_EVENT_COUNT, runs: RUNS },
  persistence: { jsonBytes: Buffer.byteLength(JSON.stringify(state)), stringify: measure(() => JSON.stringify(state)) },
  reviewQueue: measure(() => createDailyReviewQueue(deck, { now: NOW, timeZone: "Europe/Berlin", dayStartHour: 4 })),
  deckLibrary: measure(() => createDeckLibraryModel([deck], { now: NOW, timeZone: "Europe/Berlin", dayStartHour: 4 })),
  cardTable: measure(() => createCardTableModel([deck], { now: NOW, timeZone: "Europe/Berlin", dayStartHour: 4, query: "Karte 9999" })),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
