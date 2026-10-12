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
}), v.check((capacity) => new Set(capacity.dateOverrides.map((day) => day.date)).size === capacity.dateOverrides.length));
const planSchema = v.strictObject({
  id: identifier,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  status: v.picklist(["active", "paused", "completed"]),
  priority: v.picklist(["low", "normal", "high"]),
  deckIds: v.pipe(v.array(identifier), v.minLength(1), v.maxLength(EXAM_PLANNING_LIMITS.decksPerExam)),
  examDate: daySchema,
  desiredRetention: v.pipe(v.number(), v.minValue(0.8), v.maxValue(0.97)),
  variants: v.boolean(),
  bufferDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
const settingsSchema = v.pipe(v.strictObject({
  version: v.literal(1),
  exams: v.pipe(v.array(planSchema), v.maxLength(EXAM_PLANNING_LIMITS.exams)),
  capacity: capacitySchema,
}), v.check((settings) => new Set(settings.exams.map((exam) => exam.id)).size === settings.exams.length));

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
  return { version: 1, exams, capacity: capacity.success ? capacity.output : createStudyTimeCapacity() };
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
  return validateExamPlanningSettings({ ...settings, exams: exists ? settings.exams.map((exam) => exam.id === plan.id ? plan : exam) : [...settings.exams, plan] });
}

export function removeExamPlan(settings: ExamPlanningSettings, id: string): ExamPlanningSettings {
  return { ...settings, exams: settings.exams.filter((exam) => exam.id !== id) };
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
