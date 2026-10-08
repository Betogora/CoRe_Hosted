// Public core-model seam. Callers outside this directory must import from here.
export {
  CARD_VARIANT_TYPES,
  CORE_DECK_SOURCES,
  DECK_ICON_KEYS,
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
  rescheduleCard,
  setCardSuspended,
} from "./coreModel/cards.ts";
export {
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
  noteContentMediaRefs,
  parseNoteContent,
} from "./coreModel/noteContent.ts";
export {
  applyNoteEditorValue,
  noteEditorValue,
  validateNoteEditorValue,
} from "./coreModel/noteEditor.ts";
export type { NoteEditorErrors, NoteEditorValue } from "./coreModel/noteEditor.ts";
export {
  createManualNoteContent,
  validateManualNoteInput,
} from "./coreModel/creation.ts";
export type { ManualContentKind, ManualNoteErrors, ManualNoteInput } from "./coreModel/creation.ts";
export { createCoreDeck, normalizeCoreDeck } from "./coreModel/decks.ts";
