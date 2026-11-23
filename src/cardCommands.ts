import { aiCardVariantAvoidTexts, asksVariantSource, createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import { AI_CARD_VARIANT_PROMPT_VERSION, AI_CARD_VARIANT_REJECTIONS, AiCardVariantContractError } from "./aiCardVariantContract.ts";
import type { SettingsSection } from "./appNavigation.ts";
import type { CardEditorServices, CreationScreenProps, DecksCardPage, DecksCardPageRequest } from "./appScreenProps.ts";
import type { CardBatchAction, CardBatchDependencies, CardBatchRepository, CardBatchResult } from "./cardBatchActions.ts";
import type { CardVariantBatchMode } from "./cardVariantBatch.ts";
import { addCardVariant, applyCardStudyStatePatch, createNote, duplicateNote, planNoteGraphContentChange, recordVariantOutcome, removeUnusedNoteMedia, replaceOutdatedVariants } from "./coreModel.ts";
import type { Card, CardStudyStatePatch, NoteContent } from "./coreTypes.ts";
import { cardVariantSource, deactivateVariant, deleteVariant, editVariantText, isEditedVariant, reactivateVariant } from "./coreVariantService.ts";
import { createWorkspaceDeck } from "./coreWorkspace.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { AiCardHelpRequest } from "./aiCardHelpContract.ts";
import type { SummaryGenerationInput } from "./aiLearningSummary.ts";
import type { LearningContentAccount } from "./learningSummaries.ts";
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

export function createCardCommands({ store, repository, hydration, cloud, syncEngine, refresh, now, bootRun }: CardCommandsContext) {
  const cardPageRequests = new Map<string, { controller: AbortController; listKey: string; view: string }>();
  let cardWriteChain: Promise<unknown> = Promise.resolve();
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

  /** Writes to the open card run one after another, so quick successive changes each build on the stored result of the previous one. */
  function inCardWriteChain<T>(write: () => Promise<T>) {
    const run = cardWriteChain.then(write);
    cardWriteChain = run.catch(() => undefined);
    return run;
  }

  function applyCardStudyState(cardId: string, patch: CardStudyStatePatch) {
    return inCardWriteChain(() => writeCardStudyState(cardId, patch));
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

  /**
   * The two endings of every write: the store shows the replica, page requests from before the write stop (they would
   * land with the old state) and the sync hears of the change. `reloadLists` drops the card lists, which load again;
   * `reloadNoteGraph` keeps them and patches the rows of one content.
   */
  function reloadLists() {
    refresh();
    requestSync();
  }

  // Follows a local write: the replica already holds the new graph, while the cloud may not have it yet.
  async function reloadNoteGraph(noteId: string, refreshPages = false): Promise<NoteGraph | null> {
    const graph = await repository.loadNoteGraph(noteId);
    refresh({ preserveCardPages: true });
    abortCardPageRequests();
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
    const change = planNoteGraphContentChange(graph, content, "delete");
    if (change.status !== "changed") return graph;
    await repository.saveNoteGraphs([{ previous: graph, next: change.next }]);
    return reloadNoteGraph(graph.note.id, change.cardsChanged);
  }

  async function duplicateDeckNote(graph: NoteGraph) {
    // The stored graph, not the shown one: after a move or its undo the copy lands in the card's current decks.
    const current = await repository.loadNoteGraph(graph.note.id) ?? graph;
    const copy = duplicateNote(current.note, current.cards);
    await repository.saveNoteGraphs([{ previous: null, next: copy }]);
    reloadLists();
    return copy;
  }

  async function applyManualStudyChanges(change: (repository: IndexedDbCoreRepository) => Promise<Card[]>) {
    const cards = await change(repository);
    refresh({ preserveCardPages: true });
    abortCardPageRequests();
    const byId = new Map(cards.map((card) => [card.id, card]));
    setCardPages((current) => Object.fromEntries(Object.entries(current).map(([deckId, page]) => [deckId, page?.selected && page.selected.cards.some((card) => byId.has(card.id)) ? {
      ...page,
      selected: { ...page.selected, cards: page.selected.cards.map((card) => byId.get(card.id) ?? card) },
    } : page])));
    requestSync();
    return cards;
  }

  async function runBatch(dependencies: Pick<CardBatchDependencies, "repository" | "openCards">, cardIds: string[], action: CardBatchAction, afterWrite: () => unknown): Promise<CardBatchResult> {
    const { runCardBatch } = await import("./cardBatchActions.ts");
    const result = await runCardBatch({ ...dependencies, now }, cardIds, action);
    await afterWrite();
    return { ...result, undo: async () => {
      const undone = await result.undo();
      await afterWrite();
      return undone;
    } };
  }

  function runDeckCardBatch(cardIds: string[], action: CardBatchAction) {
    const workspaceHydrationService = hydration();
    if (!workspaceHydrationService) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    return runBatch({ repository, openCards: workspaceHydrationService.openCards }, cardIds, action, reloadLists);
  }

  /** An action on the open card keeps the lists in place, so its row stays under the cursor; a deletion reloads them. */
  function runCardAction(cardId: string, action: CardBatchAction): Promise<CardBatchResult> {
    return inCardWriteChain(async () => {
      const service = hydration();
      // The open card is on this device already; a sibling may not be, so its content comes from the cloud.
      const openCards = service?.openCards ?? ((cardIds: string[]) => repository.loadCardBodies(cardIds));
      const batchRepository: CardBatchRepository = {
        loadNoteGraphs: async (noteIds) => {
          const local = await repository.loadNoteGraphs(noteIds);
          return Promise.all(local.map((graph, index) => graph ?? service?.loadNoteGraph(noteIds[index]).catch(() => null) ?? null));
        },
        saveNoteGraphs: (changes) => repository.saveNoteGraphs(changes),
        buryCards: (...args) => repository.buryCards(...args),
        resetCards: (...args) => repository.resetCards(...args),
        setCardsLeech: (...args) => repository.setCardsLeech(...args),
        rescheduleCards: (...args) => repository.rescheduleCards(...args),
        restoreCardStudies: (...args) => repository.restoreCardStudies(...args),
      };
      const noteId = (await openCards([cardId]))[0]?.note.id;
      if (!noteId) throw new Error("Die Karte ist nicht mehr verfügbar.");
      const result = await runBatch({ repository: batchRepository, openCards }, [cardId], action, action.kind === "delete" ? reloadLists : () => reloadNoteGraph(noteId, action.kind === "deck"));
      return { ...result, undo: () => inCardWriteChain(result.undo) };
    });
  }

  async function prepareDeckTextReplace(cardIds: string[]) {
    const workspaceHydrationService = hydration();
    if (!workspaceHydrationService) throw new Error("Die Kartenverwaltung ist noch nicht bereit.");
    const { prepareTextReplace } = await import("./cardBatchActions.ts");
    return prepareTextReplace({ repository, openCards: workspaceHydrationService.openCards, now }, cardIds);
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

  async function generateDeckCardVariant(_deckId: string, cardId: string, mode: CardVariantBatchMode = "missing") {
    const body = await repository.loadCardBody(cardId);
    const source = body ? cardVariantSource(body.note, body.card) : null;
    if (!source || !body) throw new AiCardVariantContractError("card_not_found", "Die Ausgangskarte ist nicht mehr verfügbar.");
    try {
      const generated = await requestAiCardVariant(source, cloud, { avoid: aiCardVariantAvoidTexts(body.card) });
      const current = await repository.loadCardBody(cardId);
      const draft = createAiGeneratedVariantDraft(source, current, generated);
      const input = { ...draft, meta: { ...draft.meta, reason: "KI-Umformulierung" } };
      const saved = await repository.updateCard(cardId, (card, note) => recordVariantOutcome(mode === "refresh"
        ? addCardVariant(card.variants.filter((variant) => !variant.deletedAt && !isEditedVariant(variant)).reduce((next, variant) => deleteVariant(next, variant.id), card), input)
        : replaceOutdatedVariants(card, input), "created", { promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, contentRevision: note.contentRevision }));
      if (!saved) throw new AiCardVariantContractError("save_failed", "Die Variante konnte nicht gespeichert werden.");
      await reloadNoteGraph(saved.note.id);
      return generated;
    } catch (error) {
      const outcome = error instanceof AiCardVariantContractError
        ? error.code === "not_rephrasable" ? "not_rephrasable" : AI_CARD_VARIANT_REJECTIONS.has(error.code) ? "rejected" : null
        : null;
      if (outcome) {
        // The model's answer is the error that counts; a refusal that cannot be stored is asked for again next time.
        await repository.updateCard(cardId, (card, note) => asksVariantSource(source, { note, card })
          ? recordVariantOutcome(card, outcome, { promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, contentRevision: note.contentRevision })
          : card)
          .then((saved) => saved && reloadNoteGraph(saved.note.id))
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async function updateDeckCardVariant(cardId: string, variantId: string, action: "reactivate" | "deactivate" | "delete") {
    const apply = { reactivate: reactivateVariant, deactivate: deactivateVariant, delete: deleteVariant }[action];
    const saved = await repository.updateCard(cardId, (card) => apply(card, variantId));
    if (!saved) throw new Error("Die Variante konnte nicht gespeichert werden.");
    await reloadNoteGraph(saved.note.id);
  }

  /** The deck of a creation: the given one, or a new deck of that name when no deck id is given. */
  function creationDeck(deckId: string | null, deckName: string) {
    const currentState = store.get().state;
    if (!currentState) return null;
    if (deckId) return currentState.decks.find((candidate) => candidate.id === deckId) ?? null;
    const created = createWorkspaceDeck(currentState.decks, {
      name: deckName,
      deckSettings: createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences(currentState.profile)),
    });
    return created ? repository.saveDeckMetadata([created])[0] ?? null : null;
  }

  async function saveManualNote({ deckId, deckName, content, media }: Parameters<CreationScreenProps["onSaveManualNote"]>[0]) {
    const deck = creationDeck(deckId, deckName);
    if (!deck) return null;
    const graph = createNote({ content, deckId: deck.id, media });
    // A deck created just before a failed note save stays and must be visible, so a retry finds it.
    try {
      await repository.saveNoteGraphs([{ previous: null, next: graph }]);
    } finally {
      reloadLists();
    }
    return { deck, cardIds: graph.cards.map((card) => card.id) };
  }

  async function askCardHelp(request: AiCardHelpRequest, signal?: AbortSignal) {
    const { requestAiCardHelp } = await import("./aiCardHelp.ts");
    return requestAiCardHelp(request, cloud, { signal });
  }

  /** Online storage of the signed-in account's summaries and mind maps; without the cloud they stay in this browser. */
  function learningContentAccount(): LearningContentAccount | null {
    const userId = store.get().state?.profile.userId;
    return userId ? { userId, cloud } : null;
  }

  /** The decks load as the account they were asked for; a switched account ends the generation. */
  async function generateLearningSummary(input: SummaryGenerationInput, signal: AbortSignal) {
    const accountId = store.get().state?.profile.userId;
    const service = hydration();
    if (!accountId || !service || !cloud) throw new Error("Die Anmeldung und Kartenablage sind noch nicht bereit.");
    const switched = () => store.get().state?.profile.userId !== accountId;
    const { generateLearningSummary: generate } = await import("./aiLearningSummary.ts");
    const result = await generate(input, async (ids, options) => {
      const loaded = await service.prepareContentDecks(ids, options);
      if (switched()) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
      return loaded;
    }, store.get().state!.decks, cloud, signal);
    if (switched()) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
    return result;
  }

  async function listDeckContents(deckId: string) {
    const service = hydration();
    const cardIds = service ? await service.listCardIds({ deckIds: [deckId] }) : await repository.listCardIds([deckId]);
    const bodies = service ? await service.openCards(cardIds) : await repository.loadCardBodies(cardIds);
    return [...new Map(bodies.flatMap((body) => body ? [[body.note.id, body.note] as const] : [])).values()];
  }

  /**
   * New contents and updated duplicates go into one write, so a failure leaves nothing behind (a deck created for it is
   * removed again).
   */
  async function importTextNotes({ deckId, deckName, creates, updates }: Parameters<CreationScreenProps["onImportTextNotes"]>[0]) {
    const service = hydration();
    const graphs = await Promise.all(updates.map((update) => service ? service.loadNoteGraph(update.noteId).catch(() => null) : repository.loadNoteGraph(update.noteId)));
    if (graphs.some((graph) => !graph)) throw new Error("Vorhandene Inhalte des Stapels konnten nicht geladen werden. Bitte mit Verbindung erneut versuchen.");
    const deck = creationDeck(deckId, deckName);
    if (!deck) return null;
    const changes = [
      ...creates.map((content) => ({ previous: null, next: createNote({ content, deckId: deck.id }) })),
      // An imported row nobody confirms card by card never takes a studied card with it.
      ...updates.flatMap((update, index) => {
        const change = planNoteGraphContentChange(graphs[index]!, update.content, "keepStudied");
        return change.status === "changed" ? [{ previous: graphs[index]!, next: change.next }] : [];
      }),
    ];
    try {
      await repository.saveNoteGraphs(changes);
    } catch (error) {
      if (!deckId) await repository.deleteDeckTree(deck.id).catch(() => undefined);
      throw error;
    } finally {
      reloadLists();
    }
    return { deck, cardCount: changes.reduce((total, change) => total + change.next.cards.filter((card) => !card.deletedAt).length, 0) };
  }

  /** The services stay stable as long as the account's flag names stay the same. */
  function createCardEditorServices(flagNames: string[], openSettings: (section: SettingsSection) => unknown): CardEditorServices {
    return {
      flagNames,
      runCardAction,
      // Manual events carry the learning time, so burying follows a simulated learning day as well.
      buryCards: (cardIds, buried) => applyManualStudyChanges((current) => current.buryCards(cardIds, buried, now())),
      editVariant: editDeckCardVariant,
      removeNoteMedia: removeDeckNoteMedia,
      listReviewEvents: async (cardId) => repository.listCardReviewEvents(cardId),
      listTagDirectory: async () => {
        const local = () => repository.listTagDirectory();
        if (!cloud || (typeof navigator !== "undefined" && navigator.onLine === false)) return local();
        // Tag changes still waiting here reach the cloud first, so its directory already shows them.
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
          const takenBack = repository.outbox.takenBackReviewEventIds();
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
    duplicateDeckNote,
    runDeckCardBatch,
    prepareDeckTextReplace,
    generateDeckCardVariant,
    updateDeckCardVariant,
    saveManualNote,
    askCardHelp,
    learningContentAccount,
    generateLearningSummary,
    listDeckContents,
    importTextNotes,
    createCardEditorServices,
  };
}
