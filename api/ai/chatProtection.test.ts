import assert from "node:assert/strict";
import test from "node:test";
import { AI_CHAT_CONSENT_VERSION, AI_CHAT_MODEL } from "../../src/aiChatContract.ts";
import type { AiChatRequest, AiChatSuccess } from "../../src/aiChatContract.ts";
import { ChatProtectionError, createChatProtection } from "./chatProtection.ts";

const NOW = Date.parse("2026-07-14T12:00:00.000Z");
const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";
const consent = { version: AI_CHAT_CONSENT_VERSION, acceptedAt: "2026-07-14T10:00:00.000Z", adultConfirmed: true };
const request: AiChatRequest = { question: "Was macht Myelin?", evidence: [], sourceBound: false };
const success: AiChatSuccess = {
  answer: "Myelin isoliert Axone.",
  model: AI_CHAT_MODEL,
  provider: "google",
  sourceBound: false,
  usage: null,
  warnings: [],
};

class MemoryRedis {
  readonly values = new Map<string, unknown>();

  async get<TData = unknown>(key: string): Promise<TData | null> {
    return (this.values.get(key) as TData | undefined) ?? null;
  }

  async set<TData>(key: string, value: TData, options: { nx?: boolean } = {}): Promise<"OK" | null> {
    if (options.nx && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }
}

function allowLimiter() {
  return { limit: async () => ({ success: true, reset: NOW + 600_000 }) };
}

function createReq(headers: Record<string, string> = {}) {
  return {
    headers: {
      authorization: "Bearer access-token-secret",
      "idempotency-key": IDEMPOTENCY_KEY,
      "x-forwarded-for": "203.0.113.8",
      ...headers,
    },
  };
}

function createProtection(overrides: Record<string, unknown> = {}) {
  const redis = (overrides.redis as MemoryRedis | undefined) ?? new MemoryRedis();
  return {
    redis,
    protection: createChatProtection(
      { AI_PROTECTION_HMAC_KEY: "hmac-secret", VERCEL_ENV: "preview" },
      {
        redis,
        ipLimiter: allowLimiter(),
        userLimiter: allowLimiter(),
        authenticate: async () => ({ userId: "user-secret", consent }),
        now: () => NOW,
        ...overrides,
      },
    ),
  };
}

async function run(
  protection: ReturnType<typeof createChatProtection>,
  options: { req?: any; input?: AiChatRequest; execute?: (input: AiChatRequest, context?: any) => Promise<AiChatSuccess> } = {},
) {
  return protection.run({
    req: options.req ?? createReq(),
    parseRequest: async () => options.input ?? request,
    execute: options.execute ?? (async () => success),
  });
}

async function expectProtectionError(promise: Promise<unknown>, code: string, statusCode: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ChatProtectionError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test("chat protection rejects missing bearer and invalid idempotency headers", async () => {
  const { protection } = createProtection();
  await expectProtectionError(run(protection, { req: createReq({ authorization: "" }) }), "unauthorized", 401);
  await expectProtectionError(run(protection, { req: createReq({ "idempotency-key": "not-a-uuid" }) }), "invalid_idempotency_key", 400);
});

test("chat protection rejects invalid sessions and missing current consent", async () => {
  const invalid = createProtection({
    authenticate: async () => {
      throw new ChatProtectionError(401, "unauthorized", "Sitzung abgelaufen.", { "WWW-Authenticate": "Bearer" });
    },
  }).protection;
  await expectProtectionError(run(invalid), "unauthorized", 401);

  const withoutConsent = createProtection({ authenticate: async () => ({ userId: "user-secret", consent: null }) }).protection;
  await expectProtectionError(run(withoutConsent), "ai_consent_required", 403);
});

test("chat protection applies IP and user limits with Retry-After", async () => {
  const ipLimited = createProtection({
    ipLimiter: { limit: async () => ({ success: false, reset: NOW + 5_000 }) },
  }).protection;
  await assert.rejects(run(ipLimited), (error: unknown) => {
    assert.ok(error instanceof ChatProtectionError);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.headers["Retry-After"], "5");
    return true;
  });

  const userLimited = createProtection({
    userLimiter: { limit: async () => ({ success: false, reset: NOW + 1_000 }) },
  }).protection;
  await expectProtectionError(run(userLimited), "rate_limited", 429);
});

test("chat protection replays the same completed request without another provider call", async () => {
  const { protection, redis } = createProtection();
  let providerCalls = 0;
  const execute = async () => {
    providerCalls += 1;
    return success;
  };

  assert.deepEqual(await run(protection, { execute }), success);
  assert.deepEqual(await run(protection, { execute }), success);
  assert.equal(providerCalls, 1);
  assert.equal(redis.values.size, 1);
  assert.equal(JSON.stringify([...redis.values.values()]).includes("access-token-secret"), false);
  assert.equal(JSON.stringify([...redis.values.values()]).includes("user-secret"), false);
  assert.equal(JSON.stringify([...redis.values.values()]).includes("203.0.113.8"), false);
  assert.equal(JSON.stringify([...redis.values.values()]).includes(request.question), false);
});

test("chat protection passes only authenticated execution identifiers downstream", async () => {
  const { protection } = createProtection();
  let context: any;
  await run(protection, {
    execute: async (_input: AiChatRequest, receivedContext?: any) => {
      context = receivedContext;
      return success;
    },
  });
  assert.equal(context.userId, "user-secret");
  assert.equal(context.idempotencyKey, IDEMPOTENCY_KEY);
  assert.match(context.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(context).includes(request.question), false);
});

test("chat protection rejects an idempotency key reused for another body", async () => {
  const { protection } = createProtection();
  await run(protection);
  await expectProtectionError(
    run(protection, { input: { ...request, question: "Andere Frage" } }),
    "idempotency_conflict",
    409,
  );
});

test("chat protection rejects a concurrent duplicate while the first request is pending", async () => {
  const { protection } = createProtection();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = run(protection, { execute: async () => { await gate; return success; } });
  await new Promise<void>((resolve) => setImmediate(resolve));

  await assert.rejects(run(protection), (error: unknown) => {
    assert.ok(error instanceof ChatProtectionError);
    assert.equal(error.code, "request_in_progress");
    assert.equal(error.headers["Retry-After"], "2");
    return true;
  });
  release();
  await first;
});

test("chat protection releases the reservation after provider failure", async () => {
  const { protection } = createProtection();
  await assert.rejects(run(protection, { execute: async () => { throw new Error("provider failed"); } }), /provider failed/);
  assert.deepEqual(await run(protection), success);
});

test("chat protection fails closed and releases the reservation when the completed response cannot be cached", async () => {
  const redis = new MemoryRedis();
  let setCalls = 0;
  const failingRedis = {
    get: redis.get.bind(redis),
    del: redis.del.bind(redis),
    async set<TData>(key: string, value: TData, options: any) {
      setCalls += 1;
      if (setCalls === 2) throw new Error("redis unavailable");
      return redis.set(key, value, options);
    },
  };
  const { protection } = createProtection({ redis: failingRedis });

  await expectProtectionError(run(protection), "protection_unavailable", 503);
  assert.equal(redis.values.size, 0);
});

test("chat protection fails closed when durable protection is not configured", async () => {
  const protection = createChatProtection({ VERCEL_ENV: "production" });
  await expectProtectionError(run(protection), "protection_unavailable", 503);
});
