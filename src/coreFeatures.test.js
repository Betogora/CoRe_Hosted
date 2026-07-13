import assert from "node:assert/strict";
import test from "node:test";
import { generateCardsFromDocument } from "./aiOrchestrator.ts";
import { createLocalAccount, signInLocalAccount, signOutLocalAccount } from "./authModel.ts";
import { assertCommunityPrivacyPayload, copySharedDeckToLibrary, createCommunity, shareDeckToCommunity } from "./communityModel.js";
import { createCoreCard, createCoreDeck, createSourceDocument } from "./coreModel.ts";
import { chooseReviewCard, classifyCardEligibility, deactivateVariant, ensureVariantsForCard } from "./coreVariantService.ts";
import { createPortableExport, mergePortableExportIntoState, validatePortableExport } from "./dataPortability.ts";
import { answerDeckQuestion } from "./deckAssistant.ts";
import { buildDeckGraph, shouldRefreshDeckGraph } from "./deckGraph.js";
import { createCsvImportDeck, createTableImportDeck, createTextImportDeck } from "./importService.ts";
import { createLearningPlan } from "./learningPlan.js";
import { createAiJobLedger, createDeckLibraryModel } from "./libraryModel.ts";
import { resolveReviewShortcut } from "./reviewShortcuts.js";
import { createReviewSession, recordReviewRating, recordVariantFeedback } from "./reviewService.ts";
import { applyReviewRating } from "./scheduler.ts";

function matureCard() {
  return createCoreCard({
    source: "manual",
    cardType: "basic",
    originalFront: "Welche Funktion hat die Myelinscheide im Nervensystem?",
    originalBack: "Sie isoliert Axone elektrisch und beschleunigt die saltatorische Erregungsleitung.",
    originalTags: ["anatomie"],
    reviewState: {
      maturityXp: 132,
      repetitions: 4,
    },
  });
}

test("scheduler records four-button review state and maturity", () => {
  const next = applyReviewRating({ reviewableType: "card", reviewableId: "card_1", maturityXp: 118 }, "good", {
    now: "2026-07-01T08:00:00.000Z",
  });

  assert.equal(next.repetitions, 1);
  assert.equal(next.maturityXp, 130);
  assert.equal(next.maturityBand, "variant_ready");
  assert.match(next.dueAt, /^2026-/);
});

test("eligibility blocks vocabulary cards and allows mature text cards", () => {
  const vocab = createCoreCard({
    source: "manual",
    originalFront: "house",
    originalBack: "Haus",
    originalTags: ["vokabel"],
  });
  const eligible = classifyCardEligibility(matureCard(), { coreMode: "auto" });

  assert.equal(classifyCardEligibility(vocab, { coreMode: "auto" }).eligible, false);
  assert.equal(eligible.eligible, true);
  assert.ok(eligible.allowedTransforms.includes("rephrase"));
});

test("variant service creates anchored active rephrase variants with a small interface", () => {
  const card = matureCard();
  const result = ensureVariantsForCard(card, { coreMode: "auto", variantThresholdXp: 121 });

  assert.equal(result.generated.length, 1);
  assert.equal(result.card.variants[0].sourceCardId, card.id);
  assert.equal(result.card.variants[0].qualityStatus, "active");

  const disabled = deactivateVariant(result.card, result.card.variants[0].id);
  assert.equal(disabled.variants[0].qualityStatus, "disabled");
});

test("review session can choose a variant and records family plus variant state", () => {
  const deck = createCoreDeck({
    name: "Anatomie",
    source: "manual",
    cards: [matureCard()],
  });
  const started = createReviewSession(deck, { variantSession: true, now: "2026-07-01T08:00:00.000Z" });
  const item = started.session.items[0];

  assert.equal(item.reviewableType, "variant");
  assert.equal(item.sourceCardId, started.deck.cards[0].id);

  const reviewed = recordReviewRating(started.deck, item, "good", { now: "2026-07-01T08:01:00.000Z" });
  assert.equal(reviewed.deck.reviewEvents.length, 1);
  assert.equal(reviewed.deck.cards[0].reviewState.repetitions, 5);
  assert.equal(reviewed.deck.cards[0].variants[0].reviewState.repetitions, 1);

  const feedback = recordVariantFeedback(reviewed.deck, item, { action: "disable", now: "2026-07-01T08:02:00.000Z" });
  assert.equal(feedback.deck.cards[0].variants[0].qualityStatus, "disabled");
  assert.equal(feedback.deck.versionLog.some((entry) => entry.changeType === "variant_disabled"), true);
});

