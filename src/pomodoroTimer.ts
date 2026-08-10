import { createAccountStorage } from "./accountStorage.ts";

export const DEFAULT_POMODORO_MINUTES = 25;
export const POMODORO_TIMER_STORAGE_KEY = "core.pomodoroTimer.v1";

const MILLISECONDS_PER_MINUTE = 60_000;

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface PomodoroTimer {
  id: string;
  durationMinutes: number;
  startedAt: number;
  endsAt: number;
}

export interface PomodoroTimerSnapshot {
  running: boolean;
  remainingMilliseconds: number;
  remainingMinutes: number;
  progress: number;
}

function createTimerId(now: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pomodoro_${crypto.randomUUID()}`;
  }
  return `pomodoro_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizePomodoroMinutes(value: unknown): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return Number.isSafeInteger(parsed * MILLISECONDS_PER_MINUTE) ? parsed : null;
}

export function normalizePomodoroTimer(value: unknown): PomodoroTimer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const durationMinutes = normalizePomodoroMinutes(candidate.durationMinutes);
  const startedAt = Number(candidate.startedAt);
  const endsAt = Number(candidate.endsAt);
  if (
    typeof candidate.id !== "string"
    || !candidate.id.trim()
    || durationMinutes == null
    || !Number.isSafeInteger(startedAt)
    || !Number.isSafeInteger(endsAt)
    || endsAt !== startedAt + durationMinutes * MILLISECONDS_PER_MINUTE
  ) return null;

  return { id: candidate.id, durationMinutes, startedAt, endsAt };
}

export function createPomodoroTimer(
  value: unknown,
  now = Date.now(),
  id = createTimerId(now),
): PomodoroTimer | null {
  const durationMinutes = normalizePomodoroMinutes(value);
  const startedAt = Math.round(now);
  if (durationMinutes == null || !Number.isSafeInteger(startedAt)) return null;
  const endsAt = startedAt + durationMinutes * MILLISECONDS_PER_MINUTE;
  if (!Number.isSafeInteger(endsAt)) return null;
  return { id, durationMinutes, startedAt, endsAt };
}

export function getPomodoroTimerSnapshot(
  timer: PomodoroTimer | null,
  now = Date.now(),
): PomodoroTimerSnapshot {
  if (!timer) {
    return { running: false, remainingMilliseconds: 0, remainingMinutes: 0, progress: 0 };
  }

  const totalMilliseconds = timer.durationMinutes * MILLISECONDS_PER_MINUTE;
  const remainingMilliseconds = Math.min(totalMilliseconds, Math.max(0, timer.endsAt - now));
  return {
    running: remainingMilliseconds > 0,
    remainingMilliseconds,
    remainingMinutes: Math.ceil(remainingMilliseconds / MILLISECONDS_PER_MINUTE),
    progress: Math.min(1, remainingMilliseconds / totalMilliseconds),
  };
}

export function getPomodoroTimerStorageKey(userId: string, storage?: StorageLike) {
  return createAccountStorage(userId, storage).accountKey(POMODORO_TIMER_STORAGE_KEY);
}

export function readPomodoroTimer(userId: string, storage?: StorageLike): PomodoroTimer | null {
  const accountStorage = createAccountStorage(userId, storage);
  try {
    const raw = accountStorage.getItem(POMODORO_TIMER_STORAGE_KEY);
    if (!raw) return null;
    const timer = normalizePomodoroTimer(JSON.parse(raw));
    if (timer) return timer;
    accountStorage.removeItem(POMODORO_TIMER_STORAGE_KEY);
  } catch {
    // Der Timer bleibt im aktuellen Tab nutzbar, wenn Browser-Storage nicht verfügbar ist.
  }
  return null;
}

export function writePomodoroTimer(userId: string, timer: PomodoroTimer, storage?: StorageLike): boolean {
  try {
    createAccountStorage(userId, storage).setItem(POMODORO_TIMER_STORAGE_KEY, JSON.stringify(timer));
    return true;
  } catch {
    return false;
  }
}

export function clearPomodoroTimer(userId: string, expectedId?: string, storage?: StorageLike): boolean {
  const accountStorage = createAccountStorage(userId, storage);
  try {
    if (expectedId) {
      const current = normalizePomodoroTimer(JSON.parse(accountStorage.getItem(POMODORO_TIMER_STORAGE_KEY) ?? "null"));
      if (current?.id !== expectedId) return false;
    }
    accountStorage.removeItem(POMODORO_TIMER_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
