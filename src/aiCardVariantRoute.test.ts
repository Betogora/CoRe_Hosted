import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, createCardVariantHandler, extractGeneratedVariant } from "../api/ai/card-variant.ts";
import { OPENROUTER_CHAT_ENDPOINT, OPENROUTER_MODEL } from "../server/aiRoute.ts";

const input = { source: { front: "Was ist ATP?", back: "Ein Energieträger." } };
const texts = { rateLimited: "zu viele", unavailable: "nicht verfügbar", rejected: "abgelehnt", failed: "fehlgeschlagen", invalid: "ungültig", tool: "Werkzeug", fields: "Felder" };

function completion(modelId = OPENROUTER_MODEL) {
  return {
    model: modelId,
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Wofür steht ATP?", back: "ATP ist ein Energieträger." }) } }] } }],
    usage: { prompt_tokens: 120, completion_tokens: 42, total_tokens: 162, cost: 0.00003 },
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const silent = () => {};

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer session-token", host: "core.example", origin: "https://core.example" },
    body: input,
    ...overrides,
  };
}

function resultResponse() {
  const headers = new Map<string, string>();
  return {
    statusCode: 0,
    headers,
    body: "",
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); },
    end(value: string) { this.body = value; },
  };
}

test("OpenRouter payload forces one compact tool call on the fixed model with ZDR and no training", () => {
  const payload = buildOpenRouterPayload(input);
  assert.equal(payload.model, OPENROUTER_MODEL);
  assert.equal(payload.max_tokens, 1_024);
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "create_card_variant" } });
  assert.deepEqual(payload.reasoning, { effort: "low" });
  assert.deepEqual(payload.provider, { require_parameters: true, data_collection: "deny", zdr: true });
  assert.equal(JSON.stringify(payload).includes("genau einmal create_card_variant"), true);
  assert.deepEqual(JSON.parse(payload.messages[1].content), { source: input.source });

  const withAvoid = buildOpenRouterPayload({ ...input, avoid: ["Wofür steht ATP?"] });
  assert.deepEqual(JSON.parse(withAvoid.messages[1].content), { source: input.source, avoid: ["Wofür steht ATP?"] });
  assert.match(withAvoid.messages[0].content, /nicht mit denselben ersten Wörtern/);
});

test("provider extraction requires exactly one changed create_card_variant call", () => {
  const { result, costUsd } = extractGeneratedVariant(completion(), input);
  assert.equal(result.variant.front, "Wofür steht ATP?");
  assert.equal(result.privacyMode, "zdr");
  assert.equal(result.usage?.totalTokens, 162);
  assert.equal(costUsd, 0.00003);

  assert.throws(() => extractGeneratedVariant({ choices: [{ message: { tool_calls: [] } }] }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [
      { function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Neu", back: "Antwort" }) } },
      { function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Noch neuer", back: "Antwort" }) } },
    ] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "other_tool", arguments: JSON.stringify({ front: "Neu", back: "Antwort" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Neu", back: "Antwort", note: "extra" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify(input.source) } }] } }],
  }, input));
});

test("route authenticates and creates a variant with one provider call and a content-free log line", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logs: unknown[] = [];
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async (token) => { assert.equal(token, "session-token"); return "user-id"; },
    log: (entry) => logs.push(entry),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response(completion());
    },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(JSON.parse(res.body).privacyMode, "zdr");
  assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_CHAT_ENDPOINT]);
  assert.equal(JSON.parse(String(calls[0].init?.body)).model, OPENROUTER_MODEL);
  assert.equal(JSON.stringify(JSON.parse(res.body)).includes("openrouter-secret"), false);
  assert.deepEqual({ ...(logs[0] as Record<string, unknown>), latencyMs: 0 }, { event: "ai_card_variant", outcome: "ok", status: 200, latencyMs: 0, model: OPENROUTER_MODEL, totalTokens: 162, costUsd: 0.00003 });
  assert.doesNotMatch(JSON.stringify(logs), /ATP|session-token|openrouter-secret/);
});

test("route rejects wrong method, foreign origin, missing session and oversized or unconfigured requests before the provider", async () => {
  let providerCalls = 0;
  const handler = createCardVariantHandler({ env: { OPENROUTER_API_KEY: "secret" }, authenticate: async () => "user-id", fetchImpl: async () => { providerCalls += 1; return response({}); }, log: silent });
  const unconfiguredHandler = createCardVariantHandler({ env: {}, authenticate: async () => "user-id", fetchImpl: async () => { providerCalls += 1; return response({}); }, log: silent });

  const wrongMethod = resultResponse();
  await handler(request({ method: "GET" }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  for (const [headers, status] of [
    [{ authorization: "Bearer session-token", host: "core.example", origin: "https://evil.example" }, 403],
    [{ host: "core.example", origin: "https://core.example" }, 401],
    [{ authorization: "Bearer session-token", host: "core.example", origin: "https://core.example", "content-length": "9000" }, 413],
  ] as const) {
    const res = resultResponse();
    await handler(request({ headers }), res);
    assert.equal(res.statusCode, status);
  }
  const unconfigured = resultResponse();
  await unconfiguredHandler(request(), unconfigured);
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(JSON.parse(unconfigured.body).error.code, "missing_openrouter_api_key");
  assert.equal(providerCalls, 0);
});

test("route reports a provider error once without retrying or leaking details", async () => {
  let chatCalls = 0;
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "secret" },
    authenticate: async () => "user-id",
    log: silent,
    fetchImpl: async () => { chatCalls += 1; return response({ error: "provider details stay private" }, 429); },
  });
  const providerError = resultResponse();
  await handler(request(), providerError);
  assert.equal(providerError.statusCode, 429);
  assert.equal(JSON.parse(providerError.body).error.code, "rate_limited");
  assert.doesNotMatch(providerError.body, /provider details/);
  assert.equal(chatCalls, 1);
});
