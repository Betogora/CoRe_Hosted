import React from "react";
import { ArrowLeft, ChevronDown, ChevronRight, PanelsTopLeft, Play, X } from "lucide-react";
import { createPortal } from "react-dom";
import { createDeckPlacementValidator, type DeckMutationResult } from "../coreWorkspace.ts";
import type { CoreMode, Deck } from "../coreTypes.ts";
import { getVisibleDeckDepth } from "../deckHierarchy.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { DeckOptionsMenu } from "./DeckOptionsMenu.tsx";
import { DeckSummaryHeader, DeckSummaryRow } from "./DeckSummaryRow.tsx";
import { ActionButton, IconButton } from "./actionUi.tsx";
import { SoftPanel } from "./coreUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";
import { getDeckAppearance } from "./deckAppearance.tsx";
import { useStableCallback } from "./useStableCallback.ts";

export type DeckTreeView = "list" | "tiles";

export interface DeckTreeProps {
  rows: DeckLibraryRow[];
  mode: "dashboard" | "learn";
  /** `list` groups every main deck in its own card; `tiles` shows main decks as tiles with an inline branch panel. */
  view?: DeckTreeView;
  headerAction?: React.ReactNode;
  /** Caller-owned area below the collection, e.g. the quick-create form in Lernen. */
  contentAfterRows?: React.ReactNode;
  onActivate: (row: DeckLibraryRow) => void;
  onStudy: (row: DeckLibraryRow) => void;
  onOpenSettings: (deckId: string) => void;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onDeckExpansionChange: (deckId: string | readonly string[], expanded: boolean) => unknown;
}

interface DropIntent {
  targetDeckId: string | null;
  error: string | null;
}

interface PointerDrag {
  pointerId: number;
  deckId: string;
  startX: number;
  startY: number;
  dragging: boolean;
  captureElement: HTMLButtonElement;
  targetElement: HTMLElement | null;
  validatePlacement: ReturnType<typeof createDeckPlacementValidator> | null;
  intent: DropIntent | null;
}

interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragFocusLayout {
  sourceRect: ViewportRect | null;
  targetRect: ViewportRect | null;
  topLevelTarget: { placement: TopLevelPlacement; rect: ViewportRect } | null;
}

type TopLevelPlacement = "top-bar" | "bottom-bar";

const POINTER_DRAG_THRESHOLD = 6;

function viewportRect(element: Element | null, inset = 0): ViewportRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const width = rect.width - inset * 2;
  const height = rect.height - inset * 2;
  return width > 0 && height > 0 ? { x: rect.left + inset, y: rect.top + inset, width, height } : null;
}

function sameRect(left: ViewportRect | null, right: ViewportRect | null) {
  return left === right || Boolean(left && right
    && left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height);
}

function sameDragFocusLayout(left: DragFocusLayout | null, right: DragFocusLayout) {
  return Boolean(left
    && sameRect(left.sourceRect, right.sourceRect)
    && sameRect(left.targetRect, right.targetRect)
    && left.topLevelTarget?.placement === right.topLevelTarget?.placement
    && sameRect(left.topLevelTarget?.rect ?? null, right.topLevelTarget?.rect ?? null));
}

function expandedRect(rect: ViewportRect | null, amount: number) {
  return rect ? {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  } : null;
}

function DeckDragFocusOverlay({ maskId, holes }: { maskId: string; holes: ViewportRect[] }) {
  return (
    <svg
      className="pointer-events-none fixed inset-0 size-full"
      style={{ zIndex: 70 }}
      aria-hidden="true"
      data-testid="deck-drag-focus-overlay"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white" />
          {holes.map((hole, index) => (
            <rect key={index} x={hole.x} y={hole.y} width={hole.width} height={hole.height} fill="black" data-drag-focus-hole="true" />
          ))}
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="var(--core-backdrop)" mask={`url(#${maskId})`} />
    </svg>
  );
}

