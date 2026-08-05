import React from "react";
import { ChevronRight, FolderPlus, Layers, PlusSquare } from "lucide-react";
import type { LearnScreenProps } from "../appScreenProps.ts";
import { DECK_DEPTH_ERROR, MAX_INTERACTIVE_DECK_LEVELS } from "../coreWorkspace.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckTree } from "../ui/DeckTree.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

function createDefaultDeckDraft(parentDeckId = "") {
  return {
    name: "",
    parentDeckId,
  };
}

export function LearnScreen({ decks, onStartDeck, onCreateDeck, focusedDeckId = null, initialParentDeckId = "", onDeckCreationHandled, onFocusDeck, onOpenCardCreation, onOpenDecks, onOpenDeckSettings, onMoveDeck }: LearnScreenProps) {
  const library = React.useMemo(() => createDeckLibraryModel(decks), [decks]);
  const [isDeckCreateOpen, setIsDeckCreateOpen] = React.useState(Boolean(initialParentDeckId));
  const [deckDraft, setDeckDraft] = React.useState(() => createDefaultDeckDraft(initialParentDeckId));
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const createToggleRef = React.useRef<HTMLButtonElement | null>(null);
  const deckNameRef = React.useRef<HTMLInputElement | null>(null);
  const focusedRow = library.rows.find((row) => row.id === focusedDeckId) ?? null;
  const eligibleParentOptions = React.useMemo(() => [
    { value: "", label: "Als Hauptstapel" },
    ...library.rows
      .filter((row) => row.depth < MAX_INTERACTIVE_DECK_LEVELS - 1)
      .map((row) => ({ value: row.id, label: `${"— ".repeat(row.depth)}${row.path}` })),
  ], [library.rows]);
  const focusedDeckMissing = Boolean(focusedDeckId && !focusedRow);

  React.useEffect(() => {
    if (!initialParentDeckId) return;
    const parentRow = library.rows.find((row) => row.id === initialParentDeckId);
    if (!parentRow) return;

    if (parentRow.depth >= MAX_INTERACTIVE_DECK_LEVELS - 1) {
      setDeckDraft(createDefaultDeckDraft());
      setIsDeckCreateOpen(false);
      setDeckStatus(DECK_DEPTH_ERROR);
      setDeckStatusType("alert");
      onDeckCreationHandled?.();
      return;
    }

    setDeckDraft(createDefaultDeckDraft(parentRow.id));
    setIsDeckCreateOpen(true);
    setDeckStatus(`Unterstapel unter "${parentRow.name}" anlegen.`);
    setDeckStatusType("status");
    onDeckCreationHandled?.();
  }, [initialParentDeckId, library.rows, onDeckCreationHandled]);

  React.useEffect(() => {
    if (isDeckCreateOpen) deckNameRef.current?.focus();
  }, [isDeckCreateOpen]);

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
    if (!created) {
      setDeckStatus("Der Stapel konnte nicht angelegt werden.");
      setDeckStatusType("alert");
      return;
    }
    setDeckDraft(createDefaultDeckDraft(created.parentDeckId ?? ""));
    setIsDeckCreateOpen(false);
    setDeckStatus(created.parentDeckId ? `Unterstapel "${created.name}" angelegt.` : `Stapel "${created.name}" angelegt.`);
    setDeckStatusType("status");
    window.requestAnimationFrame(() => createToggleRef.current?.focus());
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
      />

      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onOpenDecks(focusedDeckId)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-5 core-body font-semibold text-[var(--core-action-primary)]">
            <Layers size={17} aria-hidden="true" />
            Karten verwalten
          </button>
          <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-5 core-body font-semibold text-[var(--core-action-primary)]">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
          <button
            ref={createToggleRef}
            type="button"
            onClick={() => {
              setIsDeckCreateOpen((current) => !current);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-5 core-body font-semibold text-[var(--core-action-primary)]"
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
          <label className="grid min-w-0 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Stapelname
            <input
              className="min-h-11 min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-medium text-[var(--core-text)] outline-none"
              ref={deckNameRef}
              value={deckDraft.name}
              onChange={(event) => updateDeckDraft("name", event.target.value)}
              placeholder="z. B. Anatomie"
              aria-invalid={deckStatusType === "alert" || undefined}
              aria-describedby={deckStatus ? "learn-deck-create-status" : undefined}
              data-testid="learn-deck-name-input"
            />
          </label>
          <label className="grid min-w-0 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Ebene
            <CoreSelect
              ariaLabel="Ebene"
              className="w-full font-medium"
              value={deckDraft.parentDeckId}
              options={eligibleParentOptions}
              onValueChange={(parentDeckId) => updateDeckDraft("parentDeckId", parentDeckId)}
              testId="learn-deck-parent-select"
            />
          </label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] hover:bg-core-surface">
            <FolderPlus size={17} aria-hidden="true" />
              Anlegen
          </button>
            {deckStatus ? <p id="learn-deck-create-status" className={`core-body font-semibold sm:col-span-3 ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p> : null}
          </form>
        ) : deckStatus ? (
          <p id="learn-deck-create-status" className={`core-body font-semibold ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p>
        ) : null}
      </div>

      {focusedDeckMissing ? (
        <EmptyState
          icon={Layers}
          title="Stapel nicht gefunden oder nicht verfügbar."
          body="Der verlinkte Stapel wurde gelöscht oder steht in diesem Account nicht zur Verfügung."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => onFocusDeck(null)} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--core-surface-muted)] px-5 core-body font-semibold text-[var(--core-action-primary)]">
                Zu Lernen
              </button>
              <button type="button" onClick={() => onOpenDecks(null)} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--core-border)] bg-core-surface px-5 core-body font-semibold text-[var(--core-action-primary)]">
                Zur Kartenverwaltung
              </button>
            </div>
          }
        />
      ) : decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Keine Karten"
          body="Erstelle oder importiere zuerst einen Stapel."
          action={
            <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-5 core-body font-semibold text-[var(--core-action-primary)]">
              Erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <SoftPanel className="overflow-visible p-4 sm:p-5">
          <DeckTree
            rows={library.rows}
            mode="learn"
            onActivate={(row) => onStartDeck(row.deck, false)}
            onOpenSettings={(row) => onOpenDeckSettings(row.id)}
            onMoveDeck={onMoveDeck}
          />
        </SoftPanel>
      )}
    </div>
  );
}
