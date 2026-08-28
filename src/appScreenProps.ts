import type { Dispatch, SetStateAction } from "react";
import type { AppRoute, AppViewId, SettingsTarget, createViewRoute } from "./appNavigation.ts";
import type { ApkgImportSession } from "./apkgImportSession.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CardEditorValue, CoreMode, Deck, GlobalSchedulerPreferences, ImportCommitGraph, LearningItem, LearningItemStudyStatePatch, LearningProfileTemplate, NoteTypeDefinitionV1, Profile, SyncStatus } from "./coreTypes.ts";
import type { createManualCoreDeck } from "./coreModel.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import type { StudyHeatmapModel } from "./studyHeatmapModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { ImportedDeckPersistence } from "./creationWorkflow.ts";
import type { PomodoroTimer } from "./pomodoroTimer.ts";
import type { StatisticsDeckSelection, StatisticsPeriod, StatisticsProjection } from "./statisticsModel.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import type { CreationMethod } from "./useAppNavigation.ts";
import type { WorkspaceStorageStatus } from "./workspaceStorage.ts";
import type { DeckExpansionSurface } from "./uiPreferences.ts";
import type { DeckLearningSettingsDraft, DeckSettingsDraft, GeneralSettingsDraft, GlobalCardSettingsDraft } from "./settingsDraft.ts";
import type { OfflineDeckRecord } from "./workspaceReplica.ts";

type NavigateToView = (
  viewId: AppViewId | undefined,
  fields?: Parameters<typeof createViewRoute>[1],
  options?: { replace?: boolean },
) => AppRoute;
type CreateDeckInput = { name?: string; parentDeckId?: string | null; description?: string; deckSettings?: Partial<Deck["deckSettings"]> };
type CardDocumentValue = { fields: Array<{ id: string; value: string }>; tags?: string[] };
type ManualCardInput = Parameters<typeof createManualCoreDeck>[0];

export interface CardDraftGuard {
  focus: () => void;
  save: () => Promise<boolean>;
}

export interface SettingsDraftGuard {
  save: (scope?: SettingsSaveScope) => Promise<boolean>;
  discard: () => void;
}

export type DeckSettingsSaveScope = "deck" | "deck-tree";
export type GlobalLearningSettingsSaveScope = "all-decks" | "new-decks";
export type SettingsSaveScope = DeckSettingsSaveScope | GlobalLearningSettingsSaveScope;

export interface CreationScreenProps {
  decks: Deck[];
  mediaStore: AccountMediaStore | null;
  persistImportedDecks: (decks: Deck[], options?: { mediaOnly?: boolean; commitGraph?: ImportCommitGraph }) => Promise<ImportedDeckPersistence>;
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
  onCreated: (deck: Deck) => Promise<Deck | null>;
  onAppendManualCard: (deckId: string, input: ManualCardInput) => Promise<Deck | null>;
  onDraftStateChange: (dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => void;
  onSessionCompleted: (completion: { deckId: string; createdCount: number; kind: "import" | "manual" }) => void;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onReviewDeck: (deckId?: string | null) => void;
  onOpenDashboard: () => void;
}

export interface DashboardScreenProps {
  state: WorkspaceState;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  studyHeatmap?: StudyHeatmapModel;
  now: string;
  onNavigate: NavigateToView;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onStartAdditionalCards: (deckId: string, additionalCount: number) => { ok: boolean; message?: string };
  onCreateDemo: () => Promise<Deck[] | null>;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
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
  onDeleteDeck: (deckId: string) => Promise<{ deletedDeckIds: string[]; deletedDecks: Deck[]; nextSelectedDeckId: string | null } | null>;
  onSelectDeck: (deckId: string) => unknown;
  onOpenGlobalSettings: () => unknown;
  offlineDeck?: OfflineDeckRecord | null;
  bodyCache?: { total: number; cached: number; downloaded: number } | null;
  onDownloadDeck?: (deckId: string) => Promise<unknown>;
  onRemoveDeckDownload?: (deckId: string) => Promise<unknown>;
  onBack: () => unknown;
  backLabel?: string;
}

export interface DecksScreenProps {
  decks: Deck[];
  noteTypeDefinitions?: NoteTypeDefinitionV1[];
  now: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  mediaStore: AccountMediaStore | null;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onSaveCard: (deckId: string, cardId: string, value: CardEditorValue) => unknown;
  onSaveCardDocument?: (deckId: string, cardId: string, value: CardDocumentValue) => unknown;
  onSetCardStudyState: (deckId: string, cardId: string, patch: LearningItemStudyStatePatch) => Promise<LearningItem | null>;
  onDuplicateCard: (deckId: string, cardId: string) => Promise<LearningItem | null>;
  onDeleteCard: (deckId: string, cardId: string) => Promise<LearningItem | null>;
  onUndoDeleteCard: (deckId: string, deletedCard: LearningItem, previousStatus: LearningItem["status"]) => Promise<LearningItem | null>;
  onRescheduleCards: (cardIds: string[], dueAt: string, occurredAt: string) => Promise<LearningItem[]>;
  onGenerateVariant: (deckId: string, cardId: string) => Promise<AiCardVariantSuccess>;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  onSelectDeck: (deckId: string | null, cardId?: string | null) => unknown;
  onCloseSelectedCard?: () => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
  expandedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
  cardPages?: Readonly<Record<string, DecksCardPage | undefined>>;
  onRequestCardPage?: (request: DecksCardPageRequest) => unknown;
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
  items: LearningItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore?: boolean;
  query: string;
  sort: CardTableSort;
  selectedCard?: LearningItem | null;
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
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenCardSettings: () => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
}

export interface SettingsScreenProps {
  profile: Profile;
  syncStatus: SyncStatus;
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
  noteTypeDefinitions?: NoteTypeDefinitionV1[];
  deckId: string;
  variantSession: boolean;
  variantId?: string;
  mediaStore: AccountMediaStore | null;
  getNow: () => string;
  learningDayKey?: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  easyDays?: GlobalSchedulerPreferences["easyDays"];
  timeZone?: string;
  simulationOffsetMinutes: number;
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
  onExit: () => void;
  onReturnToLearn: () => void;
  onEditCard: (deckId: string, cardId: string) => unknown;
  onEditDeck: (deckId: string) => unknown;
  onSetCardStudyState: (deckId: string, cardId: string, patch: LearningItemStudyStatePatch) => Deck | null;
  onSetDeckReviewOrder: (deckId: string, order: import("./coreTypes.ts").NewReviewOrder) => Deck | null;
  onCardUpdated: (deckId: string, card: LearningItem) => unknown;
  onReview: (result: ReviewAnswerResult) => unknown;
  hasMoreCards?: boolean;
  onLoadMoreCards?: () => Promise<Deck[]>;
}
