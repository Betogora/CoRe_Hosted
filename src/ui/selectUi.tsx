import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, FolderTree, Layers3, Search, X, type LucideIcon } from "lucide-react";
import type { Deck } from "../coreTypes.ts";
import { buildSortedDeckChildren } from "../deckOrdering.ts";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";

const SELECT_VALUE_PREFIX = "core-select:";
const MAX_DECK_SELECT_INDENT_LEVEL = 6;
const DECK_SEARCH_THRESHOLD = 5;

export interface CoreSelectOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export interface CoreSelectProps {
  value: string;
  options: readonly CoreSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  testId?: string;
  autoFocus?: boolean;
  leadingIcon?: LucideIcon;
}

export interface DeckSelectSpecialOption {
  value: string;
  label: string;
  icon: LucideIcon;
  tone?: "neutral" | "danger";
}

export interface DeckSelectProps extends Omit<CoreSelectProps, "options" | "leadingIcon"> {
  decks: readonly Deck[];
  selectableDeckIds?: readonly string[];
  specialOption?: DeckSelectSpecialOption;
}

export interface DeckMultiSelectProps {
  decks: readonly Deck[];
  value: "all" | string[];
  scopeLabel: string;
  onValueChange: (value: "all" | string[]) => void;
}

interface DeckSelectRow {
  deck: Deck;
  depth: number;
  path: string;
  searchPath: string;
}

interface DeckPickerContentProps {
  children: ReactNode;
  empty: boolean;
  listboxId: string;
  multiple: boolean;
  query: string;
  showSearch: boolean;
  widthClassName: string;
  align?: "start" | "end";
  onQueryChange: (query: string) => void;
}

function encodeValue(value: string) {
  return SELECT_VALUE_PREFIX + value;
}

function decodeValue(value: string) {
  return value.slice(SELECT_VALUE_PREFIX.length);
}

function createDeckSelectRows(decks: readonly Deck[]): DeckSelectRow[] {
  const childrenByParentId = buildSortedDeckChildren(decks);

  const rows: DeckSelectRow[] = [];
  const visitedDeckIds = new Set<string>();

  function visit(deck: Deck, depth: number, parentPath: string[]): void {
    if (visitedDeckIds.has(deck.id)) return;
    visitedDeckIds.add(deck.id);
    const hierarchyPath = deck.hierarchyPath.length ? deck.hierarchyPath : [...parentPath, deck.name];
    const path = hierarchyPath.join(" / ");
    rows.push({ deck, depth, path, searchPath: path.toLocaleLowerCase("de-DE") });
    (childrenByParentId.get(deck.id) ?? []).forEach((child) => visit(child, depth + 1, hierarchyPath));
  }

  (childrenByParentId.get(null) ?? []).forEach((deck) => visit(deck, 0, []));
  decks.forEach((deck) => visit(deck, 0, []));
  return rows;
}

function filterDeckRows(rows: readonly DeckSelectRow[], query: string) {
  const search = query.trim().toLocaleLowerCase("de-DE");
  return search ? rows.filter((row) => row.searchPath.includes(search)) : rows;
}

function hasDeckAncestor(parentByDeckId: Map<string, string | null>, candidateId: string, ancestor: string | ReadonlySet<string>) {
  let parentId = parentByDeckId.get(candidateId) ?? null;
  while (parentId) {
    if (typeof ancestor === "string" ? parentId === ancestor : ancestor.has(parentId)) return true;
    parentId = parentByDeckId.get(parentId) ?? null;
  }
  return false;
}

const SELECT_ITEM_INDICATOR = (
  <Select.ItemIndicator className="absolute right-3 grid place-items-center text-[var(--core-text)]">
    <Check size={15} aria-hidden="true" />
  </Select.ItemIndicator>
);

function CoreSelectOptions({ options }: Pick<CoreSelectProps, "options">) {
  return options.map((option) => {
    const Icon = option.icon;
    return (
      <Select.Item
        key={option.value}
        value={encodeValue(option.value)}
        textValue={option.label}
        className="relative flex min-h-11 cursor-default select-none items-center gap-3 rounded-lg py-2 pl-3 pr-9 core-body leading-5 text-[var(--core-text)] outline-none data-[highlighted]:bg-[var(--core-surface-muted)] data-[state=checked]:bg-[var(--core-info-surface)]"
      >
        {Icon ? <Icon size={17} className="shrink-0 text-[var(--core-text-muted)]" aria-hidden="true" /> : null}
        <Select.ItemText className="min-w-0 break-words">{option.label}</Select.ItemText>
        {SELECT_ITEM_INDICATOR}
      </Select.Item>
    );
  });
}

