import { createCommunity, shareDeckToCommunity } from "./communityModel.js";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, createVersionEntry, updateCardContent } from "./coreModel.js";
import { createCoreRepository } from "./coreRepository.js";
import { generateRephrasedVariantsForLearningItem } from "./coreVariantService.js";
import { buildDeckGraph } from "./deckGraph.js";

export function createDemoAnatomyDeck() {
  return createCoreDeck({
    name: "Demo / Anatomie",
    source: "manual",
    tags: ["anatomie", "demo"],
    cards: [
      createBasicLearningItem("", "Welche Aufgabe hat die Myelinscheide im Nervensystem?", "Sie isoliert Axone elektrisch und erhoeht die Leitungsgeschwindigkeit saltatorischer Erregungsleitung.", {
        tags: ["anatomie", "nerven"],
        reviewState: { maturityXp: 132, maturityBand: "variant_ready", repetitions: 4 },
      }),
      createBasicLearningItem("", "Was ist ATP?", "ATP ist ein universeller Energietraeger der Zelle.", {
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
        reason: "Karte geloescht",
        createdAt: deletedAt,
      }),
    ],
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
    updateDeck(deckId, updater) {
      return repository.updateDeck(deckId, updater);
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
