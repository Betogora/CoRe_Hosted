import type { Deck, DeckAppearance, DeckSettings, EasyDays, GlobalSchedulerPreferences, LearningProfileSource, Profile, SyncIntervalMinutes } from "./coreTypes.ts";
import { normalizeDeckAppearance } from "./coreModel.ts";
import { normalizeLearnAheadMinutes, normalizeLearningProfileSource, normalizeLearningSettings, type LearningSettingsInput } from "./deckSettings.ts";
import { normalizeEasyDays } from "./easyDays.ts";
import { normalizeDayStartHour } from "./learningDay.ts";

export interface GlobalSettingsDraft {
  displayName: string;
  dayStartHour: number;
  learnAheadMinutes: number;
  easyDays: EasyDays;
  syncIntervalMinutes: SyncIntervalMinutes;
}

export type DeckLearningSettingsDraft = ReturnType<typeof normalizeLearningSettings> & {
  coreMode: DeckSettings["coreMode"];
  variantThresholdXp: number;
  maxActiveVariantsPerCard: number;
  learningProfileSource: LearningProfileSource | null;
};

export interface DeckSettingsDraft {
  name: string;
  appearance: DeckAppearance;
  learning: DeckLearningSettingsDraft;
}

export function createGlobalSettingsDraft(
  profile: Profile,
  preferences: Pick<GlobalSchedulerPreferences, "dayStartHour" | "learnAheadMinutes" | "easyDays">,
): GlobalSettingsDraft {
  return {
    displayName: String(profile.displayName ?? ""),
    dayStartHour: normalizeDayStartHour(preferences.dayStartHour),
    learnAheadMinutes: normalizeLearnAheadMinutes(preferences.learnAheadMinutes),
    easyDays: normalizeEasyDays(preferences.easyDays),
    syncIntervalMinutes: profile.uiPreferences.syncIntervalMinutes,
  };
}

export function createDeckLearningSettingsDraft(
  settings: LearningSettingsInput & Partial<Pick<DeckLearningSettingsDraft, "coreMode" | "variantThresholdXp" | "maxActiveVariantsPerCard" | "learningProfileSource">>,
): DeckLearningSettingsDraft {
  return {
    ...normalizeLearningSettings(settings),
    coreMode: settings.coreMode === "off" || settings.coreMode === "manual" ? settings.coreMode : "auto",
    variantThresholdXp: Number.isFinite(Number(settings.variantThresholdXp)) ? Number(settings.variantThresholdXp) : 121,
    maxActiveVariantsPerCard: Number.isFinite(Number(settings.maxActiveVariantsPerCard)) ? Number(settings.maxActiveVariantsPerCard) : 2,
    learningProfileSource: normalizeLearningProfileSource(settings.learningProfileSource),
  };
}

export function createDeckSettingsDraft(deck: Deck): DeckSettingsDraft {
  return {
    name: deck.name,
    appearance: normalizeDeckAppearance(deck.deckSettings.appearance),
    learning: createDeckLearningSettingsDraft(deck.deckSettings),
  };
}

export function normalizeDeckSettingsDraft(draft: DeckSettingsDraft): DeckSettingsDraft {
  return {
    name: draft.name.trim().replace(/\s+/g, " "),
    appearance: normalizeDeckAppearance(draft.appearance),
    learning: createDeckLearningSettingsDraft(draft.learning),
  };
}

export function settingsDraftsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
