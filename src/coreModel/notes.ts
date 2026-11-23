import type { Card, CardStudyStatePatch, Note, NoteContent } from "../coreTypes.ts";
import { stripSanitizedHtml } from "../htmlSafety.ts";
import { setCardFlag, setCardSuspended } from "./cards.ts";
import { makeId } from "./coreValues.ts";
import { noteContentMediaRefs, parseNoteContent } from "./noteContent.ts";
import { createCardStudy } from "./reviewState.ts";
import { mergeImportedTags, normalizeTags } from "./tags.ts";

const SHA1_NAME = /^[0-9a-f]{40}$/;
const SEARCH_TEXT_LIMIT = 4_000;
const SORT_TEXT_LIMIT = 240;

interface CreateNoteInput {
  content: unknown;
  deckId: string;
  id?: string;
  userId?: string;
  source?: Note["source"];
  ankiGuid?: string | null;
  importedAnkiModifiedAt?: string | null;
  noteTypeSourceId?: string | null;
  translator?: Note["translator"];
  media?: Record<string, string>;
  /** Template media of the imported note type, kept although no field names them. */
  layoutMedia?: Record<string, string>;
  createdAt?: string;
}

// Anki names template media with a leading `_`; they belong to the original layout, not to the fields.
const isLayoutMedia = (name: string) => name.startsWith("_");
const layoutMediaOf = (media: Record<string, string>) => Object.fromEntries(Object.entries(media).filter(([name]) => isLayoutMedia(name)));

/** Manual images are named by their SHA-1, so an unmapped SHA-1 name maps to itself. */
function noteMediaFor(content: NoteContent, media: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of noteContentMediaRefs(content)) {
    const sha1 = media[name] ?? (SHA1_NAME.test(name) ? name : undefined);
    if (sha1) result[name] = sha1;
  }
  return result;
}

