import assert from "node:assert/strict";
import test from "node:test";
import { createCoreDeck } from "./coreModel.ts";
import { getGlobalSchedulerPreferences, markLearningSettingsCustom, withGlobalSchedulerPreferences } from "./deckSettings.ts";
import { applyGlobalLearningDefaultsToDeck, createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";

function customPreferences() {
  return withGlobalSchedulerPreferences({}, {
    defaultLearningSettings: {
      ...markLearningSettingsCustom({ newCardsPerDay: 48, maximumReviewsPerDay: 360 }),
      learningProfileSource: null,
      variantThresholdXp: 181,
      maxActiveVariantsPerCard: 3,
    },
  }).schedulerPreferences;
}

test("new deck settings use the complete global learning default", () => {
  const settings = createGlobalDefaultDeckSettings(customPreferences());

  assert.equal(settings.newCardsPerDay, 48);
  assert.equal(settings.maximumReviewsPerDay, 360);
  assert.equal(settings.variantThresholdXp, 181);
  assert.equal(settings.maxActiveVariantsPerCard, 3);
  assert.equal(settings.coreMode, "auto");
});

test("applying global defaults preserves deck identity, appearance, cards, history and core mode", () => {
  const deck = createCoreDeck({
    id: "deck-1",
    name: "Biologie",
    source: "manual",
    cards: [],
    reviewEvents: [{ id: "review-1" } as any],
    deckSettings: {
      ...createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences({})),
      coreMode: "manual",
      appearance: { iconKey: "brain", iconColor: "#123456" },
      newCardsTodayOverride: { date: "2026-08-28", limit: 5 },
    },
  });
  const applied = applyGlobalLearningDefaultsToDeck(deck, customPreferences(), "2026-08-28T12:00:00.000Z");

  assert.equal(applied.id, deck.id);
  assert.equal(applied.name, deck.name);
  assert.strictEqual(applied.cards, deck.cards);
  assert.strictEqual(applied.reviewEvents, deck.reviewEvents);
  assert.deepEqual(applied.deckSettings.appearance, deck.deckSettings.appearance);
  assert.equal(applied.deckSettings.coreMode, "manual");
  assert.equal(applied.deckSettings.newCardsPerDay, 48);
  assert.equal(applied.deckSettings.newCardsTodayOverride, null);
});
