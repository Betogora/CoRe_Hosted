import React from "react";
import { ChevronRight, Play, Timer as TimerIcon } from "lucide-react";
import {
  DEFAULT_POMODORO_MINUTES,
  getPomodoroTimerSnapshot,
  normalizePomodoroMinutes,
  type PomodoroTimer,
} from "../pomodoroTimer.ts";
import { ActionButton } from "./actionUi.tsx";

function usePomodoroTimerSnapshot(timer: PomodoroTimer | null) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    setNow(Date.now());
    if (!timer) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [timer]);

  return getPomodoroTimerSnapshot(timer, now);
}

export interface PomodoroTimerControlProps {
  timer: PomodoroTimer | null;
  variant: "settings" | "study";
  onStart: (minutes: number) => void;
}

export function PomodoroTimerControl({ timer, variant, onStart }: PomodoroTimerControlProps) {
  const [open, setOpen] = React.useState(false);
  const [minutes, setMinutes] = React.useState(() => String(timer?.durationMinutes ?? DEFAULT_POMODORO_MINUTES));
  const [error, setError] = React.useState("");
  const regionId = React.useId();
  const errorId = React.useId();
  const snapshot = usePomodoroTimerSnapshot(timer);
  const value = snapshot.running ? `${snapshot.remainingMinutes} Min.` : `${timer?.durationMinutes ?? DEFAULT_POMODORO_MINUTES} Min.`;
  const isSettings = variant === "settings";

  React.useEffect(() => {
    if (timer?.durationMinutes) setMinutes(String(timer.durationMinutes));
  }, [timer?.id, timer?.durationMinutes]);

  function start(event: React.FormEvent) {
    event.preventDefault();
    const normalizedMinutes = normalizePomodoroMinutes(minutes);
    if (normalizedMinutes == null) {
      setError("Bitte gib eine positive ganze Minutenzahl ein.");
      return;
    }
    setError("");
    onStart(normalizedMinutes);
  }

  return (
    <div className={isSettings ? "border-b border-[var(--core-border)]" : ""} data-pomodoro-control={variant}>
      <button
        type="button"
        className={isSettings
          ? "flex min-h-[4.75rem] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--core-surface-hover)] sm:px-6"
          : "flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left core-body font-semibold text-[var(--core-text-secondary)] transition hover:text-[var(--core-text)]"}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className={isSettings
            ? "grid size-11 shrink-0 place-items-center rounded-full bg-core-subtle text-[var(--core-action-secondary)]"
            : "contents"}
          >
            <TimerIcon className="shrink-0" size={isSettings ? 20 : 18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={isSettings ? "block core-body-large font-semibold text-[var(--core-text)]" : "block"}>Pomodoro-Timer</span>
            {isSettings ? (
              <span className="block truncate core-caption font-normal text-[var(--core-text-muted)]">
                {snapshot.running ? `Aktiv · noch ${snapshot.remainingMinutes} Min.` : "Dauer festlegen und global starten"}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 core-body font-normal text-[var(--core-text-muted)]">
          {value}
          <ChevronRight className={`transition-transform ${open ? "rotate-90" : ""}`} size={17} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <form
          id={regionId}
          aria-label="Pomodoro-Timer einstellen"
          noValidate
          className={isSettings
            ? "grid gap-3 bg-[var(--core-surface-muted)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-6"
            : "mb-2 grid gap-3 rounded-xl bg-[var(--core-surface-muted)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"}
          onSubmit={start}
        >
          <label className="core-field-group">
            <span className="core-field-label">Dauer in Minuten</span>
            <input
              className="core-field"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={minutes}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setMinutes(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <span id={errorId} className="core-field-error">{error}</span> : null}
          </label>
          <ActionButton type="submit" variant="primary" icon={Play}>Start</ActionButton>
        </form>
      ) : null}
    </div>
  );
}

export interface PomodoroProgressProps {
  timer: PomodoroTimer | null;
  variant: "study" | "sidebar" | "header";
}

export function PomodoroProgress({ timer, variant }: PomodoroProgressProps) {
  const snapshot = usePomodoroTimerSnapshot(timer);
  if (variant !== "study" && !snapshot.running) return null;

  const remainingSeconds = Math.ceil(snapshot.remainingMilliseconds / 1_000);
  const maximumSeconds = Math.max(1, (timer?.durationMinutes ?? DEFAULT_POMODORO_MINUTES) * 60);
  const valueText = snapshot.running ? `Noch ${snapshot.remainingMinutes} Min.` : "Nicht gestartet";
  const isHeader = variant === "header";
  const isStudy = variant === "study";

  return (
    <div
      className={isHeader ? "min-w-0 flex-1" : isStudy ? "grid gap-2" : "grid gap-1.5"}
      data-pomodoro-progress={variant}
    >
      <div className={`flex items-center justify-between gap-2 ${isHeader ? "core-caption" : "core-status-label uppercase tracking-wide"} text-[var(--core-text-muted)]`}>
        <span className="min-w-0 truncate">Pomodoro-Timer</span>
        <span className="shrink-0">{valueText}</span>
      </div>
      <div
        className={`${isStudy ? "h-2" : "h-1.5"} overflow-hidden rounded-full bg-core-subtle`}
        role="progressbar"
        aria-label="Pomodoro-Timer"
        aria-valuemin={0}
        aria-valuemax={maximumSeconds}
        aria-valuenow={remainingSeconds}
        aria-valuetext={valueText}
        data-testid={isStudy ? "study-pomodoro-progress" : undefined}
      >
        <div
          className="h-full rounded-full bg-core-action transition-[width] duration-1000 ease-linear"
          style={{ width: `${snapshot.progress * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