function SelectContent({ children }: { children: ReactNode }) {
  return (
    <Select.Portal>
      <Select.Content
        position="popper"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="core-overlay z-[90] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl outline-none"
      >
        <Select.ScrollUpButton className="grid h-8 cursor-default place-items-center text-[var(--core-text-muted)]">
          <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
        </Select.ScrollUpButton>
        <Select.Viewport className="p-1">{children}</Select.Viewport>
        <Select.ScrollDownButton className="grid h-8 cursor-default place-items-center text-[var(--core-text-muted)]">
          <ChevronDown size={16} aria-hidden="true" />
        </Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  );
}

function SpecialOptionIcon({ option }: { option: DeckSelectSpecialOption }) {
  const Icon = option.icon;
  const danger = option.tone === "danger";

  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${danger ? "border-[var(--core-danger)] bg-[var(--core-danger-surface)] text-[var(--core-danger)]" : "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-muted)]"}`}>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

function focusDeckOption(listboxId: string, direction: "first" | "last" | "next" | "previous" | "selected") {
  const listbox = document.getElementById(listboxId);
  if (!listbox) return;
  const options = [...listbox.querySelectorAll<HTMLElement>('[data-deck-picker-option="true"]:not([disabled])')];
  if (options.length === 0) return;
  const currentIndex = options.indexOf(document.activeElement as HTMLElement);
  if (direction === "selected") (listbox.querySelector<HTMLElement>('[data-deck-picker-option="true"][aria-selected="true"]:not([disabled])') ?? options[0])?.focus();
  else if (direction === "first") options[0]?.focus();
  else if (direction === "last") options.at(-1)?.focus();
  else if (direction === "next") options[currentIndex < 0 || currentIndex === options.length - 1 ? 0 : currentIndex + 1]?.focus();
  else options[currentIndex <= 0 ? options.length - 1 : currentIndex - 1]?.focus();
}

function handleDeckOptionKeyDown(event: KeyboardEvent<HTMLElement>, listboxId: string) {
  const direction = event.key === "ArrowDown"
    ? "next"
    : event.key === "ArrowUp"
      ? "previous"
      : event.key === "Home"
        ? "first"
        : event.key === "End"
          ? "last"
          : null;
  if (!direction) return;
  event.preventDefault();
  focusDeckOption(listboxId, direction);
}

function DeckPickerContent({
  children,
  empty,
  listboxId,
  multiple,
  query,
  showSearch,
  widthClassName,
  align = "start",
  onQueryChange,
}: DeckPickerContentProps) {
  return (
    <Popover.Portal>
      <Popover.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        data-deck-select-content="true"
        className={`core-overlay z-[90] grid max-h-[min(25rem,var(--radix-popover-content-available-height))] gap-3 overflow-hidden rounded-2xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl outline-none ${showSearch ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"} ${widthClassName}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget;
          requestAnimationFrame(() => {
            if (showSearch) (content as HTMLElement | null)?.querySelector<HTMLInputElement>("input")?.focus();
            else focusDeckOption(listboxId, "selected");
          });
        }}
      >
        {showSearch ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-subtle px-3">
            <Search size={17} className="shrink-0 text-core-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  focusDeckOption(listboxId, event.key === "ArrowDown" ? "first" : "last");
                }
              }}
              placeholder="Stapel suchen"
              aria-label="Stapel suchen"
              aria-controls={listboxId}
              className="min-h-11 min-w-0 flex-1 bg-transparent core-body text-core-text placeholder:text-core-muted"
            />
            {query ? (
              <button type="button" onClick={() => onQueryChange("")} aria-label="Suche leeren" className="grid size-8 shrink-0 place-items-center text-core-muted">
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          data-deck-select-viewport="true"
          className="min-h-0 max-h-80 overflow-y-auto"
          onKeyDown={(event) => handleDeckOptionKeyDown(event, listboxId)}
        >
          {children}
          {empty ? <p className="p-4 text-center core-body text-core-muted">Kein passender Stapel.</p> : null}
        </div>
        <Popover.Arrow className="fill-[var(--core-border)]" />
      </Popover.Content>
    </Popover.Portal>
  );
}

