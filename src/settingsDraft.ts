import type { Deck, DeckAppearance, DeckSettings, EasyDays, GlobalSchedulerPreferences, LearningProfileSource, Profile, SyncIntervalMinutes } from "./coreTypes.ts";
import { normalizeDeckAppearance } from "./coreModel.ts";
import { normalizeLearnAheadMinutes, normalizeLearningProfileSource, normalizeLearningSettings, type LearningSettingsInput } from "./deckSettings.ts";
import { normalizeEasyDays } from "./easyDays.ts";
import { normalizeDayStartHour } from "./learningDay.ts";

export interface GeneralSettingsDraft {
  displayName: string;
  syncIntervalMinutes: SyncIntervalMinutes;
}

export interface GlobalCardSettingsDraft {
  dayStartHour: number;
  learnAheadMinutes: number;
  easyDays: EasyDays;
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

export function createGeneralSettingsDraft(profile: Profile): GeneralSettingsDraft {
  return {
    displayName: String(profile.displayName ?? ""),
    syncIntervalMinutes: profile.uiPreferences.syncIntervalMinutes,
  };
}

export function createGlobalCardSettingsDraft(
  preferences: Pick<GlobalSchedulerPreferences, "dayStartHour" | "learnAheadMinutes" | "easyDays">,
): GlobalCardSettingsDraft {
  return {
    dayStartHour: normalizeDayStartHour(preferences.dayStartHour),
    learnAheadMinutes: normalizeLearnAheadMinutes(preferences.learnAheadMinutes),
    easyDays: normalizeEasyDays(preferences.easyDays),
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

function changedValue<T>(baseline: T, draft: T, target: T): T {
  if (Array.isArray(draft)) {
    return settingsDraftsEqual(baseline, draft) ? target : draft;
  }
  if (draft && typeof draft === "object") {
    const baselineRecord = (baseline ?? {}) as Record<string, unknown>;
    const draftRecord = draft as Record<string, unknown>;
    const targetRecord = (target ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(draftRecord).map(([key, value]) => [
      key,
      changedValue(baselineRecord[key], value, targetRecord[key]),
    ])) as T;
  }
  return Object.is(baseline, draft) ? target : draft;
}

export function applyDeckSettingsDraftChanges(
  baseline: DeckSettingsDraft,
  draft: DeckSettingsDraft,
  target: DeckSettingsDraft,
): DeckSettingsDraft {
  return normalizeDeckSettingsDraft({
    ...target,
    appearance: changedValue(baseline.appearance, draft.appearance, target.appearance),
    learning: changedValue(baseline.learning, draft.learning, target.learning),
  });
}

export function settingsDraftsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
