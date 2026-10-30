import type { SyncIntervalMinutes, UiPreferences } from "./coreTypes.ts";

export type DeckExpansionSurface = "dashboard" | "learn" | "deck-manager";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  dashboardCollapsedDeckIds: [],
  learnCollapsedDeckIds: [],
  deckManagerExpandedDeckIds: [],
  syncIntervalMinutes: 5,
  flagNames: ["", "", "", "", "", "", ""],
};

const SYNC_INTERVALS = new Set<SyncIntervalMinutes>([0, 1, 5, 15, 30]);

function normalizeSyncInterval(value: unknown): SyncIntervalMinutes {
  const interval = Number(value) as SyncIntervalMinutes;
  return SYNC_INTERVALS.has(interval) ? interval : DEFAULT_UI_PREFERENCES.syncIntervalMinutes;
}

/** Seven trimmed names of at most 40 characters; missing entries stay empty. */
function normalizeFlagNames(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, index) => typeof names[index] === "string" ? names[index].trim().slice(0, 40) : "");
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
    deckManagerExpandedDeckIds: normalizeDeckIds(preferences.deckManagerExpandedDeckIds),
    syncIntervalMinutes: normalizeSyncInterval(preferences.syncIntervalMinutes),
    flagNames: normalizeFlagNames(preferences.flagNames),
  };
}

export function setDeckExpanded(
  value: unknown,
  surface: DeckExpansionSurface,
  deckId: string | readonly string[],
  expanded: boolean,
): UiPreferences {
  const preferences = normalizeUiPreferences(value);
  const key = surface === "dashboard"
    ? "dashboardCollapsedDeckIds"
    : surface === "learn"
      ? "learnCollapsedDeckIds"
      : "deckManagerExpandedDeckIds";
  const ids = new Set(preferences[key]);
  const shouldStoreId = surface === "deck-manager" ? expanded : !expanded;
  for (const id of typeof deckId === "string" ? [deckId] : deckId) {
    if (shouldStoreId) ids.add(id);
    else ids.delete(id);
  }
  return { ...preferences, [key]: [...ids] };
}
