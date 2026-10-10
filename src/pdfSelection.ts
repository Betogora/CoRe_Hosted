export function normalizePdfSelectionText(value: unknown = "") {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .map((part) => String(part ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
