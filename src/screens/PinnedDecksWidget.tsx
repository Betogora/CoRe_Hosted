import React from "react";
import { Check, Pin, PinOff, Play, Plus } from "lucide-react";
import type { DeckLibraryRow } from "../libraryModel.ts";
import type { Deck } from "../coreTypes.ts";
import { DASHBOARD_PIN_LIMIT, fillDashboardDecks, leastFrequentPin } from "../uiPreferences.ts";
import { CrossLinkButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, SoftPanel } from "../ui/coreUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { CoreRadio } from "../ui/formControls.tsx";
import { LEARNING_STATUS_UI } from "../ui/learningStatusUi.ts";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";

const COUNTS = [
  { ...LEARNING_STATUS_UI.new, key: "newCards", metric: "new" },
  { ...LEARNING_STATUS_UI.inProgress, key: "inProgressCards", metric: "in-progress" },
  { ...LEARNING_STATUS_UI.due, key: "dueCards", metric: "due" },
] as const;

const FREE_ICON = { "--core-deck-icon-background": "transparent" } as React.CSSProperties;

function DeckName({ deck }: { deck: Deck }) {
  return <><DeckAppearanceIcon deck={deck} className="mr-1 inline-grid h-[1lh] w-5 align-top" iconSize={16} style={FREE_ICON} /><span className="font-semibold text-core-text">„{deck.name}“</span></>;
}

