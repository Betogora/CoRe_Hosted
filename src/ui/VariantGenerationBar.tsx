import { X } from "lucide-react";
import { ActionButton } from "./actionUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import type { Deck } from "../coreTypes.ts";

interface VariantGenerationBarProps {
  deck: Deck;
  /** Action name before the count, e.g. "Varianten neu generieren". */
  title?: string;
  done: number;
  /** Unknown while the cards are still being checked. */
  total: number | null;
  /** Final message of an action that needs attention; replaces the count and offers closing. */
  outcome?: string | null;
  onCancel: () => void;
  onClose: () => void;
}

/** App-wide two-line progress of an AI variant action: deck, count and action, then the bar. */
export function VariantGenerationBar({ deck, title = "Varianten generieren", done, total, outcome = null, onCancel, onClose }: VariantGenerationBarProps) {
  const progress = outcome ? 1 : total ? done / total : 0;
  const label = outcome ?? (total === null ? `${title} …` : `${title} ${done.toLocaleString("de-DE")} von ${total.toLocaleString("de-DE")}`);
  return (
    <aside
      aria-label={`Varianten für ${deck.name}`}
      data-testid="variant-generation-bar"
      className="core-overlay fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-[50dvw] z-40 grid w-[min(42rem,calc(100dvw-2rem))] -translate-x-1/2 gap-2 rounded-panel px-3 py-2.5 xl:bottom-4 xl:left-[calc(50dvw+7.5rem)] xl:w-[min(42rem,calc(100dvw-19rem))]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <DeckAppearanceIcon deck={deck} className="size-8" iconSize={16} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate core-body font-semibold text-core-text" role="status" aria-live="polite" title={label}>{label}</p>
        {outcome
          ? <ActionButton type="button" variant="secondary" icon={X} aria-label="Schließen" className="shrink-0 max-sm:px-2.5" onClick={onClose}><span className="hidden sm:inline">Schließen</span></ActionButton>
          : <ActionButton type="button" variant="secondary" icon={X} aria-label="Abbrechen" className="shrink-0 max-sm:px-2.5" onClick={onCancel}><span className="hidden sm:inline">Abbrechen</span></ActionButton>}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-round bg-core-subtle"
        role="progressbar"
        aria-label="Fortschritt der Variantengenerierung"
        aria-valuemin={0}
        aria-valuemax={total ?? 0}
        aria-valuenow={done}
      >
        <div className="h-full rounded-round bg-core-action transition-[width] duration-300 ease-out" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
      </div>
    </aside>
  );
}
