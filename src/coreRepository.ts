import * as v from "valibot";
import { createDefaultDeckSettings, normalizeCoreDeck } from "./coreModel.ts";
import { createWorldCapitalsSeedDecks, ensureWorldCapitalsStudyHistory } from "./fixtures/worldCapitals.ts";
import { DEFAULT_UI_PREFERENCES, normalizeUiPreferences } from "./uiPreferences.ts";

const LEGACY_DECKS_KEY = "core.importedDecks.v1";
const LEGACY_APP_STATE_KEY = "core.appState.v2";
const APP_STATE_KEY = "core.appState.v3";
const UI_PREFERENCES_KEY = "core.uiPreferences.v1";
const RETIRED_DECK_SOURCES = new Set(["ai-assisted", "community"]);

let memoryState: any = null;
const stateCache = new WeakMap<object, any>();

const storedDeckSchema = v.looseObject({ id: v.string() });
const appStateStorageSchema = v.looseObject({
  version: v.optional(v.number()),
  profile: v.optional(v.nullable(v.unknown())),
  decks: v.array(storedDeckSchema),
  documents: v.optional(v.array(v.unknown())),
  cloudTombstones: v.optional(v.array(v.unknown())),
});

function createDefaultProfile() {
  return {
    userId: "local-user",
    email: "",
    displayName: "",
    university: "",
    fieldOfStudy: "",
    preferredLanguage: "de",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    onboardingComplete: false,
    schedulerPreferences: {
      profile: "standard",
    },
    uiPreferences: DEFAULT_UI_PREFERENCES,
  };
}

function createDefaultState({ seedDefaultDecks = false }: any = {}) {
  return {
    version: 3,
    profile: createDefaultProfile(),
    decks: seedDefaultDecks ? createWorldCapitalsSeedDecks() : [],
    documents: [],
    cloudTombstones: [],
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
  if (!Array.isArray(decks)) return [];
  return decks
    .filter((deck: any) => !RETIRED_DECK_SOURCES.has(deck?.source))
    .map((deck: any) => normalizeCoreDeck({
      ...deck,
      cards: Array.isArray(deck?.cards)
        ? deck.cards.filter((card: any) => !RETIRED_DECK_SOURCES.has(card?.source) && card?.sourceType !== "ai_generated")
        : [],
    }));
}

function normalizeState(rawState: any) {
  const fallback = createDefaultState({ seedDefaultDecks: false });
  const decks = ensureWorldCapitalsStudyHistory(normalizeStoredDecks(rawState?.decks));

  const { privacy: _privacy, ...profile } = rawState?.profile ?? {};
  return {
    version: 3,
    profile: {
      ...fallback.profile,
      ...profile,
      uiPreferences: normalizeUiPreferences(profile.uiPreferences),
    },
    decks,
    documents: Array.isArray(rawState?.documents) ? rawState.documents : [],
    cloudTombstones: Array.isArray(rawState?.cloudTombstones) ? rawState.cloudTombstones : [],
    updatedAt: typeof rawState?.updatedAt === "string" ? rawState.updatedAt : fallback.updatedAt,
  };
}

function hasRetiredState(rawState: any) {
  if (!rawState || typeof rawState !== "object") return false;
  if (rawState.version !== 3 || ["communities", "aiJobs", "chatTranscript", "learningPlans"].some((key) => key in rawState)) return true;
  if (rawState.profile && typeof rawState.profile === "object" && "privacy" in rawState.profile) return true;
  return (rawState.decks ?? []).some((deck: any) =>
    RETIRED_DECK_SOURCES.has(deck?.source)
    || ["aiJobs", "graph", "communityRefs", "visibility"].some((key) => key in (deck ?? {}))
    || (deck?.cards ?? []).some((card: any) => RETIRED_DECK_SOURCES.has(card?.source) || card?.sourceType === "ai_generated"),
  );
}

function readState(storage: any, options: any = {}) {
  const cached = stateCache.get(storage);
  if (cached) return cached;

  const withUiPreferences = (state: any) => {
    const storedPreferences = parseJson(storage.getItem(UI_PREFERENCES_KEY), null);
    const nextState = storedPreferences && typeof storedPreferences === "object" && !Array.isArray(storedPreferences)
      ? { ...state, profile: { ...state.profile, uiPreferences: normalizeUiPreferences(storedPreferences) } }
      : state;
    stateCache.set(storage, nextState);
    return nextState;
  };
  const current = parseJson(storage.getItem(APP_STATE_KEY), null);
  const currentResult = v.safeParse(appStateStorageSchema, current);
  if (currentResult.success) {
    const normalized = normalizeState(currentResult.output);
    return withUiPreferences(hasRetiredState(currentResult.output) ? writeState(storage, normalized) : normalized);
  }

  const legacyState = parseJson(storage.getItem(LEGACY_APP_STATE_KEY), null);
  const legacyResult = v.safeParse(appStateStorageSchema, legacyState);
  if (legacyResult.success) {
    const migrated = normalizeState(legacyResult.output);
    writeState(storage, migrated);
    storage.removeItem(LEGACY_APP_STATE_KEY);
    return withUiPreferences(migrated);
  }

  const legacyDecks = parseJson(storage.getItem(LEGACY_DECKS_KEY), []);
  const legacyDeckResult = v.safeParse(v.array(storedDeckSchema), legacyDecks);
  if (legacyDeckResult.success && legacyDeckResult.output.length > 0) {
    return withUiPreferences(normalizeState({ ...createDefaultState({ seedDefaultDecks: false }), decks: legacyDeckResult.output }));
  }

  return withUiPreferences(createDefaultState(options));
}

function writeState(storage: any, state: any) {
  const persistedState = { ...state, updatedAt: new Date().toISOString() };
  storage.setItem(APP_STATE_KEY, JSON.stringify(persistedState));
  stateCache.set(storage, persistedState);
  return persistedState;
}

function writeUiPreferences(storage: any, value: any) {
  const preferences = normalizeUiPreferences(value);
  storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(preferences));
  return preferences;
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
  const seedDefaultDecks = options.seedDefaultDecks === true;
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
      const persistedState = writeState(resolvedStorage, normalized);
      resolvedStorage.removeItem(UI_PREFERENCES_KEY);
      return persistedState;
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
      const state = readState(resolvedStorage, { seedDefaultDecks });
      const patch = profile && typeof profile === "object" ? profile : {};
      const nextProfile = {
        ...state.profile,
        ...patch,
        ...(Object.hasOwn(patch, "uiPreferences")
          ? { uiPreferences: normalizeUiPreferences(patch.uiPreferences) }
          : {}),
      };
      const nextState = { ...state, profile: nextProfile };
      if (Object.keys(patch).length === 1 && Object.hasOwn(patch, "uiPreferences")) {
        writeUiPreferences(resolvedStorage, nextProfile.uiPreferences);
        stateCache.set(resolvedStorage, nextState);
      } else {
        writeState(resolvedStorage, nextState);
        if (Object.hasOwn(patch, "uiPreferences")) resolvedStorage.removeItem(UI_PREFERENCES_KEY);
      }
      return nextProfile;
    },
    clear() {
      writeState(resolvedStorage, createDefaultState({ seedDefaultDecks }));
      resolvedStorage.removeItem(UI_PREFERENCES_KEY);
      resolvedStorage.removeItem(LEGACY_DECKS_KEY);
    },
  };
}
