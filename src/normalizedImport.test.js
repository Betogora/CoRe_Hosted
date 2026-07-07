import assert from "node:assert/strict";
import test from "node:test";
import {
  createBasicLearningItem,
  createCoreDeck,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getOriginalVariant,
} from "./coreModel.js";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.js";
import { createCoreRepository } from "./coreRepository.js";
import { createCoreWorkspace } from "./coreWorkspace.js";
import {
  createImportFingerprint,
  findDuplicateLearningItem,
  importCsvAsNormalizedDeck,
  importJsonAsNormalizedDeck,
  importNormalizedDeck,
  normalizeImportDeck,
  normalizeImportItem,
  normalizeImportVariant,
  normalizeTextForFingerprint,
  parseCsvToNormalizedImport,
  parseJsonToNormalizedImport,
  parseTextToNormalizedImport,
} from "./importService.js";
import { answerVariant, getNextReviewItem } from "./reviewService.js";

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
    snapshot() {
      return JSON.stringify([...store.entries()]);
    },
  };
}

function sampleNormalizedDeck() {
  return {
    title: "Normalized Import",
    description: "Dry-run deck",
    sourceType: "json_import",
    tags: ["medizin", "import"],
    items: [
      {
        canonicalQuestion: "Was ist MRSA?",
        canonicalAnswer: "Methicillin-resistenter Staphylococcus aureus.",
        tags: "mikro infektion",
        sourceType: "json_import",
        sourceExternalId: "note-1",
        variants: [
          {
            front: "Wofuer steht MRSA?",
            back: "Methicillin-resistenter Staphylococcus aureus.",
            variantType: "basic",
            variantLevel: 2,
            generationSource: "imported",
          },
        ],
      },
      {
        canonicalQuestion: "Was bedeutet Kolonisation?",
        canonicalAnswer: "Besiedlung ohne zwingende Erkrankung.",
        sourceExternalId: "note-2",
        variants: [
          {
            front: "Wie unterscheidet sich Kolonisation von Infektion?",
            back: "Kolonisation bedeutet Besiedlung; Infektion bedeutet Erkrankungsreaktion.",
            variantType: "case",
            variantLevel: 3,
          },
        ],
      },
    ],
  };
}

test("normalized import format normalizes decks, items and variants", () => {
  const deckResult = normalizeImportDeck(sampleNormalizedDeck());
  const itemResult = normalizeImportItem({
    canonicalQuestion: "  Frage? ",
    canonicalAnswer: " Antwort. ",
    tags: "a, b #c",
    variants: [{ front: " Variante? ", back: " Antwort. ", variantLevel: 9, generationSource: "unknown" }],
  });
  const variantResult = normalizeImportVariant({ front: "F", back: "B" });
  const invalidItem = normalizeImportItem({ canonicalQuestion: "", canonicalAnswer: "" });

  assert.equal(deckResult.errors.length, 0);
  assert.equal(deckResult.normalizedDeck.title, "Normalized Import");
  assert.equal(deckResult.normalizedDeck.items.length, 2);
  assert.deepEqual(itemResult.item.tags, ["a", "b", "c"]);
  assert.equal(itemResult.item.variants.some((variant) => variant.isOriginal), true);
  assert.equal(itemResult.item.variants.find((variant) => !variant.isOriginal).anchorToOriginal, true);
  assert.equal(itemResult.item.variants.find((variant) => !variant.isOriginal).variantLevel, 3);
  assert.equal(variantResult.variant.variantType, "basic");
  assert.equal(variantResult.variant.variantLevel, 2);
  assert.equal(variantResult.variant.generationSource, "imported");
  assert.equal(invalidItem.errors.length >= 2, true);
});

test("dry run returns a report and does not create core objects or mutate storage", () => {
  const storage = createMemoryStorage();
  const workspace = createCoreWorkspace(createCoreRepository(storage));
  const beforeStorage = storage.snapshot();
  const beforeDeckCount = workspace.getState().decks.length;
  const result = workspace.dryRunNormalizedImport(sampleNormalizedDeck());

  assert.equal(result.deck, null);
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.createdLearningItems, 2);
  assert.equal(result.report.createdVariants, 2);
  assert.equal(result.report.previewItems.length, 2);
  assert.equal(workspace.getState().decks.length, beforeDeckCount);
  assert.equal(storage.snapshot(), beforeStorage);
});

