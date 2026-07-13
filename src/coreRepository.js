import { createDefaultDeckSettings, normalizeCoreDeck } from "./coreModel.ts";
import { createWorldCapitalsSeedDecks, ensureWorldCapitalsStudyHistory } from "./fixtures/worldCapitals.js";

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
    cloudTombstones: [],
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
  const decks = ensureWorldCapitalsStudyHistory(normalizeStoredDecks(rawState?.decks));

  return {
    ...fallback,
    ...rawState,
    version: 2,
    profile: { ...fallback.profile, ...(rawState?.profile ?? {}) },
    decks,
    communities: Array.isArray(rawState?.communities) ? rawState.communities : [],
    aiJobs: Array.isArray(rawState?.aiJobs) ? rawState.aiJobs : [],
    documents: Array.isArray(rawState?.documents) ? rawState.documents : [],
    cloudTombstones: Array.isArray(rawState?.cloudTombstones) ? rawState.cloudTombstones : [],
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

function updateStoredState(storage, options, updater) {
  const state = readState(storage, options);
  const nextState = updater(state);
  if (nextState !== state) writeState(storage, nextState);
  return nextState;
}

function upsertById(items = [], item) {
  return [item, ...items.filter((storedItem) => storedItem.id !== item.id)];
}

function mergeDeckDocuments(documents = [], decks = []) {
  return decks.reduce(
    (currentDocuments, deck) =>
      (deck.sourceDocuments ?? []).reduce(
        (nextDocuments, document) => upsertById(nextDocuments, document),
        currentDocuments,
      ),
    documents,
  );
}

export function createCoreRepository(storage = null, options = {}) {
  const resolvedStorage = storage ?? getStorage();
  const seedDefaultDecks = options.seedDefaultDecks ?? storage == null;
  const saveDecks = (decks = []) => {
    const normalizedDecks = decks.filter(Boolean).map((deck) => normalizeCoreDeck(deck));
    if (!normalizedDecks.length) return [];

    updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
      ...state,
      decks: normalizedDecks.reduce((currentDecks, deck) => upsertById(currentDecks, deck), state.decks),
      documents: mergeDeckDocuments(state.documents, normalizedDecks),
    }));
    return normalizedDecks;
  };

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
      return saveDecks([deck])[0] ?? null;
    },
    saveDecks,
    updateDeck(deckId, updater) {
      let normalizedDeck = null;
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => {
        const existing = state.decks.find((deck) => deck.id === deckId);
        if (!existing) return state;

        normalizedDeck = normalizeCoreDeck(updater(existing));
        return {
          ...state,
          decks: upsertById(state.decks, normalizedDeck),
          documents: mergeDeckDocuments(state.documents, [normalizedDeck]),
        };
      });
      return normalizedDeck;
    },
    deleteDeck(deckId) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
        ...state,
        decks: state.decks.filter((deck) => deck.id !== deckId),
      }));
    },
    updateDeckSettings(deckId, settings) {
      return this.updateDeck(deckId, (deck) => ({
        ...deck,
        deckSettings: createDefaultDeckSettings({
          ...deck.deckSettings,
          ...settings,
          appearance: {
            ...(deck.deckSettings?.appearance ?? {}),
            ...(settings.appearance ?? {}),
          },
        }),
      }));
    },
    getProfile() {
      return readState(resolvedStorage, { seedDefaultDecks }).profile;
    },
    saveProfile(profile) {
      let nextProfile = null;
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => {
        nextProfile = { ...state.profile, ...profile };
        return { ...state, profile: nextProfile };
      });
      return nextProfile;
    },
    listCommunities() {
      return readState(resolvedStorage, { seedDefaultDecks }).communities;
    },
    saveCommunity(community) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
        ...state,
        communities: upsertById(state.communities, community),
      }));
      return community;
    },
    saveAiJob(job) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
        ...state,
        aiJobs: upsertById(state.aiJobs, job),
      }));
      return job;
    },
    listAiJobs() {
      return readState(resolvedStorage, { seedDefaultDecks }).aiJobs;
    },
    saveChatExchange(exchange) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
        ...state,
        chatTranscript: [exchange, ...state.chatTranscript].slice(0, 30),
      }));
      return exchange;
    },
    saveLearningPlan(plan) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state) => ({
        ...state,
        learningPlans: upsertById(state.learningPlans, plan).slice(0, 10),
      }));
      return plan;
    },
    clear() {
      writeState(resolvedStorage, createDefaultState({ seedDefaultDecks }));
      resolvedStorage.removeItem(LEGACY_DECKS_KEY);
    },
  };
}
