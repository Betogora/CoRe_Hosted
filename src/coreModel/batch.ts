import type { Card, Note } from "../coreTypes.ts";
import { moveCardToDeck, setCardFlag, setCardSuspended } from "./cards.ts";
import { setNoteMarked, setNoteTags } from "./notes.ts";
import { normalizeTags, tagKey } from "./tags.ts";

interface Graph {
  note: Note;
  cards: Card[];
}

/**
 * One edit of the selected cards (KV4). Deck, flag and suspension belong to each selected card; mark and tags to the
 * contents of the selected cards, as in the editor.
 */
export type CardBatchEdit =
  | { kind: "deck"; deckId: string }
  | { kind: "flag"; flag: number }
  | { kind: "suspended"; suspended: boolean }
  | { kind: "marked"; marked: boolean }
  | { kind: "tags"; add: readonly string[]; remove: readonly string[] };

export interface CardBatchPlan {
  /** Changed contents with all their cards, ready for one `saveNoteGraphs` call. */
  changes: Array<{ previous: Graph; next: Graph }>;
  /** Selected cards whose card or content changed. */
  changedCardIds: string[];
}

export interface CardBatchUndoPlan extends CardBatchPlan {
  /** Selected cards changed again since the edit; their later value stays. */
  skippedCardIds: string[];
}

const isNoteEdit = (edit: CardBatchEdit) => edit.kind === "marked" || edit.kind === "tags";

function editCard(card: Card, edit: CardBatchEdit, updatedAt: string): Card {
  if (edit.kind === "deck") return moveCardToDeck(card, edit.deckId, updatedAt);
  if (edit.kind === "flag") return setCardFlag(card, edit.flag, updatedAt);
  if (edit.kind === "suspended") return setCardSuspended(card, edit.suspended, updatedAt);
  return card;
}

function editNote(note: Note, edit: CardBatchEdit, updatedAt: string): Note {
  if (edit.kind === "marked") return setNoteMarked(note, edit.marked, updatedAt);
  if (edit.kind !== "tags") return note;
  const removed = new Set(normalizeTags(edit.remove).map(tagKey));
  return setNoteTags(note, [...note.content.tags.filter((tag) => !removed.has(tagKey(tag))), ...edit.add], updatedAt);
}

function collect(graphs: readonly Graph[], cardIds: ReadonlySet<string>, change: (graph: Graph) => Graph | null): CardBatchPlan {
  const changes: CardBatchPlan["changes"] = [];
  const changedCardIds: string[] = [];
  for (const graph of graphs) {
    const next = change(graph);
    if (!next) continue;
    changes.push({ previous: graph, next });
    const noteChanged = next.note !== graph.note;
    next.cards.forEach((card, index) => {
      if (cardIds.has(card.id) && (noteChanged || card !== graph.cards[index])) changedCardIds.push(card.id);
    });
  }
  return { changes, changedCardIds };
}

/** Applies one edit to the selected cards of the given contents; untouched contents and cards keep their identity. */
export function planCardBatchEdit(graphs: readonly Graph[], cardIds: ReadonlySet<string>, edit: CardBatchEdit, updatedAt = new Date().toISOString()): CardBatchPlan {
  return collect(graphs, cardIds, (graph) => {
    if (!graph.cards.some((card) => cardIds.has(card.id))) return null;
    const note = isNoteEdit(edit) ? editNote(graph.note, edit, updatedAt) : graph.note;
    const cards = isNoteEdit(edit) ? graph.cards : graph.cards.map((card) => cardIds.has(card.id) ? editCard(card, edit, updatedAt) : card);
    return note === graph.note && cards.every((card, index) => card === graph.cards[index]) ? null : { note, cards };
  });
}

/**
 * Takes an edit back as a new change: each card and content gets its earlier value as long as it still has the value
 * the edit set. One changed again since keeps the later value and counts as skipped. Added tags are removed and removed
 * tags come back unless that already happened.
 */
export function planCardBatchUndo(current: readonly Graph[], before: readonly Graph[], cardIds: ReadonlySet<string>, edit: CardBatchEdit, updatedAt = new Date().toISOString()): CardBatchUndoPlan {
  const earlier = new Map(before.map((graph) => [graph.note.id, graph]));
  const skippedCardIds: string[] = [];
  const plan = collect(current, cardIds, (graph) => {
    const previous = earlier.get(graph.note.id);
    if (!previous) return null;
    const selected = graph.cards.filter((card) => cardIds.has(card.id));
    if (edit.kind === "marked") {
      if (previous.note.marked === edit.marked) return null;
      if (graph.note.marked !== edit.marked) {
        skippedCardIds.push(...selected.map((card) => card.id));
        return null;
      }
      return { note: setNoteMarked(graph.note, previous.note.marked, updatedAt), cards: graph.cards };
    }
    if (edit.kind === "tags") {
      const earlierKeys = new Set(previous.note.content.tags.map(tagKey));
      const added = normalizeTags(edit.add).filter((tag) => !earlierKeys.has(tagKey(tag)));
      const removed = previous.note.content.tags.filter((tag) => new Set(normalizeTags(edit.remove).map(tagKey)).has(tagKey(tag)));
      const note = editNote(graph.note, { kind: "tags", add: removed, remove: added }, updatedAt);
      return note === graph.note ? null : { note, cards: graph.cards };
    }
    const earlierCards = new Map(previous.cards.map((card) => [card.id, card]));
    const valueOf = (card: Card) => edit.kind === "deck" ? card.deckId : edit.kind === "flag" ? card.ankiFlag : card.status === "suspended";
    const target = edit.kind === "deck" ? edit.deckId : edit.kind === "flag" ? edit.flag : edit.suspended;
    const cards = graph.cards.map((card) => {
      const earlierCard = earlierCards.get(card.id);
      if (!cardIds.has(card.id) || !earlierCard || valueOf(earlierCard) === target) return card;
      if (valueOf(card) !== target) {
        skippedCardIds.push(card.id);
        return card;
      }
      if (edit.kind === "deck") return moveCardToDeck(card, earlierCard.deckId, updatedAt);
      if (edit.kind === "flag") return setCardFlag(card, earlierCard.ankiFlag, updatedAt);
      return setCardSuspended(card, earlierCard.status === "suspended", updatedAt);
    });
    return cards.every((card, index) => card === graph.cards[index]) ? null : { note: graph.note, cards };
  });
  return { ...plan, skippedCardIds };
}
