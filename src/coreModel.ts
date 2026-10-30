// Public core-model seam. Callers outside this directory must import from here.
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
  createCardStudy,
  createReviewState,
  reviewStateFromCardStudy,
  updateVariantPerformance,
} from "./coreModel/reviewState.ts";
export {
  addCardVariant,
  createCardVariant,
  getActiveVariants,
  isCardReviewBlocked,
  replaceOutdatedVariants,
  rescheduleCard,
  setCardSuspended,
} from "./coreModel/cards.ts";
export {
  applyCardStudyStatePatch,
  createBasicNote,
  createNote,
  duplicateNote,
  noteTextIndex,
  planNoteContentChange,
  planNoteDeletion,
  planNoteRestore,
  setNoteMarked,
} from "./coreModel/notes.ts";
export {
  notePromptLabel,
  parseNoteContent,
} from "./coreModel/noteContent.ts";
export {
  addNoteField,
  applyNoteEditorValue,
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
export { createCoreDeck, normalizeCoreDeck } from "./coreModel/decks.ts";
export { mergeImportedTags, normalizeTags, tagSearchKeys } from "./coreModel/tags.ts";
