import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";
import { answerDeckQuestion, answerDeckQuestionWithServer } from "./deckAssistant.ts";

function createMyelinDeck() {
  return createCoreDeck({
    name: "Neuro",
    source: "manual",
    cards: [
      createCoreCard({
        source: "manual",
        cardType: "basic",
        originalFront: "Welche Funktion hat die Myelinscheide im Nervensystem?",
        originalBack: "Sie isoliert Axone elektrisch und beschleunigt die saltatorische Erregungsleitung.",
        originalTags: ["anatomie"],
      }),
    ],
  });
}

test("deck assistant keeps the local source-bound refusal", () => {
  const exchange = answerDeckQuestion({
    decks: [createMyelinDeck()],
    question: "Welche KI bist du?",
  });

  assert.equal(exchange.citations.length, 0);
  assert.match(exchange.answer, /keine belastbare Quelle/);
});

test("deck assistant does not call the server without local evidence in source-bound mode", async () => {
  let fetchCalls = 0;
  const result = await answerDeckQuestionWithServer({
    decks: [createMyelinDeck()],
    question: "Photosynthese Chlorophyll Lichtreaktion",
    sourceBound: true,
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ answer: "Darf nicht aufgerufen werden." }) };
    },
  });

  assert.equal(result.usedServer, false);
  assert.equal(result.fallbackReason, "no-evidence");
  assert.equal(result.exchange.citations.length, 0);
  assert.equal(fetchCalls, 0);
});

test("deck assistant calls the server without local evidence when source binding is off", async () => {
  let fetchCalls = 0;
  const result = await answerDeckQuestionWithServer({
    decks: [createMyelinDeck()],
    question: "Welche KI bist du?",
    sourceBound: false,
    fetchImpl: async (_endpoint, options) => {
      fetchCalls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.sourceBound, false);
      assert.deepEqual(body.evidence, []);
      return {
        ok: true,
        json: async () => ({
          answer: "Ich bin der CoRe-Assistent mit Gemma.",
          model: "gemma-4-31b-it",
          provider: "google",
        }),
      };
    },
  });

  assert.equal(result.usedServer, true);
  assert.equal(result.exchange.citations.length, 0);
  assert.equal(result.exchange.warnings.length, 0);
  assert.match(result.exchange.answer, /Gemma/);
  assert.equal(fetchCalls, 1);
});

test("deck assistant uses Gemma route answers when evidence exists", async () => {
  const result = await answerDeckQuestionWithServer({
    decks: [createMyelinDeck()],
    question: "Was macht die Myelinscheide?",
    sourceBound: true,
    fetchImpl: async (_endpoint, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.sourceBound, true);
      assert.equal(body.evidence.length, 1);
      return {
        ok: true,
        json: async () => ({
          answer: "Gemma: Myelin isoliert Axone und beschleunigt die Erregungsleitung.",
          model: "gemma-4-31b-it",
          provider: "google",
        }),
      };
    },
  });

  assert.equal(result.usedServer, true);
  assert.equal(result.exchange.model, "gemma-4-31b-it");
  assert.match(result.exchange.answer, /Gemma/);
  assert.equal(result.exchange.citations.length, 1);
});

test("deck assistant falls back to the local evidence answer on route errors", async () => {
  const result = await answerDeckQuestionWithServer({
    decks: [createMyelinDeck()],
    question: "Was macht die Myelinscheide?",
    sourceBound: true,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "missing_google_api_key" } }),
    }),
  });

  assert.equal(result.usedServer, false);
  assert.equal(result.fallbackReason, "server-error");
  assert.match(result.exchange.answer, /isoliert Axone/);
  assert.equal(result.exchange.citations.length, 1);
});

test("deck assistant surfaces provider error reasons in free chat mode", async () => {
  const result = await answerDeckQuestionWithServer({
    decks: [createMyelinDeck()],
    question: "Wie wird das Wetter heute in New York City?",
    sourceBound: false,
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: { code: "provider_empty_answer" } }),
    }),
  });

  assert.equal(result.usedServer, false);
  assert.equal(result.fallbackReason, "server-error");
  assert.match(result.exchange.answer, /nicht erstellt/);
  assert.deepEqual(result.exchange.warnings, ["KI-Anbieter lieferte eine leere Antwort."]);
});
