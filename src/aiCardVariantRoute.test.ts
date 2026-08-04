import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenRouterPayload,
  createCardVariantHandler,
  extractGeneratedVariant,
  isEligibleFreeMultimodalToolModel,
  OPENROUTER_CHAT_ENDPOINT,
} from "../api/ai/card-variant.ts";

const input = { source: { front: "Was ist ATP?", back: "Ein Energieträger." } };

function model(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    pricing: { prompt: "0", completion: "0", request: null },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["tools", "tool_choice", "max_tokens"],
    ...overrides,
  };
}

function completion(modelId = "provider/model:free") {
  return {
    model: modelId,
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Wofür steht ATP?", back: "ATP ist ein Energieträger." }) } }] } }],
    usage: { prompt_tokens: 120, completion_tokens: 42, total_tokens: 162 },
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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

test("model eligibility excludes paid, text-only and incomplete tool models", () => {
  assert.equal(isEligibleFreeMultimodalToolModel(model("provider/good:free")), true);
  assert.equal(isEligibleFreeMultimodalToolModel(model("provider/paid", { pricing: { prompt: "0.1", completion: "0", request: null } })), false);
  assert.equal(isEligibleFreeMultimodalToolModel(model("provider/text:free", { architecture: { input_modalities: ["text"], output_modalities: ["text"] } })), false);
  assert.equal(isEligibleFreeMultimodalToolModel(model("provider/no-tool-choice:free", { supported_parameters: ["tools", "max_tokens"] })), false);
});

test("OpenRouter payload forces one compact tool call and privacy routing", () => {
  const payload = buildOpenRouterPayload(input, "provider/model:free", "zdr");
  assert.equal(payload.max_tokens, 256);
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "create_card_variant" } });
  assert.equal(payload.provider.zdr, true);
  assert.equal(payload.provider.data_collection, "deny");
  assert.equal(JSON.stringify(payload).includes("genau einmal create_card_variant"), true);
});

test("provider extraction requires exactly one changed create_card_variant call", () => {
  const generated = extractGeneratedVariant(completion(), input, "provider/model:free", "zdr");
  assert.equal(generated.variant.front, "Wofür steht ATP?");
  assert.equal(generated.usage?.totalTokens, 162);

  assert.throws(() => extractGeneratedVariant({ choices: [{ message: { tool_calls: [] } }] }, input, "provider/model:free", "zdr"));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [
      { function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Neu", back: "Antwort" }) } },
      { function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Noch neuer", back: "Antwort" }) } },
    ] } }],
  }, input, "provider/model:free", "zdr"));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "other_tool", arguments: JSON.stringify({ front: "Neu", back: "Antwort" }) } }] } }],
  }, input, "provider/model:free", "zdr"));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ front: "Neu", back: "Antwort", note: "extra" }) } }] } }],
  }, input, "provider/model:free", "zdr"));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify(input.source) } }] } }],
  }, input, "provider/model:free", "zdr"));
});

test("route authenticates and creates a ZDR variant without exposing secrets", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async (token) => { assert.equal(token, "session-token"); return "user-id"; },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return String(url) === OPENROUTER_CHAT_ENDPOINT
        ? response(completion())
        : response({ data: [model("provider/model:free")] });
    },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(JSON.parse(res.body).privacyMode, "zdr");
  assert.equal(calls[0].url.includes("zdr=true"), true);
  assert.equal(JSON.stringify(JSON.parse(res.body)).includes("openrouter-secret"), false);
});

test("route retries once with the best free non-ZDR model after availability failure", async () => {
  let chatCalls = 0;
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async () => "user-id",
    fetchImpl: async (url) => {
      const target = String(url);
      if (target === OPENROUTER_CHAT_ENDPOINT) {
        chatCalls += 1;
        return chatCalls === 1 ? response({ error: "unavailable" }, 503) : response(completion("provider/fallback:free"));
      }
      if (target.includes("zdr=true")) return response({ data: [model("provider/zdr:free")] });
      return response({ data: [model("provider/fallback:free")] });
    },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(chatCalls, 2);
  assert.equal(JSON.parse(res.body).privacyMode, "non_zdr");
  assert.equal(JSON.parse(res.body).model, "provider/fallback:free");
});

test("route rejects unauthenticated, cross-origin and unconfigured requests", async () => {
  const handler = createCardVariantHandler({ env: {}, authenticate: async () => "user-id", fetchImpl: async () => response({}) });

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
  const handler = createCardVariantHandler({ env: { OPENROUTER_API_KEY: "secret" }, authenticate: async () => "user-id" });

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

test("route reports provider errors and retries a timeout only once", async () => {
  let chatCalls = 0;
  const timeoutHandler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "secret" },
    authenticate: async () => "user-id",
    fetchImpl: async (url) => {
      if (String(url) !== OPENROUTER_CHAT_ENDPOINT) return response({ data: [model(`provider/model-${chatCalls}:free`)] });
      chatCalls += 1;
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    },
  });
  const timedOut = resultResponse();
  await timeoutHandler(request(), timedOut);
  assert.equal(timedOut.statusCode, 502);
  assert.equal(JSON.parse(timedOut.body).error.code, "provider_timeout");
  assert.equal(chatCalls, 2);

  for (const [providerStatus, expectedStatus, expectedCode] of [
    [400, 502, "provider_request_rejected"],
    [401, 502, "openrouter_auth_failed"],
    [404, 503, "no_provider_endpoint"],
  ] as const) {
    let catalogCalls = 0;
    const providerErrorHandler = createCardVariantHandler({
      env: { OPENROUTER_API_KEY: "secret" },
      authenticate: async () => "user-id",
      fetchImpl: async (url) => String(url) === OPENROUTER_CHAT_ENDPOINT
        ? response({ error: "provider details stay private" }, providerStatus)
        : response({ data: [model(`provider/model-${catalogCalls++}:free`)] }),
    });
    const providerError = resultResponse();
    await providerErrorHandler(request(), providerError);
    assert.equal(providerError.statusCode, expectedStatus);
    assert.equal(JSON.parse(providerError.body).error.code, expectedCode);
    assert.doesNotMatch(providerError.body, /provider details/);
  }
});
