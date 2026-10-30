import type { Dispatch, SetStateAction } from "react";
import type { AppRoute, AppViewId, CardEditorTab, DeckContentTab, SettingsTarget, createViewRoute } from "./appNavigation.ts";
import type { ApkgImportSession } from "./apkgImportSession.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { Card, CardStudyStatePatch, CoreMode, Deck, ExamDailyTask, ExamPlanningSettings, GlobalSchedulerPreferences, LearningProfileTemplate, Note, NoteContent, Profile, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import type { SimilarNote } from "./cloudRepositoryValidation.ts";
import type { TagDirectoryEntry } from "./tagDirectory.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import type { StudyHeatmapModel } from "./studyHeatmapModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { CommitImport } from "./creationWorkflow.ts";
import type { ManualNoteSaveInput } from "./screens/ManualCreationPanel.tsx";
import type { PomodoroTimer } from "./pomodoroTimer.ts";
import type { StatisticsDeckSelection, StatisticsPeriod, StatisticsProjection } from "./statisticsModel.ts";
import type { AnsweredTodayCard, DailyReviewProgressSummary, ReviewAnswerResult } from "./reviewService.ts";
import type { CreationMethod } from "./useAppNavigation.ts";
import type { WorkspaceStorageStatus } from "./workspaceStorage.ts";
import type { DeckExpansionSurface } from "./uiPreferences.ts";
import type { DeckLearningSettingsDraft, DeckSettingsDraft, GeneralSettingsDraft, GlobalCardSettingsDraft } from "./settingsDraft.ts";
import type { CardCatalogEntry, NoteGraph, OfflineDeckRecord } from "./workspaceReplica.ts";

type NavigateToView = (
  viewId: AppViewId | undefined,
  fields?: Parameters<typeof createViewRoute>[1],
  options?: { replace?: boolean },
) => AppRoute;
type CreateDeckInput = { name?: string; parentDeckId?: string | null; description?: string; deckSettings?: Partial<Deck["deckSettings"]> };

export interface CardDraftGuard {
  focus: () => void;
  save: () => Promise<boolean>;
}

/** `invalid` means the draft was rejected with feedback at the field; only `failed` is a failed save. */
export type SettingsSaveOutcome = "saved" | "invalid" | "failed";

export interface SettingsDraftGuard {
  save: (scope?: SettingsSaveScope) => Promise<SettingsSaveOutcome>;
  discard: () => void;
}

export type DeckSettingsSaveScope = "deck" | "deck-tree";
export type GlobalLearningSettingsSaveScope = "all-decks" | "new-decks";
export type SettingsSaveScope = DeckSettingsSaveScope | GlobalLearningSettingsSaveScope;

export interface CreationScreenProps {
  decks: Deck[];
  mediaStore: AccountMediaStore | null;
  commitImport: CommitImport;
  apkgImportSession: ApkgImportSession;
  onApkgImportSessionChange: Dispatch<SetStateAction<ApkgImportSession>>;
  isApkgImportSessionCurrent: (version: number) => boolean;
  onResetApkgImportSession: (disposeWorker?: boolean) => void;
  initialMethod: CreationMethod;
  initialTargetDeckId: string;
  completedDeckId: string;
  completedCount: number;
  completionKind: "import" | "manual" | "";
  onMethodChange: (method: CreationMethod) => unknown;
  onTargetDeckChange: (deckId: string) => unknown;
  onSaveManualNote: (input: ManualNoteSaveInput) => Promise<{ deck: Deck; cardIds: string[] } | null>;
  /** Tags of the account for suggestions in the tag input. */
  listTagDirectory: () => Promise<TagDirectoryEntry[]>;
  onDraftStateChange: (dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => void;
  onSessionCompleted: (completion: { deckId: string; createdCount: number; kind: "import" | "manual" }) => void;
  onStartDeck: (deck: Deck) => void;
  onReviewDeck: (deckId?: string | null) => void;
  onOpenDashboard: () => void;
}

export interface DashboardScreenProps {
  pomodoroTimer?: PomodoroTimer | null;
  onStartPomodoro?: (minutes: number) => void;
  state: WorkspaceState;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  studyHeatmap?: StudyHeatmapModel;
  now: string;
  onNavigate: NavigateToView;
  onStartDeck: (deck: Deck) => void;
  onStartAdditionalCards: (deckId: string, additionalCount: number) => { ok: boolean; message?: string };
  onCreateDemo: () => Promise<Deck[] | null>;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string | readonly string[], expanded: boolean) => unknown;
  /** Starts today's exam unit (ADR-042); the action leads the page while an exam is active. */
  onStartExamUnit?: (blockId: string | null) => Promise<void>;
  onLoadExamPlanningData?: ExamPlanningScreenProps["onLoadPlanningData"];
  onSaveExamTasks?: (tasks: ExamDailyTask[]) => Promise<void>;
  onLoadExamSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadExamLocalCardIds?: ExamPlanningScreenProps["onLoadLocalCardIds"];
}

