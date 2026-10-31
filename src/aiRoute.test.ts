import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { classifyProviderError, isAllowedOrigin, parseBearerToken, readJsonBody, requestOpenRouter } from "../server/aiRoute.ts";

const texts = { rateLimited: "zu viele", unavailable: "nicht verfügbar", rejected: "abgelehnt", failed: "fehlgeschlagen", invalid: "ungültig", tool: "Werkzeug", fields: "Felder" };

test("AI routes accept only their own origin and a bearer session", () => {
  assert.equal(isAllowedOrigin({ headers: { host: "core.example", origin: "https://core.example" } }), true);
  assert.equal(isAllowedOrigin({ headers: { host: "core.example" } }), false);
  assert.equal(isAllowedOrigin({ headers: { host: "core.example", origin: "https://evil.example" } }), false);
  assert.equal(parseBearerToken({ headers: { authorization: "Bearer session-token" } }), "session-token");
  assert.throws(() => parseBearerToken({ headers: {} }), { statusCode: 401, code: "unauthorized" });
});

test("JSON reader limits UTF-8 bytes, rejects invalid JSON and keeps umlauts across chunk boundaries", async () => {
  const raw = Buffer.from('{"text":"äöü"}', "utf8");
  const stream = Object.assign(Readable.from([raw.subarray(0, 10), raw.subarray(10)]), { headers: {} });
  assert.deepEqual(await readJsonBody(stream, 100), { text: "äöü" });
  await assert.rejects(readJsonBody(Object.assign(Readable.from([raw]), { headers: {} }), 8), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: { "content-length": "9000" }, body: {} }, 8_192), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: {}, body: "x".repeat(101) }, 100), { statusCode: 413 });
  await assert.rejects(readJsonBody({ headers: {}, body: "{invalid" }, 100), { statusCode: 400, code: "invalid_json" });
});

test("provider errors map to stable codes without exposing configuration", () => {
  for (const [status, payload, expectedStatus, expectedCode] of [
    [429, { error: { code: 429, message: "Rate limit exceeded" } }, 429, "rate_limited"],
    [402, null, 503, "provider_budget_exhausted"],
    [403, { error: { code: 403, message: "Key limit exceeded", metadata: { limit_source: "openrouter_key_limit" } } }, 503, "provider_budget_exhausted"],
    [403, { error: { code: 403, message: "Forbidden" } }, 503, "openrouter_auth_failed"],
    [401, null, 503, "openrouter_auth_failed"],
    [400, null, 502, "provider_request_rejected"],
    [404, null, 503, "no_provider_endpoint"],
    [200, { error: { code: 502, message: "Provider returned error" } }, 502, "provider_error"],
  ] as const) {
    const error = classifyProviderError(status, payload, texts);
    assert.deepEqual([error.statusCode, error.code], [expectedStatus, expectedCode]);
    assert.doesNotMatch(error.message, /OPENROUTER_API_KEY|limit exceeded|Forbidden/i);
  }
});

test("provider requests report timeouts and error bodies once without leaking details", async () => {
  let calls = 0;
  const timeout = () => { calls += 1; throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
  await assert.rejects(requestOpenRouter(async () => timeout(), "secret", {}, AbortSignal.timeout(1_000), texts), { statusCode: 502, code: "provider_timeout" });
  assert.equal(calls, 1);

  const providerError = await requestOpenRouter(async () => new Response(JSON.stringify({ error: "provider details stay private" }), { status: 400 }), "secret", {}, AbortSignal.timeout(1_000), texts).catch((error: unknown) => error);
  assert.deepEqual([(providerError as { code: string }).code, (providerError as Error).message], ["provider_request_rejected", "abgelehnt"]);
});
