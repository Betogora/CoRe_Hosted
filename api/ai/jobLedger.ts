import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/database.types.ts";

const CONTRACT_VERSION = 1;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_SECONDS = 30;
const RESULT_CACHE_SECONDS = 10 * 60;

type LedgerEnv = Record<string, string | undefined>;
type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} | null;

export interface TrackedJobSpec {
  userId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  jobType: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string;
  deckId?: string | null;
  inputRef?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  pricingVersion: string;
  costCurrency: "USD";
  projectedCostMicros: number;
}

export interface TrackedJobResult {
  usage: TokenUsage;
}

export interface ServerJobLedger {
  runTrackedJob<T extends TrackedJobResult>(spec: TrackedJobSpec, execute: () => Promise<T>): Promise<T>;
}

export class JobLedgerError extends Error {
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

export interface ClassifiedJobError {
  errorClass: "configuration" | "provider" | "request" | "internal";
  errorCode: string;
  retryable: boolean;
}

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "internal_error";
  const code = String(error.code ?? "");
  return /^[a-z0-9_]{1,80}$/.test(code) ? code : "internal_error";
}

export function classifyJobError(error: unknown): ClassifiedJobError {
  const code = safeErrorCode(error);
  const statusCode = Number(error && typeof error === "object" && "statusCode" in error ? error.statusCode : 0);
  if (code === "missing_google_api_key") {
    return { errorClass: "configuration", errorCode: code, retryable: false };
  }
  if (["provider_timeout", "provider_unreachable", "provider_error", "provider_invalid_json"].includes(code)) {
    return { errorClass: "provider", errorCode: code, retryable: true };
  }
  if (["provider_invalid_response", "provider_empty_answer"].includes(code)) {
    return { errorClass: "provider", errorCode: code, retryable: false };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return { errorClass: "request", errorCode: code, retryable: false };
  }
  return { errorClass: "internal", errorCode: code, retryable: statusCode >= 500 || statusCode === 0 };
}

function unavailable() {
  return new JobLedgerError(503, "job_ledger_unavailable", "Die KI-Anfrage kann gerade nicht sicher protokolliert werden.");
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(MAX_RETRY_SECONDS, 2 ** Math.max(1, attemptCount));
}

function resultReference(now: Date) {
  return {
    kind: "upstash-response-cache",
    ttlSeconds: RESULT_CACHE_SECONDS,
    expiresAt: new Date(now.getTime() + RESULT_CACHE_SECONDS * 1_000).toISOString(),
  };
}

function createLedgerClient(env: LedgerEnv) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return null;
  return createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function selectExisting(client: any, spec: TrackedJobSpec) {
  const result = await client
    .from("ai_jobs")
    .select("*")
    .eq("user_id", spec.userId)
    .eq("idempotency_key", spec.idempotencyKey)
    .eq("contract_version", CONTRACT_VERSION)
    .maybeSingle();
  if (result.error) throw unavailable();
  return result.data;
}

async function reserve(client: any, spec: TrackedJobSpec, now: Date, createId: () => string) {
  const row = {
    id: createId(),
    user_id: spec.userId,
    deck_id: spec.deckId ?? null,
    job_type: spec.jobType,
    status: "queued",
    contract_version: CONTRACT_VERSION,
    prompt_version: spec.promptVersion,
    schema_version: spec.schemaVersion,
    idempotency_key: spec.idempotencyKey,
    request_fingerprint: spec.requestFingerprint,
    attempt_count: 0,
    max_attempts: MAX_ATTEMPTS,
    retryable: false,
    next_retry_at: null,
    provider: spec.provider,
    model: spec.model,
    input_ref: spec.inputRef ?? {},
    policy: spec.policy ?? {},
    pricing_version: spec.pricingVersion,
    cost_micros: spec.projectedCostMicros,
    cost_currency: spec.costCurrency,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    revision: 1,
  };
  const inserted = await client.from("ai_jobs").insert(row).select("*").maybeSingle();
  if (!inserted.error && inserted.data) return inserted.data;
  if (String(inserted.error?.code ?? "") !== "23505") throw unavailable();
  const existing = await selectExisting(client, spec);
  if (!existing) throw unavailable();
  return existing;
}

async function compareAndSet(client: any, row: any, values: Record<string, unknown>) {
  const result = await client
    .from("ai_jobs")
    .update(values)
    .eq("user_id", row.user_id)
    .eq("id", row.id)
    .eq("revision", row.revision)
    .eq("status", row.status)
    .select("*")
    .maybeSingle();
  if (result.error) throw unavailable();
  return result.data;
}

