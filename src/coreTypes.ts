export type CoreMode = "off" | "auto" | "manual";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type CardType =
  | "basic"
  | "basic-with-images"
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
  | "mixed";
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
export interface LearningItemStudyStatePatch {
  marked?: boolean;
  suspended?: boolean;
}
export type DraftStatus = "draft" | "accepted";
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

export interface MediaAssetReference {
  id: string;
  userId: string;
  deckId: string;
  cardId: string | null;
  sha1: string;
  size: number;
  mimeType: string;
  originalName: string;
  storageBucket: string;
  storagePath: string;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
}

export type SyncIntervalMinutes = 0 | 1 | 5 | 15 | 30;

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

export interface CloudTombstone {
  entityTable: "decks" | "cards" | "card_variants" | "source_documents" | "note_type_definitions";
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

export interface GlobalSchedulerPreferences {
  settingsVersion: 2;
  dayStartHour: number;
  learnAheadMinutes: number;
  easyDays: EasyDays;
  learningProfiles: LearningProfileTemplate[];
}

export interface VariantBlacklist {
  cardTypes: CardType[];
  tags: string[];
  transforms: TransformType[];
  cardIds: string[];
}

export interface DeckSettings {
  coreMode: CoreMode;
  appearance: DeckAppearance;
  newCardsPerDay: number;
  maximumReviewsPerDay: number;
  newReviewOrder: NewReviewOrder;
  newCardSortOrder: NewCardSortOrder;
  reviewCardSortOrder: ReviewCardSortOrder;
  learningProfileSource: LearningProfileSource | null;
  newCardsTodayOverride: {
    date: string;
    limit: number;
  } | null;
  variantThresholdXp: number;
  maxActiveVariantsPerCard: number;
  schedulerProfile: SchedulerProfile;
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

export type FieldPlacement = "front" | "back" | "both" | "metadata";
export type FieldSemanticRole = "prompt" | "answer" | "hint" | "explanation" | "source" | "unclassified";

export interface LearningItemDocumentFieldV1 {
  id: string;
  sourceFieldId: string | null;
  name: string;
  value: RichTextContent;
  placement: FieldPlacement;
  semanticRole: FieldSemanticRole;
}

export interface LearningItemDocumentV1 {
  schemaVersion: 1;
  definitionVersionId: string;
  fields: LearningItemDocumentFieldV1[];
  tags: string[];
  mediaRefs: MediaRef[];
  interaction?: {
    choice?: { options: string[]; correctAnswer: string; explanation: RichTextContent };
  };
}

export type TemplateConditionAst =
  | { kind: "always" }
  | { kind: "field"; fieldId: string; present: boolean }
  | { kind: "all" | "any"; conditions: TemplateConditionAst[] };

export type SafeTemplateAstNode =
  | { kind: "text"; value: string }
  | { kind: "field"; fieldId: string; sourceName: string; filters: string[] }
  | { kind: "front-side" }
  | { kind: "conditional"; fieldId: string; sourceName: string; inverted: boolean; children: SafeTemplateAstNode[] };

export interface SafeTemplateAst {
  schemaVersion: 1;
  source: string;
  nodes: SafeTemplateAstNode[];
}

export interface FieldDefinition {
  id: string;
  sourceFieldId: string | null;
  name: string;
  ordinal: number;
  rtl: boolean;
  sticky: boolean;
  fontName: string | null;
  fontSize: number | null;
  description: string;
  plainText: boolean;
  collapsed: boolean;
  excludeFromSearch: boolean;
  preventDeletion: boolean;
  sourceConfigBase64: string | null;
  sourceConfig: Record<string, unknown>;
}

export interface ReviewRecipe {
  id: string;
  sourceTemplateId: string | null;
  name: string;
  ordinal: number;
  generationRule: TemplateConditionAst;
  front: SafeTemplateAst;
  back: SafeTemplateAst;
  browserFront: SafeTemplateAst | null;
  browserBack: SafeTemplateAst | null;
  targetDeckId: string | null;
  interaction: "reveal" | "cloze" | "choice" | "image-occlusion";
  sourceConfigBase64: string | null;
  sourceConfig: Record<string, unknown>;
}

export interface AnkiDefinitionSnapshot {
  sourceFormat: "legacy" | "latest";
  sourceNotetypeId: string;
  sourceName: string;
  rawConfigBase64: string | null;
  decodedConfig: Record<string, unknown>;
  unknownData: Record<string, unknown>;
}

export interface NoteTypeDefinitionV1 {
  id: string;
  revision: number;
  semanticHash: string;
  origin: "core" | "anki";
  kind: "normal" | "cloze" | "image-occlusion";
  name: string;
  fields: FieldDefinition[];
  recipes: ReviewRecipe[];
  css: string;
  latexConfig: Record<string, unknown> | null;
  sourceDefinitionSnapshot: AnkiDefinitionSnapshot | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type VariantProjection =
  | { kind: "template"; recipeId: string; instanceKey: string }
  | { kind: "cloze"; recipeId: string; clozeOrdinal: number }
  | { kind: "image-occlusion"; recipeId: string; regionKey: string };

export interface ForeignNoteSnapshot {
  id: string;
  schemaVersion: 1;
  sourceKind: "anki-apkg" | "csv";
  importFingerprint: string;
  previousSnapshotId: string | null;
  definitionVersionId: string | null;
  sourcePayload: Record<string, unknown>;
  createdAt: string;
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

export type VariantFeedbackType = "fachlich_falsch" | "unklar_formuliert";

export interface VariantFeedback {
  id: string;
  type: VariantFeedbackType;
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
  projection: VariantProjection;
  studyDeckId: string | null;
  schedulingMode: "independent-card" | "adaptive-presentation";
  renderRevision: number;
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

export interface BasicWithImagesLearningItemCreationInput extends LearningItemCreationBase {
  cardType: "basic-with-images";
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
  | BasicWithImagesLearningItemCreationInput
  | ReverseLearningItemCreationInput
  | ClozeLearningItemCreationInput
  | MultipleChoiceLearningItemCreationInput;

export type EditableCardType = "basic" | "basic-with-images" | "basic-reversed" | "cloze" | "multiple-choice";

export interface CardEditorValueBase {
  tags: string[];
}

export interface BasicCardEditorValue extends CardEditorValueBase {
  cardType: "basic";
  front: RichTextContent;
  back: RichTextContent;
}

export interface BasicWithImagesCardEditorValue extends CardEditorValueBase {
  cardType: "basic-with-images";
  front: RichTextContent;
  back: RichTextContent;
}

export interface ReverseCardEditorValue extends CardEditorValueBase {
  cardType: "basic-reversed";
  front: RichTextContent;
  back: RichTextContent;
}

export interface ClozeCardEditorValue extends CardEditorValueBase {
  cardType: "cloze";
  textWithClozes: RichTextContent;
  extra: RichTextContent;
}

export interface MultipleChoiceCardEditorValue extends CardEditorValueBase {
  cardType: "multiple-choice";
  question: RichTextContent;
  options: string[];
  correctOptionIndex: number;
  explanation: RichTextContent;
}

export type CardEditorValue =
  | BasicCardEditorValue
  | BasicWithImagesCardEditorValue
  | ReverseCardEditorValue
  | ClozeCardEditorValue
  | MultipleChoiceCardEditorValue;

export interface CardContentPayload {
  editorValue: CardEditorValue;
  mediaRefs: MediaRef[];
}

export type CardContentPayloadValidationResult =
  | { ok: true; value: CardContentPayload; error: null }
  | { ok: false; value: null; error: string };

export type CardEditorField =
  | "front"
  | "back"
  | "textWithClozes"
  | "extra"
  | "question"
  | "options"
  | "correctOptionIndex"
  | "explanation";

export type CardEditorFieldErrors = Partial<Record<CardEditorField, string>>;

export type CardEditorValidationResult =
  | { ok: true; value: CardEditorValue; errors: {} }
  | { ok: false; value: null; errors: CardEditorFieldErrors };

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
  syncConflict?: boolean;
  meta: Record<string, unknown>;
  noteTypeDefinitionId: string;
  contentDocument: LearningItemDocumentV1;
  latestSourceSnapshotId: string | null;
  contentRevision: number;
}

export interface Deck {
  id: string;
  ownerId: string;
  parentDeckId: string | null;
  name: string;
  description: string;
  source: DeckSource;
  originalDeckId: string | null;
  hierarchyPath: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  updatedByDeviceId: string | null;
  cardCount: number;
  tags: string[];
  importMeta: Record<string, unknown>;
  mediaAssets: MediaAssetReference[];
  deckSettings: DeckSettings;
  sourceDocuments: SourceDocument[];
  cards: LearningItem[];
  reviewEvents: ReviewEvent[];
  versionLog: VersionEntry[];
}

export interface MaterializedImportCommitGraph {
  kind?: never;
  decks: Deck[];
  noteTypeDefinitions: NoteTypeDefinitionV1[];
  sourceSnapshots: ForeignNoteSnapshot[];
}

export interface WorkerImportCommitGraph {
  kind: "worker-import";
  deckCount: number;
  cardCount: number;
  noteTypeDefinitions: NoteTypeDefinitionV1[];
  deckIdentities: Array<{ id: string; originalDeckId: string | null }>;
  mediaTargets: Array<{ deckId: string; name: string }>;
  streamChunks(visit: (chunk: unknown) => Promise<void>): Promise<void>;
  dispose(): void;
}

export type ImportCommitGraph = MaterializedImportCommitGraph | WorkerImportCommitGraph;

export interface ImportVerificationScope {
  deckIds: string[];
  cardIds: string[];
  variantIds: string[];
  sourceSnapshots: Array<{ id: string; cardId: string; attachToCard: boolean }>;
  noteTypeDefinitionIds: string[];
  reviewEventIds: string[];
}

export interface ImportVerificationRepairScope {
  deckIds?: string[];
  cardIds?: string[];
  variantIds?: string[];
  sourceSnapshotIds?: string[];
  noteTypeDefinitionIds?: string[];
  reviewEventIds?: string[];
}

export interface AppState {
  version: 4;
  profile: Profile;
  decks: Deck[];
  documents: SourceDocument[];
  noteTypeDefinitions: NoteTypeDefinitionV1[];
  learningItemSourceSnapshots: ForeignNoteSnapshot[];
  cloudTombstones: CloudTombstone[];
  updatedAt: string;
}
