import { createCommunity, shareDeckToCommunity } from "./communityModel.js";
import { createCoreDeck } from "./coreModel.js";
import { createCoreRepository } from "./coreRepository.js";
import { buildDeckGraph } from "./deckGraph.js";

export function createDemoAnatomyDeck() {
  return createCoreDeck({
    name: "Demo / Anatomie",
    source: "manual",
    tags: ["anatomie", "demo"],
    cards: [
      {
        source: "manual",
        cardType: "basic",
        originalFront: "Welche Aufgabe hat die Myelinscheide im Nervensystem?",
        originalBack: "Sie isoliert Axone elektrisch und erhoeht die Leitungsgeschwindigkeit saltatorischer Erregungsleitung.",
        originalTags: ["anatomie", "nerven"],
        reviewState: { maturityXp: 132, maturityBand: "variant_ready", repetitions: 4 },
      },
      {
        source: "manual",
        cardType: "basic",
        originalFront: "Was ist ATP?",
        originalBack: "ATP ist ein universeller Energietraeger der Zelle.",
        originalTags: ["biochemie"],
      },
    ],
  });
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
