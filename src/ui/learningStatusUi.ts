export const LEARNING_STATUS_UI = {
  learned: { label: "Gelernt", color: "var(--core-learning-status-learned)" },
  new: { label: "Neu", color: "var(--core-learning-status-new)" },
  inProgress: { label: "In Arbeit", color: "var(--core-learning-status-in-progress)" },
  due: { label: "Fällig", color: "var(--core-learning-status-due)" },
} as const;

export function formatLearningCardCount(count: number) {
  return `${count} ${count === 1 ? "Karte" : "Karten"}`;
}
