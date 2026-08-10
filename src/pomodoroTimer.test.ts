import assert from "node:assert/strict";
import test from "node:test";
import {
  POMODORO_TIMER_STORAGE_KEY,
  clearPomodoroTimer,
  createPomodoroTimer,
  getPomodoroTimerSnapshot,
  getPomodoroTimerStorageKey,
  normalizePomodoroMinutes,
  normalizePomodoroTimer,
  readPomodoroTimer,
  writePomodoroTimer,
} from "./pomodoroTimer.ts";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test("pomodoro duration accepts only positive whole minutes", () => {
  assert.equal(normalizePomodoroMinutes(25), 25);
  assert.equal(normalizePomodoroMinutes("15"), 15);
  for (const invalid of ["", "1.5", 0, -1, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizePomodoroMinutes(invalid), null);
  }
});

test("pomodoro timer derives drift-free remaining minutes and progress", () => {
  const timer = createPomodoroTimer(25, 1_000, "pomodoro_test");
  assert.ok(timer);
  assert.deepEqual(getPomodoroTimerSnapshot(timer, 1_000), {
    running: true,
    remainingMilliseconds: 1_500_000,
    remainingMinutes: 25,
    progress: 1,
  });
  assert.deepEqual(getPomodoroTimerSnapshot(timer, 61_000), {
    running: true,
    remainingMilliseconds: 1_440_000,
    remainingMinutes: 24,
    progress: 0.96,
  });
  assert.deepEqual(getPomodoroTimerSnapshot(timer, timer.endsAt), {
    running: false,
    remainingMilliseconds: 0,
    remainingMinutes: 0,
    progress: 0,
  });
  assert.deepEqual(getPomodoroTimerSnapshot(timer, 0), {
    running: true,
    remainingMilliseconds: 1_500_000,
    remainingMinutes: 25,
    progress: 1,
  });
});

test("starting again replaces the active account timer", () => {
  const storage = createMemoryStorage();
  const firstTimer = createPomodoroTimer(25, 1_000, "pomodoro_first");
  const replacement = createPomodoroTimer(10, 2_000, "pomodoro_replacement");
  assert.ok(firstTimer);
  assert.ok(replacement);

  assert.equal(writePomodoroTimer("user-a", firstTimer, storage), true);
  assert.equal(writePomodoroTimer("user-a", replacement, storage), true);
  assert.deepEqual(readPomodoroTimer("user-a", storage), replacement);
});

test("pomodoro timer validates and keeps account storage separate", () => {
  const storage = createMemoryStorage();
  const timerA = createPomodoroTimer(25, 1_000, "pomodoro_a");
  const timerB = createPomodoroTimer(10, 2_000, "pomodoro_b");
  assert.ok(timerA);
  assert.ok(timerB);

  assert.equal(writePomodoroTimer("user-a", timerA, storage), true);
  assert.equal(writePomodoroTimer("user-b", timerB, storage), true);
  assert.deepEqual(readPomodoroTimer("user-a", storage), timerA);
  assert.deepEqual(readPomodoroTimer("user-b", storage), timerB);
  assert.notEqual(getPomodoroTimerStorageKey("user-a", storage), getPomodoroTimerStorageKey("user-b", storage));

  assert.equal(clearPomodoroTimer("user-a", timerB.id, storage), false);
  assert.deepEqual(readPomodoroTimer("user-a", storage), timerA);
  assert.equal(clearPomodoroTimer("user-a", timerA.id, storage), true);
  assert.equal(readPomodoroTimer("user-a", storage), null);
});

test("pomodoro storage discards malformed external data", () => {
  const storage = createMemoryStorage();
  const key = getPomodoroTimerStorageKey("user-a", storage);
  storage.setItem(key, JSON.stringify({ id: "broken", durationMinutes: 25, startedAt: 0, endsAt: 12 }));

  assert.equal(readPomodoroTimer("user-a", storage), null);
  assert.equal(storage.getItem(key), null);
  assert.equal(normalizePomodoroTimer({}), null);
  assert.equal(POMODORO_TIMER_STORAGE_KEY, "core.pomodoroTimer.v1");
});
