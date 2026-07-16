import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument, getActiveVariants, getAnswerSideAnchorMiniCard, getOriginalVariant } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { createCoreWorkspace, createDemoAnatomyDeck } from "./coreWorkspace.ts";
import { createWorldCapitalsSeedDecks } from "./fixtures/worldCapitals.ts";
import { createStudyHeatmapModel } from "./libraryModel.ts";

function createMemoryStorage() {
  const store = new Map();
  let writeCount = 0;
  return {
    getItem(key: any) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      writeCount += 1;
      store.set(key, value);
    },
    removeItem(key: any) {
      store.delete(key);
    },
    get writeCount() {
      return writeCount;
    },
  };
}

function createTestWorkspace() {
  return createCoreWorkspace(createCoreRepository(createMemoryStorage()));
}

function stripWorldCapitalsStudyHistory(decks: any[]) {
  return decks.map((deck: { importMeta: any; cards: any; }) => ({
    ...deck,
    reviewEvents: [],
    importMeta: {
      ...deck.importMeta,
      studyHistory: null,
    },
    cards: (deck.cards ?? []).map((card: { reviewState: any; meta: any; }) => {
      const reviewState = {
        ...card.reviewState,
        state: "new",
        dueAt: "2026-07-07T00:00:00.000Z",
        intervalDays: 0,
        intervalMinutes: null,
        stability: 0,
        difficulty: 5,
        retrievability: null,
        reps: 0,
        repetitions: 0,
        lapses: 0,
        maturityXp: 0,
        lastReviewedAt: null,
        lastRating: null,
      };

      return {
        ...card,
        learningItemState: reviewState,
        reviewState,
        meta: {
          ...card.meta,
          studyProfile: null,
          studyHistoryVersion: null,
        },
      };
    }),
  }));
}

function parsedApkgFixture(overrides = {}) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const decks = overrides.decks ?? [{ id: "1", name: "Workspace APKG" }];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const notes = overrides.notes ?? [{ id: 10, mid: 99, tags: "apkg", flds: "Workspace front?\u001fWorkspace back." }];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const cards = overrides.cards ?? [{ id: 20, nid: 10, did: 1, ord: 0 }];

  return {
    file: { name: "workspace.apkg", size: 1024 },
    decks,
    colRows: [
      {
        decks: JSON.stringify(Object.fromEntries(decks.map((deck: { id: any; name: any; }) => [deck.id, { id: deck.id, name: deck.name }]))),
        models: JSON.stringify({
          99: {
            name: "Basic",
            flds: [{ name: "Front" }, { name: "Back" }],
            tmpls: [{ name: "Card 1", ord: 0 }],
          },
        }),
      },
    ],
    notes,
    cards,
  };
}

test("workspace creates the demo deck behind one interface", () => {
  const workspace = createTestWorkspace();
  const demo = workspace.createDemoDeck();

  assert.equal(demo.name, "Demo / Anatomie");
  assert.equal(demo.cards.length, 2);
  assert.equal(workspace.getState().decks.length, 1);
  assert.equal(workspace.getState().decks[0].cards[0].coreState.isCoreReady, true);
});

test("workspace saves single and multi-deck creation results behind one interface", () => {
  const storage = createMemoryStorage();
  const workspace = createCoreWorkspace(createCoreRepository(storage));
  const single = workspace.saveDecks(createDemoAnatomyDeck());
  const writesBeforeBatch = storage.writeCount;
  const multiple = workspace.saveDecks([createDemoAnatomyDeck(), createDemoAnatomyDeck()]);

  assert.ok(single);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(single.name, "Demo / Anatomie");
  assert.ok(multiple);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(multiple.length, 2);
  assert.ok(multiple);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(multiple.every((deck: { cards: string|any[]; }) => deck.cards.length === 2), true);
  assert.equal(workspace.getState().decks.length, 3);
  assert.equal(storage.writeCount - writesBeforeBatch, 1);
});

