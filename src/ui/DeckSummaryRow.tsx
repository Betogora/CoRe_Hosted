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
}

export function DeckSummaryRow({ row, summary, progress, leadingControl, actions }: DeckSummaryRowProps) {
  return (
    <div
      className="pointer-events-none relative z-[1] grid min-h-11 min-w-0 grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] items-center gap-x-3 px-2"
      data-deck-summary-row-content="true"
    >
      <div className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: Math.min(row.depth, 6) * 9 }}>
        {leadingControl}
        <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-9 rounded-full bg-[var(--core-surface-muted)]" iconSize={18} />
        <span className="min-w-0">
          <span className="block truncate core-body-large font-semibold text-[var(--core-text)]">{row.name}</span>
          {row.depth > 0 ? <span className="mt-0.5 block truncate core-caption text-[var(--core-text-muted)]">{row.path}</span> : null}
        </span>
      </div>

      <dl className="grid min-w-[15rem] grid-cols-3 gap-3" aria-label={`Lernstand für ${row.path}`}>
        {DECK_COUNT_DEFINITIONS.map((count) => (
          <div key={count.metric} className="grid min-w-0 gap-0.5 text-right" data-deck-count={count.metric}>
            <dt className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">{count.label}</dt>
            <dd className="core-body-large font-semibold" style={{ color: count.color }}>{summary[count.valueKey]}</dd>
          </div>
        ))}
      </dl>

      <div className="pointer-events-auto flex items-center justify-end gap-2">
        <DonutValue value={progress} />
        {actions}
      </div>
    </div>
  );
}
