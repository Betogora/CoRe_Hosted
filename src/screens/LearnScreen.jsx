import React from "react";
import { BookOpen, ChevronDown, ChevronRight, Ellipsis, Layers, Play, PlusSquare } from "lucide-react";
import { createDeckLibraryModel, createVisibleDeckRows } from "../libraryModel.js";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.jsx";

const INTERACTIVE_DRAG_SELECTOR = "button, a, input, textarea, select, [role='menu'], [role='menuitem']";
const LEARN_TOP_LEVEL_GUTTER_PX = 28;
const LEARN_DEPTH_INDENT_PX = 20;

function coreModeLabel(mode) {
  if (mode === "off") return "CoRe aus";
  if (mode === "manual") return "CoRe manuell";
  return "CoRe aktiv";
}

function CoreStatusBadge({ mode }) {
  const isOff = mode === "off";
  return (
    <span className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold ${isOff ? "bg-slate-100 text-slate-600" : "bg-[#e8f6ef] text-[#15705a]"}`}>
      {coreModeLabel(mode)}
    </span>
  );
}

function CountCell({ label, value }) {
  return (
    <div className="hidden min-w-16 text-right md:block">
      <span className="block text-xs font-semibold text-[#66709a]">{label}</span>
      <span className="mt-1 block text-lg font-semibold text-[#17214f]">{value}</span>
    </div>
  );
}

function isInteractiveDragTarget(target) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_DRAG_SELECTOR));
}

function isRowElement(target) {
  return target instanceof Element && Boolean(target.closest("[data-learn-deck-row='true']"));
}

export function LearnScreen({ decks, onStartDeck, onCreateDeck, onOpenDecks, onMoveDeck }) {
  const library = createDeckLibraryModel(decks);
  const [collapsedDeckIds, setCollapsedDeckIds] = React.useState(() => new Set());
  const [openOptionsDeckId, setOpenOptionsDeckId] = React.useState(null);
  const [draggedDeckId, setDraggedDeckId] = React.useState(null);
  const [dropIntent, setDropIntent] = React.useState(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const draggedDeckIdRef = React.useRef(null);
  const visibleRows = createVisibleDeckRows(library.rows, collapsedDeckIds);
  const rowById = React.useMemo(() => new Map(library.rows.map((row) => [row.id, row])), [library.rows]);

  function toggleCollapsed(deckId) {
    setCollapsedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function toggleOptions(deckId) {
    setOpenOptionsDeckId((current) => (current === deckId ? null : deckId));
  }

  function openDeckManagement(deckId) {
    setOpenOptionsDeckId(null);
    onOpenDecks(deckId);
  }

  function readDraggedDeckId(event) {
    return event.dataTransfer?.getData("text/plain") || draggedDeckIdRef.current || draggedDeckId;
  }

  function clearDragState() {
    draggedDeckIdRef.current = null;
    setDraggedDeckId(null);
    setDropIntent(null);
  }

  function startDeckDrag(event, row) {
    if (!onMoveDeck || isInteractiveDragTarget(event.target)) {
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

  function isInvalidDropTarget(row, sourceDeckId) {
    const sourceRow = rowById.get(sourceDeckId);
    return !sourceDeckId || row.id === sourceDeckId || Boolean(sourceRow?.scopeDeckIds?.includes(row.id));
  }

  function createRowDropIntent(event, row) {
    const sourceDeckId = readDraggedDeckId(event);
    const invalid = isInvalidDropTarget(row, sourceDeckId);
    const rowRect = event.currentTarget.getBoundingClientRect();
    const outdentLimit = rowRect.left + Math.min(row.depth, 6) * LEARN_DEPTH_INDENT_PX + LEARN_TOP_LEVEL_GUTTER_PX;
    const shouldMoveToTopLevel = row.depth > 0 && event.clientX <= outdentLimit;

    return {
      targetDeckId: row.id,
      parentDeckId: shouldMoveToTopLevel ? row.parentDeckId ?? null : row.id,
      invalid,
      kind: shouldMoveToTopLevel ? "top" : "deck",
    };
  }

  function allowRowDrop(event, row) {
    event.preventDefault();
    event.stopPropagation();
    const intent = createRowDropIntent(event, row);
    event.dataTransfer.dropEffect = intent.invalid ? "none" : "move";
    setDropIntent(intent);
  }

  function allowPanelTopLevelDrop(event) {
    if (isRowElement(event.target) || !readDraggedDeckId(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIntent({ targetDeckId: null, parentDeckId: null, invalid: false, kind: "top" });
  }

  function leaveDropTarget(event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDropIntent(null);
  }

  function dropDeck(event, intent = dropIntent) {
    event.preventDefault();
    event.stopPropagation();
    const sourceDeckId = readDraggedDeckId(event);

    if (!sourceDeckId) {
      clearDragState();
      return;
    }
    if (intent?.invalid) {
      setDragStatus("Stapel bleibt an dieser Stelle.");
      clearDragState();
      return;
    }

    const result = onMoveDeck?.(sourceDeckId, intent?.parentDeckId ?? null);
    if (result?.error) {
      setDragStatus(result.error);
    } else if (result?.changedDeckIds?.length === 0) {
      setDragStatus("Stapel bleibt an dieser Stelle.");
    } else {
      setDragStatus(intent?.parentDeckId ? "Stapel als Unterstapel verschoben." : "Stapel auf die Hauptebene verschoben.");
    }
    clearDragState();
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
        body="Originale und variantenfokussierte Sessions."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => onOpenDecks()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
              <Layers size={17} aria-hidden="true" />
              Kartenstapel
            </button>
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
              <PlusSquare size={17} aria-hidden="true" />
              Neue Karten
            </button>
          </div>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Keine Karten"
          body="Erstelle oder importiere zuerst einen Stapel."
          action={
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <SoftPanel
          className={`overflow-visible p-4 transition sm:p-5 ${dropIntent?.kind === "top" && !dropIntent.targetDeckId && !dropIntent.invalid ? "ring-2 ring-[#8c96dc] bg-[#f7f8ff]" : ""}`}
          data-testid="learn-deck-list"
          onDragOver={allowPanelTopLevelDrop}
          onDragLeave={leaveDropTarget}
          onDrop={(event) => dropDeck(event, { targetDeckId: null, parentDeckId: null, invalid: false, kind: "top" })}
        >
          <span className="sr-only" aria-live="polite">
            {dragStatus}
          </span>
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_8rem_8rem_3rem] items-center gap-3 border-b border-[#e3e7f5] px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-[#66709a] md:grid">
            <span>Stapel</span>
            <span className="text-right">Neu</span>
            <span className="text-right">Fällig</span>
            <span className="text-right">Gesamt</span>
            <span>CoRe</span>
            <span className="text-right">Start</span>
            <span className="sr-only">Extras</span>
          </div>
          <div className="divide-y divide-[#e6eaf6]">
            {visibleRows.map((row) => {
              const deck = row.deck;
              const summary = row.summary;
              const isCollapsed = collapsedDeckIds.has(deck.id);
              const isOptionsOpen = openOptionsDeckId === deck.id;
              const menuId = `learn-deck-options-${deck.id}`;
              const isDragged = draggedDeckId === deck.id;
              const isDeckDropTarget = dropIntent?.targetDeckId === deck.id && !dropIntent.invalid && dropIntent.parentDeckId === deck.id;
              const isOutdentDropTarget = dropIntent?.targetDeckId === deck.id && !dropIntent.invalid && dropIntent.kind === "top";
              const isInvalidDropTarget = dropIntent?.targetDeckId === deck.id && dropIntent.invalid;

              return (
                <div
                  key={deck.id}
                  draggable={Boolean(onMoveDeck)}
                  onDragStart={(event) => startDeckDrag(event, row)}
                  onDragEnd={clearDragState}
                  onDragOver={(event) => allowRowDrop(event, row)}
                  onDragLeave={leaveDropTarget}
                  onDrop={(event) => dropDeck(event, createRowDropIntent(event, row))}
                  data-testid={`learn-deck-row-${deck.id}`}
                  data-learn-deck-row="true"
                  className={`relative grid min-w-0 gap-3 rounded-xl px-1 py-4 transition duration-150 md:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_8rem_8rem_3rem] md:items-center md:gap-3 md:px-3 ${
                    onMoveDeck ? "cursor-grab active:cursor-grabbing" : ""
                  } ${isDragged ? "scale-[0.995] opacity-60 ring-1 ring-[#c7cee8]" : ""} ${
                    isDeckDropTarget ? "bg-[#eef1fb] ring-2 ring-[#8c96dc]" : ""
                  } ${isOutdentDropTarget ? "bg-white/85 shadow-[inset_5px_0_0_#8c96dc]" : ""} ${
                    isInvalidDropTarget ? "bg-red-50 ring-2 ring-red-200" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(row.depth, 6) * 1.25}rem` }}>
                    {row.hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(deck.id)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[#4f5eb1] hover:bg-[#eef1fb]"
                        aria-label={isCollapsed ? "Unterstapel anzeigen" : "Unterstapel ausblenden"}
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                      </button>
                    ) : (
                      <span className="size-8 shrink-0" aria-hidden="true" />
                    )}
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]">
                      <BookOpen size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
                      <span className="mt-1 block text-sm text-[#66709a] md:hidden">
                        {summary.newCards} neu · {summary.dueCards} fällig · {summary.totalCards} gesamt
                      </span>
                      {row.hasChildren ? <span className="mt-1 block text-xs font-semibold text-[#66709a]">{row.childrenCount} Unterstapel</span> : null}
                    </span>
                  </div>

                  <CountCell label="Neu" value={summary.newCards} />
                  <CountCell label="Fällig" value={summary.dueCards} />
                  <CountCell label="Gesamt" value={summary.totalCards} />

                  <div className="flex items-center md:block">
                    <CoreStatusBadge mode={deck.deckSettings?.coreMode} />
                  </div>

                  <div className="flex items-center gap-2 md:justify-end">
                    <button type="button" onClick={() => onStartDeck(deck, false)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
                      <Play size={16} aria-hidden="true" />
                      Lernen
                    </button>
                  </div>

                  <div className="flex justify-start md:justify-end">
                    <button
                      type="button"
                      onClick={() => toggleOptions(deck.id)}
                      className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1] hover:bg-white"
                      aria-label="Stapeloptionen"
                      aria-haspopup="menu"
                      aria-expanded={isOptionsOpen}
                      aria-controls={menuId}
                    >
                      <Ellipsis size={18} aria-hidden="true" />
                    </button>
                    {isOptionsOpen ? (
                      <div id={menuId} role="menu" className="core-overlay absolute right-3 top-[calc(100%-0.75rem)] z-10 min-w-48 rounded-xl p-2 text-sm font-semibold text-[#17214f]">
                        <button type="button" role="menuitem" onClick={() => openDeckManagement(deck.id)} className="block min-h-10 w-full rounded-lg px-3 text-left hover:bg-[#f2f4fd]">
                          Stapel verwalten
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </SoftPanel>
      )}
    </div>
  );
}
