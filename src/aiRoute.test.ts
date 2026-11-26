import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createCardHelpHandler } from "../api/ai/card-help.ts";
import { createCardVariantHandler } from "../api/ai/card-variant.ts";
import { createSourceCardsHandler } from "../api/ai/source-cards.ts";
import { createSummaryHandler } from "../api/ai/summary.ts";
import {
  HttpError, OPENROUTER_CHAT_ENDPOINT, OPENROUTER_MODEL, classifyProviderError, isAllowedOrigin, parseBearerToken, readJsonBody, requestOpenRouter,
} from "../server/aiRoute.ts";
import { AI_CARD_HELP_PROMPT_VERSION, MAX_AI_CARD_HELP_REQUEST_BYTES } from "./aiCardHelpContract.ts";
import { AI_CARD_VARIANT_PROMPT_VERSION, MAX_AI_CARD_VARIANT_REQUEST_BYTES } from "./aiCardVariantContract.ts";
import { AI_LEARNING_SUMMARY_PROMPT_VERSION, MAX_SUMMARY_REQUEST_BYTES } from "./aiLearningSummaryContract.ts";
import { AI_SOURCE_CARDS_PROMPT_VERSION, MAX_SOURCE_CARDS_REQUEST_BYTES } from "./aiSourceCardsContract.ts";
import { createAiSourceCreationDraft } from "./aiSourceCreation.ts";
import { createSummarySettings } from "./learningSummarySettings.ts";

const texts = { rateLimited: "zu viele", unavailable: "nicht verfügbar", rejected: "abgelehnt", failed: "fehlgeschlagen", invalid: "ungültig", filtered: "gefiltert", tool: "Werkzeug", fields: "Felder" };

test("AI routes accept only their own origin and a bearer session", () => {
  assert.equal(isAllowedOrigin({ headers: { host: "core.example", origin: "https://core.example" } }), true);
  assert.equal(isAllowedOrigin({ headers: { host: "core.example" } }), false);
  assert.equal(isAllowedOrigin({ headers: { host: "core.example", origin: "https://evil.example" } }), false);
  assert.equal(parseBearerToken({ headers: { authorization: "Bearer session-token" } }), "session-token");
  assert.throws(() => parseBearerToken({ headers: {} }), { statusCode: 401, code: "unauthorized" });
});

test("JSON reader limits UTF-8 bytes, rejects invalid JSON and keeps umlauts across chunk boundaries", async () => {
  const raw = Buffer.from('{"text":"äöü"}', "utf8");
  const stream = Object.assign(Readable.from([raw.subarray(0, 10), raw.subarray(10)]), { headers: {} });
  assert.deepEqual(await readJsonBody(stream, 100), { text: "äöü" });
  await assert.rejects(readJsonBody(Object.assign(Readable.from([raw]), { headers: {} }), 8), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: { "content-length": "9000" }, body: {} }, 8_192), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: {}, body: "x".repeat(101) }, 100), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: {}, body: "{invalid" }, 100), { statusCode: 400, code: "invalid_json" });
});

test("provider errors map to stable codes without exposing configuration", () => {
  for (const [status, payload, expectedStatus, expectedCode] of [
    [429, { error: { code: 429, message: "Rate limit exceeded" } }, 429, "rate_limited"],
    [402, null, 503, "provider_budget_exhausted"],
    [403, { error: { code: 403, message: "Key limit exceeded", metadata: { limit_source: "openrouter_key_limit" } } }, 503, "provider_budget_exhausted"],
    [403, { error: { code: 403, message: "Forbidden" } }, 503, "openrouter_auth_failed"],
    [401, null, 503, "openrouter_auth_failed"],
    [400, null, 502, "provider_request_rejected"],
    [404, null, 503, "no_provider_endpoint"],
    [200, { error: { code: 502, message: "Provider returned error" } }, 502, "provider_error"],
  ] as const) {
    const error = classifyProviderError(status, payload, texts);
    assert.deepEqual([error.statusCode, error.code], [expectedStatus, expectedCode]);
    assert.doesNotMatch(error.message, /OPENROUTER_API_KEY|limit exceeded|Forbidden/i);
  }
});

