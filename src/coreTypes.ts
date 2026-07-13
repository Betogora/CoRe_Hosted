export type CoreMode = "off" | "auto" | "manual";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type CardType =
  | "basic"
  | "basic-reversed"
  | "cloze"
  | "image-occlusion"
  | "multiple-choice"
  | "free-text"
  | "multi-field"
  | "case-vignette";
export type DeckSource =
  | "anki-apkg"
  | "manual"
  | "ai-assisted"
  | "community"
  | "text-import"
  | "csv-import"
  | "json-import"
  | "spreadsheet-import";
export type LearningItemSourceType =
  | "manual"
  | "text_import"
  | "csv_import"
  | "json_import"
  | "anki_import"
  | "ai_generated"
  | "mixed";
export type DeckVisibility = "private" | "community" | "unlisted" | "public";
export type CardVariantType =
  | "basic"
  | "reverse"
  | "cloze"
  | "mcq"
  | "transfer"
  | "case"
  | "image_occlusion"
  | "custom";
export type VariantGenerationSource = "original" | "ai_generated" | "user_edited" | "imported";
export type ReviewableType = "learning_item" | "card" | "variant" | "card_family";
export type TransformType = "original" | "rephrase" | "front_back_style_shift" | "cloze_conversion";
export type VariantQualityStatus = "draft" | "active" | "rejected" | "flagged" | "disabled";
export type MaturityBand = "new" | "learning" | "young" | "mature" | "variant_ready" | "mastered";
export type ReviewSchedulerState = "new" | "learning" | "review" | "relearning";
export type LearningItemStatus = "active" | "suspended" | "deleted";
export type DraftStatus = "draft" | "accepted";
export type NewReviewOrder = "reviews-first" | "new-first" | "mixed";
export type SchedulerPreset = "standard" | "intensive" | "relaxed" | "custom";
export type RichTextContent = string;
export type MediaRef = string;

export interface PrivacySettings {
  shareLearningProgress: boolean;
  showOnlineStatus: boolean;
  showStreaksToOthers: boolean;
}

export interface Profile {
  userId: string;
  email: string;
  displayName: string;
  university: string;
  fieldOfStudy: string;
  preferredLanguage: string;
  timezone: string;
  onboardingComplete: boolean;
  privacy: PrivacySettings;
  schedulerPreferences: Record<string, unknown>;
}

export interface SourceDocument {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  text: string;
  storageUrl: string;
  textExtractionStatus: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
}

export interface ReviewEvent {
  id: string;
  userId: string;
  deckId: string;
  learningItemId: string;
  variantId: string | null;
  reviewableType: ReviewableType;
  reviewableId: string;
  sourceCardId: string;
  rating: ReviewRating;
  answeredAt: string;
  responseTimeMs: number | null;
  schedulerBefore: unknown;
  schedulerAfter: unknown;
  flags: Record<string, unknown>;
  createdAt: string;
  createdByDeviceId?: string | null;
}

export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AiJob {
  id: string;
  jobType: string;
  status: AiJobStatus;
  userId: string;
  deckId: string | null;
  inputRef: Record<string, unknown>;
  policy: Record<string, unknown>;
  resultRef: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
}

export interface CloudTombstone {
  entityTable: "decks" | "cards" | "card_variants" | "source_documents" | "ai_jobs";
  entityId: string;
  revision: number;
  deletedAt: string;
  updatedByDeviceId: string | null;
}

export interface DeckAppearance {
  iconKey: string;
  iconColor: string;
}

export interface SchedulerProfile {
  settingsVersion: 2;
  presetId: SchedulerPreset;
  name: SchedulerPreset;
  learningStepsMinutes: number[];
  relearningStepMinutes: number;
  graduatingIntervalDays: number;
  easyGraduatingIntervalDays: number;
  easyIntervalDays: number;
  desiredRetention: number;
  maximumIntervalDays: number;
  lessShortIntervalBias: boolean;
}

export interface AIPolicy {
  costTier: "low" | "balanced" | "quality";
  allowLocalModels: boolean;
  allowExternalModels: boolean;
  maxCostPerJob: number;
  requireSourceAnchors: boolean;
  requireHumanApprovalForNewCards: boolean;
}

