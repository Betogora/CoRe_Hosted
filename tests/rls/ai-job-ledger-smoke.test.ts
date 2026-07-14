import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";

function environment(name: string) {
  const value = String(process.env[name] ?? "").trim();
  assert.ok(value, `${name} fehlt für den lokalen KI-Job-RLS-Smoke.`);
  return value;
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function signIn(url: string, key: string, email: string, password: string) {
  const result = await client(url, key).auth.signInWithPassword({ email, password });
  assert.equal(result.error, null, result.error?.message);
  assert.ok(result.data.user);
  const signedIn = client(url, key);
  const session = await signedIn.auth.signInWithPassword({ email, password });
  assert.equal(session.error, null, session.error?.message);
  return { client: signedIn, user: session.data.user! };
}

function fixture(userId: string, id: string) {
  return {
    id,
    user_id: userId,
    deck_id: null,
    job_type: "chat",
    status: "succeeded",
    contract_version: 1,
    prompt_version: "prompt-v1",
    schema_version: "response-v1",
    idempotency_key: randomUUID(),
    request_fingerprint: randomUUID().replaceAll("-", ""),
    attempt_count: 1,
    max_attempts: 3,
    provider: "google",
    model: "gemma-4-31b-it",
    pricing_version: "google-gemini-api-2026-07-09",
    cost_micros: 0,
    cost_currency: "USD",
  };
}

test("ai_jobs ist für Browser owner-lesbar und ausschließlich serverseitig schreibbar", async () => {
  const url = environment("SUPABASE_URL");
  const publishableKey = environment("VITE_SUPABASE_PUBLISHABLE_KEY");
  const secret = environment("SUPABASE_SECRET_KEY");
  assert.ok(isLocalSupabaseUrl(url), "Das Supabase-Secret darf nur gegen Loopback verwendet werden.");

  const accountA = await signIn(url, publishableKey, environment("CORE_E2E_EMAIL"), environment("CORE_E2E_PASSWORD"));
  const accountB = await signIn(url, publishableKey, environment("CORE_RLS_USER_B_EMAIL"), environment("CORE_RLS_USER_B_PASSWORD"));
  const server = client(url, secret);
  const anon = client(url, publishableKey);
  const idA = `rls_server_job_${randomUUID()}`;
  const idB = `rls_server_job_${randomUUID()}`;

  try {
    const inserted = await server.from("ai_jobs").insert([fixture(accountA.user.id, idA), fixture(accountB.user.id, idB)]);
    assert.equal(inserted.error, null, inserted.error?.message);

    const own = await accountA.client.from("ai_jobs").select("id,user_id").in("id", [idA, idB]);
    assert.equal(own.error, null, own.error?.message);
    assert.deepEqual(own.data?.map((row) => row.id), [idA]);

    const foreign = await accountB.client.from("ai_jobs").select("id,user_id").eq("id", idA);
    assert.equal(foreign.error, null, foreign.error?.message);
    assert.deepEqual(foreign.data, []);

    const anonRead = await anon.from("ai_jobs").select("id").limit(1);
    assert.equal(anonRead.error?.code, "42501");

    const browserInsert = await accountA.client.from("ai_jobs").insert(fixture(accountA.user.id, `forbidden_${randomUUID()}`));
    assert.equal(browserInsert.error?.code, "42501");
    const browserUpdate = await accountA.client.from("ai_jobs").update({ status: "failed" }).eq("id", idA);
    assert.equal(browserUpdate.error?.code, "42501");
    const browserDelete = await accountA.client.from("ai_jobs").delete().eq("id", idA);
    assert.equal(browserDelete.error?.code, "42501");
  } finally {
    await server.from("ai_jobs").delete().in("id", [idA, idB]);
  }
});
