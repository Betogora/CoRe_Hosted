import { createHash, createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import * as v from "valibot";
import { parseAiChatConsent, parseAiChatSuccess } from "../../src/aiChatContract.ts";
import type { AiChatRequest, AiChatSuccess } from "../../src/aiChatContract.ts";
import type { Database } from "../../src/database.types.ts";

const USER_LIMIT = 20;
const IP_LIMIT = 200;
const RATE_WINDOW = "10 m";
const IDEMPOTENCY_PENDING_SECONDS = 90;
const IDEMPOTENCY_COMPLETE_SECONDS = 10 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const profilePrivacyRowSchema = v.strictObject({
  privacy: v.record(v.string(), v.unknown()),
});

type ProtectionEnv = Record<string, string | undefined>;
type RateLimitResult = { success: boolean; reset: number };
type RateLimiterLike = { limit(identifier: string): Promise<RateLimitResult> };
type RedisLike = {
  get<TData = unknown>(key: string): Promise<TData | null>;
  set<TData>(key: string, value: TData, options?: any): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

interface AuthenticatedAiUser {
  userId: string;
  consent: unknown;
}

interface ChatProtectionOverrides {
  redis?: RedisLike;
  ipLimiter?: RateLimiterLike;
  userLimiter?: RateLimiterLike;
  authenticate?: (accessToken: string) => Promise<AuthenticatedAiUser>;
  now?: () => number;
}

export interface ChatExecutionContext {
  userId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

interface ProtectedChatInput {
  req: any;
  parseRequest: () => Promise<AiChatRequest>;
  execute: (input: AiChatRequest, context: ChatExecutionContext) => Promise<AiChatSuccess>;
}

type PendingEntry = { state: "pending"; requestHash: string };
type CompleteEntry = { state: "complete"; requestHash: string; response: AiChatSuccess };
type IdempotencyEntry = PendingEntry | CompleteEntry;

export class ChatProtectionError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly headers: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.headers = headers;
  }
}

function firstHeaderValue(value: unknown): string {
  return String(Array.isArray(value) ? value[0] : value ?? "")
    .split(",")[0]
    .trim();
}

function protectionUnavailable(message = "Der KI-Schutz ist vorübergehend nicht verfügbar.") {
  return new ChatProtectionError(503, "protection_unavailable", message);
}

function resolveRedis(env: ProtectionEnv): Redis {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw protectionUnavailable("Der KI-Schutz ist nicht konfiguriert.");
  return new Redis({ url, token });
}

function resolveNamespace(env: ProtectionEnv): string {
  return `core:ai-chat:v1:${env.VERCEL_ENV || "development"}`;
}

function digestIdentifier(secret: string, namespace: string, kind: string, value: string): string {
  return createHmac("sha256", secret).update(`${namespace}:${kind}:${value}`).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function requestHash(input: AiChatRequest): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

function parseBearerToken(req: any): string {
  const authorization = firstHeaderValue(req.headers?.authorization);
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    throw new ChatProtectionError(
      401,
      "unauthorized",
      "Bitte melde dich erneut an.",
      { "WWW-Authenticate": "Bearer" },
    );
  }
  return match[1];
}

function resolveClientIp(req: any, env: ProtectionEnv): string {
  const forwardedIp = firstHeaderValue(req.headers?.["x-forwarded-for"]);
  if (forwardedIp) return forwardedIp;
  if (env.VERCEL_ENV === "production") {
    throw protectionUnavailable("Die Client-Adresse konnte nicht verifiziert werden.");
  }
  return firstHeaderValue(req.socket?.remoteAddress) || "local-development";
}

function parseIdempotencyKey(req: any): string {
  const key = firstHeaderValue(req.headers?.["idempotency-key"]);
  if (!UUID_PATTERN.test(key)) {
    throw new ChatProtectionError(400, "invalid_idempotency_key", "Idempotency-Key muss eine UUID sein.");
  }
  return key;
}

function retryAfterSeconds(reset: number, now: number): string {
  return String(Math.max(1, Math.ceil((reset - now) / 1_000)));
}

async function enforceRateLimit(limiter: RateLimiterLike, identifier: string, now: number): Promise<void> {
  let result: RateLimitResult;
  try {
    result = await limiter.limit(identifier);
  } catch {
    throw protectionUnavailable();
  }
  if (!result.success) {
    throw new ChatProtectionError(
      429,
      "rate_limited",
      "Zu viele KI-Anfragen. Bitte warte kurz.",
      { "Retry-After": retryAfterSeconds(result.reset, now) },
    );
  }
}

function createSupabaseAuthenticator(env: ProtectionEnv) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return async () => {
      throw new ChatProtectionError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
    };
  }

  return async (accessToken: string): Promise<AuthenticatedAiUser> => {
    const client = createClient<Database>(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    let userResult;
    try {
      userResult = await client.auth.getUser(accessToken);
    } catch {
      throw new ChatProtectionError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
    }

    if (userResult.error || !userResult.data.user) {
      const status = Number(userResult.error?.status ?? 0);
      if (status && status !== 401 && status !== 403) {
        throw new ChatProtectionError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
      }
      throw new ChatProtectionError(
        401,
        "unauthorized",
        "Deine Sitzung ist ungültig oder abgelaufen.",
        { "WWW-Authenticate": "Bearer" },
      );
    }

    let profileResult;
    try {
      profileResult = await client.from("profiles").select("privacy").eq("id", userResult.data.user.id).maybeSingle();
    } catch {
      throw new ChatProtectionError(503, "auth_unavailable", "Die KI-Einwilligung kann gerade nicht geprüft werden.");
    }
    if (profileResult.error) {
      throw new ChatProtectionError(503, "auth_unavailable", "Die KI-Einwilligung kann gerade nicht geprüft werden.");
    }
    if (!profileResult.data) {
      return { userId: userResult.data.user.id, consent: null };
    }
    const profile = v.safeParse(profilePrivacyRowSchema, profileResult.data);
    if (!profile.success) {
      throw new ChatProtectionError(503, "auth_unavailable", "Die KI-Einwilligung hat ein ungültiges Format.");
    }

    return {
      userId: userResult.data.user.id,
      consent: profile.output.privacy.aiChatConsent,
    };
  };
}

