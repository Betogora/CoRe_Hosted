import {
  AI_LEARNING_SUMMARY_DEADLINE_MS, AI_LEARNING_SUMMARY_PROMPT_VERSION, AiLearningSummaryError, MAX_SUMMARY_REQUEST_BYTES,
  SUMMARY_OUTPUT_TOKENS, buildLearningSummaryPrompt, parseAiLearningSummaryRequest, parseAiLearningSummarySuccess,
  type AiLearningSummaryRequest, type AiLearningSummarySuccess,
} from "../../src/aiLearningSummaryContract.js";
import { OPENROUTER_MODEL, createAiRoute, readToolCall, type AiRouteTexts } from "../../server/aiRoute.js";

export const config = { maxDuration: 240 };

const TEXTS: AiRouteTexts = {
  rateLimited: "Gerade wurden zu viele Zusammenfassungen angefordert. Bitte versuche es in einer Minute erneut.",
  unavailable: "Zusammenfassungen können gerade nicht erstellt werden.",
  rejected: "OpenRouter hat die Zusammenfassungsanfrage abgelehnt.",
  failed: "Die KI konnte keine Zusammenfassung erstellen.",
  invalid: "Die KI-Antwort war ungültig oder wurde vorzeitig abgeschnitten. Versuche eine kürzere Fassung.",
  filtered: "Der Inhaltsfilter des KI-Anbieters hat die Zusammenfassung blockiert.",
  tool: "Die KI hat das Zusammenfassungswerkzeug nicht korrekt verwendet.",
  fields: "Die KI hat keine lesbaren Zusammenfassungsfelder geliefert.",
  unconfigured: "Die KI-Route ist noch nicht konfiguriert.",
  internal: "Die Zusammenfassung konnte nicht erstellt werden.",
};

export function buildSummaryToolPayload(input: AiLearningSummaryRequest) {
  const strings = (max: number) => ({ type: "array", items: { type: "string", minLength: 1, maxLength: max } });
  const block = {
    heading: { type: "string", minLength: 1, maxLength: 160 },
    paragraphs: { ...strings(6_000), maxItems: 12 },
    points: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["keyword", "text"], properties: {
      keyword: { type: "string", minLength: 1, maxLength: 80 }, text: { type: "string", minLength: 1, maxLength: 2_000 },
    } } },
    references: { type: "array", minItems: 1, items: { type: "string", pattern: "^m[1-9][0-9]{0,3}$" } },
  };
  const required = ["heading", "paragraphs", "points", "references"];
  return {
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: buildLearningSummaryPrompt(input) },
      { role: "user", content: JSON.stringify({ title: input.title, focus: input.settings.focus, decks: input.decks, material: input.units }) },
    ],
    tools: [{ type: "function", function: {
      name: "create_learning_summary",
      description: "Erstellt eine materialtreue, gegliederte deutsche Lernzusammenfassung gemäß der gewählten Einstellungen.",
      parameters: {
        type: "object", additionalProperties: false, required: ["sections", "warnings", "relations"],
        properties: {
          sections: { type: "array", minItems: 1, maxItems: 24, items: {
            type: "object", additionalProperties: false, required: [...required, "subsections"],
            properties: { ...block, subsections: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required, properties: block } } },
          } },
          warnings: { ...strings(600), maxItems: 8 },
          relations: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string", minLength: 1, maxLength: 160 }, to: { type: "string", minLength: 1, maxLength: 160 } } } },
        },
      },
    } }],
    tool_choice: { type: "function", function: { name: "create_learning_summary" } },
    reasoning: { effort: "medium" }, max_tokens: SUMMARY_OUTPUT_TOKENS[input.settings.length], stream: false,
    provider: { require_parameters: true, data_collection: "deny", zdr: true },
  };
}

export function extractGeneratedSummary(payload: unknown, input: AiLearningSummaryRequest): { result: AiLearningSummarySuccess; costUsd: number | null } {
  const { toolArguments, model, usage, costUsd } = readToolCall(payload, "create_learning_summary", TEXTS);
  const result = parseAiLearningSummarySuccess({ summary: toolArguments, model, privacyMode: "zdr", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, usage }, input);
  return { result, costUsd };
}

export const createSummaryHandler = createAiRoute({
  event: "ai_learning_summary",
  maxBytes: MAX_SUMMARY_REQUEST_BYTES,
  deadlineMs: AI_LEARNING_SUMMARY_DEADLINE_MS,
  promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION,
  texts: TEXTS,
  parse: parseAiLearningSummaryRequest,
  buildPayload: buildSummaryToolPayload,
  extract: (payload, input) => extractGeneratedSummary(payload, input).result,
  domainError: { type: AiLearningSummaryError, tooLarge: "material_too_large" },
});

export default createSummaryHandler();
