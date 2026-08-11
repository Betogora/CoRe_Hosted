import type {
  GlobalSchedulerPreferences,
  LearningProfileSource,
  LearningProfileTemplate,
  LearningSettings,
  NewReviewOrder,
  SchedulerPreset,
  SchedulerProfile,
} from "./coreTypes.ts";
import { normalizeDayStartHour } from "./learningDay.ts";

export interface LearningSettingsInput {
  newCardsPerDay?: unknown;
  maximumReviewsPerDay?: unknown;
  learnAheadMinutes?: unknown;
  newReviewOrder?: unknown;
  coreMode?: unknown;
  variantThresholdXp?: unknown;
  maxActiveVariantsPerCard?: unknown;
  learningProfileSource?: unknown;
  schedulerProfile?: {
    settingsVersion?: unknown;
    presetId?: unknown;
    learningStepsMinutes?: unknown;
    relearningStepMinutes?: unknown;
    desiredRetention?: unknown;
    maximumIntervalDays?: unknown;
    lessShortIntervalBias?: unknown;
    // Persisted v1/v2 inputs are read for migration but never emitted again.
    name?: unknown;
    graduatingIntervalDays?: unknown;
    easyGraduatingIntervalDays?: unknown;
    easyIntervalDays?: unknown;
  };
}

export interface GlobalSchedulerPreferencesInput {
  dayStartHour?: unknown;
  learnAheadMinutes?: unknown;
  learningProfiles?: unknown;
}

interface ProfileWithSchedulerPreferences {
  schedulerPreferences?: unknown;
}

interface PresetDefinition {
  id: Exclude<SchedulerPreset, "custom">;
  label: string;
  description: string;
  settings: LearningSettings;
}

const presetIds = new Set<SchedulerPreset>(["standard", "intensive", "relaxed", "custom"]);
const reviewOrders = new Set<NewReviewOrder>(["reviews-first", "new-first", "mixed"]);
const LEGACY_PROFILE_ID = "legacy:global-learning-settings";
const DEFAULT_PROFILE_NAME = "Eigenes Lernprofil";

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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
  const rawSteps = Array.isArray(profile?.learningStepsMinutes) ? profile.learningStepsMinutes : null;
  const isUnusedLegacyDefault = Number(profile?.settingsVersion ?? 0) < 2 && sameNumberList(rawSteps, [10, 60]);
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
    settings: {
      newCardsPerDay: 20,
      maximumReviewsPerDay: 200,
      newReviewOrder: "reviews-first",
      schedulerProfile: {
        settingsVersion: 2,
        presetId: "standard",
        desiredRetention: 0.9,
        learningStepsMinutes: [5, 15],
        relearningStepMinutes: 5,
        maximumIntervalDays: 1000,
        lessShortIntervalBias: false,
      },
    },
  },
  intensive: {
    id: "intensive",
    label: "Intensiv",
    description: "Höhere Zielerinnerung und engere Wiederholungen.",
    settings: {
      newCardsPerDay: 30,
      maximumReviewsPerDay: 300,
      newReviewOrder: "mixed",
      schedulerProfile: {
        settingsVersion: 2,
        presetId: "intensive",
        desiredRetention: 0.94,
        learningStepsMinutes: [3, 10],
        relearningStepMinutes: 3,
        maximumIntervalDays: 365,
        lessShortIntervalBias: false,
      },
    },
  },
  relaxed: {
    id: "relaxed",
    label: "Entspannt",
    description: "Weniger neue Karten und längere Abstände.",
    settings: {
      newCardsPerDay: 10,
      maximumReviewsPerDay: 100,
      newReviewOrder: "reviews-first",
      schedulerProfile: {
        settingsVersion: 2,
        presetId: "relaxed",
        desiredRetention: 0.85,
        learningStepsMinutes: [10, 30],
        relearningStepMinutes: 10,
        maximumIntervalDays: 2000,
        lessShortIntervalBias: true,
      },
    },
  },
} satisfies Record<Exclude<SchedulerPreset, "custom">, PresetDefinition>;

export const LEARNING_SETTING_PRESETS = Object.values(presetDefinitions).map(({ id, label, description }) => ({ id, label, description }));

