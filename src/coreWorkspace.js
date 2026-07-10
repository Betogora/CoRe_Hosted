import { createCommunity, shareDeckToCommunity } from "./communityModel.js";
import {
  commitApkgImport as commitApkgImportService,
  dryRunApkgImport as dryRunApkgImportService,
  importApkgDeck as importApkgDeckService,
} from "./apkgImport.js";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, createManualCoreDeck, createVersionEntry, updateCardContent } from "./coreModel.js";
import { createCoreRepository } from "./coreRepository.js";
import { generateRephrasedVariantsForLearningItem } from "./coreVariantService.js";
import { buildDeckGraph } from "./deckGraph.js";
import {
  importCsvAsNormalizedDeck,
  importJsonAsNormalizedDeck,
  importNormalizedDeck,
  importTextAsNormalizedDeck,
} from "./importService.js";

export function createDemoAnatomyDeck() {
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

function softDeleteCard(card, deletedAt) {
  if (card.status === "deleted") return card;

  return {
    ...card,
    status: "deleted",
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

function mergeSourceDocuments(existingDocuments = [], nextDocuments = []) {
  const nextIds = new Set(nextDocuments.map((document) => document.id));
  return [...nextDocuments, ...existingDocuments.filter((document) => !nextIds.has(document.id))];
}

function collectDeckTreeIds(decks = [], rootDeckId) {
  const ids = new Set([rootDeckId]);
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

function hierarchyPathOf(deck) {
  return Array.isArray(deck?.hierarchyPath) && deck.hierarchyPath.length > 0
    ? deck.hierarchyPath.map((part) => String(part).trim()).filter(Boolean)
    : [String(deck?.name ?? "Neuer Stapel").trim() || "Neuer Stapel"];
}

function normalizeDeckName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function makeUniqueSiblingDeckName(decks = [], { name, parentDeckId = null, excludeDeckId = null } = {}) {
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

function createHierarchyPathForDeck(decks = [], { name, parentDeckId = null } = {}) {
  const deckName = makeUniqueSiblingDeckName(decks, { name, parentDeckId });
  const parent = parentDeckId ? decks.find((deck) => deck.id === parentDeckId) ?? null : null;
  const parentPath = parent ? hierarchyPathOf(parent) : [];

  return [...parentPath, deckName];
}

function createDeckMutationError(error) {
  return {
    ok: false,
    error,
    deck: null,
    updatedDecks: [],
    changedDeckIds: [],
  };
}

function updateDeckTreePlacement(state, { deckId, name = null, parentDeckId = undefined, changeType, reason }) {
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

function commitDeckTreePlacement(repository, deckId, mutation) {
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

function toDeckArray(deckOrDecks) {
  if (Array.isArray(deckOrDecks)) return deckOrDecks.filter(Boolean);
  return deckOrDecks ? [deckOrDecks] : [];
}

function saveDeckCollection(repository, deckOrDecks) {
  const savedDecks = toDeckArray(deckOrDecks).map((deck) => repository.saveDeck(deck));
  return Array.isArray(deckOrDecks) ? savedDecks : savedDecks[0] ?? null;
}

function saveImportDeckResult(repository, result, options = {}) {
  if (options.dryRun) return result;

  const decks = result?.decks?.length ? result.decks : toDeckArray(result?.deck);
  if (!decks.length) return result;

  const savedDecks = saveDeckCollection(repository, decks);
  return {
    ...result,
    deck: savedDecks[0] ?? null,
    decks: savedDecks,
  };
}

export function createCoreWorkspace(repository = createCoreRepository()) {
  return {
    getState() {
      return repository.getState();
    },
    saveState(nextState) {
      return repository.saveState(nextState);
    },
    saveDeck(deck) {
      return repository.saveDeck(deck);
    },
    saveDecks(deckOrDecks) {
      return saveDeckCollection(repository, deckOrDecks);
    },
    createDeck({ name = "Neuer Stapel", parentDeckId = null, description = "", deckSettings = {} } = {}) {
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
    renameDeck(deckId, name) {
      const trimmedName = normalizeDeckName(name);
      if (!trimmedName) return createDeckMutationError("Bitte gib einen Stapelnamen ein.");

      return commitDeckTreePlacement(repository, deckId, {
        name: trimmedName,
        changeType: "deck_renamed",
        reason: "Stapel umbenannt",
      });
    },
    moveDeck(deckId, parentDeckId = null) {
      return commitDeckTreePlacement(repository, deckId, {
        parentDeckId,
        changeType: "deck_moved",
        reason: parentDeckId ? "Stapel als Unterstapel verschoben" : "Stapel auf Hauptebene verschoben",
      });
    },
    updateDeck(deckId, updater) {
      return repository.updateDeck(deckId, updater);
    },
    deleteDeckTree(deckId) {
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
      repository.saveState({
        ...state,
        decks: remainingDecks,
      });

      return {
        deletedDeckIds: [...deletedIds],
        deletedDecks,
        nextSelectedDeckId: remainingDecks[0]?.id ?? null,
      };
    },
    setDeckCoreMode(deckId, coreMode) {
      return repository.updateDeckSettings(deckId, { coreMode });
    },
    saveDeckCardContent(deckId, cardId, patch, reason = "Manuelle Bearbeitung") {
      const updatedAt = new Date().toISOString();

      return repository.updateDeck(deckId, (deck) => ({
        ...deck,
        updatedAt,
        cards: (deck.cards ?? []).map((card) => (card.id === cardId ? updateCardContent(card, patch, reason) : card)),
      }));
    },
    deleteDeckCard(deckId, cardId) {
      const deletedAt = new Date().toISOString();

      return repository.updateDeck(deckId, (deck) => ({
        ...deck,
        updatedAt: deletedAt,
        cards: (deck.cards ?? []).map((card) => (card.id === cardId ? softDeleteCard(card, deletedAt) : card)),
      }));
    },
    addDeckCardVariant(deckId, cardId, variant, reason = "Manuelle Umformulierung") {
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
    addManualCardToDeck(deckId, manualDeckInput) {
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
    applyVariantGenerationResponse(deckId, cardId, response, options = {}) {
      let generationResult = null;
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
    saveProfile(profile) {
      return repository.saveProfile(profile);
    },
    saveCommunity(community) {
      return repository.saveCommunity(community);
    },
    saveAiJob(job) {
      return repository.saveAiJob(job);
    },
    saveChatExchange(exchange) {
      return repository.saveChatExchange(exchange);
    },
    saveLearningPlan(plan) {
      return repository.saveLearningPlan(plan);
    },
    updateAllDecks(updater) {
      const state = repository.getState();
      return state.decks.map((deck) => repository.updateDeck(deck.id, updater)).filter(Boolean);
    },
    dryRunNormalizedImport(payload, options = {}) {
      const state = repository.getState();
      return importNormalizedDeck(payload, {
        ...options,
        dryRun: true,
        existingDecks: state.decks,
      });
    },
    commitNormalizedImport(payload, options = {}) {
      const state = repository.getState();
      const result = importNormalizedDeck(payload, {
        ...options,
        dryRun: false,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    importTextDeck(input = {}, options = {}) {
      const state = repository.getState();
      const payload = typeof input === "string" ? { text: input } : input;
      const result = importTextAsNormalizedDeck(payload, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    importCsvDeck(input = {}, options = {}) {
      const state = repository.getState();
      const payload = typeof input === "string" ? { csv: input } : input;
      const result = importCsvAsNormalizedDeck(payload, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    importJsonDeck(input = {}, options = {}) {
      const state = repository.getState();
      const result = importJsonAsNormalizedDeck(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result, options);
    },
    async dryRunApkgImport(input, options = {}) {
      const state = repository.getState();
      return dryRunApkgImportService(input, {
        ...options,
        existingDecks: state.decks,
      });
    },
    async commitApkgImport(input, options = {}) {
      const state = repository.getState();
      const result = await commitApkgImportService(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    async importApkgDeck(input, options = {}) {
      const state = repository.getState();
      const result = await importApkgDeckService(input, {
        ...options,
        existingDecks: state.decks,
      });
      return saveImportDeckResult(repository, result);
    },
    ensureDeckGraph(deckId) {
      const deck = repository.getDeck(deckId);
      if (!deck) return null;
      if (deck.graph || !deck.cards?.length) return deck;
      return repository.updateDeck(deck.id, (current) => ({ ...current, graph: buildDeckGraph(current) }));
    },
    shareDeckToDefaultCommunity(deckId, { name = "CoRe Lerngruppe", permission = "copy" } = {}) {
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
