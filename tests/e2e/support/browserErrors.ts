import type { Page } from "@playwright/test";

// auth-js logs a failed fetch itself (e.g. a boot request aborted by a reload) before the app
// handles the resulting AuthRetryableFetchError as a connectivity failure.
function isHandledSupabaseFetchLog(message: string) {
  return message.includes("Failed to fetch") && message.includes("@supabase_supabase-js");
}

export function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isHandledSupabaseFetchLog(message.text())) errors.push(message.text());
  });
  return errors;
}