export const CoreSelect = forwardRef<HTMLButtonElement, CoreSelectProps>(function CoreSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  id,
  className = "",
  testId,
  autoFocus,
  leadingIcon: LeadingIcon,
}, ref) {
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? "";
  const TriggerIcon = LeadingIcon ?? selectedOption?.icon;

  return (
    <Select.Root value={encodeValue(value)} onValueChange={(nextValue) => onValueChange(decodeValue(nextValue))}>
      <Select.Trigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        data-testid={testId}
        className={`group inline-flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface px-4 text-left core-body text-[var(--core-text)] transition hover:border-[var(--core-action-primary)] data-[state=open]:border-[var(--core-action-primary)] data-[state=open]:shadow-[0_0_0_2px_var(--core-focus-ring-soft)] ${className}`}
      >
        {TriggerIcon ? <TriggerIcon size={17} className="shrink-0 text-[var(--core-text)]" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
        <Select.Icon className="grid shrink-0 place-items-center text-[var(--core-text)]">
          <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <SelectContent>
        <CoreSelectOptions options={options} />
      </SelectContent>
    </Select.Root>
  );
});

export const DeckSelect = forwardRef<HTMLButtonElement, DeckSelectProps>(function DeckSelect({
  value,
  decks,
  selectableDeckIds,
  specialOption,
  onValueChange,
  ariaLabel,
  id,
  className = "",
  testId,
  autoFocus,
}, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const { rows, rowById } = useMemo(() => {
    const allRows = createDeckSelectRows(decks);
    const rowById = new Map(allRows.map((row) => [row.deck.id, row]));
    if (!selectableDeckIds) return { rows: allRows, rowById };
    const selectableDeckIdSet = new Set(selectableDeckIds);
    return { rows: allRows.filter(({ deck }) => selectableDeckIdSet.has(deck.id)), rowById };
  }, [decks, selectableDeckIds]);
  const visibleRows = useMemo(() => filterDeckRows(rows, query), [query, rows]);
  const selectedDeckRow = rowById.get(value) ?? null;
  const selectedSpecialOption = specialOption?.value === value ? specialOption : null;
  const selectedLabel = selectedSpecialOption?.label ?? selectedDeckRow?.path ?? "";
  const showSearch = rows.length >= DECK_SEARCH_THRESHOLD;

  function selectValue(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
      <Popover.Trigger asChild>
        <button
          ref={ref}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-haspopup="listbox"
          autoFocus={autoFocus}
          data-testid={testId}
          data-state={open ? "open" : "closed"}
          data-deck-select-trigger="true"
          data-deck-select-searchable={showSearch ? "true" : "false"}
          className={`group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface px-3 text-left core-body text-[var(--core-text)] transition hover:border-[var(--core-action-primary)] data-[state=open]:border-[var(--core-action-primary)] data-[state=open]:shadow-[0_0_0_2px_var(--core-focus-ring-soft)] ${className}`}
        >
          {selectedDeckRow ? (
            <DeckAppearanceIcon data-deck-icon="true" deck={selectedDeckRow.deck} className="size-8" iconSize={15} />
          ) : selectedSpecialOption ? (
            <SpecialOptionIcon option={selectedSpecialOption} />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <span className="grid shrink-0 place-items-center text-[var(--core-text)]">
            <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </span>
        </button>
      </Popover.Trigger>

      <DeckPickerContent
        empty={visibleRows.length === 0}
        listboxId={listboxId}
        multiple={false}
        query={query}
        showSearch={showSearch}
        widthClassName="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)]"
        onQueryChange={setQuery}
      >
        {specialOption ? (
          <button
            type="button"
            role="option"
            aria-label={specialOption.label}
            aria-selected={specialOption.value === value}
            data-deck-picker-option="true"
            data-deck-select-special-option="true"
            onClick={() => selectValue(specialOption.value)}
            className="relative flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pl-3 pr-9 text-left core-body text-core-text hover:bg-core-subtle aria-selected:bg-[var(--core-info-surface)]"
          >
            <SpecialOptionIcon option={specialOption} />
            <span className="min-w-0 flex-1 truncate">{specialOption.label}</span>
            {specialOption.value === value ? <Check size={15} className="absolute right-3 text-core-text" aria-hidden="true" /> : null}
          </button>
        ) : null}
        {visibleRows.map((row) => {
          const visibleDepth = Math.min(row.depth, MAX_DECK_SELECT_INDENT_LEVEL);
          const selected = row.deck.id === value;
          return (
            <button
              key={row.deck.id}
              type="button"
              role="option"
              aria-label={row.path}
              aria-selected={selected}
              data-deck-picker-option="true"
              data-deck-select-option={row.deck.id}
              data-deck-depth={visibleDepth}
              onClick={() => selectValue(row.deck.id)}
              className="relative flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pr-9 text-left core-body text-core-text hover:bg-core-subtle aria-selected:bg-[var(--core-info-surface)]"
              style={{ paddingInlineStart: `${0.75 + visibleDepth}rem` }}
            >
              <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-7 shrink-0" iconSize={14} />
              <span className="min-w-0 flex-1 truncate">{row.deck.name}</span>
              {selected ? <Check size={15} className="absolute right-3 text-core-text" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </DeckPickerContent>
    </Popover.Root>
  );
});

export function DeckMultiSelect({ decks, value, scopeLabel, onValueChange }: DeckMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const rows = useMemo(() => createDeckSelectRows(decks), [decks]);
  const parentByDeckId = useMemo(() => new Map(decks.map((deck) => [deck.id, deck.parentDeckId])), [decks]);
  const selected = value === "all" ? [] : value;
  const selectedDeckIds = useMemo(() => new Set(value === "all" ? [] : value), [value]);
  const visibleRows = useMemo(() => filterDeckRows(rows, query), [query, rows]);
  const showSearch = rows.length >= DECK_SEARCH_THRESHOLD;

  function toggle(deckId: string) {
    if (hasDeckAncestor(parentByDeckId, deckId, selectedDeckIds)) return;
    if (selectedDeckIds.has(deckId)) {
      const next = selected.filter((id) => id !== deckId);
      onValueChange(next.length > 0 ? next : "all");
      return;
    }
    onValueChange([...selected.filter((id) => !hasDeckAncestor(parentByDeckId, id, deckId)), deckId]);
  }

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={`Stapel filtern. Aktuell: ${scopeLabel}`}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-haspopup="listbox"
          data-state={open ? "open" : "closed"}
          data-deck-multi-select-trigger="true"
          data-deck-select-searchable={showSearch ? "true" : "false"}
          className="group core-field flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 text-left sm:w-72"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Layers3 size={18} className="shrink-0 text-core-text" aria-hidden="true" />
            <span className="truncate core-body font-semibold text-core-text">{scopeLabel}</span>
          </span>
          <ChevronDown size={17} className="shrink-0 text-core-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <DeckPickerContent
        align="end"
        empty={visibleRows.length === 0}
        listboxId={listboxId}
        multiple
        query={query}
        showSearch={showSearch}
        widthClassName="w-[min(24rem,calc(100vw-2rem))]"
        onQueryChange={setQuery}
      >
        <button
          type="button"
          role="option"
          aria-label="Gesamte Sammlung"
          aria-selected={value === "all"}
          data-deck-picker-option="true"
          onClick={() => onValueChange("all")}
          className="relative flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pl-3 pr-9 text-left core-body text-core-text hover:bg-core-subtle aria-selected:bg-[var(--core-info-surface)]"
        >
          <FolderTree size={18} className="shrink-0 text-core-text" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Gesamte Sammlung</span>
          {value === "all" ? <Check size={15} className="absolute right-3 text-core-text" aria-hidden="true" /> : null}
        </button>
        <div aria-hidden="true" className="my-2 border-t border-[var(--core-border)]" />
        {visibleRows.map((row) => {
          const inherited = hasDeckAncestor(parentByDeckId, row.deck.id, selectedDeckIds);
          const checked = selectedDeckIds.has(row.deck.id) || inherited;
          const visibleDepth = Math.min(row.depth, MAX_DECK_SELECT_INDENT_LEVEL);
          return (
            <button
              key={row.deck.id}
              type="button"
              role="option"
              aria-label={row.path}
              aria-selected={checked}
              disabled={inherited}
              data-deck-picker-option="true"
              data-deck-select-option={row.deck.id}
              data-deck-depth={visibleDepth}
              onClick={() => toggle(row.deck.id)}
              className="relative flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pr-9 text-left core-body text-core-text hover:bg-core-subtle aria-selected:bg-[var(--core-info-surface)] disabled:cursor-default"
              style={{ paddingInlineStart: `${0.75 + visibleDepth}rem` }}
            >
              <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-7 shrink-0" iconSize={14} />
              <span className="min-w-0 flex-1 truncate">{row.deck.name}</span>
              {checked ? <Check size={15} className="absolute right-3 text-core-text" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </DeckPickerContent>
    </Popover.Root>
  );
}
