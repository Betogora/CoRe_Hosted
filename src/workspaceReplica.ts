import type { CardTableSort } from "./libraryModel.ts";

export type AccountBaselineState = "uninitialized" | "nonempty" | "confirmed-empty";
export type BodyResidency = "catalog-only" | "cached" | "downloaded";
export type OfflineDeckState = "none" | "downloading" | "available" | "outdated" | "error";

export interface CardCatalogEntry {
  id: string;
  deckId: string;
  frontPreview: string;
  normalizedSearchText: string;
  sortText: string;
  dueAt: string | null;
  scheduleState: string;
  maturityBand: string;
  reviewable: boolean;
  hasActiveVariants: boolean;
  activeVariantCount: number;
  activeVariantId: string | null;
  bodyRevision: number;
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
  dependencyRevision: number;
  lastAccessedAt: string;
  protectedUntil?: string | null;
}

export interface OfflineMediaManifestEntry {
  id: string;
  sha1: string;
  size: number;
  mimeType: string;
  originalName: string;
  storageBucket: string;
  storagePath: string;
  cardId: string | null;
  updatedAt: string;
}

export interface OfflineCardManifestEntry {
  id: string;
  bodyRevision: number;
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
}

export interface CatalogPageRequest {
  deckId: string;
  query?: string;
  sort?: CardTableSort;
  cursor?: { sortValue: string; id: string } | null;
  limit?: number;
  knownTotalCount?: number;
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
  catalog: Pick<CardCatalogEntry, "bodyRevision" | "dependencyRevision">,
): BodyResidency {
  if (!residency) return "catalog-only";
  if (residency.bodyRevision !== catalog.bodyRevision || residency.dependencyRevision !== catalog.dependencyRevision) {
    return "catalog-only";
  }
  return residency.state;
}
