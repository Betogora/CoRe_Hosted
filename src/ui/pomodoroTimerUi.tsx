import React from "react";
import { ChevronDown, Pause, Pencil, Play, RotateCcw, Timer } from "lucide-react";
import { colorContrast, normalizeColor } from "../colorMath.ts";
import {
  DEFAULT_POMODORO_MINUTES,
  getPomodoroTimerSnapshot,
  type PomodoroTimer,
} from "../pomodoroTimer.ts";
import { CoreTag } from "./coreUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

export const POMODORO_PRESET_MINUTES = [10, 25, 50] as const;
export const STUDY_TIMER_COLOR_STORAGE_KEY = "core.studyTimer.color.v1";
export const STUDY_TIMER_DEFAULT_COLOR = "#b95e00";
const MAX_MINUTES = 999;
// Wheel delta that moves the minutes by one; trackpads send many small deltas.
const WHEEL_STEP = 40;

function readStoredTimerColor() {
  if (typeof window === "undefined") return STUDY_TIMER_DEFAULT_COLOR;
  try {
    return normalizeColor(window.localStorage.getItem(STUDY_TIMER_COLOR_STORAGE_KEY), STUDY_TIMER_DEFAULT_COLOR);
  } catch {
    return STUDY_TIMER_DEFAULT_COLOR;
  }
}

const timerColorListeners = new Set<(color: string) => void>();

/** The browser-local Lerntimer color; a commit reaches every timer surface in this tab, other tabs follow the storage event. */
export function useStudyTimerColor() {
  const [color, setColor] = React.useState(readStoredTimerColor);
  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STUDY_TIMER_COLOR_STORAGE_KEY) setColor(normalizeColor(event.newValue, STUDY_TIMER_DEFAULT_COLOR));
    };
    timerColorListeners.add(setColor);
    window.addEventListener("storage", handleStorage);
    return () => {
      timerColorListeners.delete(setColor);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);
  const commit = React.useCallback((next: string) => {
    try {
      window.localStorage.setItem(STUDY_TIMER_COLOR_STORAGE_KEY, next);
    } catch {
      // Der Lerntimer bleibt auch ohne browserlokale Farbpersistenz bedienbar.
    }
    for (const listener of timerColorListeners) listener(next);
  }, []);
  return [color, commit] as const;
}

/** The surface color stays the same in both themes; only the text follows it, like on the heatmap band. */
function studyTimerColorStyle(color: string) {
  return {
    "--core-study-timer": color,
    "--core-study-timer-on": colorContrast(color, "#ffffff") >= colorContrast(color, "#111827") ? "#ffffff" : "#111827",
  } as React.CSSProperties;
}

function usePomodoroTimerSnapshot(timer: PomodoroTimer | null) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    setNow(Date.now());
    if (!timer || timer.pausedAt !== undefined) return undefined;
    // Faster than a second, so the shown seconds never skip one.
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer]);

  return getPomodoroTimerSnapshot(timer, now);
}

const padMinutes = (minutes: number) => String(minutes).padStart(2, "0");

function clockParts(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1_000);
  return { minutes: padMinutes(Math.floor(seconds / 60)), seconds: String(seconds % 60).padStart(2, "0") };
}

function useTimerMinutes(initialMinutes: number) {
  const [minutes, setMinutes] = React.useState(() => padMinutes(initialMinutes));
  const [editing, setEditing] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const select = React.useCallback((next: number) => setMinutes(padMinutes(next)), []);
  const step = React.useCallback((delta: number) => setMinutes((current) => padMinutes(Math.max(1, Math.min(MAX_MINUTES, (Number(current) || 0) + delta)))), []);
  return { minutes, value: Number(minutes), editing, setEditing, input, select, step, setMinutes };
}

type TimerMinutes = ReturnType<typeof useTimerMinutes>;

