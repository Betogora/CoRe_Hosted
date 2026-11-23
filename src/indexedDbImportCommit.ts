import { mergeImportedTags, normalizeCoreDeck, outdateVariantsOfChangedSource } from "./coreModel.ts";
import type { Card, Deck, DeckSettings, ImportVerificationScope, Note, ReviewEvent } from "./coreTypes.ts";
import type { OutboxMutationInput, StagedMutations } from "./indexedDbOutbox.ts";
import type { ImportCommitGraph, ImportMediaFile, NoteTypeSource } from "./apkgImport.ts";
import type { ImportSource, InterruptedImport } from "./creationWorkflow.ts";
import { insertEntityMutation, planEntityMutations } from "./syncMutationPlanner.ts";
import {
  STORE,
  type NoteGraphChange,
  type StoredCard,
  type StoredVariant,
  type WorkspaceDeckSummary,
  hydrateCard,
  requestResult,
  transactionDone,
  deckRecord,
  emptyDeckStudySummary,
} from "./indexedDbStore.ts";

export interface ReimportTargets {
  notes: Note[];
  cards: Array<{ id: string; noteId: string; deckId: string; promptKey: string; ankiCardId: string | null }>;
  noteTypeSources: Array<{ id: string; ankiNotetypeId: string }>;
}

interface ImportCommitResult {
  decks: WorkspaceDeckSummary[];
  scope: ImportVerificationScope;
  keptLocalEdits: number;
  /** Contents whose note in the package is older than the stored one; they stay as they are. */
  olderInPackage: number;
  missingInPackage: number;
}

const INTERRUPTED_IMPORT_KEY = "interruptedImport";

export async function readInterruptedImport(database: IDBDatabase): Promise<InterruptedImport | null> {
  const transaction = database.transaction([STORE.meta, STORE.decks], "readonly");
  const entry = await requestResult<{ value: InterruptedImport } | undefined>(transaction.objectStore(STORE.meta).get(INTERRUPTED_IMPORT_KEY));
  const decks = await Promise.all((entry?.value.deckIds ?? []).map((id) => requestResult<WorkspaceDeckSummary | undefined>(transaction.objectStore(STORE.decks).get(id))));
  await transactionDone(transaction);
  if (!entry) return null;
  if (decks.some((deck) => deck && !deck.deletedAt)) return entry.value;
  await clearInterruptedImport(database);
  return null;
}

async function clearInterruptedImport(database: IDBDatabase) {
  const transaction = database.transaction(STORE.meta, "readwrite");
  transaction.objectStore(STORE.meta).delete(INTERRUPTED_IMPORT_KEY);
  await transactionDone(transaction);
}

export interface ImportCommitOptions {
  deckSettings: Partial<DeckSettings>;
  reimportTargets?: ReimportTargets;
  onMedia?: (file: ImportMediaFile) => Promise<void>;
  source?: ImportSource;
  /**
   * Continues an interrupted import of the same package: cards it already took over still get their history. Otherwise,
   * as in Anki, only cards new to CoRe take over the package's review history.
   */
  resume?: boolean;
}