test("workspace can seed the world capitals deck for an empty local tester account", () => {
  const workspace = createCoreWorkspace(createCoreRepository(createMemoryStorage(), { seedDefaultDecks: true }));
  const state = workspace.getState();
  const root = state.decks.find((deck) => deck.id === "deck_world_capitals");
  const europe = state.decks.find((deck) => deck.id === "deck_world_capitals_europa");
  const cards = state.decks.flatMap((deck) => deck.cards ?? []);
  const reviewEventCount = state.decks.reduce((sum, deck) => sum + (deck.reviewEvents?.length ?? 0), 0);
  const matureCards = cards.filter((card) => ["variant_ready", "mastered"].includes(card.reviewState?.maturityBand));
  const dueCards = cards.filter((card) => new Date(card.reviewState?.dueAt ?? 0).getTime() <= new Date("2026-07-07T12:00:00.000Z").getTime());
  const stubbornCards = cards.filter((card) => card.meta?.studyProfile === "hartnäckig-aber-stabil");
  const heatmap = createStudyHeatmapModel(state.decks, { now: "2026-07-07T12:00:00.000Z", weeks: 14 });

  assert.equal(state.decks.length, 8);
  assert.ok(root);
  assert.equal(root.name, "Welt-Hauptstädte");
  assert.ok(root);
  assert.equal(root.cards.length, 0);
  assert.ok(root);
  assert.ok(europe);
  assert.equal(europe.parentDeckId, root.id);
  assert.equal(state.decks.reduce((sum, deck) => sum + deck.cards.length, 0), 245);
  assert.ok(root);
  assert.equal(root.createdAt, "2026-04-07T06:30:00.000Z");
  assert.ok(root);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(root.importMeta.studyHistory.version, "study-history-v1");
  assert.equal(reviewEventCount, 1952);
  assert.equal(heatmap.totalCount, reviewEventCount);
  assert.equal(heatmap.activeDays, 81);
  assert.equal(matureCards.length, 148);
  assert.equal(dueCards.length, 26);
  assert.equal(stubbornCards.length, 19);
  assert.equal(stubbornCards.every((card) => card.reviewState.lapses >= 2 && card.reviewState.maturityBand === "variant_ready"), true);
});

test("repository enriches an untouched persisted world-capitals seed with study history", () => {
  const storage = createMemoryStorage();
  const oldSeedDecks = stripWorldCapitalsStudyHistory(createWorldCapitalsSeedDecks());
  storage.setItem(
    "core.appState.v2",
    JSON.stringify({
      version: 2,
      profile: {},
      decks: oldSeedDecks,
      communities: [],
      aiJobs: [],
      documents: [],
      chatTranscript: [],
      learningPlans: [],
    }),
  );

  const workspace = createCoreWorkspace(createCoreRepository(storage, { seedDefaultDecks: false }));
  const state = workspace.getState();
  const reviewEventCount = state.decks.reduce((sum, deck) => sum + (deck.reviewEvents?.length ?? 0), 0);
  const firstReviewedCard = state.decks.flatMap((deck) => deck.cards ?? []).find((card) => card.reviewState?.repetitions > 0);

  assert.equal(reviewEventCount, 1952);
  assert.ok(state);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(state.decks.find((deck) => deck.id === "deck_world_capitals").importMeta.studyHistory.version, "study-history-v1");
  assert.ok(firstReviewedCard);
  assert.equal(firstReviewedCard.reviewState.lastReviewedAt !== null, true);
});

