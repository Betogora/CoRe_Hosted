/** Content Repetition per deck: "on" shows mature cards' AI rephrasings in review, "off" never does. */
export type CoreMode = "on" | "off";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type DeckSource = "manual" | "anki-apkg";
export type CardVariantType = "basic";
export type TransformType = "rephrase";
export type VariantQualityStatus = "draft" | "active" | "rejected" | "flagged" | "disabled";
/** Derived from the FSRS memory state: mature from 21 days of durability (days until recall falls to 90 %). */
export type MaturityBand = "new" | "learning" | "young" | "mature";
export type ReviewSchedulerState = "new" | "learning" | "review" | "relearning";
export type CardStatus = "active" | "suspended";
/** What a deck does when a card becomes a leech: only mark it, or also suspend it. */
export type LeechAction = "tag" | "suspend";
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

/** One private media file per account and SHA-1 (`media_files`). */
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
  deckManagerExpandedDeckIds: string[];
  syncIntervalMinutes: SyncIntervalMinutes;
  /** Own names of the flags 1–7; an empty name stands for the color name. */
  flagNames: string[];
}

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
  /** Anki's sibling burying: after a sibling was shown or answered, cards of this kind wait until the next learning day. */
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
  easyDays: EasyDays;
  learningProfiles: LearningProfileTemplate[];
  defaultLearningSettings: GlobalLearningDefaults;
  examPlanning: ExamPlanningSettings;
}

/** One exam, with its own relative study-time weights (ADR-042). */
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
  desiredRetention: number;
  variants: boolean;
  bufferDays: number;
  studyTime: { dailyMinutes: number; weekdays: boolean[]; weeklyMinutes?: number[]; dateOverrides: Array<{ date: string; minutes: number }> };
  topicOrder?: string[];
  readSummaryBeforeTopics?: boolean;
  completedSummaryDeckIds?: string[];
  /** Earliest introduction of a topic; repetitions continue to follow the scheduler. */
  topicDates?: Array<{ deckId: string; date: string }>;
  createdAt: string;
  updatedAt: string;
}

/** Calendar blocks: a block with an exam sets that exam's study time for the day; one without is only a note. */
export interface StudyTimeCapacity {
  timeBlocks?: Array<{ id: string; date: string; start: number; end: number; examId: string | null }>;
}

/** A single learning day's checklist; target cards survive forecast recalculation. */
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
  /** Lapses that make a card a leech; it is detected again every half threshold (Anki). */
  leechThreshold: number;
  leechAction: LeechAction;
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
  intervalMinutes: number | null;
  learningSuccessCount: number;
  firstLearningAt: string | null;
  lastLearningStepAt: string | null;
  graduatedAt: string | null;
  isGraduated: boolean;
  learningDayKey: string | null;
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

/** Flat scheduler view of a card's study state; `reviewStateFromCardStudy` and `cardStudyFromReviewState` convert. */
export type ReviewState = Omit<CardStudyState, "extra"> & CardStudyExtra;

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
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
}

/** Instant card actions: mark and tags belong to the content (all siblings), suspension and flag to the card. */
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

/** A deck with its loaded cards; contents (`Note`) are loaded separately because siblings may live in other decks. */
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
}

export interface ImportVerificationScope {
  deckIds: string[];
  noteTypeSourceIds: string[];
  noteIds: string[];
  cardIds: string[];
  reviewEventIds: string[];
}

export type ImportVerificationRepairScope = Partial<ImportVerificationScope>;
