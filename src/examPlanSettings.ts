import * as v from "valibot";
import { stableContentHash } from "./coreModel.ts";
import type { ExamDailyTask, ExamPlan, ExamPlanningSettings, StudyTimeCapacity } from "./coreTypes.ts";

/** Upper bounds keep the profile small enough to load with every start (ADR-042). */
export const EXAM_PLANNING_LIMITS = { exams: 20, decksPerExam: 200, dateOverrides: 365, timeBlocks: 500, dailyTasks: 4000, dailyCardRefs: 5000 } as const;
export const EXAM_RETENTION_LEVELS = [0.85, 0.9, 0.95, 0.97] as const;
/** Root of an exam session; it only scopes the queue and lifts its limits, answers stay with each card's own deck. */
export const EXAM_SESSION_DECK_ID = "exam-session";

const daySchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.check((key) => {
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}));
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const minutes = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440));
const studyTimeSchema = v.pipe(v.strictObject({
  dailyMinutes: minutes,
  weekdays: v.pipe(v.array(v.boolean()), v.length(7)),
  weeklyMinutes: v.optional(v.pipe(v.array(minutes), v.length(7))),
  dateOverrides: v.pipe(v.array(v.strictObject({ date: daySchema, minutes })), v.maxLength(EXAM_PLANNING_LIMITS.dateOverrides)),
}), v.check((time) => new Set(time.dateOverrides.map((day) => day.date)).size === time.dateOverrides.length));
const timeBlockSchema = v.strictObject({ id: identifier, date: daySchema, start: minutes, end: minutes, examId: v.nullable(identifier) });
const capacitySchema = v.strictObject({
  timeBlocks: v.optional(v.pipe(v.array(timeBlockSchema), v.maxLength(EXAM_PLANNING_LIMITS.timeBlocks))),
});
const planSchema = v.pipe(v.strictObject({
  id: identifier,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  colorIndex: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(19))),
  color: v.optional(v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i), v.transform((color) => color.toLowerCase()))),
  status: v.picklist(["active", "paused", "completed"]),
  deckIds: v.pipe(v.array(identifier), v.minLength(1), v.maxLength(EXAM_PLANNING_LIMITS.decksPerExam)),
  excludedDeckIds: v.optional(v.pipe(v.array(identifier), v.maxLength(EXAM_PLANNING_LIMITS.decksPerExam))),
  examDate: daySchema,
  desiredRetention: v.pipe(v.number(), v.minValue(0.8), v.maxValue(0.97)),
  variants: v.boolean(),
  bufferDays: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
  studyTime: studyTimeSchema,
  topicOrder: v.optional(v.pipe(v.array(identifier), v.maxLength(200))),
  readSummaryBeforeTopics: v.optional(v.boolean()),
  completedSummaryDeckIds: v.optional(v.pipe(v.array(identifier), v.maxLength(200))),
  topicDates: v.optional(v.pipe(v.array(v.strictObject({ deckId: identifier, date: daySchema })), v.maxLength(200))),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
}), v.check((plan) => [plan.deckIds, plan.excludedDeckIds, plan.topicOrder, plan.completedSummaryDeckIds].every((ids) => !ids || new Set(ids).size === ids.length)),
  v.check((plan) => !plan.excludedDeckIds?.some((id) => plan.deckIds.includes(id))),
  v.check((plan) => !plan.topicDates || (new Set(plan.topicDates.map((topic) => topic.deckId)).size === plan.topicDates.length && plan.topicDates.every((topic) => topic.date < plan.examDate))));
