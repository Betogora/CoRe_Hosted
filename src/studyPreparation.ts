import type { ExamPlanningData } from "./appScreenProps.ts";
import type { Card, Deck, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { EXAM_SESSION_DECK_ID } from "./examPlanSettings.ts";
import { createHitSessionDecks, HIT_SESSION_DECK_ID, type HitStudyOrder } from "./hitStudySession.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { getLearningDayKey, getLearningTimeZone } from "./learningDay.ts";
import { createDailyReviewQueue, type AnsweredTodayCard } from "./reviewService.ts";
import { buriesSiblings } from "./siblingBurying.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { StudyWindowCursor, WorkspaceHydrationService } from "./workspaceHydrationService.ts";
import type { WorkspaceStore } from "./workspaceStore.ts";

export interface StudyPreparation {
  decks: Deck[];
  notes: Note[];
  answeredToday: AnsweredTodayCard[];
  queue: ReturnType<typeof createDailyReviewQueue>;
  cursorByDeck: Record<string, StudyWindowCursor>;
  hasMoreCards: boolean;
  bufferSize: number;
  /** Account-wide due counts per future day at session start, for Easy Days; null without a current overview. */
  dueForecast: ReadonlyMap<string, number> | null;
}

/** A start that found nothing for today, for the dialog that offers more new cards. */
export interface EmptyStudyStart {
  deckId: string;
  deckName: string;
  hasAdditionalNewCards: boolean;
  /** Cards held back only by daily limits; null when the deck has nothing for today. */
  limitSummary: { hiddenDueCount: number; hiddenNewCount: number } | null;
}

export interface StudyPreparationFailure {
  deckId: string;
  message: string;
}

type StudyStartOutcome =
  | { status: "ready"; preparation: StudyPreparation }
  /** The deck is not in this workspace: deleted, or the link belongs to another account. */
  | { status: "missing"; preparation: StudyPreparation }
  | { status: "empty"; emptyStart: EmptyStudyStart }
  | { status: "failed"; failure: StudyPreparationFailure };

interface StudyPreparationContext {
  store: WorkspaceStore;
  repository: IndexedDbCoreRepository;
  /** Without it the study windows come from the local repository alone. */
  hydration: WorkspaceHydrationService | null;
  cloud: ReturnType<typeof createSupabaseBrowserClient> | null;
  /** The learning time, which follows the simulated clock. */
  now: () => string;
}

export type StudyPreparationCommands = ReturnType<typeof createStudyPreparation>;

function studyPreparationFailureMessage(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Du bist offline, und die fälligen Karten dieses Stapels liegen nicht auf diesem Gerät. Versuche es mit Verbindung erneut oder mache den Stapel vorher mit „Offline verfügbar machen“ verfügbar.";
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Die benötigten Karten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.";
}

function createEmptyStudyStart(deckId: string, queue: StudyPreparation["queue"]): EmptyStudyStart {
  return {
    deckId,
    deckName: queue.deckName,
    hasAdditionalNewCards: queue.availableNewCards > 0,
    limitSummary: queue.limitSummary.reached ? { hiddenDueCount: queue.limitSummary.hiddenDueCount, hiddenNewCount: queue.limitSummary.hiddenNewCount } : null,
  };
}

/** The studied deck with all its subdecks. */
function scopeDeckIds(decks: WorkspaceState["decks"], deckId: string): string[] {
  const scopeIds = new Set<string>([deckId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const deck of decks) {
      if (deck.parentDeckId && scopeIds.has(deck.parentDeckId) && !scopeIds.has(deck.id)) {
        scopeIds.add(deck.id);
        changed = true;
      }
    }
  }
  return [...scopeIds];
}

function groupByDeck<T extends { deckId: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(item.deckId);
    if (bucket) bucket.push(item);
    else groups.set(item.deckId, [item]);
  }
  return groups;
}

/**
 * Preparation of study sessions in the open workspace: study windows of a deck with its subdecks, today's exam unit
 * and `Treffer lernen`, each with the cards loaded before the session starts, plus the exam planning data that
 * Heute and Prüfungen share. A start reports an empty deck and a failed load with what their dialogs show.
 */
