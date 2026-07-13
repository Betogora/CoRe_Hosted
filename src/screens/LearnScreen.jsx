import React from "react";
import { ChevronDown, ChevronRight, FolderPlus, Layers, Palette, PlusSquare, Settings } from "lucide-react";
import { DEFAULT_DECK_APPEARANCE, normalizeDeckAppearance } from "../coreModel.ts";
import { createDeckLibraryModel, createVisibleDeckRows } from "../libraryModel.ts";
import { ColorPopover, ColorToolButton, defaultTextColors, normalizeColor, textPaletteColors, useStoredColorSlots } from "../ui/colorPicker.jsx";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.jsx";
import { DeckAppearanceIcon, deckIconOptions } from "../ui/deckAppearance.jsx";

const INTERACTIVE_DRAG_SELECTOR = "button, a, input, textarea, select, [role='dialog'], [role='menu'], [role='menuitem']";
const LEARN_TOP_LEVEL_GUTTER_PX = 28;
const LEARN_DECK_GRID_COLUMNS = "md:grid-cols-[minmax(12rem,1fr)_6rem_6rem_6rem_8rem_3rem]";
const DECK_ICON_COLOR_STORAGE_KEY = "core.deck.iconColors";
const LEARN_GROUP_STYLES = [
  { backgroundColor: "#fbfcff", borderColor: "#edf1f7" },
  { backgroundColor: "#f8f9fc", borderColor: "#e8edf5" },
  { backgroundColor: "#f4f6fa", borderColor: "#e3e8f1" },
  { backgroundColor: "#eef2f7", borderColor: "#dde5f0" },
];

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

function CountCell({ label, metric, value }) {
  return (
    <div className="hidden text-right md:block" aria-label={`${label}: ${value}`} data-learn-count-cell={metric}>
      <span aria-hidden="true" className="block text-lg font-semibold text-[#17214f]">
        {value}
      </span>
    </div>
  );
}

function isInteractiveDragTarget(target) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_DRAG_SELECTOR));
}

function isRowElement(target) {
  return target instanceof Element && Boolean(target.closest("[data-learn-deck-row='true']"));
}

function getLearnGroupStyle(depth = 0) {
  return LEARN_GROUP_STYLES[Math.min(Math.max(0, depth), LEARN_GROUP_STYLES.length - 1)];
}

function createVisibleDeckTree(rows = []) {
  const nodesById = new Map(rows.map((row) => [row.id, { row, children: [] }]));
  const roots = [];

  for (const node of nodesById.values()) {
    const parentNode = node.row.parentDeckId ? nodesById.get(node.row.parentDeckId) : null;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }

  return roots;
}

function createDefaultDeckDraft(parentDeckId = "") {
  return {
    name: "",
    parentDeckId,
    iconKey: DEFAULT_DECK_APPEARANCE.iconKey,
    iconColor: DEFAULT_DECK_APPEARANCE.iconColor,
  };
}

