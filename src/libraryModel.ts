import { stripHtml } from "./htmlSafety.ts";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import type { CoreMode, Deck, LearningItem } from "./coreTypes.ts";

export { createStudyHeatmapWindow } from "./studyHeatmapModel.ts";

type DateInput = string | number | Date;

interface LibraryOptions {
  query?: unknown;
  coreMode?: CoreMode | "all";
  cardLimit?: number;
  now?: DateInput;
  timeZone?: string;
  selectedDeckId?: string;
  cardSort?: CardTableSort;
}
export type CardTableSortField = "sortField" | "due" | "variants";
export interface CardTableSort {
  field: CardTableSortField;
  direction: "asc" | "desc";
}
export const DEFAULT_CARD_TABLE_SORT: CardTableSort = { field: "sortField", direction: "asc" };
const cardSortCollator = new Intl.Collator("de-DE", { sensitivity: "base" });
const cardDueDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const REVIEW_RATINGS = new Set(["again", "hard", "good", "easy"]);

function normalizeQuery(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function deckPath(deck: Deck): string {
  return (deck.hierarchyPath ?? [deck.name]).join(" / ");
}

function progressPercent(summary: ReturnType<typeof summarizeDeckReview>): number {
  return summary.totalCards ? Math.round((summary.matureCards / summary.totalCards) * 100) : 0;
}

function previewText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function createDeckRow(
  deck: Deck,
  { now, cardLimit, scopeDecks = [deck], depth = 0, childrenCount = 0 }: {
    now: DateInput;
    cardLimit: number;
    scopeDecks?: Deck[];
    depth?: number;
    childrenCount?: number;
  },
) {
  const activeCards = listReviewableCards(deck);
  const directSummary = summarizeDeckReview(deck, now);
  const summary = summarizeDeckReview({ ...deck, cards: scopeDecks.flatMap((scopeDeck) => scopeDeck.cards ?? []) }, now);

  return {
    id: deck.id,
    deck,
    name: deck.name,
    path: deckPath(deck),
    parentDeckId: deck.parentDeckId ?? null,
    depth,
    childrenCount,
    hasChildren: childrenCount > 0,
    scopeDeckIds: scopeDecks.map((scopeDeck) => scopeDeck.id),
    coreMode: deck.deckSettings?.coreMode ?? "auto",
    summary,
    directSummary,
    progress: progressPercent(summary),
    activeCards,
    cardRows: activeCards.slice(0, cardLimit).map((card) => ({
      id: card.id,
      card,
      frontPreview: previewText(card.originalFront),
      kind: card.kind,
      maturityBand: card.reviewState?.maturityBand ?? "new",
    })),
  };
}

export type DeckLibraryRow = ReturnType<typeof createDeckRow>;

function createCardTableRow(card: LearningItem) {
  const isNew = card.reviewState?.state === "new";
  const parsedDue = Date.parse(card.reviewState?.dueAt ?? "");
  const dueTimestamp = !isNew && Number.isFinite(parsedDue) ? parsedDue : Number.POSITIVE_INFINITY;
  const hasActiveVariants = (card.variants ?? []).some((variant) => (
    !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active"
  ));

  return {
    id: card.id,
    card,
    frontPreview: previewText(card.originalFront),
    backPreview: previewText(card.originalBack),
    dueTimestamp,
    dueLabel: Number.isFinite(dueTimestamp) ? cardDueDateFormatter.format(dueTimestamp) : "Neu",
    hasActiveVariants,
    variantsLabel: hasActiveVariants ? "Ja" : "Nein",
  };
}
export type CardTableRow = ReturnType<typeof createCardTableRow>;

export type CardTableGroup = Omit<DeckLibraryRow, "cardRows"> & { cardRows: CardTableRow[] };

function sortCardRows(rows: CardTableRow[], sort: CardTableSort): CardTableRow[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    let comparison = 0;
    if (sort.field === "sortField") {
      comparison = cardSortCollator.compare(left.frontPreview, right.frontPreview);
    } else if (sort.field === "due") {
      comparison = left.dueTimestamp === right.dueTimestamp ? 0 : left.dueTimestamp - right.dueTimestamp;
    } else {
      comparison = Number(left.hasActiveVariants) - Number(right.hasActiveVariants);
    }
    return comparison * direction;
  });
}

