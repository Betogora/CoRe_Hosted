import type { Card, Note } from "../coreTypes.ts";
import { makeId } from "./coreValues.ts";
import { parseNoteContent } from "./noteContent.ts";
import { createReviewState } from "./reviewState.ts";

export interface CreateNoteInput {
  content: unknown;
  deckId: string;
  id?: string;
  userId?: string;
  source?: Note["source"];
  ankiGuid?: string | null;
  noteTypeSourceId?: string | null;
  translator?: Note["translator"];
  createdAt?: string;
  updatedByDeviceId?: string | null;
}

function createCard(note: Note, deckId: string, promptKey: string, createdAt: string): Card {
  const initial = createReviewState({ dueAt: createdAt });
  return {
    id: makeId("card"),
    noteId: note.id,
    deckId,
    promptKey,
    ankiCardId: null,
    status: "active",
    marked: false,
    ankiFlag: 0,
    study: {
      state: initial.state,
      dueAt: initial.dueAt,
      stability: initial.stability,
      difficulty: initial.difficulty,
      reps: initial.reps,
      lapses: initial.lapses,
      intervalDays: initial.intervalDays,
      learningStepIndex: initial.learningStepIndex,
      lastReviewedAt: initial.lastReviewedAt,
      lastRating: initial.lastRating,
      extra: {
        schedulerVersion: initial.schedulerVersion,
        desiredRetention: initial.desiredRetention,
        maturityXp: initial.maturityXp,
        maturityBand: initial.maturityBand,
        preferredVariantLevel: initial.preferredVariantLevel,
        forcedVariantId: initial.forcedVariantId,
        fallbackUntilCorrect: initial.fallbackUntilCorrect,
        lastFailedVariantId: initial.lastFailedVariantId,
        previousSuccessfulVariantId: initial.previousSuccessfulVariantId,
        intervalMinutes: initial.intervalMinutes,
        learningSuccessCount: initial.learningSuccessCount,
        firstLearningAt: initial.firstLearningAt,
        lastLearningStepAt: initial.lastLearningStepAt,
        graduatedAt: initial.graduatedAt,
        isGraduated: initial.isGraduated,
        learningDayKey: initial.learningDayKey,
        sourceSchedulerData: initial.sourceSchedulerData,
      },
    },
    variants: [],
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    deletedAt: null,
    updatedByDeviceId: note.updatedByDeviceId,
  };
}

/** Creates one validated content record and a fresh card for each derived prompt key. */
export function createNote(input: CreateNoteInput): { note: Note; cards: Card[] } {
  const parsed = parseNoteContent(input.content);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const createdAt = input.createdAt ?? new Date().toISOString();
  const note: Note = {
    id: input.id ?? makeId("note"),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    content: parsed.value,
    source: input.source ?? "manual",
    ankiGuid: input.ankiGuid ?? null,
    noteTypeSourceId: input.noteTypeSourceId ?? null,
    translator: input.translator ?? null,
    contentRevision: 1,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    deletedAt: null,
    updatedByDeviceId: input.updatedByDeviceId ?? null,
  };
  return { note, cards: parsed.promptKeys.map((key) => createCard(note, input.deckId, key, createdAt)) };
}

function assertNoteCards(note: Note, cards: readonly Card[]): void {
  if (cards.some((card) => card.noteId !== note.id)) throw new Error("Eine Karte gehört zu einem anderen Inhalt.");
}

/** Removed cards are only proposed; the caller must obtain confirmation before deleting them. */
export function planNoteContentChange(
  previous: { note: Note; cards: readonly Card[] },
  nextContent: unknown,
  updatedAt = new Date().toISOString(),
): { note: Note; keptCards: Card[]; newCards: Card[]; removedCards: Card[] } {
  assertNoteCards(previous.note, previous.cards);
  const deckId = previous.cards[0]?.deckId;
  if (deckId === undefined) throw new Error("Dem Inhalt ist keine Karte zugeordnet.");
  const parsed = parseNoteContent(nextContent);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const note: Note = {
    ...previous.note,
    content: parsed.value,
    contentRevision: previous.note.contentRevision + 1,
    revision: previous.note.revision + 1,
    updatedAt,
  };
  const cardsByKey = new Map(previous.cards.map((card) => [card.promptKey, card]));
  const keptCards: Card[] = [];
  const newCards: Card[] = [];
  for (const key of parsed.promptKeys) {
    const card = cardsByKey.get(key);
    if (card) {
      keptCards.push(card);
      cardsByKey.delete(key);
    }
    else newCards.push(createCard(note, deckId, key, updatedAt));
  }
  return {
    note,
    keptCards,
    newCards,
    removedCards: [...cardsByKey.values()],
  };
}

/** Plans soft deletion across decks and retains the complete prior records for undo. */
export function planNoteDeletion(note: Note, cards: readonly Card[], deletedAt = new Date().toISOString()) {
  assertNoteCards(note, cards);
  return {
    note: { ...note, deletedAt, updatedAt: deletedAt, revision: note.revision + 1 },
    cards: cards.map((card) => ({ ...card, deletedAt, updatedAt: deletedAt, revision: card.revision + 1 })),
    undo: { note, cards: [...cards] },
  };
}
