import type { DashboardStudyDay, SavedCardSearch, SyncIntervalMinutes, UiPreferences } from "./coreTypes.ts";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  learnCollapsedDeckIds: [],
  syncIntervalMinutes: 5,
  flagNames: ["", "", "", "", "", "", ""],
  savedSearches: [],
  dashboardPinnedDeckIds: [],
  dashboardStudyDays: [],
};

export const DASHBOARD_PIN_LIMIT = 4;
const STUDY_DAY_WINDOW = 14;
const STUDY_DAY_LIMIT = 500;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const isDayKey = (day: unknown): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);

export const SAVED_SEARCH_LIMIT = 100;
export const SAVED_SEARCH_NAME_LENGTH = 60;
const SAVED_SEARCH_QUERY_LENGTH = 1_000;

const SYNC_INTERVALS = new Set<SyncIntervalMinutes>([0, 1, 5, 15, 30]);

function normalizeSyncInterval(value: unknown): SyncIntervalMinutes {
  const interval = Number(value) as SyncIntervalMinutes;
  return SYNC_INTERVALS.has(interval) ? interval : DEFAULT_UI_PREFERENCES.syncIntervalMinutes;
}

export function normalizeFlagNames(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, index) => typeof names[index] === "string" ? names[index].trim().slice(0, 40) : "");
}

function normalizeSavedSearches(value: unknown): SavedCardSearch[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const searches: SavedCardSearch[] = [];
  for (const entry of value) {
    const { id, name, query } = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    if (typeof id !== "string" || !id || ids.has(id) || typeof name !== "string" || typeof query !== "string") continue;
    const trimmedName = name.trim().slice(0, SAVED_SEARCH_NAME_LENGTH);
    const trimmedQuery = query.trim().slice(0, SAVED_SEARCH_QUERY_LENGTH);
    if (!trimmedName || !trimmedQuery) continue;
    ids.add(id);
    searches.push({ id, name: trimmedName, query: trimmedQuery });
    if (searches.length === SAVED_SEARCH_LIMIT) break;
  }
  return searches;
}

function normalizeDeckIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  const preferences = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    learnCollapsedDeckIds: normalizeDeckIds(preferences.learnCollapsedDeckIds),
    syncIntervalMinutes: normalizeSyncInterval(preferences.syncIntervalMinutes),
    flagNames: normalizeFlagNames(preferences.flagNames),
    savedSearches: normalizeSavedSearches(preferences.savedSearches),
    dashboardPinnedDeckIds: normalizeDeckIds(preferences.dashboardPinnedDeckIds).slice(0, DASHBOARD_PIN_LIMIT),
    dashboardStudyDays: mergeStudyDays(preferences.dashboardStudyDays, []),
  };
}

export function setDeckExpanded(value: unknown, deckId: string, expanded: boolean): UiPreferences {
  const preferences = normalizeUiPreferences(value);
  const ids = new Set(preferences.learnCollapsedDeckIds);
  if (expanded) ids.delete(deckId);
  else ids.add(deckId);
  return { ...preferences, learnCollapsedDeckIds: [...ids] };
}

/** The pin ranked lowest in `frequentDeckIds`; an unranked pin counts as lowest, ties pick the later pin. */
export function leastFrequentPin(pinnedDeckIds: readonly string[], frequentDeckIds: readonly string[]) {
  const rank = (id: string) => { const index = frequentDeckIds.indexOf(id); return index < 0 ? Infinity : index; };
  return pinnedDeckIds.reduce((least, id) => rank(id) >= rank(least) ? id : least, pinnedDeckIds[0]);
}

/** Pins first, then frequent decks, then main decks in tree order, until the widget holds four existing decks. */
export function fillDashboardDecks(pinnedDeckIds: readonly string[], frequentDeckIds: readonly string[], mainDeckIds: readonly string[], existingDeckIds: ReadonlySet<string>) {
  const pinned = pinnedDeckIds.filter((id) => existingDeckIds.has(id));
  const suggested = [...new Set([...frequentDeckIds, ...mainDeckIds])].filter((id) => existingDeckIds.has(id) && !pinned.includes(id));
  return [...pinned.map((id) => ({ id, pinned: true })), ...suggested.map((id) => ({ id, pinned: false }))].slice(0, DASHBOARD_PIN_LIMIT);
}

/** Set union of both lists, sorted by day and deck; the server also drops days outside the 14 up to its own date. */
export function mergeStudyDays(current: unknown, incoming: unknown): DashboardStudyDay[] {
  const entries = new Map<string, DashboardStudyDay>();
  for (const list of [current, incoming]) if (Array.isArray(list)) for (const entry of list) {
    const { deckId, day } = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    if (typeof deckId === "string" && deckId && isDayKey(day)) entries.set(`${day} ${deckId}`, { deckId, day });
  }
  return [...entries.values()].sort((left, right) => left.day.localeCompare(right.day) || left.deckId.localeCompare(right.deckId)).slice(-STUDY_DAY_LIMIT);
}

/** Decks started on the most of the 14 learning days up to `today`; ties rank the deck learned on a later day first. */
export function rankFrequentDeckIds(days: readonly DashboardStudyDay[], today: string) {
  const latest = dayNumber(today);
  const ranking = new Map<string, { count: number; last: number }>();
  for (const { deckId, day } of days) {
    const value = dayNumber(day);
    if (value > latest || latest - value >= STUDY_DAY_WINDOW) continue;
    const entry = ranking.get(deckId) ?? { count: 0, last: 0 };
    ranking.set(deckId, { count: entry.count + 1, last: Math.max(entry.last, value) });
  }
  return [...ranking].sort(([leftId, left], [rightId, right]) => right.count - left.count || right.last - left.last || leftId.localeCompare(rightId)).map(([deckId]) => deckId);
}