test("AI document generation returns validated draft cards with source anchors", () => {
  const document = createSourceDocument({
    fileName: "skript.txt",
    text: "Die Zellmembran trennt Innenraum und Aussenraum der Zelle. Sie ist selektiv permeabel.\n\nATP dient als kurzfristiger Energietraeger in vielen Stoffwechselprozessen.",
    textExtractionStatus: "success",
  });
  const result = generateCardsFromDocument({
    document,
    config: { subject: "Biologie", cardTypes: ["basic", "cloze"], cardCount: 2 },
  });

  assert.equal(result.validation.valid, true);
  assert.equal(result.job.status, "succeeded");
  assert.equal(result.draftDeck.cards.length, 2);
  assert.equal(result.draftDeck.cards[0].draftStatus, "draft");
  assert.ok(result.draftDeck.cards[0].sourceAnchors[0].textQuote);
});

test("community sharing copies deck content without review events", () => {
  const deck = createCoreDeck({
    name: "Shared",
    source: "manual",
    cards: [matureCard()],
    reviewEvents: [{ id: "review_1", rating: "good" }],
  });
  const community = createCommunity({ name: "Lerngruppe" });
  const shared = shareDeckToCommunity(community, deck);
  const copied = copySharedDeckToLibrary(deck);

  assert.equal(shared.community.sharedDecks.length, 1);
  assert.equal(assertCommunityPrivacyPayload(shared.community), true);
  assert.equal(copied.reviewEvents.length, 0);
  assert.equal(copied.visibility, "private");
});

test("deck graph builds topic and card nodes and honors refresh trigger", () => {
  const deck = createCoreDeck({
    name: "Graph Deck",
    source: "manual",
    cards: [matureCard()],
  });
  const graph = buildDeckGraph(deck);

  assert.equal(shouldRefreshDeckGraph(deck, null), true);
  assert.equal(graph.status, "ready");
  assert.ok(graph.nodes.some((node) => node.type === "topic"));
  assert.ok(graph.edges.length > 0);
  assert.equal(shouldRefreshDeckGraph({ ...deck, graph }, graph), false);
});

test("text, CSV and spreadsheet import create Core decks", () => {
  const textDeck = createTextImportDeck({
    deckName: "Text",
    text: "Was ist ATP?\n---\nEin Energietraeger.\n\nWas macht Myelin?\n---\nEs isoliert Axone.",
  });
  const csvDeck = createCsvImportDeck({
    deckName: "CSV",
    csv: "front,back,tags\nWas ist ATP?,Energietraeger,biochemie",
  });
  const spreadsheetDeck = createTableImportDeck({
    deckName: "Excel Paste",
    table: "front\tback\ttags\nNatriumkanal\tLeitet Natriumionen\tphysiologie",
  });

  assert.equal(textDeck.cardCount, 2);
  assert.equal(csvDeck.cardCount, 1);
  assert.equal(spreadsheetDeck.cardCount, 1);
  assert.equal(csvDeck.cards[0].originalTags[0], "biochemie");
  assert.equal(spreadsheetDeck.cards[0].meta.importFormat, "spreadsheet");
});

test("deck library model centralizes totals, filtering and AI job ledger shaping", () => {
  const deck = createCoreDeck({
    name: "Neuro Deck",
    source: "manual",
    cards: [
      matureCard(),
      createCoreCard({
        source: "manual",
        originalFront: "Deleted",
        originalBack: "Hidden",
        status: "deleted",
      }),
      createCoreCard({
        source: "manual",
        originalFront: "Draft",
        originalBack: "Hidden",
        draftStatus: "draft",
      }),
    ],
    aiJobs: [
      {
        id: "job_variant",
        jobType: "variant_generation",
        status: "succeeded",
        createdAt: "2026-07-01T08:00:00.000Z",
        resultRef: { generatedVariantIds: ["variant_1", "variant_2"] },
      },
    ],
  });
  const library = createDeckLibraryModel([deck], {
    query: "neuro",
    coreMode: "auto",
    selectedDeckId: deck.id,
    now: "2026-07-01T08:00:00.000Z",
  });
  const ledger = createAiJobLedger({
    decks: [deck],
    jobs: [
      {
        id: "job_global",
        jobType: "card_generation",
        status: "failed",
        createdAt: "2026-07-01T09:00:00.000Z",
        resultRef: { cardCount: 3 },
      },
    ],
  });

  assert.equal(library.filteredRows.length, 1);
  assert.equal(library.totals.totalCards, 1);
  assert.equal(library.selectedRow.cardRows.length, 1);
  assert.match(library.selectedRow.cardRows[0].frontPreview, /Myelinscheide/);
  assert.equal(ledger.total, 2);
  assert.equal(ledger.succeeded, 1);
  assert.equal(ledger.failed, 1);
  assert.equal(ledger.jobs[0].scopeLabel, "global");
  assert.equal(ledger.jobs[1].resultLabel, "2 Varianten");
});

