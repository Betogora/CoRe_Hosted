import type { SavedCardSearch, SyncIntervalMinutes, UiPreferences } from "./coreTypes.ts";

export type DeckExpansionSurface = "dashboard" | "learn";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  dashboardCollapsedDeckIds: [],
  learnCollapsedDeckIds: [],
  syncIntervalMinutes: 5,
  flagNames: ["", "", "", "", "", "", ""],
  savedSearches: [],
};

export const SAVED_SEARCH_LIMIT = 100;
export const SAVED_SEARCH_NAME_LENGTH = 60;
const SAVED_SEARCH_QUERY_LENGTH = 1_000;

const SYNC_INTERVALS = new Set<SyncIntervalMinutes>([0, 1, 5, 15, 30]);

function normalizeSyncInterval(value: unknown): SyncIntervalMinutes {
  const interval = Number(value) as SyncIntervalMinutes;
  return SYNC_INTERVALS.has(interval) ? interval : DEFAULT_UI_PREFERENCES.syncIntervalMinutes;
}

/** Seven trimmed names of at most 40 characters; missing entries stay empty. */
export function normalizeFlagNames(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, index) => typeof names[index] === "string" ? names[index].trim().slice(0, 40) : "");
}

/** Saved searches with an id, a name and a query; duplicates by id and anything beyond the limit are dropped. */
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
    dashboardCollapsedDeckIds: normalizeDeckIds(preferences.dashboardCollapsedDeckIds),
    learnCollapsedDeckIds: normalizeDeckIds(preferences.learnCollapsedDeckIds),
    syncIntervalMinutes: normalizeSyncInterval(preferences.syncIntervalMinutes),
    flagNames: normalizeFlagNames(preferences.flagNames),
    savedSearches: normalizeSavedSearches(preferences.savedSearches),
  };
}

export function setDeckExpanded(
  value: unknown,
  surface: DeckExpansionSurface,
  deckId: string | readonly string[],
  expanded: boolean,
): UiPreferences {
  const preferences = normalizeUiPreferences(value);
  const key = surface === "dashboard" ? "dashboardCollapsedDeckIds" : "learnCollapsedDeckIds";
  const ids = new Set(preferences[key]);
  for (const id of typeof deckId === "string" ? [deckId] : deckId) {
    if (!expanded) ids.add(id);
    else ids.delete(id);
  }
  return { ...preferences, [key]: [...ids] };
}
