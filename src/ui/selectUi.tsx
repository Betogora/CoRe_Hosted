import * as Select from "@radix-ui/react-select";
import { forwardRef, useMemo, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { Deck } from "../coreTypes.ts";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";

const SELECT_VALUE_PREFIX = "core-select:";
const MAX_DECK_SELECT_INDENT_LEVEL = 6;

export interface CoreSelectOption {
  value: string;
  label: string;
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

interface DeckSelectRow {
  deck: Deck;
  depth: number;
  path: string;
}

function encodeValue(value: string) {
  return SELECT_VALUE_PREFIX + value;
}

function decodeValue(value: string) {
  return value.slice(SELECT_VALUE_PREFIX.length);
}

function createDeckSelectRows(decks: readonly Deck[]): DeckSelectRow[] {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const childrenByParentId = new Map<string | null, Deck[]>();

  for (const deck of decks) {
    const parentId = deck.parentDeckId && deckById.has(deck.parentDeckId) ? deck.parentDeckId : null;
    const siblings = childrenByParentId.get(parentId);
    if (siblings) siblings.push(deck);
    else childrenByParentId.set(parentId, [deck]);
  }

  const rows: DeckSelectRow[] = [];
  const visitedDeckIds = new Set<string>();

  function visit(deck: Deck, depth: number, parentPath: string[]): void {
    if (visitedDeckIds.has(deck.id)) return;
    visitedDeckIds.add(deck.id);
    const hierarchyPath = deck.hierarchyPath.length ? deck.hierarchyPath : [...parentPath, deck.name];
    rows.push({ deck, depth, path: hierarchyPath.join(" / ") });
    (childrenByParentId.get(deck.id) ?? []).forEach((child) => visit(child, depth + 1, hierarchyPath));
  }

  (childrenByParentId.get(null) ?? []).forEach((deck) => visit(deck, 0, []));
  decks.forEach((deck) => visit(deck, 0, []));
  return rows;
}

const SELECT_ITEM_INDICATOR = (
  <Select.ItemIndicator className="absolute right-3 grid place-items-center text-[var(--core-action-primary)]">
    <Check size={15} aria-hidden="true" />
  </Select.ItemIndicator>
);

function CoreSelectOptions({ options }: Pick<CoreSelectProps, "options">) {
  return options.map((option) => (
    <Select.Item
      key={option.value}
      value={encodeValue(option.value)}
      textValue={option.label}
      className="relative flex min-h-11 cursor-default select-none items-center rounded-lg py-2 pl-3 pr-9 core-body leading-5 text-[var(--core-text)] outline-none data-[highlighted]:bg-[var(--core-surface-muted)] data-[state=checked]:bg-[var(--core-info-surface)]"
    >
      <Select.ItemText className="min-w-0 break-words">{option.label}</Select.ItemText>
      {SELECT_ITEM_INDICATOR}
    </Select.Item>
  ));
}

function SelectContent({ children, isDeckSelect = false }: { children: ReactNode; isDeckSelect?: boolean }) {
  return (
    <Select.Portal>
      <Select.Content
        position="popper"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        data-deck-select-content={isDeckSelect ? "true" : undefined}
        className="core-overlay z-[70] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl outline-none"
      >
        <Select.ScrollUpButton className="grid h-8 cursor-default place-items-center text-[var(--core-text-muted)]">
          <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
        </Select.ScrollUpButton>
        <Select.Viewport data-deck-select-viewport={isDeckSelect ? "true" : undefined} className="p-1">
          {children}
        </Select.Viewport>
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
    <span className={`grid size-8 shrink-0 place-items-center rounded-full border ${danger ? "border-[var(--core-danger)] bg-[var(--core-danger-surface)] text-[var(--core-danger)]" : "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-muted)]"}`}>
      <Icon size={15} aria-hidden="true" />
    </span>
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
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

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
        {LeadingIcon ? <LeadingIcon size={17} className="shrink-0 text-[var(--core-text-muted)]" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
        <Select.Icon className="grid shrink-0 place-items-center text-[var(--core-action-primary)]">
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
  const { rows, rowById } = useMemo(() => {
    const allRows = createDeckSelectRows(decks);
    const rowById = new Map(allRows.map((row) => [row.deck.id, row]));
    if (!selectableDeckIds) return { rows: allRows, rowById };
    const selectableDeckIdSet = new Set(selectableDeckIds);
    return { rows: allRows.filter(({ deck }) => selectableDeckIdSet.has(deck.id)), rowById };
  }, [decks, selectableDeckIds]);
  const selectedDeckRow = rowById.get(value) ?? null;
  const selectedSpecialOption = specialOption?.value === value ? specialOption : null;
  const selectedLabel = selectedSpecialOption?.label ?? selectedDeckRow?.path ?? "";

  return (
    <Select.Root value={encodeValue(value)} onValueChange={(nextValue) => onValueChange(decodeValue(nextValue))}>
      <Select.Trigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        data-testid={testId}
        data-deck-select-trigger="true"
        className={`group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface px-3 text-left core-body text-[var(--core-text)] transition hover:border-[var(--core-action-primary)] data-[state=open]:border-[var(--core-action-primary)] data-[state=open]:shadow-[0_0_0_2px_var(--core-focus-ring-soft)] ${className}`}
      >
        {selectedDeckRow ? (
          <DeckAppearanceIcon data-deck-icon="true" deck={selectedDeckRow.deck} className="size-8" iconSize={15} />
        ) : selectedSpecialOption ? (
          <SpecialOptionIcon option={selectedSpecialOption} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
        <Select.Icon className="grid shrink-0 place-items-center text-[var(--core-action-primary)]">
          <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <SelectContent isDeckSelect>
        {specialOption ? (
          <Select.Item
            value={encodeValue(specialOption.value)}
            textValue={specialOption.label}
            aria-label={specialOption.label}
            data-deck-select-special-option="true"
            className="relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg py-1.5 pl-2 pr-9 core-body leading-5 text-[var(--core-text)] outline-none data-[highlighted]:bg-[var(--core-surface-muted)] data-[state=checked]:bg-[var(--core-info-surface)]"
          >
            <SpecialOptionIcon option={specialOption} />
            <Select.ItemText className="min-w-0 flex-1 truncate">{specialOption.label}</Select.ItemText>
            {SELECT_ITEM_INDICATOR}
          </Select.Item>
        ) : null}
        {rows.map((row) => {
          const visibleDepth = Math.min(row.depth, MAX_DECK_SELECT_INDENT_LEVEL);
          return (
            <Select.Item
              key={row.deck.id}
              value={encodeValue(row.deck.id)}
              textValue={row.path}
              aria-label={row.path}
              data-deck-select-option={row.deck.id}
              data-deck-depth={visibleDepth}
              className="relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg py-1.5 pr-9 core-body leading-5 text-[var(--core-text)] outline-none data-[highlighted]:bg-[var(--core-surface-muted)] data-[state=checked]:bg-[var(--core-info-surface)]"
              style={{ paddingInlineStart: `${0.5 + visibleDepth}rem` }}
            >
              <DeckAppearanceIcon data-deck-icon="true" deck={row.deck} className="size-8" iconSize={15} />
              <Select.ItemText className="min-w-0 flex-1 truncate">{row.deck.name}</Select.ItemText>
              {SELECT_ITEM_INDICATOR}
            </Select.Item>
          );
        })}
      </SelectContent>
    </Select.Root>
  );
});
