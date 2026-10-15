import {
  AI_LEARNING_SUMMARY_DEADLINE_MS, AI_LEARNING_SUMMARY_PROMPT_VERSION, AiLearningSummaryError, MAX_SUMMARY_REQUEST_BYTES,
  SUMMARY_OUTPUT_TOKENS, buildLearningSummaryPrompt, parseAiLearningSummaryRequest, parseAiLearningSummarySuccess,
  type AiLearningSummaryRequest, type AiLearningSummarySuccess,
} from "../../src/aiLearningSummaryContract.js";
import {
  HttpError, OPENROUTER_MODEL, createAuthenticator, isAllowedOrigin, json, logAiRoute, parseBearerToken, readJsonBody,
  readToolCall, requestOpenRouter, type AiRouteLogEntry, type Environment, type ProviderTexts,
} from "../../server/aiRoute.js";

export const config = { maxDuration: 240 };

const TEXTS: ProviderTexts = {
  rateLimited: "Gerade wurden zu viele Zusammenfassungen angefordert. Bitte versuche es in einer Minute erneut.",
  unavailable: "Zusammenfassungen können gerade nicht erstellt werden.",
  rejected: "OpenRouter hat die Zusammenfassungsanfrage abgelehnt.",
  failed: "Die KI konnte keine Zusammenfassung erstellen.",
  invalid: "Die KI-Antwort war ungültig oder wurde vorzeitig abgeschnitten. Versuche eine kürzere Fassung.",
  tool: "Die KI hat das Zusammenfassungswerkzeug nicht korrekt verwendet.",
  fields: "Die KI hat keine lesbaren Zusammenfassungsfelder geliefert.",
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
    reasoning: { effort: "low" }, max_tokens: SUMMARY_OUTPUT_TOKENS[input.settings.length], stream: false,
    provider: { require_parameters: true, data_collection: "deny", zdr: true },
  };
}

export function extractGeneratedSummary(payload: unknown, input: AiLearningSummaryRequest): { result: AiLearningSummarySuccess; costUsd: number | null } {
  const { toolArguments, model, usage, costUsd } = readToolCall(payload, "create_learning_summary", TEXTS);
  const result = parseAiLearningSummarySuccess({ summary: toolArguments, model, privacyMode: "zdr", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, usage }, input);
  return { result, costUsd };
}

export function createSummaryHandler({ env = process.env, fetchImpl = globalThis.fetch, authenticate, log = logAiRoute }: {
  env?: Environment; fetchImpl?: typeof fetch; authenticate?: (accessToken: string) => Promise<string>; log?: (entry: AiRouteLogEntry) => void;
} = {}) {
  const authenticateRequest = authenticate ?? createAuthenticator(env);
  return async (req: any, res: any) => {
    if (req.method !== "POST") { json(res, 405, { error: { code: "method_not_allowed", message: "Nur POST ist erlaubt." } }, { Allow: "POST" }); return; }
    if (!isAllowedOrigin(req)) { json(res, 403, { error: { code: "forbidden_origin", message: "Diese Anfrage ist nicht erlaubt." } }); return; }
    const startedAt = Date.now();
    let generating = false;
    try {
      await authenticateRequest(parseBearerToken(req));
      const input = parseAiLearningSummaryRequest(await readJsonBody(req, MAX_SUMMARY_REQUEST_BYTES));
      if (!env.OPENROUTER_API_KEY) throw new HttpError(503, "missing_openrouter_api_key", "Die KI-Route ist noch nicht konfiguriert.");
      generating = true;
      const payload = await requestOpenRouter(fetchImpl, env.OPENROUTER_API_KEY, buildSummaryToolPayload(input), AbortSignal.timeout(AI_LEARNING_SUMMARY_DEADLINE_MS), TEXTS);
      const { result, costUsd } = extractGeneratedSummary(payload, input);
      log({ event: "ai_learning_summary", outcome: "ok", status: 200, latencyMs: Date.now() - startedAt, model: result.model, totalTokens: result.usage?.totalTokens ?? null, costUsd });
      json(res, 200, result, { "X-CoRe-Prompt-Version": AI_LEARNING_SUMMARY_PROMPT_VERSION });
    } catch (error) {
      const known = error instanceof HttpError || error instanceof AiLearningSummaryError;
      const status = error instanceof HttpError ? error.statusCode : error instanceof AiLearningSummaryError ? error.code.startsWith("invalid_") && error.code !== "invalid_request" ? 502 : error.code === "material_too_large" ? 413 : 400 : 500;
      const code = known ? error.code : "internal_error";
      if (generating) log({ event: "ai_learning_summary", outcome: code, status, latencyMs: Date.now() - startedAt, model: null, totalTokens: null, costUsd: null });
      json(res, status, { error: { code, message: known ? error.message : "Die Zusammenfassung konnte nicht erstellt werden." } }, status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }
  };
}

export default createSummaryHandler();
