import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EASY_DAYS } from "./easyDays.ts";
import {
  applyLearningPreset,
  applyLearningSettingsToDeckSettings,
  getGlobalSchedulerPreferences,
  markLearningSettingsCustom,
  normalizeLearnAheadMinutes,
  normalizeLearningSettings,
  resolveGlobalLearningDefaults,
  withGlobalSchedulerPreferences,
} from "./deckSettings.ts";

test("deck learning settings keep account-wide learn-ahead outside the canonical scheduler profile", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 12,
    learnAheadMinutes: 45,
    schedulerProfile: {
      learningStepsMinutes: [10, 30],
    },
  });

  assert.equal(settings.newCardsPerDay, 12);
  assert.equal(settings.newCardSortOrder, "oldest-first");
  assert.equal(settings.reviewCardSortOrder, "most-overdue");
  assert.equal("learnAheadMinutes" in settings, false);
  assert.deepEqual(settings.schedulerProfile.learningStepsMinutes, [10, 30]);
});

test("built-in presets remain canonical and custom edits preserve normalized values", () => {
  const intensive = applyLearningPreset({}, "intensive");
  const custom = markLearningSettingsCustom({ ...intensive, maximumReviewsPerDay: 90 });

  assert.equal(intensive.schedulerProfile.presetId, "intensive");
  assert.equal(intensive.newCardsPerDay, 30);
  assert.equal(intensive.maximumReviewsPerDay, 300);
  assert.equal(intensive.newCardSortOrder, "oldest-first");
  assert.equal(intensive.reviewCardSortOrder, "most-overdue");
  assert.equal(intensive.schedulerProfile.maximumIntervalDays, 365);
  assert.equal(intensive.schedulerProfile.desiredRetention, 0.94);
  assert.equal(custom.schedulerProfile.presetId, "custom");
  assert.equal(custom.maximumReviewsPerDay, 90);

  const customSorting = markLearningSettingsCustom({
    ...intensive,
    newCardSortOrder: "random",
    reviewCardSortOrder: "lowest-retrievability",
  });
  assert.equal(customSorting.newCardSortOrder, "random");
  assert.equal(customSorting.reviewCardSortOrder, "lowest-retrievability");
});

test("visible learning values clamp at their canonical domain limits", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 900,
    maximumReviewsPerDay: 9000,
    schedulerProfile: {
      presetId: "custom",
      desiredRetention: 2,
      maximumIntervalDays: 20,
    },
  });

  assert.equal(settings.newCardsPerDay, 500);
  assert.equal(settings.maximumReviewsPerDay, 2000);
  assert.equal(settings.schedulerProfile.desiredRetention, 0.99);
  assert.equal(settings.schedulerProfile.maximumIntervalDays, 30);
});

test("version-two scheduler preferences normalize to version three with a standard deck default", () => {
  const defaults = getGlobalSchedulerPreferences({});
  const saved = withGlobalSchedulerPreferences({}, {
    dayStartHour: 29,
    learnAheadMinutes: 721,
    learningProfiles: [{
      id: "profile-1",
      name: "Prüfung",
      contentVersion: 2,
      settings: markLearningSettingsCustom({ newCardsPerDay: 40 }),
    }],
  });

  assert.equal(defaults.settingsVersion, 3);
  assert.equal(defaults.dayStartHour, 0);
  assert.equal(defaults.learnAheadMinutes, 20);
  assert.deepEqual(defaults.easyDays, DEFAULT_EASY_DAYS);
  assert.deepEqual(defaults.learningProfiles, []);
  assert.equal(defaults.defaultLearningSettings.newCardsPerDay, 20);
  assert.deepEqual(defaults.defaultLearningSettings.learningProfileSource, { id: "builtin:standard", contentVersion: 1 });
  assert.equal(saved.schedulerPreferences.dayStartHour, 23);
  assert.equal(saved.schedulerPreferences.learnAheadMinutes, 720);
  assert.equal(saved.schedulerPreferences.learningProfiles[0].name, "Prüfung");
  assert.equal(normalizeLearnAheadMinutes(-1), 0);
  assert.equal(normalizeLearnAheadMinutes("invalid"), 20);
});

test("global defaults follow the selected template while deletion keeps the resolved snapshot", () => {
  const profile = {
    id: "profile-1",
    name: "Prüfung",
    contentVersion: 2,
    settings: markLearningSettingsCustom({ newCardsPerDay: 40 }),
  };
  const saved = withGlobalSchedulerPreferences({}, {
    learningProfiles: [profile],
    defaultLearningSettings: {
      ...profile.settings,
      learningProfileSource: { id: profile.id, contentVersion: profile.contentVersion },
      variantThresholdXp: 181,
      maxActiveVariantsPerCard: 3,
    },
  });
  const updated = withGlobalSchedulerPreferences(saved, {
    learningProfiles: [{ ...profile, contentVersion: 3, settings: markLearningSettingsCustom({ newCardsPerDay: 55 }) }],
  });
  const deleted = withGlobalSchedulerPreferences(updated, { learningProfiles: [] });

  assert.equal(resolveGlobalLearningDefaults(saved.schedulerPreferences).newCardsPerDay, 40);
  assert.equal(resolveGlobalLearningDefaults(updated.schedulerPreferences).newCardsPerDay, 55);
  assert.deepEqual(updated.schedulerPreferences.defaultLearningSettings.learningProfileSource, { id: profile.id, contentVersion: 3 });
  assert.equal(deleted.schedulerPreferences.defaultLearningSettings.newCardsPerDay, 55);
  assert.equal(deleted.schedulerPreferences.defaultLearningSettings.learningProfileSource, null);
  assert.equal(deleted.schedulerPreferences.defaultLearningSettings.variantThresholdXp, 181);
});

test("direct deck edits clear copied-profile provenance and preserve deck-only fields", () => {
  const next = applyLearningSettingsToDeckSettings(
    {
      coreMode: "off",
      appearance: { iconKey: "brain", iconColor: "#123456" },
      learningProfileSource: { id: "profile-1", contentVersion: 3 },
      newCardsTodayOverride: { date: "2026-07-10", limit: 4 },
    },
    markLearningSettingsCustom({ newCardsPerDay: 30 }),
  );

  assert.deepEqual(next.appearance, { iconKey: "brain", iconColor: "#123456" });
  assert.deepEqual(next.newCardsTodayOverride, { date: "2026-07-10", limit: 4 });
  assert.equal(next.coreMode, "off");
  assert.equal(next.learningProfileSource, null);
  assert.equal(next.newCardsPerDay, 30);
});
