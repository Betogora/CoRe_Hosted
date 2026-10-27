import type { ExamPlan } from "./coreTypes.ts";
import { examDayDistance, shiftExamDay, type ExamPlanDay } from "./examPlanning.ts";

/** The month's Monday–Sunday grid; with `today` in it, following weeks fill up to four weeks from today's week. */
export function createExamMonthDays(month: string, today?: string): string[] {
  const first = `${month.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = Math.ceil((offset + examDayDistance(first, next.toISOString().slice(0, 10))) / 7) * 7;
  const days = Array.from({ length }, (_, index) => shiftExamDay(first, index - offset));
  if (today?.slice(0, 7) !== month.slice(0, 7)) return days;
  while (days.filter((key, index) => index % 7 === 6 && key >= today).length < 4) days.push(...Array.from({ length: 7 }, (_, index) => shiftExamDay(days.at(-1)!, index + 1)));
  return days;
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

export const EXAM_DAY_START = 420;
export const EXAM_SLOT_MINUTES = 30;
export const EXAM_DAY_MINUTES = 1440 - EXAM_DAY_START;

export function examMinuteAtPosition(offset: number, height: number): number {
  return Math.min(1440, Math.max(EXAM_DAY_START, EXAM_DAY_START + Math.round(offset / height * EXAM_DAY_MINUTES / EXAM_SLOT_MINUTES) * EXAM_SLOT_MINUTES));
}

export function examSelectionRange(first: number, last: number) {
  const start = Math.min(1440 - EXAM_SLOT_MINUTES, Math.min(first, last));
  return { start, end: Math.min(1440, Math.max(start + EXAM_SLOT_MINUTES, first, last)) };
}

/** Moving keeps the duration inside the visible day; resizing keeps the start and at least one slot. */
export function examBlockRangeAt(block: { start: number; end: number }, move: boolean, minute: number) {
  const duration = block.end - block.start;
  if (!move) return { start: block.start, end: Math.max(block.start + EXAM_SLOT_MINUTES, Math.min(1440, minute)) };
  const start = Math.max(EXAM_DAY_START, Math.min(1440 - duration, minute));
  return { start, end: start + duration };
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

/** One editing horizon for day details and week: from today for a year, exam days stay free. */
export function isExamCalendarDayLocked(key: string, today: string, exams: readonly ExamPlan[]) {
  return key < today || key > shiftExamDay(today, 365) || exams.some((exam) => exam.status === "active" && exam.examDate === key);
}
