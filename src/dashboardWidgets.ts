import { createAccountStorage } from "./accountStorage.ts";

export const DASHBOARD_WIDGETS = [
  { id: "learning", title: "Dein Lernen heute", description: "Tagesziel und Fortschritt auf einen Blick.", width: "wide" },
  { id: "motivation", title: "Dein Motivationsimpuls", description: "Ein täglicher Lernimpuls mit deinem Gehirn-Maskottchen.", width: "small" },
  { id: "timer", title: "Lerntimer", description: "Zeit für Fokus. Und für eine kleine Pause.", width: "small" },
  { id: "decks", title: "Aktive Stapel", description: "Deine Stapel mit direktem Lernstart.", width: "wide" },
  { id: "todos", title: "To-dos", description: "Aufgaben aus dem Planer und eigene Vorhaben.", width: "small" },
  { id: "heatmap", title: "Lernaktivität", description: "Deine Heatmap mit Rückblick und Ausblick.", width: "wide" },
] as const;
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number]["id"];
type DashboardWidgetWidth = "small" | "wide" | "full";
export interface DashboardWidget { id: DashboardWidgetId; width: DashboardWidgetWidth }
interface DashboardTodo { id: string; text: string; done: boolean }
export interface DashboardPreferences { widgets: DashboardWidget[]; todos: DashboardTodo[] }

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  const defaults = { widgets: DASHBOARD_WIDGETS.map(({ id, width }) => ({ id, width })), todos: [] };
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
    widgets.push({ id: definition.id, width: candidate.width === "small" || candidate.width === "wide" || candidate.width === "full" ? candidate.width : definition.width });
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
      if (!preferences.widgets.some((widget) => widget.id === "motivation")) preferences.widgets.push({ id: "motivation", width: "small" });
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
