import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import type { Deck } from "./coreTypes.ts";
import { createDailyReviewQueue } from "./reviewService.ts";

export const SCHEDULER_TEST_DECK_ID = "deck_fsrs_testmodus";
export const SCHEDULER_TEST_CARD_COUNT = 5;

const TEST_CARDS = [
  ["Was ist die Hauptstadt von Frankreich?", "Paris"],
  ["Welches chemische Symbol hat Gold?", "Au"],
  ["Wie viele Minuten hat eine Stunde?", "60 Minuten"],
  ["Welcher Planet ist der Sonne am nächsten?", "Merkur"],
  ["In welchem Jahr fiel die Berliner Mauer?", "1989"],
] as const;

function normalizeReferenceDate(value: string | number | Date = new Date()): Date {
  const candidate = new Date(value);
  const date = Number.isFinite(candidate.getTime()) ? candidate : new Date();
  date.setHours(10, 0, 0, 0);
  return date;
}

export function normalizeSchedulerTestDay(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(3650, Math.max(1, Math.round(parsed))) : 1;
}

export function createSchedulerTestStart(value: string | number | Date = new Date()): string {
  return normalizeReferenceDate(value).toISOString();
}

export function getSchedulerTestDate(startAt: string | number | Date, day: unknown): string {
  const date = normalizeReferenceDate(startAt);
  date.setDate(date.getDate() + normalizeSchedulerTestDay(day) - 1);
  return date.toISOString();
}

function calendarDayStamp(value: string | number | Date): number {
  const date = new Date(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getSchedulerTestDayForDate(startAt: string | number | Date, value: string | number | Date): number {
  const difference = calendarDayStamp(value) - calendarDayStamp(startAt);
  return Math.max(1, Math.round(difference / (24 * 60 * 60 * 1000)) + 1);
}

export function formatSchedulerTestDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function createSchedulerTestDeck(startAt: string | number | Date = new Date()): Deck {
  const createdAt = createSchedulerTestStart(startAt);
  const cards = TEST_CARDS.map(([front, back], index) => createBasicLearningItem(
    SCHEDULER_TEST_DECK_ID,
    front,
    back,
    {
      id: `card_fsrs_test_${index + 1}`,
      originalVariantId: `variant_fsrs_test_${index + 1}`,
      createdAt,
      updatedAt: createdAt,
      reviewState: {
        state: "new",
        schedulerVersion: "fsrs_6_v1",
        dueAt: createdAt,
      },
    },
  ));

  return createCoreDeck({
    id: SCHEDULER_TEST_DECK_ID,
    name: "FSRS-Teststapel",
    description: "Isolierter Kartenstapel für die Zeitsimulation.",
    source: "manual",
    ownerId: "scheduler-test-mode",
    cards,
    reviewEvents: [],
    createdAt,
    updatedAt: createdAt,
    deckSettings: {
      coreMode: "off",
      newCardsPerDay: SCHEDULER_TEST_CARD_COUNT,
      maximumReviewsPerDay: 100,
      newReviewOrder: "new-first",
    },
  });
}

export function getSchedulerTestDayQueue(deck: Deck, startAt: string | number | Date, day: unknown) {
  return createDailyReviewQueue(deck, {
    deckId: deck.id,
    now: getSchedulerTestDate(startAt, day),
    language: "de",
    variantSession: false,
  });
}

export function listSchedulerTestDays(selectedDay: unknown, count = 7): number[] {
  const current = normalizeSchedulerTestDay(selectedDay);
  const safeCount = Math.max(3, Math.round(count));
  const first = Math.max(1, current <= safeCount ? 1 : current - Math.floor(safeCount / 2));
  return Array.from({ length: safeCount }, (_, index) => first + index);
}
