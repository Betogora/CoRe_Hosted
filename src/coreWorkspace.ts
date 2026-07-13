import { createCommunity, shareDeckToCommunity } from "./communityModel.js";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, createManualCoreDeck, createVersionEntry, updateCardContent } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.js";
import { generateRephrasedVariantsForLearningItem } from "./coreVariantService.ts";
import { buildDeckGraph } from "./deckGraph.js";
import {
  importCsvAsNormalizedDeck,
  importJsonAsNormalizedDeck,
  importNormalizedDeck,
  importTextAsNormalizedDeck,
} from "./importService.js";
import type { CardVariant, CoreMode, Deck, DeckSettings, LearningItem } from "./coreTypes.ts";

interface CloudTombstone {
  entityTable: string;
  entityId: string;
  revision: number;
  deletedAt: string;
  updatedByDeviceId: string | null;
}

interface WorkspaceState {
  decks: Deck[];
  communities: unknown[];
  aiJobs: unknown[];
  cloudTombstones: CloudTombstone[];
  [key: string]: unknown;
}

interface WorkspaceRepository {
  getState(): WorkspaceState;
  saveState(state: WorkspaceState): WorkspaceState;
  getDeck(deckId: string): Deck | null;
  saveDeck(deck: Deck): Deck;
  saveDecks(decks: Deck[]): Deck[];
  updateDeck(deckId: string, updater: (deck: Deck) => Deck): Deck | null;
  updateDeckSettings(deckId: string, settings: Partial<DeckSettings>): Deck | null;
  saveProfile(profile: unknown): unknown;
  saveCommunity(community: unknown): unknown;
  saveAiJob(job: unknown): unknown;
  saveChatExchange(exchange: unknown): unknown;
  saveLearningPlan(plan: unknown): unknown;
}

interface DeckMutationResult {
  ok: boolean;
  error: string | null;
  deck: Deck | null;
  updatedDecks: Deck[];
  changedDeckIds: string[];
  nextDecks?: Deck[];
  renamedTo?: string;
  movedToParentDeckId?: string | null;
}

interface DeckPlacementInput {
  deckId: string;
  name?: string | null;
  parentDeckId?: string | null;
  changeType: string;
  reason: string;
}

interface ImportOptions {
  dryRun?: boolean;
  [key: string]: unknown;
}

interface ImportResult {
  deck?: Deck | null;
  decks?: Deck[];
  [key: string]: unknown;
}

interface VariantDraft {
  front: string;
  back: string;
  variantLevel?: number;
  generationSource?: "original" | "ai_generated" | "user_edited" | "imported";
  qualityStatus?: "draft" | "active" | "rejected" | "flagged" | "disabled";
  isActive?: boolean;
  meta?: Record<string, unknown>;
}

export type CoreWorkspace = ReturnType<typeof createCoreWorkspace>;

let apkgImportModulePromise: Promise<typeof import("./apkgImport.js")> | null = null;

function loadApkgImportModule(): Promise<typeof import("./apkgImport.js")> {
  apkgImportModulePromise ??= import("./apkgImport.js");
  return apkgImportModulePromise;
}

export function createDemoAnatomyDeck(): Deck {
  return createCoreDeck({
    name: "Demo / Anatomie",
    source: "manual",
    tags: ["anatomie", "demo"],
    cards: [
      createBasicLearningItem("", "Welche Aufgabe hat die Myelinscheide im Nervensystem?", "Sie isoliert Axone elektrisch und erhöht die Leitungsgeschwindigkeit saltatorischer Erregungsleitung.", {
        tags: ["anatomie", "nerven"],
        reviewState: { maturityXp: 132, maturityBand: "variant_ready", repetitions: 4 },
      }),
      createBasicLearningItem("", "Was ist ATP?", "ATP ist ein universeller Energieträger der Zelle.", {
        tags: ["biochemie"],
      }),
    ],
  });
}