function matchesDeckRow(row: DeckLibraryRow, query: string, coreMode: CoreMode | "all"): boolean {
  const haystack = normalizeQuery(`${row.name} ${row.deck.tags?.join(" ") ?? ""} ${row.path}`);
  const matchesQuery = !query || haystack.includes(query);
  const matchesMode = coreMode === "all" || row.coreMode === coreMode;

  return matchesQuery && matchesMode;
}

function collectScopeDecks(deck: Deck, childrenByParent: Map<string | null, Deck[]>): Deck[] {
  const children = childrenByParent.get(deck.id) ?? [];
  return [deck, ...children.flatMap((child) => collectScopeDecks(child, childrenByParent))];
}

function flattenDeckTree(decks: Deck[], options: { now: DateInput; cardLimit: number }): DeckLibraryRow[] {
  const childrenByParent = buildSortedDeckChildren(decks);
  const rows: DeckLibraryRow[] = [];

  function visit(deck: Deck, depth: number): void {
    const children = childrenByParent.get(deck.id) ?? [];
    rows.push(createDeckRow(deck, {
      ...options,
      depth,
      childrenCount: children.length,
      scopeDecks: collectScopeDecks(deck, childrenByParent),
    }));
    children.forEach((child) => visit(child, depth + 1));
  }

  (childrenByParent.get(null) ?? []).forEach((deck) => visit(deck, 0));
  return rows;
}

export function createStudyHeatmapModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const todayKey = getStudyHeatmapDayKey(options.now ?? new Date(), options.timeZone)
    ?? getStudyHeatmapDayKey(new Date(), options.timeZone) as string;
  const countsByDate = new Map<string, number>();

  for (const deck of decks) {
    for (const event of deck.reviewEvents ?? []) {
      if (!REVIEW_RATINGS.has(event.rating)) continue;
      const reviewedAt = (event as typeof event & { reviewedAt?: string }).reviewedAt;
      const key = getStudyHeatmapDayKey(event.answeredAt || reviewedAt || event.createdAt, options.timeZone);
      if (!key) continue;
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }
  }

  return createStudyHeatmapModelFromCounts({ todayKey, countsByDay: countsByDate });
}

export function createDeckLibraryModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardLimit = options.cardLimit ?? 80;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit });
  const filteredRows = rows.filter((row) => matchesDeckRow(row, query, coreMode));
  const selectedRow = rows.find((row) => row.id === options.selectedDeckId) ?? filteredRows[0] ?? null;

  return {
    rows,
    filteredRows,
    selectedRow,
    dueCards: rows.reduce((total, row) => total + row.directSummary.dueCards, 0),
    studyHeatmap: createStudyHeatmapModel(decks, { now, timeZone: options.timeZone }),
  };
}

export function createCardTableModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardSort = options.cardSort ?? DEFAULT_CARD_TABLE_SORT;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit: 0 });
  const allGroups: CardTableGroup[] = rows.map((row) => ({
    ...row,
    cardRows: sortCardRows(row.activeCards.map(createCardTableRow), cardSort),
  }));
  const groups = allGroups.flatMap((group) => {
    if (coreMode !== "all" && group.coreMode !== coreMode) return [];
    if (!query) return [group];

    const deckMatches = normalizeQuery(group.path).includes(query);
    const cardRows = deckMatches
      ? group.cardRows
      : group.cardRows.filter(({ card, frontPreview, backPreview }) => normalizeQuery(
        `${frontPreview} ${backPreview} ${card.tags?.join(" ") ?? ""}`,
      ).includes(query));

    return deckMatches || cardRows.length ? [{ ...group, cardRows }] : [];
  });

  return {
    allGroups,
    groups,
    cardCount: groups.reduce((total, group) => total + group.cardRows.length, 0),
    cardSort,
  };
}
