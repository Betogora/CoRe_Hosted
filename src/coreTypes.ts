export type CoreMode = "on" | "off";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type DeckSource = "manual" | "anki-apkg";
export type CardVariantType = "basic";
export type TransformType = "rephrase";
export type VariantQualityStatus = "draft" | "active" | "rejected" | "flagged" | "disabled";
export type MaturityBand = "new" | "learning" | "young" | "mature";
export type ReviewSchedulerState = "new" | "learning" | "review" | "relearning";
export type CardStatus = "active" | "suspended";
export type NewReviewOrder = "reviews-first" | "new-first" | "mixed";
export type NewCardSortOrder = "oldest-first" | "random";
export type ReviewCardSortOrder = "most-overdue" | "lowest-retrievability";
export type EasyDayLevel = "normal" | "reduced" | "minimum";
export interface EasyDays {
  monday: EasyDayLevel;
  tuesday: EasyDayLevel;
  wednesday: EasyDayLevel;
  thursday: EasyDayLevel;
  friday: EasyDayLevel;
  saturday: EasyDayLevel;
  sunday: EasyDayLevel;
}
export type SchedulerPreset = "standard" | "intensive" | "relaxed" | "custom";
export type RichTextContent = string;
export type MediaRef = string;

export interface MediaFileReference {
  sha1: string;
  size: number;
  mimeType: string;
  originalName: string;
  storagePath: string;
  createdAt: string;
}

export interface Profile {
  userId: string;
  email: string;
  displayName: string;
  timezone: string;
  onboardingComplete: boolean;
  schedulerPreferences: Record<string, unknown>;
  uiPreferences: UiPreferences;
}

export interface UiPreferences {
  dashboardCollapsedDeckIds: string[];
  learnCollapsedDeckIds: string[];
  syncIntervalMinutes: SyncIntervalMinutes;
  /** Names of the flags 1–7; an empty name stands for the color name. */
  flagNames: string[];
  savedSearches: SavedCardSearch[];
}

/** A named search expression; relative terms (`rated:1`, `is:due`) resolve whenever it is applied. */
export type SavedCardSearch = { id: string; name: string; query: string };

export type SyncIntervalMinutes = 0 | 1 | 5 | 15 | 30;

/** Append-only answer of one card; `rating: "manual"` records a manual reschedule. */
export interface ReviewEvent {
  id: string;
  userId: string;
  deckId: string;
  cardId: string;
  variantId: string | null;
  rating: ReviewRating | "manual";
  answeredAt: string;
  responseTimeMs: number | null;
  schedulerBefore: unknown;
  schedulerAfter: unknown;
  flags: Record<string, unknown>;
  createdAt: string;
  createdByDeviceId?: string | null;
}

export interface DeckAppearance {
  iconKey: string;
  iconColor: string;
}

export interface SchedulerProfile {
  settingsVersion: 2;
  presetId: SchedulerPreset;
  learningStepsMinutes: number[];
  relearningStepMinutes: number;
  desiredRetention: number;
  maximumIntervalDays: number;
}

export interface LearningSettings {
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  newCardSortOrder: NewCardSortOrder;
  reviewCardSortOrder: ReviewCardSortOrder;
  buryNewSiblings: boolean;
  buryReviewSiblings: boolean;
  buryInterdayLearningSiblings: boolean;
  schedulerProfile: SchedulerProfile;
}

export interface LearningProfileTemplate {
  id: string;
  name: string;
  contentVersion: number;
  settings: LearningSettings;
}

export interface LearningProfileSource {
  id: string;
  contentVersion: number;
}

export interface GlobalLearningDefaults extends LearningSettings {
  learningProfileSource: LearningProfileSource | null;
  /** Durability in days from which a card alternates with its variants. */
  variantThresholdDays: number;
  maxActiveVariantsPerCard: number;
}

export interface GlobalSchedulerPreferences {
  settingsVersion: 3;
  dayStartHour: number;
  learnAheadMinutes: number;
  leechThreshold: number;
  easyDays: EasyDays;
  learningProfiles: LearningProfileTemplate[];
  defaultLearningSettings: GlobalLearningDefaults;
  examPlanning: ExamPlanningSettings;
}

