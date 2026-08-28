import React from "react";
import { ChevronRight, FolderPlus, Layers, Settings2 } from "lucide-react";
import type { LearnScreenProps } from "../appScreenProps.ts";
import { DECK_DEPTH_ERROR, MAX_INTERACTIVE_DECK_LEVELS } from "../coreWorkspace.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, EmptyState, PageHeader } from "../ui/coreUi.tsx";
import { DeckTree } from "../ui/DeckTree.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";
import { learnAreaOptions, type LearnArea } from "./screenConstants.ts";

function createDefaultDeckDraft(parentDeckId = "") {
  return {
    name: "",
    parentDeckId,
  };
}

export function LearnScreen({ decks, deckSummaries, now, dayStartHour, learnAheadMinutes, timeZone, onStartDeck, onCreateDeck, focusedDeckId = null, initialParentDeckId = "", onDeckCreationHandled, onFocusDeck, onOpenCardCreation, onOpenDecks, onOpenCardSettings, onOpenDeckSettings, onSetDeckCoreMode, onMoveDeck, collapsedDeckIds, onSetDeckExpanded }: LearnScreenProps) {
  const library = React.useMemo(() => createDeckLibraryModel(decks, { now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries }), [dayStartHour, deckSummaries, decks, learnAheadMinutes, now, timeZone]);
  const [deckDraft, setDeckDraft] = React.useState(() => createDefaultDeckDraft(initialParentDeckId));
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const setSuccessToast = useSuccessToast();
  const deckNameRef = React.useRef<HTMLInputElement | null>(null);
  const focusedRow = library.rows.find((row) => row.id === focusedDeckId) ?? null;
  const eligibleParentDeckIds = React.useMemo(
    () => library.rows.filter((row) => row.depth < MAX_INTERACTIVE_DECK_LEVELS - 1).map((row) => row.id),
    [library.rows],
  );
  const focusedDeckMissing = Boolean(focusedDeckId && !focusedRow);

  React.useEffect(() => {
    if (!initialParentDeckId) return;
    const parentRow = library.rows.find((row) => row.id === initialParentDeckId);
    if (!parentRow) return;

    if (parentRow.depth >= MAX_INTERACTIVE_DECK_LEVELS - 1) {
      setDeckDraft(createDefaultDeckDraft());
      setDeckStatus(DECK_DEPTH_ERROR);
      setDeckStatusType("alert");
      onDeckCreationHandled?.();
      return;
    }

    setDeckDraft(createDefaultDeckDraft(parentRow.id));
    setDeckStatus(`Unterstapel unter "${parentRow.name}" anlegen.`);
    setDeckStatusType("status");
    onDeckCreationHandled?.();
    window.requestAnimationFrame(() => deckNameRef.current?.focus());
  }, [initialParentDeckId, library.rows, onDeckCreationHandled]);

  function updateDeckDraft(key: string, value: string) {
    setDeckDraft((current) => ({ ...current, [key]: value }));
  }

  function createDeckFromDraft(event: { preventDefault: () => void; }) {
    event.preventDefault();
    const name = deckDraft.name.trim();
    if (!name) {
      setSuccessToast("");
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      setDeckStatusType("alert");
      return;
    }

    const created = onCreateDeck({
      name,
      parentDeckId: deckDraft.parentDeckId || null,
    });
    if (!created) {
      setSuccessToast("");
      setDeckStatus("Der Stapel konnte nicht angelegt werden.");
      setDeckStatusType("alert");
      return;
    }
    setDeckDraft(createDefaultDeckDraft(created.parentDeckId ?? ""));
    setDeckStatus("");
    setDeckStatusType("status");
    setSuccessToast(created.parentDeckId
      ? `Unterstapel „${created.name}“ wurde erfolgreich angelegt.`
      : `Stapel „${created.name}“ wurde erfolgreich angelegt.`);
    window.requestAnimationFrame(() => deckNameRef.current?.focus());
  }

  const deckCreateForm = (
    <form
      onSubmit={createDeckFromDraft}
      className="grid min-w-0 gap-3 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_auto]"
      data-testid="learn-deck-create-form"
    >
      <label className="grid min-w-0 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
        Stapelname
        <input
          className="min-h-11 min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-medium text-[var(--core-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus-ring-soft)]"
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
        <DeckSelect
          ariaLabel="Ebene"
          className="w-full font-medium"
          value={deckDraft.parentDeckId}
          decks={decks}
          selectableDeckIds={eligibleParentDeckIds}
          specialOption={{ value: "", label: "Als Hauptstapel", icon: Layers }}
          onValueChange={(parentDeckId) => updateDeckDraft("parentDeckId", parentDeckId)}
          testId="learn-deck-parent-select"
        />
      </label>
      <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2">
        <FolderPlus size={17} aria-hidden="true" />
        Anlegen
      </button>
      {deckStatus ? <p id="learn-deck-create-status" className={`core-body font-semibold sm:col-span-3 ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p> : null}
    </form>
  );

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CoreSegmentedControl<LearnArea>
              ariaLabel="Bereich in Lernen"
              options={learnAreaOptions}
              value="overview"
              onValueChange={(area) => {
                if (area === "cards") onOpenDecks(focusedDeckId);
              }}
              className="core-learning-area-control"
            />
            <ActionButton type="button" variant="secondary" icon={Settings2} onClick={onOpenCardSettings}>
              Karteneinstellungen
            </ActionButton>
          </div>
        }
      />

      <DeckTree
        rows={focusedDeckMissing ? [] : library.rows}
        mode="learn"
        contentBeforeRows={deckCreateForm}
        collapsedDeckIds={collapsedDeckIds}
        onDeckExpansionChange={(deckId, expanded) => onSetDeckExpanded("learn", deckId, expanded)}
        onActivate={(row) => onStartDeck(row.deck, false)}
        onOpenSettings={onOpenDeckSettings}
        onSetDeckCoreMode={onSetDeckCoreMode}
        onMoveDeck={onMoveDeck}
      />

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
      ) : null}
    </div>
  );
}
