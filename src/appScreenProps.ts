import type { CardSearchContext } from "./cardSearchQuery.ts";
import type { CardBatchAction, CardBatchResult, TextReplaceSession } from "./cardBatchActions.ts";
import type { HitStudyOrder } from "./hitStudySession.ts";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AppRoute, AppViewId, CardEditorTab, CreationCompletionKind, DeckContentTab, DeckSettingsSection, GeneralSettingsSection, LearningSettingsSection, SettingsSection, createViewRoute } from "./appNavigation.ts";
import type { ApkgImportSession } from "./apkgImportSession.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { AskCardHelp } from "./screens/StudyAiHelp.tsx";
import type { DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CardStudySnapshot, SimilarNote } from "./cloudRepositoryValidation.ts";
import type { Card, CardStudyStatePatch, CoreMode, Deck, ExamDailyTask, ExamPlanningSettings, GlobalSchedulerPreferences, LearningProfileTemplate, Note, NoteContent, Profile, ReviewEvent, SavedCardSearch } from "./coreTypes.ts";
import type { TagDirectoryEntry } from "./tagDirectory.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { ImportCommands } from "./importCommands.ts";
import type { ManualNoteSaveInput } from "./screens/ManualCreationPanel.tsx";
import type { ExistingTextImportNote, TextImportSaveInput } from "./textImport.ts";
import type { PomodoroTimer } from "./pomodoroTimer.ts";
import type { AnsweredTodayCard, DailyReviewProgressSummary, ReviewAnswerResult } from "./reviewService.ts";
import type { CreationMethod } from "./useAppNavigation.ts";
import type { DeckExpansionSurface } from "./uiPreferences.ts";
import type { DeckLearningSettingsDraft, DeckSettingsDraft, GeneralSettingsDraft, GlobalCardSettingsDraft } from "./settingsDraft.ts";
import type { CardCatalogEntry, NoteGraph, OfflineDeckRecord } from "./workspaceReplica.ts";

type NavigateToView = (
  viewId: AppViewId | undefined,
  fields?: Parameters<typeof createViewRoute>[1],
  options?: { replace?: boolean },
) => AppRoute;
type CreateDeckInput = { name?: string; parentDeckId?: string | null; description?: string; deckSettings?: Partial<Deck["deckSettings"]> };

export interface CardDraftGuard { focus: () => void; save: () => Promise<boolean> }

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
  importActions: Pick<ImportCommands, "commitImport" | "getInterruptedImport">;
  apkgImportSession: ApkgImportSession;
  onApkgImportSessionChange: Dispatch<SetStateAction<ApkgImportSession>>;
  isApkgImportSessionCurrent: (version: number) => boolean;
  onResetApkgImportSession: (disposeWorker?: boolean) => void;
  initialMethod: CreationMethod;
  initialTargetDeckId: string;
  completedDeckId: string;
  completedCount: number;
  completionKind: CreationCompletionKind | "";
  onMethodChange: (method: CreationMethod) => unknown;
  onTargetDeckChange: (deckId: string, options?: { replace?: boolean }) => unknown;
  onSaveManualNote: (input: ManualNoteSaveInput) => Promise<{ deck: Deck; cardIds: string[] } | null>;
  listDeckContents: (deckId: string) => Promise<ExistingTextImportNote[]>;
  onImportTextNotes: (input: TextImportSaveInput) => Promise<{ deck: Deck; cardCount: number } | null>;
  listTagDirectory: () => Promise<TagDirectoryEntry[]>;
  onDraftStateChange: (dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => void;
  onSessionCompleted: (completion: { deckId: string; createdCount: number; kind: CreationCompletionKind }) => void;
  onStartDeck: (deck: Deck) => void;
  onReviewDeck: (deckId?: string | null) => void;
  onOpenDashboard: () => void;
}