export interface VariantBlacklist {
  cardTypes: CardType[];
  tags: string[];
  transforms: TransformType[];
  cardIds: string[];
  variantIds: string[];
}

export interface DeckSettings {
  coreMode: CoreMode;
  appearance: DeckAppearance;
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  newCardsTodayOverride: {
    date: string;
    limit: number;
  } | null;
  variantThresholdXp: number;
  maxActiveVariantsPerCard: number;
  schedulerProfile: SchedulerProfile;
  aiPolicy: AIPolicy;
  blacklist: VariantBlacklist;
}

export interface ReviewStateBase {
  id: string;
  learningItemId: string;
  reviewableType: ReviewableType;
  reviewableId: string;
  userId: string;
  schedulerVersion: string;
  dueAt: string;
  intervalDays: number;
  ease: number;
  difficulty: number;
  stability: number;
  desiredRetention: number;
  retrievability: number | null;
  reps: number;
  repetitions: number;
  lapses: number;
  maturityXp: number;
  maturityBand: MaturityBand;
  lastReviewedAt: string | null;
  lastRating: ReviewRating | null;
  preferredVariantLevel: number;
  forcedVariantId: string | null;
  fallbackUntilCorrect: boolean;
  lastFailedVariantId: string | null;
  previousSuccessfulVariantId: string | null;
  intervalMinutes: number | null;
  learningStepIndex: number;
  learningSuccessCount: number;
  firstLearningAt: string | null;
  lastLearningStepAt: string | null;
  graduatedAt: string | null;
  isGraduated: boolean;
  sameDaySuccessCount: number;
  learningDayKey: string | null;
  schedulerParamsJson: unknown;
  sourceSchedulerData: unknown;
}

export type ReviewState =
  | (ReviewStateBase & { state: "new" })
  | (ReviewStateBase & { state: "learning" })
  | (ReviewStateBase & { state: "review" })
  | (ReviewStateBase & { state: "relearning" });

export interface CardField {
  name: string;
  value: RichTextContent;
}

export interface ImmutableOriginal {
  front: RichTextContent;
  back: RichTextContent;
  fields: CardField[];
  html: RichTextContent;
  capturedAt: string;
  source: DeckSource;
  contentHash: string;
}

export interface PdfBoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SourceAnchor {
  id: string;
  documentId: string | null;
  documentName: string;
  cardId: string | null;
  variantId: string | null;
  pageNumber: number | null;
  textQuote: string;
  charStart: number | null;
  charEnd: number | null;
  bbox: PdfBoundingBox | null;
  confidence: number | null;
  targetField: string;
  createdAt: string;
}

export interface VersionEntry {
  id: string;
  objectType: string;
  objectId: string;
  changeType: string;
  before: unknown;
  after: unknown;
  actorId: string;
  reason: string;
  createdAt: string;
}

export interface VariantPerformance {
  id: string;
  learningItemId: string;
  variantId: string;
  userId: string;
  attempts: number;
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  ratingCounts: Record<ReviewRating, number>;
  avgResponseTimeMs: number | null;
  averageResponseTimeMs: number | null;
  lastReviewedAt: string | null;
  lastRating: ReviewRating | null;
  localDifficultyEstimate: "easy" | "medium" | "hard" | null;
  masterySignal: "strong" | "steady" | "weak" | "failed" | null;
  maturityXp: number;
  createdAt: string;
  updatedAt: string;
}

export interface VariantFeedback {
  id: string;
  type: string;
  note: string;
  createdAt: string;
}

