import { summarizeDeckReview } from "./scheduler.ts";
import { makeId } from "./coreModel.ts";
import type { Deck } from "./coreTypes.ts";

function daysBetween(start: string|number|Date, end: string|number|Date) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)) + 1);
}

function addDays(date: string|number|Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function weakTagsForDeck(deck: Deck) {
  const hardEvents = (deck.reviewEvents ?? []).filter((event: { rating: string; }) => event.rating === "again" || event.rating === "hard");
  const cardsById = new Map((deck.cards ?? []).map((card) => [card.id, card]));
  const counts = new Map<string, number>();

  for (const event of hardEvents) {
    const card = cardsById.get(event.reviewableId) ?? cardsById.get(event.sourceCardId);
    for (const tag of card?.originalTags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    const nodes = deck.graph && typeof deck.graph === "object" && "nodes" in deck.graph && Array.isArray(deck.graph.nodes) ? deck.graph.nodes : [];
    for (const node of nodes) {
      if (node.type === "topic") counts.set(node.label, node.weight ?? 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([tag, count]: any) => ({ tag, count }));
}

export function createLearningPlan({
  decks,
  targetDate,
  dailyMinutes = 30,
  newCardsPerDay = 8,
  includeVariants = true,
  now = new Date().toISOString(),
}: any = {}) {
  const deckSummaries = decks.map((deck: Deck) => ({
    deckId: deck.id,
    deckName: deck.name,
    summary: summarizeDeckReview(deck, now),
    weakTags: weakTagsForDeck(deck),
  }));
  const totalDue = deckSummaries.reduce((sum: any, item: { summary: { dueCards: any; }; }) => sum + item.summary.dueCards, 0);
  const totalNew = Math.min(
    deckSummaries.reduce((sum: any, item: { summary: { newCards: any; }; }) => sum + item.summary.newCards, 0),
    Math.max(0, newCardsPerDay * daysBetween(now, targetDate)),
  );
  const planDays = daysBetween(now, targetDate);
  const minutes = Math.max(10, Number(dailyMinutes) || 30);
  const reviewCapacity = Math.max(8, Math.floor(minutes * 1.4));
  const variantCapacity = includeVariants ? Math.max(1, Math.floor(minutes / 12)) : 0;
  const dayPlans = [];

  for (let day = 0; day < planDays; day += 1) {
    const isVariantDay = includeVariants && day % 3 === 2;
    const dueQuota = Math.ceil(totalDue / planDays);
    const newQuota = Math.min(newCardsPerDay, Math.max(0, Math.ceil(totalNew / planDays)));
    const focusDeck = deckSummaries[day % Math.max(1, deckSummaries.length)];

    dayPlans.push({
      date: addDays(now, day),
      minutes,
      dueReviews: Math.min(reviewCapacity, dueQuota),
      newCards: isVariantDay ? Math.max(0, Math.floor(newQuota / 2)) : newQuota,
      variantReviews: isVariantDay ? variantCapacity : 0,
      focusDeckId: focusDeck?.deckId ?? null,
      focusDeckName: focusDeck?.deckName ?? "Alle Stapel",
      focusTopics: focusDeck?.weakTags.map((item: { tag: any; }) => item.tag) ?? [],
    });
  }

  return {
    id: makeId("plan"),
    targetDate,
    dailyMinutes: minutes,
    newCardsPerDay,
    includeVariants,
    createdAt: now,
    totals: {
      decks: decks.length,
      dueCards: totalDue,
      newCards: totalNew,
      activeVariants: deckSummaries.reduce((sum: any, item: { summary: { activeVariants: any; }; }) => sum + item.summary.activeVariants, 0),
      days: planDays,
    },
    deckSummaries,
    days: dayPlans,
  };
}

