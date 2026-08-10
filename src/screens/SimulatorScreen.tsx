import React from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { SimulatorScreenProps } from "../appScreenProps.ts";
import {
  MAX_SIMULATION_OFFSET_MINUTES,
  SIMULATION_MINUTES_PER_DAY,
  formatSimulationDate,
  formatSimulationDuration,
  formatSimulationTime,
  getLocalDateInputValue,
  getSimulatedNow,
  getSimulationOffsetMinutesForDate,
} from "../simulationClock.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

const quickOffsets = [
  { minutes: 0, label: "Heute" },
  { minutes: 10, label: "+10 Min." },
  { minutes: 15, label: "+15 Min." },
  { minutes: 30, label: "+30 Min." },
  { minutes: 60, label: "+1 Std." },
  { minutes: 120, label: "+2 Std." },
  { minutes: 240, label: "+4 Std." },
  { minutes: SIMULATION_MINUTES_PER_DAY, label: "Morgen" },
  { minutes: 3 * SIMULATION_MINUTES_PER_DAY, label: "+3 Tage" },
  { minutes: 7 * SIMULATION_MINUTES_PER_DAY, label: "+7 Tage" },
  { minutes: 14 * SIMULATION_MINUTES_PER_DAY, label: "+14 Tage" },
  { minutes: 30 * SIMULATION_MINUTES_PER_DAY, label: "+30 Tage" },
] as const;

function formatSimulationHeading(offsetMinutes: number): string {
  const days = Math.floor(offsetMinutes / SIMULATION_MINUTES_PER_DAY);
  const remainingMinutes = offsetMinutes % SIMULATION_MINUTES_PER_DAY;
  if (days === 0) return `In ${formatSimulationDuration(remainingMinutes)}`;
  if (remainingMinutes === 0) return days === 1 ? "Morgen" : `In ${days} Tagen`;
  return `In ${days === 1 ? "einem Tag" : `${days} Tagen`} und ${formatSimulationDuration(remainingMinutes)}`;
}

export function SimulatorScreen({ systemNow, offsetMinutes, onOffsetChange }: SimulatorScreenProps) {
  const simulatedNow = getSimulatedNow(systemNow, offsetMinutes);
  const selectedDate = getLocalDateInputValue(simulatedNow);
  const minimumDate = getLocalDateInputValue(systemNow);
  const maximumDate = getLocalDateInputValue(getSimulatedNow(systemNow, MAX_SIMULATION_OFFSET_MINUTES));

  function selectOffset(value: number) {
    onOffsetChange(value);
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader eyebrow="Werkzeug · nur lokal" title="Simulator" />

      <StatusMessage tone="warning">
        Das Verschieben der Zeit verändert keine Karten. Bewertungen an einem simulierten Zukunftstag sind echte Reviews und werden dauerhaft gespeichert und synchronisiert. „Heute“ setzt nur die simulierte Uhr zurück, nicht bereits gespeicherte Reviews.
      </StatusMessage>

      <SoftPanel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--core-info-surface)] text-[var(--core-action-primary)]">
              <CalendarClock size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="core-heading-3 font-semibold text-[var(--core-text)]">
                {offsetMinutes === 0 ? "Heute" : formatSimulationHeading(offsetMinutes)}
              </p>
              <p className="core-body text-[var(--core-text-muted)]">{formatSimulationDate(simulatedNow)} · {formatSimulationTime(simulatedNow)} Uhr</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              label="Einen simulierten Tag zurück"
              icon={ChevronLeft}
              disabled={offsetMinutes === 0}
              onClick={() => selectOffset(offsetMinutes - SIMULATION_MINUTES_PER_DAY)}
            />
            <IconButton
              label="Einen simulierten Tag weiter"
              icon={ChevronRight}
              disabled={offsetMinutes === MAX_SIMULATION_OFFSET_MINUTES}
              onClick={() => selectOffset(offsetMinutes + SIMULATION_MINUTES_PER_DAY)}
            />
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="core-control-label font-semibold text-[var(--core-text-secondary)]">Schnellauswahl</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickOffsets.map((option) => (
              <button
                key={option.minutes}
                type="button"
                aria-pressed={offsetMinutes === option.minutes}
                onClick={() => selectOffset(option.minutes)}
                className={`min-h-11 rounded-xl px-4 core-body font-semibold transition ${offsetMinutes === option.minutes ? "bg-[var(--core-action-primary)] text-[var(--core-text-on-accent)]" : "border border-[var(--core-border)] bg-core-surface text-[var(--core-text-secondary)] hover:border-[var(--core-border-interactive)] hover:bg-[var(--core-surface-muted)]"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-6 grid max-w-sm gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
          Simuliertes Datum
          <input
            type="date"
            min={minimumDate}
            max={maximumDate}
            value={selectedDate}
            onChange={(event) => selectOffset(getSimulationOffsetMinutesForDate(systemNow, event.target.value))}
            className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 text-[var(--core-text)] outline-none"
          />
          <span className="core-caption font-normal text-[var(--core-text-muted)]">Bis zu zehn Jahre in die Zukunft.</span>
        </label>
      </SoftPanel>
    </div>
  );
}
