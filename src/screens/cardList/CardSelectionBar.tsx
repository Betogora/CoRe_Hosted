import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarClock, CalendarRange, ChevronDown, Flag, FlagOff, MoveRight, Pause, Play, RotateCcw, Sparkles, Star, StarOff, Tag, Tags, Trash2, X, type LucideIcon } from "lucide-react";
import type { CardBatchAction } from "../../cardBatchActions.ts";
import type { Deck } from "../../coreTypes.ts";
import { addLearningDays, getLearningDayKey, getLearningDayStartForKey } from "../../learningDay.ts";
import { IconButton } from "../../ui/actionUi.tsx";
import { CoreDatePicker } from "../../ui/CoreDatePicker.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { FlagPicker } from "../../ui/flagUi.tsx";
import { DeckSelect } from "../../ui/selectUi.tsx";
import { TagInput } from "../../ui/TagInput.tsx";

type MenuActionId = "deck" | "tags-add" | "tags-remove" | "flag" | "flag-remove" | "mark" | "unmark" | "suspend" | "unsuspend" | "bury" | "due" | "reset" | "variants" | "delete";

const MENU: ReadonlyArray<{ id: MenuActionId; label: string; icon: LucideIcon }> = [
  { id: "deck", label: "Stapel ändern", icon: MoveRight },
  { id: "tags-add", label: "Tags hinzufügen", icon: Tag },
  { id: "tags-remove", label: "Tags entfernen", icon: Tags },
  { id: "flag", label: "Flagge setzen", icon: Flag },
  { id: "flag-remove", label: "Flagge entfernen", icon: FlagOff },
  { id: "mark", label: "Markieren", icon: Star },
  { id: "unmark", label: "Markierung entfernen", icon: StarOff },
  { id: "suspend", label: "Aussetzen", icon: Pause },
  { id: "unsuspend", label: "Reaktivieren", icon: Play },
  { id: "bury", label: "Zurückstellen", icon: CalendarClock },
  { id: "due", label: "Fälligkeit setzen", icon: CalendarRange },
  { id: "reset", label: "Lernstand zurücksetzen", icon: RotateCcw },
  { id: "variants", label: "Varianten generieren", icon: Sparkles },
  { id: "delete", label: "Löschen", icon: Trash2 },
];