/** Study states the exam forecast runs on, including answers still waiting for sync. */
export interface ExamPlanningData {
  cards: CardStudySnapshot[];
}

export interface ExamPlanningScreenProps {
  state: WorkspaceState;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  now: string;
  /** May answer from a short-lived cache; `fresh` asks for study states straight from the cloud. */
  onLoadPlanningData: (deckIds: string[], signal: AbortSignal, options?: { fresh?: boolean }) => Promise<ExamPlanningData>;
  onSavePlanning: (settings: ExamPlanningSettings) => Promise<void>;
  /** Merges today's checklist into the latest stored plan, never into a rendered snapshot. */
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onStartUnit: (blockId: string | null) => Promise<void>;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
  /** Offline the stored targets stay startable with the cards already on this device. */
  onLoadLocalCardIds?: (cardIds: string[]) => Promise<string[]>;
  /** Unsaved plan edits or calendar drafts; the app confirms before navigating away. */
  onDraftStateChange?: (dirty: boolean) => void;
}

export interface DeckSettingsScreenProps {
  deck: Deck | null;
  decks: Deck[];
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  learningProfiles: LearningProfileTemplate[];
  settingsTarget?: SettingsTarget | null;
  onSaveSettings: (deckId: string, draft: DeckSettingsDraft, scope: DeckSettingsSaveScope, baseline: DeckSettingsDraft) => DeckMutationResult | null;
  onApplyLearningProfile: (deckId: string, settings: DeckLearningSettingsDraft) => Deck | null;
  onSaveLearningProfiles: (profiles: LearningProfileTemplate[]) => unknown;
  onDraftStateChange: (guard: SettingsDraftGuard | null) => void;
  onRequestContextAction: (action: () => void) => void;
  onCreateSubdeck: (parentDeckId: string) => unknown;
  onDeleteDeck: (deckId: string) => Promise<{ deletedDeckIds: string[]; nextSelectedDeckId: string | null } | null>;
  onSelectDeck: (deckId: string) => unknown;
  onOpenGlobalSettings: () => unknown;
  offlineDeck?: OfflineDeckRecord | null;
  bodyCache?: { total: number; cached: number; downloaded: number } | null;
  onDownloadDeck?: (deckId: string) => Promise<unknown>;
  onRemoveDeckDownload?: (deckId: string) => Promise<unknown>;
  /** Starts AI variants for the deck's next cards without one, or refreshes variants from an older prompt version; absent while generation is unavailable. */
  onGenerateVariants?: (deck: Deck, mode: "missing" | "refresh") => unknown;
  variantGenerationRunning?: boolean;
  onBack: () => unknown;
  backLabel?: string;
}

/** Reads only the cloud offers; null without a signed-in client. Callers check online state themselves (W19). */
interface CardEditorCloudReads {
  listCardReviewEvents: (cardId: string, signal: AbortSignal) => Promise<ReviewEvent[]>;
  listSimilarNotes: (noteId: string, signal: AbortSignal) => Promise<SimilarNote[]>;
}