export const BUILT_IN_LEARNING_PROFILE_TEMPLATES: readonly LearningProfileTemplate[] = Object.values(presetDefinitions).map((preset) => ({
  id: `builtin:${preset.id}`,
  name: preset.label,
  contentVersion: 1,
  settings: preset.settings,
}));

export function normalizeLearnAheadMinutes(value: unknown): number {
  return wholeNumber(value, 20, 0, 720);
}

export function normalizeLearningSettings(settings: LearningSettingsInput = {}): LearningSettings {
  const profile = settings?.schedulerProfile ?? {};
  const hasExplicitSettings = settings.newCardsPerDay !== undefined
    || settings.maximumReviewsPerDay !== undefined
    || settings.newReviewOrder !== undefined
    || Object.keys(profile).length > 0;
  const requestedPreset = typeof profile.presetId === "string" && presetIds.has(profile.presetId as SchedulerPreset)
    ? profile.presetId as SchedulerPreset
    : typeof profile.name === "string" && presetIds.has(profile.name as SchedulerPreset)
      ? profile.name as SchedulerPreset
      : hasExplicitSettings ? "custom" : "standard";
  const preset = requestedPreset === "custom" ? null : presetDefinitions[requestedPreset];

  return {
    newCardsPerDay: wholeNumber(preset?.settings.newCardsPerDay ?? settings.newCardsPerDay, 20, 0, 500),
    maximumReviewsPerDay: wholeNumber(preset?.settings.maximumReviewsPerDay ?? settings.maximumReviewsPerDay, 200, 0, 2000),
    newReviewOrder: preset?.settings.newReviewOrder
      ?? (typeof settings.newReviewOrder === "string" && reviewOrders.has(settings.newReviewOrder as NewReviewOrder)
        ? settings.newReviewOrder as NewReviewOrder
        : "reviews-first"),
    schedulerProfile: {
      settingsVersion: 2,
      presetId: requestedPreset,
      learningStepsMinutes: preset?.settings.schedulerProfile.learningStepsMinutes ?? normalizeLearningSteps(profile),
      relearningStepMinutes: preset?.settings.schedulerProfile.relearningStepMinutes
        ?? wholeNumber(profile.relearningStepMinutes, 5, 1, 720),
      desiredRetention: preset?.settings.schedulerProfile.desiredRetention
        ?? decimal(profile.desiredRetention, 0.9, 0.7, 0.99),
      maximumIntervalDays: preset?.settings.schedulerProfile.maximumIntervalDays
        ?? wholeNumber(profile.maximumIntervalDays, 1000, 30, 36500),
      lessShortIntervalBias: preset?.settings.schedulerProfile.lessShortIntervalBias
        ?? Boolean(profile.lessShortIntervalBias),
    },
  };
}

export function applyLearningPreset(_settings: LearningSettingsInput = {}, presetId: string = "standard"): LearningSettings {
  const preset = presetId in presetDefinitions
    ? presetDefinitions[presetId as keyof typeof presetDefinitions]
    : presetDefinitions.standard;
  return normalizeLearningSettings({ schedulerProfile: { presetId: preset.id } });
}

export function markLearningSettingsCustom(settings: LearningSettingsInput = {}): LearningSettings {
  return normalizeLearningSettings({
    ...settings,
    schedulerProfile: {
      ...(settings.schedulerProfile ?? {}),
      presetId: "custom",
    },
  });
}

export function normalizeLearningProfileSource(value: unknown): LearningProfileSource | null {
  const source = objectRecord(value);
  const id = typeof source.id === "string" ? source.id.trim() : "";
  if (!id) return null;
  return {
    id,
    contentVersion: wholeNumber(source.contentVersion, 1, 1, Number.MAX_SAFE_INTEGER),
  };
}

function normalizedProfileName(value: unknown, fallback = DEFAULT_PROFILE_NAME) {
  return String(value ?? "").trim() || fallback;
}

function normalizedNameKey(value: string) {
  return value.toLocaleLowerCase("de-DE");
}

