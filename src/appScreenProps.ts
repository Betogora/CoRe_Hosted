import type { CardSearchContext } from "./cardSearchQuery.ts";
import type { CardBatchAction, CardBatchResult, TextReplaceSession } from "./cardBatchActions.ts";
import type { HitStudyOrder } from "./hitStudySession.ts";
import type { Dispatch, SetStateAction } from "react";
import type { AppRoute, AppViewId, CardEditorTab, CreationCompletionKind, DeckContentTab, createViewRoute } from "./appNavigation.ts";
import type { ApkgImportSession } from "./apkgImportSession.ts";
import type { AiCardVariantSuccess } from "./aiCardVariantContract.ts";
import type { DeckMutationResult } from "./coreWorkspace.ts";
import type { SimilarNote } from "./cloudRepositoryValidation.ts";
import type { Card, CardStudyStatePatch, CoreMode, Deck, Note, NoteContent, ReviewEvent, SavedCardSearch } from "./coreTypes.ts";
import type { TagDirectoryEntry } from "./tagDirectory.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { ImportCommands } from "./importCommands.ts";
import type { ManualNoteSaveInput } from "./screens/ManualCreationPanel.tsx";
import type { ExistingTextImportNote, TextImportSaveInput } from "./textImport.ts";
import type { CreationMethod } from "./useAppNavigation.ts";
import type { CardCatalogEntry, NoteGraph } from "./workspaceReplica.ts";

export type NavigateToView = (
  viewId: AppViewId | undefined,
  fields?: Parameters<typeof createViewRoute>[1],
  options?: { replace?: boolean },
) => AppRoute;
export type CreateDeckInput = { name?: string; parentDeckId?: string | null; description?: string; deckSettings?: Partial<Deck["deckSettings"]> };

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

export interface DeckTreeScreenProps {
  onStartDeck: (deck: Deck) => void;
  /** Absent while the card catalog is unavailable. */
  onPracticeDeck?: (deck: Deck, returnFocus: HTMLElement | null) => void;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onOpenDeckSettings: (deckId: string) => unknown;
}

/** Null without a signed-in client; callers check online state themselves. */
interface CardEditorCloudReads {
  listCardReviewEvents: (cardId: string, signal: AbortSignal) => Promise<ReviewEvent[]>;
  listSimilarNotes: (noteId: string, signal: AbortSignal) => Promise<SimilarNote[]>;
}

export interface CardEditorServices {
  flagNames: readonly string[];
  runCardAction: (shown: NoteGraph, cardId: string, action: CardBatchAction) => Promise<CardBatchResult>;
  buryCards: (cardIds: string[], buried: boolean) => Promise<Card[]>;
  editVariant: (cardId: string, variantId: string, text: { front: string; back: string }) => Promise<void>;
  removeNoteMedia: (graph: NoteGraph, names: string[]) => Promise<NoteGraph | null>;
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
  learningContentAccount?: import("./learningSummaries.ts").LearningContentAccount | null;
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