function getVisibleRows(rows: DeckLibraryRow[], collapsedDeckIds: Set<string>) {
  const visibleRows: DeckLibraryRow[] = [];
  let collapsedDepth: number | null = null;

  for (const row of rows) {
    if (collapsedDepth !== null && row.depth > collapsedDepth) continue;
    collapsedDepth = null;
    visibleRows.push(row);
    if (collapsedDeckIds.has(row.id)) collapsedDepth = row.depth;
  }

  return visibleRows;
}

interface DeckTreeRowProps {
  row: DeckLibraryRow;
  mode: DeckTreeProps["mode"];
  presentation: "row" | "folder" | "subfolder";
  decks: Deck[];
  isCollapsed: boolean;
  isSelected: boolean;
  isDragged: boolean;
  dropState: "valid" | "invalid" | undefined;
  onToggle: (deckId: string) => void;
  onActivate: (row: DeckLibraryRow) => void;
  onOpenContent: (row: DeckLibraryRow) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, row: DeckLibraryRow) => void;
  onKeyDown: () => void;
  onStudy: (row: DeckLibraryRow) => void;
  onOpenSettings: DeckTreeProps["onOpenSettings"];
  onSetCoreMode: DeckTreeProps["onSetDeckCoreMode"];
  onMoveDeck: DeckTreeProps["onMoveDeck"];
}