test("review shortcut resolver reveals, grades and ignores editing targets", () => {
  assert.deepEqual(resolveReviewShortcut({ key: "Enter" }, { hasCurrent: true, showAnswer: false }), { type: "reveal" });
  assert.deepEqual(resolveReviewShortcut({ key: "3" }, { hasCurrent: true, showAnswer: true }), { type: "rate", rating: "good" });
  assert.deepEqual(resolveReviewShortcut({ key: "Escape" }, { hasCurrent: true, showAnswer: true }), { type: "exit" });
  assert.equal(resolveReviewShortcut({ key: "1", target: { tagName: "textarea" } }, { hasCurrent: true, showAnswer: true }), null);
});

test("review chooser returns original when core mode is off", () => {
  const choice = chooseReviewCard(matureCard(), { coreMode: "off" }, { variantSession: true });

  assert.equal(choice.reviewable.reviewableType, "card");
  assert.equal(choice.generated.length, 0);
});

test("local account module creates sessions without exposing plaintext passwords", () => {
  const profile = createLocalAccount({
    displayName: "Noemi",
    email: "Noemi@example.test",
    password: "supersecret",
  });
  const signedIn = signInLocalAccount(profile, { email: "noemi@example.test", password: "supersecret" });
  const signedOut = signOutLocalAccount(signedIn);

  assert.equal(profile.email, "noemi@example.test");
  assert.equal(profile.account.status, "signed-in");
  assert.equal(typeof profile.account.passwordVerifier, "string");
  assert.equal(JSON.stringify(profile).includes("supersecret"), false);
  assert.equal(signedOut.account.status, "signed-out");
});

test("deck assistant answers only with card citations", () => {
  const deck = createCoreDeck({
    name: "Neuro",
    source: "manual",
    cards: [matureCard()],
  });
  const answer = answerDeckQuestion({ decks: [deck], question: "Was macht die Myelinscheide?" });
  const missing = answerDeckQuestion({ decks: [deck], question: "Photosynthese Chlorophyll Lichtreaktion" });

  assert.equal(answer.warnings.length, 0);
  assert.equal(answer.citations.length > 0, true);
  assert.equal(answer.citations[0].cardId, deck.cards[0].id);
  assert.equal(missing.citations.length, 0);
  assert.match(missing.answer, /keine belastbare Quelle/);
});

test("learning plan distributes due reviews, new cards and variant days", () => {
  const deck = createCoreDeck({
    name: "Plan Deck",
    source: "manual",
    cards: [matureCard()],
  });
  const plan = createLearningPlan({
    decks: [deck],
    targetDate: "2026-07-05",
    dailyMinutes: 30,
    newCardsPerDay: 4,
    now: "2026-07-01T08:00:00.000Z",
  });

  assert.equal(plan.totals.days, 5);
  assert.equal(plan.days.length, 5);
  assert.equal(plan.days.some((day) => day.variantReviews > 0), true);
  assert.equal(plan.days[0].focusDeckId, deck.id);
});

test("portable export validates and merges without password verifier", () => {
  const state = {
    profile: createLocalAccount({ email: "export@example.test", password: "supersecret" }),
    decks: [createCoreDeck({ name: "Export Deck", source: "manual", cards: [matureCard()] })],
    communities: [],
    aiJobs: [],
    documents: [],
  };
  const exported = createPortableExport(state, "2026-07-01T08:00:00.000Z");
  const validation = validatePortableExport(exported);
  const merged = mergePortableExportIntoState({ ...state, decks: [] }, exported);

  assert.equal(validation.valid, true);
  assert.equal(exported.profile.account.passwordVerifier, undefined);
  assert.equal(merged.decks.length, 1);
});
