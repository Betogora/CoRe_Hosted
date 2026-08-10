import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createDeckPlacementValidator, MAX_INTERACTIVE_DECK_LEVELS, type DeckMutationResult } from "../coreWorkspace.ts";
import type { CoreMode } from "../coreTypes.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { SoftPanel } from "./coreUi.tsx";
import { DeckOptionsMenu } from "./DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "./DeckSummaryRow.tsx";

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
  validatePlacement: ReturnType<typeof createDeckPlacementValidator> | null;
  intent: DropIntent | null;
}

const POINTER_DRAG_THRESHOLD = 6;

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
  const [dragStatus, setDragStatus] = React.useState("");
  const pointerDragRef = React.useRef<PointerDrag | null>(null);
  const lastDragEndAtRef = React.useRef(0);
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
  }

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
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof Element)) return null;
    if (target.closest("[data-deck-top-drop-zone='true']")) return deckDropIntent(null);
    const row = target.closest<HTMLElement>("[data-deck-row='true']");
    return row?.dataset.deckId ? deckDropIntent(row.dataset.deckId) : null;
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
    }
    event.preventDefault();
    const intent = pointerDropIntent(event.clientX, event.clientY);
    if (intent?.targetDeckId === drag.intent?.targetDeckId && intent?.error === drag.intent?.error) return;
    drag.intent = intent;
    setDropIntent(intent);
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

  function renderRow(row: DeckLibraryRow): React.ReactNode {
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
        className="core-deck-summary-row relative min-w-0 select-none border-b border-[var(--core-border)] last:border-b-0"
      >
        <button
          type="button"
          onClick={() => activate(row)}
          onPointerDown={(event) => startPointer(event, row)}
          aria-label={activationLabel}
          data-deck-drag-source="true"
          data-deck-row-activation="true"
          className={`absolute inset-0 z-0 text-left ${isDragged ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <span className="sr-only">{activationLabel}</span>
        </button>

        <DeckSummaryRow
          row={row}
          summary={row.summary}
          progress={row.progress}
          leadingControl={collapseControl}
          actions={optionsMenu}
          density="responsive"
        />
      </div>
    );
  }

  const topDropActive = draggedDeckId && dropIntent?.targetDeckId === null;

  return (
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
        {draggedDeckId ? (
          <div
            className={`core-deck-tree-drop-zone grid min-h-11 w-full place-items-center rounded-xl border-2 border-dashed px-4 text-center core-body font-semibold transition ${
              topDropActive && dropIntent?.error
                ? "border-[var(--core-danger)] bg-[var(--core-danger-surface)] text-[var(--core-danger)]"
                : topDropActive
                  ? "border-[var(--core-warning)] bg-[var(--core-warning-surface)] text-[var(--core-text)]"
                  : "border-[var(--core-border)] text-[var(--core-text-muted)]"
            }`}
            data-deck-top-drop-zone="true"
            data-testid={`${mode}-top-drop-zone`}
          >
            Auf die Hauptebene verschieben
          </div>
        ) : <span className="core-deck-tree-drop-spacer" aria-hidden="true" />}
      </div>
      <div className="core-deck-tree-rows min-w-0 max-w-full overflow-hidden rounded-2xl border border-[var(--core-border)]">
        {visibleRows.map(renderRow)}
      </div>
    </SoftPanel>
  );
}
