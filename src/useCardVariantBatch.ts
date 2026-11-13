import React from "react";
import { createDefaultDeckSettings } from "./coreModel.ts";
import { CARD_VARIANT_CANDIDATE_QUERY, runCardVariantBatch, summarizeCardVariantBatch, type CardVariantBatchMode, type CardVariantBatchSource } from "./cardVariantBatch.ts";
import type { Deck, DeckSettings } from "./coreTypes.ts";
import { collectDeckTreeIds } from "./coreWorkspace.ts";
import { DEFAULT_CARD_TABLE_SORT } from "./libraryModel.ts";
import { catalogEntryFromCard, type CardCatalogEntry } from "./workspaceReplica.ts";
import type { WorkspaceStore } from "./workspaceStore.ts";

interface BatchCardSource {
  queryCardPage(request: { deckId: string; deckIds: readonly string[]; query: string; page: number; pageSize: number; sort: typeof DEFAULT_CARD_TABLE_SORT }): Promise<{ items: CardCatalogEntry[]; hasMore: boolean; totalCount?: number; limitedToLocalCatalog?: boolean }>;
  openCards: CardVariantBatchSource["openCards"];
}

export interface CardVariantBatchView {
  deck: Deck;
  mode: CardVariantBatchMode;
  done: number;
  /** Unknown while the cards are still being checked. */
  total: number | null;
  /** Set once the action ended with something the user should read; the bar then offers closing instead of cancelling. */
  outcome: string | null;
  /** The action ran over selected cards rather than the deck tree. */
  selection: boolean;
}

/** One app-wide AI variant action at a time, running in the open tab; a full success ends with a toast. */
export function useCardVariantBatch({ cards, store, generate, onToast }: {
  cards: BatchCardSource | null;
  /** The workspace now; an action covers its deck with every subdeck. */
  store: Pick<WorkspaceStore, "get">;
  generate: (deckId: string, cardId: string, mode: CardVariantBatchMode) => Promise<unknown>;
  onToast: (message: string, options?: { appearance?: "success" | "neutral" }) => void;
}) {
  const [view, setView] = React.useState<CardVariantBatchView | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const countRef = React.useRef(0);
  /**
   * The candidates of a mode in the deck and its subdecks with CoRe on (the deck itself always: switching CoRe on
   * starts an action before the store has the new setting), as a catalog list of its own so the card lists keep their pages.
   */
  const candidateList = React.useCallback((deck: Deck, mode: CardVariantBatchMode, listId = `variants:${mode}:${deck.id}`) => {
    const decks = store.get().state?.decks ?? [];
    const tree = collectDeckTreeIds(decks, deck.id);
    const deckIds = decks.filter((candidate) => tree.has(candidate.id) && (candidate.id === deck.id || createDefaultDeckSettings(candidate.deckSettings).coreMode === "on")).map((candidate) => candidate.id);
    return { deckId: listId, deckIds, query: CARD_VARIANT_CANDIDATE_QUERY[mode] };
  }, [store]);

  /** Runs over the deck's cards, or over `cardIds` (the selected cards of the card management, KV4) in their order. */
  const start = React.useCallback((deck: Deck, { mode = "missing", deckSettings = deck.deckSettings, cardIds }: { mode?: CardVariantBatchMode; deckSettings?: Partial<DeckSettings>; cardIds?: readonly string[] } = {}) => {
    if (!cards || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ deck, mode, done: 0, total: null, outcome: null, selection: Boolean(cardIds) });
    const decksById = new Map((store.get().state?.decks ?? []).map((candidate) => [candidate.id, candidate]));
    void runCardVariantBatch({
      source: {
        listPage: cardIds
          ? async (page) => {
            const bodies = await cards.openCards(cardIds.slice(page * 50, (page + 1) * 50));
            return { items: bodies.flatMap((body) => body ? [catalogEntryFromCard(body.card, body.note)] : []), hasMore: (page + 1) * 50 < cardIds.length };
          }
          : (page) => cards.queryCardPage({ ...candidateList(deck, mode), page, pageSize: 50, sort: DEFAULT_CARD_TABLE_SORT }),
        openCards: cards.openCards,
      },
      settingsFor: (card) => card.deckId === deck.id ? deckSettings : decksById.get(card.deckId)?.deckSettings ?? deckSettings,
      mode,
      generate: (cardId) => generate(deck.id, cardId, mode),
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.phase === "generating") setView((current) => current && { ...current, done: progress.done, total: progress.total });
      },
    }).then((result) => {
      const summary = summarizeCardVariantBatch(result, mode);
      if (summary.kind === "bar") {
        setView((current) => current && { ...current, outcome: summary.message });
        return;
      }
      setView(null);
      onToast(summary.message, { appearance: result.created > 0 && !result.stopped ? "success" : "neutral" });
    }, (error: unknown) => {
      setView((current) => current && { ...current, outcome: error instanceof Error ? error.message : "Die Karten konnten nicht geladen werden." });
    }).finally(() => {
      controllerRef.current = null;
    });
  }, [cards, candidateList, generate, onToast, store]);

  /**
   * Cards of the deck and its subdecks with CoRe on that have no active variant, as the deck settings show them; null
   * without a catalog or when only a partial local catalog answered. Each count is a list of its own, so no total is reused.
   */
  const countWithoutVariant = React.useCallback(async (deck: Deck) => {
    if (!cards) return null;
    countRef.current += 1;
    const page = await cards.queryCardPage({ ...candidateList(deck, "missing", `variants:count:${deck.id}:${countRef.current}`), page: 0, pageSize: 1, sort: DEFAULT_CARD_TABLE_SORT });
    return page.limitedToLocalCatalog ? null : page.totalCount ?? null;
  }, [cards, candidateList]);

  const cancel = React.useCallback(() => controllerRef.current?.abort(), []);
  const dismiss = React.useCallback(() => setView(null), []);

  return { batch: view, running: Boolean(view && !view.outcome), start, cancel, dismiss, countWithoutVariant };
}
