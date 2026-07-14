import assert from "node:assert/strict";
import test from "node:test";
import { JobLedgerError, classifyJobError, createServerJobLedger, type TrackedJobSpec } from "./jobLedger.ts";

class MemoryQuery {
  private readonly filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "update" = "select";
  private values: any = null;

  constructor(private readonly client: MemoryClient) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  insert(values: any) { this.operation = "insert"; this.values = values; return this; }
  update(values: any) { this.operation = "update"; this.values = values; return this; }

  async maybeSingle() {
    if (this.client.unavailable) return { data: null, error: { code: "08006" } };
    if (this.operation === "insert") {
      const duplicate = this.client.rows.some((row) =>
        row.contract_version === 1
        && row.user_id === this.values.user_id
        && row.idempotency_key === this.values.idempotency_key);
      if (duplicate) return { data: null, error: { code: "23505" } };
      const row = structuredClone(this.values);
      this.client.rows.push(row);
      return { data: structuredClone(row), error: null };
    }

    const index = this.client.rows.findIndex((row) => this.filters.every(([column, value]) => row[column] === value));
    if (this.operation === "update") {
      if (index < 0) return { data: null, error: null };
      if (this.client.failUpdateStatus === this.values.status) return { data: null, error: { code: "08006" } };
      this.client.rows[index] = { ...this.client.rows[index], ...structuredClone(this.values) };
      return { data: structuredClone(this.client.rows[index]), error: null };
    }
    return { data: index < 0 ? null : structuredClone(this.client.rows[index]), error: null };
  }
}

class MemoryClient {
  readonly rows: any[] = [];
  unavailable = false;
  failUpdateStatus: string | null = null;
  from(table: string) {
    assert.equal(table, "ai_jobs");
    return new MemoryQuery(this);
  }
}

const spec: TrackedJobSpec = {
  userId: "user-a",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  requestFingerprint: "fingerprint-a",
  jobType: "chat",
  promptVersion: "prompt-v1",
  schemaVersion: "response-v1",
  provider: "google",
  model: "gemma-4-31b-it",
  inputRef: { sourceBound: false, evidenceCount: 0 },
  policy: { storeProviderResponse: false },
  pricingVersion: "google-gemini-api-2026-07-09",
  costCurrency: "USD",
  projectedCostMicros: 0,
};

const success = { usage: { inputTokens: 4, outputTokens: null, totalTokens: 9 }, answer: "Antwort" };

function createFixture() {
  const client = new MemoryClient();
  let current = new Date("2026-07-14T12:00:00.000Z");
  const ledger = createServerJobLedger({
    client,
    now: () => new Date(current),
    createId: () => "job-a",
  });
  return {
    client,
    ledger,
    advance(seconds: number) { current = new Date(current.getTime() + seconds * 1_000); },
  };
}

async function expectLedgerError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof JobLedgerError);
    assert.equal(error.code, code);
    return true;
  });
}

test("job ledger reserves, runs and finalizes a versioned job without response content", async () => {
  const { client, ledger } = createFixture();
  assert.deepEqual(await ledger.runTrackedJob(spec, async () => success), success);

  const row = client.rows[0];
  assert.equal(row.contract_version, 1);
  assert.equal(row.status, "succeeded");
  assert.equal(row.attempt_count, 1);
  assert.equal(row.input_tokens, 4);
  assert.equal(row.output_tokens, null);
  assert.equal(row.cost_micros, 0);
  assert.equal(row.result_ref.kind, "upstash-response-cache");
  assert.equal(JSON.stringify(row).includes(success.answer), false);
});

test("job ledger rejects a fingerprint conflict and an expired successful replay", async () => {
  const { ledger } = createFixture();
  await ledger.runTrackedJob(spec, async () => success);
  await expectLedgerError(ledger.runTrackedJob({ ...spec, requestFingerprint: "fingerprint-b" }, async () => success), "idempotency_conflict");
  await expectLedgerError(ledger.runTrackedJob(spec, async () => success), "idempotency_result_expired");
});

test("job ledger exposes a concurrent claim as request_in_progress", async () => {
  const { ledger } = createFixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = ledger.runTrackedJob(spec, async () => { await gate; return success; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await expectLedgerError(ledger.runTrackedJob(spec, async () => success), "request_in_progress");
  release();
  await first;
});

test("job ledger caps retries at three provider attempts and supplies Retry-After", async () => {
  const { client, ledger, advance } = createFixture();
  let calls = 0;
  const fail = async () => {
    calls += 1;
    throw Object.assign(new Error("provider detail"), { code: "provider_timeout", statusCode: 502 });
  };

  await assert.rejects(ledger.runTrackedJob(spec, fail), /provider detail/);
  await assert.rejects(ledger.runTrackedJob(spec, fail), (error: unknown) => {
    assert.ok(error instanceof JobLedgerError);
    assert.equal(error.code, "retry_not_ready");
    assert.equal(error.headers["Retry-After"], "2");
    return true;
  });
  advance(2);
  await assert.rejects(ledger.runTrackedJob(spec, fail), /provider detail/);
  advance(4);
  await assert.rejects(ledger.runTrackedJob(spec, fail), /provider detail/);
  await expectLedgerError(ledger.runTrackedJob(spec, fail), "retry_limit_reached");
  assert.equal(calls, 3);
  assert.equal(client.rows[0].retryable, false);
});

test("job ledger fails closed before provider execution and after provider success", async () => {
  const before = createFixture();
  before.client.unavailable = true;
  let calls = 0;
  await expectLedgerError(before.ledger.runTrackedJob(spec, async () => { calls += 1; return success; }), "job_ledger_unavailable");
  assert.equal(calls, 0);

  const after = createFixture();
  after.client.failUpdateStatus = "succeeded";
  await expectLedgerError(after.ledger.runTrackedJob(spec, async () => { calls += 1; return success; }), "job_ledger_unavailable");
  assert.equal(calls, 1);
  assert.equal(after.client.rows[0].status, "running");
});

test("job ledger classifies provider, request and configuration failures", () => {
  assert.deepEqual(classifyJobError({ code: "provider_unreachable", statusCode: 502 }), {
    errorClass: "provider", errorCode: "provider_unreachable", retryable: true,
  });
  assert.equal(classifyJobError({ code: "invalid_request", statusCode: 400 }).retryable, false);
  assert.deepEqual(classifyJobError({ code: "missing_google_api_key", statusCode: 503 }), {
    errorClass: "configuration", errorCode: "missing_google_api_key", retryable: false,
  });
});
