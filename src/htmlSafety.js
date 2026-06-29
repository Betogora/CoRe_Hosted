const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_ATTRIBUTE_PATTERN = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_URL_PATTERN = /\s+(href|src)\s*=\s*("|')?\s*javascript:[^"'\s>]*/gi;

export function sanitizeCardHtml(html) {
  return String(html ?? "")
    .replace(SCRIPT_PATTERN, "")
    .replace(EVENT_ATTRIBUTE_PATTERN, "")
    .replace(UNSAFE_URL_PATTERN, "");
}

export function stripHtml(html) {
  if (typeof document !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = sanitizeCardHtml(html);
    return element.textContent ?? "";
  }

  return sanitizeCardHtml(html).replace(/<[^>]*>/g, " ");
}