test("commit normalized import creates FSRS learning items and anchored imported variants", () => {
  const result = importNormalizedDeck(sampleNormalizedDeck(), { dryRun: false });
  const deck = result.deck;
  const imported = deck.cards[0];
  const original = getOriginalVariant(imported);
  const variant = getActiveVariants(imported)[0];

  assert.equal(deck.name, "Normalized Import");
  assert.equal(deck.source, "json-import");
  assert.equal(deck.cards.length, 2);
  assert.equal(imported.reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(imported.reviewState.state, "new");
  assert.equal(imported.reviewState.reps, 0);
  assert.equal(getLearningItemMaturity(imported).stage, "new");
  assert.equal(getVariantGenerationRecommendation(imported).shouldSuggest, false);
  assert.equal(original.isOriginal, true);
  assert.equal(variant.generationSource, "imported");
  assert.equal(variant.anchorVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(imported, variant).shouldShow, true);
  assert.equal(getNextReviewItem(deck)?.learningItemId, imported.id);
});

test("duplicate detection supports source ids, fingerprints and merge strategies", () => {
  const existingItem = createBasicLearningItem("deck_existing", "Was ist MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
    sourceType: "json_import",
    sourceExternalId: "note-1",
  });
  const existingDeck = createCoreDeck({ id: "deck_existing", name: "Bestehend", source: "json-import", cards: [existingItem] });
  const normalizedItem = normalizeImportItem(sampleNormalizedDeck().items[0]).item;
  const duplicate = findDuplicateLearningItem(existingDeck, normalizedItem);
  const skipped = importNormalizedDeck(sampleNormalizedDeck(), {
    existingDecks: [existingDeck],
    mergeStrategy: "skip_duplicates",
  });
  const createNew = importNormalizedDeck(sampleNormalizedDeck(), {
    existingDecks: [existingDeck],
    mergeStrategy: "create_new",
  });
  const updateExisting = importNormalizedDeck(sampleNormalizedDeck(), {
    existingDecks: [existingDeck],
    mergeStrategy: "update_existing",
  });

  assert.equal(normalizeTextForFingerprint("<b>Ärzte</b>  Test"), "ärzte test");
  assert.equal(createImportFingerprint(normalizedItem).startsWith("importfp_"), true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, "sourceExternalId");
  assert.equal(skipped.report.duplicates.length, 1);
  assert.equal(skipped.report.skipped.length, 1);
  assert.equal(skipped.deck.cards.length, 1);
  assert.equal(createNew.report.warnings.some((warning) => warning.includes("moegliche Dublette")), true);
  assert.equal(createNew.deck.cards.length, 2);
  assert.equal(updateExisting.deck.cards.length, 1);
  assert.equal(updateExisting.report.warnings.some((warning) => warning.includes("update_existing")), true);
});

test("text, CSV and JSON parsers produce normalized decks and clear reports", () => {
  const textParsed = parseTextToNormalizedImport({
    deckName: "Text",
    text: "Was ist ATP?\n---\nEin Energietraeger.",
    tags: ["bio"],
  });
  const csvParsed = parseCsvToNormalizedImport({
    deckName: "CSV",
    csv: "question,answer,tags,variantLevel,variantType\nWas ist ATP?,Ein Energietraeger.,bio,1,basic\nLeer,,x",
  });
  const csvImport = importCsvAsNormalizedDeck({
    deckName: "CSV",
    csv: "front,back,tags\nA?,B.,tag",
  });
  const jsonImport = importJsonAsNormalizedDeck(JSON.stringify(sampleNormalizedDeck()));
  const invalidJson = parseJsonToNormalizedImport("{no-json");

  assert.equal(textParsed.normalizedDeck.items.length, 1);
  assert.equal(textParsed.normalizedDeck.sourceType, "text_import");
  assert.equal(csvParsed.normalizedDeck.items.length, 1);
  assert.equal(csvParsed.warnings.length, 1);
  assert.equal(csvImport.deck.cards.length, 1);
  assert.equal(csvImport.deck.cards[0].sourceType, "csv_import");
  assert.equal(jsonImport.deck.cards.length, 2);
  assert.equal(invalidJson.errors.length, 1);
});

test("imported variants review through central item state and fallback", () => {
  const result = importNormalizedDeck({
    title: "Fallback Import",
    sourceType: "json_import",
    items: [
      {
        canonicalQuestion: "Was ist MRSA?",
        canonicalAnswer: "Methicillin-resistenter Staphylococcus aureus.",
        variants: [
          { front: "Level 1 MRSA?", back: "Methicillin-resistenter Staphylococcus aureus.", variantLevel: 1 },
          { front: "Level 2 MRSA?", back: "Methicillin-resistenter Staphylococcus aureus.", variantLevel: 2 },
          { front: "Level 3 MRSA?", back: "Methicillin-resistenter Staphylococcus aureus.", variantLevel: 3 },
        ],
      },
    ],
  });
  const item = result.deck.cards[0];
  const variants = getActiveVariants(item);
  const level2 = variants.find((variant) => variant.variantLevel === 2);
  const level3 = variants.find((variant) => variant.variantLevel === 3);
  const failed = answerVariant(result.deck, item.id, level3.id, "again", {
    now: "2026-07-07T10:00:00.000Z",
  });
  const updatedItem = failed.deck.cards[0];
  const updatedLevel3 = getActiveVariants(updatedItem).find((variant) => variant.id === level3.id);
  const next = getNextReviewItem(failed.deck, { now: "2026-07-07T10:00:00.000Z" });

  assert.equal(updatedItem.reviewState.lastRating, "again");
  assert.equal(updatedItem.reviewState.fallbackUntilCorrect, true);
  assert.equal(updatedItem.reviewState.forcedVariantId, level2.id);
  assert.equal(updatedLevel3.performance.wrongCount, 1);
  assert.equal(failed.deck.reviewEvents.length, 1);
  assert.equal(next.variant.id, level2.id);
  assert.equal(next.fallbackInfo.active, true);
});

test("workspace commit normalized import mutates state and dry run does not", () => {
  const workspace = createCoreWorkspace(createCoreRepository(createMemoryStorage()));
  const dryRun = workspace.dryRunNormalizedImport(sampleNormalizedDeck());
  const beforeCommit = workspace.getState().decks.length;
  const committed = workspace.commitNormalizedImport(sampleNormalizedDeck());
  const textDryRun = workspace.importTextDeck({ deckName: "Text", text: "Front\n---\nBack" }, { dryRun: true });

  assert.equal(dryRun.report.createdLearningItems, 2);
  assert.equal(beforeCommit, 0);
  assert.equal(committed.deck.cards.length, 2);
  assert.equal(workspace.getState().decks.length, 1);
  assert.equal(workspace.getState().decks[0].cards[0].reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(getNextReviewItem(workspace.getState().decks[0]).learningItemId, workspace.getState().decks[0].cards[0].id);
  assert.equal(textDryRun.deck, null);
  assert.equal(workspace.getState().decks.length, 1);
});
