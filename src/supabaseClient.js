import { createClient } from "@supabase/supabase-js";

export function getSupabaseBrowserConfig(env = import.meta.env ?? {}) {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function createSupabaseBrowserClient(env = import.meta.env ?? {}) {
  const config = getSupabaseBrowserConfig(env);
  if (!config.configured) return null;

  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
