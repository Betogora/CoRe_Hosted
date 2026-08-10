export const RATING_SHORTCUT_KEYS = {
  again: "1",
  hard: "2",
  good: "3",
  easy: "4",
} as const;

const RATING_KEY_MAP: Record<string, "again" | "hard" | "good" | "easy"> = {
  [RATING_SHORTCUT_KEYS.again]: "again",
  a: "again",
  [RATING_SHORTCUT_KEYS.hard]: "hard",
  h: "hard",
  [RATING_SHORTCUT_KEYS.good]: "good",
  g: "good",
  [RATING_SHORTCUT_KEYS.easy]: "easy",
  e: "easy",
};

const EDITABLE_TARGETS = ["input", "textarea", "select", "button", "a", "summary"];

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
