import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, extractAnswer } from "../api/ai/card-help.ts";
import { parseAiCardHelpRequest } from "./aiCardHelpContract.ts";
import { OPENROUTER_MODEL } from "../server/aiRoute.ts";

const input = { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger." }, mode: "explain" as const };

function completion(answer: unknown = "ATP speichert Energie in seinen Phosphatbindungen.\r\n\r\n\r\n- Es entsteht in der Atmung.") {
  return {
    model: OPENROUTER_MODEL,
    choices: [{ message: { tool_calls: [{ function: { name: "answer_learner", arguments: JSON.stringify({ answer }) } }] } }],
    usage: { prompt_tokens: 220, completion_tokens: 80, total_tokens: 300, cost: 0.0001 },
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
