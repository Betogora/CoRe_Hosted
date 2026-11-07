import type { CardSearchContext } from "./cardSearchQuery.ts";
import type { Card, Note, ReviewEvent, ReviewRating } from "./coreTypes.ts";
import { getActiveVariants, isCardReviewBlocked, noteTextIndex, tagSearchKeys } from "./coreModel.ts";
import { MANUAL_BURY_KIND, MANUAL_UNBURY_KIND } from "./siblingBurying.ts";
import type { CardTableSort } from "./libraryModel.ts";

export type AccountBaselineState = "uninitialized" | "nonempty" | "confirmed-empty";
export type BodyResidency = "catalog-only" | "cached" | "downloaded";
type OfflineDeckState = "none" | "downloading" | "available" | "outdated" | "error";

/** A loaded content with all its (non-deleted) cards, including siblings in other decks. */
export interface NoteGraph {
  note: Note;
  cards: Card[];
}

/**
 * Per-card list and delta entry. The cloud projection carries no full text; locally written entries
 * search the content text, entries from the cloud catalog search their preview.
 */
/** Text of one named field for `Feld:Text` searches; `name` is the `fieldSearchKey` of the field name. */
export interface NoteSearchField {
  name: string;
  text: string;
}

/** Full search text of one content, replicated so a complete local catalog can be searched offline. */
export interface NoteSearchEntry {
  noteId: string;
  searchText: string;
  searchFields: NoteSearchField[];
  deletedAt: string | null;
}

export interface CardCatalogEntry {
  id: string;
  deckId: string;
  noteId: string;
  frontPreview: string;
  normalizedSearchText: string;
  /** Field texts of the content; known once its body or its replicated search text is local. */
  searchFields?: NoteSearchField[];
  sortText: string;
  dueAt: string | null;
  scheduleState: string;
  maturityBand: string;
  reviewable: boolean;
  /** The mark of the card's content; all siblings show it. */
  marked: boolean;
  ankiFlag: number;
  leeched: boolean;
  /** Lower-case tags of the content with all `::` parents, for `tag:` search (`tagSearchKeys`). */
  tagKeys: string[];
  hasActiveVariants: boolean;
  activeVariantCount: number;
  activeVariantId: string | null;
  /**
   * Learning history and values for `added:`, `edited:`, `rated:`, `introduced:`, `prop:` and the content form
   * (`is:cloze` …). Entries stored before these fields existed lack them until the catalog delta brings them.
   */
  createdAt?: string;
  editedAt?: string | null;
  contentKind?: string;
  intervalDays?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  /** Times of the first answer, the last answer per rating and the last manual reschedule; other manual events do not count. */
  firstReviewedAt?: string | null;
  lastAgainAt?: string | null;
  lastHardAt?: string | null;
  lastGoodAt?: string | null;
  lastEasyAt?: string | null;
  lastRescheduledAt?: string | null;
  /** Anki note type (`note:`) of the content and whether a variant of the card is outdated (`has:outdated`). */
  noteTypeId?: string | null;
  hasOutdatedVariants?: boolean;
  /** Number of the prompt as in Anki's `card:N` (template, cloze or mask); null for an unknown prompt key. */
  promptOrdinal?: number | null;
  /** Last manual bury and unbury (`is:buried`: buried today when the bury is the later one). */
  lastBuriedAt?: string | null;
  lastUnburiedAt?: string | null;
  bodyRevision: number;
  studyRevision: number;
  dependencyRevision: number;
  syncChangeId: number;
  deletedAt: string | null;
  updatedAt: string;
}

export interface DeckStudySummary {
  deckId: string;
  totalCount: number;
  newCount: number;
  learningCount: number;
  matureCount: number;
  suspendedCount: number;
  activeVariantCount: number;
  syncChangeId?: number;
  updatedAt: string | null;
}

export interface AccountStudyOverview {
  contextKey: string;
  dayKey: string;
  introducedTodayByDeck: Record<string, number>;
  reviewedTodayByDeck: Record<string, number>;
  availableNewByDeck: Record<string, number>;
  availableLearningByDeck: Record<string, number>;
  dueByDeck: Record<string, number>;
  forecastByDay: Record<string, number>;
  generatedAt: string;
}

export interface CardBodyResidencyRecord {
  id: string;
  deckId: string;
  state: BodyResidency;
  bodyRevision: number;
  studyRevision: number;
  dependencyRevision: number;
  lastAccessedAt: string;
  protectedUntil?: string | null;
}

export interface OfflineMediaManifestEntry {
  sha1: string;
  size: number;
  mimeType: string;
  originalName: string;
  storagePath: string;
  createdAt: string;
}

export interface OfflineCardManifestEntry {
  id: string;
  bodyRevision: number;
  studyRevision: number;
  dependencyRevision: number;
  bodyBytes: number;
  updatedAt: string;
}

