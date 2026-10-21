import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { Deck, ExamDailyTask, ExamPlan, ExamPlanningSettings } from "./coreTypes.ts";
import { createExamQuizRecommendations, examQuizStart } from "./examCalendarModel.ts";
import { examDayDistance, getExamLastNewDate, getExamPlanningKey, getExamTopicTasks, type ExamPortfolioForecast } from "./examPlanning.ts";
import { getLearningDayKey } from "./learningDay.ts";

/** Related sibling decks form batches of at most three topics; no semantic AI grouping is implied. */
export function getExamQuizDeckIds(exam: ExamPlan, decks: readonly Deck[], forecast: ExamPortfolioForecast, date: string): string[] {
  const summary = forecast.exams.find((entry) => entry.examId === exam.id);
  const topics = decks.filter((deck) => !deck.deletedAt && exam.deckIds.includes(deck.id) && summary?.decks.some((entry) => entry.deckId === deck.id && entry.total > 0));
  const siblings = new Map<string, string[]>();
  for (const deck of topics) {
    const parent = deck.parentDeckId ?? deck.id;
    siblings.set(parent, [...(siblings.get(parent) ?? []), deck.id]);
  }
  const groups = [...siblings.values()].flatMap((ids) => Array.from({ length: Math.ceil(ids.length / 3) }, (_, index) => ids.slice(index * 3, index * 3 + 3)));
  const checkpoint = Math.max(0, Math.floor(examDayDistance(examQuizStart(exam), date) / 3) - 1);
  return groups.length ? groups[checkpoint % groups.length] : [];
}

/** Freeze today's targets. Only real answers and finished learning steps can automatically check them. */
export function reconcileExamDailyTasks(settings: ExamPlanningSettings, decks: readonly Deck[], forecast: ExamPortfolioForecast, cards: readonly CardStudySnapshot[], now: string, timeZone: string, dayStartHour: number): ExamDailyTask[] {
  const context = { timeZone, dayStartHour };
  const date = getLearningDayKey(now, context)!;
  const day = forecast.days.find((entry) => entry.key === date);
  if (!day) return settings.dailyTasks ?? [];
  const civilToday = getLearningDayKey(now, { timeZone })!;
  const active = settings.exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday);
  const byId = new Map(cards.map((card) => [card.cardId, card]));
  const tasks = (settings.dailyTasks ?? []).filter((task) => task.date === date && active.some((exam) => exam.id === task.examId && (task.completed !== null || !task.planningKey || task.planningKey === getExamPlanningKey(exam, settings.capacity)) && (task.kind !== "summary" || exam.readSummaryBeforeTopics) && task.deckIds.every((id) => exam.deckIds.includes(id) && decks.some((deck) => deck.id === id && !deck.deletedAt)))).map((task) => {
    const cutoff = getExamLastNewDate(active.find((exam) => exam.id === task.examId)!);
    return { ...task, cardIds: task.cardIds.filter((id) => civilToday <= cutoff || byId.get(id)?.study.state !== "new" || byId.get(id)?.study.reps !== 0) };
  }).filter((task) => task.kind !== "study" || task.cardIds.length > 0);
  const ids = new Set(tasks.map((task) => task.id));
  const quizzes = createExamQuizRecommendations(settings.exams, settings.capacity, date).get(date) ?? [];
  for (const exam of active) {
    const planningKey = getExamPlanningKey(exam, settings.capacity);
    for (const block of getExamTopicTasks(day, exam.id)) {
      const existing = tasks.find((task) => task.id === block.id);
      if (existing) {
        existing.cardIds = [...new Set([...existing.cardIds, ...block.cardIds])];
        existing.planningKey = planningKey;
        continue;
      }
      tasks.push({ id: block.id, date, examId: exam.id, kind: "study", deckIds: [block.deckId], cardIds: block.cardIds, capturedAt: now, completed: null, planningKey });
      ids.add(block.id);
    }
    for (const summary of day.summaries.filter((entry) => entry.examId === exam.id)) {
      const id = `summary:${encodeURIComponent(exam.id)}:${encodeURIComponent(summary.deckId)}`;
      if (!ids.has(id)) { tasks.push({ id, date, examId: exam.id, kind: "summary", deckIds: [summary.deckId], cardIds: [], capturedAt: now, completed: exam.completedSummaryDeckIds?.includes(summary.deckId) ? "manual" : null }); ids.add(id); }
    }
    const quizId = `quiz:${exam.id}:${date}`;
    const deckIds = quizzes.includes(exam.id) ? getExamQuizDeckIds(exam, decks, forecast, date) : [];
    if (deckIds.length && !ids.has(quizId)) tasks.push({ id: quizId, date, examId: exam.id, kind: "quiz", deckIds, cardIds: [], capturedAt: now, completed: null });
  }
  return tasks.map((task) => {
    if (task.kind !== "study") return task;
    const automatic = task.cardIds.length > 0 && task.cardIds.every((id) => {
      const card = byId.get(id);
      return card?.deckId === task.deckIds[0] && card.status === "active" && card.study.state === "review" && card.study.lastReviewedAt !== null
        && Date.parse(card.study.lastReviewedAt) >= Date.parse(task.capturedAt) && Date.parse(card.study.lastReviewedAt) <= Date.parse(now)
        && getLearningDayKey(card.study.lastReviewedAt, context) === date
        && (getLearningDayKey(card.study.dueAt, context) ?? "") > date;
    });
    return { ...task, completed: automatic ? "automatic" : task.completed === "manual" ? "manual" : null };
  });
}

export function setExamDailyTaskChecked(tasks: readonly ExamDailyTask[], id: string, checked: boolean): ExamDailyTask[] {
  return tasks.map((task) => task.id === id && task.completed !== "automatic" ? { ...task, completed: checked ? "manual" : null } : task);
}

/** Reading completion belongs to the exam and survives the daily checklist rollover. */
export function withExamDailyTasks(settings: ExamPlanningSettings, dailyTasks: ExamDailyTask[]): ExamPlanningSettings {
  return { ...settings, dailyTasks, exams: settings.exams.map((exam) => {
    const completed = new Set(exam.completedSummaryDeckIds);
    for (const task of dailyTasks.filter((entry) => entry.examId === exam.id && entry.kind === "summary")) {
      if (task.completed) completed.add(task.deckIds[0]); else completed.delete(task.deckIds[0]);
    }
    return { ...exam, completedSummaryDeckIds: [...completed] };
  }) };
}
