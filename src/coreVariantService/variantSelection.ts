import { getActiveVariants } from "../coreModel.ts";
import type { Card, CardVariant, DeckSettings, ReviewRating } from "../coreTypes.ts";
import { getDurabilityDays } from "../scheduler.ts";

type VariantSettings = Pick<DeckSettings, "coreMode" | "variantThresholdDays" | "maxActiveVariantsPerCard">;

/** Days since the last saved answer before a variant may replace the card, so the wording just seen has faded. */
const VARIANT_MIN_GAP_DAYS = 3;
const DAY_MS = 86_400_000;

/** The reached chain stage; cards stored on the device before the chain existed have none and count as stage 0. */
export function reachedVariantStage(card: Card): number {
  return Math.max(0, Math.round(Number(card.study.extra.variantStage) || 0));
}

export function chainVariants(card: Card, settings: Pick<VariantSettings, "maxActiveVariantsPerCard">): CardVariant[] {
  return getActiveVariants(card)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, settings.maxActiveVariantsPerCard));
}

export function isCardReadyForVariants(card: Card, settings: VariantSettings): boolean {
  const { study } = card;
  return settings.coreMode === "on"
    && study.state === "review"
    && study.lastRating !== "again"
    && getDurabilityDays({ state: study.state, stability: study.stability, stabilityFast: study.extra.stabilityFast, difficulty: study.difficulty }) >= settings.variantThresholdDays;
}

export function nextChainVariant(card: Card, settings: Pick<VariantSettings, "maxActiveVariantsPerCard">): CardVariant | null {
  const variants = chainVariants(card, settings);
  return variants[reachedVariantStage(card)] ?? variants.reduce<CardVariant | null>((longestUnseen, variant) => !longestUnseen
    || (variant.performance.lastReviewedAt ?? "") < (longestUnseen.performance.lastReviewedAt ?? "") ? variant : longestUnseen, null);
}

/** null asks the card itself. */
export function selectReviewVariant(card: Card, settings: VariantSettings, now: string | number | Date): CardVariant | null {
  const lastAnswer = card.study.lastReviewedAt;
  if (!isCardReadyForVariants(card, settings) || !lastAnswer || new Date(now).getTime() - Date.parse(lastAnswer) < VARIANT_MIN_GAP_DAYS * DAY_MS) return null;
  return nextChainVariant(card, settings);
}

export function nextVariantStage(card: Card, variant: CardVariant | null, rating: ReviewRating, settings: Pick<VariantSettings, "maxActiveVariantsPerCard">): number {
  const stage = reachedVariantStage(card);
  if (!variant || rating === "hard") return stage;
  if (rating === "again") return Math.max(0, stage - 1);
  return Math.max(stage, chainVariants(card, settings).findIndex((candidate) => candidate.id === variant.id) + 1);
}