const dailyTaskSchema = v.pipe(v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(800)), date: daySchema, examId: identifier,
  kind: v.picklist(["study", "summary"]),
  deckIds: v.pipe(v.array(identifier), v.length(1)),
  cardIds: v.pipe(v.array(identifier), v.maxLength(EXAM_PLANNING_LIMITS.dailyCardRefs)),
  capturedAt: v.pipe(v.string(), v.isoTimestamp()), completed: v.nullable(v.picklist(["manual", "automatic"])),
  planningKey: v.optional(identifier),
}), v.check((task) => new Set(task.cardIds).size === task.cardIds.length && (task.kind === "summary" ? !task.cardIds.length && task.completed !== "automatic" : task.cardIds.length > 0)));
/** One learning day's checklist with at most `dailyCardRefs` card references in total, so the synced profile stays small. */
const dailyTasksSchema = v.pipe(v.array(dailyTaskSchema), v.maxLength(EXAM_PLANNING_LIMITS.dailyTasks),
  v.check((tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length && tasks.reduce((sum, task) => sum + task.cardIds.length, 0) <= EXAM_PLANNING_LIMITS.dailyCardRefs
    && new Set(tasks.map((task) => task.date)).size <= 1));
function validDailyTasks(settings: ExamPlanningSettings) {
  return (settings.dailyTasks ?? []).every((task) => task.id === `${task.kind === "study" ? "topic" : "summary"}:${encodeURIComponent(task.examId)}:${encodeURIComponent(task.deckIds[0])}` && settings.exams.some((exam) => exam.id === task.examId && task.date < exam.examDate));
}
const settingsSchema = v.pipe(v.strictObject({
  version: v.literal(3),
  exams: v.pipe(v.array(planSchema), v.maxLength(EXAM_PLANNING_LIMITS.exams)),
  capacity: capacitySchema,
  dailyTasks: v.optional(dailyTasksSchema),
}), v.check((settings) => new Set(settings.exams.map((exam) => exam.id)).size === settings.exams.length), v.check(validTimeBlocks), v.check(validDailyTasks));

type TimeBlock = NonNullable<StudyTimeCapacity["timeBlocks"]>[number];
function validTimeBlock(block: TimeBlock, exams: readonly ExamPlan[], earlier: readonly TimeBlock[]) {
  return block.start < block.end && (block.examId === null || exams.some((exam) => exam.id === block.examId && block.date < exam.examDate))
    && !earlier.some((other) => other.id === block.id || (other.date === block.date && other.start < block.end && block.start < other.end));
}
function validTimeBlocks(settings: ExamPlanningSettings) {
  const blocks = settings.capacity.timeBlocks ?? [];
  return blocks.every((block, index) => validTimeBlock(block, settings.exams, blocks.slice(0, index)));
}

export function createStudyTimeCapacity(): StudyTimeCapacity {
  return { timeBlocks: [] };
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
  const capacity = input.capacity && typeof input.capacity === "object" ? input.capacity as Record<string, unknown> : {};
  const timeBlocks: TimeBlock[] = [];
  for (const candidate of Array.isArray(capacity.timeBlocks) ? capacity.timeBlocks : []) {
    const block = v.safeParse(timeBlockSchema, candidate);
    if (block.success && timeBlocks.length < EXAM_PLANNING_LIMITS.timeBlocks && validTimeBlock(block.output, exams, timeBlocks)) timeBlocks.push(block.output);
  }
  const settings: ExamPlanningSettings = { version: 3, exams, capacity: { timeBlocks } };
  if (!Array.isArray(input.dailyTasks)) return settings;
  // Invalid entries are dropped one by one, so a single broken task or block never costs the rest of the plan.
  const dailyTasks: ExamDailyTask[] = [];
  let cardRefs = 0;
  for (const candidate of input.dailyTasks) {
    const parsed = v.safeParse(dailyTaskSchema, candidate);
    if (!parsed.success) continue;
    const task = parsed.output;
    if (dailyTasks.length >= EXAM_PLANNING_LIMITS.dailyTasks || dailyTasks.some((entry) => entry.id === task.id) || (dailyTasks[0] && dailyTasks[0].date !== task.date)
      || cardRefs + task.cardIds.length > EXAM_PLANNING_LIMITS.dailyCardRefs || !validDailyTasks({ ...settings, dailyTasks: [task] })) continue;
    dailyTasks.push(task); cardRefs += task.cardIds.length;
  }
  settings.dailyTasks = dailyTasks;
  return settings;
}

/** Validates a complete planner state before it is written to the profile. */
export function validateExamPlanningSettings(value: unknown): ExamPlanningSettings {
  const result = v.safeParse(settingsSchema, value);
  if (!result.success) throw new Error("Die Angaben zur Prüfungsplanung sind ungültig.");
  return normalizeExamPlanningSettings(result.output);
}

/** Whether calendar edits keep blocks free of overlaps and before their exams. */
export function isValidExamCalendar(exams: ExamPlan[], capacity: StudyTimeCapacity) {
  return v.safeParse(settingsSchema, { version: 3, exams, capacity }).success;
}

/** Open daily targets of an exam stay valid only while everything that shapes its plan is unchanged. */
export function getExamPlanningKey(exam: ExamPlan, capacity: StudyTimeCapacity) {
  return stableContentHash([exam.deckIds, exam.excludedDeckIds, exam.examDate, exam.bufferDays, exam.studyTime, exam.topicOrder, exam.topicDates, exam.desiredRetention, exam.variants, exam.readSummaryBeforeTopics,
    (capacity.timeBlocks ?? []).filter((block) => block.examId === exam.id)], "exam-plan");
}

export function upsertExamPlan(settings: ExamPlanningSettings, plan: ExamPlan): ExamPlanningSettings {
  const exists = settings.exams.some((exam) => exam.id === plan.id);
  if (!exists && settings.exams.length >= EXAM_PLANNING_LIMITS.exams) throw new Error(`Höchstens ${EXAM_PLANNING_LIMITS.exams} Prüfungen sind möglich.`);
  const previous = settings.exams.find((exam) => exam.id === plan.id);
  const next = { ...settings, exams: exists ? settings.exams.map((exam) => exam.id === plan.id ? plan : exam) : [...settings.exams, plan] };
  if (previous && getExamPlanningKey(previous, settings.capacity) !== getExamPlanningKey(plan, settings.capacity)) next.dailyTasks = next.dailyTasks?.filter((task) => task.examId !== plan.id || task.completed !== null);
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
    id: `exam_${crypto.randomUUID()}`, name: "", status: "active", deckIds,
    examDate: date.toISOString().slice(0, 10), desiredRetention: 0.9, variants: true, bufferDays: 4,
    studyTime: { dailyMinutes: 120, weekdays: [true, true, true, true, true, false, false], dateOverrides: [] },
    readSummaryBeforeTopics: false, completedSummaryDeckIds: [],
    createdAt: timestamp, updatedAt: timestamp,
  };
}
