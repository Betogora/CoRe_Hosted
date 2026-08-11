import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAccount } from "./authModel.ts";
import { createBasicLearningItem, createCoreDeck, createLearningItemFromEditorValue, getCardEditorValue, getOriginalVariant, saveCardEditorValue } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { createPortableExport, mergePortableExportIntoState, PORTABLE_EXPORT_FILE_NAME, validatePortableExport } from "./dataPortability.ts";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key: any) {
      return store.get(key) ?? null;
    },
    setItem(key: any, value: any) {
      store.set(key, value);
    },
    removeItem(key: any) {
      store.delete(key);
    },
  };
}

function portableState(overrides = {}) {
  return {
    profile: createLocalAccount({ email: "export@example.test", password: "supersecret" }),
    decks: [
      createCoreDeck({
        id: "deck_export",
        name: "Export Deck",
        source: "manual",
        cards: [createBasicLearningItem("deck_export", "Was ist ATP?", "Ein Energietraeger der Zelle.", { revision: 3, updatedByDeviceId: "device-card" })],
        revision: 4,
        updatedByDeviceId: "device-deck",
      }),
    ],
    documents: [],
    ...overrides,
  };
}

test("portable export uses a stable JSON file name", () => {
  assert.equal(PORTABLE_EXPORT_FILE_NAME, "core-portable-export.json");
});

test("portable export redacts local password verifier", () => {
  const exported = createPortableExport(portableState(), "2026-07-01T08:00:00.000Z");
  const validation = validatePortableExport(exported);

  assert.equal(validation.valid, true);
  assert.equal(exported.profile.account.passwordVerifier, undefined);
  assert.equal(exported.profile.account.status, "signed-in");
  assert.equal(exported.schemaVersion, 2);
  assert.equal("communities" in exported, false);
  assert.equal("aiJobs" in exported, false);
  assert.equal(exported.decks[0].revision, undefined);
  assert.equal(exported.decks[0].updatedByDeviceId, undefined);
  assert.equal(exported.decks[0].cards[0].revision, undefined);
  assert.equal(exported.decks[0].cards[0].updatedByDeviceId, undefined);
});

test("portable export and import transport global learning-day and Easy-Days settings", () => {
  const sourceBase = portableState();
  const source = portableState({
    profile: { ...sourceBase.profile, schedulerPreferences: { dayStartHour: 3, easyDays: { friday: "minimum", saturday: "reduced" } } },
  });
  const exported = createPortableExport(source, "2026-07-01T08:00:00.000Z");
  const target = portableState({
    profile: {
      ...portableState().profile,
      schedulerPreferences: { dayStartHour: 0, profile: "standard" },
    },
  });

  const merged = mergePortableExportIntoState(target, exported);

  assert.equal(exported.profile.schedulerPreferences.dayStartHour, 3);
  assert.equal(merged.profile.schedulerPreferences.dayStartHour, 3);
  assert.equal(merged.profile.schedulerPreferences.learnAheadMinutes, 20);
  assert.equal(exported.profile.schedulerPreferences.easyDays.friday, "minimum");
  assert.equal(merged.profile.schedulerPreferences.easyDays.friday, "minimum");
  assert.equal(merged.profile.schedulerPreferences.easyDays.saturday, "reduced");
  assert.deepEqual(merged.profile.schedulerPreferences.learningProfiles, []);
});

test("partial legacy scheduler imports preserve missing local global values", () => {
  const target = portableState({
    profile: {
      ...portableState().profile,
      schedulerPreferences: { dayStartHour: 0, learnAheadMinutes: 60, easyDays: { sunday: "minimum" } },
    },
  });
  const imported = createPortableExport(portableState({
    profile: {
      ...portableState().profile,
      schedulerPreferences: { dayStartHour: 3 },
    },
    decks: [],
  }));

  const merged = mergePortableExportIntoState(target, imported);

  assert.equal(merged.profile.schedulerPreferences.dayStartHour, 3);
  assert.equal(merged.profile.schedulerPreferences.learnAheadMinutes, 60);
  assert.equal(merged.profile.schedulerPreferences.easyDays.sunday, "minimum");
});

test("portable import deduplicates equal profile ids and forks content collisions", () => {
  const shared = {
    id: "learning-profile:shared",
    name: "Prüfung",
    contentVersion: 2,
    settings: {
      newCardsPerDay: 30,
      maximumReviewsPerDay: 300,
      newReviewOrder: "mixed",
      schedulerProfile: { settingsVersion: 2, presetId: "custom", learningStepsMinutes: [3, 10], relearningStepMinutes: 3, desiredRetention: 0.94, maximumIntervalDays: 365, lessShortIntervalBias: false },
    },
  };
  const source = portableState({ profile: { ...portableState().profile, schedulerPreferences: { learningProfiles: [shared] } }, decks: [] });
  const equalTarget = portableState({ profile: { ...portableState().profile, schedulerPreferences: { learningProfiles: [shared] } }, decks: [] });
  const equalMerged = mergePortableExportIntoState(equalTarget, createPortableExport(source));
  assert.equal(equalMerged.profile.schedulerPreferences.learningProfiles.length, 1);

  const localCollision = { ...shared, settings: { ...shared.settings, newCardsPerDay: 12 } };
  const collisionTarget = portableState({ profile: { ...portableState().profile, schedulerPreferences: { learningProfiles: [localCollision] } }, decks: [] });
  const collisionMerged = mergePortableExportIntoState(collisionTarget, createPortableExport(source));
  const profiles = collisionMerged.profile.schedulerPreferences.learningProfiles;
  assert.equal(profiles.length, 2);
  assert.equal(profiles.find((profile: { id: string }) => profile.id === shared.id).settings.newCardsPerDay, 12);
  assert.equal(profiles.some((profile: { id: string; settings: { newCardsPerDay: number } }) => profile.id !== shared.id && profile.settings.newCardsPerDay === 30), true);
});

