import {
  AI_SOURCE_CARDS_DEADLINE_MS, AI_SOURCE_CARDS_PROMPT_VERSION, AiSourceCardsError, MAX_SOURCE_CARDS_OUTPUT_TOKENS, MAX_SOURCE_CARDS_PER_PORTION,
  MAX_SOURCE_CARDS_REQUEST_BYTES, SOURCE_CARD_LIMITS, buildSourceCardsPrompt, parseAiSourceCardsRequest, parseGeneratedSourceCards,
  type AiSourceCardsRequest, type AiSourceCardsSuccess,
} from "../../src/aiSourceCardsContract.js";
import { AI_SOURCE_CARD_FORMS } from "../../src/aiSourceCreation.js";
import { OPENROUTER_MODEL, createAiRoute, readToolCall, type AiRouteTexts } from "../../server/aiRoute.js";

export const config = { maxDuration: 240 };

const TEXTS: AiRouteTexts = {
  rateLimited: "Gerade wurden zu viele Karten angefordert. Bitte versuche es in einer Minute erneut.",
  unavailable: "Karten können gerade nicht erstellt werden.",
  rejected: "OpenRouter hat die Kartenanfrage abgelehnt.",
  failed: "Die KI konnte keine Karten erstellen.",
  invalid: "Die KI-Antwort war ungültig oder wurde vorzeitig abgeschnitten.",
  filtered: "Der Inhaltsfilter des KI-Anbieters hat diesen Abschnitt der Quelle blockiert.",
  tool: "Die KI hat das Kartenwerkzeug nicht korrekt verwendet.",
  fields: "Die KI hat keine lesbaren Kartenfelder geliefert.",
  unconfigured: "Die KI-Route ist noch nicht konfiguriert.",
  internal: "Die Karten konnten nicht erstellt werden.",
};

export function buildSourceCardsToolPayload(input: AiSourceCardsRequest) {
  const string = (maxLength: number, minLength = 0) => ({ type: "string", minLength, maxLength });
  return {
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: buildSourceCardsPrompt(input) },
      { role: "user", content: JSON.stringify({ material: input.units, avoid: input.avoid }) },
    ],
    tools: [{ type: "function", function: {
      name: "create_source_cards",
      description: "Erstellt belegte Lernkarten in den erlaubten Kartenformen aus dem gelieferten Abschnitt einer Quelle.",
      parameters: {
        type: "object", additionalProperties: false, required: ["cards", "warnings"],
        properties: {
          cards: { type: "array", maxItems: Math.min(input.limit, MAX_SOURCE_CARDS_PER_PORTION), items: {
            type: "object", additionalProperties: false, required: ["form", "front", "back", "options", "explanation", "sources"],
            properties: {
              form: { type: "string", enum: AI_SOURCE_CARD_FORMS.map(({ value }) => value).filter((form) => input.settings.cardForms.includes(form)) },
              front: string(SOURCE_CARD_LIMITS.text, 1),
              back: string(SOURCE_CARD_LIMITS.text),
              options: { type: "array", maxItems: SOURCE_CARD_LIMITS.options, items: { type: "object", additionalProperties: false, required: ["text", "correct"], properties: { text: string(SOURCE_CARD_LIMITS.text, 1), correct: { type: "boolean" } } } },
              explanation: string(SOURCE_CARD_LIMITS.explanation),
              sources: { type: "array", minItems: 1, maxItems: SOURCE_CARD_LIMITS.sources, items: { type: "string", enum: input.units.map((unit) => unit.id) } },
            },
          } },
          warnings: { type: "array", maxItems: SOURCE_CARD_LIMITS.warnings, items: string(SOURCE_CARD_LIMITS.warning, 1) },
        },
      },
    } }],
    tool_choice: { type: "function", function: { name: "create_source_cards" } },
    reasoning: { effort: "low" }, max_tokens: MAX_SOURCE_CARDS_OUTPUT_TOKENS, stream: false,
    provider: { require_parameters: true, data_collection: "deny", zdr: true },
  };
}

export function extractGeneratedSourceCards(payload: unknown, input: AiSourceCardsRequest): AiSourceCardsSuccess {
  const { toolArguments, model, usage } = readToolCall(payload, "create_source_cards", TEXTS);
  return { ...parseGeneratedSourceCards(toolArguments, input), model, privacyMode: "zdr", promptVersion: AI_SOURCE_CARDS_PROMPT_VERSION, usage };
}

export const createSourceCardsHandler = createAiRoute({
  event: "ai_source_cards",
  maxBytes: MAX_SOURCE_CARDS_REQUEST_BYTES,
  deadlineMs: AI_SOURCE_CARDS_DEADLINE_MS,
  promptVersion: AI_SOURCE_CARDS_PROMPT_VERSION,
  texts: TEXTS,
  parse: parseAiSourceCardsRequest,
  buildPayload: buildSourceCardsToolPayload,
  extract: extractGeneratedSourceCards,
  domainError: { type: AiSourceCardsError, tooLarge: "portion_too_large" },
});

export default createSourceCardsHandler();
