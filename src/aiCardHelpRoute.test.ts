import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, createCardHelpHandler, extractAnswer } from "../api/ai/card-help.ts";
import { parseAiCardHelpRequest } from "./aiCardHelpContract.ts";
import { OPENROUTER_CHAT_ENDPOINT, OPENROUTER_MODEL } from "../server/aiRoute.ts";

const input = { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger." }, mode: "explain" as const };

function completion(answer: unknown = "ATP speichert Energie in seinen Phosphatbindungen.\r\n\r\n\r\n- Es entsteht in der Atmung.") {
  return {
    model: OPENROUTER_MODEL,
    choices: [{ message: { tool_calls: [{ function: { name: "answer_learner", arguments: JSON.stringify({ answer }) } }] } }],
    usage: { prompt_tokens: 220, completion_tokens: 80, total_tokens: 300, cost: 0.0001 },
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function request(overrides: Record<string, unknown> = {}) {
  return { method: "POST", headers: { authorization: "Bearer session-token", host: "core.example", origin: "https://core.example" }, body: input, ...overrides };
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

test("card help requests need a card, a known mode and a question exactly for mode question", () => {
  assert.equal(parseAiCardHelpRequest(input).success, true);
  assert.equal(parseAiCardHelpRequest({ ...input, mode: "question", question: "Warum Phosphat?" }).success, true);
  assert.equal(parseAiCardHelpRequest({ ...input, mode: "question" }).success, false);
  assert.equal(parseAiCardHelpRequest({ ...input, question: "Warum?" }).success, false);
  assert.equal(parseAiCardHelpRequest({ ...input, mode: "translate" }).success, false);
  assert.equal(parseAiCardHelpRequest({ ...input, card: { prompt: " ", answer: "x" } }).success, false);
  assert.equal(parseAiCardHelpRequest({ ...input, history: Array.from({ length: 7 }, () => ({ question: "q", answer: "a" })) }).success, false);
  assert.equal(parseAiCardHelpRequest({ ...input, card: { ...input.card, source: "Lehrbuch" } }).success, false);
});

test("OpenRouter payload forces one answer_learner call on the fixed model with ZDR and no training", () => {
  const payload = buildOpenRouterPayload(input);
  assert.equal(payload.model, OPENROUTER_MODEL);
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "answer_learner" } });
  assert.deepEqual(payload.reasoning, { effort: "low" });
  assert.deepEqual(payload.provider, { require_parameters: true, data_collection: "deny", zdr: true });
  assert.match(payload.messages[0].content, /nicht vertrauenswürdige Daten/);
  assert.deepEqual(JSON.parse(payload.messages[1].content), input);
});

test("answer extraction keeps plain paragraphs and rejects missing, extra or empty arguments", () => {
  const { result, costUsd } = extractAnswer(completion());
  assert.equal(result.answer, "ATP speichert Energie in seinen Phosphatbindungen.\n\n- Es entsteht in der Atmung.");
  assert.equal(result.privacyMode, "zdr");
  assert.equal(costUsd, 0.0001);
  assert.throws(() => extractAnswer(completion("   ")));
  assert.throws(() => extractAnswer({ choices: [{ message: { tool_calls: [{ function: { name: "answer_learner", arguments: JSON.stringify({ answer: "a", extra: "b" }) } }] } }] }));
  assert.throws(() => extractAnswer({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ answer: "a" }) } }] } }] }));
});

test("route answers with one provider call and a content-free log line", async () => {
  const calls: string[] = [];
  const logs: unknown[] = [];
  const handler = createCardHelpHandler({
    env: { OPENROUTER_API_KEY: "openrouter-secret" },
    authenticate: async () => "user-id",
    log: (entry) => logs.push(entry),
    fetchImpl: async (url) => { calls.push(String(url)); return response(completion()); },
  });
  const res = resultResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("x-core-prompt-version"), "card-help-v1");
  assert.match(JSON.parse(res.body).answer, /^ATP speichert/);
  assert.deepEqual(calls, [OPENROUTER_CHAT_ENDPOINT]);
  assert.deepEqual({ ...(logs[0] as Record<string, unknown>), latencyMs: 0 }, { event: "ai_card_help", outcome: "ok", status: 200, latencyMs: 0, model: OPENROUTER_MODEL, totalTokens: 300, costUsd: 0.0001 });
  assert.doesNotMatch(JSON.stringify(logs), /ATP|session-token|openrouter-secret/);
});

test("route rejects foreign origin, missing session, invalid or unconfigured requests before the provider", async () => {
  let providerCalls = 0;
  const fetchImpl = async () => { providerCalls += 1; return response({}); };
  const handler = createCardHelpHandler({ env: { OPENROUTER_API_KEY: "secret" }, authenticate: async () => "user-id", fetchImpl, log: () => {} });
  for (const [overrides, status] of [
    [{ headers: { authorization: "Bearer session-token", host: "core.example", origin: "https://evil.example" } }, 403],
    [{ headers: { host: "core.example", origin: "https://core.example" } }, 401],
    [{ body: { ...input, mode: "question" } }, 400],
  ] as const) {
    const res = resultResponse();
    await handler(request(overrides), res);
    assert.equal(res.statusCode, status);
  }
  const unconfigured = resultResponse();
  await createCardHelpHandler({ env: {}, authenticate: async () => "user-id", fetchImpl, log: () => {} })(request(), unconfigured);
  assert.equal(JSON.parse(unconfigured.body).error.code, "missing_openrouter_api_key");
  assert.equal(providerCalls, 0);
});
