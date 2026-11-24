import type { CardSelectionActionId } from "./CardSelectionBar.tsx";

export interface CardSelectionRequest {
  id: CardSelectionActionId;
  flag?: number;
  nonce: number;
}

export interface CardSelection {
  /** Search and decks the selection belongs to; another one empties it. */
  scope: string;
  selecting: boolean;
  checkedIds: ReadonlySet<string>;
  /** Every hit of the search, also the ones not loaded; `checkedIds` then does not count. */
  allHits: boolean;
  /** Hit position of the last toggled card, where a range starts; null without one. */
  anchor: number | null;
  /** An action asked for by a key; it ends with the selection, so a new selection never reopens its dialog. */
  request: CardSelectionRequest | null;
}

/** Loaded rows of the hit list by their position; positions without a row are not loaded. */
export type HitRows = ReadonlyMap<number, { id: string }>;

export type CardSelectionEvent =
  | { type: "start" }
  | { type: "toggle"; cardId: string; range: boolean; rows: HitRows }
  | { type: "all-hits" }
  | { type: "select"; ids: readonly string[] }
  | { type: "key-action"; cardId: string; request: CardSelectionRequest }
  | { type: "clear" }
  | { type: "scope"; scope: string };

export function emptyCardSelection(scope: string): CardSelection {
  return { scope, selecting: false, checkedIds: new Set(), allHits: false, anchor: null, request: null };
}

function hitPosition(rows: HitRows, cardId: string) {
  for (const [position, row] of rows) if (row.id === cardId) return position;
  return null;
}

function isEmpty(selection: CardSelection) {
  return !selection.selecting && !selection.allHits && !selection.checkedIds.size && selection.anchor === null && !selection.request;
}

export function reduceCardSelection(selection: CardSelection, event: CardSelectionEvent): CardSelection {
  switch (event.type) {
    case "start":
      return selection.selecting ? selection : { ...selection, selecting: true };
    case "toggle": {
      const position = hitPosition(event.rows, event.cardId);
      const { anchor } = selection;
      const checkedIds = new Set(selection.checkedIds);
      if (event.range && anchor !== null && position !== null) {
        for (let index = Math.min(anchor, position); index <= Math.max(anchor, position); index += 1) {
          const row = event.rows.get(index);
          if (row) checkedIds.add(row.id);
        }
      } else if (checkedIds.has(event.cardId)) checkedIds.delete(event.cardId);
      else checkedIds.add(event.cardId);
      return { ...selection, selecting: true, allHits: false, checkedIds, anchor: position };
    }
    case "all-hits":
      return { ...selection, allHits: true };
    case "select":
      return { ...selection, selecting: event.ids.length > 0, checkedIds: new Set(event.ids), allHits: false, anchor: null, request: null };
    case "key-action": {
      const empty = !selection.selecting || (!selection.allHits && !selection.checkedIds.size);
      return empty
        ? { ...selection, selecting: true, allHits: false, checkedIds: new Set([event.cardId]), request: event.request }
        : { ...selection, request: event.request };
    }
    case "clear":
      return isEmpty(selection) ? selection : emptyCardSelection(selection.scope);
    case "scope":
      if (event.scope === selection.scope) return selection;
      return emptyCardSelection(event.scope);
  }
}

export function isCardChecked(selection: CardSelection, cardId: string) {
  return selection.allHits || selection.checkedIds.has(cardId);
}

export function selectionCount(selection: CardSelection, hitTotal: number) {
  return selection.allHits ? hitTotal : selection.checkedIds.size;
}

/** The checked cards; with every hit selected, the hits `listHitIds` names, or none without it. */
export async function selectedCardIds(selection: CardSelection, listHitIds: (() => Promise<string[]>) | undefined) {
  if (!selection.allHits) return [...selection.checkedIds];
  return listHitIds ? listHitIds() : [];
}

/** Hits to study from the selection: all of them with every hit selected, otherwise only the checked ones. */
export function selectedStudyIds(selection: CardSelection, hitIds: readonly string[]) {
  return selection.allHits ? [...hitIds] : hitIds.filter((id) => selection.checkedIds.has(id));
}
