import * as v from "valibot";
import type { ExamPlan, ExamPlanningSettings, StudyTimeCapacity } from "./coreTypes.ts";

/** Upper bounds keep the profile small enough to load with every start (ADR-042). */
export const EXAM_PLANNING_LIMITS = { exams: 20, decksPerExam: 200, dateOverrides: 365 } as const;
export const EXAM_RETENTION_LEVELS = [0.85, 0.9, 0.95, 0.97] as const;
/** Root of an exam session; it only scopes the queue and lifts its limits, answers stay with each card's own deck. */
export const EXAM_SESSION_DECK_ID = "exam-session";

const daySchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.check((key) => {
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}));
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const minutes = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440));
const capacitySchema = v.pipe(v.strictObject({
  weekdayMinutes: minutes,
  weekendMinutes: minutes,
  weekdays: v.pipe(v.array(v.boolean()), v.length(7)),
  reserveFraction: v.pipe(v.number(), v.minValue(0), v.maxValue(0.4)),
  minimumMinutes: minutes,
  dateOverrides: v.pipe(v.array(v.strictObject({ date: daySchema, minutes })), v.maxLength(EXAM_PLANNING_LIMITS.dateOverrides)),
  weeklyMinutes: v.optional(v.pipe(v.array(minutes), v.length(7))),
  timeBlocks: v.optional(v.pipe(v.array(v.strictObject({ id: identifier, date: daySchema, start: minutes, end: minutes, examId: v.nullable(identifier) })), v.maxLength(500))),
}), v.check((capacity) => new Set(capacity.dateOverrides.map((day) => day.date)).size === capacity.dateOverrides.length));
const planSchema = v.pipe(v.strictObject({
  id: identifier,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  colorIndex: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(19))),
  color: v.optional(v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i), v.transform((color) => color.toLowerCase()))),
  status: v.picklist(["active", "paused", "completed"]),
  priority: v.picklist(["low", "normal", "high"]),
  deckIds: v.pipe(v.array(identifier), v.minLength(1), v.maxLength(EXAM_PLANNING_LIMITS.decksPerExam)),
  examDate: daySchema,
  desiredRetention: v.pipe(v.number(), v.minValue(0.8), v.maxValue(0.97)),
  variants: v.boolean(),
  bufferDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
  topicDates: v.optional(v.pipe(v.array(v.strictObject({ deckId: identifier, date: daySchema })), v.maxLength(200))),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
}), v.check((plan) => !plan.topicDates || (new Set(plan.topicDates.map((topic) => topic.deckId)).size === plan.topicDates.length && plan.topicDates.every((topic) => plan.deckIds.includes(topic.deckId) && topic.date < plan.examDate))));
const dailyTaskSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(800)), date: daySchema, examId: identifier,
  kind: v.picklist(["study", "quiz"]),
  deckIds: v.pipe(v.array(identifier), v.minLength(1), v.maxLength(EXAM_PLANNING_LIMITS.decksPerExam)),
  cardIds: v.pipe(v.array(identifier), v.maxLength(5000)),
  capturedAt: v.pipe(v.string(), v.isoTimestamp()), completed: v.nullable(v.picklist(["manual", "automatic"])),
});
const dailyTasksSchema = v.pipe(v.array(dailyTaskSchema), v.maxLength(4000),
  v.check((tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length && tasks.reduce((sum, task) => sum + task.cardIds.length, 0) <= 100000
    && new Set(tasks.map((task) => task.date)).size <= 1
    && tasks.every((task) => new Set(task.cardIds).size === task.cardIds.length && new Set(task.deckIds).size === task.deckIds.length && (task.kind === "quiz" ? !task.cardIds.length && task.completed !== "automatic" : task.cardIds.length > 0 && task.deckIds.length === 1))));
function validDailyTasks(settings: ExamPlanningSettings) {
  return (settings.dailyTasks ?? []).every((task) => task.id === (task.kind === "study" ? `topic:${encodeURIComponent(task.examId)}:${encodeURIComponent(task.deckIds[0])}` : `quiz:${task.examId}:${task.date}`) && settings.exams.some((exam) => exam.id === task.examId && task.date < exam.examDate && task.deckIds.every((id) => exam.deckIds.includes(id))));
}
const settingsSchema = v.pipe(v.strictObject({
  version: v.literal(1),
  exams: v.pipe(v.array(planSchema), v.maxLength(EXAM_PLANNING_LIMITS.exams)),
  capacity: capacitySchema,
  dailyTasks: v.optional(dailyTasksSchema),
}), v.check((settings) => new Set(settings.exams.map((exam) => exam.id)).size === settings.exams.length), v.check(validTimeBlocks), v.check(validDailyTasks));

function validTimeBlocks(settings: ExamPlanningSettings) {
  const blocks = settings.capacity.timeBlocks ?? [];
  return new Set(blocks.map((block) => block.id)).size === blocks.length && blocks.every((block, index) =>
    block.start < block.end && (block.examId === null || settings.exams.some((exam) => exam.id === block.examId && block.date < exam.examDate))
    && !blocks.slice(0, index).some((other) => other.date === block.date && other.start < block.end && block.start < other.end));
}

export function createStudyTimeCapacity(): StudyTimeCapacity {
  return { weekdayMinutes: 45, weekendMinutes: 60, weekdays: [true, true, true, true, true, false, false], reserveFraction: 0.12, minimumMinutes: 0, dateOverrides: [] };
}

function parsePlan(value: unknown): ExamPlan | null {
  const result = v.safeParse(planSchema, value);
  return result.success ? { ...result.output, deckIds: [...new Set(result.output.deckIds)] } : null;
}

/** Stored planner state; an invalid exam is dropped alone so the other plans survive. */
export function normalizeExamPlanningSettings(value: unknown): ExamPlanningSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const exams: ExamPlan[] = [];
  for (const candidate of Array.isArray(input.exams) ? input.exams : []) {
    const exam = parsePlan(candidate);
    if (exam && !exams.some((entry) => entry.id === exam.id) && exams.length < EXAM_PLANNING_LIMITS.exams) exams.push(exam);
  }
  const capacity = v.safeParse(capacitySchema, input.capacity);
  const settings: ExamPlanningSettings = { version: 1, exams, capacity: capacity.success ? capacity.output : createStudyTimeCapacity() };
  const dailyTasks = v.safeParse(dailyTasksSchema, input.dailyTasks);
  if (dailyTasks.success) settings.dailyTasks = dailyTasks.output.filter((task) => validDailyTasks({ ...settings, dailyTasks: [task] }));
  if (!validTimeBlocks(settings)) settings.capacity = { ...settings.capacity, timeBlocks: [] };
  return settings;
}

