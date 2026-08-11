import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLearningPreset,
  applyLearningSettingsToDeckSettings,
  getGlobalSchedulerPreferences,
  markLearningSettingsCustom,
  normalizeLearnAheadMinutes,
  normalizeLearningSettings,
  withGlobalSchedulerPreferences,
} from "./deckSettings.ts";

test("deck learning settings exclude account-wide learn-ahead and retired scheduler fields", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 12,
    learnAheadMinutes: 45,
    schedulerProfile: {
      name: "custom",
      learningStepsMinutes: [10, 60],
      graduatingIntervalDays: 3,
      easyGraduatingIntervalDays: 5,
      easyIntervalDays: 8,
    },
  });

  assert.equal(settings.newCardsPerDay, 12);
  assert.equal("learnAheadMinutes" in settings, false);
  assert.deepEqual(settings.schedulerProfile.learningStepsMinutes, [5, 15]);
  assert.equal("name" in settings.schedulerProfile, false);
  assert.equal("graduatingIntervalDays" in settings.schedulerProfile, false);
  assert.equal("easyGraduatingIntervalDays" in settings.schedulerProfile, false);
  assert.equal("easyIntervalDays" in settings.schedulerProfile, false);
});

test("built-in presets remain canonical and custom edits preserve normalized values", () => {
  const intensive = applyLearningPreset({}, "intensive");
  const custom = markLearningSettingsCustom({ ...intensive, maximumReviewsPerDay: 90 });

  assert.equal(intensive.schedulerProfile.presetId, "intensive");
  assert.equal(intensive.newCardsPerDay, 30);
  assert.equal(intensive.maximumReviewsPerDay, 300);
  assert.equal(intensive.schedulerProfile.maximumIntervalDays, 365);
  assert.equal(intensive.schedulerProfile.desiredRetention, 0.94);
  assert.equal(custom.schedulerProfile.presetId, "custom");
  assert.equal(custom.maximumReviewsPerDay, 90);
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

test("global scheduler preferences own day start, learn-ahead and custom templates", () => {
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

  assert.deepEqual(defaults, {
    settingsVersion: 1,
    dayStartHour: 0,
    learnAheadMinutes: 20,
    learningProfiles: [],
  });
  assert.equal(saved.schedulerPreferences.dayStartHour, 23);
  assert.equal(saved.schedulerPreferences.learnAheadMinutes, 720);
  assert.equal(saved.schedulerPreferences.learningProfiles[0].name, "Prüfung");
  assert.equal(normalizeLearnAheadMinutes(-1), 0);
  assert.equal(normalizeLearnAheadMinutes("invalid"), 20);
});

test("legacy global custom settings backfill once and move learn-ahead account-wide", () => {
  const legacy = {
    schedulerPreferences: {
      profile: "custom",
      coreMode: "manual",
      dayStartHour: 3,
      deckSettings: {
        newCardsPerDay: 37,
        maximumReviewsPerDay: 730,
        learnAheadMinutes: 35,
        schedulerProfile: { presetId: "custom", desiredRetention: 0.93 },
      },
    },
  };
  const normalized = getGlobalSchedulerPreferences(legacy);
  const persisted = withGlobalSchedulerPreferences(legacy, {});

  assert.equal(normalized.dayStartHour, 3);
  assert.equal(normalized.learnAheadMinutes, 35);
  assert.equal(normalized.learningProfiles.length, 1);
  assert.equal(normalized.learningProfiles[0].id, "legacy:global-learning-settings");
  assert.equal(normalized.learningProfiles[0].settings.newCardsPerDay, 37);
  assert.equal("learnAheadMinutes" in normalized.learningProfiles[0].settings, false);
  assert.equal("profile" in persisted.schedulerPreferences, false);
  assert.equal("coreMode" in persisted.schedulerPreferences, false);
  assert.equal("deckSettings" in persisted.schedulerPreferences, false);
});

test("legacy settings equal to a built-in do not create a redundant profile", () => {
  const normalized = getGlobalSchedulerPreferences({
    schedulerPreferences: {
      profile: "custom",
      deckSettings: {
        ...applyLearningPreset({}, "standard"),
        schedulerProfile: { ...applyLearningPreset({}, "standard").schedulerProfile, presetId: "custom" },
      },
    },
  });

  assert.deepEqual(normalized.learningProfiles, []);
});

test("legacy custom drafts survive even when a built-in profile was selected", () => {
  const normalized = getGlobalSchedulerPreferences({
    schedulerPreferences: {
      profile: "standard",
      deckSettings: {
        newCardsPerDay: 47,
        maximumReviewsPerDay: 333,
        newReviewOrder: "mixed",
        schedulerProfile: { presetId: "custom", desiredRetention: 0.96 },
      },
    },
  });

  assert.equal(normalized.learningProfiles.length, 1);
  assert.equal(normalized.learningProfiles[0].name, "Bisherige globale Lernvorgabe");
  assert.equal(normalized.learningProfiles[0].settings.newCardsPerDay, 47);
  assert.equal(normalized.learningProfiles[0].settings.maximumReviewsPerDay, 333);
  assert.equal(normalized.learningProfiles[0].settings.schedulerProfile.desiredRetention, 0.96);
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
