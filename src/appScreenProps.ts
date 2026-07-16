import type { AppRoute, AppViewId, createViewRoute } from "./appNavigation.ts";
import type { CoreWorkspace, WorkspaceState } from "./coreWorkspace.ts";
import type { AiJob, CoreMode, Deck, LearningItem, Profile, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import type { LearningSettingsInput } from "./deckSettings.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { ProductSurface } from "./productSurfaces.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
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
type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

export interface AssistantScreenProps {
  decks: Deck[];
  transcript: unknown[];
  plans: unknown[];
  profile: Profile;
  getAccessToken: () => Promise<string | null>;
  onAcceptAiChatConsent: () => Promise<unknown>;
  onSaveChat: (exchange: unknown) => unknown;
  onSavePlan: (plan: unknown) => unknown;
}

export interface AiJobsScreenProps { decks: Deck[]; jobs: AiJob[] }

export interface CommunityScreenProps {
  decks: Deck[];
  communities: unknown[];
  onSaveCommunity: (community: unknown) => unknown;
  onSaveDeck: (deck: Deck | Deck[]) => unknown;
}

export interface CreationScreenProps {
  decks: Deck[];
  mediaStore: AccountMediaStore | null;
  persistImportedDecks: (decks: Deck[], options?: { mediaOnly?: boolean }) => Promise<unknown>;
  supabase: SupabaseBrowserClient;
  supabaseUrl: string;
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
  onJob: (job: unknown) => unknown;
  showAiDrafts: boolean;
  aiDraftSurface: ProductSurface;
  enableServerApkgImport: boolean;
}

export interface DashboardScreenProps {
  state: WorkspaceState;
  onNavigate: NavigateToView;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDemo: () => Promise<Deck[] | null>;
  showAssistant: boolean;
}

export interface DeckSettingsScreenProps {
  deck: Deck | null;
  onSave: (deckId: string, settings: LearningSettingsInput) => unknown;
  onSaveAppearance: (deckId: string, appearance: Deck["deckSettings"]["appearance"]) => unknown;
  onBack: () => unknown;
}

export interface DecksScreenProps {
  decks: Deck[];
  mediaStore: AccountMediaStore | null;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onSaveCard: (deckId: string, cardId: string, value: CardEditorValue) => unknown;
  onDeleteCard: (deckId: string, cardId: string) => unknown;
  onUndoDeleteCard: (deckId: string, deletedCard: LearningItem) => unknown;
  onRestoreCard: (deckId: string, cardId: string, versionId: string) => unknown;
  onAddVariant: (deckId: string, cardId: string, variant: CardVariantInput) => unknown;
  onApplyVariantJson: (deckId: string, cardId: string, response: unknown, options: Record<string, unknown>) => unknown;
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  selectedDeckId: string | null;
  selectedCardId: string | null;
  onSelectDeck: (deckId: string | null, cardId?: string | null) => unknown;
  onSelectCard: (cardId: string | null) => unknown;
  onOpenLearn: (deckId?: string | null) => unknown;
  onDeleteDeck: (deckId: string) => unknown;
  onRenameDeck: (deckId: string, name: string) => unknown;
  onMoveDeck: (deckId: string, parentDeckId?: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onPrepareSubdeckCreation: (parentDeckId?: string) => unknown;
  onOpenGraph: (deck: Deck) => unknown;
  onShareDeck: (deck: Deck) => unknown;
  showGraph: boolean;
  showCommunity: boolean;
  showExternalVariantFlow: boolean;
  externalVariantSurface: ProductSurface;
}

export interface GraphScreenProps {
  decks: Deck[];
  onUpdateDeck: (deckId: string, updater: (deck: Deck) => Deck) => unknown;
}

export interface LearnScreenProps {
  decks: Deck[];
  onStartDeck: (deck: Deck, variantSession?: boolean) => void;
  onCreateDeck: (input: CreateDeckInput) => Deck | null;
  focusedDeckId: string | null;
  initialParentDeckId: string;
  onDeckCreationHandled: () => void;
  onFocusDeck: (deckId: string | null) => unknown;
  onOpenCardCreation: () => unknown;
  onOpenDecks: (deckId?: string | null) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
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

export interface StatisticsScreenProps { decks: Deck[]; onNavigate: NavigateToView }

export interface StudyModeProps {
  deck: Deck;
  decks: Deck[];
  deckId: string;
  variantSession: boolean;
  variantId?: string;
  mediaStore: AccountMediaStore | null;
  onExit: () => void;
  onReturnToLearn: () => void;
  onDeckUpdated: (deck: Deck | Deck[]) => unknown;
  onReviewEvent: (event: ReviewEvent) => void;
}