/** Instant card actions and reads of the card editor beyond the content draft. */
export interface CardEditorServices {
  /** Own flag names of the account (`uiPreferences.flagNames`). */
  flagNames: readonly string[];
  moveCard: (cardId: string, deckId: string) => Promise<NoteGraph | null>;
  resetCards: (cardIds: string[]) => Promise<Card[]>;
  setCardsLeech: (cardIds: string[], leechedAt: string | null) => Promise<Card[]>;
  buryCards: (cardIds: string[], buried: boolean) => Promise<Card[]>;
  restoreCardStudies: (studies: ReadonlyMap<string, Card["study"]>) => Promise<Card[]>;
  editVariant: (cardId: string, variantId: string, text: { front: string; back: string }) => Promise<void>;
  removeNoteMedia: (graph: NoteGraph, names: string[]) => Promise<NoteGraph | null>;
  /** The stored card and content, e.g. to check before an undo that nothing changed meanwhile. */
  loadCard: (cardId: string) => Promise<{ card: Card; note: Note } | null>;
  listReviewEvents: (cardId: string) => Promise<ReviewEvent[]>;
  /** Tags of the whole account online, of the local replica offline. */
  listTagDirectory: () => Promise<TagDirectoryEntry[]>;
  listExamsForDeck: (deckId: string) => Promise<string[]>;
  cloud: CardEditorCloudReads | null;
  openFlagNames: () => unknown;
  openSyncConflicts: () => unknown;
}

export interface DecksScreenProps {
  decks: Deck[];
  summaryAccountId?: string;
  /** Online storage for summaries and mind maps of the signed-in account. */
  learningContentCloud?: import("@supabase/supabase-js").SupabaseClient | null;
  onGenerateSummary?: (input: import("./aiLearningSummary.ts").SummaryGenerationInput, signal: AbortSignal) => Promise<import("./aiLearningSummary.ts").SummaryGenerationResult>;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  onStartDeck: (deck: Deck) => void;
  contentDeckId?: string | null;
  contentTab?: DeckContentTab;
  onOpenDeckContent: (deckId: string, tab?: DeckContentTab) => unknown;
  now: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  mediaStore: AccountMediaStore | null;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  /** Saves edited content; card removals were confirmed by the editor beforehand. */
  onSaveNote: (graph: NoteGraph, content: NoteContent) => Promise<NoteGraph | null>;
  onSetCardStudyState: (deckId: string, cardId: string, patch: CardStudyStatePatch) => Promise<NoteGraph | null>;
  onDuplicateNote: (graph: NoteGraph) => Promise<NoteGraph | null>;
  onDeleteNote: (graph: NoteGraph) => Promise<{ deleted: NoteGraph; undo: NoteGraph } | null>;
  onUndoDeleteNote: (undo: NoteGraph, deleted: NoteGraph) => Promise<NoteGraph | null>;
  onRescheduleCards: (cardIds: string[], dueAt: string, occurredAt: string) => Promise<Card[]>;
  onGenerateVariant: (deckId: string, cardId: string) => Promise<AiCardVariantSuccess>;
  /** Starts variants for the opened deck's cards without one; absent while generation is unavailable. */
  onGenerateDeckVariants?: (deck: Deck) => unknown;
  variantGenerationRunning?: boolean;
  onUpdateVariant: (cardId: string, variantId: string, action: "reactivate" | "deactivate" | "delete") => Promise<void>;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  cardEditorTab: CardEditorTab;
  onCardEditorTabChange: (tab: CardEditorTab) => unknown;
  cardEditor: CardEditorServices;
  onSelectDeck: (deckId: string | null, cardId?: string | null, tab?: CardEditorTab) => unknown;
  /** Present when the editor was opened from a session: closing returns there and there is no hit list (W6). */
  onCloseSelectedCard?: () => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onOpenCardSettings: () => unknown;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
  expandedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string | readonly string[], expanded: boolean) => unknown;
  cardPages?: Readonly<Record<string, DecksCardPage | undefined>>;
  onRequestCardPage?: (request: DecksCardPageRequest) => unknown;
  syncConflictCardIds?: ReadonlySet<string>;
}

export interface DecksCardPageRequest {
  deckId: string;
  page: number;
  pageSize: 50;
  query: string;
  sort: CardTableSort;
  selectedCardId: string | null;
}

