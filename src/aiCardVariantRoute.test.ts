import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  buildOpenRouterPayload,
  classifyProviderError,
  createCardVariantHandler,
  extractGeneratedVariant,
  isEligibleFreeTextToolModel,
  OPENROUTER_CHAT_ENDPOINT,
} from "../api/ai/card-variant.ts";

const input = { source: { front: "Was ist ATP?", back: "Ein Energieträger." } };

function model(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    pricing: { prompt: "0", completion: "0", request: null },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["tools", "tool_choice", "max_tokens", "reasoning"],
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

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
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

test("model eligibility accepts text-only models and excludes paid or incomplete tool models", () => {
  assert.equal(isEligibleFreeTextToolModel(model("provider/good:free")), true);
  assert.equal(isEligibleFreeTextToolModel(model("provider/text:free", { architecture: { input_modalities: ["text"], output_modalities: ["text"] } })), true);
  assert.equal(isEligibleFreeTextToolModel(model("provider/paid", { pricing: { prompt: "0.1", completion: "0", request: null } })), false);
  assert.equal(isEligibleFreeTextToolModel(model("provider/image-only:free", { architecture: { input_modalities: ["image"], output_modalities: ["text"] } })), false);
  assert.equal(isEligibleFreeTextToolModel(model("provider/no-tool-choice:free", { supported_parameters: ["tools", "max_tokens", "reasoning"] })), false);
  assert.equal(isEligibleFreeTextToolModel(model("provider/no-reasoning-control:free", { supported_parameters: ["tools", "tool_choice", "max_tokens"] })), true);
});

test("OpenRouter payload forces one compact tool call over a fallback chain with privacy routing", () => {
  const payload = buildOpenRouterPayload(input, { models: ["provider/a:free", "provider/b:free"], privacyMode: "zdr", reasoning: true });
  assert.deepEqual(payload.models, ["provider/a:free", "provider/b:free"]);
  assert.equal(payload.max_tokens, 1_024);
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "create_card_variant" } });
  assert.deepEqual(payload.reasoning, { effort: "none" });
  assert.equal(payload.provider.zdr, true);
  assert.equal(payload.provider.data_collection, "deny");
  assert.equal(JSON.stringify(payload).includes("genau einmal create_card_variant"), true);

  const withoutReasoning = buildOpenRouterPayload(input, { models: ["provider/a:free"], privacyMode: "non_zdr", reasoning: false });
  assert.equal("reasoning" in withoutReasoning, false);
  assert.equal("zdr" in withoutReasoning.provider, false);
});

test("provider errors separate account-wide free limits from retryable upstream failures", () => {
  const daily = classifyProviderError(429, { error: { code: 429, message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } });
  assert.equal(daily.code, "daily_limit_reached");
  assert.equal(daily.retryableAvailability, false);

  const perMinute = classifyProviderError(429, { error: { code: 429, message: "Rate limit exceeded" } }, new Headers({ "X-RateLimit-Remaining": "0" }));
  assert.equal(perMinute.code, "rate_limited");
  assert.equal(perMinute.retryableAvailability, false);

  const upstream = classifyProviderError(429, { error: { code: 429, message: "provider/model:free is temporarily rate-limited upstream.", metadata: { provider_name: "Upstream" } } });
  assert.equal(upstream.code, "provider_rate_limited");
  assert.equal(upstream.retryableAvailability, true);

  assert.equal(classifyProviderError(403, { error: { code: 403, message: "Key limit exceeded", metadata: { limit_source: "openrouter_key_limit" } } }).code, "provider_budget_exhausted");
  assert.equal(classifyProviderError(401, null).message.includes("OPENROUTER_API_KEY"), false);
  assert.equal(classifyProviderError(200, { error: { code: 502, message: "Provider returned error" } }).retryableAvailability, true);
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

test("route authenticates and creates a ZDR variant over the three most popular free models", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logs: unknown[] = [];
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async (token) => { assert.equal(token, "session-token"); return "user-id"; },
    log: (entry) => logs.push(entry),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return String(url) === OPENROUTER_CHAT_ENDPOINT
        ? response(completion())
        : response({ data: ["a", "b", "c", "d"].map((id) => model(`provider/${id}:free`, { architecture: { input_modalities: ["text"], output_modalities: ["text"] } })) });
    },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(JSON.parse(res.body).privacyMode, "zdr");
  assert.equal(calls[0].url.includes("zdr=true"), true);
  assert.equal(calls[0].url.includes("input_modalities=text"), true);
  assert.equal(calls[0].url.includes("image"), false);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)).models, ["provider/a:free", "provider/b:free", "provider/c:free"]);
  assert.equal(JSON.stringify(JSON.parse(res.body)).includes("openrouter-secret"), false);
  assert.equal(logs.length, 1);
  assert.deepEqual({ ...(logs[0] as Record<string, unknown>), latencyMs: 0 }, { event: "ai_card_variant", outcome: "ok", status: 200, latencyMs: 0, attempts: 1, model: "provider/model:free", privacyMode: "zdr", totalTokens: 162 });
  assert.doesNotMatch(JSON.stringify(logs), /ATP|session-token|openrouter-secret/);
});

test("route falls back once to free non-ZDR models after an unavailable ZDR chain", async () => {
  let chatCalls = 0;
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async () => "user-id",
    log: silent,
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

test("route stops at account-wide free limits instead of trying more models", async () => {
  let chatCalls = 0;
  const handler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "secret" },
    authenticate: async () => "user-id",
    log: silent,
    fetchImpl: async (url) => {
      if (String(url) !== OPENROUTER_CHAT_ENDPOINT) return response({ data: [model("provider/model:free")] });
      chatCalls += 1;
      return response({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day." } }, 429);
    },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 429);
  assert.equal(JSON.parse(res.body).error.code, "daily_limit_reached");
  assert.equal(chatCalls, 1);
});

test("route keeps serving the last model catalog when a refresh fails", async () => {
  mock.timers.enable({ apis: ["Date"], now: 0 });
  try {
    let catalogUp = true;
    const handler = createCardVariantHandler({
      env: { OPENROUTER_API_KEY: "secret" },
      authenticate: async () => "user-id",
      log: silent,
      fetchImpl: async (url) => {
        if (String(url) === OPENROUTER_CHAT_ENDPOINT) return response(completion());
        return catalogUp ? response({ data: [model("provider/model:free")] }) : response({}, 503);
      },
    });
    const first = resultResponse();
    await handler(request(), first);
    assert.equal(first.statusCode, 200);

    catalogUp = false;
    mock.timers.tick(120_000);
    const second = resultResponse();
    await handler(request(), second);
    assert.equal(second.statusCode, 200);
  } finally {
    mock.timers.reset();
  }
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

test("route reports provider errors and retries a timeout only once", async () => {
  let chatCalls = 0;
  const timeoutHandler = createCardVariantHandler({
    env: { OPENROUTER_API_KEY: "secret" },
    authenticate: async () => "user-id",
    log: silent,
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
    [401, 503, "openrouter_auth_failed"],
    [404, 503, "no_provider_endpoint"],
  ] as const) {
    let catalogCalls = 0;
    const providerErrorHandler = createCardVariantHandler({
      env: { OPENROUTER_API_KEY: "secret" },
      authenticate: async () => "user-id",
      log: silent,
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