function softDeleteCard(card: LearningItem, deletedAt: string): LearningItem {
  if (card.status === "deleted") return card;

  return {
    ...card,
    status: "deleted",
    deletedAt,
    updatedAt: deletedAt,
    versionLog: [
      ...(card.versionLog ?? []),
      createVersionEntry({
        objectType: "card",
        objectId: card.id,
        changeType: "deleted",
        before: { status: card.status ?? "active" },
        after: { status: "deleted" },
        reason: "Karte gelöscht",
        createdAt: deletedAt,
      }),
    ],
  };
}

function mergeSourceDocuments(existingDocuments: unknown[] = [], nextDocuments: unknown[] = []): unknown[] {
  const documentId = (document: unknown) => document !== null && typeof document === "object" && "id" in document ? String(document.id) : "";
  const nextIds = new Set(nextDocuments.map(documentId));
  return [...nextDocuments, ...existingDocuments.filter((document) => !nextIds.has(documentId(document)))];
}

function collectDeckTreeIds(decks: Deck[] = [], rootDeckId: string): Set<string> {
  const ids = new Set<string>([rootDeckId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const deck of decks) {
      if (deck.parentDeckId && ids.has(deck.parentDeckId) && !ids.has(deck.id)) {
        ids.add(deck.id);
        changed = true;
      }
    }
  }

  return ids;
}

function hierarchyPathOf(deck: Deck): string[] {
  return Array.isArray(deck?.hierarchyPath) && deck.hierarchyPath.length > 0
    ? deck.hierarchyPath.map((part) => String(part).trim()).filter(Boolean)
    : [String(deck?.name ?? "Neuer Stapel").trim() || "Neuer Stapel"];
}

function normalizeDeckName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function makeUniqueSiblingDeckName(
  decks: Deck[] = [],
  { name, parentDeckId = null, excludeDeckId = null }: { name?: unknown; parentDeckId?: string | null; excludeDeckId?: string | null } = {},
): string {
  const baseName = normalizeDeckName(name) || "Neuer Stapel";
  const siblingNames = new Set(
    decks
      .filter((deck) => deck.id !== excludeDeckId && (deck.parentDeckId ?? null) === (parentDeckId ?? null))
      .map((deck) => normalizeDeckName(deck.name).toLowerCase())
      .filter(Boolean),
  );
  let candidate = baseName;

  while (siblingNames.has(candidate.toLowerCase())) {
    candidate = `${candidate}+`;
  }

  return candidate;
}

function createHierarchyPathForDeck(decks: Deck[] = [], { name, parentDeckId = null }: { name?: unknown; parentDeckId?: string | null } = {}): string[] {
  const deckName = makeUniqueSiblingDeckName(decks, { name, parentDeckId });
  const parent = parentDeckId ? decks.find((deck) => deck.id === parentDeckId) ?? null : null;
  const parentPath = parent ? hierarchyPathOf(parent) : [];

  return [...parentPath, deckName];
}

function createDeckMutationError(error: string): DeckMutationResult {
  return {
    ok: false,
    error,
    deck: null,
    updatedDecks: [],
    changedDeckIds: [],
  };
}

function mergeCloudTombstones(existing: CloudTombstone[] = [], next: CloudTombstone[] = []): CloudTombstone[] {
  const byEntity = new Map<string, CloudTombstone>(existing.map((tombstone) => [`${tombstone.entityTable}:${tombstone.entityId}`, tombstone]));
  for (const tombstone of next) byEntity.set(`${tombstone.entityTable}:${tombstone.entityId}`, tombstone);
  return [...byEntity.values()];
}

function createDeckTreeTombstones(decks: Deck[], deletedAt: string): CloudTombstone[] {
  return decks.flatMap((deck) => [
    {
      entityTable: "decks",
      entityId: deck.id,
      revision: deck.revision ?? 1,
      deletedAt,
      updatedByDeviceId: deck.updatedByDeviceId ?? null,
    },
    ...(deck.cards ?? []).flatMap((card) => [
      {
        entityTable: "cards",
        entityId: card.id,
        revision: card.revision ?? 1,
        deletedAt,
        updatedByDeviceId: card.updatedByDeviceId ?? null,
      },
      ...(card.variants ?? []).map((variant) => ({
        entityTable: "card_variants",
        entityId: variant.id,
        revision: variant.revision ?? 1,
        deletedAt,
        updatedByDeviceId: variant.updatedByDeviceId ?? null,
      })),
    ]),
  ]);
}

