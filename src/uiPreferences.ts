import type { UiPreferences } from "./coreTypes.ts";

export type DeckExpansionSurface = "dashboard" | "learn" | "deck-manager";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  dashboardCollapsedDeckIds: [],
  learnCollapsedDeckIds: [],
  deckManagerExpandedDeckIds: [],
};

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
  };
}

export function setDeckExpanded(
  value: unknown,
  surface: DeckExpansionSurface,
  deckId: string,
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
  if (shouldStoreId) ids.add(deckId);
  else ids.delete(deckId);
  return { ...preferences, [key]: [...ids] };
}
