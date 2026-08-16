import { normalizeDayStartHour } from "./learningDay.ts";
import { getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";

export const DECK_STUDY_PROJECTION_VERSION = 1;

export interface DeckStudyProjectionContext {
  key: string;
  timeZone?: string;
  dayStartHour: number;
}

export interface DeckStudyProjectionCard {
  dueAt: string;
  reviewable: 0 | 1;
  scheduleState: string;
  maturityBand: string;
}

export interface DeckStudyDueCounts {
  reviewDueCount: number;
  forecastCount: number;
}

export interface DeckStudyProjectionAggregate {
  totalCards: number;
  newCards: number;
  inProgressLearning: number;
  inProgressRelearning: number;
  matureCards: number;
  masteredCards: number;
  activeVariants: number;
  nextDueAt: string | null;
  dueByDay: Record<string, DeckStudyDueCounts>;
}

export interface StoredDeckStudyProjection extends Omit<DeckStudyProjectionAggregate, "dueByDay"> {
  id: string;
  deckId: string;
  contextKey: string;
  dirtyToken: string;
  ready: boolean;
  projectionVersion: number;
  revision: number;
}

export interface StoredDeckStudyDueBucket extends DeckStudyDueCounts {
  id: string;
  deckId: string;
  contextKey: string;
  dateKey: string;
}

export interface DeckStudyProjectionCheckpoint {
  deckId: string;
  contextKey: string;
  dirtyToken: string;
  phase: "cards" | "variants";
  cursor: string | null;
  aggregate: DeckStudyProjectionAggregate;
}

export function createDeckStudyProjectionContext(timeZone: string | undefined, dayStartHour: number): DeckStudyProjectionContext {
  const normalizedDayStartHour = normalizeDayStartHour(dayStartHour);
  return {
    key: `${timeZone ?? "local"}:${normalizedDayStartHour}`,
    timeZone,
    dayStartHour: normalizedDayStartHour,
  };
}

export function emptyDeckStudyProjectionAggregate(): DeckStudyProjectionAggregate {
  return {
    totalCards: 0,
    newCards: 0,
    inProgressLearning: 0,
    inProgressRelearning: 0,
    matureCards: 0,
    masteredCards: 0,
    activeVariants: 0,
    nextDueAt: null,
    dueByDay: {},
  };
}

export function deckStudyDueBucketId(deckId: string, contextKey: string, dateKey: string): string {
  return `${deckId}\u0000${contextKey}\u0000${dateKey}`;
}

export function addCardToDeckStudyProjection(
  aggregate: DeckStudyProjectionAggregate,
  card: DeckStudyProjectionCard,
  context: DeckStudyProjectionContext,
  direction: 1 | -1 = 1,
): void {
  if (card.reviewable !== 1) return;
  aggregate.totalCards += direction;
  if (card.scheduleState === "new") aggregate.newCards += direction;
  if (card.scheduleState === "learning") aggregate.inProgressLearning += direction;
  if (card.scheduleState === "relearning") aggregate.inProgressRelearning += direction;
  if (card.maturityBand === "variant_ready") aggregate.matureCards += direction;
  if (card.maturityBand === "mastered") aggregate.masteredCards += direction;

  const dateKey = getStudyHeatmapDayKey(card.dueAt, context.timeZone, context.dayStartHour);
  if (dateKey) {
    const counts = aggregate.dueByDay[dateKey] ?? { reviewDueCount: 0, forecastCount: 0 };
    counts.forecastCount += direction;
    if (card.scheduleState === "review") counts.reviewDueCount += direction;
    if (counts.reviewDueCount === 0 && counts.forecastCount === 0) delete aggregate.dueByDay[dateKey];
    else aggregate.dueByDay[dateKey] = counts;
  }

  if (direction === 1 && (!aggregate.nextDueAt || card.dueAt < aggregate.nextDueAt)) {
    aggregate.nextDueAt = card.dueAt;
  }
}

export function projectionRowFromAggregate(
  deckId: string,
  contextKey: string,
  dirtyToken: string,
  revision: number,
  aggregate: DeckStudyProjectionAggregate,
): StoredDeckStudyProjection {
  const { dueByDay: _dueByDay, ...counts } = aggregate;
  return {
    id: deckId,
    deckId,
    contextKey,
    dirtyToken,
    ready: true,
    projectionVersion: DECK_STUDY_PROJECTION_VERSION,
    revision,
    ...counts,
  };
}
