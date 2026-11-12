// Private to indexedDbCoreRepository.ts: takes over an APKG import graph chunk by chunk, including reimports (K5.7).
import { mergeImportedTags, normalizeCoreDeck } from "./coreModel.ts";
import type { Card, Deck, DeckSettings, ImportVerificationScope, Note, ReviewEvent } from "./coreTypes.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { ImportCommitGraph, ImportMediaFile, NoteTypeSource } from "./apkgImport.ts";
import { insertEntityMutation, planEntityMutations } from "./syncMutationPlanner.ts";
import {
  STORE,
  type NoteGraphChange,
  type StoredCard,
  type WorkspaceDeckSummary,
  requestResult,
  transactionDone,
  deckRecord,
  emptyDeckStudySummary,
} from "./indexedDbStore.ts";

/** Existing imported contents found per Anki GUID before a commit (K5.7). */
export interface ReimportTargets {
  notes: Note[];
  cards: Array<{ id: string; noteId: string; deckId: string; promptKey: string; ankiCardId: string | null }>;
  noteTypeSources: Array<{ id: string; ankiNotetypeId: string }>;
}

interface ImportCommitResult {
  decks: WorkspaceDeckSummary[];
  scope: ImportVerificationScope;
  /** Reimported contents whose local edits were kept. */
  keptLocalEdits: number;
  /** Cards present in CoRe but no longer in the package; they are only reported. */
  missingInPackage: number;
}

export interface ImportCommitOptions {
  deckSettings: Partial<DeckSettings>;
  reimportTargets?: ReimportTargets;
  onMedia?: (file: ImportMediaFile) => Promise<void>;
}

