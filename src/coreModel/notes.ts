import type { Card, Note, NoteContent } from "../coreTypes.ts";
import { stripSanitizedHtml } from "../htmlSafety.ts";
import { makeId } from "./coreValues.ts";
import { noteContentMediaRefs, parseNoteContent } from "./noteContent.ts";
import { createCardStudy } from "./reviewState.ts";

const SHA1_NAME = /^[0-9a-f]{40}$/;
const SEARCH_TEXT_LIMIT = 4_000;
const SORT_TEXT_LIMIT = 240;

export interface CreateNoteInput {
  content: unknown;
  deckId: string;
  id?: string;
  userId?: string;
  source?: Note["source"];
  ankiGuid?: string | null;
  noteTypeSourceId?: string | null;
  translator?: Note["translator"];
  /** Media names mapped to SHA-1; names that already are a SHA-1 (manual images) map to themselves. */
  media?: Record<string, string>;
  createdAt?: string;
}

/** Keeps the media mapping for names the content references; manual images are named by their SHA-1. */
function noteMediaFor(content: NoteContent, media: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of noteContentMediaRefs(content)) {
    const sha1 = media[name] ?? (SHA1_NAME.test(name) ? name : undefined);
    if (sha1) result[name] = sha1;
  }
  return result;
}

function createCard(note: Note, deckId: string, promptKey: string, createdAt: string): Card {
  return {
    id: makeId("card"),
    noteId: note.id,
    deckId,
    promptKey,
    ankiCardId: null,
    status: "active",
    ankiFlag: 0,
    study: createCardStudy(createdAt),
    studyRevision: 0,
    variants: [],
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    deletedAt: null,
    updatedByDeviceId: null,
  };
}

/** Creates one validated content record and a fresh card for each derived prompt key. */
export function createNote(input: CreateNoteInput): { note: Note; cards: Card[] } {
  const parsed = parseOrThrow(input.content);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const note: Note = {
    id: input.id ?? makeId("note"),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    content: parsed.value,
    media: noteMediaFor(parsed.value, input.media),
    source: input.source ?? "manual",
    ankiGuid: input.ankiGuid ?? null,
    noteTypeSourceId: input.noteTypeSourceId ?? null,
    translator: input.translator ?? null,
    marked: false,
    contentRevision: 1,
    importedContentRevision: input.source === "anki-apkg" ? 1 : null,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    deletedAt: null,
    updatedByDeviceId: null,
  };
  return { note, cards: parsed.promptKeys.map((key) => createCard(note, input.deckId, key, createdAt)) };
}

function assertNoteCards(note: Note, cards: readonly Card[]): void {
  if (cards.some((card) => card.noteId !== note.id)) throw new Error("Eine Karte gehört zu einem anderen Inhalt.");
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error("Eine Karte wurde mehrfach übergeben.");
  if (new Set(cards.map((card) => card.promptKey)).size !== cards.length) throw new Error("Ein Abfrageschlüssel ist mehrfach vergeben.");
}

function parseOrThrow(content: unknown) {
  const parsed = parseNoteContent(content);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed;
}

/**
 * Removed cards are only proposed; the caller must obtain confirmation before deleting them.
 * Content that is unchanged after sanitizing keeps the previous note and its revisions.
 */
