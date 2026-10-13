import { createClient } from "@supabase/supabase-js";
import * as v from "valibot";
import type { Database } from "../src/database.types.js";

export const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_REQUEST_TIMEOUT_MS = 30_000;

const modelSchema = v.looseObject({
  id: v.string(),
  context_length: v.optional(v.number()),
  pricing: v.looseObject({
    prompt: v.optional(v.nullable(v.string())),
    completion: v.optional(v.nullable(v.string())),
    request: v.optional(v.nullable(v.string())),
  }),
  architecture: v.looseObject({
    input_modalities: v.array(v.string()),
    output_modalities: v.array(v.string()),
  }),
  supported_parameters: v.array(v.string()),
});
const modelsResponseSchema = v.looseObject({ data: v.array(modelSchema) });
export type Environment = Record<string, string | undefined>;
export type PrivacyMode = "zdr" | "non_zdr";
type ModelCandidate = v.InferOutput<typeof modelSchema>;

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryableAvailability: boolean;

  constructor(statusCode: number, code: string, message: string, retryableAvailability = false) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryableAvailability = retryableAvailability;
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
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) {
      throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "invalid_json", "Die Anfrage enthält kein gültiges JSON."); }
}

export function parseBearerToken(req: any): string {
  const match = /^Bearer\s+(\S+)$/i.exec(firstHeaderValue(req.headers?.authorization));
  if (!match) throw new HttpError(401, "unauthorized", "Bitte melde dich erneut an.");
  return match[1];
}

export function createAuthenticator(env: Environment) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return async (accessToken: string) => {
    if (!url || !publishableKey) throw new HttpError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
    const client = createClient<Database>(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    try {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) throw new HttpError(401, "unauthorized", "Deine Sitzung ist ungültig oder abgelaufen.");
      return data.user.id;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
    }
  };
}

function isZeroPrice(value: string | null | undefined) {
  return value == null || Number(value) === 0;
}

export function isEligibleFreeTextToolModel(model: ModelCandidate, excludedIds = new Set<string>(), minimumContext = 0): boolean {
  const parameters = new Set(model.supported_parameters);
  const inputs = new Set(model.architecture.input_modalities);
  return model.id.endsWith(":free")
    && !excludedIds.has(model.id)
    && (minimumContext === 0 || (model.context_length ?? 0) >= minimumContext)
    && isZeroPrice(model.pricing.prompt)
    && isZeroPrice(model.pricing.completion)
    && isZeroPrice(model.pricing.request)
    && inputs.has("text")
    && model.architecture.output_modalities.includes("text")
    && ["tools", "tool_choice", "max_tokens", "reasoning"].every((parameter) => parameters.has(parameter));
}

function modelsUrl(zdr: boolean) {
  const query = new URLSearchParams({
    input_modalities: "text",
    supported_parameters: "tools,tool_choice,max_tokens,reasoning",
    sort: "most-popular",
    max_price: "0",
    ...(zdr ? { zdr: "true" } : {}),
  });
  return `${OPENROUTER_MODELS_ENDPOINT}?${query}`;
}

const MODEL_CATALOG_TTL_MS = 60_000;
const modelCatalogCache = new WeakMap<typeof fetch, Map<PrivacyMode, { expiresAt: number; candidates: ModelCandidate[] }>>();

async function modelCatalog(fetchImpl: typeof fetch, apiKey: string, privacyMode: PrivacyMode) {
  let cache = modelCatalogCache.get(fetchImpl);
  if (!cache) { cache = new Map(); modelCatalogCache.set(fetchImpl, cache); }
  const cached = cache.get(privacyMode);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;
  let response: Response;
  try {
    response = await fetchImpl(modelsUrl(privacyMode === "zdr"), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, "model_catalog_unavailable", "Die kostenlose Modellauswahl ist gerade nicht erreichbar.");
  }
  if (!response.ok) throw new HttpError(502, "model_catalog_unavailable", "Die kostenlose Modellauswahl ist gerade nicht erreichbar.");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new HttpError(502, "model_catalog_invalid", "Die kostenlose Modellauswahl hatte ein ungültiges Format."); }
  const parsed = v.safeParse(modelsResponseSchema, payload);
  if (!parsed.success) throw new HttpError(502, "model_catalog_invalid", "Die kostenlose Modellauswahl hatte ein ungültiges Format.");
  cache.set(privacyMode, { expiresAt: Date.now() + MODEL_CATALOG_TTL_MS, candidates: parsed.output.data });
  return parsed.output.data;
}

export async function selectModel(fetchImpl: typeof fetch, apiKey: string, excludedIds = new Set<string>(), minimumContext = 0) {
  for (const privacyMode of ["zdr", "non_zdr"] as const) {
    const candidates = await modelCatalog(fetchImpl, apiKey, privacyMode);
    const model = candidates.find((candidate) => isEligibleFreeTextToolModel(candidate, excludedIds, minimumContext));
    if (model) return { model: model.id, privacyMode };
  }
  throw new HttpError(503, "no_free_model", "Aktuell ist kein passendes kostenloses Tool-Modell verfügbar.");
}