interface DeckTreeScreenProps {
  onStartDeck: (deck: Deck) => void;
  /** Absent while the card catalog is unavailable. */
  onPracticeDeck?: (deck: Deck, returnFocus: HTMLElement | null) => void;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
}

export interface DashboardScreenProps extends DeckTreeScreenProps {
  onPausePomodoro?: () => void;
  onResumePomodoro?: () => void;
  onResetPomodoro?: () => void;
  pomodoroTimer?: PomodoroTimer | null;
  onStartPomodoro?: (minutes: number) => void;
  state: WorkspaceState;
  now: string;
  onNavigate: NavigateToView;
  onStartAdditionalCards: (deckId: string, additionalCount: number) => { ok: boolean; message?: string };
  onCreateDemo: () => Promise<Deck[] | null>;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
  onStartExamUnit?: (blockId: string | null) => Promise<void>;
  onLoadExamPlanningData?: ExamPlanningScreenProps["onLoadPlanningData"];
  onSaveExamTasks?: (tasks: ExamDailyTask[]) => Promise<void>;
  onLoadExamSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadExamLocalCardIds?: ExamPlanningScreenProps["onLoadLocalCardIds"];
}

export interface ExamPlanningData {
  cards: CardStudySnapshot[];
}

export interface ExamPlanningScreenProps {
  state: WorkspaceState;
  now: string;
  /** May answer from a short-lived cache; `fresh` asks for study states straight from the cloud. */
  onLoadPlanningData: (deckIds: string[], signal: AbortSignal, options?: { fresh?: boolean }) => Promise<ExamPlanningData>;
  onSavePlanning: (settings: ExamPlanningSettings) => Promise<void>;
  /** Merges today's checklist into the latest stored plan, never into a rendered snapshot. */
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onStartUnit: (blockId: string | null) => Promise<void>;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadLocalCardIds?: (cardIds: string[]) => Promise<string[]>;
  onDraftStateChange?: (dirty: boolean) => void;
}

export interface DeckSettingsScreenProps {
  section: DeckSettingsSection;
  onSelectSection: (section: DeckSettingsSection) => unknown;
  deck: Deck | null;
  decks: Deck[];
  learningProfiles: LearningProfileTemplate[];
  onSaveSettings: (deckId: string, draft: DeckSettingsDraft, scope: DeckSettingsSaveScope, baseline: DeckSettingsDraft) => DeckMutationResult | null;
  onApplyLearningProfile: (deckId: string, settings: DeckLearningSettingsDraft) => Deck | null;
  onSaveLearningProfiles: (profiles: LearningProfileTemplate[]) => unknown;
  onDraftStateChange: (guard: SettingsDraftGuard | null) => void;
  onRequestContextAction: (action: () => void) => void;
  onCreateSubdeck: (parentDeckId: string) => unknown;
  onDeleteDeck: (deckId: string) => Promise<{ deletedDeckIds: string[]; nextSelectedDeckId: string | null } | null>;
  onSelectDeck: (deckId: string) => unknown;
  /** Absent where the general settings cannot open, as inside a study session. */
  onOpenGlobalSettings?: () => unknown;
  offlineDeck?: OfflineDeckRecord | null;
  bodyCache?: { total: number; cached: number; downloaded: number } | null;
  onDownloadDeck?: (deckId: string) => Promise<unknown>;
  onRemoveDeckDownload?: (deckId: string) => Promise<unknown>;
  /** `cardsWithoutVariant` is null while unknown; absent while generation is unavailable. */
  variantGeneration?: { start: (deck: Deck, mode: "missing" | "refresh") => unknown; running: boolean; cardsWithoutVariant: number | null };
  onClose: () => unknown;
  footer?: ReactNode;
}

/** Null without a signed-in client; callers check online state themselves. */
interface CardEditorCloudReads {
  listCardReviewEvents: (cardId: string, signal: AbortSignal) => Promise<ReviewEvent[]>;
  listSimilarNotes: (noteId: string, signal: AbortSignal) => Promise<SimilarNote[]>;
}

