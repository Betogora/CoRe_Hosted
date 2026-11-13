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

const EDITABLE_TARGETS = ["input", "textarea", "select", "button", "a", "summary"];

function isEditableShortcutTarget(target: EventTarget | null = null) {
  const element = target && typeof target === "object" ? target as { tagName?: unknown; isContentEditable?: boolean } : null;
  const tagName = String(element?.tagName ?? "").toLowerCase();
  return EDITABLE_TARGETS.includes(tagName) || element?.isContentEditable === true;
}

/**
 * Review keys as in Anki: Space/Enter reveals and, once revealed, rates `Gut`; 1–4 rate; `E` edits the card; `U` and
 * Ctrl/Cmd+Z take back the last rating; Escape leaves.
 */
export function resolveReviewShortcut(event: { key: any; target?: any; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }, { hasCurrent = false, showAnswer = false }: any = {}) {
  if (isEditableShortcutTarget(event?.target)) return null;
  const key = String(event?.key ?? "").toLowerCase();
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
