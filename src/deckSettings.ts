import type { LearningSettings } from "./coreTypes.ts";
import { normalizeLearningSettings, type LearningSettingsInput } from "./learningProfiles.ts";

export type { LearningSettings } from "./coreTypes.ts";
export type { GlobalSchedulerPreferencesInput, LearningSettingsInput } from "./learningProfiles.ts";
export {
  applyLearningPreset,
  applyLearningProfileTemplateToDeckSettings,
  BUILT_IN_LEARNING_PROFILE_TEMPLATES,
  createLearningProfileTemplate,
  deleteLearningProfileTemplate,
  getGlobalSchedulerPreferences,
  getLearningProfileTemplate,
  LEARNING_SETTING_PRESETS,
  markLearningSettingsCustom,
  normalizeLearnAheadMinutes,
  normalizeLearningProfileSource,
  normalizeLearningProfileTemplates,
  normalizeLearningSettings,
  renameLearningProfileTemplate,
  updateLearningProfileTemplate,
  withGlobalSchedulerPreferences,
} from "./learningProfiles.ts";

export function applyLearningSettingsToDeckSettings<T extends Record<string, unknown>>(
  deckSettings: T = {} as T,
  learningSettings: LearningSettingsInput = {},
): Omit<T, keyof LearningSettings | "learningProfileSource"> & LearningSettings & { learningProfileSource: null } {
  const normalized = normalizeLearningSettings(learningSettings);
  return {
    ...deckSettings,
    ...normalized,
    learningProfileSource: null,
  };
}