export function PinnedDecksWidget({ rows, decks, pinnedDeckIds, frequentDeckIds, onPinnedDeckIdsChange, onStudy, onOpenLibrary }: {
  rows: readonly DeckLibraryRow[];
  decks: readonly Deck[];
  pinnedDeckIds: readonly string[];
  frequentDeckIds: readonly string[];
  onPinnedDeckIdsChange: (pinnedDeckIds: string[]) => void;
  onStudy: (row: DeckLibraryRow) => void;
  onOpenLibrary: () => void;
}) {
  const [unpinning, setUnpinning] = React.useState<DeckLibraryRow | null>(null);
  const [replacing, setReplacing] = React.useState<{ deck: Deck; replacedId: string } | null>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const unpinButton = React.useRef<HTMLElement | null>(null);
  const rowById = React.useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const shown = React.useMemo(
    () => fillDashboardDecks(pinnedDeckIds, frequentDeckIds, rows.filter((row) => row.depth === 0).map((row) => row.id), new Set(rowById.keys())),
    [frequentDeckIds, pinnedDeckIds, rowById, rows],
  );
  const pinned = shown.filter((entry) => entry.pinned).map((entry) => entry.id);
  const pinnableDeckIds = rows.filter((row) => !pinned.includes(row.id)).map((row) => row.id);
  const title = pinned.length ? "Angepinnte Stapel" : "Oft gelernte Stapel";
  // Sync may change the pins while the dialog is open; the choice then falls back to a current pin.
  const replacedId = replacing && pinned.includes(replacing.replacedId) ? replacing.replacedId : pinned.at(-1);

  function pin(deckId: string) {
    if (pinned.length < DASHBOARD_PIN_LIMIT) { onPinnedDeckIdsChange([deckId, ...pinned]); return; }
    const deck = rowById.get(deckId)?.deck;
    if (deck) setReplacing({ deck, replacedId: leastFrequentPin(pinned, frequentDeckIds) });
  }

  return <SoftPanel className="dashboard-pins min-w-0 p-5">
    <SectionHeader level={2} title={title} action={pinnableDeckIds.length ? <DeckSelect
      ref={addButton}
      triggerIcon={Plus}
      ariaLabel="Stapel anpinnen"
      value=""
      decks={decks}
      selectableDeckIds={pinnableDeckIds}
      menuAlign="end"
      onValueChange={pin}
    /> : null} />
    <ul className="dashboard-pins-list" aria-label={title}>
      {shown.map(({ id, pinned: isPinned }) => {
        const row = rowById.get(id)!;
        const { summary } = row;
        const startable = row.dailyLearningSession.startableCount > 0;
        const shownCounts = COUNTS.filter((count) => summary[count.key] > 0);
        const status = summary.totalCards === 0 ? "Keine Karten" : shownCounts.length ? "Später weiterlernen" : "Erledigt";
        return <li key={id} className="dashboard-pin" data-pinned={isPinned} data-testid={`${isPinned ? "pinned" : "suggested"}-deck-${id}`}>
          <DeckAppearanceIcon deck={row.deck} className="size-8" iconSize={18} style={FREE_ICON} />
          <div className="min-w-0" title={row.path}>
            <h3 className={`dashboard-pin-name core-body-large text-core-text ${row.depth === 0 ? "font-semibold" : "font-medium"}`}>{row.name}</h3>
            <div className="dashboard-pin-meta core-caption">
              {shownCounts.length ? <dl className="contents" aria-label={`Lernstand für ${row.path}`}>
                {shownCounts.map((count) => <div key={count.metric} className="dashboard-pin-count" style={{ "--core-deck-count-color": count.color } as React.CSSProperties}>
                  <dt className="text-core-muted">{count.label.toLowerCase()}</dt>
                  <dd className="core-deck-summary-count-value">{summary[count.key]}</dd>
                </div>)}
              </dl> : null}
              {startable ? null : status === "Erledigt"
                ? <p className="inline-flex items-center gap-1 font-semibold text-core-success"><Check size={14} aria-hidden="true" />Erledigt</p>
                : <p className="text-core-muted">{status}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isPinned
              ? <IconButton icon={PinOff} variant="ghost" label={`${row.path} lösen`} onClick={(event) => { unpinButton.current = event.currentTarget; setUnpinning(row); }} />
              : <IconButton icon={Pin} variant="ghost" label={`${row.path} anpinnen`} onClick={() => pin(id)} />}
            {startable ? <button type="button" className="core-action-primary dashboard-pin-play" aria-label={`${row.path} lernen`} onClick={() => onStudy(row)}>
              <Play size={16} fill="currentColor" aria-hidden="true" />
            </button> : null}
          </div>
        </li>;
      })}
    </ul>
    <CrossLinkButton className="mt-3" onSelect={onOpenLibrary}>Alle Stapel ansehen</CrossLinkButton>
    <ActionDialog
      open={unpinning !== null}
      title="Stapel lösen?"
      description={unpinning ? <p><DeckName deck={unpinning.deck} /> ist nicht mehr angepinnt. Der Stapel und seine Karten bleiben erhalten.</p> : null}
      confirmLabel="Lösen"
      cancelLabel="Abbrechen"
      onCancel={() => setUnpinning(null)}
      onConfirm={() => { onPinnedDeckIdsChange(pinned.filter((id) => id !== unpinning?.id)); setUnpinning(null); }}
      restoreFocus={(reason) => (reason === "confirm" ? addButton.current : unpinButton.current)?.focus()}
    />
    <ActionDialog
      open={replacing !== null}
      title="Welchen Stapel ersetzen?"
      description={replacing ? <div className="grid gap-4">
        <p><DeckName deck={replacing.deck} /> ersetzt den gewählten Stapel. Du kannst höchstens {DASHBOARD_PIN_LIMIT} Stapel anpinnen.</p>
        <div role="radiogroup" aria-label="Zu ersetzender Stapel" className="dashboard-pin-replace">
          {pinned.map((id) => {
            const row = rowById.get(id)!;
            return <CoreRadio key={id} name="dashboard-pin-replace" value={id} checked={replacedId === id} onCheckedChange={() => setReplacing({ ...replacing, replacedId: id })} label={<span className="inline-flex items-center gap-2" title={row.path}><DeckAppearanceIcon deck={row.deck} className="size-6" iconSize={16} style={FREE_ICON} />{row.name}</span>} />;
          })}
        </div>
      </div> : null}
      confirmLabel="Ersetzen"
      cancelLabel="Abbrechen"
      onCancel={() => setReplacing(null)}
      onConfirm={() => {
        if (replacing) onPinnedDeckIdsChange([replacing.deck.id, ...pinned.filter((id) => id !== replacing.deck.id && (pinned.length < DASHBOARD_PIN_LIMIT || id !== replacedId))]);
        setReplacing(null);
      }}
      restoreFocus={() => addButton.current?.focus()}
    />
  </SoftPanel>;
}
