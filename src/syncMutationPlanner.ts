import type { Card, Deck, Note } from "./coreTypes.ts";
import { SYNC_MUTATION_TYPES } from "./syncEngine.ts";

interface RevisionedEntity {
  id: string;
  revision?: number;
  updatedAt?: string;
  deletedAt?: string | null;
}

/** Flat entity lists; a deck contributes only its metadata, cards carry their variants. */
export interface EntityMutationGraph {
  decks?: Deck[];
  notes?: Note[];
  cards?: Card[];
}

function changed(previous: RevisionedEntity | undefined, next: RevisionedEntity) {
  return !previous || previous !== next && (
    previous.revision !== next.revision
    || previous.updatedAt !== next.updatedAt
    || previous.deletedAt !== next.deletedAt
  );
}

function entityMutation(table: string, entity: RevisionedEntity, previous?: RevisionedEntity) {
  return {
    type: SYNC_MUTATION_TYPES.entityMutation,
    table,
    entityId: entity.id,
    baseRevision: previous?.revision ?? null,
    payload: { table, entity, baseRevision: previous?.revision ?? null },
  };
}

function tombstoneMutation(table: string, entity: RevisionedEntity) {
  const deletedAt = new Date().toISOString();
  return {
    type: SYNC_MUTATION_TYPES.entityMutation,
    table,
    entityId: entity.id,
    baseRevision: entity.revision ?? 1,
    payload: { table, entityId: entity.id, baseRevision: entity.revision ?? 1, deletedAt, tombstone: true },
  };
}

function deckEntity(deck: Deck) {
  const { cards: _cards, reviewEvents: _events, ...entity } = deck;
  return entity;
}

function cardEntity(card: Card) {
  const { variants: _variants, ...entity } = card;
  return entity;
}

function byId<T extends { id: string }>(items: T[] = []) {
  return new Map(items.map((item) => [item.id, item]));
}

/** Revision-checked mutations for every changed, added or removed entity; removals become tombstones. */
export function planEntityMutations(previous: EntityMutationGraph = {}, next: EntityMutationGraph = {}) {
  const mutations: any[] = [];
  const plan = <T extends RevisionedEntity>(table: string, before: T[], after: T[], project: (item: T) => RevisionedEntity = (item) => item) => {
    const beforeById = byId(before);
    const afterIds = new Set(after.map((item) => item.id));
    for (const item of before) if (!afterIds.has(item.id)) mutations.push(tombstoneMutation(table, item));
    for (const item of after) {
      const old = beforeById.has(item.id) ? project(beforeById.get(item.id)!) : undefined;
      const entity = project(item);
      if (changed(old, entity)) mutations.push(entityMutation(table, entity, old));
    }
  };

  plan("decks", previous.decks ?? [], next.decks ?? [], (deck) => deckEntity(deck as Deck));
  plan("notes", previous.notes ?? [], next.notes ?? []);
  plan("cards", previous.cards ?? [], next.cards ?? [], (card) => cardEntity(card as Card));
  plan(
    "card_variants",
    (previous.cards ?? []).flatMap((card) => card.variants),
    (next.cards ?? []).flatMap((card) => card.variants),
  );
  return mutations;
}
