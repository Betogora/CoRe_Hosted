import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGemmaInteractionPayload,
  createChatHandler,
  extractGemmaOutputText,
  GEMMA_CHAT_MODEL,
  isAllowedOrigin,
  MAX_CHAT_REQUEST_BYTES,
} from "../api/ai/chat.js";

function createReq({ method = "POST", headers = {}, body = {} } = {}) {
  return {
    method,
    headers: {
      host: "127.0.0.1:5190",
      ...headers,
    },
    body,
  };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value) {
      this.body = value;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

const evidence = [
  {
    deckId: "deck_neuro",
    deckName: "Neuro",
    cardId: "card_myelin",
    front: "Welche Funktion hat die Myelinscheide?",
    back: "Sie isoliert Axone elektrisch und beschleunigt die saltatorische Erregungsleitung.",
    sourceQuote: "Myelin isoliert Axone.",
  },
];

test("Gemma chat route builds a stateless allowlisted interaction payload", () => {
  const payload = buildGemmaInteractionPayload({ question: "Was macht Myelin?", evidence, sourceBound: true });

  assert.equal(payload.model, GEMMA_CHAT_MODEL);
  assert.equal(payload.store, false);
  assert.equal(payload.generation_config.temperature, 0.2);
  assert.equal("thinking_level" in payload.generation_config, false);
  assert.equal(payload.generation_config.max_output_tokens, 2048);
  assert.match(payload.system_instruction, /quellengebundene/);
  assert.match(payload.input, /Myelinscheide/);
});

test("Gemma chat route extracts text from Interactions API responses", () => {
  const text = extractGemmaOutputText({
    steps: [
      { type: "thought", content: [{ type: "text", text: "ignored" }] },
      { type: "model_output", content: [{ type: "text", text: "Antwort aus Karten." }] },
    ],
  });

  assert.equal(text, "Antwort aus Karten.");
});

test("Gemma chat route extracts text from legacy Interactions API outputs", () => {
  const text = extractGemmaOutputText({
    outputs: [
      { type: "thought", text: "ignored" },
      { type: "text", text: "Antwort aus dem Legacy-Schema." },
    ],
  });

  assert.equal(text, "Antwort aus dem Legacy-Schema.");
});

test("Gemma chat route rejects missing GOOGLE_API_KEY before provider fetch", async () => {
  let fetchCalls = 0;
  const handler = createChatHandler({
    env: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Was macht Myelin?", evidence } }), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error.code, "missing_google_api_key");
  assert.equal(fetchCalls, 0);
});

test("Gemma chat route rejects oversized requests before provider fetch", async () => {
  let fetchCalls = 0;
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  const res = createRes();

  await handler(createReq({ headers: { "content-length": String(MAX_CHAT_REQUEST_BYTES + 1) }, body: null }), res);

  assert.equal(res.statusCode, 413);
  assert.equal(res.json().error.code, "request_too_large");
  assert.equal(fetchCalls, 0);
});

test("Gemma chat route answers free questions without local card evidence", async () => {
  let fetchCalls = 0;
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.equal(payload.model, GEMMA_CHAT_MODEL);
      assert.match(payload.system_instruction, /CoRe-Lernassistent/);
      assert.doesNotMatch(payload.system_instruction, /gelieferten Kartenquellen/);
      return {
        ok: true,
        json: async () => ({
          steps: [{ type: "model_output", content: [{ type: "text", text: "Mir geht es gut." }] }],
          usage: { total_tokens: 42 },
        }),
      };
    },
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Wie geht es dir?", evidence: [], sourceBound: false } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().answer, "Mir geht es gut.");
  assert.equal(fetchCalls, 1);
});

test("Gemma chat route accepts legacy provider output without exposing provider details", async () => {
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ outputs: [{ type: "text", text: "Legacy-Antwort." }] }),
    }),
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Was macht Myelin?", evidence: [], sourceBound: false } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().answer, "Legacy-Antwort.");
  assert.equal(res.body.includes("test-secret"), false);
});

test("Gemma chat route requires local card evidence in source-bound mode before provider fetch", async () => {
  let fetchCalls = 0;
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Welche KI bist du?", evidence: [], sourceBound: true } }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "invalid_request");
  assert.equal(fetchCalls, 0);
});

test("Gemma chat route maps provider failures without leaking secrets", async () => {
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers["x-goog-api-key"], "test-secret");
      return { ok: false, status: 500, json: async () => ({ error: "provider-secret-detail" }) };
    },
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Was macht Myelin?", evidence } }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "provider_error");
  assert.equal(res.body.includes("test-secret"), false);
  assert.equal(res.body.includes("provider-secret-detail"), false);
});

test("Gemma chat route maps provider network failures as unavailable", async () => {
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async () => {
      throw new Error("network detail");
    },
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Was macht Myelin?", evidence } }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "provider_unreachable");
  assert.equal(res.body.includes("network detail"), false);
  assert.equal(res.body.includes("test-secret"), false);
});

test("Gemma chat route maps empty provider output as provider_empty_answer", async () => {
  const handler = createChatHandler({
    env: { GOOGLE_API_KEY: "test-secret" },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ steps: [{ type: "model_output", content: [] }] }),
    }),
  });
  const res = createRes();

  await handler(createReq({ body: { question: "Was macht Myelin?", evidence } }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "provider_empty_answer");
});

test("Gemma chat route accepts same-origin or originless requests only", () => {
  assert.equal(isAllowedOrigin(createReq({ headers: {} })), true);
  assert.equal(isAllowedOrigin(createReq({ headers: { origin: "http://127.0.0.1:5190", "x-forwarded-proto": "http" } })), true);
  assert.equal(isAllowedOrigin(createReq({ headers: { origin: "https://example.test", "x-forwarded-proto": "http" } })), false);
});
