import * as v from "valibot";
import {
  AI_LEARNING_SUMMARY_PROMPT_VERSION, AiLearningSummaryError, MAX_SUMMARY_REQUEST_BYTES,
  SUMMARY_OUTPUT_TOKENS, buildLearningSummaryPrompt, parseAiLearningSummaryRequest, parseAiLearningSummarySuccess,
  type AiLearningSummaryRequest, type AiLearningSummarySuccess,
} from "../../src/aiLearningSummaryContract.js";
import {
  HttpError, OPENROUTER_CHAT_ENDPOINT, createAuthenticator, isAllowedOrigin, json,
  parseBearerToken, readJsonBody, selectModel, type Environment, type PrivacyMode,
} from "../../server/aiTextTool.js";

export const config = { maxDuration: 240 };
const PROVIDER_TIMEOUT_MS = 60_000;
const completionSchema = v.looseObject({
  model: v.optional(v.string()),
  choices: v.array(v.looseObject({
    finish_reason: v.optional(v.nullable(v.string())),
    message: v.looseObject({ tool_calls: v.array(v.looseObject({ function: v.looseObject({ name: v.string(), arguments: v.string() }) })) }),
  })),
  usage: v.optional(v.looseObject({ prompt_tokens: v.optional(v.number()), completion_tokens: v.optional(v.number()), total_tokens: v.optional(v.number()) })),
});

export function buildSummaryToolPayload(input: AiLearningSummaryRequest, model: string, privacyMode: PrivacyMode) {
  const strings = (max: number) => ({ type: "array", items: { type: "string", minLength: 1, maxLength: max } });
  return {
    model,
    messages: [
      { role: "system", content: buildLearningSummaryPrompt(input) },
      { role: "user", content: JSON.stringify({ title: input.title, focus: input.settings.focus, material: input.units }) },
    ],
    tools: [{ type: "function", function: {
      name: "create_learning_summary",
      description: "Erstellt eine materialtreue deutsche Lernzusammenfassung gemäß der gewählten Einstellungen.",
      parameters: {
        type: "object", additionalProperties: false, required: ["sections", "warnings"],
        properties: {
          sections: { type: "array", minItems: 1, maxItems: 24, items: {
            type: "object", additionalProperties: false, required: ["heading", "paragraphs", "points", "references"],
            properties: {
              heading: { type: "string", minLength: 1, maxLength: 160 },
              paragraphs: { ...strings(6_000), maxItems: 12 }, points: { ...strings(2_000), maxItems: 30 },
              references: { type: "array", maxItems: input.units.length, items: { type: "string", enum: input.units.map((unit) => unit.id) } },
            },
          } },
          warnings: { ...strings(600), maxItems: 8 },
        },
      },
    } }],
    tool_choice: { type: "function", function: { name: "create_learning_summary" } },
    reasoning: { effort: "none" }, max_tokens: SUMMARY_OUTPUT_TOKENS[input.settings.length], stream: false,
    provider: { require_parameters: true, data_collection: "deny", ...(privacyMode === "zdr" ? { zdr: true } : {}) },
  };
}

export function extractGeneratedSummary(payload: unknown, input: AiLearningSummaryRequest, model: string, privacyMode: PrivacyMode): AiLearningSummarySuccess {
  const parsed = v.safeParse(completionSchema, payload);
  if (!parsed.success || parsed.output.choices.length !== 1 || parsed.output.choices[0].finish_reason === "length") {
    throw new HttpError(502, "invalid_provider_response", "Die KI-Antwort war ungültig oder wurde vorzeitig abgeschnitten. Versuche eine kürzere Fassung.");
  }
  const calls = parsed.output.choices[0].message.tool_calls;
  if (calls.length !== 1 || calls[0].function.name !== "create_learning_summary") {
    throw new HttpError(502, "invalid_tool_call", "Die KI hat das Zusammenfassungswerkzeug nicht korrekt verwendet.");
  }
  let summary: unknown;
  try { summary = JSON.parse(calls[0].function.arguments); }
  catch { throw new HttpError(502, "invalid_tool_call", "Die KI hat keine lesbaren Zusammenfassungsfelder geliefert."); }
  const usage = parsed.output.usage;
  const count = (value: number | undefined) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  return parseAiLearningSummarySuccess({
    summary, model: parsed.output.model || model, privacyMode, promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION,
    usage: usage ? { promptTokens: count(usage.prompt_tokens), completionTokens: count(usage.completion_tokens), totalTokens: count(usage.total_tokens) } : null,
  }, input);
}

