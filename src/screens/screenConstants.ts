export const importSteps = [
  { id: "analyze", label: "Analysieren" },
  { id: "preview", label: "Vorschau bereit" },
  { id: "commit", label: "Übernehmen" },
  { id: "media", label: "Medien werden synchronisiert" },
  { id: "complete", label: "Fertig" },
];

export const cardTypeOptions = [
  { value: "basic", label: "Basic" },
  { value: "basic-reversed", label: "Umgekehrt" },
  { value: "cloze", label: "Lückentext" },
  { value: "multiple-choice", label: "Multiple Choice" },
];

export const ratingButtons = [
  { key: "again", number: "1", label: "Nochmal", className: "border-core-danger", accentClassName: "text-core-danger" },
  { key: "hard", number: "2", label: "Schwer", className: "border-core-warning", accentClassName: "text-core-warning" },
  { key: "good", number: "3", label: "Gut", className: "border-core-success", accentClassName: "text-core-success" },
  { key: "easy", number: "4", label: "Leicht", className: "border-core-info", accentClassName: "text-core-info" },
];

export const maturityStageLabels = {
  new: "Neu",
  learning: "Lernen",
  early_review: "Frühe Wiederholung",
  variant_ready: "Bereit für Varianten",
  mature: "Stabil",
  mastered: "Sehr stabil",
  relearning: "Wiederholen nach Fehler",
};

export function formatLevelList(levels: number[] = []) {
  return levels.length ? `Level ${levels.join(", ")}` : "Level 1";
}

export function getStateValue(state: { [x: string]: any; }, key: string, fallback = "-") {
  const value = state?.[key];
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return value;
}

export function formatBytes(size: number) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
