import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, ChevronDown, FolderTree, Layers3, Search, X, type LucideIcon } from "lucide-react";
import type { Deck } from "../coreTypes.ts";
import { buildSortedDeckChildren } from "../deckOrdering.ts";
import { DECK_DEPTH_INDENT_PX, getVisibleDeckDepth } from "../deckHierarchy.ts";
import { DeckAppearanceIcon, getDeckAppearance } from "./deckAppearance.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

const SELECT_VALUE_PREFIX = "core-select:";
const DECK_SEARCH_THRESHOLD = 5;

interface CoreSelectOption {
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
  /** Edge of the trigger the list keeps; `end` for right-aligned triggers, so a wider list grows to the left. */
  menuAlign?: "start" | "end";
}

interface DeckSelectSpecialOption {
  value: string;
  label: string;
  icon: LucideIcon;
  tone?: "neutral" | "danger";
}

export interface DeckSelectProps extends Omit<CoreSelectProps, "options" | "leadingIcon"> {
  decks: readonly Deck[];
  selectableDeckIds?: readonly string[];
  specialOption?: DeckSelectSpecialOption;
  /** Replaces the field with an icon-only ghost button named `ariaLabel`. */
  triggerIcon?: LucideIcon;
}

export interface DeckMultiSelectProps {
  decks: readonly Deck[];
  value: "all" | string[];
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

  function appendBranch(deck: Deck): void {
    const pending = [{ deck, depth: 0, parentPath: "" }];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visitedDeckIds.has(current.deck.id)) continue;
      visitedDeckIds.add(current.deck.id);
      const path = current.parentPath
        ? `${current.parentPath} / ${current.deck.name}`
        : current.deck.parentDeckId && current.deck.hierarchyPath.length
          ? current.deck.hierarchyPath.join(" / ")
          : current.deck.name;
      rows.push({ deck: current.deck, depth: current.depth, path, searchPath: path.toLocaleLowerCase("de-DE") });
      const children = childrenByParentId.get(current.deck.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({ deck: children[index], depth: current.depth + 1, parentPath: path });
      }
    }
  }

  (childrenByParentId.get(null) ?? []).forEach(appendBranch);
  decks.forEach(appendBranch);
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

const OPTION_CLASS = "relative flex min-h-menu-row w-full items-center gap-3 rounded-inset pr-11 text-left core-body text-core-text";
const OPTION_CHECK = <Check size={20} className="absolute right-3 text-core-action" aria-hidden="true" />;
const DECK_OPTION_CLASS = `${OPTION_CLASS} py-0.5 hover:bg-core-subtle aria-selected:bg-core-subtle aria-selected:font-semibold`;

function CoreSelectOptions({ options }: Pick<CoreSelectProps, "options">) {
  return options.map((option) => {
    const Icon = option.icon;
    return (
      <Select.Item
        key={option.value}
        value={encodeValue(option.value)}
        textValue={option.label}
        className={`${OPTION_CLASS} cursor-default select-none py-1.5 pl-3 outline-none data-[highlighted]:bg-core-subtle data-[state=checked]:bg-core-subtle data-[state=checked]:font-semibold`}
      >
        {Icon ? <Icon size={17} className="shrink-0 text-core-muted" aria-hidden="true" /> : null}
        <Select.ItemText className="min-w-0 break-words">{option.label}</Select.ItemText>
        <Select.ItemIndicator asChild>{OPTION_CHECK}</Select.ItemIndicator>
      </Select.Item>
    );
  });
}