export interface ExamPlan {
  id: string;
  name: string;
  /** Optional zero-based index into the shared examination palette. */
  colorIndex?: number;
  color?: string;
  status: "active" | "paused" | "completed";
  /** Selected decks; a selected deck includes its subdecks unless the nearer mark is an exclusion. */
  deckIds: string[];
  /** Subdecks deselected below a selected deck; later subdecks of a selected deck join automatically. */
  excludedDeckIds?: string[];
  examDate: string;
  studyStartDate?: string;
  desiredRetention: number;
  variants: boolean;
  bufferDays: number;
  studyTime: { dailyMinutes: number; weekdays: boolean[]; weeklyMinutes?: number[]; dateOverrides: Array<{ date: string; minutes: number }> };
  topicOrder?: string[];
  readSummaryBeforeTopics?: boolean;
  completedSummaryDeckIds?: string[];
  topicDates?: Array<{ deckId: string; date: string }>;
  createdAt: string;
  updatedAt: string;
}

/** A block with an `examId` sets that exam's study time for the day; with null it is only a calendar note. */
export interface StudyTimeCapacity {
  timeBlocks?: Array<{ id: string; date: string; start: number; end: number; examId: string | null }>;
}

export interface ExamDailyTask {
  id: string;
  date: string;
  examId: string;
  kind: "study" | "summary";
  deckIds: string[];
  cardIds: string[];
  capturedAt: string;
  completed: "manual" | "automatic" | null;
  planningKey?: string;
}

export interface ExamPlanningSettings {
  version: 3;
  exams: ExamPlan[];
  capacity: StudyTimeCapacity;
  dailyTasks?: ExamDailyTask[];
}

export interface DeckSettings {
  coreMode: CoreMode;
  appearance: DeckAppearance;
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  newCardSortOrder: NewCardSortOrder;
  reviewCardSortOrder: ReviewCardSortOrder;
  buryNewSiblings: boolean;
  buryReviewSiblings: boolean;
  buryInterdayLearningSiblings: boolean;
  learningProfileSource: LearningProfileSource | null;
  newCardsTodayOverride: {
    date: string;
    limit: number;
  } | null;
  variantThresholdDays: number;
  maxActiveVariantsPerCard: number;
  schedulerProfile: SchedulerProfile;
}

export type NoteFieldRole = "prompt" | "answer" | "hint" | "extra" | "source" | "note";

export interface NoteField {
  id: string;
  name: string;
  role: NoteFieldRole;
  html: RichTextContent;
}

export interface NoteFieldRequirement {
  mode: "all" | "any";
  fieldIds: string[];
}

export interface RevealPrompt {
  key: string;
  name: string;
  instruction: string;
  questionFieldIds: string[];
  answerFieldIds: string[];
  requires: NoteFieldRequirement | null;
  typeInFieldId: string | null;
}

export interface ChoiceOption {
  id: string;
  html: RichTextContent;
  correct: boolean;
}

/**
 * Positions are relative to the image (x to its width, y to its height). Like Anki, rectangles, ellipses and labels
 * turn by `angle` degrees around their top-left corner in image pixels; polygons are not rotated.
 */
export type OcclusionShape =
  | { kind: "rect" | "ellipse"; left: number; top: number; width: number; height: number; angle: number }
  | { kind: "polygon"; points: Array<[number, number]> }
  /** `fontSize` is relative to the image height (Anki's `fs`); without it `scale` multiplies the card's body size. */
  | { kind: "text"; left: number; top: number; text: string; scale: number; fontSize: number | null; angle: number }
  /** Full-image mask images, e.g. from Image Occlusion Enhanced; the answer image replaces the question image after reveal. */
  | { kind: "overlay"; question: MediaRef; answer: MediaRef | null };

export interface OcclusionMask {
  id: string;
  /** Card group `io:<ordinal>`; 0 marks a mask without a card of its own, which only stays occluded. */
  ordinal: number;
  shape: OcclusionShape;
  alwaysOccluded: boolean;
}

export type NoteInteraction =
  | { kind: "reveal"; prompts: RevealPrompt[] }
  | { kind: "choice"; mode: "single" | "multiple" | "kprim"; options: ChoiceOption[] }
  | { kind: "cloze" }
  | { kind: "image-occlusion"; image: MediaRef; mode: "hide-all-guess-one" | "hide-one-guess-one"; masks: OcclusionMask[] };

export interface NoteSpeech {
  fieldId: string;
  language: string;
}

export interface NoteContent {
  schemaVersion: 1;
  fields: NoteField[];
  interaction: NoteInteraction;
  speech: NoteSpeech[];
  tags: string[];
}

export interface Note {
  id: string;
  userId?: string;
  content: NoteContent;
  /** Media file names used in the content mapped to their SHA-1; names are unique per note, not per account. */
  media: Record<string, string>;
  source: DeckSource;
  ankiGuid: string | null;
  noteTypeSourceId: string | null;
  translator: { id: string; version: number } | null;
  marked: boolean;
  contentRevision: number;
  /** contentRevision at the last APKG import; a higher contentRevision means local edits. Null for manual notes. */
  importedContentRevision: number | null;
  /** Tags of the last APKG import, the base of the three-way tag merge on reimport. Null for manual notes. */
  importedTags: string[] | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
}

