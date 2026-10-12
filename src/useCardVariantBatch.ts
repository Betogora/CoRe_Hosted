import React from "react";
import { runCardVariantBatch, summarizeCardVariantBatch, type CardVariantBatchMode, type CardVariantBatchSource } from "./cardVariantBatch.ts";
import type { Deck, DeckSettings } from "./coreTypes.ts";
import { DEFAULT_CARD_TABLE_SORT } from "./libraryModel.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

interface BatchCardSource {
  queryCardPage(request: { deckId: string; page: number; pageSize: number; sort: typeof DEFAULT_CARD_TABLE_SORT }): Promise<{ items: CardCatalogEntry[]; hasMore: boolean }>;
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
}

/** One app-wide AI variant action at a time, running in the open tab; a full success ends with a toast. */
export function useCardVariantBatch({ cards, generate, onToast }: {
  cards: BatchCardSource | null;
  generate: (deckId: string, cardId: string, mode: CardVariantBatchMode) => Promise<unknown>;
  onToast: (message: string, options?: { appearance?: "success" | "neutral" }) => void;
}) {
  const [view, setView] = React.useState<CardVariantBatchView | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const start = React.useCallback((deck: Deck, { mode = "missing", deckSettings = deck.deckSettings }: { mode?: CardVariantBatchMode; deckSettings?: Partial<DeckSettings> } = {}) => {
    if (!cards || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ deck, mode, done: 0, total: null, outcome: null });
    void runCardVariantBatch({
      source: {
        listPage: (page) => cards.queryCardPage({ deckId: deck.id, page, pageSize: 50, sort: DEFAULT_CARD_TABLE_SORT }),
        openCards: cards.openCards,
      },
      deckSettings,
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
  }, [cards, generate, onToast]);

  const cancel = React.useCallback(() => controllerRef.current?.abort(), []);
  const dismiss = React.useCallback(() => setView(null), []);

  return { batch: view, running: Boolean(view && !view.outcome), start, cancel, dismiss };
}
