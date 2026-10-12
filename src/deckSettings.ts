import type { LearningSettings } from "./coreTypes.ts";
import { normalizeLearningSettings, type LearningSettingsInput } from "./learningProfiles.ts";

export type { LearningSettings } from "./coreTypes.ts";
export type { LearningSettingsInput } from "./learningProfiles.ts";
export {
  applyLearningPreset,
  applyLearningProfileTemplateToDeckSettings,
  BUILT_IN_LEARNING_PROFILE_TEMPLATES,
  createLearningProfileTemplate,
  deleteLearningProfileTemplate,
  getGlobalSchedulerPreferences,
  markLearningSettingsCustom,
  normalizeLearnAheadMinutes,
  normalizeLearningProfileSource,
  normalizeLearningSettings,
  renameLearningProfileTemplate,
  resolveGlobalLearningDefaults,
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
