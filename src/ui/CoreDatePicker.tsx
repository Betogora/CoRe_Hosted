import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { dayKeyFromIndex, dayKeyIndex, endOfMonthKey, isDayKey, shiftDayKey, shiftMonthKey, startOfMonthKey } from "../learningDay.ts";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
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

type SegmentType = "day" | "month" | "year";
type Draft = Record<SegmentType, string>;

const SEGMENTS: ReadonlyArray<{ type: SegmentType; label: string; placeholder: string; length: number }> = [
  { type: "day", label: "Tag", placeholder: "TT", length: 2 },
  { type: "month", label: "Monat", placeholder: "MM", length: 2 },
  { type: "year", label: "Jahr", placeholder: "JJJJ", length: 4 },
];

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00Z`);
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

function draftFromKey(key: string): Draft {
  return isDayKey(key) ? { day: key.slice(8, 10), month: key.slice(5, 7), year: key.slice(0, 4) } : { day: "", month: "", year: "" };
}

function keyFromDraft(draft: Draft) {
  if (draft.year.length !== 4 || !draft.month || !draft.day) return null;
  const key = `${draft.year}-${draft.month.padStart(2, "0")}-${draft.day.padStart(2, "0")}`;
  return isDayKey(key) ? key : null;
}

function segmentRange(type: SegmentType, draft: Draft) {
  if (type === "month") return { min: 1, max: 12 };
  if (type === "year") return { min: 1, max: 9999 };
  const month = Number(draft.month) || 1;
  const year = draft.year.length === 4 ? Number(draft.year) : 2000;
  return { min: 1, max: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}

/**
 * One key on a date segment: arrows step with wrap-around (the year without), digits fill the segment and move on once it
 * is full or no further digit fits, Backspace removes the last digit. `typed` holds the digits of an entry in progress;
 * an empty segment steps from `anchor`. Returns null for keys the segment leaves alone.
 */
export function editDateSegment(draft: Draft, type: SegmentType, key: string, typed: string | null, anchor: Draft): { draft: Draft; typed: string | null; advance: boolean } | null {
  const { length } = SEGMENTS.find((segment) => segment.type === type)!;
  const range = segmentRange(type, draft);
  if (key === "ArrowUp" || key === "ArrowDown") {
    const step = key === "ArrowUp" ? 1 : -1;
    const current = Number(draft[type]);
    const next = !draft[type] ? Number(anchor[type])
      : type === "year" ? Math.min(range.max, Math.max(range.min, current + step))
        : ((current + step - range.min + range.max) % range.max) + range.min;
    return { draft: { ...draft, [type]: String(next).padStart(length, "0") }, typed: null, advance: false };
  }
  if (key === "Backspace" || key === "Delete") {
    const digits = (typed ?? draft[type].replace(/^0+(?=\d)/, "")).slice(0, -1);
    return { draft: { ...draft, [type]: digits }, typed: digits, advance: false };
  }
  if (!/^\d$/.test(key)) return null;
  const entry = (typed ?? "") + key;
  const digits = type !== "year" && Number(entry) > range.max ? key : entry.slice(-length);
  const advance = digits.length >= length || (type !== "year" && Number(digits) * 10 > range.max);
  return { draft: { ...draft, [type]: advance && type !== "year" ? digits.padStart(length, "0") : digits }, typed: advance ? null : digits, advance };
}

export function createCoreDatePickerMonth(monthKey: string, options: { value: string; today: string; min?: string; max?: string }): CoreDatePickerDay[] {
  const firstDay = startOfMonthKey(monthKey);
  const mondayOffset = (dateFromKey(firstDay).getUTCDay() + 6) % 7;
  const firstGridDayIndex = dayKeyIndex(firstDay) - mondayOffset;
  const minimum = isDayKey(options.min) ? options.min : undefined;
  const maximum = isDayKey(options.max) ? options.max : undefined;
  return Array.from({ length: 42 }, (_, index) => {
    const key = dayKeyFromIndex(firstGridDayIndex + index);
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

/**
 * Single calendar day after HeroUI v3 „Date Picker“: a field with keyboard-editable day, month and year segments and a
 * calendar trigger whose popover pages months, opens a year grid from its heading and moves by arrow keys. Only complete
 * dates inside `min`/`max` reach `onValueChange`; an incomplete or invalid entry is marked and reverts on leaving.
 */
export function CoreDatePicker({ value, min, max, today, ariaLabel, ariaDescribedBy, id, className = "", onValueChange }: CoreDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [yearsOpen, setYearsOpen] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(() => resolveAnchor(value, today, min, max));
  const [visibleMonth, setVisibleMonth] = React.useState(() => startOfMonthKey(focusKey));
  const [draft, setDraft] = React.useState<Draft>(() => draftFromKey(value));
  const [typing, setTyping] = React.useState<{ type: SegmentType; digits: string } | null>(null);
  const segmentRefs = React.useRef<Partial<Record<SegmentType, HTMLSpanElement | null>>>({});
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const yearsRef = React.useRef<HTMLDivElement | null>(null);
  const pendingDayFocusRef = React.useRef(false);
  const days = open ? createCoreDatePickerMonth(visibleMonth, { value, today, min, max }) : [];
  const draftKey = keyFromDraft(draft);
  const complete = SEGMENTS.every((segment) => draft[segment.type]);
  const invalid = !typing && complete && (!draftKey || clampDayKey(draftKey, min, max) !== draftKey);

  React.useEffect(() => setDraft(draftFromKey(value)), [value]);

  React.useLayoutEffect(() => {
    if (!open || !pendingDayFocusRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>(`[data-date-key="${focusKey}"]`)?.focus();
      pendingDayFocusRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, open, visibleMonth, yearsOpen]);

  React.useLayoutEffect(() => {
    const years = yearsRef.current;
    const selected = years?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (years && selected) years.scrollTop = selected.offsetTop - (years.clientHeight - selected.offsetHeight) / 2;
  }, [yearsOpen]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const anchor = resolveAnchor(value, today, min, max);
      setVisibleMonth(startOfMonthKey(anchor));
      setFocusKey(anchor);
      pendingDayFocusRef.current = true;
    }
    setYearsOpen(false);
    setOpen(nextOpen);
  }

  function showMonth(monthKey: string) {
    const nextFocus = clampDayKey(moveDayToMonth(focusKey, monthKey), min, max);
    setVisibleMonth(startOfMonthKey(nextFocus));
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

  function chooseYear(year: number) {
    const monthKey = `${String(year).padStart(4, "0")}${visibleMonth.slice(4)}`;
    pendingDayFocusRef.current = true;
    setYearsOpen(false);
    showMonth(monthKey);
  }

  function commitDraft(next: Draft) {
    const key = keyFromDraft(next);
    if (key && clampDayKey(key, min, max) === key && key !== value) onValueChange(key);
  }

  function focusSegment(index: number) {
    const segment = SEGMENTS[index];
    if (segment) segmentRefs.current[segment.type]?.focus();
  }

  function handleSegmentKeyDown(event: React.KeyboardEvent<HTMLSpanElement>, index: number) {
    const { type } = SEGMENTS[index];
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setTyping(null);
      focusSegment(index + (event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    const edit = editDateSegment(draft, type, event.key, typing?.type === type ? typing.digits : null, draftFromKey(resolveAnchor(value, today, min, max)));
    if (!edit) return;
    event.preventDefault();
    setTyping(edit.typed === null ? null : { type, digits: edit.typed });
    setDraft(edit.draft);
    // An entry in progress commits once its segment is full, so a half-typed day never reaches the caller.
    if (edit.typed === null) commitDraft(edit.draft);
    if (edit.advance) focusSegment(index + 1);
  }

  const previousMonth = shiftMonthKey(visibleMonth, -1);
  const nextMonth = shiftMonthKey(visibleMonth, 1);
  const monthLabel = MONTH_FORMATTER.format(dateFromKey(visibleMonth));
  const visibleYear = Number(visibleMonth.slice(0, 4));
  const todayYear = isDayKey(today) ? Number(today.slice(0, 4)) : visibleYear;
  const firstYear = isDayKey(min) ? Number(min.slice(0, 4)) : Math.min(visibleYear, todayYear - 100);
  const lastYear = isDayKey(max) ? Number(max.slice(0, 4)) : Math.max(visibleYear, todayYear + 100);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Anchor asChild>
        <div
          id={id}
          role="group"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          data-core-date-picker="field"
          data-invalid={invalid || undefined}
          className={`core-field core-date-field ${className}`}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setTyping(null);
            commitDraft(draft);
            setDraft(draftFromKey(value));
          }}
        >
          <span className="core-date-field-segments">
            {SEGMENTS.map((segment, index) => {
              const text = draft[segment.type];
              const range = segmentRange(segment.type, draft);
              return (
                <React.Fragment key={segment.type}>
                  {index ? <span aria-hidden="true" className="core-date-segment-literal">.</span> : null}
                  <span
                    ref={(element) => { segmentRefs.current[segment.type] = element; }}
                    role="spinbutton"
                    tabIndex={0}
                    aria-label={segment.label}
                    aria-valuemin={range.min}
                    aria-valuemax={range.max}
                    aria-valuenow={text ? Number(text) : undefined}
                    aria-valuetext={text ? String(Number(text)) : "Leer"}
                    aria-invalid={invalid || undefined}
                    inputMode="numeric"
                    data-placeholder={text ? undefined : "true"}
                    className="core-date-segment"
                    onFocus={() => setTyping(null)}
                    onKeyDown={(event) => handleSegmentKeyDown(event, index)}
                  >
                    {text || segment.placeholder}
                  </span>
                </React.Fragment>
              );
            })}
          </span>
          <Popover.Trigger asChild>
            <button type="button" aria-label={`${ariaLabel}: Kalender öffnen`} data-core-date-picker="trigger" className="core-date-field-trigger">
              <CalendarDays size={16} aria-hidden="true" />
            </button>
          </Popover.Trigger>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          role="dialog"
          aria-label={`${ariaLabel}: Datum auswählen`}
          data-core-date-picker="calendar"
          className="core-overlay core-date-calendar z-[100] outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (!yearsOpen) return;
            event.preventDefault();
            pendingDayFocusRef.current = true;
            setYearsOpen(false);
          }}
        >
          <div className="core-date-calendar-header">
            <button type="button" className="core-date-calendar-heading" aria-expanded={yearsOpen} aria-label={`${monthLabel}, Jahr auswählen`} onClick={() => setYearsOpen((current) => !current)}>
              <span aria-live="polite">{monthLabel}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            <button type="button" className="core-date-calendar-nav" aria-label="Vorherigen Monat anzeigen" disabled={yearsOpen || !monthHasEnabledDay(previousMonth, min, max)} onClick={() => showMonth(previousMonth)}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="core-date-calendar-nav" aria-label="Nächsten Monat anzeigen" disabled={yearsOpen || !monthHasEnabledDay(nextMonth, min, max)} onClick={() => showMonth(nextMonth)}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="core-date-calendar-body">
            <div className="core-date-calendar-grid" aria-hidden={yearsOpen || undefined}>
              {WEEKDAY_LABELS.map((label) => <span key={label} aria-hidden="true" className="core-date-calendar-weekday">{label}</span>)}
              <div className="contents" role="group" aria-label={`Kalendertage für ${monthLabel}`}>
                {days.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    data-date-key={day.key}
                    data-outside-month={day.outsideMonth || undefined}
                    aria-label={LONG_DATE_FORMATTER.format(dateFromKey(day.key))}
                    aria-pressed={day.selected}
                    aria-current={day.today ? "date" : undefined}
                    disabled={day.disabled}
                    tabIndex={day.key === focusKey && !yearsOpen ? 0 : -1}
                    className="core-date-calendar-day"
                    onKeyDown={(event) => handleDayKeyDown(event, day.key)}
                    onClick={() => {
                      onValueChange(day.key);
                      setOpen(false);
                    }}
                  >
                    {day.dayOfMonth}
                  </button>
                ))}
              </div>
            </div>
            {yearsOpen ? (
              <div className="core-date-calendar-years" role="group" aria-label="Jahr auswählen" ref={yearsRef}>
                {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((year) => (
                  <button key={year} type="button" aria-pressed={year === visibleYear} className="core-date-calendar-year" onClick={() => chooseYear(year)}>{year}</button>
                ))}
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