test("portable profile collisions remap imported deck provenance to the fork", () => {
  const shared = {
    id: "learning-profile:shared",
    name: "Prüfung",
    contentVersion: 2,
    settings: {
      newCardsPerDay: 30,
      maximumReviewsPerDay: 300,
      newReviewOrder: "mixed",
      schedulerProfile: { settingsVersion: 2, presetId: "custom", learningStepsMinutes: [3, 10], relearningStepMinutes: 3, desiredRetention: 0.94, maximumIntervalDays: 365, lessShortIntervalBias: false },
    },
  };
  const importedDeck = createCoreDeck({
    id: "deck_profile_import",
    name: "Importierter Stapel",
    source: "manual",
    cards: [],
    deckSettings: { learningProfileSource: { id: shared.id, contentVersion: shared.contentVersion } },
  });
  const source = portableState({
    profile: { ...portableState().profile, schedulerPreferences: { learningProfiles: [shared] } },
    decks: [importedDeck],
  });
  const localCollision = { ...shared, settings: { ...shared.settings, newCardsPerDay: 12 } };
  const target = portableState({
    profile: { ...portableState().profile, schedulerPreferences: { learningProfiles: [localCollision] } },
    decks: [],
  });

  const merged = mergePortableExportIntoState(target, createPortableExport(source));
  const forked = merged.profile.schedulerPreferences.learningProfiles.find((profile: { id: string }) => profile.id !== shared.id);
  const imported = merged.decks.find((deck: { id: string }) => deck.id === importedDeck.id);

  assert.ok(forked);
  assert.deepEqual(imported.deckSettings.learningProfileSource, { id: forked.id, contentVersion: forked.contentVersion });
});

test("portable export validation reports malformed json without throwing", () => {
  const validation = validatePortableExport("{not-json");

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors, ["Export-JSON konnte nicht gelesen werden."]);
  assert.equal(validation.payload, null);
});

test("portable export validation rejects unsupported schema versions", () => {
  const exported = createPortableExport(portableState(), "2026-07-01T08:00:00.000Z");
  const validation = validatePortableExport({ ...exported, schemaVersion: 0 });

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.includes("Export-Version")), true);
});

test("portable export merge keeps local deck on id conflict and adds only new decks", () => {
  const localDeck = createCoreDeck({ id: "deck_conflict", name: "Lokaler Stand", source: "manual", cards: [] });
  const incomingConflict = createCoreDeck({ id: "deck_conflict", name: "Importierter Stand", source: "manual", cards: [] });
  const incomingNew = createCoreDeck({ id: "deck_new", name: "Neuer Import", source: "manual", cards: [] });
  const exported = createPortableExport(portableState({ decks: [incomingConflict, incomingNew] }), "2026-07-01T08:00:00.000Z");
  const merged = mergePortableExportIntoState(portableState({ decks: [localDeck] }), exported);

  assert.equal(merged.decks.length, 2);
  assert.equal(merged.decks.find((deck: { id: string; }) => deck.id === "deck_conflict").name, "Lokaler Stand");
  assert.equal(merged.decks.find((deck: { id: string; }) => deck.id === "deck_new").name, "Neuer Import");
});

test("repository import roundtrip normalizes legacy cards into learning items", () => {
  const repository = createCoreRepository(createMemoryStorage());
  const exported = {
    schema: "core-portable-export",
    schemaVersion: 1,
    exportedAt: "2026-07-01T08:00:00.000Z",
    profile: null,
    communities: [],
    aiJobs: [],
    documents: [],
    decks: [
      {
        id: "deck_legacy_export",
        name: "Legacy Export",
        source: "manual",
        cards: [
          {
            id: "card_legacy_export",
            source: "manual",
            originalFront: "Was ist CoRe?",
            originalBack: "Content Repetition.",
            originalTags: ["core"],
            reviewState: { maturityXp: 12, repetitions: 1 },
          },
        ],
      },
    ],
  };
  const merged = mergePortableExportIntoState(repository.getState(), exported);
  repository.saveState(merged);

  const item = repository.getState().decks[0].cards[0];
  const original = getOriginalVariant(item);

  assert.equal(item.id, "card_legacy_export");
  assert.equal(item.canonicalQuestion, "Was ist CoRe?");
  assert.equal(item.learningItemState.maturityXp, 12);
  assert.ok(original);
  assert.equal(original.isOriginal, true);
  assert.ok(original);
  assert.equal(original.front, "Was ist CoRe?");
});

