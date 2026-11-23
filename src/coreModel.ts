export {
  DECK_ICON_KEYS,
  REVIEW_RATINGS,
  createDefaultDeckSettings,
  makeId,
  normalizeDeckAppearance,
  stableContentHash,
} from "./coreModel/coreValues.ts";
export {
  cardStudyFromReviewState,
  /** @internal */ createCardStudy,
  createReviewState,
  reviewStateFromCardStudy,
  updateVariantPerformance,
} from "./coreModel/reviewState.ts";
export {
  activeVariantRefusal,
  addCardVariant,
  createCardVariant,
  getActiveVariants,
  isCardReviewBlocked,
  recordVariantOutcome,
  replaceOutdatedVariants,
  rescheduleCard,
  resetCardStudy,
  restoreCardStudy,
  setCardLeech,
  VARIANT_FAILURE_LIMIT,
  /** @internal */ setCardSuspended,
} from "./coreModel/cards.ts";
export {
  applyCardStudyStatePatch,
  cardHasStudy,
  createBasicNote,
  createNote,
  duplicateNote,
  fieldSearchKey,
  noteTextIndex,
  outdateVariantsOfChangedSource,
  planImportedNoteUpdate,
  planNoteContentChange,
  planNoteDeletion,
  planNoteGraphContentChange,
  planNoteRestore,
  removeUnusedNoteMedia,
  /** @internal */ setNoteMarked,
} from "./coreModel/notes.ts";
export {
  noteContentMediaRefs,
  notePromptLabel,
  parseNoteContent,
} from "./coreModel/noteContent.ts";
export {
  addNoteField,
  /** @internal */ applyNoteEditorValue,
  canRemoveNoteField,
  isMovableNoteField,
  moveNoteField,
  noteBlocks,
  noteEditorValue,
  removeNoteField,
  renameNoteField,
  setNoteFieldRole,
  setNoteReverse,
  setNoteTypeIn,
  validateNoteEditorValue,
} from "./coreModel/noteEditor.ts";
export type { AddableFieldRole, NoteEditorErrors, NoteEditorValue } from "./coreModel/noteEditor.ts";
export {
  createManualNoteContent,
  validateManualNoteInput,
} from "./coreModel/creation.ts";
export type { ManualContentKind, ManualNoteErrors, ManualNoteInput } from "./coreModel/creation.ts";
export {
  addOcclusionMask,
  createOcclusionNoteContent,
  groupOcclusionMasks,
  moveOcclusionMasks,
  occlusionGroups,
  removeOcclusionMasks,
  setOcclusionMasksAlwaysOccluded,
  ungroupOcclusionMasks,
  updateOcclusionMaskShape,
  validateOcclusionInput,
} from "./coreModel/occlusion.ts";
export type { DrawnOcclusionShape, OcclusionMode } from "./coreModel/occlusion.ts";
export { planCardBatchEdit, planCardBatchUndo } from "./coreModel/batch.ts";
export type { CardBatchEdit } from "./coreModel/batch.ts";
export { planTextReplace, planTextReplaceUndo } from "./coreModel/replace.ts";
export type { TextReplace, TextReplacePreview } from "./coreModel/replace.ts";
export { createCoreDeck, normalizeCoreDeck } from "./coreModel/decks.ts";
export { normalizeTags, splitAnkiSystemTags, tagSearchKeys } from "./coreModel/tags.ts";
