import * as v from "valibot";
import { createDefaultDeckSettings, normalizeCoreDeck } from "./coreModel.ts";
import { createWorldCapitalsSeedDecks, ensureWorldCapitalsStudyHistory } from "./fixtures/worldCapitals.js";

const LEGACY_DECKS_KEY = "core.importedDecks.v1";
const APP_STATE_KEY = "core.appState.v2";

let memoryState: any = null;

const storedDeckSchema = v.looseObject({ id: v.string() });
const appStateStorageSchema = v.looseObject({
  version: v.optional(v.number()),
  profile: v.optional(v.nullable(v.unknown())),
  decks: v.array(storedDeckSchema),
  communities: v.optional(v.array(v.unknown())),
  aiJobs: v.optional(v.array(v.unknown())),
  documents: v.optional(v.array(v.unknown())),
  cloudTombstones: v.optional(v.array(v.unknown())),
  chatTranscript: v.optional(v.array(v.unknown())),
  learningPlans: v.optional(v.array(v.unknown())),
});

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

function createDefaultState({ seedDefaultDecks = false }: any = {}) {
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
      getItem(key: any) {
        return memoryState?.[key] ?? null;
      },
      setItem(key: any, value: any) {
        memoryState = { ...(memoryState ?? {}), [key]: value };
      },
      removeItem(key: any) {
        if (memoryState) {
          delete memoryState[key];
        }
      },
    };
  }

  return localStorage;
}

function parseJson(value: any, fallback: any) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStoredDecks(decks: any) {
  return Array.isArray(decks) ? decks.map((deck: any) => normalizeCoreDeck(deck)) : [];
}

function normalizeState(rawState: any) {
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

function readState(storage: any, options: any = {}) {
  const current = parseJson(storage.getItem(APP_STATE_KEY), null);
  const currentResult = v.safeParse(appStateStorageSchema, current);
  if (currentResult.success) {
    return normalizeState(currentResult.output);
  }

  const legacyDecks = parseJson(storage.getItem(LEGACY_DECKS_KEY), []);
  const legacyDeckResult = v.safeParse(v.array(storedDeckSchema), legacyDecks);
  if (legacyDeckResult.success && legacyDeckResult.output.length > 0) {
    return normalizeState({ ...createDefaultState({ seedDefaultDecks: false }), decks: legacyDeckResult.output });
  }

  return createDefaultState(options);
}

function writeState(storage: any, state: any) {
  storage.setItem(APP_STATE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
}

function updateStoredState(storage: any, options: any, updater: any) {
  const state = readState(storage, options);
  const nextState = updater(state);
  if (nextState !== state) writeState(storage, nextState);
  return nextState;
}

function upsertById(items: any = [], item: any) {
  return [item, ...items.filter((storedItem: any) => storedItem.id !== item.id)];
}

function mergeDeckDocuments(documents: any = [], decks: any = []) {
  return decks.reduce(
    (currentDocuments: any, deck: any) =>
      (deck.sourceDocuments ?? []).reduce(
        (nextDocuments: any, document: any) => upsertById(nextDocuments, document),
        currentDocuments,
      ),
    documents,
  );
}

export function createCoreRepository(storage: any = null, options: any = {}) {
  const resolvedStorage = storage ?? getStorage();
  const seedDefaultDecks = options.seedDefaultDecks ?? storage == null;
  const saveDecks = (decks: any = []) => {
    const normalizedDecks = decks.filter(Boolean).map((deck: any) => normalizeCoreDeck(deck));
    if (!normalizedDecks.length) return [];

    updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
      ...state,
      decks: normalizedDecks.reduce((currentDecks: any, deck: any) => upsertById(currentDecks, deck), state.decks),
      documents: mergeDeckDocuments(state.documents, normalizedDecks),
    }));
    return normalizedDecks;
  };

  return {
    getState() {
      return readState(resolvedStorage, { seedDefaultDecks });
    },
    saveState(nextState: any) {
      const normalized = normalizeState(nextState);
      writeState(resolvedStorage, normalized);
      return normalized;
    },
    listDecks() {
      return readState(resolvedStorage, { seedDefaultDecks }).decks;
    },
    getDeck(deckId: any) {
      return readState(resolvedStorage, { seedDefaultDecks }).decks.find((deck: any) => deck.id === deckId) ?? null;
    },
    saveDeck(deck: any) {
      return saveDecks([deck])[0] ?? null;
    },
    saveDecks,
    updateDeck(deckId: any, updater: any) {
      let normalizedDeck = null;
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => {
        const existing = state.decks.find((deck: any) => deck.id === deckId);
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
    deleteDeck(deckId: any) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
        ...state,
        decks: state.decks.filter((deck: any) => deck.id !== deckId),
      }));
    },
    updateDeckSettings(deckId: any, settings: any) {
      return this.updateDeck(deckId, (deck: any) => ({
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
    saveProfile(profile: any) {
      let nextProfile = null;
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => {
        nextProfile = { ...state.profile, ...profile };
        return { ...state, profile: nextProfile };
      });
      return nextProfile;
    },
    listCommunities() {
      return readState(resolvedStorage, { seedDefaultDecks }).communities;
    },
    saveCommunity(community: any) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
        ...state,
        communities: upsertById(state.communities, community),
      }));
      return community;
    },
    saveAiJob(job: any) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
        ...state,
        aiJobs: upsertById(state.aiJobs, job),
      }));
      return job;
    },
    listAiJobs() {
      return readState(resolvedStorage, { seedDefaultDecks }).aiJobs;
    },
    saveChatExchange(exchange: any) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
        ...state,
        chatTranscript: [exchange, ...state.chatTranscript].slice(0, 30),
      }));
      return exchange;
    },
    saveLearningPlan(plan: any) {
      updateStoredState(resolvedStorage, { seedDefaultDecks }, (state: any) => ({
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
