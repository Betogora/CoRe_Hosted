import React from "react";
import { ChevronDown, ChevronRight, FolderPlus, Layers, Play, PlusSquare, Settings } from "lucide-react";
import { createDeckLibraryModel, createVisibleDeckRows } from "../libraryModel.ts";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

const INTERACTIVE_ROW_SELECTOR = "button, a, input, textarea, select";
const LEARN_DECK_GRID_COLUMNS = "md:grid-cols-[minmax(12rem,1fr)_6rem_6rem_6rem_7rem_3rem]";
const LEARN_GROUP_STYLES = [
  { backgroundColor: "#fbfcff", borderColor: "#edf1f7" },
  { backgroundColor: "#f8f9fc", borderColor: "#e8edf5" },
  { backgroundColor: "#f4f6fa", borderColor: "#e3e8f1" },
  { backgroundColor: "#eef2f7", borderColor: "#dde5f0" },
];

function CountCell({ label, metric, value }: any) {
  return (
    <div className="hidden text-right md:block" aria-label={`${label}: ${value}`} data-learn-count-cell={metric}>
      <span aria-hidden="true" className="block text-lg font-semibold text-[#17214f]">
        {value}
      </span>
    </div>
  );
}

function isInteractiveRowTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_ROW_SELECTOR));
}

function getLearnGroupStyle(depth = 0) {
  return LEARN_GROUP_STYLES[Math.min(Math.max(0, depth), LEARN_GROUP_STYLES.length - 1)];
}

function createVisibleDeckTree(rows: any[] = []): any[] {
  const nodesById = new Map<string, any>(rows.map((row) => [row.id, { row, children: [] as any[] }]));
  const roots: any[] = [];

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
  };
}

