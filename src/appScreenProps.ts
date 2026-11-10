import type { CardSearchContext } from "./cardSearchQuery.ts";
import type { CardBatchAction, CardBatchResult, TextReplaceSession } from "./cardBatchActions.ts";
import type { DuplicateGroup, DuplicateKey } from "./duplicateContents.ts";
import type { HitStudyOrder } from "./hitStudySession.ts";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AppRoute, AppViewId, CardEditorTab, DeckContentTab, DeckSettingsSection, GeneralSettingsSection, LearningSettingsSection, SettingsSection, createViewRoute } from "./appNavigation.ts";
import type { ApkgImportSession } from "./apkgImportSession.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { Card, CardStudyStatePatch, CoreMode, Deck, ExamDailyTask, ExamPlanningSettings, GlobalSchedulerPreferences, LearningProfileTemplate, Note, NoteContent, Profile, ReviewEvent, SavedCardSearch, SyncStatus } from "./coreTypes.ts";
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
  onPausePomodoro?: () => void;
  onResumePomodoro?: () => void;
  onResetPomodoro?: () => void;
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
  section: DeckSettingsSection;
  onSelectSection: (section: DeckSettingsSection) => unknown;
  deck: Deck | null;
  decks: Deck[];
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  learningProfiles: LearningProfileTemplate[];
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
  /** Closes the dialog towards the view it was opened from. */
  onClose: () => unknown;
  /** The save bar of the open draft. */
  footer?: ReactNode;
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
  /** Anki note types of the account for `note:` (replicated completely). */
  listNoteTypes: () => Promise<{ id: string; name: string }[]>;
  listExamsForDeck: (deckId: string) => Promise<string[]>;
  /** Loads a neighbouring card ahead so prev/next opens without waiting. */
  prefetchCard: (cardId: string) => void;
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
  /** Starts variants for the selected cards without one (KV4), with the settings of `deckId`; absent while generation is unavailable. */
  onGenerateCardVariants?: (deckId: string, cardIds: string[]) => unknown;
  /** Runs a mass action on the selected cards as one local change (KV4); its result can be undone. */
  onRunCardBatch?: (cardIds: string[], action: CardBatchAction) => Promise<CardBatchResult>;
  /** Loads the selected contents for `Suchen und Ersetzen` (KV5). */
  onPrepareTextReplace?: (cardIds: string[]) => Promise<TextReplaceSession>;
  /** `Treffer lernen` (KV5): studies these cards ahead of time; they are already free of suspended and buried cards. */
  onStudyHits?: (cardIds: string[], order: HitStudyOrder) => Promise<void>;
  /** `Nur üben` (KV5): the bodies of these cards; offline only those on this device. */
  onLoadPracticeCards?: (cardIds: string[]) => Promise<Array<{ card: Card; note: Note }>>;
  /** `Duplikate finden` (KV5) over the searched cards of these decks. */
  onFindDuplicates?: (request: { deckIds: string[]; key: DuplicateKey; query: string; searchContext: CardSearchContext }) => Promise<{ fieldNames: string[]; groups: DuplicateGroup[] }>;
  /** Ids of every hit of the flat hit list, for `Alle N Treffer auswählen` (KV4). */
  onListHitCardIds?: (request: { deckIds: string[]; query: string; searchContext: CardSearchContext; sort?: CardTableSort }) => Promise<string[]>;
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
  /** Saved searches of the account (`uiPreferences.savedSearches`); the whole list is written at once. */
  savedSearches: readonly SavedCardSearch[];
  onSavedSearchesChange: (searches: SavedCardSearch[]) => unknown;
  cardPages?: Readonly<Record<string, DecksCardPage | undefined>>;
  /** Resolves false when the answer was dropped (replaced or aborted), so the list asks again. */
  onRequestCardPage?: (request: DecksCardPageRequest) => Promise<boolean | undefined> | void;
  syncConflictCardIds?: ReadonlySet<string>;
}

export interface DecksCardPageRequest {
  /** The list: a deck id, or `HIT_LIST_KEY` for the flat hit list over `deckIds` (KV3). */
  deckId: string;
  deckIds?: string[];
  page: number;
  pageSize: 50;
  query: string;
  sort: CardTableSort;
  selectedCardId: string | null;
  /** Today's learning day and the subtrees of `did:` terms, so the search resolves them like the screen. */
  searchContext: CardSearchContext;
}

/** Loaded windows of one card list (a deck or the flat hit list); scrolling adds pages of `pageSize` rows (KV3). */
export interface DecksCardPage {
  deckId: string;
  pages: Readonly<Record<number, CardCatalogEntry[]>>;
  pageSize: number;
  totalCount: number;
  query: string;
  sort: CardTableSort;
  /** Scope of the flat hit list; a changed scope is a new list. */
  deckIds?: string[];
  selected?: (NoteGraph & { cardId: string }) | null;
  /** The card the last answered request asked for; until it matches the selection, the editor shows its loading bar. */
  requestedCardId?: string | null;
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

export interface SettingsDialogProps {
  section: SettingsSection;
  onSelectSection: (section: SettingsSection) => unknown;
  onClose: () => unknown;
  /** The save bar of the open draft. */
  footer?: ReactNode;
  children: ReactNode;
}

export interface SettingsScreenProps {
  section: GeneralSettingsSection;
  /** Moves focus to the sync conflicts inside the data area. */
  focusConflicts?: boolean;
  profile: Profile;
  syncStatus: SyncStatus;
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
  section: LearningSettingsSection;
  /** Decks for the switch to the deck settings dialog. */
  decks: Deck[];
  onOpenDeckSettings: (deckId: string) => unknown;
  timeZone: string;
  globalSchedulerPreferences: GlobalSchedulerPreferences;
  flagNames: readonly string[];
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
  /** A settings dialog lies over the session; review shortcuts pause meanwhile. */
  shortcutsSuspended?: boolean;
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
  onEditCard: (deckId: string, cardId: string, tab?: CardEditorTab) => unknown;
  onEditDeck: (deckId: string) => unknown;
  /** Own flag names of the account (`uiPreferences.flagNames`). */
  flagNames: readonly string[];
  onSetCardStudyState: (deckId: string, cardId: string, patch: CardStudyStatePatch) => { deck: Deck; note: Note } | null;
  onSetDeckReviewOrder: (deckId: string, order: import("./coreTypes.ts").NewReviewOrder) => Deck | null;
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
