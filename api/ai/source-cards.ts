import {
  AI_SOURCE_CARDS_DEADLINE_MS, AI_SOURCE_CARDS_PROMPT_VERSION, AiSourceCardsError, MAX_SOURCE_CARDS_OUTPUT_TOKENS, MAX_SOURCE_CARDS_PER_PORTION,
  MAX_SOURCE_CARDS_REQUEST_BYTES, SOURCE_CARD_LIMITS, buildSourceCardsPrompt, parseAiSourceCardsRequest, parseGeneratedSourceCards,
  type AiSourceCardsRequest, type GeneratedSourceCards,
} from "../../src/aiSourceCardsContract.js";
import { AI_SOURCE_CARD_FORMS } from "../../src/aiSourceCreation.js";
import {
  HttpError, OPENROUTER_MODEL, createAuthenticator, isAllowedOrigin, json, logAiRoute, parseBearerToken, readJsonBody,
  readToolCall, requestOpenRouter, type AiRouteLogEntry, type Environment, type ProviderTexts,
} from "../../server/aiRoute.js";

export const config = { maxDuration: 240 };

const TEXTS: ProviderTexts = {
  rateLimited: "Gerade wurden zu viele Karten angefordert. Bitte versuche es in einer Minute erneut.",
  unavailable: "Karten können gerade nicht erstellt werden.",
  rejected: "OpenRouter hat die Kartenanfrage abgelehnt.",
  failed: "Die KI konnte keine Karten erstellen.",
  invalid: "Die KI-Antwort war ungültig oder wurde vorzeitig abgeschnitten.",
  tool: "Die KI hat das Kartenwerkzeug nicht korrekt verwendet.",
  fields: "Die KI hat keine lesbaren Kartenfelder geliefert.",
};

interface AiSourceCardsSuccess extends GeneratedSourceCards {
  model: string;
  privacyMode: "zdr";
  promptVersion: typeof AI_SOURCE_CARDS_PROMPT_VERSION;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } | null;
}

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

type Billing = Pick<AiRouteLogEntry, "model" | "totalTokens" | "costUsd">;

/** `billed` receives model, tokens and costs as soon as the answer is read, so a rejected answer still logs its costs. */
export function extractGeneratedSourceCards(payload: unknown, input: AiSourceCardsRequest, billed: (billing: Billing) => void = () => undefined): AiSourceCardsSuccess {
  const { toolArguments, model, usage, costUsd } = readToolCall(payload, "create_source_cards", TEXTS);
  billed({ model, totalTokens: usage?.totalTokens ?? null, costUsd });
  return { ...parseGeneratedSourceCards(toolArguments, input), model, privacyMode: "zdr", promptVersion: AI_SOURCE_CARDS_PROMPT_VERSION, usage };
}

export function createSourceCardsHandler({ env = process.env, fetchImpl = globalThis.fetch, authenticate, log = logAiRoute }: {
  env?: Environment; fetchImpl?: typeof fetch; authenticate?: (accessToken: string) => Promise<string>; log?: (entry: AiRouteLogEntry) => void;
} = {}) {
  const authenticateRequest = authenticate ?? createAuthenticator(env);
  return async (req: any, res: any) => {
    if (req.method !== "POST") { json(res, 405, { error: { code: "method_not_allowed", message: "Nur POST ist erlaubt." } }, { Allow: "POST" }); return; }
    if (!isAllowedOrigin(req)) { json(res, 403, { error: { code: "forbidden_origin", message: "Diese Anfrage ist nicht erlaubt." } }); return; }
    const startedAt = Date.now();
    let generating = false;
    let billing: Billing = { model: null, totalTokens: null, costUsd: null };
    try {
      await authenticateRequest(parseBearerToken(req));
      const input = parseAiSourceCardsRequest(await readJsonBody(req, MAX_SOURCE_CARDS_REQUEST_BYTES));
      if (!env.OPENROUTER_API_KEY) throw new HttpError(503, "missing_openrouter_api_key", "Die KI-Route ist noch nicht konfiguriert.");
      generating = true;
      const payload = await requestOpenRouter(fetchImpl, env.OPENROUTER_API_KEY, buildSourceCardsToolPayload(input), AbortSignal.timeout(AI_SOURCE_CARDS_DEADLINE_MS), TEXTS);
      const result = extractGeneratedSourceCards(payload, input, (billed) => { billing = billed; });
      log({ event: "ai_source_cards", outcome: "ok", status: 200, latencyMs: Date.now() - startedAt, ...billing });
      json(res, 200, result, { "X-CoRe-Prompt-Version": AI_SOURCE_CARDS_PROMPT_VERSION });
    } catch (error) {
      const known = error instanceof HttpError || error instanceof AiSourceCardsError;
      const status = error instanceof HttpError ? error.statusCode
        : error instanceof AiSourceCardsError ? error.code === "invalid_response" ? 502 : error.code === "portion_too_large" ? 413 : 400 : 500;
      const code = known ? error.code : "internal_error";
      if (generating) log({ event: "ai_source_cards", outcome: code, status, latencyMs: Date.now() - startedAt, ...billing });
      json(res, status, { error: { code, message: known ? error.message : "Die Karten konnten nicht erstellt werden." } }, status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }
  };
}

export default createSourceCardsHandler();
