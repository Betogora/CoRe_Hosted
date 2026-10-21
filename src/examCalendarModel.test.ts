import assert from "node:assert/strict";
import test from "node:test";
import { createExamMonthDays, createExamQuizRecommendations, getExamCalendarWork, shiftExamMonth, createExamWeekDays, examMinuteAtPosition, examSelectionRange } from "./examCalendarModel.ts";
import { createExamPlan, createStudyTimeCapacity } from "./examPlanSettings.ts";
import type { ExamPlanDay, StudyPlanBlock } from "./examPlanning.ts";

test("month grids start on Monday and include leap days and six-week months", () => {
  assert.equal(createExamMonthDays("2024-02").includes("2024-02-29"), true);
  const days = createExamMonthDays("2026-03");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-02-23");
  assert.equal(days.at(-1), "2026-04-05");
  assert.equal(createExamMonthDays("2027-02").length, 28);
  assert.equal(shiftExamMonth("2026-12", 1), "2027-01");
  assert.equal(shiftExamMonth("2026-01", -1), "2025-12");
});

test("filtered work counts shared cards once and all repeat methods", () => {
  const block = (id: string, method: StudyPlanBlock["method"], examIds: string[], cardIds: string[], expectedItems = 2): StudyPlanBlock => ({ id, method, examIds, cardIds, expectedItems, date: "2026-10-18", deckId: "deck", priority: 1 });
  const day: ExamPlanDay = { key: "2026-10-18", budgetMinutes: 60, newCardIds: [], reviewCardIds: [], reviewCount: 6, buffer: false, summaries: [], blocks: [block("new", "new", ["a", "b"], ["1", "2"]), block("review", "review", ["a", "b"], ["3"]), block("steps", "relearning", ["a"], ["4"]), block("variant", "variant", ["b"], ["5"])] };
  const all = getExamCalendarWork(day, new Set(["a", "b"]));
  assert.equal(all.newCards, 2);
  assert.equal(all.repetitions, 6);
  assert.equal(getExamCalendarWork(day, new Set(["a"])).repetitions, 4);
  assert.equal(getExamCalendarWork(undefined, new Set()).newCards, 0);
});

const exam = { ...createExamPlan("2026-10-18", ["deck"]), id: "exam", createdAt: "2026-10-18T08:00:00.000Z", examDate: "2026-10-30", studyTime: undefined };
const capacity = { ...createStudyTimeCapacity(), weekdays: Array(7).fill(true), weeklyMinutes: Array(7).fill(60) };

test("quiz recommendations repeat every three days and on the final available day", () => {
  const days = createExamQuizRecommendations([exam], capacity, "2026-10-18");
  assert.deepEqual([...days], [["2026-10-21", ["exam"]], ["2026-10-24", ["exam"]], ["2026-10-27", ["exam"]], ["2026-10-29", ["exam"]]]);
});

test("quiz recommendations skip free days, other exams, past dates and inactive exams", () => {
  const other = { ...exam, id: "other", examDate: "2026-10-28", status: "paused" as const };
  const days = createExamQuizRecommendations([exam, other], { ...capacity, dateOverrides: [{ date: "2026-10-29", minutes: 0 }] }, "2026-10-24");
  assert.deepEqual([...days], [["2026-10-24", ["exam"]], ["2026-10-27", ["exam"]]]);
  assert.equal(createExamQuizRecommendations([{ ...exam, status: "completed" }], capacity, "2026-10-18").size, 0);
});

test("quiz recommendations deduplicate checkpoints on the same available date", () => {
  const weeklyMinutes = Array(7).fill(0); weeklyMinutes[0] = 60;
  const days = createExamQuizRecommendations([exam], { ...capacity, weeklyMinutes }, "2026-10-19");
  assert.deepEqual([...days], [["2026-10-19", ["exam"]], ["2026-10-26", ["exam"]]]);
  const overrides = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${24 + i}`, minutes: 0 }));
  assert.deepEqual([...createExamQuizRecommendations([exam], { ...capacity, dateOverrides: overrides }, "2026-10-23")], [["2026-10-23", ["exam"]]]);
});


test("Wochenraster beginnt montags und markiert Viertelstunden in beiden Ziehrichtungen", () => {
  assert.deepEqual(createExamWeekDays("2026-11-01"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(examMinuteAtPosition(832, 1536), 780);
  assert.equal(examMinuteAtPosition(-10, 1536), 0);
  assert.equal(examMinuteAtPosition(2000, 1536), 1440);
  assert.deepEqual(examSelectionRange(780, 900), { start: 780, end: 900 });
  assert.deepEqual(examSelectionRange(900, 780), { start: 780, end: 900 });
  assert.deepEqual(examSelectionRange(1440, 1440), { start: 1425, end: 1440 });
});
