// Private to indexedDbCoreRepository.ts: daily counters, overview buckets and the today-answered data sibling burying needs.
import {
  catalogSummaryContribution,
  emptyDeckStudySummary,
  STORE,
  type StoredCardCatalog,
  type WorkspaceDeckSummary,
  requestResult,
} from "./indexedDbStore.ts";
import { createDefaultDeckSettings } from "./coreModel.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import type { AnsweredTodayCard } from "./reviewService.ts";
import { buriesSiblings, createSiblingBurying, type SiblingKind } from "./siblingBurying.ts";
import { getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import { getLearningDayRange } from "./learningDay.ts";
import type { AccountStudyOverview, DeckStudySummary } from "./workspaceReplica.ts";

export function studyOverviewContext(overview: AccountStudyOverview) {
  const separator = overview.contextKey.lastIndexOf(":");
  const dayStartHour = Number(overview.contextKey.slice(separator + 1));
  if (separator < 1 || !Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) return null;
  return { timeZone: overview.contextKey.slice(0, separator), dayStartHour };
}

export function overviewScheduleBucket(card: StoredCardCatalog | null, overview: AccountStudyOverview, referenceAt: string) {
  if (!card || card.deletedAt || card.reviewable !== 1 || !card.dueAt) return null;
  const context = studyOverviewContext(overview);
  if (!context || getStudyHeatmapDayKey(referenceAt, context.timeZone, context.dayStartHour) !== overview.dayKey) return null;
  const range = getLearningDayRange(referenceAt, context);
  if (!range) return null;
  const dueAt = Date.parse(card.dueAt);
  if (!Number.isFinite(dueAt)) return null;
  if (dueAt < range.end) {
    if (card.scheduleState === "new") return { kind: "available-new" as const, key: card.deckId };
    if (["learning", "relearning"].includes(card.scheduleState)) return { kind: "available-learning" as const, key: card.deckId };
    return { kind: "due" as const, key: card.deckId };
  }
  if (dueAt >= range.end + 365 * 24 * 60 * 60 * 1000) return null;
  const dayKey = getStudyHeatmapDayKey(card.dueAt, context.timeZone, context.dayStartHour);
  return dayKey ? { kind: "forecast" as const, key: dayKey } : null;
}

export async function applyCatalogSummaryChange(transaction: IDBTransaction, deckId: string, before: StoredCardCatalog | null, after: StoredCardCatalog | null) {
  const store = transaction.objectStore(STORE.deckStudySummaries);
  const current = await requestResult<DeckStudySummary | undefined>(store.get(deckId)) ?? emptyDeckStudySummary(deckId);
  const oldCounts = catalogSummaryContribution(before);
  const newCounts = catalogSummaryContribution(after);
  store.put({
    ...current,
    totalCount: Math.max(0, current.totalCount - oldCounts.totalCount + newCounts.totalCount),
    newCount: Math.max(0, current.newCount - oldCounts.newCount + newCounts.newCount),
    learningCount: Math.max(0, current.learningCount - oldCounts.learningCount + newCounts.learningCount),
    matureCount: Math.max(0, current.matureCount - oldCounts.matureCount + newCounts.matureCount),
    suspendedCount: Math.max(0, current.suspendedCount - oldCounts.suspendedCount + newCounts.suspendedCount),
    activeVariantCount: Math.max(0, current.activeVariantCount - oldCounts.activeVariantCount + newCounts.activeVariantCount),
    updatedAt: after?.updatedAt ?? before?.updatedAt ?? current.updatedAt,
  });
}

export interface BuriedSiblingCounts {
  newCards: number;
  learningCards: number;
  dueCards: number;
}

/**
 * Siblings buried today per deck, for the counters: cards of a content with another card answered today, when the
 * deck of the answered card buries their kind. Same rule as the queue's seeding from today's answers; a sibling that
 * is itself answered today stays countable. Reads nothing unless a deck buries.
 */
export async function buriedSiblingsByDeck(
  database: IDBDatabase,
  decks: readonly WorkspaceDeckSummary[],
  range: { start: number; end: number },
  todayEvents: ReviewEvent[][] | null,
): Promise<Map<string, BuriedSiblingCounts>> {
  const settingsByDeck = new Map(decks.map((deck) => [deck.id, createDefaultDeckSettings(deck.deckSettings)]));
  const result = new Map<string, BuriedSiblingCounts>();
  if (![...settingsByDeck.values()].some(buriesSiblings)) return result;

  const start = new Date(range.start).toISOString();
  const end = new Date(range.end).toISOString();
  const events = todayEvents ?? await (async () => {
    const index = database.transaction(STORE.reviewEvents, "readonly").objectStore(STORE.reviewEvents).index("deckAnswered");
    return Promise.all(decks.map((deck) => requestResult<ReviewEvent[]>(index.getAll(IDBKeyRange.bound([deck.id, start, ""], [deck.id, end, ""], false, true)))));
  })();
  const answeredIds = new Set(events.flat().filter((event) => event.rating !== "manual").map((event) => event.cardId));
  if (answeredIds.size === 0) return result;

  const catalog = database.transaction(STORE.cardCatalog, "readonly").objectStore(STORE.cardCatalog);
  const answeredRows = await Promise.all([...answeredIds].map((id) => requestResult<StoredCardCatalog | undefined>(catalog.get(id))));
  const burying = createSiblingBurying((deckId) => settingsByDeck.get(deckId));
  for (const row of answeredRows) if (row) burying.answered(row.id, row.noteId, row.deckId);
  // Siblings not answered today are not in an intraday learning step, so learning means interday learning here.
  const kinds: Record<string, [SiblingKind, keyof BuriedSiblingCounts]> = {
    new: ["new", "newCards"],
    review: ["review", "dueCards"],
    learning: ["interday-learning", "learningCards"],
    relearning: ["interday-learning", "learningCards"],
  };
  const siblingRows = await Promise.all(burying.buryingNoteIds().map((noteId) => requestResult<StoredCardCatalog[]>(catalog.index("noteId").getAll(noteId))));
  for (const row of siblingRows.flat()) {
    const kind = kinds[row.scheduleState];
    if (!kind || row.reviewable !== 1 || row.deletedAt || !(row.dueSort < end) || !burying.buriedBySeen(row, kind[0])) continue;
    const counts = result.get(row.deckId) ?? { newCards: 0, learningCards: 0, dueCards: 0 };
    counts[kind[1]] += 1;
    result.set(row.deckId, counts);
  }
  return result;
}

/**
 * Cards answered today with their content: those of the studied decks and siblings of the loaded cards in other decks,
 * so sibling burying holds for the whole learning day and across decks.
 */
export async function loadAnsweredTodayFrom(
  database: IDBDatabase,
  reviewEvents: ReviewEvent[],
  loadedNoteIds: string[],
  deckIds: string[],
  range: { start: number; end: number },
): Promise<AnsweredTodayCard[]> {
  const catalog = database.transaction(STORE.cardCatalog, "readonly").objectStore(STORE.cardCatalog);
  const answeredIds = [...new Set(reviewEvents.filter((event) => event.rating !== "manual").map((event) => event.cardId))];
  const [answeredRows, siblingRows] = await Promise.all([
    Promise.all(answeredIds.map((id) => requestResult<StoredCardCatalog | undefined>(catalog.get(id)))),
    Promise.all([...new Set(loadedNoteIds)].map((noteId) => requestResult<StoredCardCatalog[]>(catalog.index("noteId").getAll(noteId)))),
  ]);
  const scope = new Set(deckIds);
  const outside = siblingRows.flat().filter((row) => !scope.has(row.deckId));
  const answeredIndex = database.transaction(STORE.reviewEvents, "readonly").objectStore(STORE.reviewEvents).index("cardAnswered");
  const start = new Date(range.start).toISOString();
  const end = new Date(range.end).toISOString();
  const outsideEvents = await Promise.all(outside.map((row) => requestResult<ReviewEvent[]>(answeredIndex.getAll(IDBKeyRange.bound([row.id, start, ""], [row.id, end, ""], false, true)))));
  return [
    ...answeredRows.flatMap((row) => row ? [{ cardId: row.id, noteId: row.noteId, deckId: row.deckId }] : []),
    ...outside.flatMap((row, index) => outsideEvents[index].some((event) => event.rating !== "manual") ? [{ cardId: row.id, noteId: row.noteId, deckId: row.deckId }] : []),
  ];
}
