import { createDefaultDeckSettings, normalizeCoreDeck } from "./coreModel.js";

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

function createDefaultState() {
  return {
    version: 2,
    profile: createDefaultProfile(),
    decks: [],
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

function normalizeState(rawState) {
  const fallback = createDefaultState();
  const decks = Array.isArray(rawState?.decks) ? rawState.decks.map((deck) => normalizeCoreDeck(deck)) : [];

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

function readState(storage) {
  const current = parseJson(storage.getItem(APP_STATE_KEY), null);
  if (current) {
    return normalizeState(current);
  }

  const legacyDecks = parseJson(storage.getItem(LEGACY_DECKS_KEY), []);
  if (Array.isArray(legacyDecks) && legacyDecks.length > 0) {
    return normalizeState({ ...createDefaultState(), decks: legacyDecks });
  }

  return createDefaultState();
}

function writeState(storage, state) {
  storage.setItem(APP_STATE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
}

function replaceDeck(decks, deck) {
  return [deck, ...decks.filter((storedDeck) => storedDeck.id !== deck.id)];
}

export function createCoreRepository(storage = getStorage()) {
  return {
    getState() {
      return readState(storage);
    },
    saveState(nextState) {
      const normalized = normalizeState(nextState);
      writeState(storage, normalized);
      return normalized;
    },
    listDecks() {
      return readState(storage).decks;
    },
    getDeck(deckId) {
      return readState(storage).decks.find((deck) => deck.id === deckId) ?? null;
    },
    saveDeck(deck) {
      const state = readState(storage);
      const normalizedDeck = normalizeCoreDeck(deck);
      writeState(storage, {
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
      const state = readState(storage);
      const existing = state.decks.find((deck) => deck.id === deckId);
      if (!existing) return null;

      const normalizedDeck = normalizeCoreDeck(updater(existing));
      writeState(storage, {
        ...state,
        decks: replaceDeck(state.decks, normalizedDeck),
      });
      return normalizedDeck;
    },
    deleteDeck(deckId) {
      const state = readState(storage);
      writeState(storage, {
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
      return readState(storage).profile;
    },
    saveProfile(profile) {
      const state = readState(storage);
      const nextProfile = { ...state.profile, ...profile };
      writeState(storage, { ...state, profile: nextProfile });
      return nextProfile;
    },
    listCommunities() {
      return readState(storage).communities;
    },
    saveCommunity(community) {
      const state = readState(storage);
      writeState(storage, {
        ...state,
        communities: [community, ...state.communities.filter((item) => item.id !== community.id)],
      });
      return community;
    },
    saveAiJob(job) {
      const state = readState(storage);
      writeState(storage, {
        ...state,
        aiJobs: [job, ...state.aiJobs.filter((item) => item.id !== job.id)],
      });
      return job;
    },
    listAiJobs() {
      return readState(storage).aiJobs;
    },
    saveChatExchange(exchange) {
      const state = readState(storage);
      writeState(storage, {
        ...state,
        chatTranscript: [exchange, ...state.chatTranscript].slice(0, 30),
      });
      return exchange;
    },
    saveLearningPlan(plan) {
      const state = readState(storage);
      writeState(storage, {
        ...state,
        learningPlans: [plan, ...state.learningPlans.filter((item) => item.id !== plan.id)].slice(0, 10),
      });
      return plan;
    },
    clear() {
      writeState(storage, createDefaultState());
      storage.removeItem(LEGACY_DECKS_KEY);
    },
  };
}