function updateDeckTreePlacement(state: WorkspaceState, { deckId, name = null, parentDeckId = undefined, changeType, reason }: DeckPlacementInput): DeckMutationResult {
  const decks = state.decks ?? [];
  const deck = decks.find((item) => item.id === deckId);
  if (!deck) return createDeckMutationError("Stapel nicht gefunden.");

  const movedTreeIds = collectDeckTreeIds(decks, deckId);
  const wantsParentChange = parentDeckId !== undefined;
  const requestedParentId = wantsParentChange ? parentDeckId || null : deck.parentDeckId ?? null;
  const parent = requestedParentId ? decks.find((item) => item.id === requestedParentId) ?? null : null;

  if (requestedParentId && !parent) return createDeckMutationError("Zielstapel nicht gefunden.");
  if (requestedParentId && movedTreeIds.has(requestedParentId)) {
    return createDeckMutationError("Ein Stapel kann nicht in sich selbst oder einen eigenen Unterstapel verschoben werden.");
  }

  const nextName = makeUniqueSiblingDeckName(decks, {
    name: name == null ? deck.name : name,
    parentDeckId: requestedParentId,
    excludeDeckId: deck.id,
  });
  if (!nextName) return createDeckMutationError("Bitte gib einen Stapelnamen ein.");

  const oldRootPath = hierarchyPathOf(deck);
  const parentPath = parent ? hierarchyPathOf(parent) : [];
  const nextRootPath = [...parentPath, nextName];
  const unchanged =
    normalizeDeckName(deck.name) === nextName &&
    (deck.parentDeckId ?? null) === requestedParentId &&
    oldRootPath.join("\u001f") === nextRootPath.join("\u001f");

  if (unchanged) {
    return {
      ok: true,
      error: null,
      deck,
      updatedDecks: [deck],
      changedDeckIds: [],
      renamedTo: nextName,
      movedToParentDeckId: requestedParentId,
    };
  }

  const updatedAt = new Date().toISOString();
  const changedDeckIds = [...movedTreeIds];
  const nextDecks = decks.map((currentDeck) => {
    if (!movedTreeIds.has(currentDeck.id)) return currentDeck;

    const currentPath = hierarchyPathOf(currentDeck);
    const suffix = currentDeck.id === deck.id ? [] : currentPath.slice(oldRootPath.length);
    const nextPath = currentDeck.id === deck.id ? nextRootPath : [...nextRootPath, ...suffix];
    const isRoot = currentDeck.id === deck.id;

    return createCoreDeck({
      ...currentDeck,
      name: isRoot ? nextName : currentDeck.name,
      parentDeckId: isRoot ? requestedParentId : currentDeck.parentDeckId ?? null,
      hierarchyPath: nextPath,
      updatedAt,
      versionLog: isRoot
        ? [
            ...(currentDeck.versionLog ?? []),
            createVersionEntry({
              objectType: "deck",
              objectId: currentDeck.id,
              changeType,
              before: {
                name: currentDeck.name,
                parentDeckId: currentDeck.parentDeckId ?? null,
                hierarchyPath: hierarchyPathOf(currentDeck),
              },
              after: {
                name: nextName,
                parentDeckId: requestedParentId,
                hierarchyPath: nextPath,
              },
              reason,
              createdAt: updatedAt,
            }),
          ]
        : currentDeck.versionLog,
    });
  });
  return {
    ok: true,
    error: null,
    nextDecks,
    deck: nextDecks.find((item) => item.id === deck.id) ?? null,
    updatedDecks: nextDecks.filter((item) => changedDeckIds.includes(item.id)),
    changedDeckIds,
    renamedTo: nextName,
    movedToParentDeckId: requestedParentId,
  };
}

