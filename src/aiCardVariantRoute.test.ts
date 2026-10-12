import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenRouterPayload,
  classifyProviderError,
  createCardVariantHandler,
  extractGeneratedVariant,
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_MODEL,
} from "../api/ai/card-variant.ts";

const input = { source: { front: "Was ist ATP?", back: "Ein Energieträger." } };

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

test("provider errors map to stable codes without exposing configuration", () => {
  assert.equal(classifyProviderError(429, { error: { code: 429, message: "Rate limit exceeded" } }).code, "rate_limited");
  assert.equal(classifyProviderError(402, null).code, "provider_budget_exhausted");
  assert.equal(classifyProviderError(403, { error: { code: 403, message: "Key limit exceeded", metadata: { limit_source: "openrouter_key_limit" } } }).code, "provider_budget_exhausted");
  assert.equal(classifyProviderError(403, { error: { code: 403, message: "Forbidden" } }).code, "openrouter_auth_failed");
  assert.equal(classifyProviderError(401, null).message.includes("OPENROUTER_API_KEY"), false);
  assert.equal(classifyProviderError(200, { error: { code: 502, message: "Provider returned error" } }).code, "provider_error");
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

test("route rejects unauthenticated, cross-origin and unconfigured requests", async () => {
  const handler = createCardVariantHandler({ env: {}, authenticate: async () => "user-id", fetchImpl: async () => response({}), log: silent });

  const unauthenticated = resultResponse();
  await handler(request({ headers: { host: "core.example", origin: "https://core.example" } }), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const missingOrigin = resultResponse();
  await handler(request({ headers: { authorization: "Bearer session-token", host: "core.example" } }), missingOrigin);
  assert.equal(missingOrigin.statusCode, 403);

  const crossOrigin = resultResponse();
  await handler(request({ headers: { authorization: "Bearer session-token", host: "core.example", origin: "https://evil.example" } }), crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);

  const unconfigured = resultResponse();
  await handler(request(), unconfigured);
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(JSON.parse(unconfigured.body).error.code, "missing_openrouter_api_key");
});

test("route enforces method and request-size limits", async () => {
  const handler = createCardVariantHandler({ env: { OPENROUTER_API_KEY: "secret" }, authenticate: async () => "user-id", log: silent });

  const wrongMethod = resultResponse();
  await handler(request({ method: "GET" }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const oversized = resultResponse();
  await handler(request({
    headers: { authorization: "Bearer session-token", host: "core.example", origin: "https://core.example", "content-length": "9000" },
  }), oversized);
  assert.equal(oversized.statusCode, 413);
});

test("route reports provider errors and timeouts without retrying or leaking details", async () => {
  let chatCalls = 0;
  const timeoutHandler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "secret" },
    authenticate: async () => "user-id",
    log: silent,
    fetchImpl: async () => {
      chatCalls += 1;
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    },
  });
  const timedOut = resultResponse();
  await timeoutHandler(request(), timedOut);
  assert.equal(timedOut.statusCode, 502);
  assert.equal(JSON.parse(timedOut.body).error.code, "provider_timeout");
  assert.equal(chatCalls, 1);

  for (const [providerStatus, expectedStatus, expectedCode] of [
    [400, 502, "provider_request_rejected"],
    [401, 503, "openrouter_auth_failed"],
    [404, 503, "no_provider_endpoint"],
    [429, 429, "rate_limited"],
  ] as const) {
    const providerErrorHandler = createCardVariantHandler({
      env: { OPENROUTER_API_KEY: "secret" },
      authenticate: async () => "user-id",
      log: silent,
      fetchImpl: async () => response({ error: "provider details stay private" }, providerStatus),
    });
    const providerError = resultResponse();
    await providerErrorHandler(request(), providerError);
    assert.equal(providerError.statusCode, expectedStatus);
    assert.equal(JSON.parse(providerError.body).error.code, expectedCode);
    assert.doesNotMatch(providerError.body, /provider details/);
  }
});
