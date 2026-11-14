import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarClock, CalendarRange, ChevronDown, Flag, GraduationCap, FlagOff, MoveRight, Pause, Play, Replace, RotateCcw, Sparkles, Star, StarOff, Tag, Tags, Trash2, type LucideIcon } from "lucide-react";
import type { CardBatchAction, TextReplaceSession } from "../../cardBatchActions.ts";
import type { Deck } from "../../coreTypes.ts";
import { addLearningDays, getLearningDayKey, getLearningDayStartForKey } from "../../learningDay.ts";
import { ActionButton, CrossLinkButton } from "../../ui/actionUi.tsx";
import { CoreDatePicker } from "../../ui/CoreDatePicker.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { DialogFrame } from "../../ui/DialogFrame.tsx";
import { FlagPicker } from "../../ui/flagUi.tsx";
import { CoreCheckbox } from "../../ui/formControls.tsx";
import { DeckSelect } from "../../ui/selectUi.tsx";
import { TagInput } from "../../ui/TagInput.tsx";
import { useStableCallback } from "../../ui/useStableCallback.ts";
import { cardCount } from "./cardListModel.ts";
import { TextReplaceDialog } from "./TextReplaceDialog.tsx";

export type CardSelectionActionId = "study" | "deck" | "replace" | "tags-add" | "tags-remove" | "flag" | "flag-remove" | "mark" | "unmark" | "suspend" | "unsuspend" | "bury" | "due" | "reset" | "variants" | "delete";
type MenuActionId = CardSelectionActionId;

/** Keys of the card list (KV6) as the menu names them; `aria-keyshortcuts` uses the key values. */
const MENU: ReadonlyArray<{ id: MenuActionId; label: string; icon: LucideIcon; shortcut?: { label: string; keys: string } }> = [
  { id: "study", label: "Auswahl lernen", icon: GraduationCap },
  { id: "deck", label: "Stapel ändern", icon: MoveRight, shortcut: { label: "S", keys: "S" } },
  { id: "replace", label: "Suchen und Ersetzen", icon: Replace },
  { id: "tags-add", label: "Tags hinzufügen", icon: Tag, shortcut: { label: "T", keys: "T" } },
  { id: "tags-remove", label: "Tags entfernen", icon: Tags },
  { id: "flag", label: "Flagge setzen", icon: Flag, shortcut: { label: "1–7", keys: "1 2 3 4 5 6 7" } },
  { id: "flag-remove", label: "Flagge entfernen", icon: FlagOff, shortcut: { label: "0", keys: "0" } },
  { id: "mark", label: "Markieren", icon: Star, shortcut: { label: "M", keys: "M" } },
  { id: "unmark", label: "Markierung entfernen", icon: StarOff, shortcut: { label: "M", keys: "M" } },
  { id: "suspend", label: "Aussetzen", icon: Pause, shortcut: { label: "A", keys: "A" } },
  { id: "unsuspend", label: "Reaktivieren", icon: Play, shortcut: { label: "A", keys: "A" } },
  { id: "bury", label: "Zurückstellen", icon: CalendarClock },
  { id: "due", label: "Fälligkeit setzen", icon: CalendarRange },
  { id: "reset", label: "Lernstand zurücksetzen", icon: RotateCcw },
  { id: "variants", label: "Varianten generieren", icon: Sparkles },
  { id: "delete", label: "Löschen", icon: Trash2, shortcut: { label: "Entf", keys: "Delete" } },
];

/** First entries of the menu groups: study · content and tags · flag and mark · planning · variants · delete. */
const GROUP_STARTS = new Set<MenuActionId>(["deck", "flag", "suspend", "variants", "delete"]);

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
  /** Cards of the flat list that can all be selected at once; null while unknown. */
  hitTotal: number | null;
  /** With a search the list holds hits, otherwise all cards. */
  searching: boolean;
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
  /** `Auswahl lernen` (KV5); absent where studying is unavailable. */
  onStudy?: () => void;
  /** Absent where contents cannot be loaded for `Suchen und Ersetzen`. */
  onPrepareReplace?: () => Promise<TextReplaceSession>;
  onRun: (action: CardBatchAction, label: string) => Promise<void>;
  /** A key of the card list asks for an action (KV6); it opens like the menu entry, a flag preselected. */
  request?: { id: CardSelectionActionId; flag?: number; nonce: number } | null;
}

