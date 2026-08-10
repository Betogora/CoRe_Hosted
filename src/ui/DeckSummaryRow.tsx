import type { ReactNode } from "react";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { DonutValue } from "./coreUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { LEARNING_STATUS_UI } from "./learningStatusUi.ts";

const DECK_COUNT_DEFINITIONS = [
  { ...LEARNING_STATUS_UI.new, valueKey: "newCards", metric: "new" },
  { ...LEARNING_STATUS_UI.inProgress, valueKey: "inProgressCards", metric: "in-progress" },
  { ...LEARNING_STATUS_UI.due, valueKey: "dueCards", metric: "due" },
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
    <div className={responsive ? "core-deck-summary-container min-w-0" : "min-w-0"}>
      <div
        className={`pointer-events-none relative z-[1] grid min-h-11 min-w-0 items-center ${compact ? "grid-cols-[minmax(5rem,1fr)_auto_auto] gap-1 px-1" : responsive ? "core-deck-summary-responsive grid-cols-[minmax(0,1fr)_auto_auto] gap-1 px-1" : "grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] gap-x-3 px-2"} ${className}`}
        data-deck-summary-row-content={density === "default" ? "true" : density}
      >
        <div className={`core-deck-summary-leading flex min-w-0 items-center ${compactAtBase ? "gap-1.5" : "gap-2"}`} style={{ paddingInlineStart: Math.min(row.depth, 6) * 9 }}>
          {leadingControl}
          <DeckAppearanceIcon
            data-deck-icon="true"
            deck={row.deck}
            className={`${compactAtBase ? "size-8" : "size-9"} ${responsive ? "core-deck-summary-icon [&>svg]:size-[15px]" : ""} rounded-full bg-[var(--core-surface-muted)]`}
            iconSize={compact ? 15 : 18}
          />
          <span className="min-w-0 flex-1">
            <span className={`core-deck-summary-name block truncate whitespace-nowrap font-semibold text-[var(--core-text)] ${compactAtBase ? "core-body" : "core-body-large"}`}>{row.name}</span>
          </span>
        </div>

        <dl className={`core-deck-summary-counts grid grid-cols-3 ${compactAtBase ? "items-center gap-1" : "min-w-[15rem] gap-3"}`} aria-label={`Lernstand für ${row.path}`}>
          {DECK_COUNT_DEFINITIONS.map((count) => (
            <div key={count.metric} className={`core-deck-summary-count ${compactAtBase ? "min-w-4 text-center" : "grid min-w-0 gap-0.5 text-right"}`} data-deck-count={count.metric}>
              <dt className={compact ? "sr-only" : `core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)] ${responsive ? "core-deck-summary-count-label sr-only" : ""}`}>{count.label}</dt>
              <dd className={`core-deck-summary-count-value ${compactAtBase ? "core-caption tabular-nums" : "core-body-large"} font-semibold`} style={{ color: count.color }}>{summary[count.valueKey]}</dd>
            </div>
          ))}
        </dl>

        <div className={`core-deck-summary-actions flex items-center justify-end ${compactAtBase ? "gap-0.5" : "gap-2"}`}>
          <DonutValue value={progress} size={density} />
          {actions}
        </div>
      </div>
    </div>
  );
}
