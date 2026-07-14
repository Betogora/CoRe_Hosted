import type { CoreMode, NewReviewOrder, SchedulerPreset, SchedulerProfile } from "./coreTypes.ts";

export interface LearningSettings {
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  schedulerProfile: SchedulerProfile;
}

export interface LearningSettingsInput {
  newCardsPerDay?: unknown;
  maximumReviewsPerDay?: unknown;
  newReviewOrder?: unknown;
  coreMode?: unknown;
  schedulerProfile?: Partial<SchedulerProfile> & {
    settingsVersion?: number;
    presetId?: unknown;
    name?: unknown;
    learningStepsMinutes?: unknown;
  };
}

interface SchedulerPreferences {
  profile?: string;
  coreMode?: unknown;
  deckSettings?: LearningSettingsInput;
  [key: string]: unknown;
}

interface ProfileWithSchedulerPreferences {
  schedulerPreferences?: Record<string, unknown>;
}

interface PresetDefinition {
  id: Exclude<SchedulerPreset, "custom">;
  label: string;
  description: string;
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  schedulerProfile: Omit<SchedulerProfile, "settingsVersion" | "presetId" | "name">;
}

const presetIds = new Set<SchedulerPreset>(["standard", "intensive", "relaxed", "custom"]);
const coreModes = new Set<CoreMode>(["off", "auto", "manual"]);
const reviewOrders = new Set<NewReviewOrder>(["reviews-first", "new-first", "mixed"]);

function clamp(value: unknown, min: number, max: number) {
  return Math.min(max, Math.max(min, Number(value)));
}

function wholeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(clamp(parsed, min, max)) : fallback;
}

function decimal(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(clamp(parsed, min, max) * 100) / 100 : fallback;
}

function sameNumberList(left: unknown, right: readonly number[]) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => Number(value) === right[index]);
}

function normalizeLearningSteps(profile: LearningSettingsInput["schedulerProfile"] = {}) {
  const rawSteps = Array.isArray(profile.learningStepsMinutes) ? profile.learningStepsMinutes : null;
  const isUnusedLegacyDefault = Number(profile.settingsVersion ?? 0) < 2 && sameNumberList(rawSteps, [10, 60]);
  const source = !rawSteps || isUnusedLegacyDefault ? [5, 15] : rawSteps;
  const first = wholeNumber(source[0], 5, 1, 720);
  const second = wholeNumber(source[1], Math.max(15, first * 3), first, 720);
  return [first, second];
}

const presetDefinitions = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "Ausgewogen für kontinuierliches Lernen.",
    newCardsPerDay: 20,
    maximumReviewsPerDay: 200,
    newReviewOrder: "reviews-first",
    schedulerProfile: {
      desiredRetention: 0.9,
      learningStepsMinutes: [5, 15],
      relearningStepMinutes: 5,
      graduatingIntervalDays: 1,
      easyGraduatingIntervalDays: 2,
      easyIntervalDays: 4,
      maximumIntervalDays: 36500,
      lessShortIntervalBias: false,
    },
  },
  intensive: {
    id: "intensive",
    label: "Intensiv",
    description: "Höhere Zielerinnerung und engere Wiederholungen.",
    newCardsPerDay: 15,
    maximumReviewsPerDay: 250,
    newReviewOrder: "mixed",
    schedulerProfile: {
      desiredRetention: 0.94,
      learningStepsMinutes: [3, 10],
      relearningStepMinutes: 3,
      graduatingIntervalDays: 1,
      easyGraduatingIntervalDays: 2,
      easyIntervalDays: 3,
      maximumIntervalDays: 3650,
      lessShortIntervalBias: false,
    },
  },
  relaxed: {
    id: "relaxed",
    label: "Entspannt",
    description: "Weniger neue Karten und längere Abstände.",
    newCardsPerDay: 10,
    maximumReviewsPerDay: 120,
    newReviewOrder: "reviews-first",
    schedulerProfile: {
      desiredRetention: 0.85,
      learningStepsMinutes: [10, 30],
      relearningStepMinutes: 10,
      graduatingIntervalDays: 2,
      easyGraduatingIntervalDays: 4,
      easyIntervalDays: 6,
      maximumIntervalDays: 36500,
      lessShortIntervalBias: true,
    },
  },
} satisfies Record<Exclude<SchedulerPreset, "custom">, PresetDefinition>;

export const LEARNING_SETTING_PRESETS = Object.values(presetDefinitions).map(({ id, label, description }: any) => ({ id, label, description }));

