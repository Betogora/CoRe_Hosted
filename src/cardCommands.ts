import { aiCardVariantAvoidTexts, createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import { AiCardVariantContractError } from "./aiCardVariantContract.ts";
import type { SettingsSection } from "./appNavigation.ts";
import type { CardEditorServices, CreationScreenProps, DecksCardPage, DecksCardPageRequest } from "./appScreenProps.ts";
import type { CardBatchAction } from "./cardBatchActions.ts";
import type { CardVariantBatchMode } from "./cardVariantBatch.ts";
import { addCardVariant, applyCardStudyStatePatch, createNote, duplicateNote, moveCardToDeck, planNoteContentChange, planNoteDeletion, planNoteRestore, removeUnusedNoteMedia, replaceOutdatedVariants } from "./coreModel.ts";
import type { Card, CardStudyStatePatch, NoteContent } from "./coreTypes.ts";
import { cardVariantSource, deactivateVariant, deleteVariant, editVariantText, isEditedVariant, reactivateVariant } from "./coreVariantService.ts";
import { createWorkspaceDeck } from "./coreWorkspace.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import type { WorkspaceHydrationService } from "./workspaceHydrationService.ts";
import { catalogEntryFromCard, type NoteGraph } from "./workspaceReplica.ts";
import type { WorkspaceSnapshot, WorkspaceStore } from "./workspaceStore.ts";

export interface CardCommandsContext {
  store: WorkspaceStore;
  repository: IndexedDbCoreRepository;
  /** The service follows the media store, which arrives after the workspace opened. */
  hydration: () => WorkspaceHydrationService | null;
  cloud: ReturnType<typeof createSupabaseBrowserClient> | null;
  syncEngine: () => AccountSyncEngine | null;
  /** Applies the repository's shell state to the store; without `preserveCardPages` it empties the card pages. */
  refresh: (options?: { preserveCardPages?: boolean }) => unknown;
  /** The learning time, which follows the simulated clock. */
  now: () => string;
  /** Run id of the workspace start; a newer start drops the card pages still loading for an older one. */
  bootRun: { readonly current: number };
}

export type CardCommands = ReturnType<typeof createCardCommands>;

/**
 * Card management commands of the open workspace: content, study state, variants, media, mass actions and the card
 * pages of the lists. Each local write refreshes the store, updates the card pages that show the content and asks
 * for a sync; quick study-state changes run one after another.
 */
export function createCardCommands({ store, repository, hydration, cloud, syncEngine, refresh, now, bootRun }: CardCommandsContext) {
  const cardPageRequests = new Map<string, { controller: AbortController; listKey: string; view: string }>();
  let studyStatePatchChain: Promise<unknown> = Promise.resolve();
  const requestSync = () => syncEngine()?.requestSync();

  function setCardPages(update: (current: WorkspaceSnapshot["cardPages"]) => WorkspaceSnapshot["cardPages"]) {
    store.set((current) => ({ cardPages: update(current.cardPages) }));
  }

  /** Page requests started before a write would land later with the old preview; the request loop asks again. */
  function abortCardPageRequests() {
    for (const { controller } of cardPageRequests.values()) controller.abort();
    cardPageRequests.clear();
  }

  async function requestCardPage(request: DecksCardPageRequest) {
    const workspaceHydrationService = hydration();
    const runId = bootRun.current;
    const listKey = request.deckId;
    const view = JSON.stringify([request.query, request.sort.field, request.sort.direction, request.deckIds ?? null]);
    const sameView = (page: DecksCardPage | undefined): page is DecksCardPage => Boolean(page && !page.loadError
      && JSON.stringify([page.query, page.sort.field, page.sort.direction, page.deckIds ?? null]) === view);
    // A changed search, sort or scope cancels what the list still loads; pages of the same view load side by side.
    const requestKey = `${listKey}#${request.page}`;
    for (const [key, running] of cardPageRequests) {
      if (running.listKey === listKey && (running.view !== view || key === requestKey)) {
        running.controller.abort();
        cardPageRequests.delete(key);
      }
    }
    const controller = new AbortController();
    cardPageRequests.set(requestKey, { controller, listKey, view });
    // Identity, not a key: a repeated identical request replaces this one, whose (aborted) answer must be dropped.
    const isCurrent = () => bootRun.current === runId && cardPageRequests.get(requestKey)?.controller === controller;
    // Prev/next only changes the selected card: the loaded page stays and just the card (often prefetched) is read.
    const shown = store.get().cardPages[listKey];
    const onlySelectionChanged = Boolean(workspaceHydrationService && request.selectedCardId && sameView(shown) && shown.pages[request.page]);
    const scope = request.deckIds ?? request.deckId;
    let loaded: { items?: DecksCardPage["pages"][number]; page?: number; pageSize?: number; totalCount?: number; selected?: DecksCardPage["selected"]; limitedToLocalCatalog?: boolean };
    try {
      loaded = onlySelectionChanged
        ? { selected: await workspaceHydrationService!.querySelectedCard(scope, request.selectedCardId!) }
        : workspaceHydrationService
          ? await workspaceHydrationService.queryCardPage({ ...request, signal: controller.signal })
          : await repository.listCardPage(scope, request);
    } catch (error) {
      if (!isCurrent() || controller.signal.aborted) return false;
      cardPageRequests.delete(requestKey);
      setCardPages((current) => ({
        ...current,
        [listKey]: {
          ...(current[listKey] ?? { deckId: listKey, pages: {}, pageSize: request.pageSize, totalCount: 0, query: request.query, sort: request.sort, deckIds: request.deckIds }),
          requestedCardId: request.selectedCardId,
          loadError: error instanceof Error ? error.message : "Karten konnten nicht geladen werden.",
        },
      }));
      return true;
    }
    if (!isCurrent()) return false;
    cardPageRequests.delete(requestKey);
    setCardPages((current) => {
      const previous = sameView(current[listKey]) ? current[listKey]! : null;
      const pages = { ...previous?.pages };
      if (loaded.items) pages[loaded.page ?? request.page] = loaded.items;
      // Only a request that names the open card changes it; scrolling loads pages without one.
      const selection = request.selectedCardId ? { selected: loaded.selected ?? null, requestedCardId: request.selectedCardId } : { selected: previous?.selected, requestedCardId: previous?.requestedCardId };
      return {
        ...current,
        [listKey]: {
          deckId: listKey,
          pages,
          pageSize: loaded.pageSize ?? previous?.pageSize ?? request.pageSize,
          totalCount: loaded.totalCount ?? previous?.totalCount ?? 0,
          query: request.query,
          sort: request.sort,
          deckIds: request.deckIds,
          ...selection,
          loadError: null,
          limitedToLocalCatalog: loaded.limitedToLocalCatalog ?? previous?.limitedToLocalCatalog,
        },
      };
    });
    return true;
  }

  /**
   * Mark and tags belong to the content (all siblings show them); suspension and flag belong to the card. Patches run
   * one after another, so quick changes (Strg+3, then Strg+K) each build on the stored result of the previous one.
   */
  function applyCardStudyState(cardId: string, patch: CardStudyStatePatch) {
    const run = studyStatePatchChain.then(() => writeCardStudyState(cardId, patch));
    studyStatePatchChain = run.catch(() => undefined);
    return run;
  }

  async function writeCardStudyState(cardId: string, patch: CardStudyStatePatch) {
    const body = await repository.loadCardBody(cardId);
    if (!body) return null;
    const { note, card } = applyCardStudyStatePatch(body.note, body.card, patch);
    if (note === body.note && card === body.card) return { note, card };
    // A changed mark or tags also refresh the catalog rows of locally known siblings.
    const siblings = note !== body.note ? (await repository.loadNoteGraph(body.note.id))?.cards ?? [body.card] : [body.card];
    await repository.saveNoteGraphs([{
      previous: { note: body.note, cards: siblings },
      next: { note, cards: siblings.map((candidate) => candidate.id === card.id ? card : candidate) },
    }]);
    return { note, card };
  }

  async function setCardStudyState(_deckId: string, cardId: string, patch: CardStudyStatePatch) {
    const result = await applyCardStudyState(cardId, patch);
    if (!result) return null;
    return reloadNoteGraph(result.note.id);
  }

  /** Loads a content with all its cards (also in other decks) and refreshes every visible card page that shows it. */
  // Follows a local write: the replica already holds the new graph, while the cloud may not have it yet.
  async function reloadNoteGraph(noteId: string, refreshPages = false): Promise<NoteGraph | null> {
    const graph = await repository.loadNoteGraph(noteId);
    refresh({ preserveCardPages: true });
    abortCardPageRequests();
    // Visible rows of the content's cards take over the changed preview, mark and suspension at once.
    const entries = new Map((graph?.cards ?? []).map((card) => [card.id, catalogEntryFromCard(card, graph!.note)]));
    setCardPages((current) => Object.fromEntries(Object.entries(current).map(([listKey, list]) => {
      if (!list) return [listKey, list];
      const shownItems = Object.values(list.pages).flat();
      // A list that lost or gained a card reloads, so a moved card leaves no row behind in its former deck.
      if (refreshPages && (graph?.cards.some((card) => card.deckId === listKey || list.deckIds?.includes(card.deckId)) || shownItems.some((item) => entries.has(item.id)))) return [listKey, undefined];
      const selected = list.selected && list.selected.note.id === noteId
        ? graph?.cards.some((card) => card.id === list.selected!.cardId) ? { ...graph, cardId: list.selected.cardId } : null
        : list.selected;
      const pages = Object.fromEntries(Object.entries(list.pages).map(([page, items]) => [page, items.map((item) => {
        const entry = entries.get(item.id);
        return entry ? { ...item, ...entry, syncChangeId: item.syncChangeId } : item;
      })]));
      return [listKey, { ...list, pages, selected }];
    })));
    requestSync();
    return graph;
  }

  async function saveDeckNote(graph: NoteGraph, content: NoteContent) {
    const plan = planNoteContentChange(graph, content);
    if (!plan.changed && !plan.newCards.length && !plan.removedCards.length) return graph;
    const updatedAt = new Date().toISOString();
    const removed = planNoteDeletion(plan.note, plan.removedCards, updatedAt).cards;
    await repository.saveNoteGraphs([{ previous: graph, next: { note: plan.note, cards: [...plan.keptCards, ...plan.newCards, ...removed] } }]);
    return reloadNoteGraph(graph.note.id, plan.newCards.length > 0 || plan.removedCards.length > 0);
  }

  async function deleteDeckNote(graph: NoteGraph) {
    const plan = planNoteDeletion(graph.note, graph.cards);
    const deleted = { note: plan.note, cards: plan.cards };
    await repository.saveNoteGraphs([{ previous: graph, next: deleted }]);
    refresh();
    requestSync();
    return { deleted, undo: plan.undo };
  }

  async function undoDeleteDeckNote(undo: NoteGraph, deleted: NoteGraph) {
    const restored = planNoteRestore(undo, deleted);
    await repository.saveNoteGraphs([{ previous: deleted, next: restored }]);
    refresh();
    requestSync();
    return restored;
  }

  async function duplicateDeckNote(graph: NoteGraph) {
    // The stored graph, not the shown one: after a move or its undo the copy lands in the card's current decks.
    const current = await repository.loadNoteGraph(graph.note.id) ?? graph;
    const copy = duplicateNote(current.note, current.cards);
    await repository.saveNoteGraphs([{ previous: null, next: copy }]);
    refresh();
    requestSync();
    return copy;
  }

  /** Manual study changes (reschedule, reset, leech, bury, undo) refresh the open editor and the table. */
  async function applyManualStudyChanges(change: (repository: IndexedDbCoreRepository) => Promise<Card[]>) {
    const cards = await change(repository);
    refresh({ preserveCardPages: true });
    const byId = new Map(cards.map((card) => [card.id, card]));
    setCardPages((current) => Object.fromEntries(Object.entries(current).map(([deckId, page]) => [deckId, page?.selected && page.selected.cards.some((card) => byId.has(card.id)) ? {
      ...page,
      selected: { ...page.selected, cards: page.selected.cards.map((card) => byId.get(card.id) ?? card) },
    } : page])));
    requestSync();
    return cards;
  }

  /** Mass action of the card management (KV4): one local write, then the lists reload and the outbox syncs. */
  async function runDeckCardBatch(cardIds: string[], action: CardBatchAction) {
    const workspaceHydrationService = hydration();
    if (!workspaceHydrationService) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const { runCardBatch } = await import("./cardBatchActions.ts");
    const afterWrite = () => {
      refresh();
      requestSync();
    };
    const result = await runCardBatch({ repository, openCards: workspaceHydrationService.openCards, now }, cardIds, action);
    afterWrite();
    return { ...result, undo: async () => {
      const undone = await result.undo();
      afterWrite();
      return undone;
    } };
  }

  async function prepareDeckTextReplace(cardIds: string[]) {
    const workspaceHydrationService = hydration();
    if (!workspaceHydrationService) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const { prepareTextReplace } = await import("./cardBatchActions.ts");
    return prepareTextReplace({ repository, openCards: workspaceHydrationService.openCards, now }, cardIds);
  }

  function rescheduleDeckCards(cardIds: string[], dueAt: string, occurredAt: string) {
    return applyManualStudyChanges((current) => current.rescheduleCards(cardIds, dueAt, occurredAt));
  }

  /** Moves one card of a content to another deck; its siblings, study state and variants stay. */
  async function moveDeckCard(cardId: string, deckId: string) {
    const body = await repository.loadCardBody(cardId);
    const graph = body ? await repository.loadNoteGraph(body.note.id) : null;
    if (!graph) return null;
    const next = { note: graph.note, cards: graph.cards.map((card) => card.id === cardId ? moveCardToDeck(card, deckId) : card) };
    await repository.saveNoteGraphs([{ previous: graph, next }]);
    return reloadNoteGraph(graph.note.id, true);
  }

  async function editDeckCardVariant(cardId: string, variantId: string, text: { front: string; back: string }) {
    const body = await repository.loadCardBody(cardId);
    const source = body ? cardVariantSource(body.note, body.card) : null;
    const saved = await repository.updateCard(cardId, (card) => editVariantText(card, variantId, text, undefined, source));
    if (!saved) throw new Error("Die Variante konnte nicht gespeichert werden.");
    await reloadNoteGraph(saved.note.id);
  }

  async function removeDeckNoteMedia(graph: NoteGraph, names: string[]) {
    const note = removeUnusedNoteMedia(graph.note, names);
    if (note === graph.note) return graph;
    await repository.saveNoteGraphs([{ previous: graph, next: { note, cards: graph.cards } }]);
    return reloadNoteGraph(graph.note.id);
  }

  /** `refresh` replaces the card's earlier variants except edited ones with the new one; otherwise it adds one and replaces outdated ones. */
  async function generateDeckCardVariant(_deckId: string, cardId: string, mode: CardVariantBatchMode = "missing") {
    const body = await repository.loadCardBody(cardId);
    const source = body ? cardVariantSource(body.note, body.card) : null;
    if (!source || !body) throw new AiCardVariantContractError("card_not_found", "Die Ausgangskarte ist nicht mehr verfügbar.");
    const generated = await requestAiCardVariant(source, cloud, { avoid: aiCardVariantAvoidTexts(body.card) });

    const current = await repository.loadCardBody(cardId);
    const draft = createAiGeneratedVariantDraft(source, current, generated);
    const input = { ...draft, meta: { ...draft.meta, reason: "KI-Umformulierung" } };
    const saved = await repository.updateCard(cardId, (card) => mode === "refresh"
      ? addCardVariant(card.variants.filter((variant) => !variant.deletedAt && !isEditedVariant(variant)).reduce((next, variant) => deleteVariant(next, variant.id), card), input)
      : replaceOutdatedVariants(card, input));
    if (!saved) throw new AiCardVariantContractError("save_failed", "Die Variante konnte nicht gespeichert werden.");
    await reloadNoteGraph(saved.note.id);
    return generated;
  }

  async function updateDeckCardVariant(cardId: string, variantId: string, action: "reactivate" | "deactivate" | "delete") {
    const apply = { reactivate: reactivateVariant, deactivate: deactivateVariant, delete: deleteVariant }[action];
    const saved = await repository.updateCard(cardId, (card) => apply(card, variantId));
    if (!saved) throw new Error("Die Variante konnte nicht gespeichert werden.");
    await reloadNoteGraph(saved.note.id);
    requestSync();
  }

  /** Creates a manual content with its cards, in a new deck when no deck id is given. */
  async function saveManualNote({ deckId, deckName, content, media }: Parameters<CreationScreenProps["onSaveManualNote"]>[0]) {
    const currentState = store.get().state;
    if (!currentState) return null;
    let deck = deckId ? currentState.decks.find((candidate) => candidate.id === deckId) ?? null : null;
    if (!deckId) {
      const created = createWorkspaceDeck(currentState.decks, {
        name: deckName,
        deckSettings: createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences(currentState.profile)),
      });
      deck = created ? repository.saveDeckMetadata([created])[0] ?? null : null;
    }
    if (!deck) return null;
    const graph = createNote({ content, deckId: deck.id, media });
    await repository.saveNoteGraphs([{ previous: null, next: graph }]);
    refresh();
    requestSync();
    return { deck, cardIds: graph.cards.map((card) => card.id) };
  }

  /** Instant actions and reads of the card editor; the services stay while the account's flag names stay. */
  function createCardEditorServices(flagNames: string[], openSettings: (section: SettingsSection) => unknown): CardEditorServices {
    return {
      flagNames,
      moveCard: moveDeckCard,
      // Manual events carry the learning time, so burying follows a simulated learning day as well.
      resetCards: (cardIds) => applyManualStudyChanges((current) => current.resetCards(cardIds, now())),
      setCardsLeech: (cardIds, leechedAt) => applyManualStudyChanges((current) => current.setCardsLeech(cardIds, leechedAt, now())),
      buryCards: (cardIds, buried) => applyManualStudyChanges((current) => current.buryCards(cardIds, buried, now())),
      restoreCardStudies: (studies) => applyManualStudyChanges((current) => current.restoreCardStudies(studies, now())),
      editVariant: editDeckCardVariant,
      removeNoteMedia: removeDeckNoteMedia,
      loadCard: async (cardId) => repository.loadCardBody(cardId),
      listReviewEvents: async (cardId) => repository.listCardReviewEvents(cardId),
      listTagDirectory: async () => {
        const local = () => repository.listTagDirectory();
        if (!cloud || (typeof navigator !== "undefined" && navigator.onLine === false)) return local();
        // Tag changes still waiting here reach the cloud first, so its directory already shows them (KV5).
        const pendingSync = syncEngine();
        if (pendingSync?.pendingCount()) await pendingSync.flush().catch(() => undefined);
        return (await import("./cloudRepository.ts")).listAccountTags(cloud).catch(local);
      },
      listNoteTypes: async () => repository.listNoteTypes(),
      prefetchCard: (cardId) => hydration()?.prefetchCardGraph(cardId),
      listExamsForDeck: async (deckId) => {
        const currentState = store.get().state;
        if (!currentState) return [];
        const { getExamDeckIds } = await import("./examPlanning.ts");
        return getGlobalSchedulerPreferences(currentState.profile).examPlanning.exams
          .filter((exam) => getExamDeckIds(currentState.decks, exam).has(deckId))
          .map((exam) => exam.name);
      },
      cloud: cloud ? {
        // Answers taken back here leave the history before the cloud has removed them.
        listCardReviewEvents: async (cardId, signal) => {
          const events = await (await import("./cloudRepository.ts")).listCardReviewEvents(cloud, cardId, signal);
          const takenBack = new Set(repository.outbox.listPending().flatMap((mutation) => mutation.type === "review-undo" ? [mutation.entityId] : []));
          return events.filter((event) => !takenBack.has(event.id));
        },
        listSimilarNotes: async (noteId, signal) => (await import("./cloudRepository.ts")).listSimilarNotes(cloud, noteId, signal),
      } : null,
      openFlagNames: () => openSettings("flaggen"),
      openSyncConflicts: () => openSettings("konflikte"),
    };
  }

  return {
    requestCardPage,
    abortCardPageRequests,
    applyCardStudyState,
    setCardStudyState,
    saveDeckNote,
    deleteDeckNote,
    undoDeleteDeckNote,
    duplicateDeckNote,
    runDeckCardBatch,
    prepareDeckTextReplace,
    rescheduleDeckCards,
    generateDeckCardVariant,
    updateDeckCardVariant,
    saveManualNote,
    createCardEditorServices,
  };
}
