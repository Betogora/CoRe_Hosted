import type { SavedCardSearch, SyncIntervalMinutes, UiPreferences } from "./coreTypes.ts";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  learnCollapsedDeckIds: [],
  syncIntervalMinutes: 5,
  flagNames: ["", "", "", "", "", "", ""],
  savedSearches: [],
  dashboardPinnedDeckIds: [],
};

export const DASHBOARD_PIN_LIMIT = 4;

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