function SelectContent({ children, triggerRef, align }: { children: ReactNode; triggerRef: RefObject<HTMLButtonElement | null>; align: "start" | "end" }) {
  return (
    <Select.Portal>
      <Select.Content
        position="popper"
        align={align}
        sideOffset={6}
        collisionPadding={12}
        onPointerDownOutside={(event) => {
          if (event.target instanceof Node && triggerRef.current?.contains(event.target)) event.preventDefault();
        }}
        className="core-overlay z-[90] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-panel outline-none"
      >
        <Select.ScrollUpButton className="grid h-8 cursor-default place-items-center text-core-muted">
          <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
        </Select.ScrollUpButton>
        <Select.Viewport className="p-1.5">{children}</Select.Viewport>
        <Select.ScrollDownButton className="grid h-8 cursor-default place-items-center text-core-muted">
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
    <span className={`grid size-7 shrink-0 place-items-center ${danger ? "text-core-danger" : "text-core-muted"}`}>
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
        sideOffset={6}
        collisionPadding={12}
        data-deck-select-content="true"
        className={`core-overlay z-[90] grid max-h-[min(25rem,var(--radix-popover-content-available-height))] overflow-hidden rounded-panel bg-core-surface outline-none ${showSearch ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"} ${widthClassName}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget;
          const openedByKeyboard = document.activeElement?.matches(":focus-visible") ?? false;
          requestAnimationFrame(() => {
            if (showSearch) (content as HTMLElement | null)?.querySelector<HTMLInputElement>("input")?.focus();
            else if (openedByKeyboard) focusDeckOption(listboxId, "selected");
            else document.getElementById(listboxId)?.focus();
          });
        }}
      >
        {showSearch ? (
          <div className="flex items-center gap-3 border-b border-core-border pl-[1.125rem] pr-1.5">
            <span className="grid size-7 shrink-0 place-items-center text-core-muted"><Search size={16} aria-hidden="true" /></span>
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
              className="min-h-control min-w-0 flex-1 bg-transparent core-body text-core-text placeholder:text-core-muted"
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
          tabIndex={-1}
          className="min-h-0 max-h-80 overflow-y-auto p-1.5 outline-none"
          onKeyDown={(event) => handleDeckOptionKeyDown(event, listboxId)}
        >
          {children}
          {empty ? <p className="p-4 text-center core-body text-core-muted">Kein passender Stapel.</p> : null}
        </div>
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
  menuAlign = "start",
}, ref) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeOnClickRef = useRef(false);
  useImperativeHandle(ref, () => triggerRef.current!, []);
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? "";
  const TriggerIcon = LeadingIcon ?? selectedOption?.icon;

  return (
    <Select.Root open={open} onOpenChange={setOpen} value={encodeValue(value)} onValueChange={(nextValue) => onValueChange(decodeValue(nextValue))}>
      <Select.Trigger
        ref={triggerRef}
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        data-testid={testId}
        style={{ pointerEvents: open ? "auto" : undefined }}
        onPointerDown={(event) => {
          closeOnClickRef.current = open;
          if (open) event.preventDefault();
        }}
        onClick={(event) => {
          if (closeOnClickRef.current) {
            closeOnClickRef.current = false;
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={`group inline-flex min-h-control min-w-0 items-center gap-3 rounded-control border border-core-border bg-core-surface px-3 text-left core-body text-core-text transition data-[state=open]:border-core-action data-[state=open]:shadow-selection ${className}`}
      >
        {TriggerIcon ? <TriggerIcon size={17} className="shrink-0 text-core-text" aria-hidden="true" /> : null}
        {/* Every label is laid out in the same cell, so the trigger is as wide as its longest option and keeps that width when the value changes. */}
        <span className="grid min-w-0 flex-1">
          {options.map((option) => <span key={option.value} aria-hidden="true" data-label={option.label} className="invisible col-start-1 row-start-1 h-0 truncate after:content-[attr(data-label)]" />)}
          <span className="col-start-1 row-start-1 truncate">
            <Select.Value>{selectedLabel}</Select.Value>
          </span>
        </span>
        <Select.Icon className="grid shrink-0 place-items-center text-core-muted">
          <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <SelectContent triggerRef={triggerRef} align={menuAlign}>
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
  menuAlign,
  triggerIcon: TriggerIcon,
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
          className={TriggerIcon ? `core-action-ghost min-w-button p-2 text-core-text ${className}` : `group inline-flex min-h-control min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 text-left core-body text-core-text transition data-[state=open]:border-core-action data-[state=open]:shadow-selection ${className}`}
        >
          {TriggerIcon ? <TriggerIcon size={16} aria-hidden="true" /> : <>{selectedDeckRow ? (
            <DeckAppearanceIcon data-deck-icon="true" deck={selectedDeckRow.deck} className="size-7" iconSize={14} />
          ) : selectedSpecialOption ? (
            <SpecialOptionIcon option={selectedSpecialOption} />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <span className="grid shrink-0 place-items-center text-core-muted">
            <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </span></>}
        </button>
      </Popover.Trigger>

      <DeckPickerContent
        empty={visibleRows.length === 0}
        listboxId={listboxId}
        multiple={false}
        query={query}
        showSearch={showSearch}
        align={menuAlign}
        widthClassName="w-[max(var(--radix-popover-trigger-width),24rem)] max-w-[calc(100vw-2rem)]"
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
            className={`${DECK_OPTION_CLASS} pl-3`}
          >
            <SpecialOptionIcon option={specialOption} />
            <span className="min-w-0 flex-1 truncate">{specialOption.label}</span>
            {specialOption.value === value ? OPTION_CHECK : null}
          </button>
        ) : null}
        {visibleRows.map((row) => {
          const visibleDepth = getVisibleDeckDepth(row.depth);
          const selected = row.deck.id === value;
          return (
            <CoreTooltip key={row.deck.id} label={row.path} deckAppearance={getDeckAppearance(row.deck)}>
              <button
                type="button"
                role="option"
                aria-label={row.path}
                aria-selected={selected}
                data-deck-picker-option="true"
                data-deck-select-option={row.deck.id}
                data-deck-depth={visibleDepth}
                onClick={() => selectValue(row.deck.id)}
                className={DECK_OPTION_CLASS}
                style={{ paddingInlineStart: `calc(0.75rem + ${visibleDepth * DECK_DEPTH_INDENT_PX}px)` }}
              >
                <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-7 shrink-0" iconSize={14} />
                <span className="min-w-0 flex-1 truncate">{row.deck.name}</span>
                {selected ? OPTION_CHECK : null}
              </button>
            </CoreTooltip>
          );
        })}
      </DeckPickerContent>
    </Popover.Root>
  );
});

export function DeckMultiSelect({ decks, value, onValueChange }: DeckMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const rows = useMemo(() => createDeckSelectRows(decks), [decks]);
  const parentByDeckId = useMemo(() => new Map(decks.map((deck) => [deck.id, deck.parentDeckId])), [decks]);
  const selected = value === "all" ? [] : value;
  const scopeLabel = value === "all" ? "Gesamte Sammlung" : selected.length === 1 ? decks.find((deck) => deck.id === selected[0])?.name ?? "Ausgewählter Stapel" : `${selected.length} Stapel ausgewählt`;
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
          className="group core-field flex min-h-control w-full min-w-0 items-center justify-between gap-3 rounded-control px-3 text-left"
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
          className={`${DECK_OPTION_CLASS} pl-3`}
        >
          <span className="grid size-7 shrink-0 place-items-center"><FolderTree size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 truncate">Gesamte Sammlung</span>
          {value === "all" ? OPTION_CHECK : null}
        </button>
        <div aria-hidden="true" className="core-menu-separator" />
        {visibleRows.map((row) => {
          const inherited = hasDeckAncestor(parentByDeckId, row.deck.id, selectedDeckIds);
          const checked = selectedDeckIds.has(row.deck.id) || inherited;
          const visibleDepth = getVisibleDeckDepth(row.depth);
          return (
            <CoreTooltip key={row.deck.id} label={row.path} deckAppearance={getDeckAppearance(row.deck)}>
              <button
                type="button"
                role="option"
                aria-label={row.path}
                aria-selected={checked}
                disabled={inherited}
                data-deck-picker-option="true"
                data-deck-select-option={row.deck.id}
                data-deck-depth={visibleDepth}
                onClick={() => toggle(row.deck.id)}
                className={`${DECK_OPTION_CLASS} disabled:cursor-default`}
                style={{ paddingInlineStart: `calc(0.75rem + ${visibleDepth * DECK_DEPTH_INDENT_PX}px)` }}
              >
                <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-7 shrink-0" iconSize={14} />
                <span className="min-w-0 flex-1 truncate">{row.deck.name}</span>
                {checked ? OPTION_CHECK : null}
              </button>
            </CoreTooltip>
          );
        })}
      </DeckPickerContent>
    </Popover.Root>
  );
}