export function LearnScreen({ decks, onStartDeck, onCreateDeck, initialParentDeckId = "", onDeckCreationHandled, onOpenCardCreation, onOpenDecks, onOpenDeckSettings, onMoveDeck }) {
  const library = createDeckLibraryModel(decks);
  const [collapsedDeckIds, setCollapsedDeckIds] = React.useState(() => new Set());
  const [draggedDeckId, setDraggedDeckId] = React.useState(null);
  const [dropIntent, setDropIntent] = React.useState(null);
  const [dragStatus, setDragStatus] = React.useState("");
  const [isDeckCreateOpen, setIsDeckCreateOpen] = React.useState(false);
  const [deckDraft, setDeckDraft] = React.useState(() => createDefaultDeckDraft());
  const [deckStatus, setDeckStatus] = React.useState("");
  const [openAppearanceMenu, setOpenAppearanceMenu] = React.useState(null);
  const [selectedIconColorSlot, setSelectedIconColorSlot] = React.useState(0);
  const [iconColors, updateIconColorSlot] = useStoredColorSlots(DECK_ICON_COLOR_STORAGE_KEY, defaultTextColors);
  const draggedDeckIdRef = React.useRef(null);
  const lastDragEndAtRef = React.useRef(0);
  const deckCreatePanelRef = React.useRef(null);
  const deckIconMenuId = React.useId();
  const deckColorMenuId = React.useId();
  const visibleRows = createVisibleDeckRows(library.rows, collapsedDeckIds);
  const visibleTree = React.useMemo(() => createVisibleDeckTree(visibleRows), [visibleRows]);
  const rowById = React.useMemo(() => new Map(library.rows.map((row) => [row.id, row])), [library.rows]);
  const selectedIconOption = deckIconOptions.find((option) => option.key === deckDraft.iconKey) ?? deckIconOptions[0];

  React.useEffect(() => {
    if (!initialParentDeckId) return;
    const parentDeck = decks.find((deck) => deck.id === initialParentDeckId);
    if (!parentDeck) return;

    setDeckDraft(createDefaultDeckDraft(parentDeck.id));
    setIsDeckCreateOpen(true);
    setDeckStatus(`Unterstapel unter "${parentDeck.name}" anlegen.`);
    onDeckCreationHandled?.();
  }, [decks, initialParentDeckId, onDeckCreationHandled]);

  React.useEffect(() => {
    if (!openAppearanceMenu || typeof document === "undefined") return undefined;

    function closeAppearanceMenu(event) {
      if (!deckCreatePanelRef.current?.contains(event.target)) {
        setOpenAppearanceMenu(null);
      }
    }

    document.addEventListener("mousedown", closeAppearanceMenu);
    return () => document.removeEventListener("mousedown", closeAppearanceMenu);
  }, [openAppearanceMenu]);

  function toggleCollapsed(deckId) {
    setCollapsedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function openDeckSettings(deckId) {
    onOpenDeckSettings(deckId);
  }

  function updateDeckDraft(key, value) {
    setDeckDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDeckAppearance(patch) {
    setDeckDraft((current) => {
      const appearance = normalizeDeckAppearance({
        iconKey: current.iconKey,
        iconColor: current.iconColor,
        ...patch,
      });

      return {
        ...current,
        ...appearance,
      };
    });
  }

  function createDeckFromDraft(event) {
    event.preventDefault();
    const name = deckDraft.name.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      return;
    }

    const created = onCreateDeck({
      name,
      parentDeckId: deckDraft.parentDeckId || null,
      deckSettings: {
        appearance: normalizeDeckAppearance({
          iconKey: deckDraft.iconKey,
          iconColor: deckDraft.iconColor,
        }),
      },
    });
    setDeckDraft(createDefaultDeckDraft(created.parentDeckId ?? ""));
    setIsDeckCreateOpen(false);
    setOpenAppearanceMenu(null);
    setDeckStatus(created.parentDeckId ? `Unterstapel "${created.name}" angelegt.` : `Stapel "${created.name}" angelegt.`);
  }

  function readDraggedDeckId(event) {
    return event.dataTransfer?.getData("text/plain") || draggedDeckIdRef.current || draggedDeckId;
  }

  function clearDragState() {
    if (draggedDeckIdRef.current || draggedDeckId) {
      lastDragEndAtRef.current = Date.now();
    }
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

  function startDeckFromRow(event, deck) {
    if (event.defaultPrevented || isInteractiveDragTarget(event.target)) return;
    if (Date.now() - lastDragEndAtRef.current < 250) return;
    onStartDeck(deck, false);
  }

  function startDeckFromKeyboard(event, deck) {
    if (isInteractiveDragTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onStartDeck(deck, false);
  }

  function isInvalidDropTarget(row, sourceDeckId) {
    const sourceRow = rowById.get(sourceDeckId);
    return !sourceDeckId || row.id === sourceDeckId || Boolean(sourceRow?.scopeDeckIds?.includes(row.id));
  }

  function createRowDropIntent(event, row) {
    const sourceDeckId = readDraggedDeckId(event);
    const invalid = isInvalidDropTarget(row, sourceDeckId);
    const rowRect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rowRect.left;
    const shouldMoveToTopLevel = row.depth > 0 && pointerX <= LEARN_TOP_LEVEL_GUTTER_PX;

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

  function renderDeckGroup(node) {
    const row = node.row;
    const deck = row.deck;
    const summary = row.summary;
    const isCollapsed = collapsedDeckIds.has(deck.id);
    const isDragged = draggedDeckId === deck.id;
    const isDeckDropTarget = dropIntent?.targetDeckId === deck.id && !dropIntent.invalid && dropIntent.parentDeckId === deck.id;
    const isOutdentDropTarget = dropIntent?.targetDeckId === deck.id && !dropIntent.invalid && dropIntent.kind === "top";
    const isInvalidDropTarget = dropIntent?.targetDeckId === deck.id && dropIntent.invalid;

    return (
      <div
        key={deck.id}
        data-testid={`learn-deck-group-${deck.id}`}
        data-learn-deck-group="true"
        className={`grid gap-2 rounded-2xl border p-2 transition md:gap-3 md:px-0 md:py-3 ${isDragged ? "opacity-60" : ""}`}
        style={getLearnGroupStyle(row.depth)}
      >
        <div
          draggable={Boolean(onMoveDeck)}
          onDragStart={(event) => startDeckDrag(event, row)}
          onDragEnd={clearDragState}
          onDragOver={(event) => allowRowDrop(event, row)}
          onDragLeave={leaveDropTarget}
          onDrop={(event) => dropDeck(event, createRowDropIntent(event, row))}
          onClick={(event) => startDeckFromRow(event, deck)}
          onKeyDown={(event) => startDeckFromKeyboard(event, deck)}
          role="button"
          tabIndex={0}
          aria-label={`${deck.name} lernen`}
          data-testid={`learn-deck-row-${deck.id}`}
          data-learn-deck-row="true"
          className={`relative grid min-w-0 cursor-pointer gap-3 rounded-xl px-1 py-4 transition duration-150 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c96dc] ${LEARN_DECK_GRID_COLUMNS} md:items-center md:gap-3 md:px-3 ${
            onMoveDeck ? "active:cursor-grabbing" : ""
          } ${isDeckDropTarget ? "bg-[#eef1fb] ring-2 ring-[#8c96dc]" : ""} ${isOutdentDropTarget ? "bg-white/85 shadow-[inset_5px_0_0_#8c96dc]" : ""} ${
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
            <DeckAppearanceIcon deck={deck} className="size-10 rounded-xl bg-[#eef1fb]" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
              <span className="mt-1 block text-sm text-[#66709a] md:hidden">
                {summary.newCards} neu · {summary.dueCards} fällig · {summary.totalCards} gesamt
              </span>
              {row.hasChildren ? <span className="mt-1 block text-xs font-semibold text-[#66709a]">{row.childrenCount} Unterstapel</span> : null}
            </span>
          </div>

          <CountCell label="Neu" metric="new" value={summary.newCards} />
          <CountCell label="Fällig" metric="due" value={summary.dueCards} />
          <CountCell label="Gesamt" metric="total" value={summary.totalCards} />

          <div className="flex items-center md:block">
            <CoreStatusBadge mode={deck.deckSettings?.coreMode} />
          </div>

          <div className="flex justify-start md:justify-end">
            <button
              type="button"
              onClick={() => openDeckSettings(deck.id)}
              className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1] hover:bg-white"
              aria-label={`Einstellungen für ${deck.name}`}
              title={`Lernoptionen für ${deck.name}`}
            >
              <Settings size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {node.children.length > 0 ? (
          <div data-learn-deck-children="true" className="grid gap-2 md:gap-3">
            {node.children.map(renderDeckGroup)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
      />

      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onOpenDecks()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
            <Layers size={17} aria-hidden="true" />
            Kartenstapel
          </button>
          <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDeckCreateOpen((current) => !current);
              setOpenAppearanceMenu(null);
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]"
            aria-expanded={isDeckCreateOpen}
            aria-controls="learn-deck-create-form"
            data-testid="learn-deck-create-toggle"
          >
            <FolderPlus size={17} aria-hidden="true" />
            Stapel anlegen
          </button>
        </div>
        {isDeckCreateOpen ? (
          <form
            id="learn-deck-create-form"
            ref={deckCreatePanelRef}
            onSubmit={createDeckFromDraft}
            className="core-overlay relative z-40 grid min-w-0 gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(8rem,auto)_minmax(8rem,auto)_auto]"
            data-testid="learn-deck-create-form"
          >
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapelname
            <input
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-medium text-[#17214f] outline-none"
              value={deckDraft.name}
              onChange={(event) => updateDeckDraft("name", event.target.value)}
              placeholder="z. B. Anatomie"
              data-testid="learn-deck-name-input"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Ebene
            <select
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-medium text-[#17214f]"
              value={deckDraft.parentDeckId}
              onChange={(event) => updateDeckDraft("parentDeckId", event.target.value)}
              data-testid="learn-deck-parent-select"
            >
              <option value="">Als Hauptstapel</option>
              {library.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {"— ".repeat(row.depth)}{row.path}
                </option>
              ))}
            </select>
          </label>
            <div className="relative grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
              <span>Icon</span>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-2 text-sm font-semibold text-[#17214f] transition hover:bg-[#f8f9fe]"
                aria-haspopup="dialog"
                aria-expanded={openAppearanceMenu === "icon"}
                aria-controls={openAppearanceMenu === "icon" ? deckIconMenuId : undefined}
                onClick={() => setOpenAppearanceMenu((current) => (current === "icon" ? null : "icon"))}
                data-testid="learn-deck-icon-button"
              >
                <DeckAppearanceIcon appearance={deckDraft} className="size-8 rounded-lg bg-[#eef1fb]" iconSize={17} />
                <span className="truncate">{selectedIconOption.label}</span>
              </button>
              {openAppearanceMenu === "icon" ? (
                <div id={deckIconMenuId} role="dialog" aria-label="Icon auswählen" className="core-overlay absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">
                    <span>Icon</span>
                    <DeckAppearanceIcon appearance={deckDraft} className="size-7 rounded-lg bg-[#eef1fb]" iconSize={15} />
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {deckIconOptions.map((option) => {
                      const Icon = option.icon;
                      const isSelected = option.key === deckDraft.iconKey;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={`grid size-9 place-items-center rounded-lg border bg-white transition hover:bg-[#f8f9fe] ${
                            isSelected ? "border-[#4f5eb1] shadow-[0_0_0_2px_rgba(79,94,177,0.13)]" : "border-[#dfe4f5]"
                          }`}
                          title={option.label}
                          aria-label={`Icon ${option.label}`}
                          aria-pressed={isSelected}
                          onClick={() => {
                            updateDeckAppearance({ iconKey: option.key });
                            setOpenAppearanceMenu(null);
                          }}
                        >
                          <Icon size={18} color={deckDraft.iconColor} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
              <span>Iconfarbe</span>
              <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-2">
                <ColorToolButton
                  label="Iconfarbe"
                  icon={Palette}
                  color={deckDraft.iconColor}
                  isOpen={openAppearanceMenu === "color"}
                  menuId={deckColorMenuId}
                  onToggle={() => setOpenAppearanceMenu((current) => (current === "color" ? null : "color"))}
                />
                <span className="font-mono text-sm font-semibold uppercase text-[#17214f]">{deckDraft.iconColor}</span>
              </div>
              {openAppearanceMenu === "color" ? (
                <ColorPopover
                  id={deckColorMenuId}
                  label="Iconfarbe"
                  icon={Palette}
                  colors={iconColors}
                  paletteColors={textPaletteColors}
                  selectedSlot={selectedIconColorSlot}
                  onSelectSlot={setSelectedIconColorSlot}
                  onApply={(color) => updateDeckAppearance({ iconColor: normalizeColor(color, DEFAULT_DECK_APPEARANCE.iconColor) })}
                  onChangeSlot={updateIconColorSlot}
                />
              ) : null}
            </div>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
            <FolderPlus size={17} aria-hidden="true" />
              Anlegen
          </button>
            {deckStatus ? <p className="text-sm font-semibold text-[#66709a] sm:col-span-5" role="status" aria-live="polite">{deckStatus}</p> : null}
          </form>
        ) : deckStatus ? (
          <p className="text-sm font-semibold text-[#66709a]" role="status" aria-live="polite">{deckStatus}</p>
        ) : null}
      </div>

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Keine Karten"
          body="Erstelle oder importiere zuerst einen Stapel."
          action={
            <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
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
          <span className="sr-only" role="status" aria-live="polite">
            {dragStatus}
          </span>
          <div className={`hidden items-center gap-3 border-b border-[#e3e7f5] px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-[#66709a] md:grid ${LEARN_DECK_GRID_COLUMNS}`} data-testid="learn-deck-list-header">
            <span>Stapel</span>
            <span className="text-right" data-learn-column="new">Neu</span>
            <span className="text-right" data-learn-column="due">Fällig</span>
            <span className="text-right" data-learn-column="total">Gesamt</span>
            <span>CoRe</span>
            <span className="sr-only">Extras</span>
          </div>
          <div className="mt-3 grid gap-3" data-testid="learn-deck-tree">
            {visibleTree.map(renderDeckGroup)}
          </div>
        </SoftPanel>
      )}
    </div>
  );
}
