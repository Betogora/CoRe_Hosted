import { SegmentedDonut, type SegmentedDonutSegment } from "./coreUi.tsx";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getVisibleDeckDepth } from "../deckHierarchy.ts";
import type { DeckLibraryRow, DeckStatusDistribution } from "../libraryModel.ts";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { formatLearningCardCount, LEARNING_STATUS_UI } from "./learningStatusUi.ts";

const DECK_COUNT_DEFINITIONS = [
  { ...LEARNING_STATUS_UI.new, valueKey: "newCards", metric: "new" },
  { ...LEARNING_STATUS_UI.inProgress, valueKey: "inProgressCards", metric: "in-progress" },
  { ...LEARNING_STATUS_UI.due, valueKey: "dueCards", metric: "due" },
] as const;

const DECK_STATUS_DEFINITIONS = [
  { color: LEARNING_STATUS_UI.new.color, valueKey: "newCards", key: "new" },
  { color: LEARNING_STATUS_UI.inProgress.color, valueKey: "inProgressCards", key: "in-progress" },
  { color: LEARNING_STATUS_UI.due.color, valueKey: "dueCards", key: "due" },
  { color: LEARNING_STATUS_UI.learned.color, valueKey: "learnedCards", key: "learned" },
] as const;

const useDeckNameLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function AdaptiveDeckName({ name, className }: { name: string; className: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measurementRef = useRef<HTMLSpanElement>(null);
  const [wraps, setWraps] = useState(false);

  useDeckNameLayoutEffect(() => {
    const container = containerRef.current;
    const measurement = measurementRef.current;
    if (!container || !measurement) return undefined;

    const synchronize = () => {
      const nextWraps = measurement.getBoundingClientRect().width > container.clientWidth + 0.5;
      setWraps((current) => current === nextWraps ? current : nextWraps);
    };
    synchronize();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(synchronize);
    observer?.observe(container);
    document.fonts?.addEventListener("loadingdone", synchronize);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", synchronize);
    };
  }, [name]);

  return (
    <>
      <span
        ref={containerRef}
        className={`core-deck-summary-name min-w-0 flex-1 ${className}`}
        data-deck-name-wrap={wraps ? "true" : "false"}
      >
        {name}
      </span>
      <span ref={measurementRef} className={`core-deck-summary-name-measure ${className}`} aria-hidden="true">{name}</span>
    </>
  );
}

export interface DeckSummaryRowProps {
  row: Pick<DeckLibraryRow, "deck" | "name" | "path" | "depth">;
  learningStatus?: {
    summary: DeckLibraryRow["summary"];
    statusDistribution?: DeckStatusDistribution;
    metricLabels?: "responsive" | "sr-only";
  };
  leadingControl: ReactNode;
  actions: ReactNode;
  studyAction?: ReactNode;
  density?: "default" | "compact" | "responsive";
  className?: string;
  presentation?: "row" | "folder" | "subfolder";
  description?: string;
}

export function DeckSummaryHeader() {
  return (
    <div className="core-deck-summary-container min-w-0" data-testid="deck-summary-header" aria-hidden="true">
      <div data-deck-study-header="true" className="core-deck-summary-responsive core-table-header-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-b border-core-border px-1 core-caption font-semibold text-core-muted">
        <span className="min-w-0 truncate whitespace-nowrap">Stapel</span>
        <div className="core-deck-summary-counts core-deck-summary-metrics grid items-center text-center">
          {DECK_COUNT_DEFINITIONS.map((count) => (
            <span key={count.metric} className="core-deck-summary-count min-w-0">
              <span className="core-deck-summary-metric-label-full">{count.label}</span>
            </span>
          ))}
        </div>
        <span className="core-deck-summary-actions flex items-center justify-end gap-0.5">
          <span className="h-0 w-[5.5rem] shrink-0" />
        </span>
      </div>
    </div>
  );
}