test("v1 export discards Labs content and keeps Core decks", () => {
  const legacyExport = {
    schema: "core-portable-export",
    schemaVersion: 1,
    exportedAt: "2026-07-01T08:00:00.000Z",
    profile: { displayName: "Ada", university: "Legacy Uni", fieldOfStudy: "Legacy-Fach", preferredLanguage: "en", privacy: { showOnlineStatus: true } },
    communities: [{ id: "community_1" }],
    aiJobs: [{ id: "job_1" }],
    documents: [],
    decks: [
      { id: "core", name: "Core", source: "manual", cards: [
        { id: "core-card", source: "manual", originalFront: "Core", originalBack: "Bleibt" },
        { id: "ai-card", source: "ai-assisted", sourceType: "ai_generated", originalFront: "Labs", originalBack: "Entfällt" },
      ] },
      { id: "ai-deck", name: "KI", source: "ai-assisted", cards: [] },
      { id: "community-deck", name: "Community", source: "community", cards: [] },
    ],
  };

  const validation = validatePortableExport(legacyExport);
  assert.equal(validation.valid, true);
  assert.equal(validation.payload?.schemaVersion, 2);
  assert.deepEqual(validation.payload?.decks.map((deck) => deck.id), ["core"]);
  assert.deepEqual(validation.payload?.decks[0].cards.map((card: { id: string }) => card.id), ["core-card"]);
  for (const key of ["privacy", "university", "fieldOfStudy", "preferredLanguage"]) assert.equal(key in (validation.payload?.profile ?? {}), false);
  assert.equal("communities" in (validation.payload ?? {}), false);
  assert.equal("aiJobs" in (validation.payload ?? {}), false);
});

test("repository migrates v2 state once to Labs-free v3", () => {
  const storage = createMemoryStorage();
  storage.setItem("core.appState.v2", JSON.stringify({
    version: 2,
    profile: { displayName: "Ada", university: "Legacy Uni", fieldOfStudy: "Legacy-Fach", preferredLanguage: "en", privacy: { showOnlineStatus: true } },
    communities: [{ id: "community_1" }],
    aiJobs: [{ id: "job_1" }],
    chatTranscript: [{ id: "message_1" }],
    learningPlans: [{ id: "plan_1" }],
    documents: [],
    decks: [
      { id: "core", name: "Core", source: "manual", visibility: "community", graph: {}, communityRefs: [], aiJobs: [], cards: [
        { id: "core-card", source: "manual", originalFront: "Core", originalBack: "Bleibt" },
        { id: "generated-card", source: "manual", sourceType: "ai_generated", originalFront: "Labs", originalBack: "Entfällt" },
      ] },
      { id: "community-deck", name: "Community", source: "community", cards: [] },
    ],
  }));

  const state = createCoreRepository(storage).getState();
  const persisted = JSON.parse(storage.getItem("core.appState.v3"));
  assert.equal(storage.getItem("core.appState.v2"), null);
  assert.equal(state.version, 3);
  assert.deepEqual(state.decks.map((deck: { id: string }) => deck.id), ["core"]);
  assert.deepEqual(state.decks[0].cards.map((card: { id: string }) => card.id), ["core-card"]);
  for (const key of ["communities", "aiJobs", "chatTranscript", "learningPlans"]) assert.equal(key in persisted, false);
  for (const key of ["visibility", "graph", "communityRefs", "aiJobs"]) assert.equal(key in persisted.decks[0], false);
  for (const key of ["privacy", "university", "fieldOfStudy", "preferredLanguage"]) assert.equal(key in persisted.profile, false);
});

test("portable export roundtrips structured card editor content", () => {
  const repository = createCoreRepository(createMemoryStorage());
  const created = createLearningItemFromEditorValue("deck_structured", {
    cardType: "cloze",
    textWithClozes: "{{c1::ATP}} speichert Energie.",
    extra: "Adenosintriphosphat",
    tags: ["biochemie"],
  });
  const card = saveCardEditorValue(created, {
    cardType: "cloze",
    textWithClozes: "{{c1::ATP}} überträgt {{c2::Energie}}.",
    extra: "Zwei Lückengruppen",
    tags: ["biochemie", "cloze"],
  });
  const state = portableState({
    decks: [createCoreDeck({ id: "deck_structured", name: "Strukturiert", source: "manual", cards: [card] })],
  });
  const exported = createPortableExport(state, "2026-07-16T08:00:00.000Z");
  const merged = mergePortableExportIntoState(repository.getState(), exported);
  repository.saveState(merged);

  const loaded = repository.getState().decks[0].cards[0];
  assert.deepEqual(getCardEditorValue(loaded), getCardEditorValue(card));
  assert.deepEqual(loaded.versionLog, card.versionLog);
});
