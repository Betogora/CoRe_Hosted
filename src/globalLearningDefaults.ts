import { createDefaultDeckSettings } from "./coreModel.ts";
import type { Deck, DeckSettings, GlobalSchedulerPreferences } from "./coreTypes.ts";
import { resolveGlobalLearningDefaults } from "./deckSettings.ts";

export function createGlobalDefaultDeckSettings(
  preferences: GlobalSchedulerPreferences,
  overrides: Partial<DeckSettings> = {},
): DeckSettings {
  return createDefaultDeckSettings({
    ...resolveGlobalLearningDefaults(preferences),
    ...overrides,
  });
}

export function applyGlobalLearningDefaultsToDeck(
  deck: Deck,
  preferences: GlobalSchedulerPreferences,
  updatedAt = new Date().toISOString(),
): Deck {
  const defaults = resolveGlobalLearningDefaults(preferences);
  return {
    ...deck,
    updatedAt,
    deckSettings: createDefaultDeckSettings({
      ...deck.deckSettings,
      ...defaults,
      newCardsTodayOverride: deck.deckSettings.newCardsPerDay === defaults.newCardsPerDay
        ? deck.deckSettings.newCardsTodayOverride
        : null,
    }),
  };
}
