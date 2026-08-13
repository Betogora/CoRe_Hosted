import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem } from "./coreModel.ts";
import { DEFAULT_EASY_DAYS, createEasyDaysDueCounts, normalizeEasyDays, selectEasyDayInterval } from "./easyDays.ts";

const NOW = "2026-08-10T10:00:00.000Z";

test("easy days normalize seven independent weekday levels", () => {
  assert.deepEqual(normalizeEasyDays(null), DEFAULT_EASY_DAYS);
  assert.deepEqual(normalizeEasyDays({ monday: "minimum", tuesday: "reduced", wednesday: "invalid" }), {
    ...DEFAULT_EASY_DAYS,
    monday: "minimum",
    tuesday: "reduced",
  });
});

test("equal weekday levels and intervals outside the supported window are no-ops", () => {
  const context = { easyDays: { ...DEFAULT_EASY_DAYS, monday: "reduced", tuesday: "reduced", wednesday: "reduced", thursday: "reduced", friday: "reduced", saturday: "reduced", sunday: "reduced" } as const, dueCountsByDay: new Map(), timeZone: "Europe/Berlin", dayStartHour: 3 };
  assert.equal(selectEasyDayInterval({ rawIntervalDays: 20, elapsedDays: 5, maximumIntervalDays: 1000, now: NOW, context }), 20);
  assert.equal(selectEasyDayInterval({ rawIntervalDays: 91, elapsedDays: 5, maximumIntervalDays: 1000, now: NOW, context: { ...context, easyDays: { ...DEFAULT_EASY_DAYS, friday: "minimum" } } }), 91);
});

test("weighted selection stays inside the FSRS fuzz range and avoids a minimal day", () => {
  const context = {
    easyDays: { ...DEFAULT_EASY_DAYS, friday: "minimum" as const },
    dueCountsByDay: new Map<string, number>(),
    timeZone: "Europe/Berlin",
    dayStartHour: 3,
  };
  const selected = selectEasyDayInterval({ rawIntervalDays: 4, elapsedDays: 2, maximumIntervalDays: 1000, now: "2026-08-10T10:00:00.000Z", context });
  assert.equal(selected, 3);
});

test("the 90-day load horizon also bounds the selected candidate", () => {
  const dueCountsByDay = new Map<string, number>();
  for (let interval = 80; interval < 90; interval += 1) {
    dueCountsByDay.set(new Date(Date.parse(NOW) + interval * 86_400_000).toISOString().slice(0, 10), 100);
  }
  const selected = selectEasyDayInterval({
    rawIntervalDays: 90,
    elapsedDays: 5,
    maximumIntervalDays: 1000,
    now: NOW,
    context: {
      easyDays: { ...DEFAULT_EASY_DAYS, sunday: "minimum" },
      dueCountsByDay,
      timeZone: "Europe/Berlin",
      dayStartHour: 3,
    },
  });
  assert.equal(selected, 89);
});

test("existing account load breaks otherwise equal candidate days", () => {
  const context = {
    easyDays: { ...DEFAULT_EASY_DAYS, sunday: "reduced" as const },
    dueCountsByDay: new Map([["2026-08-14", 10]]),
    timeZone: "Europe/Berlin",
    dayStartHour: 3,
  };
  assert.equal(selectEasyDayInterval({ rawIntervalDays: 4, elapsedDays: 2, maximumIntervalDays: 1000, now: NOW, context }), 3);
});

test("account load counts active scheduled items once and excludes new or blocked cards", () => {
  const review = createBasicLearningItem("deck", "Review", "Antwort", { id: "review", reviewState: { state: "review", reps: 4, dueAt: "2026-08-15T10:00:00.000Z" } });
  const learning = createBasicLearningItem("deck", "Learning", "Antwort", { id: "learning", reviewState: { state: "learning", reps: 1, dueAt: "2026-08-15T10:00:00.000Z" } });
  const newCard = createBasicLearningItem("deck", "Neu", "Antwort", { id: "new", reviewState: { state: "new", reps: 0, dueAt: "2026-08-15T10:00:00.000Z" } });
  const suspended = { ...review, id: "suspended", status: "suspended" as const };
  const counts = createEasyDaysDueCounts([review, review, learning, newCard, suspended], NOW, { timeZone: "Europe/Berlin", dayStartHour: 3 });
  assert.equal(counts.get("2026-08-15"), 2);
});
