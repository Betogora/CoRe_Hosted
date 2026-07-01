const RATING_KEY_MAP = {
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

export function isEditableShortcutTarget(target = {}) {
  const tagName = String(target.tagName ?? "").toLowerCase();
  return EDITABLE_TARGETS.includes(tagName) || target.isContentEditable === true;
}

export function resolveReviewShortcut(event, { hasCurrent = false, showAnswer = false } = {}) {
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
