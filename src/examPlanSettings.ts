import * as v from "valibot";
import type { ExamLearningPlan, ExamPlanningSettings, Profile, StudyTimeCapacity } from "./coreTypes.ts";

const daySchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.check((key) => {
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}));
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const minutes = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440));
const capacitySchema = v.strictObject({
  weekdayMinutes: minutes, weekendMinutes: minutes,
  weekdays: v.pipe(v.array(v.boolean()), v.length(7)),
  reserveFraction: v.pipe(v.number(), v.minValue(0), v.maxValue(0.4)),
  minimumMinutes: minutes,
  dateOverrides: v.pipe(v.array(v.strictObject({ date: daySchema, minutes })), v.maxLength(365)),
});
const planSchema = v.strictObject({
  version: v.literal(2), id: identifier, userId: v.pipe(v.string(), v.maxLength(200)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  status: v.picklist(["active", "paused", "completed"]), priority: v.picklist(["low", "normal", "high"]),
  rootDeckId: identifier, chapterDeckIds: v.pipe(v.array(identifier), v.minLength(1), v.maxLength(1000)),
  examDate: daySchema, coverage: v.pipe(v.number(), v.integer(), v.minValue(50), v.maxValue(100)),
  desiredRetention: v.pipe(v.number(), v.minValue(0.8), v.maxValue(0.97)),
  cards: v.literal(true), variants: v.boolean(),
  bufferDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()), updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
const settingsSchema = v.strictObject({
  version: v.literal(2), exams: v.pipe(v.array(planSchema), v.maxLength(100)),
  capacity: capacitySchema, preparationCapacity: v.nullable(capacitySchema),
});

export function createStudyTimeCapacity(): StudyTimeCapacity {
  return { weekdayMinutes: 45, weekendMinutes: 60, weekdays: [true, true, true, true, true, false, false], reserveFraction: 0.12, minimumMinutes: 0, dateOverrides: [] };
}
export function readStudyTimeCapacity(value: unknown): StudyTimeCapacity | null {
  const result = v.safeParse(capacitySchema, value);
  if (!result.success || new Set(result.output.dateOverrides.map((day) => day.date)).size !== result.output.dateOverrides.length) return null;
  return result.output;
}
export function readExamLearningPlan(value: unknown): ExamLearningPlan | null {
  const result = v.safeParse(planSchema, value);
  if (!result.success) return null;
  return { ...result.output, chapterDeckIds: [...new Set(result.output.chapterDeckIds)] };
}

// Read the initial single-plan format once; all mutations write the versioned collection.
export function readExamPlanningSettings(profile: Pick<Profile, "userId" | "schedulerPreferences">): ExamPlanningSettings {
  const result = v.safeParse(settingsSchema, profile.schedulerPreferences.examPlanning);
  if (result.success && new Set(result.output.exams.map((exam) => exam.id)).size === result.output.exams.length) {
    return { ...result.output, exams: result.output.exams.filter((exam) => exam.userId === profile.userId),
      capacity: readStudyTimeCapacity(result.output.capacity) ?? createStudyTimeCapacity(),
      preparationCapacity: readStudyTimeCapacity(result.output.preparationCapacity) };
  }
  const empty: ExamPlanningSettings = { version: 2, exams: [], capacity: createStudyTimeCapacity(), preparationCapacity: null };
  const legacy = profile.schedulerPreferences.examLearningPlan;
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return empty;
  const old = legacy as Record<string, unknown>;
  if (typeof old.cards !== "boolean" || typeof old.questions !== "boolean" || (!old.cards && !old.questions)) return empty;
  const exam = readExamLearningPlan({ version: 2, id: old.id, userId: profile.userId, name: "Meine Prüfung", status: "active", priority: "normal",
    rootDeckId: old.rootDeckId, chapterDeckIds: old.chapterDeckIds, examDate: old.examDate, coverage: old.coverage, desiredRetention: old.desiredRetention,
    cards: true, variants: true, bufferDays: old.bufferDays, createdAt: old.createdAt, updatedAt: old.createdAt });
  const capacity = readStudyTimeCapacity({ ...empty.capacity, weekdayMinutes: old.weekdayMinutes, weekendMinutes: old.weekendMinutes, weekdays: old.weekdays });
  return exam && capacity ? { ...empty, exams: [exam], capacity } : empty;
}

export function withExamPlanningSettings(profile: Profile, value: unknown): Profile {
  const result = v.safeParse(settingsSchema, value);
  if (!result.success || result.output.exams.some((exam) => exam.userId !== profile.userId)
    || new Set(result.output.exams.map((exam) => exam.id)).size !== result.output.exams.length
    || !readStudyTimeCapacity(result.output.capacity)
    || (result.output.preparationCapacity && !readStudyTimeCapacity(result.output.preparationCapacity))) {
    throw new Error("Die Angaben zur Prüfungsplanung sind ungültig.");
  }
  const { examLearningPlan: _legacy, ...preferences } = profile.schedulerPreferences;
  return { ...profile, schedulerPreferences: { ...preferences, examPlanning: result.output } };
}
export function withExamLearningPlan(profile: Profile, value: unknown, preparationCapacity?: StudyTimeCapacity | null): Profile {
  const plan = readExamLearningPlan(value);
  if (!plan || (plan.userId && plan.userId !== profile.userId)) throw new Error("Die Angaben zum Prüfungsplan sind ungültig.");
  const settings = readExamPlanningSettings(profile);
  return withExamPlanningSettings(profile, { ...settings,
    exams: [...settings.exams.filter((exam) => exam.id !== plan.id), { ...plan, userId: profile.userId }],
    preparationCapacity: preparationCapacity === undefined ? settings.preparationCapacity : preparationCapacity });
}
export function removeExamLearningPlan(profile: Profile, id: string): Profile {
  const settings = readExamPlanningSettings(profile);
  return withExamPlanningSettings(profile, { ...settings, exams: settings.exams.filter((exam) => exam.id !== id) });
}
export function createExamLearningPlan(today: string, rootDeckId = "", userId = ""): ExamLearningPlan {
  const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 42);
  const timestamp = new Date().toISOString();
  return { version: 2, id: `exam_${crypto.randomUUID()}`, userId, name: "Meine Prüfung", status: "active", priority: "normal",
    rootDeckId, chapterDeckIds: [], examDate: date.toISOString().slice(0, 10), coverage: 90, desiredRetention: 0.9,
    cards: true, variants: true, bufferDays: 3, createdAt: timestamp, updatedAt: timestamp };
}
