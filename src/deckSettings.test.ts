import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLearningPreset,
  applyLearningSettingsToDeckSettings,
  getCustomGlobalDeckSettings,
  getGlobalDeckSettings,
  markLearningSettingsCustom,
  normalizeLearningSettings,
  withGlobalDeckSettings,
} from "./deckSettings.ts";

test("new profiles use the standard learning profile by default", () => {
  const settings = getGlobalDeckSettings({});

  assert.equal(settings.schedulerProfile.presetId, "standard");
  assert.equal(settings.newCardsPerDay, 20);
  assert.equal(settings.schedulerProfile.desiredRetention, 0.9);
});

test("learning settings migrate the previously unused legacy step defaults", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 12,
    schedulerProfile: {
      name: "standard",
      learningStepsMinutes: [10, 60],
    },
  });

  assert.equal(settings.newCardsPerDay, 20);
  assert.equal(settings.maximumReviewsPerDay, 200);
  assert.equal(settings.learnAheadMinutes, 20);
  assert.deepEqual(settings.schedulerProfile.learningStepsMinutes, [5, 15]);
  assert.equal(settings.schedulerProfile.settingsVersion, 2);
  assert.equal(settings.schedulerProfile.desiredRetention, 0.9);
});

test("learning settings keep compatible starting intervals and clamp visible daily limits", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 900,
    maximumReviewsPerDay: 9000,
    schedulerProfile: {
      graduatingIntervalDays: 3,
      easyGraduatingIntervalDays: 5,
      easyIntervalDays: 8,
    },
  });

  assert.equal(settings.newCardsPerDay, 500);
  assert.equal(settings.maximumReviewsPerDay, 2000);
  assert.equal(settings.schedulerProfile.graduatingIntervalDays, 3);
  assert.equal(settings.schedulerProfile.easyGraduatingIntervalDays, 5);
  assert.equal(settings.schedulerProfile.easyIntervalDays, 8);
});

test("learn-ahead defaults to 20 minutes and clamps persisted values", () => {
  assert.equal(normalizeLearningSettings({}).learnAheadMinutes, 20);
  assert.equal(normalizeLearningSettings({ learnAheadMinutes: -1 }).learnAheadMinutes, 0);
  assert.equal(normalizeLearningSettings({ learnAheadMinutes: 721.4 }).learnAheadMinutes, 720);
  assert.equal(normalizeLearningSettings({ learnAheadMinutes: 19.6 }).learnAheadMinutes, 20);
});

test("learning presets stay shallow for the UI and become custom after edits", () => {
  const intensive = applyLearningPreset({}, "intensive");
  const custom = markLearningSettingsCustom({
    ...intensive,
    maximumReviewsPerDay: 90,
  });

  assert.equal(intensive.schedulerProfile.presetId, "intensive");
  assert.equal(intensive.newCardsPerDay, 30);
  assert.equal(intensive.maximumReviewsPerDay, 300);
  assert.equal(intensive.schedulerProfile.maximumIntervalDays, 365);
  assert.equal(intensive.schedulerProfile.desiredRetention, 0.94);
  assert.equal(intensive.learnAheadMinutes, 20);
  assert.equal(custom.schedulerProfile.presetId, "custom");
  assert.equal(custom.maximumReviewsPerDay, 90);
});

test("learning presets expose the requested daily limits and maximum intervals", () => {
  const standard = applyLearningPreset({}, "standard");
  const intensive = applyLearningPreset({}, "intensive");
  const relaxed = applyLearningPreset({}, "relaxed");
  const custom = normalizeLearningSettings({ schedulerProfile: { presetId: "custom" } });

  assert.deepEqual(
    [standard, intensive, relaxed, custom].map((settings) => ({
      newCardsPerDay: settings.newCardsPerDay,
      maximumReviewsPerDay: settings.maximumReviewsPerDay,
      maximumIntervalDays: settings.schedulerProfile.maximumIntervalDays,
    })),
    [
      { newCardsPerDay: 20, maximumReviewsPerDay: 200, maximumIntervalDays: 1000 },
      { newCardsPerDay: 30, maximumReviewsPerDay: 300, maximumIntervalDays: 365 },
      { newCardsPerDay: 10, maximumReviewsPerDay: 100, maximumIntervalDays: 2000 },
      { newCardsPerDay: 20, maximumReviewsPerDay: 200, maximumIntervalDays: 1000 },
    ],
  );
});