export function DeckSummaryRow({ row, learningStatus, leadingControl, actions, studyAction, density = "default", className = "", presentation = "row", description }: DeckSummaryRowProps) {
  const folder = presentation !== "row";
  const subfolder = presentation === "subfolder";
  const compact = density === "compact";
  const responsive = density === "responsive";
  const compactAtBase = compact || responsive;
  const metricLabels = learningStatus?.metricLabels ?? "responsive";
  const distribution = learningStatus?.statusDistribution;
  const statusSegments: SegmentedDonutSegment[] | null = distribution && !folder ? DECK_STATUS_DEFINITIONS.map((status) => ({
    key: status.key,
    value: distribution[status.valueKey],
    color: status.color,
  })) : null;
  const totalCards = statusSegments?.reduce((total, segment) => total + segment.value, 0) ?? 0;
  const statusLabel = distribution
    ? totalCards > 0
      ? `Gesamtfortschritt für ${row.path}: ${distribution.learnedCards} von ${formatLearningCardCount(totalCards)} gelernt; ${distribution.newCards} neu, ${distribution.inProgressCards} offen und ${distribution.dueCards} fällig.`
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
        className={`pointer-events-none relative z-[1] grid min-h-11 min-w-0 items-center ${folder ? `core-deck-folder-summary${subfolder ? " core-deck-subfolder-summary" : ""}` : gridClass} ${className}`}
        data-deck-study-row={studyAction ? "true" : undefined}
        data-deck-summary-row-content={density === "default" ? "true" : density}
      >
        <div className={`core-deck-summary-leading flex min-w-0 items-center ${compactAtBase ? "gap-1.5" : "gap-2"}`} style={{ paddingInlineStart: folder ? 0 : `calc(${getVisibleDeckDepth(row.depth)} * var(--core-deck-depth-indent, 8px))` }}>
          {leadingControl}
          <DeckAppearanceIcon
            data-deck-icon="true"
            deck={row.deck}
            className={`${folder ? `${subfolder ? "size-8" : "size-11"} rounded-control` : `${compactAtBase ? "size-8" : "size-9"} ${responsive ? "core-deck-summary-icon [&>svg]:size-[15px]" : ""} rounded-round`} bg-core-subtle`}
            iconSize={folder ? subfolder ? 18 : 24 : compact ? 15 : 18}
          />
          <span className={`flex min-w-0 flex-1 ${description && !folder ? "flex-col items-start gap-0.5" : "items-center gap-1"}`}>
            <AdaptiveDeckName
              name={row.name}
              className={`font-semibold text-core-text ${folder ? subfolder ? "core-body-large" : "core-heading-3" : compactAtBase ? "core-body" : "core-body-large"}`}
            />
            {description && !folder ? <span className="core-deck-group-description core-caption text-core-muted">{description}</span> : null}
          </span>
        </div>

        {description && folder ? <p className="core-deck-folder-description core-caption text-core-muted">{description}</p> : null}

        {learningStatus ? (
          <dl className={`core-deck-summary-counts grid grid-cols-3 ${compactAtBase ? "items-center gap-1" : "min-w-[15rem] gap-3"} ${responsive ? "core-deck-summary-metrics" : ""}`} aria-label={`Lernstand für ${row.path}`}>
            {DECK_COUNT_DEFINITIONS.map((count) => (
              <div key={count.metric} className={`core-deck-summary-count ${compactAtBase ? "min-w-4 text-center" : "grid min-w-0 gap-0.5 text-right"}`} data-deck-count={count.metric}>
                <dt className={folder ? "core-caption text-core-muted" : compact || metricLabels === "sr-only" ? "sr-only" : `core-caption font-semibold uppercase tracking-wide text-core-muted ${responsive ? "core-deck-summary-count-label sr-only" : ""}`}>{count.label}</dt>
                <dd className={`core-deck-summary-count-value ${folder ? "core-heading-3 tabular-nums" : compactAtBase ? "core-caption tabular-nums" : "core-body-large"} font-semibold`} style={{ color: count.color }}>{learningStatus.summary[count.valueKey]}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className={`core-deck-summary-actions flex items-center justify-end ${compactAtBase ? "gap-0.5" : "gap-2"}`}>
          {statusSegments ? <SegmentedDonut segments={statusSegments} ariaLabel={statusLabel} size={density} /> : null}
          <span className="inline-flex items-center gap-0">
            {studyAction}
            {actions}
          </span>
        </div>
      </div>
    </div>
  );
}