export async function commitImportGraph(
  { database, userId, shellDecks, replaceShellDecks, stageMutations, writeNoteGraphs }: {
    database: IDBDatabase;
    userId: string;
    shellDecks: () => WorkspaceDeckSummary[];
    replaceShellDecks: (decks: WorkspaceDeckSummary[], updatedAt?: string) => void;
    stageMutations: (inputs: readonly OutboxMutationInput[]) => StagedMutations;
    writeNoteGraphs: (changes: NoteGraphChange[]) => Promise<void>;
  },
  graph: ImportCommitGraph,
  { deckSettings, reimportTargets = { notes: [], cards: [], noteTypeSources: [] }, onMedia = async () => {}, source, resume = false }: ImportCommitOptions,
): Promise<ImportCommitResult> {
  const now = new Date().toISOString();
  const scope: ImportVerificationScope = { deckIds: [], noteTypeSourceIds: [], noteIds: [], cardIds: [], reviewEventIds: [] };
  const persistedDeckIds = new Map<string, string>();
  const persistedNoteTypeSourceIds = new Map<string, string>();
  const persistedCardIds = new Map<string, string>();
  let keptLocalEdits = 0;
  let olderInPackage = 0;
  let missingInPackage = 0;

  // Existing imports: local records first, cloud targets (loaded before the commit) for everything else.
  const targetNotesByGuid = new Map(reimportTargets.notes.flatMap((note) => note.ankiGuid ? [[note.ankiGuid, note] as const] : []));
  const targetCardsByNote = new Map<string, ReimportTargets["cards"]>();
  for (const card of reimportTargets.cards) targetCardsByNote.set(card.noteId, [...(targetCardsByNote.get(card.noteId) ?? []), card]);
  const targetSourceByAnkiId = new Map(reimportTargets.noteTypeSources.map((source) => [source.ankiNotetypeId, source.id]));

  const record: InterruptedImport | null = source ? { ...source, deckIds: [], cardCount: graph.cardCount, committedCards: 0 } : null;
  const writeRecord = (transaction: IDBTransaction) => { if (record) transaction.objectStore(STORE.meta).put({ key: INTERRUPTED_IMPORT_KEY, value: { ...record } }); };
  if (record) {
    const transaction = database.transaction(STORE.meta, "readwrite");
    writeRecord(transaction);
    await transactionDone(transaction);
  }

  const queueAndWrite = async (stores: string[], inputs: OutboxMutationInput[], write: (transaction: IDBTransaction) => Promise<void> | void) => {
    const batch = stageMutations(inputs);
    const transaction = database.transaction([...new Set([...stores, STORE.outbox])], "readwrite");
    const done = transactionDone(transaction);
    await write(transaction);
    batch.write(transaction);
    await done;
  };

  await graph.streamChunks(async (chunk) => {
    if (chunk.kind === "media") {
      await onMedia(chunk.file);
      return;
    }
    if (chunk.kind === "decks") {
      const decks: WorkspaceDeckSummary[] = [];
      const inputs: any[] = [];
      const shell = shellDecks();
      const knownDecks = new Map(shell.map((deck) => [deck.id, deck]));
      for (const incoming of chunk.decks) {
        const parentDeckId = incoming.parentDeckId ? persistedDeckIds.get(incoming.parentDeckId) ?? incoming.parentDeckId : null;
        const existing = shell.find((deck) => deck.source === "anki-apkg" && (
          (incoming.ankiDeckId && deck.ankiDeckId === incoming.ankiDeckId)
          || (!incoming.ankiDeckId && !deck.ankiDeckId && (deck.parentDeckId ?? null) === parentDeckId && deck.name === incoming.name)
        ));
        // Reimport keeps the local name, parent, path and settings of an existing deck; a new deck continues the path
        // of its persisted parent, which may have been moved or renamed locally.
        const deck: WorkspaceDeckSummary = existing ?? {
          ...deckRecord(normalizeCoreDeck({
            id: incoming.id,
            ownerId: userId,
            name: incoming.name,
            source: "anki-apkg",
            ankiDeckId: incoming.ankiDeckId,
            parentDeckId,
            hierarchyPath: [...(parentDeckId ? knownDecks.get(parentDeckId)?.hierarchyPath ?? [] : []), incoming.name],
            deckSettings: incoming.appearance ? { ...deckSettings, appearance: incoming.appearance } : deckSettings,
            createdAt: now,
          })),
        };
        persistedDeckIds.set(incoming.id, deck.id);
        knownDecks.set(deck.id, deck);
        scope.deckIds.push(deck.id);
        if (!existing) {
          decks.push(deck);
          inputs.push(...planEntityMutations({}, { decks: [{ ...deck, cards: [], reviewEvents: [] } as Deck] }));
        }
      }
      if (record) record.deckIds = [...new Set(scope.deckIds)];
      await queueAndWrite([STORE.decks, STORE.deckStudySummaries, STORE.meta], inputs, (transaction) => {
        for (const deck of decks) {
          transaction.objectStore(STORE.decks).put(deck);
          transaction.objectStore(STORE.deckStudySummaries).put(emptyDeckStudySummary(deck.id));
        }
        writeRecord(transaction);
      });
      replaceShellDecks(decks, now);
      return;
    }
    if (chunk.kind === "note-type-sources") {
      const sources: Array<NoteTypeSource & { revision: number; createdAt: string; updatedAt: string }> = [];
      const read = database.transaction(STORE.noteTypeSources, "readonly");
      for (const incoming of chunk.values) {
        const local = await requestResult<Array<{ id: string }>>(read.objectStore(STORE.noteTypeSources).index("ankiNotetypeId").getAll(incoming.ankiNotetypeId));
        const id = local[0]?.id ?? targetSourceByAnkiId.get(incoming.ankiNotetypeId) ?? incoming.id;
        persistedNoteTypeSourceIds.set(incoming.id, id);
        sources.push({ ...incoming, id, revision: 1, createdAt: now, updatedAt: now });
        scope.noteTypeSourceIds.push(id);
      }
      await transactionDone(read);
      await queueAndWrite(
        [STORE.noteTypeSources],
        sources.map((source) => insertEntityMutation("note_type_sources", source)),
        (transaction) => { for (const source of sources) transaction.objectStore(STORE.noteTypeSources).put(source); },
      );
      return;
    }
    if (chunk.kind === "notes") {
      const read = database.transaction([STORE.notes, STORE.cards, STORE.variants], "readonly");
      const changes: NoteGraphChange[] = [];
      const persistedNoteIds = new Map<string, string>();
      const olderNoteIds = new Set<string>();
      const incomingCardsByNote = new Map<string, Card[]>();
      for (const card of chunk.cards) incomingCardsByNote.set(card.noteId, [...(incomingCardsByNote.get(card.noteId) ?? []), card]);
      for (const incoming of chunk.notes) {
        const noteTypeSourceId = incoming.noteTypeSourceId ? persistedNoteTypeSourceIds.get(incoming.noteTypeSourceId) ?? incoming.noteTypeSourceId : null;
        const localMatches = incoming.ankiGuid ? await requestResult<Note[]>(read.objectStore(STORE.notes).index("ankiGuid").getAll(incoming.ankiGuid)) : [];
        const existing = localMatches.find((note) => !note.deletedAt) ?? (incoming.ankiGuid ? targetNotesByGuid.get(incoming.ankiGuid) : undefined);
        const incomingCards = (incomingCardsByNote.get(incoming.id) ?? []).map((card) => ({ ...card, deckId: persistedDeckIds.get(card.deckId) ?? card.deckId }));
        if (!existing) {
          const note: Note = { ...incoming, userId, noteTypeSourceId };
          persistedNoteIds.set(incoming.id, note.id);
          changes.push({ previous: null, next: { note, cards: incomingCards } });
          for (const card of incomingCards) persistedCardIds.set(card.id, card.id);
          continue;
        }
        persistedNoteIds.set(incoming.id, existing.id);
        // As in Anki, an older note in the package changes nothing: not the content, its tags, cards or raw fields.
        if (existing.importedAnkiModifiedAt && incoming.importedAnkiModifiedAt
          && Date.parse(incoming.importedAnkiModifiedAt) < Date.parse(existing.importedAnkiModifiedAt)) {
          olderInPackage += 1;
          olderNoteIds.add(incoming.id);
          continue;
        }
        // Tags are no content: they merge three-way against the tags of the last import, even after local edits.
        const locallyEdited = existing.importedContentRevision === null || existing.contentRevision > existing.importedContentRevision;
        if (locallyEdited) keptLocalEdits += 1;
        const importedTags = incoming.importedTags ?? incoming.content.tags;
        const tags = mergeImportedTags(existing.content.tags, existing.importedTags, importedTags);
        // A changed note type in Anki replaces the content as well, translated with the new type.
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
            updatedAt: now,
          }
          : tagsChanged
            ? { ...existing, content: { ...existing.content, tags }, importedTags, importedAnkiModifiedAt, revision: existing.revision + 1, updatedAt: now }
            : existing;
        const localCards = (await Promise.all((await requestResult<IDBValidKey[]>(read.objectStore(STORE.cards).index("noteId").getAllKeys(existing.id)))
          .map((id) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(id)))))
          .filter((card): card is StoredCard => Boolean(card && !card.deletedAt));
        const knownCards = [...localCards, ...(targetCardsByNote.get(existing.id) ?? [])];
        const existingIds = new Map<string, string>();
        for (const card of knownCards) {
          if (card.ankiCardId) existingIds.set(`anki:${card.ankiCardId}`, card.id);
          existingIds.set(`key:${card.promptKey}`, card.id);
        }
        const newCards: Card[] = [];
        const matchedIds = new Set<string>();
        for (const card of incomingCards) {
          const matched = (card.ankiCardId ? existingIds.get(`anki:${card.ankiCardId}`) : undefined) ?? existingIds.get(`key:${card.promptKey}`);
          if (matched) {
            if (resume) persistedCardIds.set(card.id, matched);
            matchedIds.add(matched);
          } else if (!locallyEdited) {
            newCards.push({ ...card, noteId: existing.id });
            persistedCardIds.set(card.id, card.id);
          }
        }
        missingInPackage += new Set(knownCards.map((card) => card.id).filter((id) => !matchedIds.has(id))).size;
        // A replaced unedited content outdates the rephrasings of kept cards whose prompt changed, as an edit does;
        // a choice variant would otherwise show old option texts graded by the new correctness.
        const outdated: Array<{ previous: Card; next: Card }> = [];
        for (const stored of contentChanged ? localCards.filter((card) => matchedIds.has(card.id)) : []) {
          const previous = hydrateCard(stored, await requestResult<StoredVariant[]>(read.objectStore(STORE.variants).index("cardId").getAll(stored.id)));
          const next = outdateVariantsOfChangedSource(existing.content, incoming.content, previous, now);
          if (next !== previous) outdated.push({ previous, next });
        }
        if (note !== existing || newCards.length || outdated.length) {
          changes.push({ previous: { note: existing, cards: outdated.map((card) => card.previous) }, next: { note, cards: [...newCards, ...outdated.map((card) => card.next)] } });
        }
      }
      await transactionDone(read);
      // Raw field values are kept for every imported content; re-translation only touches unedited ones.
      const noteSources = chunk.noteSources.filter((source) => !olderNoteIds.has(source.noteId)).map((source) => ({
        noteId: persistedNoteIds.get(source.noteId) ?? source.noteId,
        noteTypeSourceId: persistedNoteTypeSourceIds.get(source.noteTypeSourceId) ?? source.noteTypeSourceId,
        fields: source.fields,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }));
      if (changes.length) await writeNoteGraphs(changes);
      if (record) record.committedCards += chunk.cards.length;
      await queueAndWrite(
        [STORE.noteSources, STORE.meta],
        noteSources.map((source) => insertEntityMutation("note_sources", source, source.noteId)),
        (transaction) => {
          for (const source of noteSources) transaction.objectStore(STORE.noteSources).put(source);
          writeRecord(transaction);
        },
      );
      for (const change of changes) {
        scope.noteIds.push(change.next.note.id);
        // Kept cards with outdated variants may sit in a deck outside the import; only new cards are verified.
        const kept = new Set(change.previous?.cards.map((card) => card.id));
        for (const card of change.next.cards) if (!kept.has(card.id)) scope.cardIds.push(card.id);
      }
      return;
    }
    const events: ReviewEvent[] = chunk.values.flatMap((incoming) => {
      const cardId = persistedCardIds.get(incoming.cardId);
      if (!cardId) return [];
      return [{
        id: incoming.id,
        userId,
        deckId: "",
        cardId,
        variantId: null,
        rating: incoming.rating,
        answeredAt: incoming.answeredAt,
        responseTimeMs: incoming.responseTimeMs,
        schedulerBefore: incoming.schedulerBefore,
        schedulerAfter: incoming.schedulerAfter,
        flags: incoming.flags,
        createdAt: incoming.answeredAt,
      }];
    });
    const read = database.transaction([STORE.cards, STORE.reviewEvents], "readonly");
    const cards = await Promise.all(events.map((event) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(event.cardId))));
    const existing = await Promise.all(events.map((event) => requestResult<IDBValidKey | undefined>(read.objectStore(STORE.reviewEvents).getKey(event.id))));
    await transactionDone(read);
    const newEvents = events
      .map((event, index) => ({ ...event, deckId: cards[index]?.deckId ?? "" }))
      .filter((event, index) => event.deckId && existing[index] == null);
    await queueAndWrite(
      [STORE.reviewEvents],
      newEvents.map((event) => insertEntityMutation("review_events", event)),
      (transaction) => { for (const event of newEvents) transaction.objectStore(STORE.reviewEvents).put(event); },
    );
    scope.reviewEventIds.push(...newEvents.map((event) => event.id));
  });
  if (record) await clearInterruptedImport(database);

  const finalScope = {
    deckIds: [...new Set(scope.deckIds)].sort(),
    noteTypeSourceIds: [...new Set(scope.noteTypeSourceIds)].sort(),
    noteIds: [...new Set(scope.noteIds)].sort(),
    cardIds: [...new Set(scope.cardIds)].sort(),
    reviewEventIds: [...new Set(scope.reviewEventIds)].sort(),
  };
  return {
    decks: finalScope.deckIds.map((id) => shellDecks().find((deck) => deck.id === id)).filter((deck): deck is WorkspaceDeckSummary => Boolean(deck)),
    scope: finalScope,
    keptLocalEdits,
    olderInPackage,
    missingInPackage,
  };
}