export interface OfflineDeckRecord {
  id: string;
  deckId: string;
  state: OfflineDeckState;
  expectedCardCount: number;
  verifiedCardCount: number;
  expectedMediaCount: number;
  verifiedMediaCount: number;
  expectedBytes: number;
  downloadedBytes: number;
  manifestCursor: string;
  failureMessage: string | null;
  updatedAt: string;
}

export interface ReplicaStatus {
  accountBaselineState: AccountBaselineState;
  catalogCompleteness: "empty" | "partial" | "complete";
  catalogCursor: number;
  catalogServerCursor: number;
  /**
   * The local catalog carries full search texts, so a complete catalog may answer searches itself (ADR-048).
   * False after a reconciliation without any replicated text, e.g. against a server without `note_search`.
   */
  searchTextsReady?: boolean;
}

export interface CatalogPageRequest {
  /** One deck, or null for the decks of `deckIds` as one list (the flat hit list, KV3). */
  deckId: string | null;
  deckIds?: readonly string[];
  query?: string;
  /** Resolves terms relative to today or to the deck tree (`CardSearchContext`). */
  searchContext?: CardSearchContext;
  sort?: CardTableSort;
  cursor?: { sortValue: string; id: string } | null;
  /** Rows to skip when there is no cursor: a page far down the list opens directly (KV3). */
  offset?: number;
  limit?: number;
  knownTotalCount?: number;
  signal?: AbortSignal;
}