export function removeUnusedNoteMedia(note: Note, names: readonly string[], updatedAt = new Date().toISOString()): Note {
  const used = new Set(noteContentMediaRefs(note.content));
  const removed = names.filter((name) => name in note.media && !used.has(name) && !isLayoutMedia(name));
  if (!removed.length) return note;
  const media = Object.fromEntries(Object.entries(note.media).filter(([name]) => !removed.includes(name)));
  return { ...note, media, revision: note.revision + 1, updatedAt };
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

export function createNote(input: CreateNoteInput): { note: Note; cards: Card[] } {
  const parsed = parseOrThrow(input.content);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const note: Note = {
    id: input.id ?? makeId("note"),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    content: parsed.value,
    media: { ...noteMediaFor(parsed.value, input.media), ...input.layoutMedia },
    source: input.source ?? "manual",
    ankiGuid: input.ankiGuid ?? null,
    noteTypeSourceId: input.noteTypeSourceId ?? null,
    translator: input.translator ?? null,
    marked: false,
    contentRevision: 1,
    importedContentRevision: input.source === "anki-apkg" ? 1 : null,
    importedTags: input.source === "anki-apkg" ? parsed.value.tags : null,
    importedAnkiModifiedAt: input.importedAnkiModifiedAt ?? null,
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

function promptSourceHtml(content: NoteContent, promptKey: string): string | null {
  const promptHtml = () => content.fields.filter((field) => field.role === "prompt").map((field) => field.html).join("\u001f");
  if (content.interaction.kind === "cloze") return promptHtml();
  if (content.interaction.kind === "choice") return `${promptHtml()}\u001e${JSON.stringify(content.interaction.options)}`;
  if (content.interaction.kind !== "reveal") return null;
  const prompt = content.interaction.prompts.find((candidate) => candidate.key === promptKey);
  if (!prompt) return null;
  const html = (ids: string[]) => ids.map((id) => content.fields.find((field) => field.id === id)?.html ?? "").join("\u001f");
  return `${html(prompt.questionFieldIds)}\u001e${html(prompt.answerFieldIds)}`;
}

export function outdateVariantsOfChangedSource(previous: NoteContent, next: NoteContent, card: Card, updatedAt: string): Card {
  return promptSourceHtml(previous, card.promptKey) === promptSourceHtml(next, card.promptKey) ? card : markVariantsOutdated(card, updatedAt);
}

/** Outdated rephrasings are no longer asked but kept for regeneration. */
function markVariantsOutdated(card: Card, updatedAt: string): Card {
  if (!card.variants.some((variant) => variant.isActive && !variant.deletedAt)) return card;
  return {
    ...card,
    variants: card.variants.map((variant) => variant.isActive && !variant.deletedAt
      ? { ...variant, isActive: false, meta: { ...variant.meta, outdated: true }, updatedAt, revision: variant.revision + 1 }
      : variant),
    updatedAt,
  };
}

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
  // Tags are no content change, like the mark: a tag edit keeps contentRevision so reimports still update the fields.
  const contentChanged = changed && JSON.stringify({ ...parsed.value, tags: [] }) !== JSON.stringify({ ...previousParsed.value, tags: [] });
  const note: Note = changed
    ? {
      ...previous.note,
      content: parsed.value,
      media: { ...noteMediaFor(parsed.value, previous.note.media), ...layoutMediaOf(previous.note.media) },
      contentRevision: previous.note.contentRevision + (contentChanged ? 1 : 0),
      revision: previous.note.revision + 1,
      updatedAt,
    }
    : previous.note;
  const keptCards: Card[] = [];
  const newCards: Card[] = [];
  for (const key of parsed.promptKeys) {
    const card = cardsByKey.get(key);
    if (card) {
      const sourceChanged = changed && promptSourceHtml(previousParsed.value, key) !== promptSourceHtml(parsed.value, key);
      keptCards.push(sourceChanged ? markVariantsOutdated(card, updatedAt) : card);
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

export const cardHasStudy = (card: Card) => card.study.reps > 0 || card.study.state !== "new";

/**
 * Cards whose prompt a new content no longer has: `delete` them (an edit the learner confirms), keep the content as it
 * is when one of them was studied (`keepStudied`, a change nobody confirms card by card), or whenever a card would come
 * or go (`skip`).
 */
export type RemovedCardPolicy = "delete" | "keepStudied" | "skip";

/** The whole graph after a content change, its removed cards deleted. */
export function planNoteGraphContentChange(
  previous: { note: Note; cards: readonly Card[] },
  nextContent: unknown,
  policy: RemovedCardPolicy,
  updatedAt = new Date().toISOString(),
): { status: "unchanged" } | { status: "kept" } | { status: "changed"; next: { note: Note; cards: Card[] }; cardsChanged: boolean } {
  const plan = planNoteContentChange(previous, nextContent, updatedAt);
  const cardsChanged = plan.newCards.length > 0 || plan.removedCards.length > 0;
  if (!plan.changed && !cardsChanged) return { status: "unchanged" };
  if ((policy === "skip" && cardsChanged) || (policy === "keepStudied" && plan.removedCards.some(cardHasStudy))) return { status: "kept" };
  const removed = planNoteDeletion(plan.note, plan.removedCards, updatedAt).cards;
  return { status: "changed", next: { note: plan.note, cards: [...plan.keptCards, ...plan.newCards, ...removed] }, cardsChanged };
}

/**
 * A reimported note against the stored one, as in Anki: an older note in the package changes nothing; tags merge
 * three-way against the last import; the content (and a changed note type) replaces it only while nobody edited it here.
 */
export function planImportedNoteUpdate(
  existing: Note,
  incoming: Note,
  noteTypeSourceId: string | null,
  updatedAt: string,
): { status: "older" } | { status: "update"; note: Note; locallyEdited: boolean } {
  if (existing.importedAnkiModifiedAt && incoming.importedAnkiModifiedAt
    && Date.parse(incoming.importedAnkiModifiedAt) < Date.parse(existing.importedAnkiModifiedAt)) return { status: "older" };
  const locallyEdited = existing.importedContentRevision === null || existing.contentRevision > existing.importedContentRevision;
  const importedTags = incoming.importedTags ?? incoming.content.tags;
  const tags = mergeImportedTags(existing.content.tags, existing.importedTags, importedTags);
  const contentChanged = !locallyEdited
    && (existing.noteTypeSourceId !== noteTypeSourceId || JSON.stringify({ ...existing.content, tags: [] }) !== JSON.stringify({ ...incoming.content, tags: [] }));
  const importedAnkiModifiedAt = incoming.importedAnkiModifiedAt ?? existing.importedAnkiModifiedAt;
  const tagsChanged = JSON.stringify(tags) !== JSON.stringify(existing.content.tags)
    || JSON.stringify(importedTags) !== JSON.stringify(existing.importedTags)
    || importedAnkiModifiedAt !== existing.importedAnkiModifiedAt;
  const note: Note = contentChanged
    ? {
      ...existing,
      content: { ...incoming.content, tags },
      media: incoming.media,
      translator: incoming.translator,
      noteTypeSourceId,
      contentRevision: existing.contentRevision + 1,
      importedContentRevision: existing.contentRevision + 1,
      importedTags,
      importedAnkiModifiedAt,
      revision: existing.revision + 1,
      updatedAt,
    }
    : tagsChanged
      ? { ...existing, content: { ...existing.content, tags }, importedTags, importedAnkiModifiedAt, revision: existing.revision + 1, updatedAt }
      : existing;
  return { status: "update", note, locallyEdited };
}

export function planNoteDeletion(note: Note, cards: readonly Card[], deletedAt = new Date().toISOString()) {
  assertNoteCards(note, cards);
  return {
    note: { ...note, deletedAt, updatedAt: deletedAt, revision: note.revision + 1 },
    cards: cards.map((card) => ({ ...card, deletedAt, updatedAt: deletedAt, revision: card.revision + 1 })),
    undo: { note, cards: [...cards] },
  };
}

export function planNoteRestore(undo: { note: Note; cards: readonly Card[] }, deleted: { note: Note; cards: readonly Card[] }, restoredAt = new Date().toISOString()) {
  const deletedCards = new Map(deleted.cards.map((card) => [card.id, card]));
  return {
    note: { ...undo.note, deletedAt: null, updatedAt: restoredAt, revision: deleted.note.revision + 1 },
    cards: undo.cards.map((card) => ({ ...card, deletedAt: null, updatedAt: restoredAt, revision: (deletedCards.get(card.id)?.revision ?? card.revision) + 1 })),
  };
}

export function setNoteMarked(note: Note, marked: boolean, updatedAt = new Date().toISOString()): Note {
  if (note.marked === marked) return note;
  return { ...note, marked, updatedAt, revision: note.revision + 1 };
}

export function setNoteTags(note: Note, tags: readonly string[], updatedAt = new Date().toISOString()): Note {
  const normalized = normalizeTags(tags);
  if (JSON.stringify(normalized) === JSON.stringify(note.content.tags)) return note;
  return { ...note, content: { ...note.content, tags: normalized }, updatedAt, revision: note.revision + 1 };
}

/** Unchanged parts keep their identity so callers can skip saving them. */
export function applyCardStudyStatePatch(note: Note, card: Card, patch: CardStudyStatePatch, updatedAt = new Date().toISOString()): { note: Note; card: Card } {
  let nextNote = patch.marked === undefined ? note : setNoteMarked(note, patch.marked, updatedAt);
  if (patch.tags !== undefined) nextNote = setNoteTags(nextNote, patch.tags, updatedAt);
  let nextCard = patch.suspended === undefined ? card : setCardSuspended(card, patch.suspended, updatedAt);
  if (patch.flag !== undefined) nextCard = setCardFlag(nextCard, patch.flag, updatedAt);
  return { note: nextNote, card: nextCard };
}

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
  const copy = createNote({ content, deckId: fallbackDeckId, media: note.media, layoutMedia: layoutMediaOf(note.media), createdAt });
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

export function fieldSearchKey(name: string): string {
  return name.trim().toLocaleLowerCase("de").replace(/\s+/g, "_");
}

export function noteTextIndex(content: NoteContent): { searchText: string; sortText: string; searchFields: Array<{ name: string; text: string }> } {
  const sortField = content.fields.find((field) => field.role === "prompt") ?? content.fields[0];
  const fieldTexts = content.fields.map((field) => ({ name: fieldSearchKey(field.name), text: plainText(field.html) }));
  const parts = [
    ...fieldTexts.map((field) => field.text),
    ...(content.interaction.kind === "choice" ? content.interaction.options.map((option) => plainText(option.html)) : []),
    ...content.tags,
  ].filter(Boolean);
  return {
    searchText: parts.join(" ").toLocaleLowerCase("de").slice(0, SEARCH_TEXT_LIMIT),
    sortText: (sortField ? plainText(sortField.html) : "").slice(0, SORT_TEXT_LIMIT),
    searchFields: fieldTexts
      .filter((field) => field.name && field.text)
      .map((field) => ({ name: field.name, text: field.text.toLocaleLowerCase("de").slice(0, SEARCH_TEXT_LIMIT) })),
  };
}

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
