import assert from "node:assert/strict";
import test from "node:test";
import { createApkgHandler } from "./apkg.ts";

function response() {
  return {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: "",
    setHeader(name: string, value: string) { this.headers.set(name, value); },
    end(value: string) { this.body = value; },
  };
}

test("APKG-Route liefert nur die sichere Jobprojektion", async () => {
  const progress = { jobId: "11111111-1111-4111-8111-111111111111", status: "ready", phase: "preview", revision: 3, completed: 42, total: 42, retryable: false } as const;
  const service: any = {
    async authenticate(token: string) { assert.equal(token, "token"); return "owner"; },
    async get(userId: string, jobId: string) { assert.equal(userId, "owner"); assert.equal(jobId, progress.jobId); return progress; },
    async act() { throw new Error("not used"); },
  };
  const req = { method: "GET", url: `/api/imports/apkg?jobId=${progress.jobId}`, query: { jobId: progress.jobId }, headers: { authorization: "Bearer token", host: "core.local" } };
  const res = response();
  await createApkgHandler(service)(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), progress);
  assert.doesNotMatch(res.body, /owner|source_path|execution_ref|file_name/);
});

test("APKG-Route weist Cross-Origin und unbekannte Felder ab", async () => {
  let authenticated = false;
  const service: any = { async authenticate() { authenticated = true; return "owner"; }, async act() { throw new Error("not used"); } };
  const forbidden = response();
  await createApkgHandler(service)({ method: "POST", headers: { authorization: "Bearer token", host: "core.local", origin: "https://evil.example" }, body: {} }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(authenticated, false);

  const invalid = response();
  await createApkgHandler(service)({ method: "POST", headers: { authorization: "Bearer token", host: "core.local" }, body: { action: "cancel", jobId: "11111111-1111-4111-8111-111111111111", revision: 1, sourcePath: "secret" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(JSON.parse(invalid.body).code, "invalid_request");
});

test("APKG-Route reicht nur validierte Aktionen und den authentifizierten Owner weiter", async () => {
  let received: unknown;
  const service: any = {
    async authenticate() { return "owner"; },
    async act(userId: string, action: unknown) { received = { userId, action }; return { ok: true }; },
  };
  const res = response();
  await createApkgHandler(service)({
    method: "POST", headers: { authorization: "Bearer token", host: "core.local" },
    body: { action: "enqueue-analysis", jobId: "11111111-1111-4111-8111-111111111111", revision: 2 },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, { userId: "owner", action: { action: "enqueue-analysis", jobId: "11111111-1111-4111-8111-111111111111", revision: 2 } });
});