/** Bar of the card table while cards are selected (KV4): the checked header checkbox that ends selecting, count, `Alle N Treffer auswählen` and actions. */
export function CardSelectionBar({ count, hitTotal, searching, allHits, disabled, onSelectAllHits, onClear, decks, flagNames, loadTagDirectory, now, dayStartHour, timeZone, onGenerateVariants, onStudy, onPrepareReplace, onRun, request }: CardSelectionBarProps) {
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [running, setRunning] = React.useState(false);
  const dayOptions = React.useMemo(() => ({ dayStartHour, timeZone }), [dayStartHour, timeZone]);
  const todayKey = getLearningDayKey(now, dayOptions) ?? "";
  const tomorrowKey = getLearningDayKey(addLearningDays(now, 1, dayOptions) ?? "", dayOptions) ?? "";
  const label = MENU.find((entry) => entry.id === dialog?.id)?.label ?? "";

  function open(id: MenuActionId, flag = 1) {
    if (id === "study") {
      onStudy?.();
      return;
    }
    setDialog({ id, deckId: decks.find((deck) => !deck.deletedAt)?.id ?? "", tags: [], flag, from: tomorrowKey, to: tomorrowKey });
  }
  const openRequested = useStableCallback(open);
  React.useEffect(() => {
    if (request) openRequested(request.id, request.flag);
  }, [openRequested, request]);

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
      : dialog.id === "tags-add" || dialog.id === "tags-remove" ? <div className="min-h-[19rem]"><TagInput tags={dialog.tags} loadDirectory={loadTagDirectory} label="Tags" labelHidden onChange={(tags) => patch({ tags })} /></div>
        : dialog.id === "flag" ? <FlagPicker value={dialog.flag} names={flagNames} onValueChange={(flag) => patch({ flag: flag || dialog.flag })} />
          : dialog.id === "due" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 core-caption font-semibold text-core-secondary">Frühestens
                <CoreDatePicker value={dialog.from} min={tomorrowKey} today={todayKey} ariaLabel="Frühestens fällig" onValueChange={(from) => patch({ from, to: dialog.to < from ? from : dialog.to })} />
              </label>
              <label className="grid gap-1.5 core-caption font-semibold text-core-secondary">Spätestens
                <CoreDatePicker value={dialog.to} min={dialog.from || tomorrowKey} today={todayKey} ariaLabel="Spätestens fällig" onValueChange={(to) => patch({ to })} />
              </label>
            </div>
          )
            : null
  ) : null;

  return (
    <div className="core-card-selection-bar" data-testid="card-selection-bar">
      <CoreCheckbox className="core-card-selection-clear" aria-label="Auswahl aufheben" checked onCheckedChange={onClear} />
      <span className="core-body font-semibold text-core-text tabular-nums" aria-live="polite">{allHits ? `Alle ${cardCount(count)}` : cardCount(count)} ausgewählt</span>
      {hitTotal !== null && !allHits && hitTotal > count ? (
        <CrossLinkButton onSelect={onSelectAllHits}>Alle {hitTotal.toLocaleString("de-DE")} {searching ? "Treffer" : "Karten"} auswählen</CrossLinkButton>
      ) : null}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" disabled={disabled} className="core-action-secondary core-card-selection-actions ml-auto inline-flex items-center gap-1.5" data-testid="card-selection-actions">
            Aktionen<ChevronDown size={16} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={8} collisionPadding={16} className="core-overlay z-[60] grid max-h-[min(32rem,var(--radix-popover-content-available-height))] w-64 gap-0.5 overflow-y-auto rounded-panel p-1.5">
            {MENU.filter((entry) => (entry.id !== "variants" || onGenerateVariants) && (entry.id !== "replace" || onPrepareReplace) && (entry.id !== "study" || onStudy)).map(({ id, label: entryLabel, icon: Icon, shortcut }, index) => (
              <React.Fragment key={id}>
                {index > 0 && GROUP_STARTS.has(id) ? <div className="core-menu-separator" role="separator" /> : null}
                <Popover.Close asChild>
                  <button type="button" aria-keyshortcuts={shortcut?.keys} className="core-menu-row" data-tone={id === "delete" ? "danger" : undefined} onClick={() => open(id)}>
                    <Icon size={16} aria-hidden="true" />{entryLabel}
                    {shortcut ? <span className="ml-auto core-caption tabular-nums text-core-muted" aria-hidden="true">{shortcut.label}</span> : null}
                  </button>
                </Popover.Close>
              </React.Fragment>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {dialog?.id === "replace" && onPrepareReplace ? (
        <TextReplaceDialog count={count} prepare={onPrepareReplace} onRun={onRun} onClose={() => setDialog(null)} />
      ) : dialog && fields ? (
        <DialogFrame
          open
          title={`${label}: ${cardCount(count)}`}
          size="s"
          onClose={() => setDialog(null)}
          footer={(
            <>
              <ActionButton variant="secondary" disabled={running} onClick={() => setDialog(null)}>Abbrechen</ActionButton>
              <ActionButton variant="primary" loading={running} disabled={running} onClick={() => void confirm()}>{label}</ActionButton>
            </>
          )}
        >
          {fields}
        </DialogFrame>
      ) : dialog ? (
        <ActionDialog
          open
          title={`${label}: ${cardCount(count)}`}
          description={dialog.id === "delete" ? "Gelöscht werden die Inhalte der Karten samt ihrer weiteren Karten." : undefined}
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
