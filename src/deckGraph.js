import { stripHtml } from "./htmlSafety.js";
import { makeId, stableContentHash } from "./coreModel.ts";

const STOP_WORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "eine",
  "einer",
  "eines",
  "mit",
  "von",
  "für",
  "fuer",
  "ist",
  "sind",
  "what",
  "which",
  "the",
  "and",
  "with",
]);

function wordsFromCard(card) {
  return `${stripHtml(card.originalFront)} ${stripHtml(card.originalBack)} ${(card.originalTags ?? []).join(" ")}`
    .toLowerCase()
    .replace(/[^a-zA-ZÄÖÜäöüß0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

function topTerms(cards, limit = 10) {
  const counts = new Map();

  for (const card of cards) {
    for (const word of new Set(wordsFromCard(card))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export function shouldRefreshDeckGraph(deck, existingGraph = deck.graph, options = {}) {
  if (!existingGraph) return true;
  if (options.manual) return true;

  const lastCardCount = existingGraph.metadata?.cardCount ?? 0;
  const currentCardCount = deck.cards?.length ?? 0;
  return currentCardCount - lastCardCount >= (options.minNewCardsForGraphRefresh ?? 10);
}

export function buildDeckGraph(deck, options = {}) {
  const cards = (deck.cards ?? []).filter((card) => card.status !== "deleted");
  const terms = topTerms(cards, options.termLimit ?? 9);
  const graphId = makeId("graph");
  const centerId = `${graphId}_deck`;
  const nodes = [
    {
      id: centerId,
      type: "deck",
      label: deck.name,
      cardIds: cards.map((card) => card.id),
    },
  ];
  const edges = [];

  for (const [index, term] of terms.entries()) {
    const termNodeId = `${graphId}_term_${index}`;
    const linkedCards = cards.filter((card) => wordsFromCard(card).includes(term.term)).map((card) => card.id);
    nodes.push({
      id: termNodeId,
      type: "topic",
      label: term.term,
      weight: term.count,
      cardIds: linkedCards,
    });
    edges.push({
      id: `${centerId}_${termNodeId}`,
      from: centerId,
      to: termNodeId,
      type: "contains",
      label: "gehört zu",
    });

    for (const cardId of linkedCards.slice(0, 4)) {
      const cardNodeId = `${graphId}_card_${cardId}`;
      if (!nodes.some((node) => node.id === cardNodeId)) {
        const card = cards.find((item) => item.id === cardId);
        nodes.push({
          id: cardNodeId,
          type: "card",
          label: stripHtml(card?.originalFront ?? "").slice(0, 42) || "Karte",
          cardIds: [cardId],
        });
      }
      edges.push({
        id: `${termNodeId}_${cardNodeId}`,
        from: termNodeId,
        to: cardNodeId,
        type: "tests_same_content",
        label: "prüft",
      });
    }
  }

  return {
    id: graphId,
    deckId: deck.id,
    nodes,
    edges,
    status: "ready",
    contentHash: stableContentHash({ deckId: deck.id, cards: cards.map((card) => card.contentHash) }, "graph"),
    metadata: {
      cardCount: cards.length,
      termCount: terms.length,
      generatedBy: "local-keyword-graph",
      generatedAt: new Date().toISOString(),
      stale: false,
    },
  };
}

