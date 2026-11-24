import assert from "node:assert/strict";
import test from "node:test";
import { createSummarySettings } from "./learningSummarySettings.ts";
import { buildSummaryToolPayload, extractGeneratedSummary } from "../api/ai/summary.ts";
import { OPENROUTER_MODEL } from "../server/aiRoute.ts";
import { parseAiLearningSummaryRequest } from "./aiLearningSummaryContract.ts";

const input = parseAiLearningSummaryRequest({ title: "ATP", settings: createSummarySettings(), decks: [{ id: "d1", name: "Biologie" }], units: [{ id: "m1", kind: "card", deck: "d1", text: "F: Was ist ATP?\nA: Ein Energieträger." }] });
const summary = { sections: [{ heading: "ATP", paragraphs: ["ATP ist ein Energieträger."], points: [], references: ["m1"], subsections: [] }], warnings: [] };
const completion = (value: unknown = summary, name = "create_learning_summary", finish_reason = "tool_calls") => ({ model: OPENROUTER_MODEL, choices: [{ finish_reason, message: { tool_calls: [{ function: { name, arguments: JSON.stringify(value) } }] } }], usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, cost: 0.0004 } });
test("Zusammenfassungs-Tool nutzt das feste Modell mit ZDR und bindet Auswahl, begrenzte Ausgabe und Material-IDs", () => {
  const payload = buildSummaryToolPayload(input);
  assert.equal(payload.model, OPENROUTER_MODEL); assert.deepEqual(payload.reasoning, { effort: "low" });
  assert.equal(payload.tools[0].function.name, "create_learning_summary");
  assert.equal(payload.tool_choice.function.name, "create_learning_summary");
  assert.equal(payload.max_tokens, 8192); assert.deepEqual(JSON.parse(payload.messages[1].content).decks, [{ id: "d1", name: "Biologie" }]);
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