export function createStudyPreparation({ store, repository, hydration, cloud, now: learningNow }: StudyPreparationContext) {
  /** Study states for the exam forecast (ADR-042); Heute and Prüfungen share them for a minute or until the next own answer. */
  let examPlanningDataCache: { deckIds: ReadonlySet<string>; loadedAt: number; cards: ExamPlanningData["cards"] } | null = null;

  /**
   * Loads study windows until the queue has a card or nothing is left, so the session never starts on an empty page.
   * `now` is the learning time the shown counts were computed for. Returns null while no workspace is loaded.
   */
  async function prepareWindow(deckId: string, now: string, cursorByDeck: Record<string, StudyWindowCursor> = {}): Promise<StudyPreparation | null> {
    const shellState = store.get().state;
    if (!shellState) return null;
    const { dayStartHour, learnAheadMinutes } = getGlobalSchedulerPreferences(shellState.profile);
    const timeZone = getLearningTimeZone(shellState.profile);
    const ids = scopeDeckIds(shellState.decks, deckId);
    const answeredSiblings = shellState.decks.some((deck) => ids.includes(deck.id) && buriesSiblings(deck.deckSettings));
    let nextCursorByDeck = cursorByDeck;
    const dueForecast = Object.keys(cursorByDeck).length === 0 ? await repository.loadDueForecast({ now, dayStartHour, timeZone }) : null;
    while (true) {
      const session = hydration
        ? await hydration.prepareStudyWindow(ids, { now, dayStartHour, timeZone, cursorByDeck: nextCursorByDeck, answeredSiblings })
        : await repository.loadReviewSession(ids, { now, dayStartHour, timeZone, limit: 50, cursorByDeck: nextCursorByDeck, answeredSiblings });
      const cardsByDeck = groupByDeck<{ deckId: string; card: Card }>(session.cards);
      const eventsByDeck = groupByDeck(session.reviewEvents);
      const decks = ids.flatMap((id) => {
        const summary = shellState.decks.find((deck) => deck.id === id);
        if (!summary) return [];
        return [{ ...summary, cards: (cardsByDeck.get(id) ?? []).map(({ card }) => card), reviewEvents: eventsByDeck.get(id) ?? [] } as Deck];
      });
      const queue = createDailyReviewQueue(decks, { deckId, now, dayStartHour, learnAheadMinutes, timeZone, answeredToday: session.answeredToday });
      const cursorAdvanced = Object.entries(session.cursorByDeck).some(([candidateDeckId, cursor]) => {
        const previous = nextCursorByDeck[candidateDeckId];
        const queueRank = "queueRank" in cursor ? cursor.queueRank : undefined;
        return !previous || previous.queueRank !== queueRank || previous.dueAt !== cursor.dueAt || previous.id !== cursor.id;
      });
      if (queue.total > 0 || !session.hasMore || !cursorAdvanced) {
        return {
          decks,
          notes: session.notes,
          answeredToday: session.answeredToday,
          queue,
          cursorByDeck: session.cursorByDeck,
          hasMoreCards: session.hasMore && cursorAdvanced,
          bufferSize: "bufferSize" in session ? Math.max(1, Number(session.bufferSize) || 50) : 50,
          dueForecast,
        };
      }
      nextCursorByDeck = session.cursorByDeck;
    }
  }

  async function loadExamPlanningData(deckIds: string[], signal?: AbortSignal, options: { fresh?: boolean } = {}) {
    if (!hydration) throw new Error("Die Kartenablage ist noch nicht bereit.");
    const cached = examPlanningDataCache;
    if (!options.fresh && cached && Date.now() - cached.loadedAt < 60_000 && deckIds.every((id) => cached.deckIds.has(id))) {
      const requested = new Set(deckIds);
      return { cards: cached.cards.filter((card) => requested.has(card.deckId)) };
    }
    const data = await hydration.loadExamPlanningData(deckIds, signal);
    examPlanningDataCache = { deckIds: new Set(deckIds), loadedAt: Date.now(), cards: data.cards };
    return data;
  }

  async function loadExamSummaryAvailability(deckId: string) {
    const current = store.get().state;
    if (!current) return false;
    const { loadLearningSummaries } = await import("./learningSummaries.ts");
    const result = await loadLearningSummaries({ userId: current.profile.userId, cloud }, deckId);
    return result.summaries.length > 0;
  }

  /** Today's exam unit, or one of its blocks, as a study session over exactly the planned cards. */
  async function prepareExamUnit(blockId: string | null): Promise<StudyPreparation> {
    const currentState = store.get().state;
    if (!hydration || !currentState) throw new Error("Die Kartenablage ist noch nicht bereit.");
    const preferences = getGlobalSchedulerPreferences(currentState.profile);
    const learningTimeZone = getLearningTimeZone(currentState.profile);
    const { exams, capacity } = preferences.examPlanning;
    const now = learningNow();
    const civilToday = getLearningDayKey(now, { timeZone: learningTimeZone })!;
    const todayKey = getLearningDayKey(now, { timeZone: learningTimeZone, dayStartHour: preferences.dayStartHour })!;
    const { createExamPortfolioForecast, createExamSessionDecks, getActiveExamDeckIds } = await import("./examPlanning.ts");
    const { getExamSessionTargetIds, reconcileExamDailyTasks } = await import("./examDailyTasks.ts");
    // Today's saved checklist already holds the frozen targets; only calendar blocks or a missing checklist need a new plan.
    const storedTasks = (preferences.examPlanning.dailyTasks ?? []).filter((task) => task.date === todayKey);
    let ids = blockId && !storedTasks.some((task) => task.id === blockId) ? [] : getExamSessionTargetIds(storedTasks, undefined, todayKey, blockId);
    if (!ids.length) {
      const data = await loadExamPlanningData(getActiveExamDeckIds(currentState.decks, exams, civilToday));
      const forecast = await createExamPortfolioForecast(currentState.decks, data.cards, exams, { now, preferences, timeZone: learningTimeZone, capacity, dailyTasks: preferences.examPlanning.dailyTasks });
      const tasks = reconcileExamDailyTasks(preferences.examPlanning, currentState.decks, forecast, data.cards, now, learningTimeZone, preferences.dayStartHour);
      ids = getExamSessionTargetIds(tasks, forecast.days[0], todayKey, blockId);
    }
    if (!ids.length) throw new Error("Für heute ist in der Prüfungsplanung nichts mehr offen.");
    // Offline the unit runs on the target cards already on this device (E12).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      ids = await hydration.listLocalCardIds(ids);
      if (!ids.length) throw new Error("Die Karten der heutigen Einheit sind erst online verfügbar.");
    }
    const bodies = (await hydration.openCards(ids)).filter((body): body is { card: Card; note: Note } => Boolean(body));
    const position = new Map(ids.map((id, index) => [id, index]));
    bodies.sort((a, b) => (position.get(a.card.id) ?? 0) - (position.get(b.card.id) ?? 0));
    const decks = createExamSessionDecks(currentState.decks, bodies.map(({ card }) => card), exams, todayKey);
    const queue = createDailyReviewQueue(decks, { deckId: EXAM_SESSION_DECK_ID, now, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, timeZone: learningTimeZone });
    if (!queue.total) throw new Error("Gerade ist keine Karte der heutigen Einheit fällig.");
    const notes = [...new Map(bodies.map(({ note }) => [note.id, note])).values()];
    return { decks, notes, answeredToday: [], queue, cursorByDeck: {}, hasMoreCards: false, bufferSize: 50, dueForecast: null };
  }

  /** `Treffer lernen` with `Vorziehen` (KV5): a study session over exactly these cards, due or not, without daily limits. */
  async function prepareHitSession(cardIds: string[], order: HitStudyOrder): Promise<StudyPreparation> {
    const currentState = store.get().state;
    if (!hydration || !currentState) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const preferences = getGlobalSchedulerPreferences(currentState.profile);
    const now = learningNow();
    const ids = typeof navigator !== "undefined" && navigator.onLine === false ? await hydration.listLocalCardIds(cardIds) : cardIds;
    const bodies = (await hydration.openCards(ids)).filter((body): body is { card: Card; note: Note } => Boolean(body));
    const position = new Map(ids.map((id, index) => [id, index]));
    bodies.sort((a, b) => (position.get(a.card.id) ?? 0) - (position.get(b.card.id) ?? 0));
    const decks = createHitSessionDecks(currentState.decks, bodies.map(({ card }) => card), order, now);
    const queue = createDailyReviewQueue(decks, { deckId: HIT_SESSION_DECK_ID, now, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, timeZone: getLearningTimeZone(currentState.profile) });
    if (!queue.total) throw new Error(ids.length ? "Keine dieser Karten kann gerade gelernt werden." : "Diese Karten sind erst online verfügbar.");
    const notes = [...new Map(bodies.map(({ note }) => [note.id, note])).values()];
    return { decks, notes, answeredToday: [], queue, cursorByDeck: {}, hasMoreCards: false, bufferSize: 50, dueForecast: null };
  }

  /**
   * Prepares the session a study route names: a deck with its subdecks or, after a reload, today's exam unit. A list
   * of hits lives only in the screen that started it and is gone after a reload. Null while no workspace is loaded.
   */
  async function prepareStart(deckId: string, now: string): Promise<StudyStartOutcome | null> {
    let preparation: StudyPreparation | null;
    try {
      if (deckId === HIT_SESSION_DECK_ID) throw new Error("Die Treffer sind nach dem Neuladen nicht mehr da. Starte „Treffer lernen“ erneut.");
      preparation = deckId === EXAM_SESSION_DECK_ID ? await prepareExamUnit(null) : await prepareWindow(deckId, now);
    } catch (error) {
      return { status: "failed", failure: { deckId, message: studyPreparationFailureMessage(error) } };
    }
    if (!preparation) return null;
    if (!preparation.decks.some((deck) => deck.id === deckId)) return { status: "missing", preparation };
    if (preparation.queue.total === 0) return { status: "empty", emptyStart: createEmptyStudyStart(deckId, preparation.queue) };
    return { status: "ready", preparation };
  }

  return {
    prepareStart,
    prepareWindow,
    prepareExamUnit,
    prepareHitSession,
    loadExamPlanningData,
    loadExamSummaryAvailability,
    /** Answers change the study states, so the next exam forecast loads them again. */
    forgetExamPlanningData: () => { examPlanningDataCache = null; },
  };
}