test("provider requests report timeouts and error bodies once without leaking details", async () => {
  let calls = 0;
  const timeout = () => { calls += 1; throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
  await assert.rejects(requestOpenRouter(async () => timeout(), "secret", {}, AbortSignal.timeout(1_000), texts), { statusCode: 502, code: "provider_timeout" });
  assert.equal(calls, 1);

  const providerError = await requestOpenRouter(async () => new Response(JSON.stringify({ error: "provider details stay private" }), { status: 400 }), "secret", {}, AbortSignal.timeout(1_000), texts).catch((error: unknown) => error);
  assert.deepEqual([(providerError as { code: string }).code, (providerError as Error).message], ["provider_request_rejected", "abgelehnt"]);
});

const { wishes: _wishes, ...sourceDefaults } = createAiSourceCreationDraft().settings;
const sourceRequest = {
  settings: { ...sourceDefaults, cardForms: ["basic"], wishes: "" },
  units: [{ id: "s1", label: "Seite 1", text: "ATP ist der wichtigste Energieträger der Zelle." }],
  avoid: [],
  limit: 10,
};
const sourceCard = { form: "basic", front: "Was ist der wichtigste Energieträger der Zelle?", back: "ATP", options: [], explanation: "", sources: ["s1"] };
const summaryRequest = { title: "ATP", settings: createSummarySettings(), decks: [{ id: "d1", name: "Biologie" }], units: [{ id: "m1", kind: "card", deck: "d1", text: "F: Was ist ATP?\nA: Ein Energieträger." }] };
const summarySection = { heading: "ATP", paragraphs: ["ATP ist ein Energieträger."], points: [], references: ["m1"], subsections: [] };
const variantSource = { front: "Was ist ATP?", back: "Ein Energieträger." };

const ROUTES = [
  {
    create: createCardHelpHandler, event: "ai_card_help", promptVersion: AI_CARD_HELP_PROMPT_VERSION, maxBytes: MAX_AI_CARD_HELP_REQUEST_BYTES,
    body: { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger." }, mode: "explain" },
    invalidBody: { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger." }, mode: "question" },
    tool: "answer_learner", answer: { answer: "ATP speichert Energie." },
    invalidAnswer: { arguments: { answer: "   " }, status: 502, code: "invalid_provider_response" },
  },
  {
    create: createCardVariantHandler, event: "ai_card_variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, maxBytes: MAX_AI_CARD_VARIANT_REQUEST_BYTES,
    body: { kind: "basic", source: variantSource },
    invalidBody: { kind: "choice", source: variantSource },
    tool: "create_card_variant", answer: { rephrasable: true, front: "Wofür steht ATP?", back: "ATP ist ein Energieträger." },
    invalidAnswer: { arguments: { rephrasable: false, front: "", back: "" }, status: 422, code: "not_rephrasable" },
  },
  {
    create: createSourceCardsHandler, event: "ai_source_cards", promptVersion: AI_SOURCE_CARDS_PROMPT_VERSION, maxBytes: MAX_SOURCE_CARDS_REQUEST_BYTES,
    body: sourceRequest,
    invalidBody: { ...sourceRequest, settings: { ...sourceRequest.settings, cardForms: [] } },
    tooLarge: { body: { ...sourceRequest, units: [{ id: "s1", label: "Seite 1", text: "x".repeat(15_001) }] }, code: "portion_too_large" },
    tool: "create_source_cards", answer: { cards: [sourceCard], warnings: [] },
    invalidAnswer: { arguments: { cards: [sourceCard] }, status: 502, code: "invalid_response" },
  },
  {
    create: createSummaryHandler, event: "ai_learning_summary", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, maxBytes: MAX_SUMMARY_REQUEST_BYTES,
    body: summaryRequest,
    invalidBody: { ...summaryRequest, settings: { ...summaryRequest.settings, material: "source" } },
    tooLarge: { body: { ...summaryRequest, units: [{ ...summaryRequest.units[0], text: "x".repeat(400_001) }] }, code: "material_too_large" },
    tool: "create_learning_summary", answer: { sections: [summarySection], warnings: [], relations: [] },
    invalidAnswer: { arguments: { sections: [{ ...summarySection, references: ["m9"] }], warnings: [], relations: [] }, status: 502, code: "invalid_references" },
  },
];

type Route = (typeof ROUTES)[number];
type Options = NonNullable<Parameters<Route["create"]>[0]>;
type Request = ReturnType<typeof post>;

function completion(tool: string, args: unknown, finishReason = "tool_calls") {
  return {
    model: OPENROUTER_MODEL,
    choices: [{ finish_reason: finishReason, message: { tool_calls: [{ function: { name: tool, arguments: JSON.stringify(args) } }] } }],
    usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, cost: 0.002 },
  };
}

function post(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return {
    method,
    headers: { host: "core.example", origin: "https://core.example", authorization: "Bearer session-token", ...headers },
    bodyRead: false,
    get body() { this.bodyRead = true; return body; },
  };
}

async function run(route: Route, request: Request, { reply, ...options }: Options & { reply?: () => Response } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const handler = route.create({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async (token) => { assert.equal(token, "session-token"); return "user-id"; },
    log: (entry) => logs.push(entry),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return reply ? reply() : Response.json(completion(route.tool, route.answer));
    },
    ...options,
  });
  const res = { statusCode: 0, headers: new Map<string, string>(), body: "", setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); }, end(value: string) { this.body = value; } };
  await handler(request, res);
  return { res, calls, logs, error: JSON.parse(res.body).error as { code: string; message: string } | undefined };
}