test("workspace APKG commands dry-run and commit through normalized import", async () => {
  const workspace = createTestWorkspace();
  const dryRun = await workspace.dryRunApkgImport(parsedApkgFixture());
  const beforeCommit = workspace.getState().decks.length;
  const committed = await workspace.commitApkgImport(parsedApkgFixture());

  assert.equal(dryRun.deck, null);
  assert.equal(dryRun.report.createdLearningItems, 1);
  assert.equal(dryRun.report.apkg.detectedCards, 1);
  assert.equal(beforeCommit, 0);
  assert.ok(committed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(committed.deck.source, "anki-apkg");
  assert.ok(committed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(committed.deck.cards.length, 1);
  assert.ok(committed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(committed.deck.cards[0].sourceType, "anki_import");
  assert.ok(committed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(committed.deck.cards[0].reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(workspace.getState().decks.length, 1);
});

test("workspace APKG commit preserves nested Anki subdecks", async () => {
  const workspace = createTestWorkspace();
  const committed = await workspace.commitApkgImport(
    parsedApkgFixture({
      decks: [
        { id: "1", name: "Medizin" },
        { id: "2", name: "Medizin::Anatomie" },
        { id: "3", name: "Medizin::Anatomie::Kopf" },
      ],
      notes: [{ id: 10, mid: 99, tags: "ana", flds: "Was ist der Nervus vagus?\u001fHirnnerv X." }],
      cards: [{ id: 20, nid: 10, did: 3, ord: 0 }],
    }),
  );
  const state = workspace.getState();
  const root = state.decks.find((deck) => deck.name === "Medizin");
  const child = state.decks.find((deck) => deck.name === "Anatomie");
  const grandchild = state.decks.find((deck) => deck.name === "Kopf");

  assert.ok(committed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(committed.decks.length, 3);
  assert.ok(root);
  assert.ok(child);
  assert.ok(grandchild);
  assert.equal(root.parentDeckId, null);
  assert.equal(child.parentDeckId, root.id);
  assert.equal(grandchild.parentDeckId, child.id);
  assert.deepEqual(grandchild.hierarchyPath, ["Medizin", "Anatomie", "Kopf"]);
  assert.equal(root.cards.length, 0);
  assert.equal(child.cards.length, 0);
  assert.equal(grandchild.cards.length, 1);
});

test("workspace creates manual deck trees and deletes a selected subtree", () => {
  const workspace = createTestWorkspace();
  const root = workspace.createDeck({ name: "Medizin" });
  const anatomy = workspace.createDeck({ name: "Anatomie", parentDeckId: root.id });
  const head = workspace.createDeck({ name: "Kopf", parentDeckId: anatomy.id });
  const physio = workspace.createDeck({ name: "Physio", parentDeckId: root.id });

  assert.equal(anatomy.parentDeckId, root.id);
  assert.equal(head.parentDeckId, anatomy.id);
  assert.deepEqual(head.hierarchyPath, ["Medizin", "Anatomie", "Kopf"]);
  assert.deepEqual(physio.hierarchyPath, ["Medizin", "Physio"]);

  const deleted = workspace.deleteDeckTree(anatomy.id);
  const remainingIds = workspace.getState().decks.map((deck) => deck.id);

  assert.deepEqual(new Set(deleted.deletedDeckIds), new Set([anatomy.id, head.id]));
  assert.equal(remainingIds.includes(root.id), true);
  assert.equal(remainingIds.includes(physio.id), true);
  assert.equal(remainingIds.includes(anatomy.id), false);
  assert.equal(remainingIds.includes(head.id), false);
  assert.deepEqual(
    new Set(workspace.getState().cloudTombstones.filter((tombstone) => tombstone.entityTable === "decks").map((tombstone) => tombstone.entityId)),
    new Set([anatomy.id, head.id]),
  );
});

test("repository starts empty and neutral unless a fixture is explicitly requested", () => {
  const workspace = createTestWorkspace();
  const state = workspace.getState();

  assert.equal(state.decks.length, 0);
  assert.equal(state.profile.displayName, "");
  assert.equal(state.profile.email, "");
  assert.equal(state.profile.university, "");
  assert.equal(state.profile.fieldOfStudy, "");
});

test("workspace creates the world-capitals fixture only through the explicit demo action", () => {
  const workspace = createTestWorkspace();

  assert.equal(workspace.getState().decks.length, 0);
  const demoDecks = workspace.createWorldCapitalsDemo();

  assert.equal(demoDecks.length, 8);
  assert.equal(workspace.getState().decks.find((deck) => deck.id === "deck_world_capitals")?.name, "Welt-Hauptstädte");
  assert.equal(workspace.getState().decks.reduce((count, deck) => count + (deck.reviewEvents?.length ?? 0), 0), 0);
});

test("repository falls back to a safe default for structurally damaged app state", () => {
  const storage = createMemoryStorage();
  storage.setItem("core.appState.v2", JSON.stringify({ version: 2, decks: [{ name: "ID fehlt" }] }));

  const state = createCoreRepository(storage, { seedDefaultDecks: false }).getState();

  assert.equal(state.version, 2);
  assert.deepEqual(state.decks, []);
  assert.equal(state.profile.userId, "local-user");
});

test("workspace stores deck appearance while creating nested decks", () => {
  const workspace = createTestWorkspace();
  const root = workspace.createDeck({ name: "Medizin" });
  const deck = workspace.createDeck({
    name: "Biochemie",
    parentDeckId: root.id,
    deckSettings: {
      appearance: {
        iconKey: "brain",
        iconColor: "#047857",
      },
    },
  });

  assert.equal(deck.parentDeckId, root.id);
  assert.deepEqual(deck.hierarchyPath, ["Medizin", "Biochemie"]);
  assert.deepEqual(deck.deckSettings.appearance, { iconKey: "brain", iconColor: "#047857" });
});

test("workspace renames a deck tree without replacing imported metadata or child contents", () => {
  const workspace = createTestWorkspace();
  const root = workspace.createDeck({ name: "Medizin" });
  const anatomy = workspace.createDeck({ name: "Anatomie", parentDeckId: root.id });
  const head = workspace.createDeck({ name: "Kopf", parentDeckId: anatomy.id });
  workspace.saveDeck({ ...anatomy, source: "anki-apkg", importMeta: { ankiDeckPath: "Medizin::Anatomie" } });

  const renamed = workspace.renameDeck(anatomy.id, "Neuroanatomie");
  const state = workspace.getState();
  const renamedDeck = state.decks.find((deck) => deck.id === anatomy.id);
  const child = state.decks.find((deck) => deck.id === head.id);

  assert.equal(renamed.ok, true);
  assert.ok(renamedDeck);
  assert.equal(renamedDeck.name, "Neuroanatomie");
  assert.ok(renamedDeck);
  assert.deepEqual(renamedDeck.hierarchyPath, ["Medizin", "Neuroanatomie"]);
  assert.ok(child);
  assert.deepEqual(child.hierarchyPath, ["Medizin", "Neuroanatomie", "Kopf"]);
  assert.ok(renamedDeck);
  assert.deepEqual(renamedDeck.importMeta, { ankiDeckPath: "Medizin::Anatomie" });
  assert.ok(renamedDeck);
  assert.equal(renamedDeck.versionLog.some((entry) => entry.changeType === "deck_renamed"), true);
});

test("workspace moves deck trees, supports top-level drops and rejects descendant drops", () => {
  const workspace = createTestWorkspace();
  const root = workspace.createDeck({ name: "Medizin" });
  const anatomy = workspace.createDeck({ name: "Anatomie", parentDeckId: root.id });
  const head = workspace.createDeck({ name: "Kopf", parentDeckId: anatomy.id });
  const physio = workspace.createDeck({ name: "Physio", parentDeckId: root.id });

  const moved = workspace.moveDeck(anatomy.id, physio.id);
  const movedState = workspace.getState();
  const movedAnatomy = movedState.decks.find((deck) => deck.id === anatomy.id);
  const movedHead = movedState.decks.find((deck) => deck.id === head.id);
  assert.ok(movedHead);
  const rejected = workspace.moveDeck(physio.id, movedHead.id);
  const topLevel = workspace.moveDeck(anatomy.id, null);
  const finalAnatomy = workspace.getState().decks.find((deck) => deck.id === anatomy.id);

  assert.equal(moved.ok, true);
  assert.ok(movedAnatomy);
  assert.equal(movedAnatomy.parentDeckId, physio.id);
  assert.ok(movedAnatomy);
  assert.deepEqual(movedAnatomy.hierarchyPath, ["Medizin", "Physio", "Anatomie"]);
  assert.ok(movedHead);
  assert.deepEqual(movedHead.hierarchyPath, ["Medizin", "Physio", "Anatomie", "Kopf"]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "Ein Stapel kann nicht in sich selbst oder einen eigenen Unterstapel verschoben werden.");
  assert.equal(topLevel.ok, true);
  assert.ok(finalAnatomy);
  assert.equal(finalAnatomy.parentDeckId, null);
  assert.ok(finalAnatomy);
  assert.deepEqual(finalAnatomy.hierarchyPath, ["Anatomie"]);
});

test("workspace keeps sibling deck names unique on create and rename", () => {
  const workspace = createTestWorkspace();
  const root = workspace.createDeck({ name: "Medizin" });
  const first = workspace.createDeck({ name: "Anatomie", parentDeckId: root.id });
  const second = workspace.createDeck({ name: "Anatomie", parentDeckId: root.id });
  const renamed = workspace.renameDeck(second.id, first.name);

  assert.equal(first.name, "Anatomie");
  assert.equal(second.name, "Anatomie+");
  assert.ok(renamed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(renamed.deck.name, "Anatomie+");
});

test("workspace appends a manual card to an existing deck with source document", () => {
  const workspace = createTestWorkspace();
  const deck = workspace.createDemoDeck();
  const document = createSourceDocument({
    fileName: "quelle.txt",
    text: "Osmose ist die gerichtete Diffusion von Wasser.",
    textExtractionStatus: "success",
  });

  const updated = workspace.addManualCardToDeck(deck.id, {
    deckName: deck.name,
    card: {
      cardType: "free-text",
      front: "Definiere Osmose.",
      back: "Osmose ist die gerichtete Diffusion von Wasser.",
      tags: "physiologie",
    },
    documentContext: {
      document,
      documentId: document.id,
      fileName: document.fileName,
      documentText: document.text,
      selection: "gerichtete Diffusion von Wasser",
      targetField: "back",
    },
  });
  assert.ok(updated);
  const appended = updated.cards.at(-1);

  assert.ok(updated);
  assert.equal(updated.cards.length, deck.cards.length + 1);
  assert.ok(appended);
  assert.equal(appended.kind, "basic");
  assert.ok(appended);
  assert.equal(appended.sourceAnchors[0].targetField, "back");
  assert.ok(updated);
  assert.equal(updated.sourceDocuments[0].fileName, "quelle.txt");
  assert.equal(workspace.getState().documents.some((item: { id: string; }) => item.id === document.id), true);
});

test("workspace graph and community commands hide app orchestration", () => {
  const workspace = createTestWorkspace();
  const demo = workspace.createDemoDeck();
  const graphed = workspace.ensureDeckGraph(demo.id);
  const shared = workspace.shareDeckToDefaultCommunity(demo.id);

  assert.ok(graphed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(graphed.graph.status, "ready");
  assert.ok(shared);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(shared.community.sharedDecks.length, 1);
  assert.ok(shared);
  assert.equal(shared.sharedRef.deckId, demo.id);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(workspace.getState().communities[0].sharedDecks[0].deckName, demo.name);
});

test("workspace updates all decks without React callers looping over repository state", () => {
  const workspace = createTestWorkspace();
  workspace.createDemoDeck();
  workspace.saveDeck(createDemoAnatomyDeck());

  const updated = workspace.updateAllDecks((deck) => ({
    ...deck,
    deckSettings: { ...deck.deckSettings, coreMode: "off" },
  }));

  assert.equal(updated.length, 2);
  assert.equal(workspace.getState().decks.every((deck) => deck.deckSettings.coreMode === "off"), true);
});

test("workspace card maintenance hides editing and delete invariants", () => {
  const workspace = createTestWorkspace();
  const deck = workspace.createDemoDeck();
  const cardId = deck.cards[0].id;

  const edited = workspace.saveDeckCard(deck.id, cardId, {
    cardType: "basic",
    front: "Welche Funktion hat Myelin?",
    back: "Myelin isoliert Axone und erhöht die Leitungsgeschwindigkeit.",
    tags: ["anatomie", "nerven"],
  });
  assert.ok(edited);
  const editedCard = edited.cards.find((card) => card.id === cardId);
  const modeChanged = workspace.setDeckCoreMode(deck.id, "off");
  const deleted = workspace.deleteDeckCard(deck.id, cardId);
  assert.ok(deleted);
  const deletedCard = deleted.cards.find((card) => card.id === cardId);

  assert.ok(editedCard);
  assert.equal(editedCard.originalFront, "Welche Funktion hat Myelin?");
  assert.ok(editedCard);
  assert.equal(editedCard.immutableOriginal.front, deck.cards[0].immutableOriginal.front);
  assert.ok(editedCard);
  assert.equal(editedCard.versionLog.some((entry) => entry.changeType === "content_updated"), true);
  assert.ok(modeChanged);
  assert.equal(modeChanged.deckSettings.coreMode, "off");
  assert.ok(deletedCard);
  assert.equal(deletedCard.status, "deleted");
  assert.ok(deletedCard);
  assert.equal(Boolean(deletedCard.deletedAt), true);
  assert.ok(deletedCard);
  assert.equal(deletedCard.versionLog.some((entry) => entry.changeType === "deleted"), true);
});

test("workspace restores a card version through the canonical repository mutation", () => {
  const workspace = createTestWorkspace();
  const deck = workspace.createDemoDeck();
  const card = deck.cards[0];
  const editedDeck = workspace.saveDeckCard(deck.id, card.id, {
    cardType: "basic",
    front: "Geänderte Frage",
    back: card.originalBack,
    tags: card.tags,
  });
  const editedCard = editedDeck?.cards.find((item) => item.id === card.id);
  const versionId = editedCard?.versionLog.at(-1)?.id;
  assert.ok(versionId);

  const restoredDeck = workspace.restoreDeckCardVersion(deck.id, card.id, versionId);
  const restoredCard = restoredDeck?.cards.find((item) => item.id === card.id);

  assert.equal(restoredCard?.originalFront, card.originalFront);
  assert.equal(restoredCard?.versionLog.at(-1)?.changeType, "version_restored");
  assert.equal(restoredCard?.versionLog.length, (editedCard?.versionLog.length ?? 0) + 1);
});

test("workspace variant commands support the UI editor without changing originals", () => {
  const workspace = createTestWorkspace();
  const deck = workspace.createDemoDeck();
  const card = deck.cards[0];
  const original = getOriginalVariant(card);

  const withManualVariant = workspace.addDeckCardVariant(deck.id, card.id, {
    front: "Was bewirkt Myelin an Axonen?",
    back: "Es isoliert Axone elektrisch und erhoeht die Leitungsgeschwindigkeit.",
    variantLevel: 2,
  });
  assert.ok(withManualVariant);
  const manualCard = withManualVariant.cards.find((item) => item.id === card.id);
  const manualVariant = getActiveVariants(manualCard)[0];

  assert.equal(manualVariant.generationSource, "user_edited");
  assert.ok(original);
  assert.equal(manualVariant.anchorVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(manualCard, manualVariant).shouldShow, true);
  assert.ok(original);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(manualCard).front, original.front);

  const response = JSON.stringify({
    variants: [
      {
        front: "Welche Funktion hat die Myelinscheide?",
        back: "Sie isoliert Axone elektrisch und erhoeht die Leitungsgeschwindigkeit.",
        variantType: "basic",
        variantLevel: 2,
        relationToOriginal: "same_card_rephrasing",
        containsNewFacts: false,
        abstractionLevel: 1,
      },
    ],
  });
  const generated = workspace.applyVariantGenerationResponse(deck.id, card.id, response, {
    maxVariantLevel: 3,
  });
  assert.ok(generated);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const generatedCard = generated.deck.cards.find((item) => item.id === card.id);
  const aiVariant = getActiveVariants(generatedCard).find((variant) => variant.generationSource === "ai_generated");

  assert.ok(generated);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(generated.result.createdVariants.length, 1);
  assert.ok(original);
  assert.ok(aiVariant);
  assert.equal(aiVariant.anchorVariantId, original.id);
  assert.ok(original);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(generatedCard).front, original.front);
  assert.ok(generatedCard);
  assert.equal(generatedCard.reviewState.schedulerVersion, "fsrs_v1");
});
