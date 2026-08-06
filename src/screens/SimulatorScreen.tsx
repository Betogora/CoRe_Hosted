import React from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { SimulatorScreenProps } from "../appScreenProps.ts";
import {
  MAX_SIMULATION_DAY_OFFSET,
  formatSimulationDate,
  getLocalDateInputValue,
  getSimulatedNow,
  getSimulationDayOffsetForDate,
} from "../simulationClock.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

const quickOffsets = [0, 1, 3, 7, 14, 30] as const;

function quickLabel(dayOffset: number): string {
  if (dayOffset === 0) return "Heute";
  if (dayOffset === 1) return "Morgen";
  return `+${dayOffset} Tage`;
}

export function SimulatorScreen({ systemNow, dayOffset, onDayOffsetChange }: SimulatorScreenProps) {
  const simulatedNow = getSimulatedNow(systemNow, dayOffset);
  const selectedDate = getLocalDateInputValue(simulatedNow);
  const minimumDate = getLocalDateInputValue(systemNow);
  const maximumDate = getLocalDateInputValue(getSimulatedNow(systemNow, MAX_SIMULATION_DAY_OFFSET));

  function selectOffset(value: number) {
    onDayOffsetChange(value);
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
                {dayOffset === 0 ? "Heute" : `In ${dayOffset} ${dayOffset === 1 ? "Tag" : "Tagen"}`}
              </p>
              <p className="core-body text-[var(--core-text-muted)]">{formatSimulationDate(simulatedNow)} · lokale Uhrzeit bleibt erhalten</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              label="Einen simulierten Tag zurück"
              icon={ChevronLeft}
              disabled={dayOffset === 0}
              onClick={() => selectOffset(dayOffset - 1)}
            />
            <IconButton
              label="Einen simulierten Tag weiter"
              icon={ChevronRight}
              disabled={dayOffset === MAX_SIMULATION_DAY_OFFSET}
              onClick={() => selectOffset(dayOffset + 1)}
            />
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="core-control-label font-semibold text-[var(--core-text-secondary)]">Schnellauswahl</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickOffsets.map((offset) => (
              <button
                key={offset}
                type="button"
                aria-pressed={dayOffset === offset}
                onClick={() => selectOffset(offset)}
                className={`min-h-11 rounded-xl px-4 core-body font-semibold transition ${dayOffset === offset ? "bg-[var(--core-action-primary)] text-[var(--core-text-on-accent)]" : "border border-[var(--core-border)] bg-core-surface text-[var(--core-text-secondary)] hover:border-[var(--core-border-interactive)] hover:bg-[var(--core-surface-muted)]"}`}
              >
                {quickLabel(offset)}
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
            onChange={(event) => selectOffset(getSimulationDayOffsetForDate(systemNow, event.target.value))}
            className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 text-[var(--core-text)] outline-none focus:border-[var(--core-focus)] focus:ring-2 focus:ring-[var(--core-focus-ring)]"
          />
          <span className="core-caption font-normal text-[var(--core-text-muted)]">Bis zu zehn Jahre in die Zukunft.</span>
        </label>
      </SoftPanel>
    </div>
  );
}
