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
    communities: [],
    aiJobs: [],
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
  assert.equal(exported.decks[0].revision, undefined);
  assert.equal(exported.decks[0].updatedByDeviceId, undefined);
  assert.equal(exported.decks[0].cards[0].revision, undefined);
  assert.equal(exported.decks[0].cards[0].updatedByDeviceId, undefined);
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
