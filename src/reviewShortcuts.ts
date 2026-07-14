const RATING_KEY_MAP: Record<string, "again" | "hard" | "good" | "easy"> = {
  1: "again",
  a: "again",
  2: "hard",
  h: "hard",
  3: "good",
  g: "good",
  4: "easy",
  e: "easy",
};

const EDITABLE_TARGETS = ["input", "textarea", "select"];

export function isEditableShortcutTarget(target: EventTarget | null = null) {
  const element = target && typeof target === "object" ? target as { tagName?: unknown; isContentEditable?: boolean } : null;
  const tagName = String(element?.tagName ?? "").toLowerCase();
  return EDITABLE_TARGETS.includes(tagName) || element?.isContentEditable === true;
}

export function resolveReviewShortcut(event: { key: any; target?: any; }, { hasCurrent = false, showAnswer = false }: any = {}) {
  if (!hasCurrent || isEditableShortcutTarget(event?.target)) return null;

  const key = String(event?.key ?? "").toLowerCase();
  if (key === "escape") return { type: "exit" };

  if (!showAnswer && (key === " " || key === "enter")) {
    return { type: "reveal" };
  }

  if (showAnswer && RATING_KEY_MAP[key]) {
    return { type: "rate", rating: RATING_KEY_MAP[key] };
  }

  return null;
}