export function normalizeLearningSettings(settings: LearningSettingsInput = {}): LearningSettings {
  const sourceSettings = settings ?? {};
  const profile = sourceSettings.schedulerProfile ?? {};
  const presetId: SchedulerPreset = typeof profile.presetId === "string" && presetIds.has(profile.presetId as SchedulerPreset)
    ? profile.presetId as SchedulerPreset
    : typeof profile.name === "string" && presetIds.has(profile.name as SchedulerPreset)
      ? profile.name as SchedulerPreset
      : "custom";
  const graduatingIntervalDays = wholeNumber(profile.graduatingIntervalDays, 1, 1, 30);

  return {
    newCardsPerDay: wholeNumber(sourceSettings.newCardsPerDay, 20, 0, 500),
    maximumReviewsPerDay: wholeNumber(sourceSettings.maximumReviewsPerDay, 200, 0, 2000),
    newReviewOrder: typeof sourceSettings.newReviewOrder === "string" && reviewOrders.has(sourceSettings.newReviewOrder as NewReviewOrder)
      ? sourceSettings.newReviewOrder as NewReviewOrder
      : "reviews-first",
    schedulerProfile: {
      settingsVersion: 2,
      presetId,
      name: presetId,
      learningStepsMinutes: normalizeLearningSteps(profile),
      relearningStepMinutes: wholeNumber(profile.relearningStepMinutes, 5, 1, 720),
      graduatingIntervalDays,
      easyGraduatingIntervalDays: wholeNumber(profile.easyGraduatingIntervalDays, 2, graduatingIntervalDays, 60),
      easyIntervalDays: wholeNumber(profile.easyIntervalDays, 4, 1, 60),
      desiredRetention: decimal(profile.desiredRetention, 0.9, 0.7, 0.99),
      maximumIntervalDays: wholeNumber(profile.maximumIntervalDays, 36500, 30, 36500),
      lessShortIntervalBias: Boolean(profile.lessShortIntervalBias),
    },
  };
}

export function applyLearningPreset(settings: LearningSettingsInput = {}, presetId: string = "standard"): LearningSettings {
  const preset = presetId in presetDefinitions
    ? presetDefinitions[presetId as keyof typeof presetDefinitions]
    : presetDefinitions.standard;
  return normalizeLearningSettings({
    ...settings,
    newCardsPerDay: preset.newCardsPerDay,
    maximumReviewsPerDay: preset.maximumReviewsPerDay,
    newReviewOrder: preset.newReviewOrder,
    schedulerProfile: {
      ...(settings.schedulerProfile ?? {}),
      ...preset.schedulerProfile,
      settingsVersion: 2,
      presetId: preset.id,
      name: preset.id,
    },
  });
}

export function markLearningSettingsCustom(settings: LearningSettingsInput = {}): LearningSettings {
  const normalized = normalizeLearningSettings(settings);
  return {
    ...normalized,
    schedulerProfile: {
      ...normalized.schedulerProfile,
      presetId: "custom",
      name: "custom",
    },
  };
}

export function applyLearningSettingsToDeckSettings<T extends Record<string, unknown>>(
  deckSettings: T = {} as T,
  learningSettings: LearningSettingsInput = {},
): T & LearningSettings {
  const normalized = normalizeLearningSettings(learningSettings);
  return {
    ...deckSettings,
    ...normalized,
    schedulerProfile: {
      ...(deckSettings.schedulerProfile ?? {}),
      ...normalized.schedulerProfile,
    },
  };
}

export function getGlobalDeckSettings(profile: ProfileWithSchedulerPreferences = {}): LearningSettings & { coreMode: CoreMode } {
  const preferences = (profile.schedulerPreferences ?? {}) as SchedulerPreferences;
  const storedSettings = preferences.deckSettings;
  const requestedPreset = typeof preferences.profile === "string" && preferences.profile in presetDefinitions
    ? preferences.profile
    : "standard";
  const learningSettings = storedSettings
    ? normalizeLearningSettings(storedSettings)
    : applyLearningPreset({}, requestedPreset);

  return {
    ...learningSettings,
    coreMode: typeof preferences.coreMode === "string" && coreModes.has(preferences.coreMode as CoreMode)
      ? preferences.coreMode as CoreMode
      : "auto",
  };
}

export function withGlobalDeckSettings<T extends ProfileWithSchedulerPreferences>(
  profile: T = {} as T,
  settings: LearningSettingsInput = {},
): T & { schedulerPreferences: SchedulerPreferences } {
  const learningSettings = normalizeLearningSettings(settings);
  const coreMode: CoreMode = typeof settings.coreMode === "string" && coreModes.has(settings.coreMode as CoreMode)
    ? settings.coreMode as CoreMode
    : "auto";

  return {
    ...profile,
    schedulerPreferences: {
      ...(profile.schedulerPreferences ?? {}),
      profile: learningSettings.schedulerProfile.presetId,
      coreMode,
      deckSettings: learningSettings,
    },
  };
}