export interface CardEditorServices {
  flagNames: readonly string[];
  moveCard: (cardId: string, deckId: string) => Promise<NoteGraph | null>;
  resetCards: (cardIds: string[]) => Promise<Card[]>;
  setCardsLeech: (cardIds: string[], leechedAt: string | null) => Promise<Card[]>;
  buryCards: (cardIds: string[], buried: boolean) => Promise<Card[]>;
  restoreCardStudies: (studies: ReadonlyMap<string, Card["study"]>) => Promise<Card[]>;
  editVariant: (cardId: string, variantId: string, text: { front: string; back: string }) => Promise<void>;
  removeNoteMedia: (graph: NoteGraph, names: string[]) => Promise<NoteGraph | null>;
  loadCard: (cardId: string) => Promise<{ card: Card; note: Note } | null>;
  listReviewEvents: (cardId: string) => Promise<ReviewEvent[]>;
  listTagDirectory: () => Promise<TagDirectoryEntry[]>;
  listNoteTypes: () => Promise<{ id: string; name: string }[]>;
  listExamsForDeck: (deckId: string) => Promise<string[]>;
  prefetchCard: (cardId: string) => void;
  cloud: CardEditorCloudReads | null;
  openFlagNames: () => unknown;
  openSyncConflicts: () => unknown;
}

export interface DecksScreenProps extends DeckTreeScreenProps {
  decks: Deck[];
  summaryAccountId?: string;
  learningContentCloud?: import("@supabase/supabase-js").SupabaseClient | null;
  onGenerateSummary?: (input: import("./aiLearningSummary.ts").SummaryGenerationInput, signal: AbortSignal) => Promise<import("./aiLearningSummary.ts").SummaryGenerationResult>;
  contentDeckId?: string | null;
  contentTab?: DeckContentTab;
  cardQuery?: string;
  onOpenDeckContent: (deckId: string, tab?: DeckContentTab) => unknown;
  now: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  mediaStore: AccountMediaStore | null;
  onSaveNote: (graph: NoteGraph, content: NoteContent) => Promise<NoteGraph | null>;
  onSetCardStudyState: (deckId: string, cardId: string, patch: CardStudyStatePatch) => Promise<NoteGraph | null>;
  onDuplicateNote: (graph: NoteGraph) => Promise<NoteGraph | null>;
  onDeleteNote: (graph: NoteGraph) => Promise<{ deleted: NoteGraph; undo: NoteGraph } | null>;
  onUndoDeleteNote: (undo: NoteGraph, deleted: NoteGraph) => Promise<NoteGraph | null>;
  onRescheduleCards: (cardIds: string[], dueAt: string, occurredAt: string) => Promise<Card[]>;
  onGenerateVariant: (deckId: string, cardId: string) => Promise<AiCardVariantSuccess>;
  /** Uses the settings of `deckId`; absent while generation is unavailable. */
  onGenerateCardVariants?: (deckId: string, cardIds: string[]) => unknown;
  onRunCardBatch?: (cardIds: string[], action: CardBatchAction) => Promise<CardBatchResult>;
  onPrepareTextReplace?: (cardIds: string[]) => Promise<TextReplaceSession>;
  /** The ids are already free of suspended and buried cards. */
  onStudyHits?: (cardIds: string[], order: HitStudyOrder) => Promise<void>;
  onLoadPracticeCards?: (cardIds: string[]) => Promise<Array<{ card: Card; note: Note }>>;
  /** Cards of the surplus duplicates among the hits of an `is:duplicate` search. */
  onListSurplusDuplicateIds?: (request: { deckIds: string[]; query: string; searchContext: CardSearchContext }) => Promise<string[]>;
  onListHitCardIds?: (request: { deckIds: string[]; query: string; searchContext: CardSearchContext; sort?: CardTableSort }) => Promise<string[]>;
  variantGenerationRunning?: boolean;
  onUpdateVariant: (cardId: string, variantId: string, action: "reactivate" | "deactivate" | "delete") => Promise<void>;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  cardEditorTab: CardEditorTab;
  onCardEditorTabChange: (tab: CardEditorTab) => unknown;
  cardEditor: CardEditorServices;
  onSelectDeck: (deckId: string | null, cardId?: string | null, tab?: CardEditorTab) => unknown;
  /** Present only when the editor was opened from a session. */
  onCloseSelectedCard?: () => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onOpenCardSettings: () => unknown;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => DeckMutationResult | null;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
  savedSearches: readonly SavedCardSearch[];
  onSavedSearchesChange: (searches: SavedCardSearch[]) => unknown;
  /** Resolves false when the answer was dropped (replaced or aborted), so the list asks again. */
  onRequestCardPage?: (request: DecksCardPageRequest) => Promise<boolean | undefined> | void;
}

