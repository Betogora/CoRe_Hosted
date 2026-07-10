import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLearningPreset,
  applyLearningSettingsToDeckSettings,
  getGlobalDeckSettings,
  markLearningSettingsCustom,
  normalizeLearningSettings,
  withGlobalDeckSettings,
} from "./deckSettings.js";

test("learning settings migrate the previously unused legacy step defaults", () => {
  const settings = normalizeLearningSettings({
    newCardsPerDay: 12,
    schedulerProfile: {
      name: "standard",
      learningStepsMinutes: [10, 60],
    },
  });

  assert.equal(settings.newCardsPerDay, 12);
  assert.equal(settings.maximumReviewsPerDay, 200);
  assert.deepEqual(settings.schedulerProfile.learningStepsMinutes, [5, 15]);
  assert.equal(settings.schedulerProfile.settingsVersion, 2);
  assert.equal(settings.schedulerProfile.desiredRetention, 0.9);
});

test("learning presets stay shallow for the UI and become custom after edits", () => {
  const intensive = applyLearningPreset({}, "intensive");
  const custom = markLearningSettingsCustom({
    ...intensive,
    maximumReviewsPerDay: 90,
  });

  assert.equal(intensive.schedulerProfile.presetId, "intensive");
  assert.equal(intensive.schedulerProfile.desiredRetention, 0.94);
  assert.equal(custom.schedulerProfile.presetId, "custom");
  assert.equal(custom.maximumReviewsPerDay, 90);
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
  assert.equal(restored.coreMode, "manual");
});

test("applying learning settings preserves deck-only appearance and daily overrides", () => {
  const next = applyLearningSettingsToDeckSettings(
    {
      coreMode: "off",
      appearance: { iconKey: "brain", iconColor: "#123456" },
      newCardsTodayOverride: { date: "2026-07-10", limit: 4 },
    },
    applyLearningPreset({}, "intensive"),
  );

  assert.deepEqual(next.appearance, { iconKey: "brain", iconColor: "#123456" });
  assert.deepEqual(next.newCardsTodayOverride, { date: "2026-07-10", limit: 4 });
  assert.equal(next.coreMode, "off");
  assert.equal(next.newCardsPerDay, 15);
});
