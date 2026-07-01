import { stripHtml } from "./htmlSafety.js";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.js";

function normalizeQuery(value) {
  return String(value ?? "").trim().toLowerCase();
}

function deckPath(deck) {
  return (deck.hierarchyPath ?? [deck.name]).join(" / ");
}

function progressPercent(summary) {
  return summary.totalCards ? Math.round((summary.matureCards / summary.totalCards) * 100) : 0;
}

function previewText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function resultLabel(job) {
  if (job.resultRef?.cardCount) return `${job.resultRef.cardCount} Karten`;
  if (job.resultRef?.generatedVariantIds) return `${job.resultRef.generatedVariantIds.length} Varianten`;
  return "";
}

function createDeckRow(deck, { now, cardLimit }) {
  const activeCards = listReviewableCards(deck);
  const summary = summarizeDeckReview(deck, now);

  return {
    id: deck.id,
    deck,
    name: deck.name,
    path: deckPath(deck),
    coreMode: deck.deckSettings?.coreMode ?? "auto",
    summary,
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

function matchesDeckRow(row, query, coreMode) {
  const haystack = normalizeQuery(`${row.name} ${row.deck.tags?.join(" ") ?? ""} ${row.path}`);
  const matchesQuery = !query || haystack.includes(query);
  const matchesMode = coreMode === "all" || row.coreMode === coreMode;

  return matchesQuery && matchesMode;
}

function summarizeRows(rows) {
  const totals = rows.reduce(
    (accumulator, row) => {
      const summary = row.summary;
      accumulator.totalCards += summary.totalCards;
      accumulator.dueCards += summary.dueCards;
      accumulator.newCards += summary.newCards;
      accumulator.matureCards += summary.matureCards;
      accumulator.activeVariants += summary.activeVariants;
      accumulator.weightedMaturityXp += summary.averageMaturityXp * summary.totalCards;
      return accumulator;
    },
    {
      deckCount: rows.length,
      totalCards: 0,
      dueCards: 0,
      newCards: 0,
      matureCards: 0,
      activeVariants: 0,
      weightedMaturityXp: 0,
    },
  );

  return {
    deckCount: totals.deckCount,
    totalCards: totals.totalCards,
    dueCards: totals.dueCards,
    newCards: totals.newCards,
    matureCards: totals.matureCards,
    activeVariants: totals.activeVariants,
    averageMaturityXp: totals.totalCards ? Math.round(totals.weightedMaturityXp / totals.totalCards) : 0,
    completionPercent: totals.totalCards ? Math.round((totals.matureCards / totals.totalCards) * 100) : 0,
  };
}

export function createDeckLibraryModel(decks = [], options = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardLimit = options.cardLimit ?? 80;
  const rows = decks.map((deck) => createDeckRow(deck, { now: options.now ?? new Date(), cardLimit }));
  const filteredRows = rows.filter((row) => matchesDeckRow(row, query, coreMode));
  const selectedRow = rows.find((row) => row.id === options.selectedDeckId) ?? filteredRows[0] ?? null;

  return {
    rows,
    filteredRows,
    selectedRow,
    dashboardRows: rows.slice(0, 4),
    totals: summarizeRows(rows),
  };
}

export function createAiJobLedger({ decks = [], jobs = [] } = {}) {
  const deckJobs = decks.flatMap((deck) =>
    (deck.aiJobs ?? []).map((job) => ({
      ...job,
      deckName: deck.name,
    })),
  );
  const ledgerJobs = [...jobs, ...deckJobs]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((job) => ({
      ...job,
      scopeLabel: job.deckName ?? job.deckId ?? "global",
      resultLabel: resultLabel(job),
    }));
  const statusCounts = ledgerJobs.reduce((counts, job) => ({ ...counts, [job.status]: (counts[job.status] ?? 0) + 1 }), {});

  return {
    jobs: ledgerJobs,
    total: ledgerJobs.length,
    succeeded: statusCounts.succeeded ?? 0,
    failed: statusCounts.failed ?? 0,
    statusCounts,
  };
}
