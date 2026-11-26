import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import * as v from "valibot";
import type { Database } from "../src/database.types.js";

export const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "openai/gpt-6-luna";

type Environment = Record<string, string | undefined>;

export interface ProviderTexts {
  rateLimited: string;
  unavailable: string;
  rejected: string;
  failed: string;
  invalid: string;
  filtered: string;
  tool: string;
  fields: string;
}

export interface AiRouteTexts extends ProviderTexts {
  unconfigured: string;
  internal: string;
}

type AiRouteLogEntry = {
  event: "ai_card_variant" | "ai_card_help" | "ai_learning_summary" | "ai_source_cards";
  outcome: string;
  status: number;
  latencyMs: number;
  model: string | null;
  totalTokens: number | null;
  costUsd: number | null;
};

const completionSchema = v.looseObject({
  model: v.optional(v.string()),
  choices: v.array(v.looseObject({
    finish_reason: v.optional(v.nullable(v.string())),
    message: v.looseObject({ tool_calls: v.optional(v.array(v.looseObject({ function: v.looseObject({ name: v.string(), arguments: v.string() }) })), []) }),
  })),
  usage: v.optional(v.looseObject({
    prompt_tokens: v.optional(v.number()),
    completion_tokens: v.optional(v.number()),
    total_tokens: v.optional(v.number()),
    cost: v.optional(v.number()),
  })),
});
const providerErrorSchema = v.looseObject({
  error: v.looseObject({
    metadata: v.optional(v.looseObject({ limit_source: v.optional(v.string()) })),
  }),
});

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function firstHeaderValue(value: unknown): string {
  return String(Array.isArray(value) ? value[0] : value ?? "").split(",")[0].trim();
}

function json(res: any, statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

export function isAllowedOrigin(req: any): boolean {
  const origin = firstHeaderValue(req.headers?.origin);
  if (!origin) return false;
  const host = firstHeaderValue(req.headers?.["x-forwarded-host"] || req.headers?.host);
  if (!host) return false;
  const protocol = firstHeaderValue(req.headers?.["x-forwarded-proto"])
    || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export async function readJsonBody(req: any, maxBytes: number): Promise<unknown> {
  const contentLength = Number(firstHeaderValue(req.headers?.["content-length"]));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
  }
  if (req.body != null) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
    }
    if (typeof req.body !== "string") return req.body;
    try { return JSON.parse(req.body); } catch { throw new HttpError(400, "invalid_json", "Die Anfrage enthält kein gültiges JSON."); }
  }
  // Collect bytes, not strings: a multibyte character may span two chunks.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
    }
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "invalid_json", "Die Anfrage enthält kein gültiges JSON."); }
}

export function parseBearerToken(req: any): string {
  const match = /^Bearer\s+(\S+)$/i.exec(firstHeaderValue(req.headers?.authorization));
  if (!match) throw new HttpError(401, "unauthorized", "Bitte melde dich erneut an.");
  return match[1];
}

/** The client and its cached JWKS live as long as the function instance; the JWT is verified locally. */
function createAuthenticator(env: Environment) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const client = url && publishableKey
    ? createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    : null;
  return async (accessToken: string) => {
    const unavailable = () => new HttpError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
    if (!client) throw unavailable();
    const { data, error } = await client.auth.getClaims(accessToken).catch(() => { throw unavailable(); });
    if (isAuthRetryableFetchError(error)) throw unavailable();
    const claims = data?.claims;
    if (error || claims?.role !== "authenticated" || !claims.sub) throw new HttpError(401, "unauthorized", "Deine Sitzung ist ungültig oder abgelaufen.");
    return claims.sub;
  };
}

export function classifyProviderError(status: number, payload: unknown, texts: ProviderTexts): HttpError {
  const parsed = v.safeParse(providerErrorSchema, payload);
  const metadata = parsed.success ? parsed.output.error.metadata : undefined;
  if (status === 429) return new HttpError(429, "rate_limited", texts.rateLimited);
  if (status === 402 || (status === 403 && metadata?.limit_source)) return new HttpError(503, "provider_budget_exhausted", texts.unavailable);
  if (status === 401 || status === 403) return new HttpError(503, "openrouter_auth_failed", texts.unavailable);
  if (status === 400) return new HttpError(502, "provider_request_rejected", texts.rejected);
  if (status === 404) return new HttpError(503, "no_provider_endpoint", "Aktuell erfüllt kein Modellendpunkt die Datenschutz- und Werkzeuganforderungen.");
  return new HttpError(502, "provider_error", texts.failed);
}

export async function requestOpenRouter(fetchImpl: typeof fetch, apiKey: string, body: unknown, deadline: AbortSignal, texts: ProviderTexts): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "CoRe",
      },
      body: JSON.stringify(body),
      signal: deadline,
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new HttpError(502, timedOut ? "provider_timeout" : "provider_unavailable", timedOut ? "Das Modell hat nicht rechtzeitig geantwortet." : "Das Modell ist gerade nicht erreichbar.");
  }
  const payload: unknown = await response.json().catch(() => null);
  // Generation errors may arrive with HTTP 200 and an error body.
  if (!response.ok || v.is(providerErrorSchema, payload)) throw classifyProviderError(response.status, payload, texts);
  return payload;
}

function usageValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

