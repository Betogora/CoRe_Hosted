export const importSteps = [
  { id: "validate", label: "Datei prüfen" },
  { id: "collection", label: "Anki-Collection lesen" },
  { id: "cards", label: "Karten extrahieren" },
  { id: "preview", label: "Importvorschau erstellen" },
];

export const cardTypeOptions = [
  { value: "basic", label: "Basic" },
  { value: "basic-reversed", label: "Umgekehrt" },
  { value: "cloze", label: "Lückentext" },
  { value: "multiple-choice", label: "Multiple Choice" },
];

export const ratingButtons = [
  { key: "again", number: "1", label: "Again", className: "border-red-200 bg-red-50 text-red-650" },
  { key: "hard", number: "2", label: "Hard", className: "border-amber-200 bg-amber-50 text-amber-700" },
  { key: "good", number: "3", label: "Good", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { key: "easy", number: "4", label: "Easy", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
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
