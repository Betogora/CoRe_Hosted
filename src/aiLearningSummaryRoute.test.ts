import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createSummarySettings } from "./learningSummarySettings.ts";
import { createSummaryHandler, buildSummaryToolPayload, extractGeneratedSummary } from "../api/ai/summary.ts";
import { HttpError, OPENROUTER_CHAT_ENDPOINT, readJsonBody } from "../server/aiTextTool.ts";
import { MAX_SUMMARY_REQUEST_BYTES, parseAiLearningSummaryRequest } from "./aiLearningSummaryContract.ts";

const input = parseAiLearningSummaryRequest({ title: "ATP", settings: createSummarySettings(), units: [{ id: "m1", kind: "card", label: "ATP", text: "ATP ist ein Energieträger." }] });
const summary = { sections: [{ heading: "ATP", paragraphs: ["ATP ist ein Energieträger."], points: [], references: ["m1"] }], warnings: [] };
const model = (id = "provider/test:free", context = 128_000) => ({ id, context_length: context, pricing: { prompt: "0", completion: "0", request: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: ["tools", "tool_choice", "max_tokens", "reasoning"] });
const completion = (value: unknown = summary, name = "create_learning_summary", finish_reason = "tool_calls") => ({ choices: [{ finish_reason, message: { tool_calls: [{ function: { name, arguments: JSON.stringify(value) } }] } }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function res() { return { statusCode: 0, headers: new Map<string, string>(), body: "", setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); }, end(value: string) { this.body = value; } }; }
const req = (body: unknown = input, headers: Record<string, string> = {}) => ({ method: "POST", headers: { host: "core.example", origin: "https://core.example", authorization: "Bearer session-test", ...headers }, body });

test("Zusammenfassungs-Tool bindet Auswahl, begrenzte Ausgabe und bekannte Material-IDs", () => {
  const payload = buildSummaryToolPayload(input, "test:free", "zdr");
  assert.equal(payload.tools[0].function.name, "create_learning_summary");
  assert.equal(payload.tool_choice.function.name, "create_learning_summary");
  assert.equal(payload.max_tokens, 4096);
  assert.equal(payload.provider.zdr, true); assert.equal(payload.provider.data_collection, "deny");
  assert.equal(JSON.parse(payload.messages[1].content).material[0].id, "m1");
  assert.equal(extractGeneratedSummary(completion(), input, "test:free", "zdr").summary.sections[0].heading, "ATP");
});

test("Providerantworten mit falschem Werkzeug, Extra-Feldern oder abgeschnittenen Inhalten werden verworfen", () => {
  assert.throws(() => extractGeneratedSummary(completion(summary, "other"), input, "test", "zdr"), /werkzeug/i);
  assert.throws(() => extractGeneratedSummary(completion({ ...summary, html: "unsafe" }), input, "test", "zdr"), /gültige/);
  assert.throws(() => extractGeneratedSummary(completion(summary, "create_learning_summary", "length"), input, "test", "zdr"), /abgeschnitten/);
  assert.throws(() => extractGeneratedSummary(completion({ ...summary, sections: [{ ...summary.sections[0], references: ["m2"] }] }), input, "test", "zdr"), /verweise/i);
  assert.throws(() => extractGeneratedSummary({ choices: [{ message: { tool_calls: [] } }] }, input, "test", "zdr"), /werkzeug/i);
});

test("Route prüft Anmeldung vor Providerzugriff und gibt keine Secrets zurück", async () => {
  const calls: string[] = [];
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "server-only-secret" }, authenticate: async (token) => { assert.equal(token, "session-test"); return "user"; }, fetchImpl: async (url, init) => {
    calls.push(String(url));
    if (String(url) === OPENROUTER_CHAT_ENDPOINT) { assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer server-only-secret"); return response(completion()); }
    return response({ data: [model("too-small:free", 100), model()] });
  } });
  const result = res(); await handler(req(), result);
  assert.equal(result.statusCode, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-core-prompt-version"), "learning-summary-v1"); assert.doesNotMatch(result.body, /server-only-secret|session-test/);
  assert.equal(calls.length, 2);
});

test("Route lehnt fremde Origin, fehlende Sitzung, ungültige Auswahl und übergroße Bodies ab", async () => {
  let providerCalls = 0;
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, authenticate: async () => "user", fetchImpl: async () => { providerCalls += 1; return response({}); } });
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

test("Kostenloser Verfügbarkeitsfallback wechselt einmal und meldet Non-ZDR", async () => {
  let calls = 0;
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, authenticate: async () => "user", fetchImpl: async (url) => {
    if (String(url) === OPENROUTER_CHAT_ENDPOINT) return ++calls === 1 ? response({}, 503) : response(completion());
    return response({ data: [model(String(url).includes("zdr=true") ? "zdr:free" : "fallback:free")] });
  } });
  const result = res(); await handler(req(), result);
  assert.equal(calls, 2); assert.equal(result.statusCode, 200); assert.equal(JSON.parse(result.body).privacyMode, "non_zdr");
});

test("Rate Limit bleibt sichtbar; falsche Materialverweise werden nicht als Providerfallback versteckt", async () => {
  for (const [reply, status, maxCalls] of [[response({}, 429), 429, 2], [response(completion({ ...summary, sections: [{ ...summary.sections[0], references: ["m9"] }] })), 502, 1]] as const) {
    let calls = 0;
    const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, authenticate: async () => "user", fetchImpl: async (url) => {
      if (String(url) === OPENROUTER_CHAT_ENDPOINT) { calls += 1; return reply.clone(); }
      return response({ data: [model("first:free"), model("second:free")] });
    } });
    const result = res(); await handler(req(), result); assert.equal(result.statusCode, status); assert.equal(calls, maxCalls);
  }
});

test("JSON-Leser zählt UTF-8-Bytes und erhält Umlaute über Chunkgrenzen", async () => {
  const raw = Buffer.from('{"text":"äöü"}', "utf8");
  const stream = Object.assign(Readable.from([raw.subarray(0, 10), raw.subarray(10)]), { headers: {} });
  assert.deepEqual(await readJsonBody(stream, 100), { text: "äöü" });
  await assert.rejects(readJsonBody(Object.assign(Readable.from([raw]), { headers: {} }), 8), /zu groß/);
});

test("Modellauswahl reserviert auch bei mehrbyteigem Material genügend Kontext", async () => {
  const unicode = { ...input, units: [{ ...input.units[0], text: "🧬".repeat(4_000) }] };
  let selected = "";
  const handler = createSummaryHandler({ env: { OPENROUTER_API_KEY: "test" }, authenticate: async () => "user", fetchImpl: async (url, init) => {
    if (String(url) === OPENROUTER_CHAT_ENDPOINT) { selected = JSON.parse(String(init?.body)).model; return response(completion()); }
    return response({ data: [model("too-small-unicode:free", 25_000), model("sufficient:free", 128_000)] });
  } });
  const result = res(); await handler(req(unicode), result);
  assert.equal(result.statusCode, 200); assert.equal(selected, "sufficient:free");
});
