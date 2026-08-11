import type { AppRoute, AppViewId, createViewRoute } from "./appNavigation.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { CoreWorkspace, DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CoreMode, Deck, LearningItem, LearningItemStudyStatePatch, Profile, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import type { GlobalLearningSettingsInput, LearningSettingsInput } from "./deckSettings.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { PomodoroTimer } from "./pomodoroTimer.ts";
import type { CreationMethod } from "./useAppNavigation.ts";
import type { DeckExpansionSurface } from "./uiPreferences.ts";

type NavigateToView = (
  viewId: AppViewId | undefined,
  fields?: Parameters<typeof createViewRoute>[1],
  options?: { replace?: boolean },
) => AppRoute;
type CreateDeckInput = Parameters<CoreWorkspace["createDeck"]>[0];
type CardEditorValue = Parameters<CoreWorkspace["saveDeckCard"]>[2];
type CardVariantInput = Parameters<CoreWorkspace["addDeckCardVariant"]>[2];
type ManualCardInput = Parameters<CoreWorkspace["addManualCardToDeck"]>[1];

export interface CardDraftGuard {
  focus: () => void;
  save: () => Promise<boolean>;
}

export interface CreationScreenProps {
  decks: Deck[];
  mediaStore: AccountMediaStore | null;
  persistImportedDecks: (decks: Deck[], options?: { mediaOnly?: boolean }) => Promise<unknown>;
  initialMethod: CreationMethod;
  initialTargetDeckId: string;
  completedDeckId: string;
  onMethodChange: (method: CreationMethod) => unknown;
  onTargetDeckChange: (deckId: string) => unknown;
  onCreated: (deck: Deck) => Promise<Deck | null>;
  onAppendManualCard: (deckId: string, input: ManualCardInput) => Promise<Deck | null>;
  onDraftStateChange: (dirty: boolean, focusDraft: (() => void) | null) => void;
  onSessionCompleted: (deckId: string) => void;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onReviewDeck: (deckId?: string | null) => void;
}

export interface DashboardScreenProps {
  state: WorkspaceState;
  now: string;
  onNavigate: NavigateToView;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDemo: () => Promise<Deck[] | null>;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
}

export interface DeckSettingsScreenProps {
  deck: Deck | null;
  decks: Deck[];
  onSave: (deckId: string, settings: LearningSettingsInput) => unknown;
  onSaveAppearance: (deckId: string, appearance: Deck["deckSettings"]["appearance"]) => unknown;
  onRenameDeck: (deckId: string, name: string) => DeckMutationResult | null;
  onCreateSubdeck: (parentDeckId: string) => unknown;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onDeleteDeck: (deckId: string) => Promise<ReturnType<CoreWorkspace["deleteDeckTree"]> | null>;
  onBack: () => unknown;
  backLabel?: string;
}

export interface DecksScreenProps {
  decks: Deck[];
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  mediaStore: AccountMediaStore | null;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onSaveCard: (deckId: string, cardId: string, value: CardEditorValue) => unknown;
  onSetCardStudyState: (deckId: string, cardId: string, patch: LearningItemStudyStatePatch) => Deck | null;
  onDuplicateCard: (deckId: string, cardId: string) => Promise<Deck | null>;
  onDeleteCard: (deckId: string, cardId: string) => Promise<Deck | null>;
  onUndoDeleteCard: (deckId: string, deletedCard: LearningItem) => Promise<Deck | null>;
  onRestoreCard: (deckId: string, cardId: string, versionId: string) => unknown;
  onAddVariant: (deckId: string, cardId: string, variant: CardVariantInput) => unknown;
  onGenerateVariant: (deckId: string, cardId: string) => Promise<AiCardVariantSuccess>;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  onSelectDeck: (deckId: string | null, cardId?: string | null) => unknown;
  onCloseSelectedCard?: () => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => DeckMutationResult | null;
  onOpenCardCreation: () => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
  expandedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
}

export interface LearnScreenProps {
  decks: Deck[];
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onSetDeckExpanded: (surface: DeckExpansionSurface, deckId: string, expanded: boolean) => unknown;
}

export interface SettingsScreenProps {
  appState: WorkspaceState;
  profile: Profile;
  syncStatus: SyncStatus;
  globalDeckSettings: ReturnType<typeof import("./deckSettings.ts").getGlobalDeckSettings>;
  onSaveProfile: (profile: Profile) => unknown;
  onSaveGlobalLearningSettings: (settings: GlobalLearningSettingsInput) => unknown;
  onSaveState: (state: WorkspaceState) => unknown;
  onSyncNow: () => Promise<unknown>;
  onListConflicts: () => Promise<unknown[]>;
  onResolveConflict: (conflictId: string, decision: Record<string, unknown>) => Promise<unknown>;
  onSignOut: () => Promise<void>;
  onNavigate: NavigateToView;
  simulationOffsetMinutes: number;
  simulationDateLabel: string;
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
}

export interface StatisticsScreenProps {
  decks: Deck[];
  now: string;
  timeZone: string;
  dayStartHour?: number;
  onNavigate: NavigateToView;
  onStartDeck: (deckId: string) => unknown;
  onOpenCard: (deckId: string, learningItemId: string) => unknown;
}

export interface SimulatorScreenProps {
  systemNow: string;
  offsetMinutes: number;
  onOffsetChange: (offsetMinutes: number) => void;
}

export interface StudyModeProps {
  deck: Deck;
  decks: Deck[];
  deckId: string;
  variantSession: boolean;
  variantId?: string;
  mediaStore: AccountMediaStore | null;
  getNow: () => string;
  learningDayKey?: string;
  dayStartHour?: number;
  timeZone?: string;
  simulationOffsetMinutes: number;
  pomodoroTimer: PomodoroTimer | null;
  onStartPomodoro: (minutes: number) => void;
  onExit: () => void;
  onReturnToLearn: () => void;
  onEditCard: (deckId: string, cardId: string) => unknown;
  onEditDeck: (deckId: string) => unknown;
  onSetCardStudyState: (deckId: string, cardId: string, patch: LearningItemStudyStatePatch) => Deck | null;
  onDeckUpdated: (deck: Deck | Deck[]) => unknown;
  onReviewEvent: (event: ReviewEvent) => void;
}