function uniqueProfileName(requested: unknown, profiles: readonly LearningProfileTemplate[], excludedId: string | null = null) {
  const base = normalizedProfileName(requested);
  const usedNames = new Set(
    [...BUILT_IN_LEARNING_PROFILE_TEMPLATES, ...profiles]
      .filter((profile) => profile.id !== excludedId)
      .map((profile) => normalizedNameKey(profile.name)),
  );
  if (!usedNames.has(normalizedNameKey(base))) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!usedNames.has(normalizedNameKey(candidate))) return candidate;
  }
}

function generateProfileId() {
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `learning-profile:${value}`;
}

function customTemplate(input: Record<string, unknown>, profiles: readonly LearningProfileTemplate[]): LearningProfileTemplate | null {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id || BUILT_IN_LEARNING_PROFILE_TEMPLATES.some((profile) => profile.id === id)) return null;
  return {
    id,
    name: uniqueProfileName(input.name, profiles),
    contentVersion: wholeNumber(input.contentVersion, 1, 1, Number.MAX_SAFE_INTEGER),
    settings: markLearningSettingsCustom(objectRecord(input.settings) as LearningSettingsInput),
  };
}

export function normalizeLearningProfileTemplates(value: unknown): LearningProfileTemplate[] {
  if (!Array.isArray(value)) return [];
  const profiles: LearningProfileTemplate[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const template = customTemplate(objectRecord(candidate), profiles);
    if (!template || ids.has(template.id)) continue;
    ids.add(template.id);
    profiles.push(template);
  }
  return profiles;
}

export function getLearningProfileTemplate(profiles: unknown, id: string): LearningProfileTemplate | null {
  return [...BUILT_IN_LEARNING_PROFILE_TEMPLATES, ...normalizeLearningProfileTemplates(profiles)]
    .find((profile) => profile.id === id) ?? null;
}

export function createLearningProfileTemplate(
  profiles: unknown,
  input: { id?: string; name?: unknown; defaultName?: string; settings?: LearningSettingsInput } = {},
) {
  const current = normalizeLearningProfileTemplates(profiles);
  let id = String(input.id ?? "").trim() || generateProfileId();
  while (getLearningProfileTemplate(current, id)) id = generateProfileId();
  const template: LearningProfileTemplate = {
    id,
    name: uniqueProfileName(input.name, current, id),
    contentVersion: 1,
    settings: markLearningSettingsCustom(input.settings),
  };
  if (!String(input.name ?? "").trim() && input.defaultName) {
    template.name = uniqueProfileName(input.defaultName, current, id);
  }
  return { profiles: [...current, template], template };
}

export function renameLearningProfileTemplate(profiles: unknown, id: string, name: unknown): LearningProfileTemplate[] {
  const current = normalizeLearningProfileTemplates(profiles);
  if (!current.some((profile) => profile.id === id)) throw new Error("Lernprofil wurde nicht gefunden.");
  const nextName = uniqueProfileName(name, current, id);
  return current.map((profile) => profile.id === id ? { ...profile, name: nextName } : profile);
}

export function updateLearningProfileTemplate(profiles: unknown, id: string, settings: LearningSettingsInput): LearningProfileTemplate[] {
  const current = normalizeLearningProfileTemplates(profiles);
  const existing = current.find((profile) => profile.id === id);
  if (!existing) throw new Error("Lernprofil wurde nicht gefunden.");
  const nextSettings = markLearningSettingsCustom(settings);
  const changed = JSON.stringify(existing.settings) !== JSON.stringify(nextSettings);
  return current.map((profile) => profile.id === id
    ? { ...profile, settings: nextSettings, contentVersion: changed ? profile.contentVersion + 1 : profile.contentVersion }
    : profile);
}

export function deleteLearningProfileTemplate(profiles: unknown, id: string): LearningProfileTemplate[] {
  const current = normalizeLearningProfileTemplates(profiles);
  if (!current.some((profile) => profile.id === id)) throw new Error("Lernprofil wurde nicht gefunden.");
  return current.filter((profile) => profile.id !== id);
}

