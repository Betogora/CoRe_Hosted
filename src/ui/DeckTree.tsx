import React from "react";
import { ChevronDown, ChevronRight, Settings } from "lucide-react";
import type { DeckMutationResult } from "../coreWorkspace.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { IconButton } from "./actionUi.tsx";
import { DonutValue } from "./coreUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

export type DeckTreeMode = "dashboard" | "learn" | "manage";

export interface DeckTreeProps {
  rows: DeckLibraryRow[];
  mode: DeckTreeMode;
  selectedDeckId?: string | null;
  onActivate: (row: DeckLibraryRow) => void;
  onOpenSettings?: (row: DeckLibraryRow) => void;
  onMoveDeck?: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

interface DeckTreeNode {
  row: DeckLibraryRow;
  children: DeckTreeNode[];
}

interface DropIntent {
  targetDeckId: string | null;
  invalid: boolean;
}

function createDeckTree(rows: DeckLibraryRow[]) {
  const nodesById = new Map(rows.map((row) => [row.id, { row, children: [] as DeckTreeNode[] }]));
  const roots: DeckTreeNode[] = [];

  for (const node of nodesById.values()) {
    const parentNode = node.row.parentDeckId ? nodesById.get(node.row.parentDeckId) : null;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }

  return { roots, nodesById };
}

function DeckCounts({ row }: { row: DeckLibraryRow }) {
  const counts = [
    { label: "Neu", value: row.summary.newCards, color: "var(--core-deck-new-text)", metric: "new" },
    { label: "Fällig", value: row.summary.dueCards, color: "var(--core-deck-due-text)", metric: "due" },
    { label: "Gesamt", value: row.summary.totalCards, color: "var(--core-deck-total-text)", metric: "total" },
  ];

  return (
    <dl className="pointer-events-none relative z-[1] col-span-2 grid grid-cols-3 gap-3 sm:col-span-1 sm:min-w-[15rem]" aria-label={`Lernstand für ${row.path}`}>
      {counts.map((count) => (
        <div key={count.metric} className="grid min-w-0 gap-0.5 text-left sm:text-right" data-deck-count={count.metric}>
          <dt className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">{count.label}</dt>
          <dd className={`core-body-large ${count.metric === "total" ? "font-medium" : "font-semibold"}`} style={{ color: count.color }}>{count.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DeckTree({ rows, mode, selectedDeckId = null, onActivate, onOpenSettings, onMoveDeck }: DeckTreeProps) {
  const [collapsedDeckIds, setCollapsedDeckIds] = React.useState<Set<string>>(() => new Set());
  const [draggedDeckId, setDraggedDeckId] = React.useState<string | null>(null);
  const [dropIntent, setDropIntent] = React.useState<DropIntent | null>(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const draggedDeckIdRef = React.useRef<string | null>(null);
  const lastDragEndAtRef = React.useRef(0);
  const { roots, nodesById } = React.useMemo(() => createDeckTree(rows), [rows]);
  const rowTestPrefix = mode === "manage" ? "deck" : `${mode}-deck`;
  const dragEnabled = Boolean(onMoveDeck);

  function toggleCollapsed(deckId: string) {
    setCollapsedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function readDraggedDeckId(event: React.DragEvent<HTMLElement>): string {
    return event.dataTransfer.getData("text/plain") || draggedDeckIdRef.current || "";
  }

  function clearDragState() {
    if (draggedDeckIdRef.current || draggedDeckId) lastDragEndAtRef.current = Date.now();
    draggedDeckIdRef.current = null;
    setDraggedDeckId(null);
    setDropIntent(null);
  }

  function startDrag(event: React.DragEvent<HTMLDivElement>, row: DeckLibraryRow) {
    const target = event.target;
    if (!dragEnabled || (target instanceof Element && target.closest("[data-deck-row-control='true']"))) {
      event.preventDefault();
      return;
    }

    draggedDeckIdRef.current = row.id;
    setDraggedDeckId(row.id);
    setDropIntent(null);
    setDragStatus("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.id);
  }

  function rowDropIntent(event: React.DragEvent<HTMLDivElement>, row: DeckLibraryRow): DropIntent {
    const sourceDeckId = readDraggedDeckId(event);
    const sourceRow = nodesById.get(sourceDeckId)?.row;
    return {
      targetDeckId: row.id,
      invalid: !sourceDeckId || sourceDeckId === row.id || Boolean(sourceRow?.scopeDeckIds.includes(row.id)),
    };
  }

  function allowRowDrop(event: React.DragEvent<HTMLDivElement>, row: DeckLibraryRow) {
    event.preventDefault();
    event.stopPropagation();
    const intent = rowDropIntent(event, row);
    event.dataTransfer.dropEffect = intent.invalid ? "none" : "move";
    setDropIntent(intent);
  }

  function allowTopLevelDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!readDraggedDeckId(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropIntent({ targetDeckId: null, invalid: false });
  }

  function leaveDropTarget(event: React.DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropIntent(null);
  }

  function dropDeck(event: React.DragEvent<HTMLElement>, intent: DropIntent) {
    event.preventDefault();
    event.stopPropagation();
    const sourceDeckId = readDraggedDeckId(event);
    if (!sourceDeckId) {
      clearDragState();
      return;
    }
    if (intent.invalid) {
      setDragStatus("Stapel bleibt an dieser Stelle.");
      clearDragState();
      return;
    }

    const result = onMoveDeck?.(sourceDeckId, intent.targetDeckId);
    if (result?.error) setDragStatus(result.error);
    else if (!result || result.changedDeckIds.length === 0) setDragStatus("Stapel bleibt an dieser Stelle.");
    else setDragStatus(intent.targetDeckId ? "Stapel als Unterstapel verschoben." : "Stapel auf die Hauptebene verschoben.");
    clearDragState();
  }

  function activate(row: DeckLibraryRow) {
    if (Date.now() - lastDragEndAtRef.current < 250) return;
    onActivate(row);
  }

  function renderNode(node: DeckTreeNode): React.ReactNode {
    const { row } = node;
    const isCollapsed = collapsedDeckIds.has(row.id);
    const isSelected = selectedDeckId === row.id;
    const isDragged = draggedDeckId === row.id;
    const isDropTarget = dropIntent?.targetDeckId === row.id;
    const activationLabel = mode === "manage" ? `${row.path} öffnen` : `${row.path} lernen`;

    return (
      <div
        key={row.id}
        data-testid={`${rowTestPrefix}-group-${row.id}`}
        data-deck-group="true"
        data-deck-depth={row.depth}
        data-selected={isSelected || undefined}
        data-drop-state={isDropTarget ? (dropIntent?.invalid ? "invalid" : "valid") : undefined}
        className={`core-deck-group grid gap-2 rounded-2xl border border-[var(--core-border)] p-2 sm:gap-3 ${isDragged ? "opacity-60" : ""}`}
      >
        <div
          draggable={dragEnabled || undefined}
          onDragStart={(event) => startDrag(event, row)}
          onDragEnd={clearDragState}
          onDragOver={(event) => allowRowDrop(event, row)}
          onDragLeave={leaveDropTarget}
          onDrop={(event) => dropDeck(event, rowDropIntent(event, row))}
          data-testid={`${rowTestPrefix}-row-${row.id}`}
          data-deck-row="true"
          className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 sm:grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] sm:px-3"
        >
          <button
            type="button"
            onClick={() => activate(row)}
            aria-label={activationLabel}
            aria-pressed={mode === "manage" ? isSelected : undefined}
            data-testid={mode === "manage" ? `deck-select-${row.id}` : undefined}
            data-deck-row-activation="true"
            className={`absolute inset-0 z-0 rounded-xl text-left ${dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
          >
            <span className="sr-only">{activationLabel}</span>
          </button>

          <div className="relative z-[1] flex min-w-0 items-center gap-2 pointer-events-none" style={{ paddingLeft: `${Math.min(row.depth, 6) * 0.55}rem` }}>
            {row.hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapsed(row.id)}
                className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-lg text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
                aria-label={isCollapsed ? `Unterstapel von ${row.path} anzeigen` : `Unterstapel von ${row.path} ausblenden`}
                aria-expanded={!isCollapsed}
                data-deck-row-control="true"
              >
                {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden="true" />
            )}
            <DeckAppearanceIcon deck={row.deck} className="size-11 rounded-full bg-[var(--core-surface-muted)]" iconSize={20} />
            <span className="min-w-0">
              <span className="block truncate core-body-large font-semibold text-[var(--core-text)]">{row.name}</span>
              {row.depth > 0 ? <span className="mt-0.5 block truncate core-caption text-[var(--core-text-muted)]">{row.path}</span> : null}
            </span>
          </div>

          <DeckCounts row={row} />

          <div
            className={`relative z-[2] col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto ${mode === "learn" && onOpenSettings ? "" : "pointer-events-none"}`}
            data-deck-row-control={mode === "learn" && onOpenSettings ? "true" : undefined}
          >
            {mode === "dashboard" ? <DonutValue value={row.progress} /> : null}
            {mode === "learn" && onOpenSettings ? (
              <CoreTooltip label={`Stapeloptionen für ${row.path}`}>
                <IconButton
                  type="button"
                  label={`Stapeloptionen für ${row.path}`}
                  icon={Settings}
                  onClick={() => onOpenSettings(row)}
                  data-deck-row-control="true"
                />
              </CoreTooltip>
            ) : null}
          </div>
        </div>

        {!isCollapsed && node.children.length > 0 ? (
          <div className="grid gap-2 sm:gap-3" data-deck-children="true">
            {node.children.map(renderNode)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="grid min-w-0 gap-3"
      data-testid={`${rowTestPrefix}-list`}
      onDragOver={(event) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest("[data-deck-row='true']")) return;
        allowTopLevelDrop(event);
      }}
      onDragLeave={leaveDropTarget}
      onDrop={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-deck-row='true']")) return;
        dropDeck(event, { targetDeckId: null, invalid: false });
      }}
    >
      <span className="sr-only" role="status" aria-live="polite">{dragStatus}</span>
      {dragEnabled && draggedDeckId ? (
        <div
          className={`rounded-xl border border-dashed px-4 py-3 text-center core-body font-semibold transition ${
            dropIntent?.targetDeckId === null ? "border-[var(--core-border-interactive)] bg-[var(--core-info-surface)] text-[var(--core-text)]" : "border-[var(--core-border)] text-[var(--core-text-muted)]"
          }`}
          onDragOver={allowTopLevelDrop}
          onDragLeave={leaveDropTarget}
          onDrop={(event) => dropDeck(event, { targetDeckId: null, invalid: false })}
          data-testid={`${mode}-top-drop-zone`}
        >
          Auf die Hauptebene verschieben
        </div>
      ) : null}
      {roots.map(renderNode)}
    </div>
  );
}