export interface CardStudyExtra {
  schedulerVersion: string;
  /** FSRS-7 fast memory trace; 0 for new cards. */
  stabilityFast: number;
  desiredRetention: number;
  maturityBand: MaturityBand;
  /**
   * Durability in days (`getDurabilityDays`) after the last answer, for `prop:s`; null until a client that writes it
   * answers the card.
   */
  durabilityDays: number | null;
  intervalMinutes: number | null;
  learningSuccessCount: number;
  firstLearningAt: string | null;
  lastLearningStepAt: string | null;
  graduatedAt: string | null;
  isGraduated: boolean;
  learningDayKey: string | null;
  /** Variant chain stage the card reached (0 = the card itself); the next released contact asks the variant after it. */
  variantStage: number;
  sourceSchedulerData: unknown;
}

export interface CardStudyState {
  state: ReviewSchedulerState;
  dueAt: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  intervalDays: number;
  learningStepIndex: number;
  lastReviewedAt: string | null;
  lastRating: ReviewRating | null;
  /** When the card became a leech (Anki tag `leech`); null otherwise. Study state, so reviews set it atomically. */
  leechedAt: string | null;
  extra: CardStudyExtra;
}

export type ReviewState = Omit<CardStudyState, "extra"> & CardStudyExtra;

/**
 * Valid only while the note keeps `contentRevision`; `state` is null while rejected results in a row (`failures`)
 * stay below the limit.
 */
export interface CardVariantRefusal {
  state: "not_rephrasable" | "failing" | null;
  failures: number;
  promptVersion: string;
  contentRevision: number;
  updatedAt: string;
}

export interface Card {
  id: string;
  noteId: string;
  deckId: string;
  promptKey: string;
  ankiCardId: string | null;
  status: CardStatus;
  ankiFlag: number;
  study: CardStudyState;
  /** Counts applied study changes; separate from `revision` so reviews and card edits are no conflict for each other. */
  studyRevision: number;
  variants: CardVariant[];
  /** Absent until a generation for the card was refused or rejected. */
  variantRefusal?: CardVariantRefusal;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
}

/** Mark and tags belong to the content (all siblings), suspension and flag to the card. */
export interface CardStudyStatePatch {
  marked?: boolean;
  suspended?: boolean;
  flag?: number;
  tags?: string[];
}

export interface VariantPerformance {
  id: string;
  cardId: string;
  variantId: string;
  userId: string;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  averageResponseTimeMs: number | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VariantFeedbackType = "fachlich_falsch" | "unklar_formuliert";

export interface VariantFeedback {
  id: string;
  type: VariantFeedbackType;
  note: string;
  createdAt: string;
}

export interface CardVariant {
  id: string;
  cardId: string;
  variantType: CardVariantType;
  variantLevel: number;
  front: RichTextContent;
  back: RichTextContent;
  isActive: boolean;
  transformType: TransformType;
  qualityStatus: VariantQualityStatus;
  contentHash: string;
  performance: VariantPerformance;
  feedback: VariantFeedback[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  meta: Record<string, unknown>;
}

export type SyncStatus =
  | { status: "idle" }
  | { status: "pending"; message: string; pendingCount?: number }
  | { status: "offline"; message: string; pendingCount: number; nextRetryAt: string | null }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string; savedAt: string }
  | { status: "error"; message: string }
  | { status: "conflict"; message: string; conflictCount: number };

export interface Deck {
  id: string;
  ownerId: string;
  parentDeckId: string | null;
  name: string;
  description: string;
  source: DeckSource;
  /** Anki deck id of an imported deck, the reimport identity. */
  ankiDeckId: string | null;
  hierarchyPath: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  deckSettings: DeckSettings;
  cards: Card[];
  reviewEvents: ReviewEvent[];
  /** Transient study root only, never persisted: its cards are learned in the given order without daily limits. */
  plannedOrder?: true;
  /**
   * With `plannedOrder`: learns every card of the session, due or not, without sibling burying, in the order of
   * `cardIds` across its decks.
   */
  hitSession?: { cardIds: readonly string[] };
}

export interface ImportVerificationScope {
  deckIds: string[];
  noteTypeSourceIds: string[];
  noteIds: string[];
  cardIds: string[];
  reviewEventIds: string[];
}

export type ImportVerificationRepairScope = Partial<ImportVerificationScope>;