export interface CatalogPage {
  items: CardCatalogEntry[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: { sortValue: string; id: string } | null;
}

export interface AccountStatisticsSnapshot {
  cards: {
    total: number;
    new: number;
    learning: number;
    mature: number;
    suspended: number;
  };
  reviewsByDay: Record<string, {
    total: number;
    learning: number;
    relearning: number;
    young: number;
    mature: number;
    successful: number;
    timedCount: number;
    durationMs: number;
    durationLearningMs: number;
    durationRelearningMs: number;
    durationYoungMs: number;
    durationMatureMs: number;
  }>;
  heatmapByDay: Record<string, number>;
  addedCardsByDay: Record<string, number>;
  forecastByDay: Record<string, { learning: number; relearning: number; young: number; mature: number; total: number }>;
  overdue: number;
  dueTomorrow: number;
  dailyWorkload: number;
  status: { activeVariants: number; deletedItems: number };
  intervals: {
    points: Array<{ key: string; label: string; count: number; cumulativePercent: number }>;
    averageDays: number;
    medianDays: number;
    percentile95Days: number;
  };
  fsrs: {
    difficulty: Array<{ key: string; label: string; count: number; cumulativePercent: number }>;
    stability: Array<{ key: string; label: string; count: number; cumulativePercent: number }>;
    retrievability: Array<{ key: string; label: string; count: number; cumulativePercent: number }>;
  };
  retention: Array<{
    key: "selected" | "previous" | "all";
    youngRemembered: number;
    youngTotal: number;
    matureRemembered: number;
    matureTotal: number;
  }>;
  hourly: Array<{ hour: number; reviews: number; successful: number }>;
  ratings: Array<{ category: "learning" | "relearning" | "young" | "mature"; rating: "again" | "hard" | "good" | "easy"; count: number }>;
  deckReviews: Record<string, { reviews: number; successful: number; again: number; remembered: number; retentionTotal: number; intervalTotal: number; intervalCount: number; nextDueAt: string | null }>;
  generatedAt: string;
}

export function bodyResidencyForRevision(
  residency: CardBodyResidencyRecord | undefined,
  catalog: Pick<CardCatalogEntry, "bodyRevision" | "studyRevision" | "dependencyRevision">,
): BodyResidency {
  if (!residency) return "catalog-only";
  if (residency.bodyRevision !== catalog.bodyRevision
    || residency.studyRevision !== catalog.studyRevision
    || residency.dependencyRevision !== catalog.dependencyRevision) {
    return "catalog-only";
  }
  return residency.state;
}

/** Local catalog entry with the same revisions as the cloud projection (`private.refresh_card_catalog`). */
/** The answer history a catalog entry keeps; the card body has no complete history, the cloud derives it from all answers. */
export type CatalogReviewHistory = Pick<CardCatalogEntry, "firstReviewedAt" | "lastAgainAt" | "lastHardAt" | "lastGoodAt" | "lastEasyAt" | "lastRescheduledAt" | "lastBuriedAt" | "lastUnburiedAt">;

/** `card:N` of a prompt key, the same mapping as `private.refresh_card_catalog`. */
export function promptOrdinal(promptKey: string): number | null {
  if (promptKey === "forward" || promptKey === "choice") return 1;
  if (promptKey === "reverse") return 2;
  const anki = /^anki-(\d{1,6})$/.exec(promptKey);
  if (anki) return Number(anki[1]) + 1;
  const numbered = /^(?:cloze|io):(\d{1,6})$/.exec(promptKey);
  return numbered ? Number(numbered[1]) : null;
}

/** Kind of the manual event that sets a new due date (`resched:`). */
export const MANUAL_RESCHEDULE_KIND = "manual_reschedule";

const LAST_RATED_FIELD: Record<ReviewRating, keyof CatalogReviewHistory> = {
  again: "lastAgainAt",
  hard: "lastHardAt",
  good: "lastGoodAt",
  easy: "lastEasyAt",
};

export function catalogReviewHistory(entry: CatalogReviewHistory | null | undefined): CatalogReviewHistory {
  return {
    firstReviewedAt: entry?.firstReviewedAt ?? null,
    lastAgainAt: entry?.lastAgainAt ?? null,
    lastHardAt: entry?.lastHardAt ?? null,
    lastGoodAt: entry?.lastGoodAt ?? null,
    lastEasyAt: entry?.lastEasyAt ?? null,
    lastRescheduledAt: entry?.lastRescheduledAt ?? null,
    lastBuriedAt: entry?.lastBuriedAt ?? null,
    lastUnburiedAt: entry?.lastUnburiedAt ?? null,
  };
}

/** History after more study events, in any order; of the manual events only reschedules and (un)burying count. */
export function withStudyEvents(history: CatalogReviewHistory | null | undefined, events: Iterable<Pick<ReviewEvent, "rating" | "answeredAt" | "flags">>): CatalogReviewHistory {
  const next = catalogReviewHistory(history);
  const later = (field: keyof CatalogReviewHistory, at: string) => {
    if (!next[field] || Date.parse(at) > Date.parse(next[field]!)) next[field] = at;
  };
  for (const event of events) {
    if (event.rating === "manual") {
      const kind = event.flags?.kind;
      if (kind === MANUAL_RESCHEDULE_KIND) later("lastRescheduledAt", event.answeredAt);
      else if (kind === MANUAL_BURY_KIND) later("lastBuriedAt", event.answeredAt);
      else if (kind === MANUAL_UNBURY_KIND) later("lastUnburiedAt", event.answeredAt);
      continue;
    }
    if (!next.firstReviewedAt || Date.parse(event.answeredAt) < Date.parse(next.firstReviewedAt)) next.firstReviewedAt = event.answeredAt;
    later(LAST_RATED_FIELD[event.rating], event.answeredAt);
  }
  return next;
}

/** Catalog entry of a card; the answer history comes from the previous entry or the known answers. */
export function catalogEntryFromCard(card: Card, note: Note | null, history?: CatalogReviewHistory | null): CardCatalogEntry {
  const activeVariants = getActiveVariants(card)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  const text = note ? noteTextIndex(note.content) : null;
  const preview = text?.sortText ?? "";
  return {
    id: card.id,
    deckId: card.deckId,
    noteId: card.noteId,
    frontPreview: preview.slice(0, 240),
    normalizedSearchText: text?.searchText ?? preview.toLocaleLowerCase("de"),
    ...(text ? { searchFields: text.searchFields } : {}),
    sortText: preview.toLocaleLowerCase("de").slice(0, 128),
    dueAt: card.study.dueAt,
    scheduleState: card.study.state,
    maturityBand: card.study.extra.maturityBand,
    reviewable: !isCardReviewBlocked(card),
    marked: note?.marked ?? false,
    ankiFlag: card.ankiFlag,
    leeched: card.study.leechedAt !== null,
    tagKeys: note ? tagSearchKeys(note.content.tags) : [],
    hasActiveVariants: activeVariants.length > 0,
    activeVariantCount: activeVariants.length,
    activeVariantId: activeVariants[0]?.id ?? null,
    createdAt: card.createdAt,
    ...(note ? { editedAt: note.updatedAt, contentKind: note.content.interaction.kind, noteTypeId: note.noteTypeSourceId } : {}),
    hasOutdatedVariants: card.variants.some((variant) => !variant.deletedAt && variant.meta.outdated === true),
    promptOrdinal: promptOrdinal(card.promptKey),
    intervalDays: card.study.intervalDays,
    difficulty: card.study.difficulty,
    reps: card.study.reps,
    lapses: card.study.lapses,
    ...catalogReviewHistory(history),
    bodyRevision: card.revision,
    studyRevision: card.studyRevision,
    dependencyRevision: (note?.revision ?? 1) + card.variants.reduce((total, variant) => total + variant.revision, 0),
    syncChangeId: 0,
    deletedAt: card.deletedAt,
    updatedAt: [card.updatedAt, note?.updatedAt ?? "", ...card.variants.map((variant) => variant.updatedAt)].sort().at(-1)!,
  };
}