export async function commitImportGraph(
  { database, userId, shellDecks, replaceShellDecks, queueMutations, writeOutbox, writeNoteGraphs }: {
    database: IDBDatabase;
    userId: string;
    shellDecks: () => WorkspaceDeckSummary[];
    replaceShellDecks: (decks: WorkspaceDeckSummary[], updatedAt?: string) => void;
    queueMutations: (inputs: any[]) => { queued: SyncOutboxMutation[]; removedIds: string[] };
    writeOutbox: (transaction: IDBTransaction, batch: { queued: SyncOutboxMutation[]; removedIds: string[] }) => void;
    writeNoteGraphs: (changes: NoteGraphChange[]) => Promise<void>;
  },
  graph: ImportCommitGraph,
  { deckSettings, reimportTargets = { notes: [], cards: [], noteTypeSources: [] }, onMedia = async () => {} }: ImportCommitOptions,
): Promise<ImportCommitResult> {
  const now = new Date().toISOString();
  const scope: ImportVerificationScope = { deckIds: [], noteTypeSourceIds: [], noteIds: [], cardIds: [], reviewEventIds: [] };
  const persistedDeckIds = new Map<string, string>();
  const persistedNoteTypeSourceIds = new Map<string, string>();
  const persistedCardIds = new Map<string, string>();
  let keptLocalEdits = 0;
  let missingInPackage = 0;

  // Existing imports: local records first, cloud targets (loaded before the commit) for everything else.
  const targetNotesByGuid = new Map(reimportTargets.notes.flatMap((note) => note.ankiGuid ? [[note.ankiGuid, note] as const] : []));
  const targetCardsByNote = new Map<string, ReimportTargets["cards"]>();
  for (const card of reimportTargets.cards) targetCardsByNote.set(card.noteId, [...(targetCardsByNote.get(card.noteId) ?? []), card]);
  const targetSourceByAnkiId = new Map(reimportTargets.noteTypeSources.map((source) => [source.ankiNotetypeId, source.id]));

  const queueAndWrite = async (stores: string[], inputs: any[], write: (transaction: IDBTransaction) => Promise<void> | void) => {
    const batch = queueMutations(inputs);
    const transaction = database.transaction([...new Set([...stores, STORE.outbox])], "readwrite");
    const done = transactionDone(transaction);
    await write(transaction);
    writeOutbox(transaction, batch);
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
      for (const incoming of chunk.decks) {
        const existing = shellDecks().find((deck) => deck.source === "anki-apkg" && (
          (incoming.ankiDeckId && deck.ankiDeckId === incoming.ankiDeckId)
          || (!incoming.ankiDeckId && !deck.ankiDeckId && deck.hierarchyPath.join("::") === incoming.hierarchyPath.join("::"))
        ));
        // Reimport keeps the local name, parent, path and settings of an existing deck.
        const deck: WorkspaceDeckSummary = existing ?? {
          ...deckRecord(normalizeCoreDeck({
            id: incoming.id,
            ownerId: userId,
            name: incoming.name,
            source: "anki-apkg",
            ankiDeckId: incoming.ankiDeckId,
            parentDeckId: incoming.parentDeckId ? persistedDeckIds.get(incoming.parentDeckId) ?? incoming.parentDeckId : null,
            hierarchyPath: incoming.hierarchyPath,
            deckSettings: incoming.appearance ? { ...deckSettings, appearance: incoming.appearance } : deckSettings,
            createdAt: now,
          })),
        };
        persistedDeckIds.set(incoming.id, deck.id);
        scope.deckIds.push(deck.id);
        if (!existing) {
          decks.push(deck);
          inputs.push(...planEntityMutations({}, { decks: [{ ...deck, cards: [], reviewEvents: [] } as Deck] }));
        }
      }
      await queueAndWrite([STORE.decks, STORE.deckStudySummaries], inputs, (transaction) => {
        for (const deck of decks) {
          transaction.objectStore(STORE.decks).put(deck);
          transaction.objectStore(STORE.deckStudySummaries).put(emptyDeckStudySummary(deck.id));
        }
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
      const read = database.transaction([STORE.notes, STORE.cards], "readonly");
      const changes: NoteGraphChange[] = [];
      const persistedNoteIds = new Map<string, string>();
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
        // K5.7: local edits, study state, suspension, flag, leech, mark and deck placement stay; new prompts become new
        // cards. Tags are no content: they merge three-way against the tags of the last import, even after local edits.
        persistedNoteIds.set(incoming.id, existing.id);
        const locallyEdited = existing.importedContentRevision === null || existing.contentRevision > existing.importedContentRevision;
        if (locallyEdited) keptLocalEdits += 1;
        const importedTags = incoming.importedTags ?? incoming.content.tags;
        const tags = mergeImportedTags(existing.content.tags, existing.importedTags, importedTags);
        const contentChanged = !locallyEdited
          && JSON.stringify({ ...existing.content, tags: [] }) !== JSON.stringify({ ...incoming.content, tags: [] });
        const tagsChanged = JSON.stringify(tags) !== JSON.stringify(existing.content.tags)
          || JSON.stringify(importedTags) !== JSON.stringify(existing.importedTags);
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
            revision: existing.revision + 1,
            updatedAt: now,
          }
          : tagsChanged
            ? { ...existing, content: { ...existing.content, tags }, importedTags, revision: existing.revision + 1, updatedAt: now }
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
            persistedCardIds.set(card.id, matched);
            matchedIds.add(matched);
          } else if (!locallyEdited) {
            newCards.push({ ...card, noteId: existing.id });
            persistedCardIds.set(card.id, card.id);
          }
        }
        missingInPackage += new Set(knownCards.map((card) => card.id).filter((id) => !matchedIds.has(id))).size;
        if (note !== existing || newCards.length) changes.push({ previous: { note: existing, cards: [] }, next: { note, cards: newCards } });
      }
      await transactionDone(read);
      // Raw field values are kept for every imported content; re-translation only touches unedited ones.
      const noteSources = chunk.noteSources.map((source) => ({
        noteId: persistedNoteIds.get(source.noteId) ?? source.noteId,
        noteTypeSourceId: persistedNoteTypeSourceIds.get(source.noteTypeSourceId) ?? source.noteTypeSourceId,
        fields: source.fields,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }));
      if (changes.length) await writeNoteGraphs(changes);
      await queueAndWrite(
        [STORE.noteSources],
        noteSources.map((source) => insertEntityMutation("note_sources", source, source.noteId)),
        (transaction) => { for (const source of noteSources) transaction.objectStore(STORE.noteSources).put(source); },
      );
      for (const change of changes) {
        scope.noteIds.push(change.next.note.id);
        for (const card of change.next.cards) scope.cardIds.push(card.id);
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
    missingInPackage,
  };
}
