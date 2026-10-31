import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DECK_DEPTH_INDENT_PX, getVisibleDeckDepth } from "../deckHierarchy.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { LEARNING_STATUS_UI } from "./learningStatusUi.ts";

const DECK_COUNT_DEFINITIONS = [
  { ...LEARNING_STATUS_UI.new, valueKey: "newCards", metric: "new" },
  { ...LEARNING_STATUS_UI.inProgress, valueKey: "inProgressCards", metric: "in-progress" },
  { ...LEARNING_STATUS_UI.due, valueKey: "dueCards", metric: "due" },
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
    metricLabels?: "responsive" | "sr-only";
  };
  leadingControl: ReactNode;
  actions: ReactNode;
  studyAction?: ReactNode;
  density?: "default" | "compact" | "responsive";
  /** `folder` and `subfolder` project the same row as a tile of the deck tile view. */
  presentation?: "row" | "folder" | "subfolder";
  className?: string;
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
          <span className="core-deck-summary-actions-spacer h-0 shrink-0" />
        </span>
      </div>
    </div>
  );
}

export function DeckSummaryRow({ row, learningStatus, leadingControl, actions, studyAction, density = "default", presentation = "row", className = "" }: DeckSummaryRowProps) {
  const folder = presentation !== "row";
  const subfolder = presentation === "subfolder";
  const compact = density === "compact";
  const responsive = density === "responsive";
  const compactAtBase = compact || responsive;
  const metricLabels = learningStatus?.metricLabels ?? "responsive";
  const gridClass = folder
    ? `core-deck-folder-summary${subfolder ? " core-deck-subfolder-summary" : ""}`
    : learningStatus
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
  const labelClass = folder
    ? "core-caption text-core-muted"
    : compact || metricLabels === "sr-only"
      ? "sr-only"
      : `core-caption font-semibold text-core-muted ${responsive ? "core-deck-summary-count-label sr-only" : ""}`;

  return (
    <div className={responsive ? "core-deck-summary-container min-w-0" : "min-w-0"}>
      <div
        className={`pointer-events-none relative z-[1] grid min-h-control min-w-0 items-center ${gridClass} ${className}`}
        data-deck-study-row={studyAction ? "true" : undefined}
        data-deck-summary-row-content={density === "default" ? "true" : density}
      >
        <div className={`core-deck-summary-leading flex min-w-0 items-center ${compactAtBase ? "gap-1.5" : "gap-2"}`} style={{ paddingInlineStart: folder ? 0 : `calc(${getVisibleDeckDepth(row.depth)} * var(--core-deck-depth-indent, ${DECK_DEPTH_INDENT_PX}px))` }}>
          {leadingControl}
          <DeckAppearanceIcon
            data-deck-icon="true"
            deck={row.deck}
            className={`${folder ? subfolder ? "size-8" : "size-11" : compactAtBase ? "size-8" : "size-9"} ${responsive && !folder ? "core-deck-summary-icon [&>svg]:size-[15px]" : ""} rounded-control bg-core-subtle`}
            iconSize={folder ? subfolder ? 18 : 24 : compact ? 15 : 18}
          />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <AdaptiveDeckName
              name={row.name}
              className={`font-semibold text-core-text ${folder ? subfolder ? "core-body-large" : "core-heading-3" : compactAtBase ? "core-body" : "core-body-large"}`}
            />
          </span>
        </div>

        {learningStatus ? (
          <dl className={`core-deck-summary-counts grid grid-cols-3 ${compactAtBase ? "items-center gap-1" : "min-w-[15rem] gap-3"} ${responsive ? "core-deck-summary-metrics" : ""}`} aria-label={`Lernstand für ${row.path}`}>
            {DECK_COUNT_DEFINITIONS.map((count) => {
              const value = learningStatus.summary[count.valueKey];
              return (
                <div key={count.metric} className={`core-deck-summary-count ${compactAtBase ? "min-w-4 text-center" : "grid min-w-0 gap-0.5 text-right"}`} data-deck-count={count.metric}>
                  <dt className={labelClass}>{count.label}</dt>
                  <dd className="core-deck-summary-count-value core-deck-count-badge" data-count-empty={value === 0 ? "true" : undefined} style={{ "--core-deck-count-color": count.color } as CSSProperties}>{value}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        <div className={`core-deck-summary-actions flex items-center justify-end ${compactAtBase ? "gap-0.5" : "gap-2"}`}>
          <span className="inline-flex items-center gap-1">
            {studyAction}
            {actions}
          </span>
        </div>
      </div>
    </div>
  );
}
