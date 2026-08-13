import type { Deck, ForeignNoteSnapshot, LearningItem, NoteTypeDefinitionV1, SourceDocument } from "./coreTypes.ts";
import { SYNC_MUTATION_TYPES } from "./syncEngine.ts";

interface RevisionedEntity {
  id: string;
  revision?: number;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface EntityMutationGraph {
  decks?: Deck[];
  documents?: SourceDocument[];
  noteTypeDefinitions?: NoteTypeDefinitionV1[];
  sourceSnapshots?: ForeignNoteSnapshot[];
  tombstones?: Array<{ entityTable: string; entityId: string; revision: number; deletedAt: string }>;
}

function changed(previous: RevisionedEntity | undefined, next: RevisionedEntity) {
  return !previous || previous !== next && (
    previous.revision !== next.revision
    || previous.updatedAt !== next.updatedAt
    || previous.deletedAt !== next.deletedAt
  );
}

function entityMutation(table: string, entity: RevisionedEntity, previous?: RevisionedEntity, context: Record<string, unknown> = {}) {
  return {
    type: SYNC_MUTATION_TYPES.entityMutation,
    table,
    entityId: entity.id,
    baseRevision: previous?.revision ?? null,
    payload: { table, entity, baseRevision: previous?.revision ?? null, ...context },
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
  const { cards: _cards, reviewEvents: _events, sourceDocuments: _documents, ...entity } = deck;
  return { ...entity, cardCount: deck.cardCount ?? deck.cards.length };
}

function cardEntity(card: LearningItem) {
  const { variants: _variants, ...entity } = card;
  return entity;
}

function byId<T extends { id: string }>(items: T[] = []) {
  return new Map(items.map((item) => [item.id, item]));
}

export function planEntityMutations(previous: EntityMutationGraph = {}, next: EntityMutationGraph = {}) {
  const mutations: any[] = [];
  const tombstones = new Map((previous.tombstones ?? []).map((item) => [
    `${item.entityTable}:${item.entityId}`,
    { id: item.entityId, revision: item.revision, deletedAt: item.deletedAt },
  ]));
  const previousEntity = (table: string, id: string, entity?: RevisionedEntity) => entity ?? tombstones.get(`${table}:${id}`);

  for (const [table, before, after] of [
    ["source_documents", previous.documents ?? [], next.documents ?? []],
    ["note_type_definitions", previous.noteTypeDefinitions ?? [], next.noteTypeDefinitions ?? []],
  ] as const) {
    const beforeById = byId(before as RevisionedEntity[]);
    const afterIds = new Set((after as RevisionedEntity[]).map((item) => item.id));
    for (const item of before as RevisionedEntity[]) if (!afterIds.has(item.id)) mutations.push(tombstoneMutation(table, item));
    for (const item of after as RevisionedEntity[]) {
      const old = previousEntity(table, item.id, beforeById.get(item.id));
      if (changed(old, item)) mutations.push(entityMutation(table, item, old));
    }
  }

  const previousDecks = byId(previous.decks);
  const nextDeckIds = new Set((next.decks ?? []).map((deck) => deck.id));
  for (const deck of (previous.decks ?? []).filter((item) => !nextDeckIds.has(item.id))) {
    for (const card of deck.cards) {
      for (const variant of card.variants) mutations.push(tombstoneMutation("card_variants", variant));
      mutations.push(tombstoneMutation("cards", card));
    }
    mutations.push(tombstoneMutation("decks", deck));
  }

  const newSnapshotIds = new Set((next.sourceSnapshots ?? []).map((item) => item.id));
  const snapshotById = byId(next.sourceSnapshots);
  const cardBySnapshotId = new Map<string, string>();
  for (const deck of next.decks ?? []) for (const card of deck.cards) {
    let snapshotId = card.latestSourceSnapshotId;
    while (snapshotId && !cardBySnapshotId.has(snapshotId)) {
      cardBySnapshotId.set(snapshotId, card.id);
      snapshotId = snapshotById.get(snapshotId)?.previousSnapshotId ?? null;
    }
  }

  for (const deck of next.decks ?? []) {
    const previousDeck = previousDecks.get(deck.id);
    const oldDeck = previousEntity("decks", deck.id, previousDeck ? deckEntity(previousDeck) : undefined);
    const nextDeck = deckEntity(deck);
    if (changed(oldDeck, nextDeck)) mutations.push(entityMutation("decks", nextDeck, oldDeck));
    const previousCards = byId(previousDeck?.cards);
    const nextCardIds = new Set(deck.cards.map((card) => card.id));
    for (const card of (previousDeck?.cards ?? []).filter((item) => !nextCardIds.has(item.id))) {
      for (const variant of card.variants) mutations.push(tombstoneMutation("card_variants", variant));
      mutations.push(tombstoneMutation("cards", card));
    }
    for (const card of deck.cards) {
      const previousCard = previousCards.get(card.id);
      const nextCard = cardEntity(card);
      if (nextCard.latestSourceSnapshotId && newSnapshotIds.has(nextCard.latestSourceSnapshotId)) nextCard.latestSourceSnapshotId = null;
      const oldCard = previousEntity("cards", card.id, previousCard ? cardEntity(previousCard) : undefined);
      if (changed(oldCard, nextCard)) mutations.push(entityMutation("cards", nextCard, oldCard, { deckId: deck.id }));
      const previousVariants = byId(previousCard?.variants);
      const nextVariantIds = new Set(card.variants.map((variant) => variant.id));
      for (const variant of (previousCard?.variants ?? []).filter((item) => !nextVariantIds.has(item.id))) mutations.push(tombstoneMutation("card_variants", variant));
      for (const variant of card.variants) {
        const oldVariant = previousEntity("card_variants", variant.id, previousVariants.get(variant.id));
        if (changed(oldVariant, variant)) mutations.push(entityMutation("card_variants", variant, oldVariant, { cardId: card.id }));
      }
    }
  }

  for (const snapshot of next.sourceSnapshots ?? []) {
    const cardId = cardBySnapshotId.get(snapshot.id);
    if (!cardId) throw new Error(`Quell-Snapshot ${snapshot.id} ist keiner Karte zugeordnet.`);
    mutations.push(entityMutation("learning_item_source_snapshots", snapshot, undefined, {
      cardId,
      attachToCard: (next.decks ?? []).some((deck) => deck.cards.some((card) => card.id === cardId && card.latestSourceSnapshotId === snapshot.id)),
    }));
  }
  return mutations;
}
