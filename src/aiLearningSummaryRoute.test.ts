import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createSummarySettings } from "./learningSummarySettings.ts";
import { createSummaryHandler, buildSummaryToolPayload, extractGeneratedSummary } from "../api/ai/summary.ts";
import { HttpError, OPENROUTER_CHAT_ENDPOINT, OPENROUTER_MODEL, readJsonBody } from "../server/aiRoute.ts";
import { MAX_SUMMARY_REQUEST_BYTES, parseAiLearningSummaryRequest } from "./aiLearningSummaryContract.ts";

const input = parseAiLearningSummaryRequest({ title: "ATP", settings: createSummarySettings(), units: [{ id: "m1", kind: "card", label: "ATP", text: "ATP ist ein Energieträger." }] });
const summary = { sections: [{ heading: "ATP", paragraphs: ["ATP ist ein Energieträger."], points: [], references: ["m1"] }], warnings: [] };
const completion = (value: unknown = summary, name = "create_learning_summary", finish_reason = "tool_calls") => ({ model: OPENROUTER_MODEL, choices: [{ finish_reason, message: { tool_calls: [{ function: { name, arguments: JSON.stringify(value) } }] } }], usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, cost: 0.0004 } });
const silent = () => undefined;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function res() { return { statusCode: 0, headers: new Map<string, string>(), body: "", setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); }, end(value: string) { this.body = value; } }; }
const req = (body: unknown = input, headers: Record<string, string> = {}) => ({ method: "POST", headers: { host: "core.example", origin: "https://core.example", authorization: "Bearer session-test", ...headers }, body });

test("Zusammenfassungs-Tool nutzt das feste Modell mit ZDR und bindet Auswahl, begrenzte Ausgabe und Material-IDs", () => {
  const payload = buildSummaryToolPayload(input);
  assert.equal(payload.model, OPENROUTER_MODEL); assert.deepEqual(payload.reasoning, { effort: "low" });
  assert.equal(payload.tools[0].function.name, "create_learning_summary");
  assert.equal(payload.tool_choice.function.name, "create_learning_summary");
  assert.equal(payload.max_tokens, 4096);
  assert.equal(payload.provider.zdr, true); assert.equal(payload.provider.data_collection, "deny");
  assert.equal(JSON.parse(payload.messages[1].content).material[0].id, "m1");
  const { result, costUsd } = extractGeneratedSummary(completion(), input);
  assert.equal(result.summary.sections[0].heading, "ATP"); assert.equal(result.privacyMode, "zdr"); assert.equal(result.usage?.totalTokens, 1200); assert.equal(costUsd, 0.0004);
});

test("Providerantworten mit falschem Werkzeug, Extra-Feldern oder abgeschnittenen Inhalten werden verworfen", () => {
  assert.throws(() => extractGeneratedSummary(completion(summary, "other"), input), /werkzeug/i);
  assert.throws(() => extractGeneratedSummary(completion({ ...summary, html: "unsafe" }), input), /gültige/);
  assert.throws(() => extractGeneratedSummary(completion(summary, "create_learning_summary", "length"), input), /abgeschnitten/);
  assert.throws(() => extractGeneratedSummary(completion({ ...summary, sections: [{ ...summary.sections[0], references: ["m2"] }] }), input), /verweise/i);
  assert.throws(() => extractGeneratedSummary({ choices: [{ message: { tool_calls: [] } }] }, input), /werkzeug/i);
});

test("Route prüft Anmeldung vor Providerzugriff, protokolliert Kosten ohne Inhalte und gibt keine Secrets zurück", async () => {
  const calls: string[] = [], logs: unknown[] = [];
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "server-only-secret" }, log: (entry) => logs.push(entry), authenticate: async (token) => { assert.equal(token, "session-test"); return "user"; }, fetchImpl: async (url, init) => {
    calls.push(String(url)); assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer server-only-secret"); return response(completion());
  } });
  const result = res(); await handler(req(), result);
  assert.equal(result.statusCode, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-core-prompt-version"), "learning-summary-v1"); assert.doesNotMatch(result.body, /server-only-secret|session-test/);
  assert.deepEqual(calls, [OPENROUTER_CHAT_ENDPOINT]);
  assert.equal(logs.length, 1); const { latencyMs, ...entry } = logs[0] as Record<string, unknown>;
  assert.equal(typeof latencyMs, "number"); assert.deepEqual(entry, { event: "ai_learning_summary", outcome: "ok", status: 200, model: OPENROUTER_MODEL, totalTokens: 1200, costUsd: 0.0004 });
  assert.doesNotMatch(JSON.stringify(logs), /Energieträger/);
});

test("Route lehnt fremde Origin, fehlende Sitzung, ungültige Auswahl und übergroße Bodies ab", async () => {
  let providerCalls = 0;
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, log: silent, authenticate: async () => "user", fetchImpl: async () => { providerCalls += 1; return response({}); } });
  for (const [request, status] of [
    [req(input, { origin: "https://other.example" }), 403],
    [req(input, { authorization: "" }), 401],
    [req({ ...input, settings: { ...input.settings, material: "source" } }), 400],
    [req("x".repeat(MAX_SUMMARY_REQUEST_BYTES + 1)), 413],
    [req("{invalid"), 400],
    [{ ...req(), method: "GET" }, 405],
  ] as const) { const result = res(); await handler(request, result); assert.equal(result.statusCode, status); }
  assert.equal(providerCalls, 0);
  const expired = createSummaryHandler({ authenticate: async () => { throw new HttpError(401, "unauthorized", "Sitzung abgelaufen."); } });
  const result = res(); await expired(req(), result); assert.equal(result.statusCode, 401); assert.equal(result.headers.get("www-authenticate"), "Bearer");
});

test("Providerfehler bleiben sichtbar, werden nicht wiederholt und falsche Materialverweise nicht versteckt", async () => {
  for (const [reply, status, code] of [
    [response({}, 429), 429, "rate_limited"],
    [response({}, 404), 503, "no_provider_endpoint"],
    [response(completion({ ...summary, sections: [{ ...summary.sections[0], references: ["m9"] }] })), 502, "invalid_references"],
  ] as const) {
    let calls = 0;
    const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, log: silent, authenticate: async () => "user", fetchImpl: async () => { calls += 1; return reply.clone(); } });
    const result = res(); await handler(req(), result);
    assert.equal(result.statusCode, status); assert.equal(JSON.parse(result.body).error.code, code); assert.equal(calls, 1);
  }
});

test("JSON-Leser zählt UTF-8-Bytes und erhält Umlaute über Chunkgrenzen", async () => {
  const raw = Buffer.from('{"text":"äöü"}', "utf8");
  const stream = Object.assign(Readable.from([raw.subarray(0, 10), raw.subarray(10)]), { headers: {} });
  assert.deepEqual(await readJsonBody(stream, 100), { text: "äöü" });
  await assert.rejects(readJsonBody(Object.assign(Readable.from([raw]), { headers: {} }), 8), /zu groß/);
});