function commitDeckTreePlacement(repository: WorkspaceRepository, deckId: string, mutation: Omit<DeckPlacementInput, "deckId">): DeckMutationResult {
  const state = repository.getState();
  const result = updateDeckTreePlacement(state, { deckId, ...mutation });
  if (!result.ok || !result.nextDecks) return result;

  const saved = repository.saveState({
    ...state,
    decks: result.nextDecks,
  });
  const changedIds = new Set(result.changedDeckIds);
  return {
    ...result,
    deck: saved.decks.find((deck) => deck.id === deckId) ?? null,
    updatedDecks: saved.decks.filter((deck) => changedIds.has(deck.id)),
  };
}

function toDeckArray(deckOrDecks: Deck | Deck[] | null | undefined): Deck[] {
  if (Array.isArray(deckOrDecks)) return deckOrDecks.filter(Boolean);
  return deckOrDecks ? [deckOrDecks] : [];
}

function saveDeckCollection(repository: WorkspaceRepository, deckOrDecks: Deck | Deck[]): Deck | Deck[] | null {
  const savedDecks = repository.saveDecks(toDeckArray(deckOrDecks));
  return Array.isArray(deckOrDecks) ? savedDecks : savedDecks[0] ?? null;
}

function saveImportDeckResult(repository: WorkspaceRepository, result: ImportResult, options: ImportOptions = {}): ImportResult {
  if (options.dryRun) return result;

  const decks = result?.decks?.length ? result.decks : toDeckArray(result?.deck);
  if (!decks.length) return result;

  const savedDecks = repository.saveDecks(decks);
  return {
    ...result,
    deck: savedDecks[0] ?? null,
    decks: savedDecks,
  };
}

