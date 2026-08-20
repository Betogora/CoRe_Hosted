// Public core-model seam. Callers outside this directory must import from here.
export {
  CARD_VARIANT_TYPES,
  CORE_CARD_TYPES,
  CORE_DECK_SOURCES,
  DECK_ICON_KEYS,
  LEARNING_ITEM_SOURCE_TYPES,
  REVIEW_RATINGS,
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
  createReviewState,
  updateVariantPerformance,
} from "./coreModel/reviewState.ts";
export {
  createCardVariant,
  createCoreCard,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  isLearningItemMarked,
  isLearningItemReviewBlocked,
  normalizeLearningItem,
  rescheduleLearningItem,
  updateLearningItemStudyState,
} from "./coreModel/learningItems.ts";
export type { CoreCardInput } from "./coreModel/learningItems.ts";
export {
  getCardContentPayload,
  getCardEditorValue,
  projectCardPreviewDraft,
  saveCardEditorValue,
  validateCardEditorValue,
} from "./coreModel/cardEditor.ts";
export type { CardPreviewDraft, CardPreviewProjection } from "./coreModel/cardEditor.ts";
export {
  addRephrasedVariant,
  createBasicLearningItem,
  createLearningItemFromEditorValue,
  createLearningItemsFromEditorValue,
  createLearningItemsFromNormalizedInput,
  createManualCoreDeck,
  duplicateLearningItemContent,
} from "./coreModel/creation.ts";
export { createCoreDeck, normalizeCoreDeck } from "./coreModel/decks.ts";
export {
  applyLearningItemContent,
  createCoreNoteTypeDefinition,
  saveLearningItemDocumentValues,
} from "./coreModel/learningItemContent.ts";
export {
  createLearningItemDocumentFromLegacy,
} from "./coreModel/learningItemDocument.ts";
