import { AI_CARD_VARIANT_PROMPT_VERSION, AiCardVariantContractError } from "./aiCardVariantContract.ts";
import { getActiveVariants } from "./coreModel.ts";
import { classifyCardEligibility } from "./coreVariantService.ts";
import type { Card, DeckSettings, Note } from "./coreTypes.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

/** At most this many generation requests per action; a further action continues with the next cards. */
export const CARD_VARIANT_BATCH_LIMIT = 50;

/** Errors that would fail every further card the same way; the batch stops instead of repeating them. */
const STOPPING_ERROR_CODES = new Set([
  "unauthorized",
  "auth_unavailable",
  "network_error",
  "missing_openrouter_api_key",
  "openrouter_auth_failed",
  "provider_budget_exhausted",
  "rate_limited",
  "workspace_unavailable",
]);

/**
 * `missing` gives cards without an active variant their first one; `refresh` replaces the variants of cards
 * whose active variants come from an older prompt version, so a further action continues instead of re-rolling.
 */
export type CardVariantBatchMode = "missing" | "refresh";

function needsVariant(card: Card, mode: CardVariantBatchMode) {
  const active = getActiveVariants(card);
  return mode === "missing" ? active.length === 0 : active.some((variant) => variant.meta.promptVersion !== AI_CARD_VARIANT_PROMPT_VERSION);
}

export interface CardVariantBatchSource {
  /** Catalog page of the deck in deck order. */
  listPage(page: number): Promise<{ items: CardCatalogEntry[]; hasMore: boolean }>;
  /** Loads the card bodies (hydrating them when needed) in the given order. */
  openCards(cardIds: string[]): Promise<Array<{ card: Card; note: Note } | null>>;
}

export type CardVariantBatchProgress =
  | { phase: "selecting" }
  | { phase: "generating"; done: number; total: number };

export interface CardVariantBatchResult {
  created: number;
  /** Cards whose generation failed on its own; candidates that cannot get a variant (e.g. cloze) are skipped silently. */
  failed: number;
  /** The action stopped before its end: cancelled by the user or after an error every card would hit. */
  stopped: { reason: "cancelled" } | { reason: "error"; message: string } | null;
  /** More candidate cards remain after this action. */
  hasMore: boolean;
}

/**
 * Creates one AI variant for each of the first candidate cards of a deck, one request after another.
 * Each variant is saved by `generate` right away, so a cancelled or interrupted action keeps its results.
 */
export async function runCardVariantBatch({
  source,
  deckSettings,
  mode = "missing",
  generate,
  signal,
  onProgress = () => {},
  limit = CARD_VARIANT_BATCH_LIMIT,
}: {
  source: CardVariantBatchSource;
  deckSettings: Partial<DeckSettings>;
  mode?: CardVariantBatchMode;
  generate: (cardId: string) => Promise<unknown>;
  signal?: AbortSignal;
  onProgress?: (progress: CardVariantBatchProgress) => void;
  limit?: number;
}): Promise<CardVariantBatchResult> {
  onProgress({ phase: "selecting" });
  const selected: string[] = [];
  let hasMore = false;
  for (let page = 0; ; page += 1) {
    const { items, hasMore: morePages } = await source.listPage(page);
    const candidates = items.filter((entry) => !entry.deletedAt && entry.hasActiveVariants === (mode === "refresh"));
    const bodies = candidates.length ? await source.openCards(candidates.map((entry) => entry.id)) : [];
    candidates.forEach((entry, index) => {
      const body = bodies[index];
      // The catalog can lag behind the body, e.g. a cloud page before the last sync.
      if (body && !needsVariant(body.card, mode)) return;
      // Refreshing replaces the existing variants, so the deck's maximum does not block it.
      if (!body || !classifyCardEligibility(body.note, mode === "refresh" ? { ...body.card, variants: [] } : body.card, deckSettings).eligible) return;
      if (selected.length < limit) selected.push(entry.id);
      else hasMore = true;
    });
    if (selected.length >= limit || !morePages || signal?.aborted) {
      hasMore ||= morePages;
      break;
    }
  }

  const result: CardVariantBatchResult = { created: 0, failed: 0, stopped: null, hasMore };
  for (const [index, cardId] of selected.entries()) {
    onProgress({ phase: "generating", done: index, total: selected.length });
    if (signal?.aborted) {
      result.stopped = { reason: "cancelled" };
      result.hasMore = true;
      break;
    }
    try {
      await generate(cardId);
      result.created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die KI-Variante konnte nicht erstellt werden.";
      if (error instanceof AiCardVariantContractError && STOPPING_ERROR_CODES.has(error.code)) {
        result.stopped = { reason: "error", message };
        result.hasMore = true;
        break;
      }
      result.failed += 1;
    }
  }
  if (!result.stopped) onProgress({ phase: "generating", done: selected.length, total: selected.length });
  return result;
}

function variantCount(count: number) {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "Variante" : "Varianten"}`;
}

/**
 * User-facing summary of a finished action: a full success becomes a toast,
 * anything the user should look at stays in the progress bar until it is closed.
 */
export function summarizeCardVariantBatch(result: CardVariantBatchResult, mode: CardVariantBatchMode = "missing"): { kind: "toast" | "bar"; message: string } {
  if (result.stopped?.reason === "error") {
    return { kind: "bar", message: `Gestoppt nach ${variantCount(result.created)}: ${result.stopped.message}` };
  }
  if (result.failed > 0) {
    return { kind: "bar", message: `${variantCount(result.created)} generiert, ${result.failed} fehlgeschlagen` };
  }
  if (result.stopped?.reason === "cancelled") return { kind: "toast", message: `Abgebrochen. ${variantCount(result.created)} generiert.` };
  if (result.created === 0) return { kind: "toast", message: mode === "refresh" ? "Alle Varianten stammen bereits aus der aktuellen Version." : "Keine Karte ohne Variante gefunden." };
  return { kind: "toast", message: `${variantCount(result.created)} ${mode === "refresh" ? "neu generiert" : "generiert"}.${result.hasMore ? " Für weitere Karten erneut starten." : ""}` };
}
