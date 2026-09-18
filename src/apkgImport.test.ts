import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  commitApkgImport,
  createApkgReportDetails,
  LOCAL_APKG_MAX_BYTES,
  mapAnkiApkgToNormalizedDeck,
  mergeImportedDeck,
  parseApkgToNormalizedImport,
  prepareApkgWorkerResult,
  validateApkgFile,
} from "./apkgImportInternal.ts";
import { renderLearningItemPresentation } from "./cardPresentation.ts";
import { createBasicLearningItem, createCardVariant, createCoreDeck, createReviewState } from "./coreModel.ts";
import { projectLearningItemContent } from "./coreModel/learningItemContent.ts";
import { importNormalizedDeck } from "./importService.ts";

function parsedApkgFixture({ modelType = 0, fields = [{ name: "Front" }, { name: "Back" }], templates = [{ name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" }], noteFields = "Front?\u001fBack.", cards = [{ id: 20, nid: 10, did: 1, ord: 0 }], decks = [{ id: "1", name: "Fixture Deck" }] }: any = {}) {
  return {
    file: { name: "fixture.apkg", size: 4096 },
    decks,
    colRows: [{
      decks: JSON.stringify(Object.fromEntries(decks.map((deck: any) => [String(deck.id), deck]))),
      models: JSON.stringify({ 99: { id: "99", name: "Fixture", type: modelType, flds: fields, tmpls: templates } }),
    }],
    notes: [{ id: 10, guid: "guid-10", mid: 99, tags: "tag", flds: noteFields, mod: 1_700_000_000 }],
    cards,
    reviewHistory: [],
    mediaBundle: { mediaMap: {}, mediaFiles: [], manifest: { format: "none", assets: [], missingAssets: [] } },
  };
}

function importImageFrontFixture() {
  const { normalizedDeck } = mapAnkiApkgToNormalizedDeck(parsedApkgFixture({
    fields: [{ name: "Vorderseite" }, { name: "Rückseite" }],
    templates: [{ name: "Karte 1", ord: 0, qfmt: "{{Vorderseite}}", afmt: "{{FrontSide}}<hr id=answer>{{Rückseite}}" }],
    noteFields: '<img src="person.jpg">\u001fAntwort',
  }));
  return importNormalizedDeck(normalizedDeck, { dryRun: false });
}

test("validiert Dateityp und Browsergrößenlimit", () => {
  assert.equal(validateApkgFile({ name: "deck.apkg", size: LOCAL_APKG_MAX_BYTES }).valid, true);
  assert.equal(validateApkgFile({ name: "deck.zip", size: 1 }).valid, false);
  assert.equal(validateApkgFile({ name: "deck.apkg", size: LOCAL_APKG_MAX_BYTES + 1 }).valid, false);
});

test("jede echte Anki-Karte wird als eigenständige CoRe-Karte importiert", () => {
  const { normalizedDeck } = mapAnkiApkgToNormalizedDeck(parsedApkgFixture({
    templates: [
      { name: "Vorwärts", ord: 0, qfmt: "{{Front}}", afmt: "{{Back}}" },
      { name: "Rückwärts", ord: 1, qfmt: "{{Back}}", afmt: "{{Front}}" },
    ],
    cards: [{ id: 20, nid: 10, did: 1, ord: 0 }, { id: 21, nid: 10, did: 1, ord: 1 }],
  }));
  const deck = importNormalizedDeck(normalizedDeck, { dryRun: false }).deck;
  assert.equal(deck?.cards.length, 2);
  assert.deepEqual(deck?.cards.map((card: any) => card.sourceCardId), ["20", "21"]);
  assert.equal(deck?.cards.every((card: any) => card.variants.length === 0), true);
  assert.notEqual(deck?.cards[0].reviewState.id, deck?.cards[1].reviewState.id);
});

test("APKG-Import ordnet eine reine Bild-Vorderseite dem echten Anki-Template zu", () => {
  const imported = importImageFrontFixture();
  const card = imported.deck.cards[0];
  const definition = imported.commitGraph.noteTypeDefinitions.find((candidate: any) => candidate.id === card.noteTypeDefinitionId);
  const question = renderLearningItemPresentation({ item: card, definition, side: "question", surface: "review", theme: "light" });
  const answer = renderLearningItemPresentation({ item: card, definition, side: "answer", surface: "review", theme: "light" });

  assert.deepEqual(card.projection, { kind: "template", recipeId: definition.recipes[0].id, instanceKey: "default" });
  assert.notEqual(card.originalFront, card.originalBack);
  assert.match(question.srcdoc, /person\.jpg/);
  assert.doesNotMatch(question.srcdoc, /Antwort/);
  assert.equal(answer.accessibleText, "Antwort");
  assert.doesNotMatch(answer.srcdoc, /person\.jpg/);
});

test("APKG-Import projiziert vorhandene Karten mit Anki-Anforderung none getrennt", () => {
  const parsed = parsedApkgFixture({
    fields: [{ name: "Vorderseite" }, { name: "Rückseite" }],
    templates: [{ name: "Karte 1", ord: 0, qfmt: "{{Vorderseite}}", afmt: "{{Rückseite}}" }],
    noteFields: "Nur vorne\u001fNur hinten",
  });
  const models = JSON.parse(parsed.colRows[0].models);
  models[99].req = [[0, "none", []]];
  parsed.colRows[0].models = JSON.stringify(models);

  const { normalizedDeck } = mapAnkiApkgToNormalizedDeck(parsed);
  const imported = importNormalizedDeck(normalizedDeck, { dryRun: false });
  const card = imported.deck.cards[0];

  assert.equal(card.originalFront, "Nur vorne");
  assert.equal(card.originalBack, "Nur hinten");
  assert.notEqual(card.originalFront, card.originalBack);
  assert.equal(card.projection.instanceKey, "default");
});

test("APKG-Bericht zählt und erkennt eigenständige Karten statt Notizen", () => {
  const parsed = parsedApkgFixture({
    templates: [
      { name: "Vorwärts", ord: 0, qfmt: "{{Front}}", afmt: "{{Back}}" },
      { name: "Rückwärts", ord: 1, qfmt: "{{Back}}", afmt: "{{Front}}" },
    ],
    cards: [{ id: 20, nid: 10, did: 1, ord: 0 }, { id: 21, nid: 10, did: 1, ord: 1 }],
  });
  const { normalizedDeck } = mapAnkiApkgToNormalizedDeck(parsed);
  const existing = createCoreDeck({
    id: "existing",
    source: "anki-apkg",
    cards: [createBasicLearningItem("existing", "Lokal geändert", "Andere Antwort", { id: "local-20", source: "anki-apkg", sourceType: "anki_import", sourceCardId: "20" })],
  });

  const report = createApkgReportDetails(parsed, normalizedDeck, [existing], { skipped: [], duplicates: [] });
  assert.equal(report.createdCoreItems, 2);
  assert.deepEqual(report.reimport, { newItems: 1, matchedItems: 1, skippedItems: 0 });
});

test("jede Anki-Cloze-Gruppe wird eigenständig importiert", () => {
  const { normalizedDeck } = mapAnkiApkgToNormalizedDeck(parsedApkgFixture({
    modelType: 1,
    fields: [{ name: "Text" }, { name: "Extra" }],
    templates: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<hr>{{Extra}}" }],
    noteFields: "{{c1::Berlin}} und {{c2::Paris}}\u001fEuropa",
    cards: [{ id: 20, nid: 10, did: 1, ord: 0 }, { id: 21, nid: 10, did: 1, ord: 1 }],
  }));
  const deck = importNormalizedDeck(normalizedDeck, { dryRun: false }).deck;
  assert.equal(deck?.cards.length, 2);
  assert.deepEqual(deck?.cards.map((card: any) => card.sourceCardId), ["20", "21"]);
});

test("APKG hierarchy flattens source level nine and deeper while preserving source paths and tags", async () => {
  const segments = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const decks = segments.map((_, index) => ({ id: String(index + 1), name: segments.slice(0, index + 1).join("::") }));
  const parsed = parsedApkgFixture({
    decks,
    cards: [{ id: 20, nid: 10, did: "10", ord: 0 }],
  });
  const first = prepareApkgWorkerResult(await parseApkgToNormalizedImport(parsed));
  const second = prepareApkgWorkerResult(await parseApkgToNormalizedImport(parsed));
  const importedDecks = first.commitGraph.decks;
  const bySourcePath = new Map(importedDecks.map((deck: any) => [deck.importMeta.sourceMetadata.ankiDeckPath, deck]));
  const g = bySourcePath.get("A::B::C::D::E::F::G") as any;
  const h = bySourcePath.get("A::B::C::D::E::F::G::H") as any;
  const i = bySourcePath.get("A::B::C::D::E::F::G::H::I") as any;
  const j = bySourcePath.get("A::B::C::D::E::F::G::H::I::J") as any;

  assert.deepEqual([h.parentDeckId, i.parentDeckId, j.parentDeckId], [g.id, g.id, g.id]);
  assert.deepEqual(h.hierarchyPath, ["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.deepEqual(i.hierarchyPath, ["A", "B", "C", "D", "E", "F", "G", "I"]);
  assert.deepEqual(j.hierarchyPath, ["A", "B", "C", "D", "E", "F", "G", "J"]);
  assert.equal(j.importMeta.sourceMetadata.ankiDeckDepth, 9);
  assert.equal(j.importMeta.sourceMetadata.ankiParentPath, "A::B::C::D::E::F::G::H::I");
  assert.equal(first.report.warnings.filter((warning: string) => warning.includes("ab Ebene 9 auf Ebene 8 abgeflacht")).length, 1);
  assert.deepEqual(j.cards[0].tags, ["tag"]);
  assert.deepEqual(second.commitGraph.decks.map((deck: any) => deck.id), importedDecks.map((deck: any) => deck.id));
});

test("Reimport ersetzt nur bei neuerer Anki-Änderungszeit den Inhalt und erhält den Lernstatus", () => {
  const reviewState = createReviewState({ state: "review", repetitions: 12, stability: 30, dueAt: "2026-09-01T04:00:00.000Z" });
  const existingCard = createBasicLearningItem("existing", "Alt", "Antwort", { id: "local", source: "anki-apkg", sourceType: "anki_import", sourceCardId: "20", reviewState, status: "suspended", meta: { ankiModifiedAt: "2026-08-20T10:00:00.000Z" } });
  const incomingCard = createBasicLearningItem("incoming", "Neu", "Antwort", { id: "remote", source: "anki-apkg", sourceType: "anki_import", sourceCardId: "20", meta: { ankiModifiedAt: "2026-08-21T10:00:00.000Z" } });
  const existing = createCoreDeck({ id: "existing", source: "anki-apkg", originalDeckId: "1", cards: [existingCard] });
  const incoming = createCoreDeck({ id: "incoming", source: "anki-apkg", originalDeckId: "1", cards: [incomingCard] });
  const merged = mergeImportedDeck(incoming, [existing]);
  assert.equal(merged.cards[0].id, "local");
  assert.equal(merged.cards[0].originalFront, "Neu");
  assert.equal(merged.cards[0].reviewState.dueAt, reviewState.dueAt);
  assert.equal(merged.cards[0].reviewState.repetitions, reviewState.repetitions);
  assert.equal(merged.cards[0].reviewState.stability, reviewState.stability);
  assert.equal(merged.cards[0].status, "suspended");

  const older = mergeImportedDeck({ ...incoming, cards: [{ ...incomingCard, originalFront: "Zu alt", meta: { ankiModifiedAt: "2026-08-19T10:00:00.000Z" } }] }, [merged]);
  assert.equal(older.cards[0].originalFront, "Neu");
});

test("Reimport repariert den unberührten alten Feld-Fallback bei gleichem Anki-Zeitstempel", () => {
  const imported = importImageFrontFixture();
  const incomingDeck = imported.deck;
  const incomingCard = incomingDeck.cards[0];
  const definition = imported.commitGraph.noteTypeDefinitions.find((candidate: any) => candidate.id === incomingCard.noteTypeDefinitionId);
  const legacyProjection = projectLearningItemContent({
    document: incomingCard.contentDocument,
    definition: {
      ...definition,
      recipes: definition.recipes.map((recipe: any) => ({
        ...recipe,
        generationRule: { kind: "field", fieldId: "missing-field", present: true },
      })),
    },
  }).cards[0];
  const reviewState = createReviewState({ state: "review", repetitions: 9, stability: 21, dueAt: "2026-10-01T04:00:00.000Z" });
  const variant = createCardVariant({ id: "variant-local", cardId: "local-card", front: "Variante", back: "Antwortvariante" });
  const existingCard = {
    ...incomingCard,
    id: "local-card",
    originalFront: legacyProjection.front,
    originalBack: legacyProjection.back,
    canonicalQuestion: legacyProjection.front,
    canonicalAnswer: legacyProjection.back,
    projection: legacyProjection.projection,
    contentRevision: 1,
    reviewState,
    status: "suspended",
    variants: [variant],
    meta: { ...incomingCard.meta, marked: true },
  };
  const existingDeck = createCoreDeck({ ...incomingDeck, id: "existing-deck", cards: [existingCard] });
  const repaired = mergeImportedDeck(incomingDeck, [existingDeck]).cards[0];

  assert.equal(repaired.id, "local-card");
  assert.match(repaired.originalFront, /person\.jpg/);
  assert.doesNotMatch(repaired.originalFront, /Antwort/);
  assert.match(repaired.originalBack, /Antwort/);
  assert.notEqual(repaired.originalFront, repaired.originalBack);
  assert.equal(repaired.reviewState.dueAt, reviewState.dueAt);
  assert.equal(repaired.reviewState.repetitions, reviewState.repetitions);
  assert.equal(repaired.status, "suspended");
  assert.deepEqual(repaired.variants, [variant]);
  assert.equal(repaired.meta.marked, true);
});

test("Reimport überschreibt keinen lokal bearbeiteten alten Feld-Fallback", () => {
  const imported = importImageFrontFixture();
  const incomingDeck = imported.deck;
  const incomingCard = incomingDeck.cards[0];
  const existingCard = {
    ...incomingCard,
    id: "local-card",
    originalFront: "Lokal bearbeitete Vorderseite",
    originalBack: "Lokal bearbeitete Rückseite",
    canonicalQuestion: "Lokal bearbeitete Vorderseite",
    canonicalAnswer: "Lokal bearbeitete Rückseite",
    projection: { kind: "template" as const, recipeId: `${incomingCard.noteTypeDefinitionId}-forward`, instanceKey: "fallback" },
    contentRevision: 2,
  };
  const existingDeck = createCoreDeck({ ...incomingDeck, id: "existing-deck", cards: [existingCard] });
  const preserved = mergeImportedDeck(incomingDeck, [existingDeck]).cards[0];

  assert.equal(preserved.id, "local-card");
  assert.equal(preserved.originalFront, "Lokal bearbeitete Vorderseite");
  assert.equal(preserved.originalBack, "Lokal bearbeitete Rückseite");
});

test("die echte World-Capitals-APKG bleibt importierbar", async () => {
  const bytes = await readFile(new URL("../fixtures/apkg/world-capitals.apkg", import.meta.url));
  const file = { name: "world-capitals.apkg", size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const prepared = prepareApkgWorkerResult(await parseApkgToNormalizedImport(file));
  const committed = commitApkgImport(prepared);
  assert.equal(committed.decks.length > 0, true);
  assert.equal(committed.decks.flatMap((deck: any) => deck.cards).every((card: any) => card.sourceCardId && card.variants.length === 0), true);
});