test("normalization refreshes named presets and preserves stored custom values", () => {
  const named = normalizeLearningSettings({
    newCardsPerDay: 15,
    maximumReviewsPerDay: 250,
    schedulerProfile: {
      presetId: "intensive",
      maximumIntervalDays: 3650,
    },
  });
  const custom = normalizeLearningSettings({
    newCardsPerDay: 37,
    maximumReviewsPerDay: 730,
    schedulerProfile: {
      presetId: "custom",
      maximumIntervalDays: 4321,
    },
  });

  assert.equal(named.newCardsPerDay, 30);
  assert.equal(named.maximumReviewsPerDay, 300);
  assert.equal(named.schedulerProfile.maximumIntervalDays, 365);
  assert.equal(custom.newCardsPerDay, 37);
  assert.equal(custom.maximumReviewsPerDay, 730);
  assert.equal(custom.schedulerProfile.maximumIntervalDays, 4321);
});

test("global deck settings roundtrip through cloud-backed profile preferences", () => {
  const profile = { schedulerPreferences: { profile: "standard", keep: "value" } };
  const savedProfile = withGlobalDeckSettings(profile, {
    ...applyLearningPreset({}, "relaxed"),
    coreMode: "manual",
  });
  const restored = getGlobalDeckSettings(savedProfile);

  assert.equal(savedProfile.schedulerPreferences.keep, "value");
  assert.equal(restored.schedulerProfile.presetId, "relaxed");
  assert.equal(restored.newCardsPerDay, 10);
  assert.equal(restored.maximumReviewsPerDay, 100);
  assert.equal(restored.schedulerProfile.maximumIntervalDays, 2000);
  assert.equal(restored.learnAheadMinutes, 20);
  assert.equal(restored.coreMode, "manual");
});

test("global profile switches retain the automatically stored custom settings", () => {
  const standard = applyLearningPreset({}, "standard");
  const customSettings = markLearningSettingsCustom({
    ...standard,
    newCardsPerDay: 37,
    schedulerProfile: {
      ...standard.schedulerProfile,
      desiredRetention: 0.93,
    },
  });
  const customProfile = withGlobalDeckSettings({ schedulerPreferences: { profile: "standard" } }, customSettings);
  const relaxedProfile = withGlobalDeckSettings(customProfile, applyLearningPreset(customSettings, "relaxed"));

  assert.equal(getGlobalDeckSettings(relaxedProfile).schedulerProfile.presetId, "relaxed");
  assert.equal(getGlobalDeckSettings(relaxedProfile).newCardsPerDay, 10);
  assert.equal(getCustomGlobalDeckSettings(relaxedProfile).schedulerProfile.presetId, "custom");
  assert.equal(getCustomGlobalDeckSettings(relaxedProfile).newCardsPerDay, 37);
  assert.equal(getCustomGlobalDeckSettings(relaxedProfile).schedulerProfile.desiredRetention, 0.93);

  const restoredCustomProfile = withGlobalDeckSettings(relaxedProfile, getCustomGlobalDeckSettings(relaxedProfile));
  assert.equal(getGlobalDeckSettings(restoredCustomProfile).schedulerProfile.presetId, "custom");
  assert.equal(getGlobalDeckSettings(restoredCustomProfile).newCardsPerDay, 37);
  assert.equal(getGlobalDeckSettings(restoredCustomProfile).schedulerProfile.desiredRetention, 0.93);
});

test("applying learning settings preserves deck-only appearance and daily overrides", () => {
  const next = applyLearningSettingsToDeckSettings(
    {
      coreMode: "off",
      appearance: { iconKey: "brain", iconColor: "#123456" },
      newCardsTodayOverride: { date: "2026-07-10", limit: 4 },
      variantThresholdXp: 132.5,
      maxActiveVariantsPerCard: 3,
    },
    applyLearningPreset({}, "intensive"),
  );

  assert.deepEqual(next.appearance, { iconKey: "brain", iconColor: "#123456" });
  assert.deepEqual(next.newCardsTodayOverride, { date: "2026-07-10", limit: 4 });
  assert.equal(next.coreMode, "off");
  assert.equal(next.variantThresholdXp, 132.5);
  assert.equal(next.maxActiveVariantsPerCard, 3);
  assert.equal(next.newCardsPerDay, 30);
  assert.equal(next.maximumReviewsPerDay, 300);
  assert.equal(next.schedulerProfile.maximumIntervalDays, 365);
  assert.equal(next.learnAheadMinutes, 20);
});