export interface DecksCardPageRequest {
  /** A deck id, or `HIT_LIST_KEY` for the flat hit list over `deckIds`. */
  deckId: string;
  deckIds?: string[];
  page: number;
  pageSize: 50;
  query: string;
  sort: CardTableSort;
  selectedCardId: string | null;
  searchContext: CardSearchContext;
}

export interface DecksCardPage {
  deckId: string;
  pages: Readonly<Record<number, CardCatalogEntry[]>>;
  pageSize: number;
  totalCount: number;
  query: string;
  sort: CardTableSort;
  deckIds?: string[];
  selected?: (NoteGraph & { cardId: string }) | null;
  /**
   * The card the last answered request asked for; while it differs from the selection, the selection is still loading.
   */
  requestedCardId?: string | null;
  loadError?: string | null;
  limitedToLocalCatalog?: boolean;
}

export interface LearnScreenProps extends DeckTreeScreenProps {
  decks: Deck[];
  now: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenDeckContent: (deckId: string) => unknown;
  onOpenCardSettings: () => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
}

export interface SettingsDialogProps {
  section: SettingsSection;
  onSelectSection: (section: SettingsSection) => unknown;
  onClose: () => unknown;
  footer?: ReactNode;
  children: ReactNode;
}

export interface SettingsScreenProps {
  section: GeneralSettingsSection;
  focusConflicts?: boolean;
  profile: Profile;
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
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
}

export interface SimulatorScreenProps {
  systemNow: string;
  offsetMinutes: number;
  onOffsetChange: (offsetMinutes: number) => void;
}

export interface StudyModeProps extends Partial<Pick<GlobalSchedulerPreferences, "dayStartHour" | "learnAheadMinutes" | "leechThreshold" | "easyDays">> {
  shortcutsSuspended?: boolean;
  deck: Deck;
  decks: Deck[];
  notes: Note[];
  answeredToday?: readonly AnsweredTodayCard[];
  deckId: string;
  mediaStore: AccountMediaStore | null;
  getNow: () => string;
  learningDayKey?: string;
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
  flagNames: readonly string[];
  onSetCardStudyState: (deckId: string, cardId: string, patch: CardStudyStatePatch) => { deck: Deck; note: Note } | null;
  onSetDeckReviewOrder: (deckId: string, order: import("./coreTypes.ts").NewReviewOrder) => Deck | null;
  onReview: (result: ReviewAnswerResult) => unknown;
  onUndoReview: (result: ReviewAnswerResult, previous: Card) => Card | null;
  onAskCardHelp: AskCardHelp;
  sessionPlan?: { progress: DailyReviewProgressSummary; initialCardCount: number };
  bufferSize?: number;
  hasMoreCards?: boolean;
  onLoadMoreCards?: () => Promise<{
    decks: Deck[];
    notes: Note[];
    hasMoreCards: boolean;
    bufferSize: number;
  }>;
}
