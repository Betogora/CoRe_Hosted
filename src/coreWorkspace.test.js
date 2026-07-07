import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument, getActiveVariants, getAnswerSideAnchorMiniCard, getOriginalVariant } from "./coreModel.js";
import { createCoreRepository } from "./coreRepository.js";
import { createCoreWorkspace, createDemoAnatomyDeck } from "./coreWorkspace.js";

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

function createTestWorkspace() {
  return createCoreWorkspace(createCoreRepository(createMemoryStorage()));
}

function parsedApkgFixture(overrides = {}) {
  const decks = overrides.decks ?? [{ id: "1", name: "Workspace APKG" }];
  const notes = overrides.notes ?? [{ id: 10, mid: 99, tags: "apkg", flds: "Workspace front?\u001fWorkspace back." }];
  const cards = overrides.cards ?? [{ id: 20, nid: 10, did: 1, ord: 0 }];

  return {
    file: { name: "workspace.apkg", size: 1024 },
    decks,
    colRows: [
      {
        decks: JSON.stringify(Object.fromEntries(decks.map((deck) => [deck.id, { id: deck.id, name: deck.name }]))),
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

test("workspace APKG commands dry-run and commit through normalized import", async () => {
  const workspace = createTestWorkspace();
  const dryRun = await workspace.dryRunApkgImport(parsedApkgFixture());
  const beforeCommit = workspace.getState().decks.length;
  const committed = await workspace.commitApkgImport(parsedApkgFixture());

  assert.equal(dryRun.deck, null);
  assert.equal(dryRun.report.createdLearningItems, 1);
  assert.equal(dryRun.report.apkg.detectedCards, 1);
  assert.equal(beforeCommit, 0);
  assert.equal(committed.deck.source, "anki-apkg");
  assert.equal(committed.deck.cards.length, 1);
  assert.equal(committed.deck.cards[0].sourceType, "anki_import");
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
  const appended = updated.cards.at(-1);

  assert.equal(updated.cards.length, deck.cards.length + 1);
  assert.equal(appended.kind, "free-text");
  assert.equal(appended.sourceAnchors[0].targetField, "back");
  assert.equal(updated.sourceDocuments[0].fileName, "quelle.txt");
});

test("workspace graph and community commands hide app orchestration", () => {
  const workspace = createTestWorkspace();
  const demo = workspace.createDemoDeck();
  const graphed = workspace.ensureDeckGraph(demo.id);
  const shared = workspace.shareDeckToDefaultCommunity(demo.id);

  assert.equal(graphed.graph.status, "ready");
  assert.equal(shared.community.sharedDecks.length, 1);
  assert.equal(shared.sharedRef.deckId, demo.id);
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

  const edited = workspace.saveDeckCardContent(deck.id, cardId, {
    originalFront: "Welche Funktion hat Myelin?",
    originalBack: "Myelin isoliert Axone und erhoeht die Leitungsgeschwindigkeit.",
    originalTags: "anatomie nerven",
    kind: "basic",
  });
  const editedCard = edited.cards.find((card) => card.id === cardId);
  const modeChanged = workspace.setDeckCoreMode(deck.id, "off");
  const deleted = workspace.deleteDeckCard(deck.id, cardId);
  const deletedCard = deleted.cards.find((card) => card.id === cardId);

  assert.equal(editedCard.originalFront, "Welche Funktion hat Myelin?");
  assert.equal(editedCard.immutableOriginal.front, deck.cards[0].immutableOriginal.front);
  assert.equal(editedCard.versionLog.some((entry) => entry.changeType === "content_updated"), true);
  assert.equal(modeChanged.deckSettings.coreMode, "off");
  assert.equal(deletedCard.status, "deleted");
  assert.equal(deletedCard.versionLog.some((entry) => entry.changeType === "deleted"), true);
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
  const manualCard = withManualVariant.cards.find((item) => item.id === card.id);
  const manualVariant = getActiveVariants(manualCard)[0];

  assert.equal(manualVariant.generationSource, "user_edited");
  assert.equal(manualVariant.anchorVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(manualCard, manualVariant).shouldShow, true);
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
  const generatedCard = generated.deck.cards.find((item) => item.id === card.id);
  const aiVariant = getActiveVariants(generatedCard).find((variant) => variant.generationSource === "ai_generated");

  assert.equal(generated.result.createdVariants.length, 1);
  assert.equal(aiVariant.anchorVariantId, original.id);
  assert.equal(getOriginalVariant(generatedCard).front, original.front);
  assert.equal(generatedCard.reviewState.schedulerVersion, "fsrs_v1");
});