export function createCoreWorkspace(repository: WorkspaceRepository = createCoreRepository() as WorkspaceRepository) {
  return {
    getState() {
      return repository.getState();
    },
    saveState(nextState: WorkspaceState) {
      return repository.saveState(nextState);
    },
    saveDeck(deck: Deck) {
      return repository.saveDeck(deck);
    },
    saveDecks(deckOrDecks: Deck | Deck[]) {
      return saveDeckCollection(repository, deckOrDecks);
    },
    createDeck({ name = "Neuer Stapel", parentDeckId = null, description = "", deckSettings = {} }: {
      name?: string;
      parentDeckId?: string | null;
      description?: string;
      deckSettings?: Partial<DeckSettings>;
    } = {}) {
      const state = repository.getState();
      const validParentId = parentDeckId && state.decks.some((deck) => deck.id === parentDeckId) ? parentDeckId : null;
      const hierarchyPath = createHierarchyPathForDeck(state.decks, { name, parentDeckId: validParentId });
      const deck = createCoreDeck({
        name: hierarchyPath.at(-1) || "Neuer Stapel",
        description,
        source: "manual",
        parentDeckId: validParentId,
        hierarchyPath,
        deckSettings,
        cards: [],
      });

      return repository.saveDeck(deck);
    },
    renameDeck(deckId: string, name: string): DeckMutationResult {
      const trimmedName = normalizeDeckName(name);
      if (!trimmedName) return createDeckMutationError("Bitte gib einen Stapelnamen ein.");

      return commitDeckTreePlacement(repository, deckId, {
        name: trimmedName,
        changeType: "deck_renamed",
        reason: "Stapel umbenannt",
      });
    },
    moveDeck(deckId: string, parentDeckId: string | null = null): DeckMutationResult {
      return commitDeckTreePlacement(repository, deckId, {
        parentDeckId,
        changeType: "deck_moved",
        reason: parentDeckId ? "Stapel als Unterstapel verschoben" : "Stapel auf Hauptebene verschoben",
      });
    },
    updateDeck(deckId: string, updater: (deck: Deck) => Deck) {
      return repository.updateDeck(deckId, updater);
    },
    deleteDeckTree(deckId: string) {
      const state = repository.getState();
      const deck = state.decks.find((item) => item.id === deckId);
      if (!deck) {
        return {
          deletedDeckIds: [],
          deletedDecks: [],
          nextSelectedDeckId: state.decks[0]?.id ?? null,
        };
      }

      const deletedIds = collectDeckTreeIds(state.decks, deckId);
      const deletedDecks = state.decks.filter((item) => deletedIds.has(item.id));
      const remainingDecks = state.decks.filter((item) => !deletedIds.has(item.id));
      const deletedAt = new Date().toISOString();
      repository.saveState({
        ...state,
        decks: remainingDecks,
        cloudTombstones: mergeCloudTombstones(state.cloudTombstones, createDeckTreeTombstones(deletedDecks, deletedAt)),
      });

      return {
        deletedDeckIds: [...deletedIds],
        deletedDecks,
        nextSelectedDeckId: remainingDecks[0]?.id ?? null,
      };
    },
    setDeckCoreMode(deckId: string, coreMode: CoreMode) {
      return repository.updateDeckSettings(deckId, { coreMode });
    },
    saveDeckCardContent(deckId: string, cardId: string, patch: Parameters<typeof updateCardContent>[1], reason = "Manuelle Bearbeitung") {
      const updatedAt = new Date().toISOString();

      return repository.updateDeck(deckId, (deck) => ({
        ...deck,
        updatedAt,
        cards: (deck.cards ?? []).map((card) => (card.id === cardId ? updateCardContent(card, patch, reason) : card)),
      }));
    },
    deleteDeckCard(deckId: string, cardId: string) {
      const deletedAt = new Date().toISOString();

      return repository.updateDeck(deckId, (deck) => ({
        ...deck,
        updatedAt: deletedAt,
        cards: (deck.cards ?? []).map((card) => (card.id === cardId ? softDeleteCard(card, deletedAt) : card)),
      }));
    },
    addDeckCardVariant(deckId: string, cardId: string, variant: VariantDraft, reason = "Manuelle Umformulierung") {
      const updatedAt = new Date().toISOString();

      return repository.updateDeck(deckId, (deck) => ({
        ...deck,
        updatedAt,
        cards: (deck.cards ?? []).map((card) =>
          card.id === cardId
            ? addRephrasedVariant(card, variant.front, variant.back, {
                variantLevel: variant.variantLevel ?? 2,
                generationSource: variant.generationSource ?? "user_edited",
                qualityStatus: variant.qualityStatus ?? "active",
                isActive: variant.isActive ?? true,
                updatedAt,
                meta: {
                  source: "deck-card-editor",
                  reason,
                  ...(variant.meta ?? {}),
                },
              })
            : card,
        ),
      }));
    },
    addManualCardToDeck(deckId: string, manualDeckInput: Parameters<typeof createManualCoreDeck>[0]) {
      const createdAt = new Date().toISOString();
      const manualDeck = createManualCoreDeck({
        ...manualDeckInput,
        deckName: manualDeckInput?.deckName ?? "Manuelle Karte",
      });
      const manualCard = manualDeck.cards[0];
      if (!manualCard) return null;

      return repository.updateDeck(deckId, (deck) =>
        createCoreDeck({
          ...deck,
          cards: [...(deck.cards ?? []), manualCard],
          sourceDocuments: mergeSourceDocuments(deck.sourceDocuments ?? [], manualDeck.sourceDocuments ?? []),
          updatedAt: createdAt,
          versionLog: [
            ...(deck.versionLog ?? []),
            createVersionEntry({
              objectType: "deck",
              objectId: deck.id,
              changeType: "manual_card_added",
              after: { cardId: manualCard.id },
              reason: "Manuelle Karte hinzugefügt",
              createdAt,
            }),
          ],
        }),
      );
    },
    applyVariantGenerationResponse(deckId: string, cardId: string, response: unknown, options: Record<string, unknown> = {}) {
      let generationResult: ReturnType<typeof generateRephrasedVariantsForLearningItem> | null = null;
      const updatedAt = new Date().toISOString();
      const deck = repository.updateDeck(deckId, (currentDeck) => ({
        ...currentDeck,
        updatedAt,
        cards: (currentDeck.cards ?? []).map((card) => {
          if (card.id !== cardId) return card;
          generationResult = generateRephrasedVariantsForLearningItem(card, {
            ...options,
            mockResponse: response,
          });
          return generationResult.learningItem;
        }),
      }));

      return { deck, result: generationResult };
    },
    saveProfile(profile: unknown) {
      return repository.saveProfile(profile);
    },
    saveCommunity(community: unknown) {
      return repository.saveCommunity(community);
    },
    saveAiJob(job: unknown) {
      return repository.saveAiJob(job);
    },
    saveChatExchange(exchange: unknown) {
      return repository.saveChatExchange(exchange);
    },
    saveLearningPlan(plan: unknown) {
      return repository.saveLearningPlan(plan);
    },
    updateAllDecks(updater: (deck: Deck) => Deck) {
      const state = repository.getState();
      return repository.saveDecks(state.decks.map(updater));
    },
    dryRunNormalizedImport(payload: unknown, options: ImportOptions = {}) {
      const state = repository.getState();
      return importNormalizedDeck(payload !== null && typeof payload === "object" ? payload : {}, {
        ...options,
        dryRun: true,
        existingDecks: state.decks,
      });
    },
    commitNormalizedImport(payload: unknown, options: ImportOptions = {}) {
      const state = repository.getState();
      const result = importNormalizedDeck(payload !== null && typeof payload === "object" ? payload : {}, {
        ...options,
        dryRun: false,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    importTextDeck(input: string | Record<string, unknown> = {}, options: ImportOptions = {}) {
      const state = repository.getState();
      const payload = typeof input === "string" ? { text: input } : input;
      const result = importTextAsNormalizedDeck(payload, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    importCsvDeck(input: string | Record<string, unknown> = {}, options: ImportOptions = {}) {
      const state = repository.getState();
      const payload = typeof input === "string" ? { csv: input } : input;
      const result = importCsvAsNormalizedDeck(payload, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    importJsonDeck(input: unknown = {}, options: ImportOptions = {}) {
      const state = repository.getState();
      const result = importJsonAsNormalizedDeck(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    async dryRunApkgImport(input: unknown, options: ImportOptions = {}) {
      const state = repository.getState();
      const { dryRunApkgImport } = await loadApkgImportModule();
      return dryRunApkgImport(input, {
        ...options,
        existingDecks: state.decks,
      });
    },
    async commitApkgImport(input: unknown, options: ImportOptions = {}) {
      const state = repository.getState();
      const { commitApkgImport } = await loadApkgImportModule();
      const result = await commitApkgImport(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    async importApkgDeck(input: unknown, options: ImportOptions = {}) {
      const state = repository.getState();
      const { importApkgDeck } = await loadApkgImportModule();
      const result = await importApkgDeck(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    ensureDeckGraph(deckId: string) {
      const deck = repository.getDeck(deckId);
      if (!deck) return null;
      if (deck.graph || !deck.cards?.length) return deck;
      return repository.updateDeck(deck.id, (current) => ({ ...current, graph: buildDeckGraph(current) }));
    },
    shareDeckToDefaultCommunity(deckId: string, { name = "CoRe Lerngruppe", permission = "copy" }: { name?: string; permission?: string } = {}) {
      const state = repository.getState();
      const deck = state.decks.find((item) => item.id === deckId);
      if (!deck) return null;

      const community = state.communities[0] ?? createCommunity({ name });
      const result = shareDeckToCommunity(community, deck, { permission });
      return {
        ...result,
        community: repository.saveCommunity(result.community),
      };
    },
    createDemoDeck() {
      return repository.saveDeck(createDemoAnatomyDeck());
    },
  };
}
