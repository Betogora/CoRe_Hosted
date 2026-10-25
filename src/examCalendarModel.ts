import type { ExamPlan, StudyTimeCapacity } from "./coreTypes.ts";
import { examDayDistance, getExamStudyMinutes, shiftExamDay, type ExamPlanDay } from "./examPlanning.ts";

export function createExamMonthDays(month: string): string[] {
  const first = `${month.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = Math.ceil((offset + examDayDistance(first, next.toISOString().slice(0, 10))) / 7) * 7;
  return Array.from({ length }, (_, index) => shiftExamDay(first, index - offset));
}

export function shiftExamMonth(month: string, offset: number): string {
  const date = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function createExamWeekDays(anchor: string): string[] {
  const offset = (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftExamDay(anchor, index - offset));
}

export function examMinuteAtPosition(offset: number, height: number): number {
  return Math.min(1440, Math.max(0, Math.round(offset / height * 1440 / 15) * 15));
}

export function examSelectionRange(first: number, last: number) {
  const start = Math.min(1425, Math.min(first, last));
  return { start, end: Math.min(1440, Math.max(start + 15, first, last)) };
}

/** Shared material counts once, including when several selected exams own the same block. */
export function getExamCalendarWork(day: ExamPlanDay | undefined, examIds: ReadonlySet<string>) {
  const blocks = day?.blocks.filter((block) => block.examIds.some((id) => examIds.has(id))) ?? [];
  return {
    newCards: new Set(blocks.filter((block) => block.method === "new").flatMap((block) => block.cardIds)).size,
    repetitions: blocks.filter((block) => block.method !== "new").reduce((sum, block) => sum + block.expectedItems, 0),
    blocks,
  };
}

/** Regular topic checkpoints, anchored to creation so recalculating does not move the cadence. */
export function createExamQuizRecommendations(exams: ExamPlan[], capacity: StudyTimeCapacity, today: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const examDates = new Set(exams.map((exam) => exam.examDate));
  for (const exam of exams.filter((exam) => exam.status === "active" && exam.examDate > today)) {
    const start = examQuizStart(exam);
    const dates: string[] = [];
    for (let date = shiftExamDay(start, 3); date < exam.examDate; date = shiftExamDay(date, 3)) dates.push(date);
    dates.push(shiftExamDay(exam.examDate, -1));
    for (let date of dates) {
      while (date >= start && (getExamStudyMinutes(date, exam, exams, capacity) <= 0 || examDates.has(date))) date = shiftExamDay(date, -1);
      if (date < today || date <= start) continue;
      const ids = result.get(date) ?? [];
      if (!ids.includes(exam.id)) result.set(date, [...ids, exam.id]);
    }
  }
  return new Map([...result].sort(([a], [b]) => a.localeCompare(b)));
}

export function examQuizStart(exam: ExamPlan): string {
  const oldest = shiftExamDay(exam.examDate, -365);
  return exam.createdAt.slice(0, 10) < oldest ? oldest : exam.createdAt.slice(0, 10);
}