/** Validates a complete planner state before it is written to the profile. */
export function validateExamPlanningSettings(value: unknown): ExamPlanningSettings {
  const result = v.safeParse(settingsSchema, value);
  if (!result.success) throw new Error("Die Angaben zur Prüfungsplanung sind ungültig.");
  return normalizeExamPlanningSettings(result.output);
}

export function upsertExamPlan(settings: ExamPlanningSettings, plan: ExamPlan): ExamPlanningSettings {
  const exists = settings.exams.some((exam) => exam.id === plan.id);
  if (!exists && settings.exams.length >= EXAM_PLANNING_LIMITS.exams) throw new Error(`Höchstens ${EXAM_PLANNING_LIMITS.exams} Prüfungen sind möglich.`);
  const next = { ...settings, exams: exists ? settings.exams.map((exam) => exam.id === plan.id ? plan : exam) : [...settings.exams, plan] };
  if (next.dailyTasks) next.dailyTasks = next.dailyTasks.filter((task) => validDailyTasks({ ...next, dailyTasks: [task] }));
  return validateExamPlanningSettings(next);
}

export function removeExamPlan(settings: ExamPlanningSettings, id: string): ExamPlanningSettings {
  return { ...settings, ...(settings.dailyTasks ? { dailyTasks: settings.dailyTasks.filter((task) => task.examId !== id) } : {}), exams: settings.exams.filter((exam) => exam.id !== id), capacity: { ...settings.capacity, ...(settings.capacity.timeBlocks ? { timeBlocks: settings.capacity.timeBlocks.filter((block) => block.examId !== id) } : {}) } };
}

export function createExamPlan(today: string, deckIds: string[] = []): ExamPlan {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 42);
  const timestamp = new Date().toISOString();
  return {
    id: `exam_${crypto.randomUUID()}`, name: "", status: "active", priority: "normal", deckIds,
    examDate: date.toISOString().slice(0, 10), desiredRetention: 0.9, variants: true, bufferDays: 3,
    createdAt: timestamp, updatedAt: timestamp,
  };
}
