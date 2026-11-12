import React from "react";
import type { CardCommands } from "./cardCommands.ts";
import { applyCardStudyStatePatch } from "./coreModel.ts";
import type { CardStudyStatePatch, Deck, NewReviewOrder, Note } from "./coreTypes.ts";
import { markLearningSettingsCustom } from "./deckSettings.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AnsweredTodayCard, ReviewAnswerResult } from "./reviewService.ts";
import type { StudyPreparation, StudyPreparationCommands } from "./studyPreparation.ts";
import { useStableCallback } from "./ui/useStableCallback.ts";
import type { StudyWindowCursor } from "./workspaceHydrationService.ts";

interface StudySessionContext {
  /** Loads the next windows; null while no workspace is open. */
  preparation: StudyPreparationCommands | null;
  repository: IndexedDbCoreRepository | null;
  cardCommands: CardCommands | null;
  /** Applies the repository's shell state to the store. */
  refresh: (options?: { preserveCardPages?: boolean }) => unknown;
  requestSync: () => void;
  /** The learning time the shown counts were computed for. */
  now: string;
}

/**
 * The running study session: the loaded decks, contents and today's answers with window paging, and the writes made
 * from it (answers, quick study-state changes, the new-card order). Its callbacks keep their identity, so the
 * memoized study screen does not render for an unchanged session.
 */
export function useStudySession({ preparation, repository, cardCommands, refresh, requestSync, now }: StudySessionContext) {
  const [decks, setDecks] = React.useState<Deck[] | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [answeredToday, setAnsweredToday] = React.useState<AnsweredTodayCard[]>([]);
  const [hasMoreCards, setHasMoreCards] = React.useState(false);
  const [bufferSize, setBufferSize] = React.useState(50);
  const [dueForecast, setDueForecast] = React.useState<ReadonlyMap<string, number> | null>(null);
  const cursorRef = React.useRef<Record<string, StudyWindowCursor>>({});
  /** Key of the session whose window is loaded, so a re-render does not prepare it again. */
  const preparedKeyRef = React.useRef("");
  /** Key of a start in progress, so a double click starts once. */
  const preparingKeyRef = React.useRef("");

  /** Takes over a prepared window; with a key the session counts as prepared. */
  const adopt = React.useCallback((prepared: StudyPreparation, preparedKey: string | null) => {
    if (preparedKey !== null) preparedKeyRef.current = preparedKey;
    cursorRef.current = prepared.cursorByDeck;
    setHasMoreCards(prepared.hasMoreCards);
    setBufferSize(prepared.bufferSize);
    setDueForecast(prepared.dueForecast);
    setDecks(prepared.decks);
    setNotes(prepared.notes);
    setAnsweredToday(prepared.answeredToday);
  }, []);

  const reset = React.useCallback(() => {
    setDecks(null);
    setHasMoreCards(false);
    setBufferSize(50);
    setDueForecast(null);
    cursorRef.current = {};
    preparedKeyRef.current = "";
  }, []);

  /** Loads the next window and merges it into the running session. */
  const loadMore = React.useCallback(async (deckId: string) => {
    const prepared = await preparation?.prepareWindow(deckId, now, cursorRef.current) ?? null;
    if (!prepared) return { decks: [], notes: [], hasMoreCards: false, bufferSize };
    cursorRef.current = prepared.cursorByDeck;
    setHasMoreCards(prepared.hasMoreCards);
    setBufferSize(prepared.bufferSize);
    setNotes((current) => [...new Map([...current, ...prepared.notes].map((note) => [note.id, note])).values()]);
    setAnsweredToday((current) => [...new Map([...current, ...prepared.answeredToday].map((answered) => [answered.cardId, answered])).values()]);
    setDecks((current) => current?.map((currentDeck) => {
      const page = prepared.decks.find((candidate) => candidate.id === currentDeck.id);
      if (!page) return currentDeck;
      const cards = new Map(currentDeck.cards.map((card) => [card.id, card]));
      for (const card of page.cards) cards.set(card.id, card);
      const events = new Map(currentDeck.reviewEvents.map((event) => [event.id, event]));
      for (const event of page.reviewEvents) events.set(event.id, event);
      return { ...currentDeck, cards: [...cards.values()], reviewEvents: [...events.values()] };
    }) ?? current);
    return { decks: prepared.decks, notes: prepared.notes, hasMoreCards: prepared.hasMoreCards, bufferSize: prepared.bufferSize };
  }, [bufferSize, now, preparation]);

  const recordReview = useStableCallback((result: ReviewAnswerResult) => {
    if (!repository) return;
    preparation?.forgetExamPlanningData();
    repository.recordReview(result);
    requestSync();
  });

  const setCardStudyState = useStableCallback((deckId: string, cardId: string, patch: CardStudyStatePatch) => {
    const deck = decks?.find((candidate) => candidate.id === deckId);
    const card = deck?.cards.find((candidate) => candidate.id === cardId);
    const note = card ? notes.find((candidate) => candidate.id === card.noteId) : null;
    if (!deck || !card || !note) return null;
    const updatedAt = new Date().toISOString();
    const { note: nextNote, card: nextCard } = applyCardStudyStatePatch(note, card, patch, updatedAt);
    const updated = { ...deck, updatedAt, cards: deck.cards.map((candidate) => candidate.id === cardId ? nextCard : candidate) };
    setDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    setNotes((current) => current.map((candidate) => candidate.id === note.id ? nextNote : candidate));
    void cardCommands?.applyCardStudyState(cardId, patch).then(() => {
      refresh({ preserveCardPages: true });
      requestSync();
    });
    return { deck: updated, note: nextNote };
  });

  const setDeckReviewOrder = useStableCallback((deckId: string, newReviewOrder: NewReviewOrder) => {
    const deck = decks?.find((candidate) => candidate.id === deckId);
    if (!deck) return null;
    const nextDeckSettings = {
      ...deck.deckSettings,
      ...markLearningSettingsCustom({ ...deck.deckSettings, newReviewOrder }),
      learningProfileSource: null,
    };
    const updated = {
      ...deck,
      updatedAt: new Date().toISOString(),
      deckSettings: nextDeckSettings,
    };
    setDecks((current) => current?.map((candidate) => candidate.id === deckId ? updated : candidate) ?? current);
    // A planned session root exists only in the session.
    if (!deck.plannedOrder && repository) {
      repository.updateDeckSettings(deckId, nextDeckSettings);
      refresh({ preserveCardPages: true });
      requestSync();
    }
    return updated;
  });

  return { decks, setDecks, notes, answeredToday, hasMoreCards, bufferSize, dueForecast, preparedKeyRef, preparingKeyRef, adopt, reset, loadMore, recordReview, setCardStudyState, setDeckReviewOrder };
}
