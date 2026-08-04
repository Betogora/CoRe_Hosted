// Public core-model seam. Callers outside this directory must import from here.
export {
  CARD_VARIANT_TYPES,
  CORE_CARD_TYPES,
  CORE_DECK_SOURCES,
  CORE_MODES,
  DECK_ICON_KEYS,
  DEFAULT_DECK_APPEARANCE,
  LEARNING_ITEM_SOURCE_TYPES,
  MATURITY_BANDS,
  REVIEW_RATINGS,
  VARIANT_GENERATION_SOURCES,
  VARIANT_STATUSES,
  VARIANT_TRANSFORMS,
  createDefaultDeckSettings,
  getMaturityBand,
  makeId,
  normalizeDeckAppearance,
  normalizeTags,
  stableContentHash,
  unique,
} from "./coreModel/coreValues.ts";
export {
  createLearningItemState,
  createReviewState,
  createSourceAnchor,
  createSourceDocument,
  createVariantPerformance,
  createVariantReviewEvent,
  createVersionEntry,
  normalizeLearningItemState,
  updateVariantPerformance,
} from "./coreModel/reviewState.ts";
export type { SourceAnchorInput, SourceDocument } from "./coreModel/reviewState.ts";
export {
  createCardVariant,
  createCoreCard,
  createCoreLearningItem,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  getVariantAnchor,
  normalizeCardVariant,
  normalizeLearningItem,
} from "./coreModel/learningItems.ts";
export type { CoreCardInput } from "./coreModel/learningItems.ts";
export {
  CardEditorValidationError,
  assertValidCardEditorValue,
  getCardContentPayload,
  getCardEditorValue,
  parseClozeGroups,
  saveCardEditorValue,
  validateCardContentPayload,
  validateCardEditorValue,
} from "./coreModel/cardEditor.ts";
export {
  addRephrasedVariant,
  createBasicLearningItem,
  createBasicReverseLearningItem,
  createClozeLearningItem,
  createLearningItemFromCardContentPayload,
  createLearningItemFromEditorValue,
  createLearningItemsFromNormalizedInput,
  createManualCoreDeck,
  duplicateLearningItemContent,
  restoreCardVersion,
  updateCardContent,
} from "./coreModel/creation.ts";
export { createCoreDeck, normalizeCoreDeck } from "./coreModel/decks.ts";