for (const route of ROUTES) {
  test(`${route.event}: Hülle weist Methode, Origin, Sitzung, fehlenden Schlüssel und ungültige Bodies ohne Providerzugriff ab`, async () => {
    const cases: Array<[label: string, request: Request, status: number, code: string, options?: Options]> = [
      ["Methode", post(route.body, {}, "GET"), 405, "method_not_allowed"],
      ["Origin", post(route.body, { origin: "https://evil.example" }), 403, "forbidden_origin"],
      ["ohne Sitzung", post(route.body, { authorization: "" }), 401, "unauthorized"],
      ["abgelaufene Sitzung", post(route.body), 401, "unauthorized", { authenticate: async () => { throw new HttpError(401, "unauthorized", "Sitzung abgelaufen."); } }],
      ["interner Fehler", post(route.body), 500, "internal_error", { authenticate: async () => { throw new Error("interne Details"); } }],
      ["ohne Schlüssel vor dem Body", post("x".repeat(route.maxBytes + 1)), 503, "missing_openrouter_api_key", { env: {} }],
      ["Content-Length", post(route.body, { "content-length": String(route.maxBytes + 1) }), 413, "request_too_large"],
      ["Bodygröße", post("x".repeat(route.maxBytes + 1)), 413, "request_too_large"],
      ["JSON", post("{kein json"), 400, "invalid_json"],
      ["Auftrag", post(route.invalidBody), 400, ""],
      ...(route.tooLarge ? [["Fachgrenze", post(route.tooLarge.body), 413, route.tooLarge.code] as [string, Request, number, string]] : []),
    ];
    for (const [label, request, status, code, options] of cases) {
      const { res, calls, logs, error } = await run(route, request, options);
      assert.equal(res.statusCode, status, label);
      if (code) assert.equal(error?.code, code, label);
      assert.ok(error?.message, label);
      assert.doesNotMatch(res.body, /interne Details|openrouter-secret/, label);
      assert.equal(res.headers.get("cache-control"), "private, no-store", label);
      assert.equal(res.headers.get("allow"), status === 405 ? "POST" : undefined, label);
      assert.equal(res.headers.get("www-authenticate"), status === 401 ? "Bearer" : undefined, label);
      if (status === 401 || status === 503) assert.equal(request.bodyRead, false, label);
      assert.deepEqual([calls.length, logs.length], [0, 0], label);
    }
  });

  test(`${route.event}: Hülle ruft den Provider einmal mit Serverschlüssel und protokolliert Kosten ohne Inhalte`, async () => {
    const { res, calls, logs } = await run(route, post(route.body));
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("x-core-prompt-version"), route.promptVersion);
    assert.equal(JSON.parse(res.body).model, OPENROUTER_MODEL);
    assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_CHAT_ENDPOINT]);
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer openrouter-secret");
    assert.equal(JSON.parse(String(calls[0].init?.body)).model, OPENROUTER_MODEL);
    assert.doesNotMatch(res.body, /openrouter-secret|session-token/);
    const { latencyMs, ...entry } = logs[0];
    assert.equal(typeof latencyMs, "number");
    assert.deepEqual([logs.length, entry], [1, { event: route.event, outcome: "ok", status: 200, model: OPENROUTER_MODEL, totalTokens: 300, costUsd: 0.002 }]);
    assert.doesNotMatch(JSON.stringify(logs), /Energieträger|session-token|openrouter-secret/);
  });

  test(`${route.event}: Hülle meldet Provider- und Antwortfehler einmal, ohne Details und mit den angefallenen Kosten`, async () => {
    const timeout = (): Response => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
    const cases: Array<[reply: () => Response, status: number, code: string, costUsd: number | null]> = [
      [() => Response.json({ error: "provider details stay private" }, { status: 429 }), 429, "rate_limited", null],
      [() => Response.json({}, { status: 402 }), 503, "provider_budget_exhausted", null],
      [timeout, 502, "provider_timeout", null],
      [() => Response.json(completion(route.tool, route.answer, "length")), 502, "invalid_provider_response", 0.002],
      [() => Response.json(completion(route.tool, route.answer, "content_filter")), 502, "content_filter", 0.002],
      [() => Response.json(completion("other_tool", route.answer)), 502, "invalid_tool_call", 0.002],
      [() => Response.json(completion(route.tool, route.invalidAnswer.arguments)), route.invalidAnswer.status, route.invalidAnswer.code, 0.002],
    ];
    for (const [reply, status, code, costUsd] of cases) {
      const { res, calls, logs, error } = await run(route, post(route.body), { reply });
      assert.deepEqual([res.statusCode, error?.code, calls.length], [status, code, 1], code);
      assert.doesNotMatch(res.body, /provider details/, code);
      const { latencyMs: _latencyMs, ...entry } = logs[0];
      const billed = costUsd !== null;
      assert.deepEqual([logs.length, entry], [1, { event: route.event, outcome: code, status, model: billed ? OPENROUTER_MODEL : null, totalTokens: billed ? 300 : null, costUsd }], code);
    }
  });
}
