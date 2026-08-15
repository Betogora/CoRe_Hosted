import assert from "node:assert/strict";
import test from "node:test";
import { createManualCoreDeck } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { createDeckSettingsDraft, createGlobalSettingsDraft, normalizeDeckSettingsDraft, settingsDraftsEqual } from "./settingsDraft.ts";

test("global draft normalizes profile, learning-day, weekly rhythm, and sync values", () => {
  const profile = createCoreRepository(null, { seedDefaultDecks: false }).getState().profile;
  const preferences = getGlobalSchedulerPreferences(profile);
  const draft = createGlobalSettingsDraft(profile, {
    ...preferences,
    dayStartHour: 29,
    learnAheadMinutes: 999,
    easyDays: { ...preferences.easyDays, monday: "minimum" },
  });

  assert.equal(draft.dayStartHour, 23);
  assert.equal(draft.learnAheadMinutes, 720);
  assert.equal(draft.easyDays.monday, "minimum");
  assert.equal(draft.syncIntervalMinutes, profile.uiPreferences.syncIntervalMinutes);
});

test("deck draft compares and normalizes identity, appearance, learning, scheduler, and CoRe values", () => {
  const deck = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic", front: "Frage", back: "Antwort" } });
  const baseline = createDeckSettingsDraft(deck);
  const changed = {
    ...baseline,
    name: "  Neue   Biologie  ",
    appearance: { iconKey: "invalid", iconColor: "rot" },
    learning: {
      ...baseline.learning,
      newCardsPerDay: 42,
      schedulerProfile: { ...baseline.learning.schedulerProfile, presetId: "custom" as const, desiredRetention: 0.95 },
      coreMode: "manual" as const,
    },
  };

  assert.equal(settingsDraftsEqual(baseline, changed), false);
  const normalized = normalizeDeckSettingsDraft(changed);
  assert.equal(normalized.name, "Neue Biologie");
  assert.equal(normalized.learning.newCardsPerDay, 42);
  assert.equal(normalized.learning.schedulerProfile.desiredRetention, 0.95);
  assert.equal(normalized.learning.coreMode, "manual");
  assert.notEqual(normalized.appearance.iconKey, "invalid");
  assert.match(normalized.appearance.iconColor, /^#[0-9a-f]{6}$/);
  assert.equal(settingsDraftsEqual(baseline, baseline), true);
});
