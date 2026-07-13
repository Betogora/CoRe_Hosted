import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAccount } from "./authModel.ts";
import { createBasicLearningItem, createCoreDeck, getOriginalVariant } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { createPortableExport, mergePortableExportIntoState, validatePortableExport } from "./dataPortability.ts";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
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
  assert.equal(merged.decks.find((deck) => deck.id === "deck_conflict").name, "Lokaler Stand");
  assert.equal(merged.decks.find((deck) => deck.id === "deck_new").name, "Neuer Import");
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
  assert.equal(original.isOriginal, true);
  assert.equal(original.front, "Was ist CoRe?");
});