async function callSummaryTool(fetchImpl: typeof fetch, key: string, input: AiLearningSummaryRequest, selection: { model: string; privacyMode: PrivacyMode }) {
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_CHAT_ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "CoRe" },
      body: JSON.stringify(buildSummaryToolPayload(input, selection.model, selection.privacyMode)),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, "provider_unavailable", "Die KI ist gerade nicht erreichbar oder hat nicht rechtzeitig geantwortet.", true);
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new HttpError(502, "openrouter_auth_failed", "Der KI-Zugang auf dem Server wurde abgelehnt.");
    if (response.status === 429) throw new HttpError(429, "rate_limited", "Das kostenlose KI-Nutzungslimit ist momentan erreicht. Versuche es später erneut.", true);
    throw new HttpError(502, "provider_error", "Die KI konnte keine Zusammenfassung erstellen.", [404, 502, 503].includes(response.status));
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new HttpError(502, "invalid_provider_response", "Die KI-Antwort konnte nicht gelesen werden."); }
  return extractGeneratedSummary(payload, input, selection.model, selection.privacyMode);
}

export function createSummaryHandler({ env = process.env, fetchImpl = globalThis.fetch, authenticate }: {
  env?: Environment; fetchImpl?: typeof fetch; authenticate?: (accessToken: string) => Promise<string>;
} = {}) {
  const authenticateRequest = authenticate ?? createAuthenticator(env);
  return async (req: any, res: any) => {
    if (req.method !== "POST") { json(res, 405, { error: { code: "method_not_allowed", message: "Nur POST ist erlaubt." } }, { Allow: "POST" }); return; }
    if (!isAllowedOrigin(req)) { json(res, 403, { error: { code: "forbidden_origin", message: "Diese Anfrage ist nicht erlaubt." } }); return; }
    try {
      await authenticateRequest(parseBearerToken(req));
      const input = parseAiLearningSummaryRequest(await readJsonBody(req, MAX_SUMMARY_REQUEST_BYTES));
      const key = env.OPENROUTER_API_KEY;
      if (!key) throw new HttpError(503, "missing_openrouter_api_key", "Die KI-Route ist noch nicht konfiguriert.");
      const minimumContext = Buffer.byteLength(JSON.stringify(input), "utf8") + SUMMARY_OUTPUT_TOKENS[input.settings.length] + 8_192;
      const attempted = new Set<string>();
      let result: AiLearningSummarySuccess | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const selection = await selectModel(fetchImpl, key, attempted, minimumContext);
        attempted.add(selection.model);
        try { result = await callSummaryTool(fetchImpl, key, input, selection); break; }
        catch (error) { if (!(error instanceof HttpError) || !error.retryableAvailability || attempt === 1) throw error; }
      }
      json(res, 200, result, { "X-CoRe-Prompt-Version": AI_LEARNING_SUMMARY_PROMPT_VERSION });
    } catch (error) {
      const known = error instanceof HttpError || error instanceof AiLearningSummaryError;
      const status = error instanceof HttpError ? error.statusCode : error instanceof AiLearningSummaryError ? error.code.startsWith("invalid_") && error.code !== "invalid_request" ? 502 : error.code === "material_too_large" ? 413 : 400 : 500;
      json(res, status, { error: { code: known ? error.code : "internal_error", message: known ? error.message : "Die Zusammenfassung konnte nicht erstellt werden." } }, status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }
  };
}

export default createSummaryHandler();
