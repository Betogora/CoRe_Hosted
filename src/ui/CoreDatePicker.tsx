import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export interface CoreDatePickerProps {
  value: string;
  min?: string;
  max?: string;
  today: string;
  ariaLabel: string;
  ariaDescribedBy?: string;
  id?: string;
  className?: string;
  onValueChange: (value: string) => void;
}

interface CoreDatePickerDay {
  key: string;
  dayOfMonth: number;
  outsideMonth: boolean;
  selected: boolean;
  today: boolean;
  disabled: boolean;
}

function dayIndex(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function keyFromDayIndex(index: number) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function isDayKey(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const key = String(value);
  return keyFromDayIndex(dayIndex(key)) === key;
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00Z`);
}

function startOfMonthKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function endOfMonthKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function shiftDayKey(key: string, days: number) {
  return keyFromDayIndex(dayIndex(key) + days);
}

function shiftMonthKey(key: string, months: number) {
  const year = Number(key.slice(0, 4));
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex + months, 1)).toISOString().slice(0, 10);
}

function moveDayToMonth(key: string, monthKey: string) {
  const day = Number(key.slice(8, 10));
  return `${monthKey.slice(0, 8)}${String(Math.min(day, Number(endOfMonthKey(monthKey).slice(8, 10)))).padStart(2, "0")}`;
}

function clampDayKey(key: string, min?: string, max?: string) {
  if (isDayKey(min) && key < min) return min;
  if (isDayKey(max) && key > max) return max;
  return key;
}

function resolveAnchor(value: string, today: string, min?: string, max?: string) {
  const anchor = isDayKey(value) ? value : isDayKey(today) ? today : isDayKey(min) ? min : isDayKey(max) ? max : "1970-01-01";
  return clampDayKey(anchor, min, max);
}

function monthHasEnabledDay(monthKey: string, min?: string, max?: string) {
  return (!isDayKey(max) || monthKey <= max) && (!isDayKey(min) || endOfMonthKey(monthKey) >= min);
}

export function createCoreDatePickerMonth(monthKey: string, options: { value: string; today: string; min?: string; max?: string }): CoreDatePickerDay[] {
  const firstDay = startOfMonthKey(monthKey);
  const mondayOffset = (dateFromKey(firstDay).getUTCDay() + 6) % 7;
  const firstGridDayIndex = dayIndex(firstDay) - mondayOffset;
  const minimum = isDayKey(options.min) ? options.min : undefined;
  const maximum = isDayKey(options.max) ? options.max : undefined;
  return Array.from({ length: 42 }, (_, index) => {
    const key = keyFromDayIndex(firstGridDayIndex + index);
    return {
      key,
      dayOfMonth: Number(key.slice(8, 10)),
      outsideMonth: key.slice(0, 7) !== firstDay.slice(0, 7),
      selected: key === options.value,
      today: key === options.today,
      disabled: (minimum !== undefined && key < minimum) || (maximum !== undefined && key > maximum),
    };
  });
}

function CalendarNavigationButton({ label, icon: Icon, disabled, onClick }: { label: string; icon: typeof ChevronLeft; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:text-core-muted disabled:opacity-40"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}

export function CoreDatePicker({ value, min, max, today, ariaLabel, ariaDescribedBy, id, className = "", onValueChange }: CoreDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(() => resolveAnchor(value, today, min, max));
  const [visibleMonth, setVisibleMonth] = React.useState(() => startOfMonthKey(focusKey));
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const pendingDayFocusRef = React.useRef(false);
  const days = open ? createCoreDatePickerMonth(visibleMonth, { value, today, min, max }) : [];
  const displayValue = isDayKey(value) ? DISPLAY_DATE_FORMATTER.format(dateFromKey(value)) : "Datum auswählen";

  React.useLayoutEffect(() => {
    if (!open || !pendingDayFocusRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>(`[data-date-key="${focusKey}"]`)?.focus();
      pendingDayFocusRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, open, visibleMonth]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const anchor = resolveAnchor(value, today, min, max);
      setVisibleMonth(startOfMonthKey(anchor));
      setFocusKey(anchor);
      pendingDayFocusRef.current = true;
    }
    setOpen(nextOpen);
  }

  function showMonth(monthOffset: number) {
    const nextMonth = shiftMonthKey(visibleMonth, monthOffset);
    const nextFocus = clampDayKey(moveDayToMonth(focusKey, nextMonth), min, max);
    setVisibleMonth(nextMonth);
    setFocusKey(nextFocus);
  }

  function focusDay(key: string) {
    const nextKey = clampDayKey(key, min, max);
    pendingDayFocusRef.current = true;
    setVisibleMonth(startOfMonthKey(nextKey));
    setFocusKey(nextKey);
  }

  function handleDayKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, key: string) {
    const weekdayIndex = (dateFromKey(key).getUTCDay() + 6) % 7;
    const nextKey = event.key === "ArrowLeft" ? shiftDayKey(key, -1)
      : event.key === "ArrowRight" ? shiftDayKey(key, 1)
        : event.key === "ArrowUp" ? shiftDayKey(key, -7)
          : event.key === "ArrowDown" ? shiftDayKey(key, 7)
            : event.key === "Home" ? shiftDayKey(key, -weekdayIndex)
              : event.key === "End" ? shiftDayKey(key, 6 - weekdayIndex)
                : event.key === "PageUp" ? moveDayToMonth(key, shiftMonthKey(key, event.shiftKey ? -12 : -1))
                  : event.key === "PageDown" ? moveDayToMonth(key, shiftMonthKey(key, event.shiftKey ? 12 : 1))
                    : null;
    if (!nextKey) return;
    event.preventDefault();
    focusDay(nextKey);
  }

  const previousYear = shiftMonthKey(visibleMonth, -12);
  const previousMonth = shiftMonthKey(visibleMonth, -1);
  const nextMonth = shiftMonthKey(visibleMonth, 1);
  const nextYear = shiftMonthKey(visibleMonth, 12);
  const monthLabel = MONTH_FORMATTER.format(dateFromKey(visibleMonth));

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          data-core-date-picker="trigger"
          className={`core-field inline-flex items-center justify-between gap-3 text-left transition hover:border-[var(--core-action-primary)] ${className}`}
        >
          <span>{displayValue}</span>
          <CalendarDays size={17} className="shrink-0 text-core-action" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          role="dialog"
          aria-label={`${ariaLabel}: Datum auswählen`}
          data-core-date-picker="calendar"
          className="core-overlay z-[100] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-3 outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1">
            <div className="flex">
              <CalendarNavigationButton label="Ein Jahr zurück" icon={ChevronsLeft} disabled={!monthHasEnabledDay(previousYear, min, max)} onClick={() => showMonth(-12)} />
              <CalendarNavigationButton label="Vorherigen Monat anzeigen" icon={ChevronLeft} disabled={!monthHasEnabledDay(previousMonth, min, max)} onClick={() => showMonth(-1)} />
            </div>
            <p className="whitespace-nowrap text-center core-body font-semibold capitalize text-core-text" aria-live="polite">{monthLabel}</p>
            <div className="flex">
              <CalendarNavigationButton label="Nächsten Monat anzeigen" icon={ChevronRight} disabled={!monthHasEnabledDay(nextMonth, min, max)} onClick={() => showMonth(1)} />
              <CalendarNavigationButton label="Ein Jahr weiter" icon={ChevronsRight} disabled={!monthHasEnabledDay(nextYear, min, max)} onClick={() => showMonth(12)} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => <span key={label} className="py-1 text-center core-caption font-semibold text-core-muted">{label}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Kalendertage für ${monthLabel}`}>
            {days.map((day) => {
              const selectedClass = day.selected ? "bg-[var(--core-action-primary)] text-[var(--core-text-on-accent)] shadow-sm" : day.today ? "ring-1 ring-inset ring-[var(--core-action-primary)] text-core-text" : day.outsideMonth ? "text-core-muted opacity-65" : "text-core-text";
              const hoverClass = day.selected ? "hover:bg-[var(--core-action-primary-hover)]" : "hover:bg-[var(--core-surface-hover)]";
              return (
                <button
                  key={day.key}
                  type="button"
                  data-date-key={day.key}
                  aria-label={LONG_DATE_FORMATTER.format(dateFromKey(day.key))}
                  aria-pressed={day.selected}
                  aria-current={day.today ? "date" : undefined}
                  disabled={day.disabled}
                  tabIndex={day.key === focusKey ? 0 : -1}
                  className={`aspect-square min-h-9 rounded-lg core-body font-semibold transition ${selectedClass} ${hoverClass} disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--core-action-disabled-text)] disabled:opacity-35`}
                  onKeyDown={(event) => handleDayKeyDown(event, day.key)}
                  onClick={() => {
                    onValueChange(day.key);
                    setOpen(false);
                  }}
                >
                  {day.dayOfMonth}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
