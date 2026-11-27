import React from "react";
import { Pause, Play } from "lucide-react";
import { colorContrast, normalizeColor } from "../colorMath.ts";
import { getPomodoroTimerSnapshot, type PomodoroTimer } from "../pomodoroTimer.ts";

const STUDY_TIMER_COLOR_STORAGE_KEY = "core.studyTimer.color.v1";
const STUDY_TIMER_DEFAULT_COLOR = "#b95e00";

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

export function studyTimerColorStyle(color: string) {
  return {
    "--core-study-timer": color,
    "--core-study-timer-on": colorContrast(color, "#ffffff") >= colorContrast(color, "#111827") ? "#ffffff" : "#111827",
  } as React.CSSProperties;
}

export function usePomodoroTimerSnapshot(timer: PomodoroTimer | null) {
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

export const padMinutes = (minutes: number) => String(minutes).padStart(2, "0");

export function clockParts(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1_000);
  return { minutes: padMinutes(Math.floor(seconds / 60)), seconds: String(seconds % 60).padStart(2, "0") };
}


export interface PomodoroPillProps {
  timer: PomodoroTimer | null;
  onPauseChange: (paused: boolean) => void;
}

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
      <span className="core-study-timer-pill-icon" aria-hidden="true">{paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}</span>
      <span className="core-study-timer-pill-time">{minutes}:{seconds}</span>
    </button>
  );
}
