const presetIds = new Set(["standard", "intensive", "relaxed", "custom"]);
const coreModes = new Set(["off", "auto", "manual"]);
const reviewOrders = new Set(["reviews-first", "new-first", "mixed"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function wholeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(clamp(parsed, min, max)) : fallback;
}

function decimal(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(clamp(parsed, min, max) * 100) / 100 : fallback;
}

function sameNumberList(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => Number(value) === right[index]);
}

function normalizeLearningSteps(profile = {}) {
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
};

export const LEARNING_SETTING_PRESETS = Object.values(presetDefinitions).map(({ id, label, description }) => ({ id, label, description }));

export function normalizeLearningSettings(settings = {}) {
  const sourceSettings = settings ?? {};
  const profile = sourceSettings.schedulerProfile ?? {};
  const presetId = presetIds.has(profile.presetId)
    ? profile.presetId
    : presetIds.has(profile.name)
      ? profile.name
      : "custom";
  const graduatingIntervalDays = wholeNumber(profile.graduatingIntervalDays, 1, 1, 30);

  return {
    newCardsPerDay: wholeNumber(sourceSettings.newCardsPerDay, 20, 0, 500),
    maximumReviewsPerDay: wholeNumber(sourceSettings.maximumReviewsPerDay, 200, 0, 2000),
    newReviewOrder: reviewOrders.has(sourceSettings.newReviewOrder) ? sourceSettings.newReviewOrder : "reviews-first",
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

export function applyLearningPreset(settings = {}, presetId = "standard") {
  const preset = presetDefinitions[presetId] ?? presetDefinitions.standard;
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

export function markLearningSettingsCustom(settings = {}) {
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

export function applyLearningSettingsToDeckSettings(deckSettings = {}, learningSettings = {}) {
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

export function getGlobalDeckSettings(profile = {}) {
  const preferences = profile.schedulerPreferences ?? {};
  const storedSettings = preferences.deckSettings;
  const learningSettings = storedSettings
    ? normalizeLearningSettings(storedSettings)
    : applyLearningPreset({}, presetDefinitions[preferences.profile] ? preferences.profile : "standard");

  return {
    ...learningSettings,
    coreMode: coreModes.has(preferences.coreMode) ? preferences.coreMode : "auto",
  };
}

export function withGlobalDeckSettings(profile = {}, settings = {}) {
  const learningSettings = normalizeLearningSettings(settings);
  const coreMode = coreModes.has(settings.coreMode) ? settings.coreMode : "auto";

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
