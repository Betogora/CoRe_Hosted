import { getActiveVariants } from "../coreModel.ts";
import type { Card, CardVariant, DeckSettings } from "../coreTypes.ts";

type VariantSettings = Pick<DeckSettings, "coreMode" | "variantThresholdXp" | "maxActiveVariantsPerCard">;

/** Active rephrasings that may be asked: the oldest ones up to the deck's limit. */
function reviewableVariants(card: Card, settings: Pick<VariantSettings, "maxActiveVariantsPerCard">): CardVariant[] {
  return getActiveVariants(card)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, settings.maxActiveVariantsPerCard));
}

/** Whether a card is mature enough for rephrasings: review phase, no current failure and the deck's learning level reached. */
export function isCardReadyForVariants(card: Card, settings: VariantSettings): boolean {
  const { study } = card;
  return settings.coreMode === "on"
    && study.state === "review"
    && study.lastRating !== "again"
    && study.extra.maturityXp >= settings.variantThresholdXp;
}

/**
 * The variant asked instead of the card, or null for the card itself.
 * The card stays part of the rotation, so its own wording keeps coming back.
 */
export function selectReviewVariant(card: Card, settings: VariantSettings): CardVariant | null {
  if (!isCardReadyForVariants(card, settings)) return null;
  const variants = reviewableVariants(card, settings);
  if (!variants.length) return null;
  return [null, ...variants][card.study.reps % (variants.length + 1)];
}
