import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import * as v from "valibot";
import type { Database } from "../src/database.types.js";

export const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Chosen in the 2026-10 playtest; low reasoning guards the meaning when the sentence structure changes (ADR-011). */
export const OPENROUTER_MODEL = "openai/gpt-6-luna";

export type Environment = Record<string, string | undefined>;

/** Route-specific wording for provider failures; codes and statuses stay shared. */
export interface ProviderTexts {
  rateLimited: string;
  unavailable: string;
  rejected: string;
  failed: string;
  invalid: string;
  tool: string;
  fields: string;
}

export type AiRouteLogEntry = {
  event: "ai_card_variant" | "ai_learning_summary";
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

export function json(res: any, statusCode: number, body: unknown, headers: Record<string, string> = {}) {
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

/** Verifies the session JWT locally against the cached JWKS; the client lives as long as the function instance. */
export function createAuthenticator(env: Environment) {
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

/** Maps an OpenRouter failure to a stable code; budget and key problems stay neutral for users. */
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

/** Sends one chat completion and returns its unvalidated JSON; transport and provider failures become HttpErrors. */
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

/** Reads the single forced tool call of a complete response; the caller validates its arguments. */
export function readToolCall(payload: unknown, tool: string, texts: ProviderTexts) {
  const completion = v.safeParse(completionSchema, payload);
  if (!completion.success || completion.output.choices.length !== 1 || completion.output.choices[0].finish_reason === "length") {
    throw new HttpError(502, "invalid_provider_response", texts.invalid);
  }
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

export function logAiRoute(entry: AiRouteLogEntry) {
  console.info(JSON.stringify(entry));
}
