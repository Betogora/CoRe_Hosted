import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_CHAT_MODEL,
  MAX_CHAT_EVIDENCE_ITEMS,
  MAX_CHAT_EVIDENCE_TEXT_CHARS,
  MAX_CHAT_QUESTION_CHARS,
  parseAiChatRequest,
} from "./aiChatContract.ts";
import { buildGemmaInteractionPayload, validateChatInput } from "../api/ai/chat.ts";

function evidence(text = "Karteninhalt") {
  return { deckId: "deck-1", deckName: "Neuro", cardId: "card-1", front: text, back: text, source: "Neuro", sourceQuote: text };
}

test("AI chat contract accepts exact limits and rejects values over them", () => {
  assert.equal(parseAiChatRequest({ question: "q".repeat(MAX_CHAT_QUESTION_CHARS), evidence: [] }).success, true);
  assert.equal(parseAiChatRequest({ question: "q".repeat(MAX_CHAT_QUESTION_CHARS + 1), evidence: [] }).success, false);
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: [evidence("x".repeat(MAX_CHAT_EVIDENCE_TEXT_CHARS))] }).success, true);
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: [evidence("x".repeat(MAX_CHAT_EVIDENCE_TEXT_CHARS + 1))] }).success, false);
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: Array.from({ length: MAX_CHAT_EVIDENCE_ITEMS }, () => evidence()) }).success, true);
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: Array.from({ length: MAX_CHAT_EVIDENCE_ITEMS + 1 }, () => evidence()) }).success, false);
});

test("AI chat contract rejects unknown fields and browser-selected models", () => {
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: [], model: AI_CHAT_MODEL }).success, false);
  assert.equal(parseAiChatRequest({ question: "Frage", evidence: [{ ...evidence(), score: 7 }] }).success, false);
});

test("validated AI chat prompts stay inside the fixed prompt and output budget", () => {
  const input = {
    question: "q".repeat(MAX_CHAT_QUESTION_CHARS),
    evidence: Array.from({ length: MAX_CHAT_EVIDENCE_ITEMS }, (_, index) => ({
      ...evidence("x".repeat(MAX_CHAT_EVIDENCE_TEXT_CHARS)),
      cardId: `card-${index}`,
    })),
    sourceBound: true,
  };
  const validation = validateChatInput(input);
  assert.equal(validation.valid, true);
  assert.equal(buildGemmaInteractionPayload(validation.input!).generation_config.max_output_tokens, 2_048);
  assert.equal(buildGemmaInteractionPayload(validation.input!).model, AI_CHAT_MODEL);
  assert.equal(buildGemmaInteractionPayload(validation.input!).store, false);
});