export interface CardVariantBase {
  id: string;
  learningItemId: string;
  cardId: string;
  sourceCardId: string;
  variantType: CardVariantType;
  variantLevel: number;
  front: RichTextContent;
  back: RichTextContent;
  explanation: string;
  hintsJson: unknown;
  answerOptionsJson: unknown;
  expectedAnswerJson: unknown;
  generationSource: VariantGenerationSource;
  isActive: boolean;
  transformType: TransformType;
  transformProfile: Record<string, unknown>;
  modelRunId: string | null;
  confidence: number;
  semanticDelta: string;
  changedRecognitionCues: string[];
  qualityStatus: VariantQualityStatus;
  contentHash: string;
  sourceAnchors: SourceAnchor[];
  reviewState: ReviewState | null;
  performance: VariantPerformance;
  feedback: VariantFeedback[];
  versionLog: VersionEntry[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  meta: Record<string, unknown>;
}

export interface OriginalCardVariant extends CardVariantBase {
  isOriginal: true;
  parentVariantId: null;
  anchorVariantId: null;
}

export interface DerivedCardVariant extends CardVariantBase {
  isOriginal: false;
  parentVariantId: string;
  anchorVariantId: string;
}

export type CardVariant = OriginalCardVariant | DerivedCardVariant;

export interface LearningItemCreationBase {
  deckId: string;
  tags?: string[];
  sourceAnchors?: SourceAnchor[];
  mediaRefs?: MediaRef[];
}

export interface BasicLearningItemCreationInput extends LearningItemCreationBase {
  cardType: "basic";
  front: RichTextContent;
  back: RichTextContent;
}

export interface ReverseLearningItemCreationInput extends LearningItemCreationBase {
  cardType: "basic-reversed";
  front: RichTextContent;
  back: RichTextContent;
}

export interface ClozeLearningItemCreationInput extends LearningItemCreationBase {
  cardType: "cloze";
  textWithClozes: RichTextContent;
  extra?: RichTextContent;
}

export interface MultipleChoiceLearningItemCreationInput extends LearningItemCreationBase {
  cardType: "multiple-choice";
  front: RichTextContent;
  back: RichTextContent;
  answerOptions: string[];
  correctAnswer: string;
}

export type LearningItemCreationInput =
  | BasicLearningItemCreationInput
  | ReverseLearningItemCreationInput
  | ClozeLearningItemCreationInput
  | MultipleChoiceLearningItemCreationInput;

export type SyncStatus =
  | { status: "idle" }
  | { status: "pending"; message: string; pendingCount?: number }
  | { status: "offline"; message: string; pendingCount: number; nextRetryAt: string | null }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string; savedAt: string }
  | { status: "error"; message: string }
  | { status: "conflict"; message: string; conflictCount: number };

export interface CoreState {
  isCoreReady: boolean;
  variantCount: number;
  lastReviewedAt: string | null;
  repetitionLevel: number;
  maturityXp: number;
  maturityBand: MaturityBand;
  eligibility: unknown;
}

export interface LearningItem {
  id: string;
  noteId: string | null;
  deckId: string;
  title: string;
  canonicalQuestion: RichTextContent;
  canonicalAnswer: RichTextContent;
  tags: string[];
  concepts: string[];
  sourceType: LearningItemSourceType;
  sourceRefId: string | null;
  source: DeckSource;
  sourceCardId: string | null;
  sourceNoteId: string | null;
  originalFront: RichTextContent;
  originalBack: RichTextContent;
  originalFields: CardField[];
  originalTags: string[];
  originalHtml: RichTextContent;
  immutableOriginal: ImmutableOriginal;
  mediaRefs: MediaRef[];
  sourceAnchors: SourceAnchor[];
  kind: CardType;
  cardType: CardType;
  draftStatus: DraftStatus;
  status: LearningItemStatus;
  contentHash: string;
  learningItemState: ReviewState;
  reviewState: ReviewState;
  variants: CardVariant[];
  versionLog: VersionEntry[];
  coreState: CoreState;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  meta: Record<string, unknown>;
}

export interface Deck {
  id: string;
  ownerId: string;
  parentDeckId: string | null;
  name: string;
  description: string;
  source: DeckSource;
  originalDeckId: string | null;
  visibility: DeckVisibility;
  hierarchyPath: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  cardCount: number;
  tags: string[];
  importMeta: Record<string, unknown>;
  deckSettings: DeckSettings;
  sourceDocuments: SourceDocument[];
  cards: LearningItem[];
  reviewEvents: ReviewEvent[];
  aiJobs: AiJob[];
  graph: unknown;
  communityRefs: unknown[];
  versionLog: VersionEntry[];
}

export interface AppState {
  version: 2;
  profile: Profile;
  decks: Deck[];
  communities: unknown[];
  aiJobs: AiJob[];
  documents: SourceDocument[];
  cloudTombstones: CloudTombstone[];
  chatTranscript: unknown[];
  learningPlans: unknown[];
  updatedAt: string;
}