/** One deck row; memoized so sync status, drag hover on other rows or parent renders do not repaint the whole tree. */
const DeckTreeRow = React.memo(function DeckTreeRow({ row, mode, presentation, decks, isCollapsed, isSelected, isDragged, dropState, onToggle, onActivate, onOpenContent, onPointerDown, onKeyDown, onStudy, onOpenSettings, onSetCoreMode, onMoveDeck }: DeckTreeRowProps) {
  const tile = presentation !== "row";
  const activationLabel = tile ? row.hasChildren ? `Unterstapel von ${row.path} öffnen` : `Stapel ${row.path} öffnen` : `Inhalte von ${row.path} öffnen`;
  const collapseControl = row.hasChildren ? (
    <button
      type="button"
      onClick={() => onToggle(row.id)}
      className="pointer-events-auto relative -me-2 grid size-control shrink-0 place-items-center rounded-inset text-core-action before:pointer-events-none before:absolute before:inset-x-1.5 before:inset-y-1 before:rounded-inset before:transition-colors before:content-[''] hover:before:bg-core-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus [&>svg]:relative [&>svg]:z-[1]"
      aria-label={isCollapsed ? `Unterstapel von ${row.path} anzeigen` : `Unterstapel von ${row.path} ausblenden`}
      aria-expanded={!isCollapsed}
    >
      {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
    </button>
  ) : <span className="-me-2 size-control shrink-0" aria-hidden="true" />;
  const studyAction = (
    <CoreTooltip label={`${row.name} lernen`} deckAppearance={getDeckAppearance(row.deck)}>
      <IconButton label={`${row.path} lernen`} icon={Play} variant={tile ? "secondary" : "ghost"} className={`${tile ? "" : "core-deck-icon-action "}pointer-events-auto`} onClick={() => onStudy(row)} />
    </CoreTooltip>
  );
  const optionsMenu = <DeckOptionsMenu row={row} decks={decks} onSetCoreMode={onSetCoreMode} onOpenSettings={onOpenSettings} onMoveDeck={onMoveDeck} />;

  return (
    <div
      data-testid={`${mode}-deck-row-${row.id}`}
      data-deck-row="true"
      data-deck-id={row.id}
      data-deck-depth={getVisibleDeckDepth(row.depth)}
      data-drop-state={dropState}
      data-drag-state={isDragged ? "active" : undefined}
      data-selected={isSelected ? "true" : undefined}
      className={`core-deck-summary-row relative min-w-0 select-none${tile ? presentation === "subfolder" ? " core-deck-subfolder-card" : " core-deck-folder-card" : ""}`}
    >
      <button
        type="button"
        onClick={() => onActivate(row)}
        onPointerDown={(event) => onPointerDown(event, row)}
        onKeyDown={onKeyDown}
        aria-label={activationLabel}
        data-deck-drag-source="true"
        data-deck-row-activation="true"
        className={`absolute inset-0 z-0 text-left transition-colors hover:bg-[var(--core-focus-ring-soft)] ${isDragged ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <span className="sr-only">{activationLabel}</span>
      </button>

      <DeckSummaryRow
        row={row}
        learningStatus={{ summary: row.summary, metricLabels: "sr-only" }}
        studyAction={tile ? undefined : studyAction}
        leadingControl={collapseControl}
        actions={tile ? <>
          <ActionButton variant="secondary" icon={PanelsTopLeft} className="pointer-events-auto" aria-label={`Inhalte von ${row.path} öffnen`} onClick={() => onOpenContent(row)}>Inhalte</ActionButton>
          {studyAction}
          {optionsMenu}
        </> : optionsMenu}
        density="responsive"
        presentation={presentation}
      />
    </div>
  );
});

export function DeckTree({ rows, mode, view = "list", headerAction, contentAfterRows, onActivate, onStudy, onOpenSettings, onSetDeckCoreMode, onMoveDeck, collapsedDeckIds, onDeckExpansionChange }: DeckTreeProps) {
  const [draggedDeckId, setDraggedDeckId] = React.useState<string | null>(null);
  const [dropIntent, setDropIntent] = React.useState<DropIntent | null>(null);
  const [dragFocusLayout, setDragFocusLayout] = React.useState<DragFocusLayout | null>(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const pointerDragRef = React.useRef<PointerDrag | null>(null);
  const suppressedClickDeckIdRef = React.useRef<string | null>(null);
  const dragMaskId = React.useId().replaceAll(":", "");
  const decks = React.useMemo(() => rows.map((row) => row.deck), [rows]);
  const [collapsedDeckIdSet, setCollapsedDeckIdSet] = React.useState(() => new Set(collapsedDeckIds));
  const visibleRows = React.useMemo(() => getVisibleRows(rows, collapsedDeckIdSet), [collapsedDeckIdSet, rows]);
  const rowGroups = React.useMemo(() => {
    const groups: { root: DeckLibraryRow; rows: DeckLibraryRow[] }[] = [];
    for (const row of visibleRows) {
      if (row.depth === 0) groups.push({ root: row, rows: [] });
      groups[groups.length - 1]?.rows.push(row);
    }
    return groups;
  }, [visibleRows]);
  const parentDeckIds = React.useMemo(() => rows.filter((row) => row.hasChildren).map((row) => row.id), [rows]);
  const anyCollapsed = parentDeckIds.some((deckId) => collapsedDeckIdSet.has(deckId));

  // Tile view: the opened folder and the column count that decides where its branch panel is inserted.
  const [folderDeckId, setFolderDeckId] = React.useState<string | null>(null);
  const folderGridRef = React.useRef<HTMLDivElement | null>(null);
  const folderPanelRef = React.useRef<HTMLElement | null>(null);
  const [folderColumns, setFolderColumns] = React.useState(1);
  const rowById = React.useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const folderRow = folderDeckId ? rowById.get(folderDeckId) ?? null : null;
  const folderRows = React.useMemo(() => folderRow ? rows.filter((row) => row.parentDeckId === folderRow.id) : [], [folderRow, rows]);
  const folderTrail = React.useMemo(() => {
    const trail: DeckLibraryRow[] = [];
    for (let current = folderRow; current; current = rowById.get(current.parentDeckId ?? "") ?? null) trail.unshift(current);
    return trail;
  }, [folderRow, rowById]);
  const rootRows = React.useMemo(() => rows.filter((row) => row.depth === 0), [rows]);
  const selectedRootId = folderTrail[0]?.id;
  const selectedRootIndex = rootRows.findIndex((row) => row.id === selectedRootId);
  const panelAfterIndex = Math.min(rootRows.length - 1, (Math.floor(selectedRootIndex / folderColumns) + 1) * folderColumns - 1);

  React.useEffect(() => {
    const grid = folderGridRef.current;
    if (view !== "tiles" || !grid || typeof ResizeObserver === "undefined") return undefined;
    const measureColumns = () => setFolderColumns(Math.max(1, window.getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length));
    measureColumns();
    const observer = new ResizeObserver(measureColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [view, rootRows.length]);

  React.useEffect(() => {
    if (view !== "tiles" || !folderDeckId) return undefined;
    const frame = window.requestAnimationFrame(() => folderPanelRef.current?.scrollIntoView({ block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [folderDeckId, view]);

  React.useEffect(() => {
    setCollapsedDeckIdSet((current) => (
      current.size === collapsedDeckIds.length && collapsedDeckIds.every((deckId) => current.has(deckId))
        ? current
        : new Set(collapsedDeckIds)
    ));
  }, [collapsedDeckIds]);

  React.useEffect(() => () => {
    const drag = pointerDragRef.current;
    if (drag?.captureElement.hasPointerCapture?.(drag.pointerId)) drag.captureElement.releasePointerCapture(drag.pointerId);
  }, []);

  function toggleCollapsed(deckId: string) {
    if (view === "tiles") {
      const row = rowById.get(deckId);
      if (row?.depth === 0 && selectedRootId === deckId) closeFolder();
      else setFolderDeckId(deckId);
      return;
    }
    setDeckExpanded(deckId, collapsedDeckIdSet.has(deckId));
  }

  function setAllExpanded(expanded: boolean) {
    setCollapsedDeckIdSet(expanded ? new Set() : new Set(parentDeckIds));
    onDeckExpansionChange(parentDeckIds, expanded);
  }

  function closeFolder() {
    folderGridRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"] [data-deck-row-activation="true"]')?.focus();
    setFolderDeckId(null);
  }

  function setDeckExpanded(deckId: string, expanded: boolean) {
    setCollapsedDeckIdSet((current) => {
      if (current.has(deckId) === !expanded) return current;
      const next = new Set(current);
      if (expanded) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
    onDeckExpansionChange(deckId, expanded);
  }

  function clearDragState() {
    const drag = pointerDragRef.current;
    if (drag?.captureElement.hasPointerCapture?.(drag.pointerId)) drag.captureElement.releasePointerCapture(drag.pointerId);
    pointerDragRef.current = null;
    setDraggedDeckId(null);
    setDropIntent(null);
    setDragFocusLayout(null);
  }

  const measureDragFocusLayout = React.useCallback(() => {
    const drag = pointerDragRef.current;
    if (!drag?.dragging) return;

    const sourceRect = viewportRect(drag.captureElement.closest("[data-deck-row='true']"));
    const targetRect = viewportRect(drag.targetElement);
    const topBarRect = viewportRect(document.querySelector("[data-navigation-layout='top-bar'] > div"), 8);
    const bottomBarRect = topBarRect ? null : viewportRect(document.querySelector("[data-navigation-layout='bottom-bar']"));
    const topLevelTarget = topBarRect
      ? { placement: "top-bar" as const, rect: topBarRect }
      : bottomBarRect
        ? { placement: "bottom-bar" as const, rect: bottomBarRect }
        : null;
    const nextLayout = { sourceRect, targetRect, topLevelTarget };
    setDragFocusLayout((current) => sameDragFocusLayout(current, nextLayout) ? current : nextLayout);
  }, []);

  React.useEffect(() => {
    if (!draggedDeckId) return undefined;
    let frame = 0;
    const scheduleMeasurement = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measureDragFocusLayout();
      });
    };
    document.addEventListener("scroll", scheduleMeasurement, true);
    window.addEventListener("resize", scheduleMeasurement);
    scheduleMeasurement();
    return () => {
      document.removeEventListener("scroll", scheduleMeasurement, true);
      window.removeEventListener("resize", scheduleMeasurement);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [draggedDeckId, measureDragFocusLayout]);

  function deckDropIntent(targetDeckId: string | null): DropIntent {
    const drag = pointerDragRef.current;
    const currentIntent = drag?.intent;
    if (currentIntent?.targetDeckId === targetDeckId) return currentIntent;
    const validatePlacement = drag?.validatePlacement ?? createDeckPlacementValidator(decks, drag?.deckId ?? "");
    return { targetDeckId, error: validatePlacement(targetDeckId) };
  }

  function finishDeckMove(sourceDeckId: string, intent: DropIntent) {
    if (intent.error) {
      setDragStatus(intent.error);
      clearDragState();
      return;
    }

    const result = onMoveDeck(sourceDeckId, intent.targetDeckId);
    if (result?.error) setDragStatus(result.error);
    else if (!result || result.changedDeckIds.length === 0) setDragStatus("Stapel bleibt an dieser Stelle.");
    else {
      setDragStatus(intent.targetDeckId
        ? "Stapel als Unterstapel verschoben."
        : "Stapel auf die Hauptebene verschoben.");
      const targetDeckId = intent.targetDeckId;
      if (targetDeckId && collapsedDeckIdSet.has(targetDeckId)) setDeckExpanded(targetDeckId, true);
      if (targetDeckId && view === "tiles") setFolderDeckId(targetDeckId);
    }
    clearDragState();
  }

  function pointerDropIntent(clientX: number, clientY: number): DropIntent | null {
    const drag = pointerDragRef.current;
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof Element)) {
      if (drag) drag.targetElement = null;
      return null;
    }
    const topLevelTarget = target.closest("[data-deck-top-drop-zone='true']");
    const row = topLevelTarget ? null : target.closest<HTMLElement>("[data-deck-row='true']");
    if (drag) drag.targetElement = row?.dataset.deckId ? row : null;
    return topLevelTarget ? deckDropIntent(null) : row?.dataset.deckId ? deckDropIntent(row.dataset.deckId) : null;
  }

  function startPointer(event: React.PointerEvent<HTMLButtonElement>, row: DeckLibraryRow) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    suppressedClickDeckIdRef.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerDragRef.current = {
      pointerId: event.pointerId,
      deckId: row.id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      captureElement: event.currentTarget,
      targetElement: null,
      validatePlacement: null,
      intent: null,
    };
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < POINTER_DRAG_THRESHOLD) return;
      drag.dragging = true;
      window.getSelection()?.removeAllRanges();
      drag.validatePlacement = createDeckPlacementValidator(decks, drag.deckId);
      setDraggedDeckId(drag.deckId);
      setDragStatus("");
      measureDragFocusLayout();
    }
    event.preventDefault();
    const intent = pointerDropIntent(event.clientX, event.clientY);
    if (intent?.targetDeckId === drag.intent?.targetDeckId && intent?.error === drag.intent?.error) return;
    drag.intent = intent;
    setDropIntent(intent);
    measureDragFocusLayout();
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (drag.captureElement.hasPointerCapture?.(drag.pointerId)) drag.captureElement.releasePointerCapture(drag.pointerId);
      pointerDragRef.current = null;
      return;
    }
    event.preventDefault();
    suppressedClickDeckIdRef.current = drag.deckId;
    const intent = pointerDropIntent(event.clientX, event.clientY) ?? drag.intent;
    if (intent) finishDeckMove(drag.deckId, intent);
    else clearDragState();
  }

  function cancelPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerDragRef.current?.pointerId === event.pointerId) clearDragState();
  }

  function activate(row: DeckLibraryRow) {
    if (suppressedClickDeckIdRef.current === row.id) {
      suppressedClickDeckIdRef.current = null;
      return;
    }
    if (view === "tiles") setFolderDeckId(row.id);
    else onActivate(row);
  }

  const stableToggle = useStableCallback(toggleCollapsed);
  const stableActivate = useStableCallback(activate);
  const stableOpenContent = useStableCallback(onActivate);
  const stablePointerDown = useStableCallback(startPointer);
  const stableKeyDown = useStableCallback(() => { suppressedClickDeckIdRef.current = null; });
  const stableStudy = useStableCallback(onStudy);
  const stableOpenSettings = useStableCallback(onOpenSettings);
  const stableSetCoreMode = useStableCallback(onSetDeckCoreMode);
  const stableMoveDeck = useStableCallback(onMoveDeck);

  const topDropActive = draggedDeckId && dropIntent?.targetDeckId === null;
  const focusHoles = [
    expandedRect(dragFocusLayout?.sourceRect ?? null, 3),
    expandedRect(dragFocusLayout?.targetRect ?? null, 3),
  ]
    .filter((rect): rect is ViewportRect => rect !== null)
    .filter((rect, index, rects) => rects.findIndex((candidate) => sameRect(candidate, rect)) === index);
  const portalContent = draggedDeckId && typeof document !== "undefined" ? createPortal(
    <>
      <DeckDragFocusOverlay maskId={dragMaskId} holes={focusHoles} />
      {dragFocusLayout?.topLevelTarget ? (
        <div
          className={`pointer-events-auto grid min-h-control w-full place-items-center rounded-control border-strong border-dashed px-4 text-center core-body font-semibold transition ${
            topDropActive && dropIntent?.error
              ? "border-core-danger bg-core-danger-soft text-core-danger"
              : topDropActive
                ? "border-core-warning bg-core-warning-soft text-core-text"
                : "border-core-border bg-core-raised text-core-muted"
          }`}
          style={{
            position: "fixed",
            left: dragFocusLayout.topLevelTarget.rect.x,
            top: dragFocusLayout.topLevelTarget.rect.y,
            width: dragFocusLayout.topLevelTarget.rect.width,
            height: dragFocusLayout.topLevelTarget.rect.height,
            zIndex: 71,
          }}
          data-deck-top-drop-zone="true"
          data-deck-top-drop-placement={dragFocusLayout.topLevelTarget.placement}
          data-testid={`${mode}-top-drop-zone`}
        >
          Auf die Hauptebene verschieben
        </div>
      ) : null}
    </>,
    document.body,
  ) : null;

  function renderRow(row: DeckLibraryRow, presentation: DeckTreeRowProps["presentation"] = "row") {
    const tile = presentation !== "row";
    return (
      <DeckTreeRow
        key={row.id}
        row={row}
        mode={mode}
        presentation={presentation}
        decks={decks}
        isCollapsed={tile ? presentation !== "folder" || selectedRootId !== row.id : collapsedDeckIdSet.has(row.id)}
        isSelected={presentation === "folder" && selectedRootId === row.id}
        isDragged={draggedDeckId === row.id}
        dropState={dropIntent?.targetDeckId === row.id ? (dropIntent.error ? "invalid" : "valid") : undefined}
        onToggle={stableToggle}
        onActivate={stableActivate}
        onOpenContent={stableOpenContent}
        onPointerDown={stablePointerDown}
        onKeyDown={stableKeyDown}
        onStudy={stableStudy}
        onOpenSettings={stableOpenSettings}
        onSetCoreMode={stableSetCoreMode}
        onMoveDeck={stableMoveDeck}
      />
    );
  }

  const folderPanel = folderRow ? (
    <section ref={folderPanelRef} className="core-deck-folder-expansion core-surface-raised rounded-panel grid min-w-0 gap-6 border border-core-border p-4 sm:p-6" aria-label={`Unterstapel von ${folderRow.path}`} data-testid={`${mode}-deck-folder-panel`}>
      <nav aria-label="Stapelpfad" className="core-deck-folder-breadcrumb">
        <button type="button" onClick={closeFolder}>Alle Stapel</button>
        {folderTrail.map((entry) => <React.Fragment key={entry.id}>
          <ChevronRight size={16} aria-hidden="true" />
          {entry.id === folderRow.id ? <span aria-current="page">{entry.name}</span> : <button type="button" onClick={() => setFolderDeckId(entry.id)}>{entry.name}</button>}
        </React.Fragment>)}
      </nav>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h4 className="min-w-0 flex-1 basis-44 break-words core-heading-3 font-semibold text-core-text">{folderRow.name}</h4>
        <div className="flex shrink-0 gap-2">
          <IconButton label="Eine Ebene zurück" icon={ArrowLeft} onClick={() => folderRow.parentDeckId ? setFolderDeckId(folderRow.parentDeckId) : closeFolder()} />
          <IconButton label="Unterstapelübersicht schließen" icon={X} onClick={closeFolder} />
        </div>
      </div>
      {folderRows.length ? <div className="core-deck-subfolder-grid">{folderRows.map((child) => renderRow(child, "subfolder"))}</div> : <p className="core-body text-core-muted">Keine Unterstapel.</p>}
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="secondary" icon={PanelsTopLeft} aria-label={`Alle Inhalte von ${folderRow.path} öffnen`} onClick={() => onActivate(folderRow)}>Alle Karten dieses Zweigs</ActionButton>
        <ActionButton variant="secondary" icon={Play} aria-label={`${folderRow.path} als Zweig lernen`} onClick={() => onStudy(folderRow)}>Diesen Zweig lernen</ActionButton>
      </div>
    </section>
  ) : null;
  const showExpandAll = mode === "learn" && view === "list" && parentDeckIds.length > 0;

  return (
    <>
      <SoftPanel
        className="core-deck-tree-container overflow-visible p-4 sm:p-6"
        data-testid={`${mode}-deck-list`}
        data-deck-view={view}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
      >
        <span className="sr-only" role="status" aria-live="polite">{dragStatus}</span>
        <div className="core-deck-tree-layout grid gap-6">
          <div className={`core-deck-tree-header grid min-h-control items-center gap-3${mode === "learn" && headerAction ? " core-deck-tree-view-header" : ""}`} data-testid={`${mode}-deck-list-header`}>
            <div className="core-deck-tree-heading min-w-0">
              <h3 className="core-deck-tree-title break-words core-heading-3 font-semibold text-core-text">Aktive Stapel</h3>
            </div>
            {headerAction || showExpandAll ? (
              <div className="core-deck-tree-header-action flex flex-wrap justify-end gap-2 justify-self-end">
                {showExpandAll ? (
                  <ActionButton variant="secondary" icon={ChevronDown} onClick={() => setAllExpanded(anyCollapsed)}>
                    {anyCollapsed ? "Alle aufklappen" : "Alle einklappen"}
                  </ActionButton>
                ) : null}
                {headerAction}
              </div>
            ) : null}
          </div>
          {rows.length === 0 ? contentAfterRows : null}
          {view === "tiles" && rows.length > 0 ? (
            <div className="core-deck-folder-grid" ref={folderGridRef} data-testid={`${mode}-deck-tiles`}>
              {rootRows.map((row, index) => (
                <React.Fragment key={row.id}>
                  {renderRow(row, "folder")}
                  {folderPanel && index === panelAfterIndex ? folderPanel : null}
                </React.Fragment>
              ))}
            </div>
          ) : visibleRows.length > 0 ? (
            <div className="core-deck-tree-rows min-w-0 max-w-full">
              <DeckSummaryHeader />
              <div className="core-deck-tree-groups">
                {rowGroups.map((group) => (
                  <section
                    key={group.root.id}
                    className="core-deck-tree-group"
                    aria-label={`Stapelgruppe ${group.root.name}`}
                    data-deck-group={group.root.id}
                    style={{ "--core-deck-group-accent": getDeckAppearance(group.root.deck).iconColor } as React.CSSProperties}
                  >
                    {group.rows.map((row) => renderRow(row))}
                  </section>
                ))}
              </div>
            </div>
          ) : null}
          {rows.length > 0 && contentAfterRows ? <div className={view === "list" ? "core-deck-tree-create" : undefined}>{contentAfterRows}</div> : null}
        </div>
      </SoftPanel>
      {portalContent}
    </>
  );
}
