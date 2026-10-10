import React from "react";
import type { Card, Deck, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createDailyReviewQueue, type AnsweredTodayCard } from "./reviewService.ts";
import { buriesSiblings } from "./siblingBurying.ts";
import type { StudyWindowCursor, WorkspaceHydrationService } from "./workspaceHydrationService.ts";

export interface StudySessionContext {
  workspaceRepository: IndexedDbCoreRepository | null;
  workspaceHydrationService: WorkspaceHydrationService | null;
  latestStateRef: React.RefObject<WorkspaceState | null>;
  now: string;
  dayStartHour: number;
  learnAheadMinutes: number;
  timeZone?: string;
}

export interface StudyPreparation {
  decks: Deck[];
  notes: Note[];
  answeredToday: AnsweredTodayCard[];
  queue: ReturnType<typeof createDailyReviewQueue>;
  cursorByDeck: Record<string, StudyWindowCursor>;
  hasMoreCards: boolean;
  bufferSize: number;
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
 * Loads study windows until the queue has a card or nothing is left, so the session never starts on an empty page.
 * Returns null while no workspace is ready.
 */
async function prepareStudyWindow(
  context: StudySessionContext,
  deckId: string,
  cursorByDeck: Record<string, StudyWindowCursor>,
): Promise<StudyPreparation | null> {
  const { workspaceRepository, workspaceHydrationService, now, dayStartHour, learnAheadMinutes, timeZone } = context;
  const shellState = context.latestStateRef.current;
  if (!workspaceRepository || !shellState) return null;
  const ids = scopeDeckIds(shellState.decks, deckId);
  const answeredSiblings = shellState.decks.some((deck) => ids.includes(deck.id) && buriesSiblings(deck.deckSettings));
  let nextCursorByDeck = cursorByDeck;
  while (true) {
    const session = workspaceHydrationService
      ? await workspaceHydrationService.prepareStudyWindow(ids, { now, dayStartHour, timeZone, cursorByDeck: nextCursorByDeck, answeredSiblings })
      : await workspaceRepository.loadReviewSession(ids, { now, dayStartHour, timeZone, limit: 50, cursorByDeck: nextCursorByDeck, answeredSiblings });
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
      };
    }
    nextCursorByDeck = session.cursorByDeck;
  }
}

/** State of the running study session: the loaded decks, contents and today's answers, plus window paging. */
export function useStudySession(context: StudySessionContext) {
  const [decks, setDecks] = React.useState<Deck[] | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [answeredToday, setAnsweredToday] = React.useState<AnsweredTodayCard[]>([]);
  const [hasMoreCards, setHasMoreCards] = React.useState(false);
  const [bufferSize, setBufferSize] = React.useState(50);
  const cursorRef = React.useRef<Record<string, StudyWindowCursor>>({});
  /** Key of the session whose window is loaded, so a re-render does not prepare it again. */
  const preparedKeyRef = React.useRef("");
  /** Key of a start in progress, so a double click starts once. */
  const preparingKeyRef = React.useRef("");
  const { workspaceRepository, workspaceHydrationService, latestStateRef, now, dayStartHour, learnAheadMinutes, timeZone } = context;

  const prepare = React.useCallback(
    (deckId: string, cursorByDeck: Record<string, StudyWindowCursor> = {}) => prepareStudyWindow(
      { workspaceRepository, workspaceHydrationService, latestStateRef, now, dayStartHour, learnAheadMinutes, timeZone },
      deckId,
      cursorByDeck,
    ),
    [dayStartHour, latestStateRef, learnAheadMinutes, now, timeZone, workspaceHydrationService, workspaceRepository],
  );

  /** Takes over a prepared window; with a key the session counts as prepared. */
  const adopt = React.useCallback((preparation: StudyPreparation, preparedKey: string | null) => {
    if (preparedKey !== null) preparedKeyRef.current = preparedKey;
    cursorRef.current = preparation.cursorByDeck;
    setHasMoreCards(preparation.hasMoreCards);
    setBufferSize(preparation.bufferSize);
    setDecks(preparation.decks);
    setNotes(preparation.notes);
    setAnsweredToday(preparation.answeredToday);
  }, []);

  const reset = React.useCallback(() => {
    setDecks(null);
    setHasMoreCards(false);
    setBufferSize(50);
    cursorRef.current = {};
    preparedKeyRef.current = "";
  }, []);

  /** Loads the next window and merges it into the running session. */
  const loadMore = React.useCallback(async (deckId: string) => {
    const preparation = await prepare(deckId, cursorRef.current);
    if (!preparation) return { decks: [], notes: [], hasMoreCards: false, bufferSize };
    cursorRef.current = preparation.cursorByDeck;
    setHasMoreCards(preparation.hasMoreCards);
    setBufferSize(preparation.bufferSize);
    setNotes((current) => [...new Map([...current, ...preparation.notes].map((note) => [note.id, note])).values()]);
    setAnsweredToday((current) => [...new Map([...current, ...preparation.answeredToday].map((answered) => [answered.cardId, answered])).values()]);
    setDecks((current) => current?.map((currentDeck) => {
      const page = preparation.decks.find((candidate) => candidate.id === currentDeck.id);
      if (!page) return currentDeck;
      const cards = new Map(currentDeck.cards.map((card) => [card.id, card]));
      for (const card of page.cards) cards.set(card.id, card);
      const events = new Map(currentDeck.reviewEvents.map((event) => [event.id, event]));
      for (const event of page.reviewEvents) events.set(event.id, event);
      return { ...currentDeck, cards: [...cards.values()], reviewEvents: [...events.values()] };
    }) ?? current);
    return { decks: preparation.decks, notes: preparation.notes, hasMoreCards: preparation.hasMoreCards, bufferSize: preparation.bufferSize };
  }, [bufferSize, prepare]);

  return { decks, setDecks, notes, setNotes, answeredToday, hasMoreCards, bufferSize, preparedKeyRef, preparingKeyRef, prepare, adopt, reset, loadMore };
}
