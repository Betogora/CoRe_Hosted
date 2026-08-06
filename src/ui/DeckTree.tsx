import React from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { createDeckPlacementValidator, MAX_INTERACTIVE_DECK_LEVELS, type DeckMutationResult } from "../coreWorkspace.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { IconButton } from "./actionUi.tsx";
import { DeckSummaryRow } from "./DeckSummaryRow.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

export interface DeckTreeProps {
  rows: DeckLibraryRow[];
  mode: "dashboard" | "learn";
  onActivate: (row: DeckLibraryRow) => void;
  onOpenSettings: (row: DeckLibraryRow) => void;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
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

export function DeckTree({ rows, mode, onActivate, onOpenSettings, onMoveDeck }: DeckTreeProps) {
  const [collapsedDeckIds, setCollapsedDeckIds] = React.useState<Set<string>>(() => new Set());
  const [draggedDeckId, setDraggedDeckId] = React.useState<string | null>(null);
  const [dropIntent, setDropIntent] = React.useState<DropIntent | null>(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const draggedDeckIdRef = React.useRef<string | null>(null);
  const pointerDragRef = React.useRef<PointerDrag | null>(null);
  const placementValidatorRef = React.useRef<ReturnType<typeof createDeckPlacementValidator> | null>(null);
  const currentDropIntentRef = React.useRef<DropIntent | null>(null);
  const lastDragEndAtRef = React.useRef(0);
  const decks = React.useMemo(() => rows.map((row) => row.deck), [rows]);
  const visibleRows = React.useMemo(() => getVisibleRows(rows, collapsedDeckIds), [collapsedDeckIds, rows]);

  function toggleCollapsed(deckId: string) {
    setCollapsedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function clearDragState() {
    if (draggedDeckIdRef.current) lastDragEndAtRef.current = Date.now();
    draggedDeckIdRef.current = null;
    pointerDragRef.current = null;
    placementValidatorRef.current = null;
    currentDropIntentRef.current = null;
    setDraggedDeckId(null);
    setDropIntent(null);
  }

  function deckDropIntent(targetDeckId: string | null): DropIntent {
    const currentIntent = currentDropIntentRef.current;
    if (currentIntent?.targetDeckId === targetDeckId) return currentIntent;
    const validatePlacement = placementValidatorRef.current ?? createDeckPlacementValidator(decks, draggedDeckIdRef.current ?? "");
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
      if (targetDeckId) {
        setCollapsedDeckIds((current) => {
          if (!current.has(targetDeckId)) return current;
          const next = new Set(current);
          next.delete(targetDeckId);
          return next;
        });
      }
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
    pointerDragRef.current = {
      pointerId: event.pointerId,
      deckId: row.id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < POINTER_DRAG_THRESHOLD) return;
      drag.dragging = true;
      window.getSelection()?.removeAllRanges();
      draggedDeckIdRef.current = drag.deckId;
      placementValidatorRef.current = createDeckPlacementValidator(decks, drag.deckId);
      currentDropIntentRef.current = null;
      setDraggedDeckId(drag.deckId);
      setDragStatus("");
    }
    event.preventDefault();
    const intent = pointerDropIntent(event.clientX, event.clientY);
    if (intent?.targetDeckId === currentDropIntentRef.current?.targetDeckId && intent?.error === currentDropIntentRef.current?.error) return;
    currentDropIntentRef.current = intent;
    setDropIntent(intent);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      pointerDragRef.current = null;
      return;
    }
    event.preventDefault();
    const intent = pointerDropIntent(event.clientX, event.clientY) ?? currentDropIntentRef.current;
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
    const isCollapsed = collapsedDeckIds.has(row.id);
    const isDragged = draggedDeckId === row.id;
    const isDropTarget = dropIntent?.targetDeckId === row.id;
    const activationLabel = `${row.path} lernen`;

    return (
      <div
        key={row.id}
        data-testid={`${mode}-deck-row-${row.id}`}
        data-deck-row="true"
        data-deck-id={row.id}
        data-deck-depth={Math.min(row.depth, MAX_INTERACTIVE_DECK_LEVELS - 1)}
        data-drop-state={isDropTarget ? (dropIntent?.error ? "invalid" : "valid") : undefined}
        className={`core-deck-summary-row relative min-w-0 select-none border-b border-[var(--core-border)] last:border-b-0 ${isDragged ? "opacity-60" : ""}`}
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
          leadingControl={
            row.hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapsed(row.id)}
                className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-lg text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
                aria-label={isCollapsed ? `Unterstapel von ${row.path} anzeigen` : `Unterstapel von ${row.path} ausblenden`}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
            ) : <span className="size-9 shrink-0" aria-hidden="true" />
          }
          actions={
            <CoreTooltip label={`Stapeloptionen für ${row.path}`}>
              <IconButton
                type="button"
                label={`Stapeloptionen für ${row.path}`}
                icon={MoreHorizontal}
                onClick={() => onOpenSettings(row)}
              />
            </CoreTooltip>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="grid min-w-0 gap-3"
      data-testid={`${mode}-deck-list`}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={cancelPointer}
      onPointerLeave={(event) => {
        if (pointerDragRef.current?.pointerId === event.pointerId) clearDragState();
      }}
    >
      <span className="sr-only" role="status" aria-live="polite">{dragStatus}</span>
      <div className="max-w-full overflow-x-auto rounded-2xl border border-[var(--core-border)]">
        <div className="min-w-[46rem]">
          {visibleRows.map(renderRow)}
        </div>
      </div>
      {draggedDeckId ? (
        <div
          className={`fixed left-1/2 top-4 z-[70] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-dashed px-4 py-3 text-center core-body font-semibold shadow-[var(--core-shadow-raised)] transition ${
            dropIntent?.targetDeckId === null && dropIntent.error
              ? "border-[var(--core-danger)] bg-[var(--core-danger-surface)] text-[var(--core-danger)]"
              : dropIntent?.targetDeckId === null
                ? "border-[var(--core-border-interactive)] bg-[var(--core-info-surface)] text-[var(--core-text)]"
                : "border-[var(--core-border)] text-[var(--core-text-muted)]"
          }`}
          data-deck-top-drop-zone="true"
          data-testid={`${mode}-top-drop-zone`}
        >
          Auf die Hauptebene verschieben
        </div>
      ) : null}
    </div>
  );
}
