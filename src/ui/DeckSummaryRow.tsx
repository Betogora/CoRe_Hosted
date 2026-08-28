import type { ReactNode } from "react";
import type { DeckLibraryRow, DeckStatusDistribution } from "../libraryModel.ts";
import { SegmentedDonut, type SegmentedDonutSegment } from "./coreUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { formatLearningCardCount, LEARNING_STATUS_UI } from "./learningStatusUi.ts";

const DECK_COUNT_DEFINITIONS = [
  { ...LEARNING_STATUS_UI.new, valueKey: "newCards", metric: "new", shortLabel: "N" },
  { ...LEARNING_STATUS_UI.inProgress, valueKey: "inProgressCards", metric: "in-progress", shortLabel: "O" },
  { ...LEARNING_STATUS_UI.due, valueKey: "dueCards", metric: "due", shortLabel: "F" },
] as const;

const DECK_STATUS_DEFINITIONS = [
  { color: LEARNING_STATUS_UI.new.color, valueKey: "newCards", key: "new" },
  { color: LEARNING_STATUS_UI.inProgress.color, valueKey: "inProgressCards", key: "in-progress" },
  { color: LEARNING_STATUS_UI.due.color, valueKey: "dueCards", key: "due" },
  { color: LEARNING_STATUS_UI.learned.color, valueKey: "learnedCards", key: "learned" },
] as const;

const DECK_DEPTH_INDENT_PX = 16;

export interface DeckSummaryRowProps {
  row: Pick<DeckLibraryRow, "deck" | "name" | "path" | "depth">;
  learningStatus?: {
    summary: DeckLibraryRow["summary"];
    statusDistribution: DeckStatusDistribution;
    metricLabels?: "responsive" | "sr-only";
  };
  leadingControl: ReactNode;
  actions: ReactNode;
  density?: "default" | "compact" | "responsive";
  className?: string;
}

export function DeckSummaryHeader() {
  return (
    <div className="core-deck-summary-container min-w-0" data-testid="deck-summary-header" aria-hidden="true">
      <div className="core-deck-summary-responsive core-table-header-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-b border-[var(--core-border)] px-1 core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">
        <span className="min-w-0 truncate whitespace-nowrap">Stapel</span>
        <div className="core-deck-summary-counts core-deck-summary-metrics grid items-center text-center">
          {DECK_COUNT_DEFINITIONS.map((count) => (
            <span key={count.metric} className="core-deck-summary-count min-w-0">
              <span className="core-deck-summary-metric-label-full">{count.label}</span>
              <span className="core-deck-summary-metric-label-short">{count.shortLabel}</span>
            </span>
          ))}
        </div>
        <span className="core-deck-summary-actions flex items-center justify-end gap-0.5">
          <span className="core-deck-summary-header-donut h-0 w-8 shrink-0" />
          <span className="h-0 w-11 shrink-0" />
        </span>
      </div>
    </div>
  );
}

export function DeckSummaryRow({ row, learningStatus, leadingControl, actions, density = "default", className = "" }: DeckSummaryRowProps) {
  const compact = density === "compact";
  const responsive = density === "responsive";
  const compactAtBase = compact || responsive;
  const metricLabels = learningStatus?.metricLabels ?? "responsive";
  const statusSegments: SegmentedDonutSegment[] | null = learningStatus ? DECK_STATUS_DEFINITIONS.map((status) => ({
    key: status.key,
    value: learningStatus.statusDistribution[status.valueKey],
    color: status.color,
  })) : null;
  const totalCards = statusSegments?.reduce((total, segment) => total + segment.value, 0) ?? 0;
  const statusLabel = learningStatus
    ? totalCards > 0
      ? `Gesamtfortschritt für ${row.path}: ${learningStatus.statusDistribution.learnedCards} von ${formatLearningCardCount(totalCards)} gelernt; ${learningStatus.statusDistribution.newCards} neu, ${learningStatus.statusDistribution.inProgressCards} offen und ${learningStatus.statusDistribution.dueCards} fällig.`
      : `Keine aktiven Karten für ${row.path}.`
    : "";
  const gridClass = learningStatus
    ? compact
      ? "grid-cols-[minmax(5rem,1fr)_auto_auto] gap-1 px-1"
      : responsive
        ? "core-deck-summary-responsive grid-cols-[minmax(0,1fr)_auto_auto] gap-1 px-1"
        : "grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] gap-x-3 px-2"
    : compact
      ? "grid-cols-[minmax(5rem,1fr)_auto] gap-1 px-1"
      : responsive
        ? "core-deck-summary-responsive grid-cols-[minmax(0,1fr)_auto] gap-1 px-1"
        : "grid-cols-[minmax(13rem,1fr)_auto] gap-x-3 px-2";

  return (
    <div className={responsive ? "core-deck-summary-container min-w-0" : "min-w-0"}>
      <div
        className={`pointer-events-none relative z-[1] grid min-h-11 min-w-0 items-center ${gridClass} ${className}`}
        data-deck-summary-row-content={density === "default" ? "true" : density}
      >
        <div className={`core-deck-summary-leading flex min-w-0 items-center ${compactAtBase ? "gap-1.5" : "gap-2"}`} style={{ paddingInlineStart: Math.min(row.depth, 6) * DECK_DEPTH_INDENT_PX }}>
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

        {learningStatus ? (
          <dl className={`core-deck-summary-counts grid grid-cols-3 ${compactAtBase ? "items-center gap-1" : "min-w-[15rem] gap-3"} ${responsive ? "core-deck-summary-metrics" : ""}`} aria-label={`Lernstand für ${row.path}`}>
            {DECK_COUNT_DEFINITIONS.map((count) => (
              <div key={count.metric} className={`core-deck-summary-count ${compactAtBase ? "min-w-4 text-center" : "grid min-w-0 gap-0.5 text-right"}`} data-deck-count={count.metric}>
                <dt className={compact || metricLabels === "sr-only" ? "sr-only" : `core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)] ${responsive ? "core-deck-summary-count-label sr-only" : ""}`}>{count.label}</dt>
                <dd className={`core-deck-summary-count-value ${compactAtBase ? "core-caption tabular-nums" : "core-body-large"} font-semibold`} style={{ color: count.color }}>{learningStatus.summary[count.valueKey]}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className={`core-deck-summary-actions flex items-center justify-end ${compactAtBase ? "gap-0.5" : "gap-2"}`}>
          {statusSegments ? <SegmentedDonut segments={statusSegments} ariaLabel={statusLabel} size={density} /> : null}
          {actions}
        </div>
      </div>
    </div>
  );
}