export interface DecksCardPage {
  deckId: string;
  items: CardCatalogEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore?: boolean;
  query: string;
  sort: CardTableSort;
  selected?: (NoteGraph & { cardId: string }) | null;
  loadError?: string | null;
  limitedToLocalCatalog?: boolean;
}

export interface LearnScreenProps {
  decks: Deck[];
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  now: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  onStartDeck: (deck: Deck) => void;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenDeckContent: (deckId: string) => unknown;
  onOpenCardSettings: () => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string | readonly string[], expanded: boolean) => unknown;
}

export interface SettingsScreenProps {
  profile: Profile;
  syncStatus: SyncStatus;
  settingsTarget?: SettingsTarget | null;
  /** Time of the last successful sync in this session; stays visible while changes are pending. */
  lastSyncedAt?: string | null;
  storageStatus?: WorkspaceStorageStatus | null;
  onSaveSettings: (draft: GeneralSettingsDraft) => Profile | null | Promise<Profile | null>;
  onDraftStateChange: (guard: SettingsDraftGuard | null) => void;
  onSyncNow: () => Promise<unknown>;
  onListConflicts: (options?: { refreshRemote?: boolean }) => Promise<unknown[]>;
  onResolveConflict: (conflictId: string, decision: Record<string, unknown>) => Promise<unknown>;
  onSignOut: () => Promise<void>;
  onNavigate: NavigateToView;
}

export interface GlobalCardSettingsScreenProps {
  timeZone: string;
  globalSchedulerPreferences: GlobalSchedulerPreferences;
  flagNames: readonly string[];
  settingsTarget?: SettingsTarget | null;
  learningProfiles: LearningProfileTemplate[];
  onSaveLearningProfiles: (profiles: LearningProfileTemplate[]) => unknown;
  onSaveSettings: (draft: GlobalCardSettingsDraft, scope: GlobalLearningSettingsSaveScope) => Profile | null | Promise<Profile | null>;
  onDraftStateChange: (guard: SettingsDraftGuard | null) => void;
  onNavigate: NavigateToView;
  simulationOffsetMinutes: number;
  simulationDateLabel: string;
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
}

export interface StatisticsScreenProps {
  decks: Deck[];
  queryStatistics: (selection: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => Promise<StatisticsProjection>;
  now: string;
  timeZone: string;
  dayStartHour?: number;
  onNavigate: NavigateToView;
}

export interface SimulatorScreenProps {
  systemNow: string;
  offsetMinutes: number;
  onOffsetChange: (offsetMinutes: number) => void;
}

export interface StudyModeProps {
  deck: Deck;
  decks: Deck[];
  notes: Note[];
  /** Cards answered earlier today, for sibling burying. */
  answeredToday?: readonly AnsweredTodayCard[];
  deckId: string;
  mediaStore: AccountMediaStore | null;
  getNow: () => string;
  learningDayKey?: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  easyDays?: GlobalSchedulerPreferences["easyDays"];
  /** Account-wide due counts per future day at session start; without them Easy Days only sees the session cards. */
  dueForecast?: ReadonlyMap<string, number> | null;
  timeZone?: string;
  simulationOffsetMinutes: number;
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
  onExit: () => void;
  onReturnToLearn: () => void;
  onEditCard: (deckId: string, cardId: string) => unknown;
  onEditDeck: (deckId: string) => unknown;
  /** Own flag names of the account (`uiPreferences.flagNames`). */
  flagNames: readonly string[];
  onSetCardStudyState: (deckId: string, cardId: string, patch: CardStudyStatePatch) => { deck: Deck; note: Note } | null;
  onSetDeckReviewOrder: (deckId: string, order: import("./coreTypes.ts").NewReviewOrder) => Deck | null;
  onCardUpdated: (deckId: string, card: Card) => unknown;
  onReview: (result: ReviewAnswerResult) => unknown;
  sessionPlan?: {
    progress: DailyReviewProgressSummary;
    initialCardCount: number;
  };
  bufferSize?: number;
  hasMoreCards?: boolean;
  onLoadMoreCards?: () => Promise<{
    decks: Deck[];
    notes: Note[];
    hasMoreCards: boolean;
    bufferSize: number;
  }>;
}