export function cardCount(count: number) {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "Karte" : "Karten"}`;
}

interface DialogState {
  id: MenuActionId;
  deckId: string;
  tags: string[];
  flag: number;
  from: string;
  to: string;
}

export interface CardSelectionBarProps {
  /** Selected cards; with `allHits` the count of all hits. */
  count: number;
  /** Hits of the flat list that can all be selected at once; null without a search. */
  hitTotal: number | null;
  allHits: boolean;
  /** No action while one runs or nothing is selected. */
  disabled: boolean;
  onSelectAllHits: () => void;
  onClear: () => void;
  decks: Deck[];
  flagNames: readonly string[];
  loadTagDirectory: React.ComponentProps<typeof TagInput>["loadDirectory"];
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  /** Absent while variant generation is unavailable or running. */
  onGenerateVariants?: () => void;
  onRun: (action: CardBatchAction, label: string) => Promise<void>;
}

/** Bar of the card table while cards are selected (KV4): count, `Alle N Treffer auswählen`, actions and clearing. */
export function CardSelectionBar({ count, hitTotal, allHits, disabled, onSelectAllHits, onClear, decks, flagNames, loadTagDirectory, now, dayStartHour, timeZone, onGenerateVariants, onRun }: CardSelectionBarProps) {
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [running, setRunning] = React.useState(false);
  const dayOptions = React.useMemo(() => ({ dayStartHour, timeZone }), [dayStartHour, timeZone]);
  const todayKey = getLearningDayKey(now, dayOptions) ?? "";
  const tomorrowKey = getLearningDayKey(addLearningDays(now, 1, dayOptions) ?? "", dayOptions) ?? "";
  const label = MENU.find((entry) => entry.id === dialog?.id)?.label ?? "";

  function open(id: MenuActionId) {
    setDialog({ id, deckId: decks.find((deck) => !deck.deletedAt)?.id ?? "", tags: [], flag: 1, from: tomorrowKey, to: tomorrowKey });
  }

  function actionOf(state: DialogState): CardBatchAction | null {
    switch (state.id) {
      case "deck": return state.deckId ? { kind: "deck", deckId: state.deckId } : null;
      case "tags-add": return state.tags.length ? { kind: "tags", add: state.tags, remove: [] } : null;
      case "tags-remove": return state.tags.length ? { kind: "tags", add: [], remove: state.tags } : null;
      case "flag": return { kind: "flag", flag: state.flag };
      case "flag-remove": return { kind: "flag", flag: 0 };
      case "mark": return { kind: "marked", marked: true };
      case "unmark": return { kind: "marked", marked: false };
      case "suspend": return { kind: "suspended", suspended: true };
      case "unsuspend": return { kind: "suspended", suspended: false };
      case "bury": return { kind: "bury" };
      case "reset": return { kind: "reset" };
      case "delete": return { kind: "delete" };
      case "due": {
        const [first, last] = state.from <= state.to ? [state.from, state.to] : [state.to, state.from];
        const dueAts: string[] = [];
        for (let key = first; key && key <= last && dueAts.length < 3660; key = getLearningDayKey(addLearningDays(getLearningDayStartForKey(key, dayOptions)!.toISOString(), 1, dayOptions) ?? "", dayOptions) ?? "") {
          dueAts.push(getLearningDayStartForKey(key, dayOptions)!.toISOString());
        }
        return dueAts.length ? { kind: "due", dueAts } : null;
      }
      default: return null;
    }
  }

  async function confirm() {
    if (!dialog) return;
    if (dialog.id === "variants") {
      setDialog(null);
      onGenerateVariants?.();
      return;
    }
    const action = actionOf(dialog);
    if (!action) return;
    setRunning(true);
    try {
      await onRun(action, label);
      setDialog(null);
    } finally {
      setRunning(false);
    }
  }

  const patch = (next: Partial<DialogState>) => setDialog((current) => current && { ...current, ...next });
  const fields = dialog ? (
    dialog.id === "deck" ? <DeckSelect ariaLabel="Zielstapel" className="w-full" value={dialog.deckId} decks={decks} onValueChange={(deckId) => patch({ deckId })} />
      : dialog.id === "tags-add" || dialog.id === "tags-remove" ? <TagInput tags={dialog.tags} loadDirectory={loadTagDirectory} label="Tags" labelHidden onChange={(tags) => patch({ tags })} />
        : dialog.id === "flag" ? <FlagPicker value={dialog.flag} names={flagNames} onValueChange={(flag) => patch({ flag: flag || dialog.flag })} />
          : dialog.id === "due" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 core-caption font-semibold text-core-secondary">Frühestens
                <CoreDatePicker value={dialog.from} min={tomorrowKey} today={todayKey} ariaLabel="Frühestens fällig" onValueChange={(from) => patch({ from, to: dialog.to < from ? from : dialog.to })} />
              </label>
              <label className="grid gap-1.5 core-caption font-semibold text-core-secondary">Spätestens
                <CoreDatePicker value={dialog.to} min={dialog.from || tomorrowKey} today={todayKey} ariaLabel="Spätestens fällig" onValueChange={(to) => patch({ to })} />
              </label>
              <p className="core-caption text-core-muted sm:col-span-2">Jede Karte bekommt einen zufälligen Tag im Zeitraum.</p>
            </div>
          )
            : dialog.id === "delete" ? <p className="core-body text-core-secondary">Gelöscht werden die Inhalte der Karten samt ihrer weiteren Karten.</p>
              : null
  ) : null;

  return (
    <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 sm:px-3" data-testid="card-selection-bar">
      <IconButton label="Auswahl aufheben" icon={X} variant="ghost" onClick={onClear} />
      <span className="core-body font-semibold text-core-text tabular-nums" aria-live="polite">{allHits ? `Alle ${cardCount(count)}` : cardCount(count)} ausgewählt</span>
      {hitTotal !== null && !allHits && hitTotal > count ? (
        <button type="button" className="core-body font-semibold text-core-action hover:underline" onClick={onSelectAllHits}>Alle {hitTotal.toLocaleString("de-DE")} Treffer auswählen</button>
      ) : null}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" disabled={disabled} className="core-action-secondary ml-auto inline-flex items-center gap-1.5" data-testid="card-selection-actions">
            Aktionen<ChevronDown size={16} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={8} collisionPadding={16} className="core-overlay z-[60] grid max-h-[min(32rem,var(--radix-popover-content-available-height))] w-64 gap-0.5 overflow-y-auto rounded-panel p-1.5">
            {MENU.filter((entry) => entry.id !== "variants" || onGenerateVariants).map(({ id, label: entryLabel, icon: Icon }) => (
              <Popover.Close asChild key={id}>
                <button type="button" className={`flex min-h-control w-full items-center gap-2.5 rounded-inset px-2.5 text-left core-body hover:bg-core-subtle ${id === "delete" ? "text-core-danger-text" : "text-core-text"}`} onClick={() => open(id)}>
                  <Icon size={16} aria-hidden="true" />{entryLabel}
                </button>
              </Popover.Close>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {dialog ? (
        <ActionDialog
          open
          title={`${label}: ${cardCount(count)}`}
          description={fields ?? undefined}
          confirmLabel={label}
          cancelLabel="Abbrechen"
          destructive={dialog.id === "delete"}
          confirmLoading={running}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}