function validateReservation(row: any, spec: TrackedJobSpec, now: Date) {
  if (row.request_fingerprint !== spec.requestFingerprint) {
    throw new JobLedgerError(409, "idempotency_conflict", "Dieser Idempotenzschlüssel gehört zu einer anderen Anfrage.");
  }
  if (row.status === "succeeded") {
    throw new JobLedgerError(
      409,
      "idempotency_result_expired",
      "Diese Anfrage wurde bereits erfolgreich verarbeitet; das kurzlebige Ergebnis ist nicht mehr verfügbar.",
    );
  }
  if (row.status === "running") {
    throw new JobLedgerError(409, "request_in_progress", "Diese KI-Anfrage wird bereits verarbeitet.", { "Retry-After": "2" });
  }
  if (Number(row.attempt_count) >= Number(row.max_attempts ?? MAX_ATTEMPTS)) {
    throw new JobLedgerError(409, "retry_limit_reached", "Für diese KI-Anfrage sind keine weiteren Versuche möglich.");
  }
  if (row.status === "cancelled" || (row.status === "failed" && !row.retryable)) {
    throw new JobLedgerError(409, "job_not_retryable", "Diese KI-Anfrage kann nicht erneut ausgeführt werden.");
  }
  const nextRetryAt = asDate(row.next_retry_at);
  if (nextRetryAt && nextRetryAt > now) {
    const retryAfter = Math.max(1, Math.ceil((nextRetryAt.getTime() - now.getTime()) / 1_000));
    throw new JobLedgerError(409, "retry_not_ready", "Die KI-Anfrage kann erst später erneut versucht werden.", {
      "Retry-After": String(Math.min(MAX_RETRY_SECONDS, retryAfter)),
    });
  }
}

export function createServerJobLedger({
  env = process.env,
  client = createLedgerClient(env),
  now = () => new Date(),
  createId = randomUUID,
}: {
  env?: LedgerEnv;
  client?: any;
  now?: () => Date;
  createId?: () => string;
} = {}): ServerJobLedger {
  return {
    async runTrackedJob<T extends TrackedJobResult>(spec: TrackedJobSpec, execute: () => Promise<T>): Promise<T> {
      if (!client) throw unavailable();
      const reservationTime = now();
      let row = await reserve(client, spec, reservationTime, createId);
      validateReservation(row, spec, reservationTime);

      const attemptCount = Number(row.attempt_count) + 1;
      const running = await compareAndSet(client, row, {
        status: "running",
        attempt_count: attemptCount,
        started_at: reservationTime.toISOString(),
        finished_at: null,
        next_retry_at: null,
        error: null,
        error_class: null,
        error_code: null,
        retryable: false,
        updated_at: reservationTime.toISOString(),
        revision: Number(row.revision) + 1,
      });
      if (!running) {
        const current = await selectExisting(client, spec);
        if (!current) throw unavailable();
        validateReservation(current, spec, now());
        throw new JobLedgerError(409, "request_in_progress", "Diese KI-Anfrage wird bereits verarbeitet.", { "Retry-After": "2" });
      }
      row = running;

      try {
        const result = await execute();
        const finishedAt = now();
        const succeeded = await compareAndSet(client, row, {
          status: "succeeded",
          result_ref: resultReference(finishedAt),
          input_tokens: result.usage?.inputTokens ?? null,
          output_tokens: result.usage?.outputTokens ?? null,
          total_tokens: result.usage?.totalTokens ?? null,
          cost_micros: spec.projectedCostMicros,
          cost_currency: spec.costCurrency,
          retryable: false,
          next_retry_at: null,
          finished_at: finishedAt.toISOString(),
          updated_at: finishedAt.toISOString(),
          revision: Number(row.revision) + 1,
        });
        if (!succeeded) throw unavailable();
        return result;
      } catch (error) {
        if (error instanceof JobLedgerError && error.code === "job_ledger_unavailable") throw error;
        const classified = classifyJobError(error);
        const failedAt = now();
        const retryable = classified.retryable && attemptCount < Number(row.max_attempts ?? MAX_ATTEMPTS);
        const retrySeconds = retryDelaySeconds(attemptCount);
        const failed = await compareAndSet(client, row, {
          status: "failed",
          error: { class: classified.errorClass, code: classified.errorCode },
          error_class: classified.errorClass,
          error_code: classified.errorCode,
          retryable,
          next_retry_at: retryable ? new Date(failedAt.getTime() + retrySeconds * 1_000).toISOString() : null,
          finished_at: failedAt.toISOString(),
          updated_at: failedAt.toISOString(),
          revision: Number(row.revision) + 1,
        });
        if (!failed) throw unavailable();
        throw error;
      }
    },
  };
}
