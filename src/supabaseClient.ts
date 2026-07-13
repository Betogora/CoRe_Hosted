import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

interface SupabaseBrowserEnv {
  VITE_SUPABASE_URL?: unknown;
  VITE_SUPABASE_PUBLISHABLE_KEY?: unknown;
}

export function getSupabaseBrowserConfig(env: SupabaseBrowserEnv = (import.meta.env ?? {}) as SupabaseBrowserEnv) {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function createSupabaseBrowserClient(env: SupabaseBrowserEnv = (import.meta.env ?? {}) as SupabaseBrowserEnv): SupabaseClient<Database> | null {
  const config = getSupabaseBrowserConfig(env);
  if (!config.configured) return null;

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
