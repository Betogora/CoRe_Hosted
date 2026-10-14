import type { SupabaseClient } from "@supabase/supabase-js";
import * as v from "valibot";
import type { Database } from "./database.types.ts";

const errorSchema = v.looseObject({ error: v.looseObject({ code: v.string(), message: v.string() }) });

/**
 * Posts to a CoRe AI route with the session token and returns the unvalidated JSON of a successful response.
 * `fail` builds the caller's error type; the caller validates the body against its own contract.
 */
export async function postAiRoute(endpoint: string, body: unknown, supabase: SupabaseClient<Database> | null, { fetchImpl = globalThis.fetch, timeoutMs, signal, fail, messages }: {
  fetchImpl?: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
  fail: (code: string, message: string) => Error;
  messages: { timeout: string; network: string; failed: string };
}): Promise<unknown> {
  if (!supabase) throw fail("auth_unavailable", "Die Anmeldung ist noch nicht bereit.");
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw fail("unauthorized", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");

  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  let result: unknown;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    if (signal?.aborted) throw fail("cancelled", "Die Erstellung wurde abgebrochen.");
    if (timeout.aborted || (error instanceof Error && error.name === "TimeoutError")) throw fail("timeout", messages.timeout);
    throw fail("network_error", messages.network);
  }
  if (!response.ok) {
    const parsed = v.safeParse(errorSchema, result);
    throw fail(parsed.success ? parsed.output.error.code : "request_failed", parsed.success ? parsed.output.error.message : messages.failed);
  }
  return result;
}