export function applyLearningProfileTemplateToDeckSettings<T extends Record<string, unknown>>(
  deckSettings: T,
  template: LearningProfileTemplate,
): Omit<T, keyof LearningSettings | "learningProfileSource"> & LearningSettings & { learningProfileSource: LearningProfileSource } {
  const settings = template.id.startsWith("builtin:")
    ? normalizeLearningSettings(template.settings)
    : markLearningSettingsCustom(template.settings);
  return {
    ...deckSettings,
    ...settings,
    ...(deckSettings.newCardsPerDay !== settings.newCardsPerDay ? { newCardsTodayOverride: null } : {}),
    learningProfileSource: { id: template.id, contentVersion: template.contentVersion },
  };
}

function comparableLearningSettings(settings: LearningSettings) {
  return {
    newCardsPerDay: settings.newCardsPerDay,
    maximumReviewsPerDay: settings.maximumReviewsPerDay,
    newReviewOrder: settings.newReviewOrder,
    schedulerProfile: {
      learningStepsMinutes: settings.schedulerProfile.learningStepsMinutes,
      relearningStepMinutes: settings.schedulerProfile.relearningStepMinutes,
      desiredRetention: settings.schedulerProfile.desiredRetention,
      maximumIntervalDays: settings.schedulerProfile.maximumIntervalDays,
      lessShortIntervalBias: settings.schedulerProfile.lessShortIntervalBias,
    },
  };
}

function matchesBuiltIn(settings: LearningSettings) {
  const comparable = JSON.stringify(comparableLearningSettings(settings));
  return BUILT_IN_LEARNING_PROFILE_TEMPLATES.some((template) => (
    JSON.stringify(comparableLearningSettings(template.settings)) === comparable
  ));
}

function withLegacyGlobalProfile(
  profiles: LearningProfileTemplate[],
  preferences: Record<string, unknown>,
): LearningProfileTemplate[] {
  const legacyDeckSettings = objectRecord(preferences.deckSettings);
  if (Object.keys(legacyDeckSettings).length === 0) return profiles;
  const settings = markLearningSettingsCustom(legacyDeckSettings as LearningSettingsInput);
  if (matchesBuiltIn(settings) || profiles.some((profile) => profile.id === LEGACY_PROFILE_ID)) return profiles;
  const legacyTemplate: LearningProfileTemplate = {
    id: LEGACY_PROFILE_ID,
    name: uniqueProfileName("Bisherige globale Lernvorgabe", profiles),
    contentVersion: 1,
    settings,
  };
  return [...profiles, legacyTemplate];
}

export function getGlobalSchedulerPreferences(profile: ProfileWithSchedulerPreferences = {}): GlobalSchedulerPreferences {
  const preferences = objectRecord(profile.schedulerPreferences);
  const legacyDeckSettings = objectRecord(preferences.deckSettings);
  const profiles = withLegacyGlobalProfile(
    normalizeLearningProfileTemplates(preferences.learningProfiles),
    preferences,
  );
  return {
    settingsVersion: 1,
    dayStartHour: normalizeDayStartHour(preferences.dayStartHour),
    learnAheadMinutes: normalizeLearnAheadMinutes(
      Object.hasOwn(preferences, "learnAheadMinutes") ? preferences.learnAheadMinutes : legacyDeckSettings.learnAheadMinutes,
    ),
    learningProfiles: profiles,
  };
}

export function withGlobalSchedulerPreferences<T extends ProfileWithSchedulerPreferences>(
  profile: T = {} as T,
  patch: GlobalSchedulerPreferencesInput = {},
): T & { schedulerPreferences: GlobalSchedulerPreferences } {
  const current = getGlobalSchedulerPreferences(profile);
  return {
    ...profile,
    schedulerPreferences: {
      settingsVersion: 1,
      dayStartHour: normalizeDayStartHour(Object.hasOwn(patch, "dayStartHour") ? patch.dayStartHour : current.dayStartHour),
      learnAheadMinutes: normalizeLearnAheadMinutes(Object.hasOwn(patch, "learnAheadMinutes") ? patch.learnAheadMinutes : current.learnAheadMinutes),
      learningProfiles: Object.hasOwn(patch, "learningProfiles")
        ? normalizeLearningProfileTemplates(patch.learningProfiles)
        : current.learningProfiles,
    },
  };
}
