import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, createCardVariantHandler, extractGeneratedVariant } from "../api/ai/card-variant.ts";
import { OPENROUTER_CHAT_ENDPOINT, OPENROUTER_MODEL } from "../server/aiRoute.ts";
import { parseAiCardVariantRequest } from "./aiCardVariantContract.ts";

const input = { kind: "basic" as const, source: { front: "Was ist ATP?", back: "Ein Energieträger." } };
const texts = { rateLimited: "zu viele", unavailable: "nicht verfügbar", rejected: "abgelehnt", failed: "fehlgeschlagen", invalid: "ungültig", tool: "Werkzeug", fields: "Felder" };

function completion(modelId = OPENROUTER_MODEL) {
  return {
    model: modelId,
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Wofür steht ATP?", back: "ATP ist ein Energieträger." }) } }] } }],
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
  assert.doesNotMatch(payload.messages[0].content, /eingetippt/);
  assert.match(buildOpenRouterPayload({ ...input, kind: "type-in" }).messages[0].content, /eingetippt und zeichengenau verglichen/);
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
      { function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort" }) } },
      { function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Noch neuer", back: "Antwort" }) } },
    ] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "other_tool", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort", note: "extra" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, ...input.source }) } }] } }],
  }, input));
});

test("a card the model reports as not rephrasable becomes its own error instead of a variant", () => {
  const report = (args: unknown) => ({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify(args) } }] } }] });
  assert.throws(() => extractGeneratedVariant(report({ rephrasable: false, front: "", back: "" }), input), (error: unknown) => (error as { code?: string }).code === "not_rephrasable" && (error as { statusCode?: number }).statusCode === 422);
  assert.throws(() => extractGeneratedVariant(report({ rephrasable: "nein", front: "Neu", back: "Antwort" }), input), (error: unknown) => (error as { code?: string }).code === "invalid_tool_call");
  assert.throws(() => extractGeneratedVariant(report({ front: "Neu", back: "Antwort" }), input), (error: unknown) => (error as { code?: string }).code === "invalid_tool_call");
});

test("a cloze variant keeps its gap group and solutions, names them nowhere else and keeps the source's answer", () => {
  const cloze = { kind: "cloze" as const, source: { front: "Die {{c1::Titanic}} sank im Jahr 1912.", back: "Titanic" } };
  const answer = (front: string) => ({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front, back: "beliebig" }) } }] } }] });
  const code = (front: string) => { try { extractGeneratedVariant(answer(front), cloze); return "ok"; } catch (error) { return (error as { code?: string }).code; } };

  assert.match(buildOpenRouterPayload(cloze).messages[0].content, /Lückentext/);
  assert.doesNotMatch(buildOpenRouterPayload(input).messages[0].content, /Lückentext/);
  assert.deepEqual(extractGeneratedVariant(answer("Im Jahr 1912 ging die {{c1::Titanic}} unter."), cloze).result.variant, { front: "Im Jahr 1912 ging die {{c1::Titanic}} unter.", back: "Titanic" });
  const formula = { kind: "cloze" as const, source: { front: "Ist {{c1::K < 1}}, überwiegt die Rückreaktion.", back: "K < 1" } };
  assert.equal(extractGeneratedVariant(answer("Die Rückreaktion überwiegt, wenn {{c1::K < 1}} gilt."), formula).result.variant.front, "Die Rückreaktion überwiegt, wenn {{c1::K < 1}} gilt.");
  assert.equal(code("Im Jahr 1912 ging die {{c2::Titanic}} unter."), "invalid_gaps");
  assert.equal(code("Im Jahr {{c1::1912}} ging die {{c1::Titanic}} unter."), "changed_answer");
  assert.equal(code("Im Jahr 1912 ging die {{c1::Lusitania}} unter."), "changed_answer");
  assert.equal(code("Die Titanic, also die {{c1::Titanic}}, ging 1912 unter."), "revealed_answer");
  assert.equal(code("Im Jahr 1912 ging die {{c1::Titanic::Schiff mit Namen Titanic}} unter."), "revealed_answer");
  assert.equal(code("Die {{c1::Titanic}} sank im Jahr 1912."), "invalid_variant");
});

test("a cloze request needs exactly one complete gap group", () => {
  const request = (front: string) => parseAiCardVariantRequest({ kind: "cloze", source: { front, back: "x" } }).success;
  assert.equal(request("Die {{c1::Titanic}} sank."), true);
  assert.equal(request("Die Titanic sank."), false);
  assert.equal(request("Die {{c1::Titanic}} sank {{c2::1912}}."), false);
  assert.equal(request("Die {{c1::Titanic sank."), false);
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
