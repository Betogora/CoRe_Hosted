import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { createDeckPlacementValidator, MAX_INTERACTIVE_DECK_LEVELS, type DeckMutationResult } from "../coreWorkspace.ts";
import type { CoreMode } from "../coreTypes.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { SoftPanel } from "./coreUi.tsx";
import { DeckOptionsMenu } from "./DeckOptionsMenu.tsx";
import { DeckSummaryHeader, DeckSummaryRow } from "./DeckSummaryRow.tsx";

export interface DeckTreeProps {
  rows: DeckLibraryRow[];
  mode: "dashboard" | "learn";
  headerAction?: React.ReactNode;
  onActivate: (row: DeckLibraryRow) => void;
  onOpenSettings: (deckId: string) => void;
  onSetDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
  collapsedDeckIds: string[];
  onDeckExpansionChange: (deckId: string, expanded: boolean) => unknown;
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

type TopLevelPlacement = "sidebar" | "bottom-bar";

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

export function DeckTree({ rows, mode, headerAction, onActivate, onOpenSettings, onSetDeckCoreMode, onMoveDeck, collapsedDeckIds, onDeckExpansionChange }: DeckTreeProps) {
  const [draggedDeckId, setDraggedDeckId] = React.useState<string | null>(null);
  const [dropIntent, setDropIntent] = React.useState<DropIntent | null>(null);
  const [dragFocusLayout, setDragFocusLayout] = React.useState<DragFocusLayout | null>(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const pointerDragRef = React.useRef<PointerDrag | null>(null);
  const lastDragEndAtRef = React.useRef(0);
  const dragMaskId = React.useId().replaceAll(":", "");
  const decks = React.useMemo(() => rows.map((row) => row.deck), [rows]);
  const collapsedDeckIdSet = React.useMemo(() => new Set(collapsedDeckIds), [collapsedDeckIds]);
  const visibleRows = React.useMemo(() => getVisibleRows(rows, collapsedDeckIdSet), [collapsedDeckIdSet, rows]);

  React.useEffect(() => () => {
    const drag = pointerDragRef.current;
    if (drag?.captureElement.hasPointerCapture?.(drag.pointerId)) drag.captureElement.releasePointerCapture(drag.pointerId);
  }, []);

  function toggleCollapsed(deckId: string) {
    onDeckExpansionChange(deckId, collapsedDeckIdSet.has(deckId));
  }

  function clearDragState() {
    const drag = pointerDragRef.current;
    if (drag?.dragging) lastDragEndAtRef.current = Date.now();
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
    const sidebarRect = viewportRect(document.querySelector("[data-navigation-layout='sidebar']"), 16);
    const bottomBarRect = sidebarRect ? null : viewportRect(document.querySelector("[data-navigation-layout='bottom-bar']"));
    const topLevelTarget = sidebarRect
      ? { placement: "sidebar" as const, rect: sidebarRect }
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
    const error = validatePlacement(targetDeckId);
    return { targetDeckId, error };
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
      setDragStatus(intent.targetDeckId ? "Stapel als Unterstapel verschoben." : "Stapel auf die Hauptebene verschoben.");
      const targetDeckId = intent.targetDeckId;
      if (targetDeckId && collapsedDeckIdSet.has(targetDeckId)) onDeckExpansionChange(targetDeckId, true);
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
    const intent = pointerDropIntent(event.clientX, event.clientY) ?? drag.intent;
    if (intent) finishDeckMove(drag.deckId, intent);
    else clearDragState();
  }

  function cancelPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerDragRef.current?.pointerId === event.pointerId) clearDragState();
  }

  function activate(row: DeckLibraryRow) {
    if (Date.now() - lastDragEndAtRef.current < 250) return;
    onActivate(row);
  }

  function renderRow(row: DeckLibraryRow, rowIndex: number): React.ReactNode {
    const isCollapsed = collapsedDeckIdSet.has(row.id);
    const isDragged = draggedDeckId === row.id;
    const isDropTarget = dropIntent?.targetDeckId === row.id;
    const activationLabel = `${row.path} lernen`;
    const collapseControl = row.hasChildren ? (
      <button
        type="button"
        onClick={() => toggleCollapsed(row.id)}
        className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-lg text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
        aria-label={isCollapsed ? `Unterstapel von ${row.path} anzeigen` : `Unterstapel von ${row.path} ausblenden`}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
    ) : <span className="size-9 shrink-0" aria-hidden="true" />;
    const optionsMenu = (
      <DeckOptionsMenu
        row={row}
        decks={decks}
        onSetCoreMode={onSetDeckCoreMode}
        onOpenSettings={onOpenSettings}
        onMoveDeck={onMoveDeck}
      />
    );

    return (
      <div
        key={row.id}
        data-testid={`${mode}-deck-row-${row.id}`}
        data-deck-row="true"
        data-deck-id={row.id}
        data-deck-depth={Math.min(row.depth, MAX_INTERACTIVE_DECK_LEVELS)}
        data-drop-state={isDropTarget ? (dropIntent?.error ? "invalid" : "valid") : undefined}
        data-drag-state={isDragged ? "active" : undefined}
        className={row.depth === 0 && rowIndex > 0
          ? "core-deck-summary-row relative min-w-0 select-none border-t-2 border-[var(--core-border)]"
          : "core-deck-summary-row relative min-w-0 select-none"}
      >
        <button
          type="button"
          onClick={() => activate(row)}
          onPointerDown={(event) => startPointer(event, row)}
          aria-label={activationLabel}
          data-deck-drag-source="true"
          data-deck-row-activation="true"
          className={`absolute inset-0 z-0 text-left transition-colors hover:bg-[var(--core-focus-ring-soft)] ${isDragged ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <span className="sr-only">{activationLabel}</span>
        </button>

        <DeckSummaryRow
          row={row}
          learningStatus={{ summary: row.summary, statusDistribution: row.statusDistribution, metricLabels: "sr-only" }}
          leadingControl={collapseControl}
          actions={optionsMenu}
          density="responsive"
        />
      </div>
    );
  }

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
          className={`pointer-events-auto grid min-h-11 w-full place-items-center rounded-xl border-2 border-dashed px-4 text-center core-body font-semibold transition ${
            topDropActive && dropIntent?.error
              ? "border-[var(--core-danger)] bg-[var(--core-danger-surface)] text-[var(--core-danger)]"
              : topDropActive
                ? "border-[var(--core-warning)] bg-[var(--core-warning-surface)] text-[var(--core-text)]"
                : "border-[var(--core-border)] bg-[var(--core-surface-raised)] text-[var(--core-text-muted)]"
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

  return (
    <>
      <SoftPanel
        className="core-deck-tree-container overflow-visible p-4 sm:p-7"
        data-testid={`${mode}-deck-list`}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
      >
        <span className="sr-only" role="status" aria-live="polite">{dragStatus}</span>
        <div className="core-deck-tree-header mb-6 grid min-h-11 items-center gap-3" data-testid={`${mode}-deck-list-header`}>
          <h3 className="core-deck-tree-title whitespace-nowrap core-heading-3 font-semibold text-[var(--core-text)]">Aktive Stapel</h3>
          {headerAction ? <div className="core-deck-tree-header-action justify-self-end whitespace-nowrap">{headerAction}</div> : null}
        </div>
        <div className="core-deck-tree-rows min-w-0 max-w-full overflow-hidden rounded-2xl border border-[var(--core-border)]">
          <DeckSummaryHeader />
          {visibleRows.map(renderRow)}
        </div>
      </SoftPanel>
      {portalContent}
    </>
  );
}