export function planNoteContentChange(
  previous: { note: Note; cards: readonly Card[] },
  nextContent: unknown,
  updatedAt = new Date().toISOString(),
): { changed: boolean; note: Note; keptCards: Card[]; newCards: Card[]; removedCards: Card[] } {
  assertNoteCards(previous.note, previous.cards);
  if (previous.note.deletedAt !== null || previous.cards.some((card) => card.deletedAt !== null)) {
    throw new Error("Gelöschte Inhalte oder Karten können nicht geändert werden.");
  }
  const previousParsed = parseOrThrow(previous.note.content);
  const cardsByKey = new Map(previous.cards.map((card) => [card.promptKey, card]));
  const deckId = previousParsed.promptKeys.map((key) => cardsByKey.get(key)).find((card) => card !== undefined)?.deckId;
  if (deckId === undefined) throw new Error("Dem Inhalt ist keine Karte zugeordnet.");
  const parsed = parseOrThrow(nextContent);
  const changed = JSON.stringify(parsed.value) !== JSON.stringify(previousParsed.value);
  const note: Note = changed
    ? {
      ...previous.note,
      content: parsed.value,
      media: noteMediaFor(parsed.value, previous.note.media),
      contentRevision: previous.note.contentRevision + 1,
      revision: previous.note.revision + 1,
      updatedAt,
    }
    : previous.note;
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
    changed,
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

/** Restores a deleted content and its cards from the undo records; revisions continue after the deletion. */
export function planNoteRestore(undo: { note: Note; cards: readonly Card[] }, deleted: { note: Note; cards: readonly Card[] }, restoredAt = new Date().toISOString()) {
  const deletedCards = new Map(deleted.cards.map((card) => [card.id, card]));
  return {
    note: { ...undo.note, deletedAt: null, updatedAt: restoredAt, revision: deleted.note.revision + 1 },
    cards: undo.cards.map((card) => ({ ...card, deletedAt: null, updatedAt: restoredAt, revision: (deletedCards.get(card.id)?.revision ?? card.revision) + 1 })),
  };
}

/** The mark belongs to the content like in Anki; it is no content change and keeps `contentRevision`. */
export function setNoteMarked(note: Note, marked: boolean, updatedAt = new Date().toISOString()): Note {
  if (note.marked === marked) return note;
  return { ...note, marked, updatedAt, revision: note.revision + 1 };
}

/** Copies a content as a new manual note with fresh cards in the decks of the original prompts. */
export function duplicateNote(note: Note, cards: readonly Card[], createdAt = new Date().toISOString()): { note: Note; cards: Card[] } {
  assertNoteCards(note, cards);
  const markerFieldId = (note.content.fields.find((field) => field.role === "prompt") ?? note.content.fields[0])?.id;
  const content: NoteContent = {
    ...note.content,
    fields: note.content.fields.map((field) => field.id !== markerFieldId || stripSanitizedHtml(field.html).trim().endsWith("(Kopie)")
      ? field
      : { ...field, html: `${field.html}<p>(Kopie)</p>` }),
  };
  const deckByKey = new Map(cards.map((card) => [card.promptKey, card.deckId]));
  const fallbackDeckId = cards[0]?.deckId;
  if (!fallbackDeckId) throw new Error("Dem Inhalt ist keine Karte zugeordnet.");
  const copy = createNote({ content, deckId: fallbackDeckId, media: note.media, createdAt });
  return { note: copy.note, cards: copy.cards.map((card) => ({ ...card, deckId: deckByKey.get(card.promptKey) ?? fallbackDeckId })) };
}

function clozePlainText(html: string): string {
  let text = html;
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/\{\{c\d+(?:,\d+)*::((?:(?!\{\{c\d)[\s\S])*?)(?:::[^{}]*?)?\}\}/gi, "$1");
  }
  return text;
}

function plainText(html: string): string {
  return stripSanitizedHtml(clozePlainText(html)).replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/** Derived search and sort text of a content: all fields, choice options and tags; sorted by the first question. */
export function noteTextIndex(content: NoteContent): { searchText: string; sortText: string } {
  const sortField = content.fields.find((field) => field.role === "prompt") ?? content.fields[0];
  const parts = [
    ...content.fields.map((field) => plainText(field.html)),
    ...(content.interaction.kind === "choice" ? content.interaction.options.map((option) => plainText(option.html)) : []),
    ...content.tags,
  ].filter(Boolean);
  return {
    searchText: parts.join(" ").toLocaleLowerCase("de").slice(0, SEARCH_TEXT_LIMIT),
    sortText: (sortField ? plainText(sortField.html) : "").slice(0, SORT_TEXT_LIMIT),
  };
}

/** A plain question/answer note; used for the demo deck and as a compact test fixture. */
export function createBasicNote(
  deckId: string,
  front: string,
  back: string,
  { reverse = false, tags = [], createdAt }: { reverse?: boolean; tags?: string[]; createdAt?: string } = {},
): { note: Note; cards: Card[] } {
  return createNote({
    deckId,
    createdAt,
    content: {
      schemaVersion: 1,
      fields: [
        { id: "front", name: "Vorderseite", role: "prompt", html: front },
        { id: "back", name: "Rückseite", role: "answer", html: back },
      ],
      interaction: {
        kind: "reveal",
        prompts: [
          { key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null },
          ...(reverse ? [{ key: "reverse", name: "Rückwärts", instruction: "", questionFieldIds: ["back"], answerFieldIds: ["front"], requires: null, typeInFieldId: null }] : []),
        ],
      },
      speech: [],
      tags,
    },
  });
}