export function LearnScreen({ decks, onStartDeck, onCreateDeck, initialParentDeckId = "", onDeckCreationHandled, onOpenCardCreation, onOpenDecks, onOpenDeckSettings }: any) {
  const library = createDeckLibraryModel(decks);
  const [collapsedDeckIds, setCollapsedDeckIds] = React.useState<Set<string>>(() => new Set());
  const [isDeckCreateOpen, setIsDeckCreateOpen] = React.useState(Boolean(initialParentDeckId));
  const [deckDraft, setDeckDraft] = React.useState(() => createDefaultDeckDraft(initialParentDeckId));
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const createToggleRef = React.useRef<HTMLButtonElement | null>(null);
  const deckNameRef = React.useRef<HTMLInputElement | null>(null);
  const visibleRows = createVisibleDeckRows(library.rows, collapsedDeckIds);
  const visibleTree = React.useMemo(() => createVisibleDeckTree(visibleRows), [visibleRows]);

  React.useEffect(() => {
    if (!initialParentDeckId) return;
    const parentDeck = decks.find((deck: { id: string; }) => deck.id === initialParentDeckId);
    if (!parentDeck) return;

    setDeckDraft(createDefaultDeckDraft(parentDeck.id));
    setIsDeckCreateOpen(true);
    setDeckStatus(`Unterstapel unter "${parentDeck.name}" anlegen.`);
    setDeckStatusType("status");
    onDeckCreationHandled?.();
  }, [decks, initialParentDeckId, onDeckCreationHandled]);

  React.useEffect(() => {
    if (isDeckCreateOpen) deckNameRef.current?.focus();
  }, [isDeckCreateOpen]);

  function toggleCollapsed(deckId: string) {
    setCollapsedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function openDeckSettings(deckId: any) {
    onOpenDeckSettings(deckId);
  }

  function updateDeckDraft(key: string, value: string) {
    setDeckDraft((current) => ({ ...current, [key]: value }));
  }

  function createDeckFromDraft(event: { preventDefault: () => void; }) {
    event.preventDefault();
    const name = deckDraft.name.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      setDeckStatusType("alert");
      return;
    }

    const created = onCreateDeck({
      name,
      parentDeckId: deckDraft.parentDeckId || null,
    });
    setDeckDraft(createDefaultDeckDraft(created.parentDeckId ?? ""));
    setIsDeckCreateOpen(false);
    setDeckStatus(created.parentDeckId ? `Unterstapel "${created.name}" angelegt.` : `Stapel "${created.name}" angelegt.`);
    setDeckStatusType("status");
    window.requestAnimationFrame(() => createToggleRef.current?.focus());
  }

  function startDeckFromRow(event: React.MouseEvent<HTMLDivElement,MouseEvent>, deck: any) {
    if (event.defaultPrevented || isInteractiveRowTarget(event.target)) return;
    onStartDeck(deck, false);
  }

  function renderDeckGroup(node: { row: any; children: any[]; }) {
    const row = node.row;
    const deck = row.deck;
    const summary = row.summary;
    const isCollapsed = collapsedDeckIds.has(deck.id);

    return (
      <div
        key={deck.id}
        data-testid={`learn-deck-group-${deck.id}`}
        data-learn-deck-group="true"
        className="grid gap-2 rounded-2xl border p-2 transition md:gap-3 md:px-0 md:py-3"
        style={getLearnGroupStyle(row.depth)}
      >
        <div
          onClick={(event) => startDeckFromRow(event, deck)}
          data-testid={`learn-deck-row-${deck.id}`}
          data-learn-deck-row="true"
          className={`relative grid min-w-0 cursor-pointer gap-3 rounded-xl px-1 py-4 transition duration-150 hover:bg-white/60 ${LEARN_DECK_GRID_COLUMNS} md:items-center md:gap-3 md:px-3`}
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
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
              <span className="mt-1 block text-sm text-[#66709a] md:hidden">
                {summary.newCards} neu · {summary.dueCards} fällig · {summary.totalCards} gesamt
              </span>
            </span>
          </div>

          <CountCell label="Neu" metric="new" value={summary.newCards} />
          <CountCell label="Fällig" metric="due" value={summary.dueCards} />
          <CountCell label="Gesamt" metric="total" value={summary.totalCards} />

          <button type="button" onClick={() => onStartDeck(deck, false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-3 text-sm font-semibold text-white" aria-label={`${deck.name} lernen`}>
            <Play size={16} aria-hidden="true" />
            Lernen
          </button>

          <div className="flex justify-start md:justify-end">
            <button
              type="button"
              onClick={() => openDeckSettings(deck.id)}
              className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1] hover:bg-white"
              aria-label={`Stapeloptionen für ${deck.name}`}
              title={`Stapeloptionen für ${deck.name}`}
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
            ref={createToggleRef}
            type="button"
            onClick={() => {
              setIsDeckCreateOpen((current) => !current);
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
            onSubmit={createDeckFromDraft}
            className="core-overlay grid min-w-0 gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_auto]"
            data-testid="learn-deck-create-form"
          >
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapelname
            <input
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-medium text-[#17214f] outline-none"
              ref={deckNameRef}
              value={deckDraft.name}
              onChange={(event) => updateDeckDraft("name", event.target.value)}
              placeholder="z. B. Anatomie"
              aria-invalid={deckStatusType === "alert" || undefined}
              aria-describedby={deckStatus ? "learn-deck-create-status" : undefined}
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
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
            <FolderPlus size={17} aria-hidden="true" />
              Anlegen
          </button>
            {deckStatus ? <p id="learn-deck-create-status" className={`text-sm font-semibold sm:col-span-3 ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p> : null}
          </form>
        ) : deckStatus ? (
          <p id="learn-deck-create-status" className={`text-sm font-semibold ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p>
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
        <SoftPanel className="overflow-visible p-4 sm:p-5" data-testid="learn-deck-list">
          <div className={`hidden items-center gap-3 border-b border-[#e3e7f5] px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-[#66709a] md:grid ${LEARN_DECK_GRID_COLUMNS}`} data-testid="learn-deck-list-header">
            <span>Stapel</span>
            <span className="text-right" data-learn-column="new">Neu</span>
            <span className="text-right" data-learn-column="due">Fällig</span>
            <span className="text-right" data-learn-column="total">Gesamt</span>
            <span className="text-center">Start</span>
            <span className="sr-only">Optionen</span>
          </div>
          <div className="mt-3 grid gap-3" data-testid="learn-deck-tree">
            {visibleTree.map(renderDeckGroup)}
          </div>
        </SoftPanel>
      )}
    </div>
  );
}
