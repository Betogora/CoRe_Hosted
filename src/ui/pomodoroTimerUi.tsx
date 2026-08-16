import React from "react";
import { ChevronRight, Play } from "lucide-react";
import {
  DEFAULT_POMODORO_MINUTES,
  getPomodoroTimerSnapshot,
  normalizePomodoroMinutes,
  type PomodoroTimer,
} from "../pomodoroTimer.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreSegmentedControl } from "./coreUi.tsx";

export const POMODORO_PRESET_MINUTES = [15, 25, 45] as const;
type PomodoroPreset = `${typeof POMODORO_PRESET_MINUTES[number]}`;

const POMODORO_PRESET_OPTIONS = POMODORO_PRESET_MINUTES.map((minutes) => ({
  value: String(minutes) as PomodoroPreset,
  label: String(minutes),
}));

function TomatoIcon({ size = 18, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      {...props}
      data-pomodoro-icon="tomato"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7.2c-5 0-8.5 2.6-8.5 6.3 0 4.1 3.8 7 8.5 7s8.5-2.9 8.5-7c0-3.7-3.5-6.3-8.5-6.3Z" />
      <path d="M12 7.5 9.2 4.2l3.1 1.1 2.3-2-.3 2.9 3.3 1.2-3.9.8-1.7 2.5V7.5Z" />
    </svg>
  );
}

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
  const selectedPreset = POMODORO_PRESET_OPTIONS.some((option) => option.value === minutes) ? minutes as PomodoroPreset : "";

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
    <div className={isSettings ? "border-b border-[var(--core-border)] last:border-b-0" : ""} data-pomodoro-control={variant}>
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
            <TomatoIcon className="shrink-0 text-[var(--core-text)]" size={isSettings ? 20 : 18} />
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
          <ChevronRight className={`text-[var(--core-text)] transition-transform ${open ? "rotate-90" : ""}`} size={17} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <form
          id={regionId}
          aria-label="Pomodoro-Timer einstellen"
          noValidate
          className={isSettings
            ? "grid gap-3 bg-[var(--core-surface-muted)] px-4 py-4 sm:px-6"
            : "mb-2 grid gap-3 rounded-xl bg-[var(--core-surface-muted)] p-3"}
          onSubmit={start}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[8rem_minmax(12rem,1fr)_auto]">
            <label className="core-field-group col-start-1 row-start-1">
              <span className="core-field-label">Dauer in Minuten</span>
              <input
                className="core-field w-full"
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
            </label>
            <div className="core-field-group col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <span className="core-field-label">Schnellauswahl</span>
              <CoreSegmentedControl<PomodoroPreset | "">
                ariaLabel="Pomodoro-Dauer"
                options={POMODORO_PRESET_OPTIONS}
                value={selectedPreset}
                size="regular"
                className="w-full"
                onValueChange={(nextMinutes) => {
                  if (!nextMinutes) return;
                  setMinutes(nextMinutes);
                  if (error) setError("");
                }}
              />
            </div>
            <ActionButton type="submit" variant="primary" icon={Play} className="col-start-2 row-start-1 w-fit sm:col-start-3">Start</ActionButton>
          </div>
          {error ? <span id={errorId} className="core-field-error">{error}</span> : null}
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
  if (!timer || !snapshot.running) return null;

  const remainingSeconds = Math.ceil(snapshot.remainingMilliseconds / 1_000);
  const maximumSeconds = Math.max(1, timer.durationMinutes * 60);
  const valueText = `Noch ${snapshot.remainingMinutes} Min.`;
  const sidebarValueText = `${snapshot.remainingMinutes} min.`;
  const isHeader = variant === "header";
  const isStudy = variant === "study";
  const isSidebar = variant === "sidebar";

  return (
    <div
      className={isHeader ? "min-w-0 flex-1" : isStudy ? "grid gap-2" : "grid min-w-0 w-full gap-1.5"}
      data-pomodoro-progress={variant}
    >
      {isSidebar ? (
        <p className="min-w-0 truncate text-right core-caption font-semibold text-[var(--core-text-muted)]">{sidebarValueText}</p>
      ) : (
        <div className={`flex items-center justify-between gap-2 ${isHeader ? "core-caption" : "core-status-label uppercase tracking-wide"} text-[var(--core-text-muted)]`}>
          <span className="min-w-0 truncate">Pomodoro-Timer</span>
          <span className="shrink-0">{valueText}</span>
        </div>
      )}
      <div
        className={`${isStudy ? "h-2" : "h-1.5"} overflow-hidden rounded-full bg-core-subtle`}
        role="progressbar"
        aria-label="Pomodoro-Timer"
        aria-valuemin={0}
        aria-valuemax={maximumSeconds}
        aria-valuenow={remainingSeconds}
        aria-valuetext={isSidebar ? sidebarValueText : valueText}
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