type Billing = Pick<AiRouteLogEntry, "model" | "totalTokens" | "costUsd">;

const billingSchema = v.looseObject({
  model: v.optional(v.string()),
  usage: v.optional(v.looseObject({ total_tokens: v.optional(v.unknown()), cost: v.optional(v.unknown()) })),
});

/** Readable even when the answer itself is cut off or unusable. */
export function readBilling(payload: unknown): Billing {
  const parsed = v.safeParse(billingSchema, payload);
  const output = parsed.success ? parsed.output : {};
  return { model: output.model || null, totalTokens: usageValue(output.usage?.total_tokens), costUsd: usageValue(output.usage?.cost) };
}

/** The caller validates the arguments. */
export function readToolCall(payload: unknown, tool: string, texts: ProviderTexts) {
  const completion = v.safeParse(completionSchema, payload);
  if (!completion.success || completion.output.choices.length !== 1 || completion.output.choices[0].finish_reason === "length") {
    throw new HttpError(502, "invalid_provider_response", texts.invalid);
  }
  if (completion.output.choices[0].finish_reason === "content_filter") throw new HttpError(502, "content_filter", texts.filtered);
  const toolCalls = completion.output.choices[0].message.tool_calls;
  if (toolCalls.length !== 1 || toolCalls[0].function.name !== tool) throw new HttpError(502, "invalid_tool_call", texts.tool);
  let toolArguments: unknown;
  try { toolArguments = JSON.parse(toolCalls[0].function.arguments); } catch { throw new HttpError(502, "invalid_tool_call", texts.fields); }
  const usage = completion.output.usage;
  return {
    toolArguments,
    model: completion.output.model || OPENROUTER_MODEL,
    usage: usage ? {
      promptTokens: usageValue(usage.prompt_tokens),
      completionTokens: usageValue(usage.completion_tokens),
      totalTokens: usageValue(usage.total_tokens),
    } : null,
    costUsd: usageValue(usage?.cost),
  };
}

function logAiRoute(entry: AiRouteLogEntry) {
  console.info(JSON.stringify(entry));
}

interface AiRoute<Input, Result extends { model: string }> {
  event: AiRouteLogEntry["event"];
  maxBytes: number;
  deadlineMs: number;
  promptVersion: string;
  texts: AiRouteTexts;
  parse(body: unknown): Input;
  buildPayload(input: Input): unknown;
  extract(payload: unknown, input: Input): Result;
  /** Its errors answer 400 from `parse` (413 for the code `tooLarge`) and 502 from `extract`. */
  domainError?: { type: abstract new (...args: never[]) => Error & { code: string }; tooLarge: string };
}

export function createAiRoute<Input, Result extends { model: string }>(route: AiRoute<Input, Result>) {
  function toHttpError(error: unknown, generating: boolean): HttpError {
    if (error instanceof HttpError) return error;
    const domain = route.domainError;
    if (domain && error instanceof domain.type) {
      return new HttpError(generating ? 502 : error.code === domain.tooLarge ? 413 : 400, error.code, error.message);
    }
    return new HttpError(500, "internal_error", route.texts.internal);
  }

  return function createHandler({ env = process.env, fetchImpl = globalThis.fetch, authenticate, log = logAiRoute }: {
    env?: Environment;
    fetchImpl?: typeof fetch;
    authenticate?: (accessToken: string) => Promise<string>;
    log?: (entry: AiRouteLogEntry) => void;
  } = {}) {
    const authenticateRequest = authenticate ?? createAuthenticator(env);
    return async function handler(req: any, res: any) {
      if (req.method !== "POST") {
        json(res, 405, { error: { code: "method_not_allowed", message: "Nur POST ist erlaubt." } }, { Allow: "POST" });
        return;
      }
      if (!isAllowedOrigin(req)) {
        json(res, 403, { error: { code: "forbidden_origin", message: "Diese Anfrage ist nicht erlaubt." } });
        return;
      }
      const startedAt = Date.now();
      let billing: Billing | null = null;
      try {
        await authenticateRequest(parseBearerToken(req));
        const apiKey = env.OPENROUTER_API_KEY;
        if (!apiKey) throw new HttpError(503, "missing_openrouter_api_key", route.texts.unconfigured);
        const input = route.parse(await readJsonBody(req, route.maxBytes));

        billing = { model: null, totalTokens: null, costUsd: null };
        const payload = await requestOpenRouter(fetchImpl, apiKey, route.buildPayload(input), AbortSignal.timeout(route.deadlineMs), route.texts);
        // Read before extracting, so a cut-off or rejected answer still logs what it cost.
        billing = readBilling(payload);
        const result = route.extract(payload, input);
        log({ event: route.event, outcome: "ok", status: 200, latencyMs: Date.now() - startedAt, ...billing, model: result.model });
        json(res, 200, result, { "X-CoRe-Prompt-Version": route.promptVersion });
      } catch (caught) {
        const error = toHttpError(caught, billing !== null);
        if (billing) log({ event: route.event, outcome: error.code, status: error.statusCode, latencyMs: Date.now() - startedAt, ...billing });
        json(res, error.statusCode, { error: { code: error.code, message: error.message } }, error.statusCode === 401 ? { "WWW-Authenticate": "Bearer" } : {});
      }
    };
  };
}
