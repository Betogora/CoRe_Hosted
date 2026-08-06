import type { AppRoute, AppViewId, createViewRoute } from "./appNavigation.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { CoreWorkspace, DeckMutationResult, WorkspaceState } from "./coreWorkspace.ts";
import type { CoreMode, Deck, LearningItem, Profile, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import type { LearningSettingsInput } from "./deckSettings.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { CreationMethod } from "./useAppNavigation.ts";

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
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  onOpenDeckSettings: (deckId: string) => unknown;
}

export interface DeckSettingsScreenProps {
  deck: Deck | null;
  onSave: (deckId: string, settings: LearningSettingsInput) => unknown;
  onSaveAppearance: (deckId: string, appearance: Deck["deckSettings"]["appearance"]) => unknown;
  onRenameDeck: (deckId: string, name: string) => DeckMutationResult | null;
  onBack: () => unknown;
  backLabel?: string;
}

export interface DecksScreenProps {
  decks: Deck[];
  now: string;
  mediaStore: AccountMediaStore | null;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onSaveCard: (deckId: string, cardId: string, value: CardEditorValue) => unknown;
  onDuplicateCard: (deckId: string, cardId: string) => Promise<Deck | null>;
  onDeleteCard: (deckId: string, cardId: string) => Promise<Deck | null>;
  onUndoDeleteCard: (deckId: string, deletedCard: LearningItem) => Promise<Deck | null>;
  onRestoreCard: (deckId: string, cardId: string, versionId: string) => unknown;
  onAddVariant: (deckId: string, cardId: string, variant: CardVariantInput) => unknown;
  onGenerateVariant: (deckId: string, cardId: string) => Promise<AiCardVariantSuccess>;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  onSelectDeck: (deckId: string | null, cardId?: string | null) => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onDeleteDeck: (deckId: string) => Promise<ReturnType<CoreWorkspace["deleteDeckTree"]> | null>;
  onRenameDeck: (deckId: string, name: string) => DeckMutationResult | null;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => DeckMutationResult | null;
  onOpenCardCreation: () => unknown;
  onPrepareSubdeckCreation: (parentDeckId?: string) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}

export interface LearnScreenProps {
  decks: Deck[];
  now: string;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

export interface SettingsScreenProps {
  appState: WorkspaceState;
  profile: Profile;
  decks: Deck[];
  syncStatus: SyncStatus;
  globalDeckSettings: ReturnType<typeof import("./deckSettings.ts").getGlobalDeckSettings>;
  onSaveProfile: (profile: Profile) => unknown;
  onSaveGlobalLearningSettings: (settings: LearningSettingsInput) => unknown;
  onSaveState: (state: WorkspaceState) => unknown;
  onSyncNow: () => Promise<unknown>;
  onListConflicts: () => Promise<unknown[]>;
  onResolveConflict: (conflictId: string, decision: Record<string, unknown>) => Promise<unknown>;
  onSignOut: () => Promise<void>;
}

export interface StatisticsScreenProps { decks: Deck[]; now: string; onNavigate: NavigateToView }

export interface SimulatorScreenProps {
  systemNow: string;
  dayOffset: number;
  onDayOffsetChange: (dayOffset: number) => void;
}

export interface StudyModeProps {
  deck: Deck;
  decks: Deck[];
  deckId: string;
  variantSession: boolean;
  variantId?: string;
  mediaStore: AccountMediaStore | null;
  getNow: () => string;
  simulationDayOffset: number;
  onExit: () => void;
  onReturnToLearn: () => void;
  onDeckUpdated: (deck: Deck | Deck[]) => unknown;
  onReviewEvent: (event: ReviewEvent) => void;
}
