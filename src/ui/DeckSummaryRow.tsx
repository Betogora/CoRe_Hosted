import type { ReactNode } from "react";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { DonutValue } from "./coreUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";

const DECK_COUNT_DEFINITIONS = [
  { label: "Neu", valueKey: "newCards", color: "var(--core-deck-new-text)", metric: "new" },
  { label: "Fällig", valueKey: "dueCards", color: "var(--core-deck-due-text)", metric: "due" },
  { label: "Gesamt", valueKey: "totalCards", color: "var(--core-deck-total-text)", metric: "total" },
] as const;

export interface DeckSummaryRowProps {
  row: Pick<DeckLibraryRow, "deck" | "name" | "path" | "depth">;
  summary: DeckLibraryRow["summary"];
  progress: number;
  leadingControl: ReactNode;
  actions: ReactNode;
  density?: "default" | "compact" | "responsive";
  className?: string;
}

export function DeckSummaryRow({ row, summary, progress, leadingControl, actions, density = "default", className = "" }: DeckSummaryRowProps) {
  const compact = density === "compact";
  const responsive = density === "responsive";
  const compactAtBase = compact || responsive;

  return (
    <div
      className={`pointer-events-none relative z-[1] grid min-h-11 min-w-0 items-center ${compact ? "grid-cols-[minmax(5rem,1fr)_auto_auto] gap-1 px-1" : responsive ? "grid-cols-[minmax(0,1fr)_auto_auto] gap-1 px-1" : "grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] gap-x-3 px-2"} ${responsive ? "md:gap-x-2 md:px-2" : ""} ${className}`}
      data-deck-summary-row-content={density === "default" ? "true" : density}
    >
      <div className={`flex min-w-0 items-center ${compactAtBase ? "gap-1.5" : "gap-2"} ${responsive ? "md:gap-2" : ""}`} style={{ paddingInlineStart: Math.min(row.depth, 6) * 9 }}>
        {leadingControl}
        <DeckAppearanceIcon
          data-deck-icon="true"
          deck={row.deck}
          className={`${compactAtBase ? "size-8" : "size-9"} rounded-full bg-[var(--core-surface-muted)] ${responsive ? "[&>svg]:size-[15px] md:size-9 md:[&>svg]:size-[18px]" : ""}`}
          iconSize={compact ? 15 : 18}
        />
        <span className="min-w-0 flex-1">
          <span className={`block truncate whitespace-nowrap font-semibold text-[var(--core-text)] ${compactAtBase ? "core-body" : "core-body-large"} ${responsive ? "md:text-base md:leading-6" : ""}`}>{row.name}</span>
        </span>
      </div>

      <dl className={`grid grid-cols-3 ${compactAtBase ? "items-center gap-1" : "min-w-[15rem] gap-3"} ${responsive ? "md:gap-2" : ""}`} aria-label={`Lernstand für ${row.path}`}>
        {DECK_COUNT_DEFINITIONS.map((count) => (
          <div key={count.metric} className={`${compactAtBase ? "min-w-4 text-center" : "grid min-w-0 gap-0.5 text-right"} ${responsive ? "md:grid md:min-w-0 md:gap-0.5 md:text-right" : ""}`} data-deck-count={count.metric}>
            <dt className={compact ? "sr-only" : `core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)] ${responsive ? "sr-only md:not-sr-only" : ""}`}>{count.label}</dt>
            <dd className={`${compactAtBase ? "core-caption tabular-nums" : "core-body-large"} font-semibold ${responsive ? "md:text-base md:leading-6 md:[font-variant-numeric:normal]" : ""}`} style={{ color: count.color }}>{summary[count.valueKey]}</dd>
          </div>
        ))}
      </dl>

      <div className={`flex items-center justify-end ${compactAtBase ? "gap-0.5" : "gap-2"} ${responsive ? "md:gap-2" : ""}`}>
        <DonutValue value={progress} size={density} />
        {actions}
      </div>
    </div>
  );
}