function parseStoredEntry(value: unknown): IdempotencyEntry | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as IdempotencyEntry;
    } catch {
      return null;
    }
  }
  return value as IdempotencyEntry;
}

export function createChatProtection(env: ProtectionEnv = process.env, overrides: ChatProtectionOverrides = {}) {
  const namespace = resolveNamespace(env);
  const hmacSecret = env.AI_PROTECTION_HMAC_KEY;

  return {
    async run({ req, parseRequest, execute }: ProtectedChatInput): Promise<AiChatSuccess> {
      const accessToken = parseBearerToken(req);
      const clientIp = resolveClientIp(req, env);
      const idempotencyKey = parseIdempotencyKey(req);
      if (!hmacSecret) throw protectionUnavailable("Der KI-Schutz ist nicht konfiguriert.");

      let redis: RedisLike;
      let ipLimiter: RateLimiterLike;
      let userLimiter: RateLimiterLike;
      try {
        redis = overrides.redis ?? resolveRedis(env);
        ipLimiter = overrides.ipLimiter ?? new Ratelimit({
          redis: redis as Redis,
          limiter: Ratelimit.slidingWindow(IP_LIMIT, RATE_WINDOW),
          prefix: `${namespace}:rate:ip`,
          analytics: false,
        });
        userLimiter = overrides.userLimiter ?? new Ratelimit({
          redis: redis as Redis,
          limiter: Ratelimit.slidingWindow(USER_LIMIT, RATE_WINDOW),
          prefix: `${namespace}:rate:user`,
          analytics: false,
        });
      } catch {
        throw protectionUnavailable();
      }

      const now = (overrides.now ?? Date.now)();
      const ipDigest = digestIdentifier(hmacSecret, namespace, "ip", clientIp);
      await enforceRateLimit(ipLimiter, ipDigest, now);

      const authenticate = overrides.authenticate ?? createSupabaseAuthenticator(env);
      const authenticated = await authenticate(accessToken);
      if (!parseAiChatConsent(authenticated.consent).success) {
        throw new ChatProtectionError(
          403,
          "ai_consent_required",
          "Bitte bestätige zuerst die Bedingungen für die externe KI-Nutzung.",
        );
      }

      const userDigest = digestIdentifier(hmacSecret, namespace, "user", authenticated.userId);
      await enforceRateLimit(userLimiter, userDigest, now);

      const input = await parseRequest();
      const bodyHash = requestHash(input);
      const keyDigest = digestIdentifier(hmacSecret, namespace, "idempotency", `${authenticated.userId}:${idempotencyKey}`);
      const redisKey = `${namespace}:idempotency:${keyDigest}`;
      const pending: PendingEntry = { state: "pending", requestHash: bodyHash };

      let reserved: unknown;
      try {
        reserved = await redis.set(redisKey, pending, { nx: true, ex: IDEMPOTENCY_PENDING_SECONDS });
      } catch {
        throw protectionUnavailable();
      }

      if (reserved !== "OK") {
        let existing: IdempotencyEntry | null;
        try {
          existing = parseStoredEntry(await redis.get(redisKey));
        } catch {
          throw protectionUnavailable();
        }
        if (existing && existing.requestHash !== bodyHash) {
          throw new ChatProtectionError(409, "idempotency_conflict", "Dieser Idempotenzschlüssel gehört zu einer anderen Anfrage.");
        }
        if (existing?.state === "complete") {
          const replay = parseAiChatSuccess(existing.response);
          if (replay.success) return replay.output;
          throw protectionUnavailable();
        }
        throw new ChatProtectionError(
          409,
          "request_in_progress",
          "Diese KI-Anfrage wird bereits verarbeitet.",
          { "Retry-After": "2" },
        );
      }

      try {
        const response = await execute(input, {
          userId: authenticated.userId,
          idempotencyKey,
          requestFingerprint: bodyHash,
        });
        const validated = parseAiChatSuccess(response);
        if (!validated.success) throw protectionUnavailable();
        const complete: CompleteEntry = { state: "complete", requestHash: bodyHash, response: validated.output };
        try {
          await redis.set(redisKey, complete, { ex: IDEMPOTENCY_COMPLETE_SECONDS });
        } catch {
          throw protectionUnavailable();
        }
        return validated.output;
      } catch (error) {
        try {
          await redis.del(redisKey);
        } catch {
          // Die ursprüngliche, bereits bereinigte Fehlermeldung hat Vorrang.
        }
        throw error;
      }
    },
  };
}
