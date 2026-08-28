import assert from "node:assert/strict";
import test from "node:test";
import { createCoreDeck, createDefaultDeckSettings, createManualCoreDeck } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { applyDeckSettingsDraftChanges, createDeckSettingsDraft, createGeneralSettingsDraft, createGlobalCardSettingsDraft, normalizeDeckSettingsDraft, settingsDraftsEqual } from "./settingsDraft.ts";

test("general and global card drafts keep their settings domains separate", () => {
  const profile = createCoreRepository({ seedDefaultDecks: false }).getState().profile;
  const preferences = getGlobalSchedulerPreferences(profile);
  const generalDraft = createGeneralSettingsDraft(profile);
  const cardDraft = createGlobalCardSettingsDraft({
    ...preferences,
    dayStartHour: 29,
    learnAheadMinutes: 999,
    easyDays: { ...preferences.easyDays, monday: "minimum" },
  });

  assert.equal(generalDraft.displayName, profile.displayName);
  assert.equal(generalDraft.syncIntervalMinutes, profile.uiPreferences.syncIntervalMinutes);
  assert.equal(cardDraft.dayStartHour, 23);
  assert.equal(cardDraft.learnAheadMinutes, 720);
  assert.equal(cardDraft.easyDays.monday, "minimum");
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

test("deck-tree save applies only changed settings and keeps descendant identity and individual values", () => {
  const parent = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic", front: "Frage", back: "Antwort" } });
  const child = createCoreDeck({
    name: "Zellen",
    source: "manual",
    cards: [],
    deckSettings: createDefaultDeckSettings({
      appearance: { iconKey: "flask", iconColor: "#123456" },
      newCardsPerDay: 7,
      maximumReviewsPerDay: 80,
      schedulerProfile: { desiredRetention: 0.82 },
    }),
  });
  const baseline = createDeckSettingsDraft(parent);
  const changed = normalizeDeckSettingsDraft({
    ...baseline,
    name: "Neue Biologie",
    appearance: { ...baseline.appearance, iconColor: "#abcdef" },
    learning: {
      ...baseline.learning,
      newCardsPerDay: 42,
      schedulerProfile: { ...baseline.learning.schedulerProfile, presetId: "custom", desiredRetention: 0.94 },
    },
  });

  const propagated = applyDeckSettingsDraftChanges(baseline, changed, createDeckSettingsDraft(child));

  assert.equal(propagated.name, "Zellen");
  assert.equal(propagated.appearance.iconKey, "flask");
  assert.equal(propagated.appearance.iconColor, "#abcdef");
  assert.equal(propagated.learning.newCardsPerDay, 42);
  assert.equal(propagated.learning.maximumReviewsPerDay, 80);
  assert.equal(propagated.learning.schedulerProfile.desiredRetention, 0.94);
});
