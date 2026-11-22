export const RATING_SHORTCUT_KEYS = {
  again: "1",
  hard: "2",
  good: "3",
  easy: "4",
} as const;

const RATING_KEY_MAP: Record<string, "again" | "hard" | "good" | "easy"> = {
  [RATING_SHORTCUT_KEYS.again]: "again",
  [RATING_SHORTCUT_KEYS.hard]: "hard",
  [RATING_SHORTCUT_KEYS.good]: "good",
  [RATING_SHORTCUT_KEYS.easy]: "easy",
};

const TEXT_TARGETS = ["input", "textarea", "select"];
const ACTIVATABLE_TARGETS = ["button", "a", "summary"];

// A focused control activates itself with Space and Enter; the other review keys still apply.
function keepsKey(target: EventTarget | null = null, key: string) {
  const element = target && typeof target === "object" ? target as { tagName?: unknown; isContentEditable?: boolean } : null;
  const tagName = String(element?.tagName ?? "").toLowerCase();
  if (TEXT_TARGETS.includes(tagName) || element?.isContentEditable === true) return true;
  return ACTIVATABLE_TARGETS.includes(tagName) && (key === " " || key === "enter");
}

export function resolveReviewShortcut(event: { key: any; target?: any; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }, { hasCurrent = false, showAnswer = false }: any = {}) {
  const key = String(event?.key ?? "").toLowerCase();
  if (keepsKey(event?.target, key)) return null;
  const command = Boolean(event.ctrlKey || event.metaKey);
  if (event.altKey || event.shiftKey) return null;
  if (key === "u" && !command || key === "z" && command) return { type: "undo" };
  if (!hasCurrent || command) return null;
  if (key === "escape") return { type: "exit" };
  if (key === "e") return { type: "edit" };
  if (key === " " || key === "enter") return showAnswer ? { type: "rate", rating: "good" } : { type: "reveal" };
  if (showAnswer && RATING_KEY_MAP[key]) return { type: "rate", rating: RATING_KEY_MAP[key] };
  return null;
}
