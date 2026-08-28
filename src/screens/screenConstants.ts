import { ArrowLeftRight, Braces, CreditCard, Images, ListChecks } from "lucide-react";
import { RATING_SHORTCUT_KEYS } from "../reviewShortcuts.ts";
import type { CoreSegmentedControlOption } from "../ui/coreUi.tsx";

export type LearnArea = "overview" | "cards";

export const learnAreaOptions: ReadonlyArray<CoreSegmentedControlOption<LearnArea>> = [
  { value: "overview", label: "Stapelübersicht" },
  { value: "cards", label: "Kartenverwaltung" },
];

export const importSteps = [
  { id: "analyze", label: "Analysieren" },
  { id: "preview", label: "Vorschau bereit" },
  { id: "commit", label: "Übernehmen" },
  { id: "cloud", label: "Cloud-Daten synchronisieren" },
  { id: "media", label: "Medien werden synchronisiert" },
  { id: "complete", label: "Fertig" },
];

export const cardTypeOptions = [
  { value: "basic", label: "Basic", icon: CreditCard },
  { value: "basic-with-images", label: "Basic + Bilder", icon: Images },
  { value: "basic-reversed", label: "Umgekehrt", icon: ArrowLeftRight },
  { value: "cloze", label: "Lückentext", icon: Braces },
  { value: "single-choice", label: "Single Choice", icon: ListChecks },
  { value: "multiple-choice", label: "Multiple Choice", icon: ListChecks },
];

export const ratingButtons = [
  { key: "again", shortcutKey: RATING_SHORTCUT_KEYS.again, label: "Nochmal", className: "border-core-success bg-core-success-soft text-core-text" },
  { key: "hard", shortcutKey: RATING_SHORTCUT_KEYS.hard, label: "Schwer", className: "border-core-danger bg-core-danger-soft text-core-text" },
  { key: "good", shortcutKey: RATING_SHORTCUT_KEYS.good, label: "Gut", className: "border-core-warning bg-core-warning-soft text-core-text" },
  { key: "easy", shortcutKey: RATING_SHORTCUT_KEYS.easy, label: "Leicht", className: "border-core-info bg-core-info-soft text-core-text" },
];

export function formatReviewIntervalLabel(label: string) {
  return label.replace(/ Min\.$/, " min");
}

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
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1000)), units.length - 1);
  const value = size / 1000 ** unitIndex;
  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: value >= 10 || unitIndex === 0 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`;
}