function MinutesInput({ duration }: { duration: TimerMinutes }) {
  const { input, step } = duration;
  React.useEffect(() => {
    const element = input.current;
    if (!element) return undefined;
    let delta = 0;
    let at = 0;
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      if (event.timeStamp - at > 200 || Math.sign(delta) !== Math.sign(amount)) delta = 0;
      at = event.timeStamp;
      delta += amount;
      const steps = Math.trunc(delta / WHEEL_STEP);
      if (steps) {
        delta -= steps * WHEEL_STEP;
        step(-steps);
      }
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [input, step]);

  return (
    // The hidden copy of the digits gives the field exactly their width in any font.
    <span className="core-study-timer-minutes">
      <span aria-hidden="true">{duration.minutes || "0"}</span>
      <input
        ref={input}
        aria-label="Minuten"
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-valuemin={1}
        aria-valuemax={MAX_MINUTES}
        aria-valuenow={duration.value}
        value={duration.minutes}
        onFocus={(event) => {
          duration.setEditing(true);
          event.target.select();
        }}
        onBlur={() => {
          duration.setEditing(false);
          if (!duration.value) duration.select(DEFAULT_POMODORO_MINUTES);
        }}
        onChange={(event) => {
          const value = event.target.value;
          if (/^\d{0,3}$/.test(value)) duration.setMinutes(value === "" ? "" : padMinutes(Math.min(MAX_MINUTES, Number(value))));
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          step(event.key === "ArrowUp" ? 1 : -1);
        }}
      />
    </span>
  );
}

/** mm:ss in the timer's text color; with `duration` the minutes are the editable field, otherwise `label` names the running time. */
function TimerClock({ duration, minutes, seconds = "00", label }: { duration?: TimerMinutes; minutes?: string; seconds?: string; label?: string }) {
  const minuteDigits = duration ? duration.minutes.length : minutes!.length;
  return (
    <div className="core-study-timer-clock" role={label ? "timer" : undefined} aria-label={label} data-editing={duration?.editing || undefined} style={{ "--core-study-timer-digits": Math.max(2, minuteDigits) + 3 } as React.CSSProperties}>
      {duration ? <MinutesInput duration={duration} /> : <span>{minutes}</span>}
      <span className="core-study-timer-seconds" aria-hidden={duration ? true : undefined}>:{seconds}</span>
    </div>
  );
}

function FilledPlay({ size }: { size: number }) {
  return <Play size={size} fill="currentColor" aria-hidden="true" />;
}

function TimerPresets({ duration }: { duration: TimerMinutes }) {
  return (
    <div className="core-study-timer-presets" role="group" aria-label="Dauer wählen">
      {POMODORO_PRESET_MINUTES.map((preset) => (
        <button
          key={preset}
          type="button"
          className="core-study-timer-button"
          aria-label={`${preset} Minuten`}
          aria-pressed={!duration.editing && duration.value === preset}
          onClick={() => duration.select(preset)}
        >
          {preset}
        </button>
      ))}
      <CoreTooltip label="Dauer eintippen">
        <button
          type="button"
          className="core-study-timer-button"
          data-quiet
          data-active={duration.editing || undefined}
          aria-label="Dauer eintippen"
          // Keeps the focus in the minutes while they are being typed.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => duration.input.current?.focus()}
        >
          <Pencil size={22} aria-hidden="true" />
        </button>
      </CoreTooltip>
    </div>
  );
}

export interface StudyTimerTileProps {
  timer: PomodoroTimer | null;
  onStart: (minutes: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

/** The Lerntimer as a full-colour tile: set the minutes, start, pause and reset the one account timer. */
export function StudyTimerTile({ timer, onStart, onPause, onResume, onReset }: StudyTimerTileProps) {
  const [color] = useStudyTimerColor();
  const snapshot = usePomodoroTimerSnapshot(timer);
  const duration = useTimerMinutes(timer ? Math.max(1, Math.round(timer.durationMinutes)) : DEFAULT_POMODORO_MINUTES);
  const { select } = duration;
  React.useEffect(() => {
    if (timer) select(Math.max(1, Math.round(timer.durationMinutes)));
  }, [timer?.id, timer?.durationMinutes, select]);

  const active = timer !== null && snapshot.remainingMilliseconds > 0;
  const paused = active && timer.pausedAt !== undefined;
  const remaining = clockParts(snapshot.remainingMilliseconds);

  return (
    <div className="core-study-timer-tile" style={studyTimerColorStyle(color)} data-state={!active ? "ready" : paused ? "paused" : "running"}>
      {active ? <span className="core-study-timer-level" style={{ height: `${(1 - snapshot.progress) * 100}%` }} aria-hidden="true" /> : null}
      <h2 className="core-study-timer-label">Lerntimer</h2>
      {active ? (
        <>
          <TimerClock minutes={remaining.minutes} seconds={remaining.seconds} label={`Noch ${snapshot.remainingMinutes} Min.`} />
          <div className="core-study-timer-foot">
            {paused
              ? <button type="button" className="core-study-timer-button" data-solid aria-label="Lerntimer fortsetzen" onClick={onResume}><FilledPlay size={22} /></button>
              : <button type="button" className="core-study-timer-button" data-solid aria-label="Lerntimer pausieren" onClick={onPause}><Pause size={22} fill="currentColor" aria-hidden="true" /></button>}
            <CoreTooltip label="Lerntimer zurücksetzen">
              <button type="button" className="core-study-timer-button" aria-label="Lerntimer zurücksetzen" disabled={!paused} onClick={onReset}><RotateCcw size={20} aria-hidden="true" /></button>
            </CoreTooltip>
          </div>
        </>
      ) : (
        <form
          className="core-study-timer-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (duration.value > 0) onStart(duration.value);
          }}
        >
          <TimerClock duration={duration} />
          <div className="core-study-timer-foot">
            <button type="submit" className="core-study-timer-button" data-solid aria-label="Lerntimer starten" disabled={duration.value <= 0}><FilledPlay size={22} /></button>
            <TimerPresets duration={duration} />
          </div>
        </form>
      )}
    </div>
  );
}

export interface PomodoroTimerControlProps {
  timer: PomodoroTimer | null;
  variant: "settings" | "study";
  onStart: (minutes: number) => void;
}

export function PomodoroTimerControl({ timer, variant, onStart }: PomodoroTimerControlProps) {
  const [open, setOpen] = React.useState(false);
  const [color] = useStudyTimerColor();
  const duration = useTimerMinutes(timer ? Math.max(1, Math.round(timer.durationMinutes)) : DEFAULT_POMODORO_MINUTES);
  const regionId = React.useId();
  const snapshot = usePomodoroTimerSnapshot(timer);
  const isSettings = variant === "settings";
  const { select } = duration;
  // The settings row names the remaining time in its state tag, so its value stays the duration.
  const value = snapshot.running && !isSettings ? `${snapshot.remainingMinutes} Min.` : `${duration.value || DEFAULT_POMODORO_MINUTES} Min.`;

  React.useEffect(() => {
    if (timer) select(Math.max(1, Math.round(timer.durationMinutes)));
  }, [timer?.id, timer?.durationMinutes, select]);

  return (
    <div data-pomodoro-control={variant}>
      <button
        type="button"
        className={isSettings
          ? "flex w-full items-center gap-6 py-4 text-left"
          : "flex min-h-11 w-full items-center justify-between gap-3 text-left"}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
      >
        {isSettings ? (
          <span className="core-settings-row-heading flex-1">
            <span className="core-settings-row-title">Lerntimer</span>
            {snapshot.running ? <CoreTag tone="info">{`Läuft · ${snapshot.remainingMinutes} Min.`}</CoreTag> : null}
          </span>
        ) : (
          <span className="core-control-label flex min-w-0 flex-1 items-center gap-2 text-core-text">
            <Timer className="shrink-0 text-core-muted" size={16} aria-hidden="true" />
            <span className="min-w-0 flex-1">Lerntimer</span>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-2 core-body font-normal text-core-muted">
          {value}
          <ChevronDown className={`text-core-muted transition-transform ${open ? "rotate-180" : ""}`} size={16} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <form
          id={regionId}
          aria-label="Lerntimer einstellen"
          noValidate
          className={`core-study-timer-strip ${isSettings ? "mb-4" : "mb-2"}`}
          style={studyTimerColorStyle(color)}
          onSubmit={(event) => {
            event.preventDefault();
            if (duration.value > 0) onStart(duration.value);
          }}
        >
          <TimerClock duration={duration} />
          <TimerPresets duration={duration} />
          <button type="submit" className="core-study-timer-button core-study-timer-start" data-solid aria-label="Lerntimer starten" disabled={duration.value <= 0}><FilledPlay size={18} /></button>
        </form>
      ) : null}
    </div>
  );
}

export interface PomodoroPillProps {
  timer: PomodoroTimer | null;
  onPauseChange: (paused: boolean) => void;
}

/** The running or paused timer in the timer color, filled by the elapsed share; the whole pill pauses or resumes it. */
export function PomodoroPill({ timer, onPauseChange }: PomodoroPillProps) {
  const [color] = useStudyTimerColor();
  const snapshot = usePomodoroTimerSnapshot(timer);
  if (!timer || snapshot.remainingMilliseconds <= 0) return null;

  const paused = timer.pausedAt !== undefined;
  const { minutes, seconds } = clockParts(snapshot.remainingMilliseconds);
  return (
    <button
      type="button"
      className="core-study-timer-pill"
      data-pomodoro-pill
      data-paused={paused || undefined}
      style={{ ...studyTimerColorStyle(color), "--core-study-timer-elapsed": `${(1 - snapshot.progress) * 100}%` } as React.CSSProperties}
      aria-label={`${paused ? "Lerntimer fortsetzen" : "Lerntimer pausieren"}, noch ${snapshot.remainingMinutes} Min.`}
      onClick={() => onPauseChange(!paused)}
    >
      <span className="core-study-timer-pill-icon" aria-hidden="true">{paused ? <FilledPlay size={14} /> : <Pause size={14} fill="currentColor" />}</span>
      <span className="core-study-timer-pill-time">{minutes}:{seconds}</span>
    </button>
  );
}
