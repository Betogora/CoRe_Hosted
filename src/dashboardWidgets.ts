import { createAccountStorage } from "./accountStorage.ts";
import type { Profile } from "./coreTypes.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { getLearningDayKey, getLearningTimeZone } from "./learningDay.ts";

export const DASHBOARD_WIDGETS = [
  { id: "learning", title: "Dein Lernen heute", description: "Tagesziel und Fortschritt auf einen Blick.", width: "small" },
  { id: "motivation", title: "Dein Motivationsimpuls", description: "Ein täglicher Lernimpuls mit deinem Gehirn-Maskottchen.", width: "small" },
  { id: "timer", title: "Lerntimer", description: "Zeit für Fokus. Und für eine kleine Pause.", width: "small" },
  { id: "decks", title: "Angepinnte Stapel", description: "Deine angepinnten Stapel mit direktem Lernstart.", width: "small" },
  { id: "todos", title: "To-dos", description: "Aufgaben aus dem Planer und eigene Vorhaben.", width: "small" },
  { id: "heatmap", title: "Lernaktivität", description: "Deine Heatmap mit Rückblick und Ausblick.", width: "small" },
] as const;
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number]["id"];
export interface DashboardWidget { id: DashboardWidgetId }
interface DashboardTodo { id: string; text: string; done: boolean }
export interface DashboardPreferences { widgets: DashboardWidget[]; todos: DashboardTodo[] }

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  const defaults = { widgets: DASHBOARD_WIDGETS.map(({ id }) => ({ id })), todos: [] };
  if (!value || typeof value !== "object") return defaults;
  const data = value as Record<string, unknown>;
  const seen = new Set<string>();
  const widgets: DashboardWidget[] = [];
  if (Array.isArray(data.widgets)) for (const item of data.widgets) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const definition = DASHBOARD_WIDGETS.find((entry) => entry.id === candidate.id);
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    widgets.push({ id: definition.id });
  }
  const todos: DashboardTodo[] = [];
  const todoIds = new Set<string>();
  if (Array.isArray(data.todos)) for (const item of data.todos.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id || todoIds.has(candidate.id) || typeof candidate.text !== "string" || !candidate.text.trim()) continue;
    todoIds.add(candidate.id);
    todos.push({ id: candidate.id, text: candidate.text.trim().slice(0, 500), done: candidate.done === true });
  }
  return { widgets: Array.isArray(data.widgets) ? widgets : defaults.widgets, todos };
}

export function moveDashboardWidget(widgets: DashboardWidget[], from: DashboardWidgetId, to: DashboardWidgetId) {
  const start = widgets.findIndex((widget) => widget.id === from);
  const end = widgets.findIndex((widget) => widget.id === to);
  if (start < 0 || end < 0 || start === end) return widgets;
  const next = [...widgets];
  next.splice(end, 0, ...next.splice(start, 1));
  return next;
}

const STORAGE_KEY = "core.dashboard.widgets.v1";
export function readDashboardPreferences(userId: string): DashboardPreferences {
  try {
    const stored: unknown = JSON.parse(createAccountStorage(userId).getItem(STORAGE_KEY) ?? "null");
    const preferences = normalizeDashboardPreferences(stored);
    if (stored && typeof stored === "object" && !("motivationIntroduced" in stored && stored.motivationIntroduced === true)) {
      if (!preferences.widgets.some((widget) => widget.id === "motivation")) preferences.widgets.push({ id: "motivation" });
      writeDashboardPreferences(userId, preferences);
    }
    return preferences;
  }
  catch { return normalizeDashboardPreferences(null); }
}
export function writeDashboardPreferences(userId: string, preferences: DashboardPreferences): boolean {
  try { createAccountStorage(userId).setItem(STORAGE_KEY, JSON.stringify({ ...preferences, motivationIntroduced: true })); return true; }
  catch { return false; }
}

interface DeckStudyDay { deckId: string; day: string }
const STUDY_DAYS_KEY = "core.dashboard.study-days.v1";
const STUDY_DAY_WINDOW = 14;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** Today's learning day by real time, so a simulated learning clock neither hides nor freezes study days. */
export function currentLearningDay(profile: Profile) {
  const now = new Date();
  return getLearningDayKey(now, { timeZone: getLearningTimeZone(profile), dayStartHour: getGlobalSchedulerPreferences(profile).dayStartHour }) ?? now.toISOString().slice(0, 10);
}

function readStudyDays(userId: string, today: string): DeckStudyDay[] {
  try {
    const stored: unknown = JSON.parse(createAccountStorage(userId).getItem(STUDY_DAYS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const latest = dayNumber(today);
    return stored.filter((entry): entry is DeckStudyDay => typeof entry?.deckId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry?.day)
      && dayNumber(entry.day) <= latest && latest - dayNumber(entry.day) < STUDY_DAY_WINDOW);
  }
  catch { return []; }
}

/** A deck counts once per learning day, exactly as started. */
export function recordDeckStudyDay(userId: string, deckId: string, today: string) {
  const days = readStudyDays(userId, today);
  if (days.some((entry) => entry.deckId === deckId && entry.day === today)) return;
  try { createAccountStorage(userId).setItem(STUDY_DAYS_KEY, JSON.stringify([...days, { deckId, day: today }])); }
  catch { /* Suggestions are a convenience; a full or blocked storage only loses this day. */ }
}

/** Most learning days first; ties rank the deck learned on a later day, then the one recorded later, first. */
function rankFrequentDeckIds(days: readonly DeckStudyDay[]) {
  const ranking = new Map<string, { count: number; last: number; order: number }>();
  days.forEach(({ deckId, day }, order) => {
    const entry = ranking.get(deckId) ?? { count: 0, last: 0, order: 0 };
    ranking.set(deckId, { count: entry.count + 1, last: Math.max(entry.last, dayNumber(day)), order });
  });
  return [...ranking].sort(([, a], [, b]) => b.count - a.count || b.last - a.last || b.order - a.order).map(([deckId]) => deckId);
}

/** Decks learned on the most of the last 14 learning days. */
export function readFrequentDeckIds(userId: string, today: string) {
  return rankFrequentDeckIds(readStudyDays(userId, today));
}
