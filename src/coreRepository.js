import { createDefaultDeckSettings, normalizeCoreDeck } from "./coreModel.js";
import { createWorldCapitalsSeedDecks } from "./fixtures/worldCapitals.js";

const LEGACY_DECKS_KEY = "core.importedDecks.v1";
const APP_STATE_KEY = "core.appState.v2";

let memoryState = null;

function createDefaultProfile() {
  return {
    userId: "local-user",
    email: "noemi@example.test",
    displayName: "Noemi C.",
    university: "",
    fieldOfStudy: "",
    preferredLanguage: "de",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    onboardingComplete: false,
    privacy: {
      shareLearningProgress: false,
      showOnlineStatus: false,
      showStreaksToOthers: false,
    },
    schedulerPreferences: {
      profile: "standard",
    },
  };
}

function createDefaultState({ seedDefaultDecks = false } = {}) {
  return {
    version: 2,
    profile: createDefaultProfile(),
    decks: seedDefaultDecks ? createWorldCapitalsSeedDecks() : [],
    communities: [],
    aiJobs: [],
    documents: [],
    chatTranscript: [],
    learningPlans: [],
    updatedAt: new Date().toISOString(),
  };
}

function getStorage() {
  if (typeof localStorage === "undefined") {
    return {
      getItem(key) {
        return memoryState?.[key] ?? null;
      },
      setItem(key, value) {
        memoryState = { ...(memoryState ?? {}), [key]: value };
      },
      removeItem(key) {
        if (memoryState) {
          delete memoryState[key];
        }
      },
    };
  }

  return localStorage;
}

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStoredDecks(decks) {
  return Array.isArray(decks) ? decks.map((deck) => normalizeCoreDeck(deck)) : [];
}

function normalizeState(rawState) {
  const fallback = createDefaultState({ seedDefaultDecks: false });
  const decks = normalizeStoredDecks(rawState?.decks);

  return {
    ...fallback,
    ...rawState,
    version: 2,
    profile: { ...fallback.profile, ...(rawState?.profile ?? {}) },
    decks,
    communities: Array.isArray(rawState?.communities) ? rawState.communities : [],
    aiJobs: Array.isArray(rawState?.aiJobs) ? rawState.aiJobs : [],
    documents: Array.isArray(rawState?.documents) ? rawState.documents : [],
    chatTranscript: Array.isArray(rawState?.chatTranscript) ? rawState.chatTranscript : [],
    learningPlans: Array.isArray(rawState?.learningPlans) ? rawState.learningPlans : [],
  };
}

function readState(storage, options = {}) {
  const current = parseJson(storage.getItem(APP_STATE_KEY), null);
  if (current) {
    return normalizeState(current);
  }

  const legacyDecks = parseJson(storage.getItem(LEGACY_DECKS_KEY), []);
  if (Array.isArray(legacyDecks) && legacyDecks.length > 0) {
    return normalizeState({ ...createDefaultState({ seedDefaultDecks: false }), decks: legacyDecks });
  }

  return createDefaultState(options);
}

function writeState(storage, state) {
  storage.setItem(APP_STATE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
}

function replaceDeck(decks, deck) {
  return [deck, ...decks.filter((storedDeck) => storedDeck.id !== deck.id)];
}

export function createCoreRepository(storage = null, options = {}) {
  const resolvedStorage = storage ?? getStorage();
  const seedDefaultDecks = options.seedDefaultDecks ?? storage == null;

  return {
    getState() {
      return readState(resolvedStorage, { seedDefaultDecks });
    },
    saveState(nextState) {
      const normalized = normalizeState(nextState);
      writeState(resolvedStorage, normalized);
      return normalized;
    },
    listDecks() {
      return readState(resolvedStorage, { seedDefaultDecks }).decks;
    },
    getDeck(deckId) {
      return readState(resolvedStorage, { seedDefaultDecks }).decks.find((deck) => deck.id === deckId) ?? null;
    },
    saveDeck(deck) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      const normalizedDeck = normalizeCoreDeck(deck);
      writeState(resolvedStorage, {
        ...state,
        decks: replaceDeck(state.decks, normalizedDeck),
        documents: [
          ...normalizedDeck.sourceDocuments,
          ...state.documents.filter((document) => !normalizedDeck.sourceDocuments.some((nextDocument) => nextDocument.id === document.id)),
        ],
      });
      return normalizedDeck;
    },
    updateDeck(deckId, updater) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      const existing = state.decks.find((deck) => deck.id === deckId);
      if (!existing) return null;

      const normalizedDeck = normalizeCoreDeck(updater(existing));
      writeState(resolvedStorage, {
        ...state,
        decks: replaceDeck(state.decks, normalizedDeck),
      });
      return normalizedDeck;
    },
    deleteDeck(deckId) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      writeState(resolvedStorage, {
        ...state,
        decks: state.decks.filter((deck) => deck.id !== deckId),
      });
    },
    updateDeckSettings(deckId, settings) {
      return this.updateDeck(deckId, (deck) => ({
        ...deck,
        deckSettings: createDefaultDeckSettings({ ...deck.deckSettings, ...settings }),
      }));
    },
    getProfile() {
      return readState(resolvedStorage, { seedDefaultDecks }).profile;
    },
    saveProfile(profile) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      const nextProfile = { ...state.profile, ...profile };
      writeState(resolvedStorage, { ...state, profile: nextProfile });
      return nextProfile;
    },
    listCommunities() {
      return readState(resolvedStorage, { seedDefaultDecks }).communities;
    },
    saveCommunity(community) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      writeState(resolvedStorage, {
        ...state,
        communities: [community, ...state.communities.filter((item) => item.id !== community.id)],
      });
      return community;
    },
    saveAiJob(job) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      writeState(resolvedStorage, {
        ...state,
        aiJobs: [job, ...state.aiJobs.filter((item) => item.id !== job.id)],
      });
      return job;
    },
    listAiJobs() {
      return readState(resolvedStorage, { seedDefaultDecks }).aiJobs;
    },
    saveChatExchange(exchange) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      writeState(resolvedStorage, {
        ...state,
        chatTranscript: [exchange, ...state.chatTranscript].slice(0, 30),
      });
      return exchange;
    },
    saveLearningPlan(plan) {
      const state = readState(resolvedStorage, { seedDefaultDecks });
      writeState(resolvedStorage, {
        ...state,
        learningPlans: [plan, ...state.learningPlans.filter((item) => item.id !== plan.id)].slice(0, 10),
      });
      return plan;
    },
    clear() {
      writeState(resolvedStorage, createDefaultState({ seedDefaultDecks }));
      resolvedStorage.removeItem(LEGACY_DECKS_KEY);
    },
  };
}
