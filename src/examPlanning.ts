import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import { createCoreDeck } from "./coreModel/decks.ts";
import { createReviewState } from "./coreModel/reviewState.ts";
import type { Card, Deck, DeckSettings, ExamPlan, GlobalSchedulerPreferences, ReviewRating, ReviewState, StudyTimeCapacity } from "./coreTypes.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import { EXAM_SESSION_DECK_ID } from "./examPlanSettings.ts";
import { getLearningDayKey, getLearningDayStartForKey } from "./learningDay.ts";
import { markLearningSettingsCustom } from "./learningProfiles.ts";
import { createMainThreadBudget } from "./mainThreadBudget.ts";
import { calculateRetrievability, scheduleWithFsrs } from "./scheduler.ts";
import type { AccountStatisticsSnapshot } from "./workspaceReplica.ts";

export const EXAM_MODEL = {
  minimumTimeSamples: 10,
  defaultSeconds: { new: 60, review: 20, relearning: 30, variant: 30 },
  maxProjectedAnswers: 500, maxNewPerDay: 500, maxReviewsPerDay: 2000,
  ratingPeriod: 20, ratingSequenceStep: 7, initialRatingSlot: 19,
} as const;

type ExamStudyMethod = "new" | "review" | "relearning" | "variant";
type ExamTiming = Record<ExamStudyMethod, { seconds: number; samples: number }>;
/** Observed behaviour from the statistics rollups: answer times, share of "again" and minutes already studied today. */
export interface ExamHistory { timing: ExamTiming; againShare: number; ratingSamples: number; spentTodayMinutes: number }
/** Planned work of one method in one deck on one day; a block counts for every exam that shares the deck. */
export interface StudyPlanBlock {
  id: string; date: string; examIds: string[]; deckId: string; method: ExamStudyMethod;
  plannedMinutes: number; expectedItems: number; priority: number; cardIds: string[];
}
export interface ExamPlanDay {
  key: string; budgetMinutes: number; spentMinutes: number;
  newMinutes: number; reviewMinutes: number; newCardIds: string[]; reviewCardIds: string[];
  reviewCount: number; backlogCount: number; buffer: boolean; blocks: StudyPlanBlock[];
}
export interface ExamReadiness { coverage: number; security: number | null; achievement: number }
export interface ExamForecastSummary {
  examId: string; usableDays: number; totalCards: number;
  remainingNewCount: number; unscheduledNewCount: number; overdueReviewCount: number;
  requiredMinutes: number; availableMinutes: number; allocatedMinutes: number;
  current: ExamReadiness; predicted: ExamReadiness; feasible: boolean; issues: string[];
  decks: Array<{ deckId: string; name: string; total: number; known: number; security: number | null }>;
}
export interface ExamPortfolioForecast {
  days: ExamPlanDay[]; exams: ExamForecastSummary[]; uncertainty: "high" | "medium"; timing: ExamTiming;
}
export interface ExamForecastOptions {
  now: string; preferences: Pick<GlobalSchedulerPreferences, "dayStartHour" | "easyDays">; timeZone: string;
  capacity: StudyTimeCapacity; history: ExamHistory; signal?: AbortSignal;
  /** Plan only today: a session start needs no later days and no workload estimate. */
  todayOnly?: boolean;
}
interface Entry {
  card: CardStudySnapshot; deck: Deck; owners: ExamPlan[]; state: ReviewState; due: number; answers: number;
  chapter: number; createdAt: string;
}


class ReviewHeap {
  private values: Entry[] = [];
  private compare: (a: Entry, b: Entry) => number;
  constructor(compare: (a: Entry, b: Entry) => number) { this.compare = compare; }
  peek() { return this.values[0]; }
  push(value: Entry) {
    let index = this.values.push(value) - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (this.compare(this.values[parent], value) <= 0) break; this.values[index] = this.values[parent]; index = parent; }
    this.values[index] = value;
  }
  pop() {
    const first = this.values[0], last = this.values.pop();
    if (!last || !this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.compare(this.values[child + 1], this.values[child]) < 0) child++;
      if (this.compare(this.values[child], last) >= 0) break;
      this.values[index] = this.values[child]; index = child;
    }
    this.values[index] = last; return first;
  }
  countBefore(end: number) { return this.values.reduce((sum, item) => sum + Number(item.due < end), 0); }
}

export function shiftExamDay(key: string, days: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function examDayDistance(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }

/** Deck tree order (ADR-016), the chapter order in which new cards are introduced. */
function examDeckOrder(decks: readonly Deck[]): Map<string, number> {
  const children = buildSortedDeckChildren(decks.filter((deck) => !deck.deletedAt));
  const order = new Map<string, number>();
  const visit = (parentId: string | null) => { for (const deck of children.get(parentId) ?? []) { order.set(deck.id, order.size); visit(deck.id); } };
  visit(null);
  return order;
}

function isNew(state: Pick<ReviewState, "state" | "reps">) { return state.state === "new" && state.reps === 0; }

/** Deck settings while studying for exams: limits lifted, desired retention of the strictest exam (ADR-042). */
function getExamStudySettings(settings: DeckSettings, desiredRetention: number, variants: boolean): DeckSettings {
  return {
    ...settings,
    ...markLearningSettingsCustom({
      ...settings,
      newCardsPerDay: EXAM_MODEL.maxNewPerDay, maximumReviewsPerDay: EXAM_MODEL.maxReviewsPerDay, newReviewOrder: "reviews-first",
      schedulerProfile: { ...settings.schedulerProfile, presetId: "custom", desiredRetention },
    }),
    coreMode: variants ? settings.coreMode : "off",
    learningProfileSource: null,
    newCardsTodayOverride: null,
  };
}

function itemMethod(state: ReviewState, card: CardStudySnapshot, settings: DeckSettings): ExamStudyMethod {
  if (isNew(state)) return "new";
  if (settings.coreMode === "on" && card.activeVariantCount > 0 && (state.maturityXp ?? 0) >= settings.variantThresholdXp) return "variant";
  return state.state === "learning" || state.state === "relearning" ? "relearning" : "review";
}

/**
 * Answer times and rating mix from the server's daily rollups. The rollup keeps durations per category but only the total
 * number of timed answers, so each day's timed share is applied to its categories.
 */
export function estimateExamHistory(statistics: AccountStatisticsSnapshot | null, todayKey: string): ExamHistory {
  const sums = { learning: [0, 0], relearning: [0, 0], review: [0, 0] };
  let total = 0, successful = 0;
  for (const day of Object.values(statistics?.reviewsByDay ?? {})) {
    total += day.total; successful += day.successful;
    const timedShare = day.total ? Math.min(1, day.timedCount / day.total) : 0;
    sums.learning[0] += day.durationLearningMs; sums.learning[1] += day.learning * timedShare;
    sums.relearning[0] += day.durationRelearningMs; sums.relearning[1] += day.relearning * timedShare;
    sums.review[0] += day.durationYoungMs + day.durationMatureMs; sums.review[1] += (day.young + day.mature) * timedShare;
  }
  const estimate = (method: ExamStudyMethod, [duration, count]: number[]) => count >= EXAM_MODEL.minimumTimeSamples
    ? { seconds: Math.max(5, Math.min(120, Math.round(duration / count / 1000))), samples: Math.round(count) }
    : { seconds: EXAM_MODEL.defaultSeconds[method], samples: Math.round(count) };
  const review = estimate("review", sums.review);
  return {
    timing: { new: estimate("new", sums.learning), relearning: estimate("relearning", sums.relearning), review, variant: review.samples >= EXAM_MODEL.minimumTimeSamples ? review : { seconds: EXAM_MODEL.defaultSeconds.variant, samples: review.samples } },
    againShare: total ? Math.max(0, Math.min(1, 1 - successful / total)) : 0,
    ratingSamples: total,
    spentTodayMinutes: (statistics?.reviewsByDay[todayKey]?.durationMs ?? 0) / 60_000,
  };
}

export function getExamDayCapacity(key: string, capacity: StudyTimeCapacity) {
  const override = capacity.dateOverrides.find((day) => day.date === key);
  if (override) return override.minutes;
  const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
  return capacity.weekdays[weekday] ? Math.max(capacity.minimumMinutes, weekday < 5 ? capacity.weekdayMinutes : capacity.weekendMinutes) : 0;
}

function priority(plan: ExamPlan) { return plan.priority === "high" ? 2 : plan.priority === "normal" ? 1 : 0; }
function deadline(entry: Entry) { return entry.owners.map((exam) => exam.examDate).sort()[0]; }
/** Order of new cards: exam priority, nearest exam, chapter order, then the creation order the study session also uses. */
function compareNew(a: Entry, b: Entry) {
  return Math.max(...b.owners.map(priority)) - Math.max(...a.owners.map(priority))
    || deadline(a).localeCompare(deadline(b)) || a.chapter - b.chapter
    || a.createdAt.localeCompare(b.createdAt) || a.card.cardId.localeCompare(b.card.cardId);
}

function readiness(entries: ReadonlyArray<{ state: ReviewState }>, plan: ExamPlan, at: string): ExamReadiness {
  const known = entries.filter((entry) => !isNew(entry.state));
  const coverage = entries.length ? known.length / entries.length : 0;
  const security = known.length ? known.reduce((sum, entry) => sum + calculateRetrievability(entry.state, at), 0) / known.length : null;
  return { coverage, security, achievement: coverage * Math.min(1, (security ?? 0) / plan.desiredRetention) };
}

function snapshotState(card: CardStudySnapshot): ReviewState {
  return createReviewState({ ...card.study, maturityXp: card.maturityXp });
}

/** Readiness from the current study states only, for paused, completed or past exams. */
export function getExamCurrentProgress(cards: readonly CardStudySnapshot[], plan: ExamPlan, now: string, timeZone: string) {
  const selected = new Set(plan.deckIds);
  const entries = cards.filter((card) => card.status === "active" && selected.has(card.deckId)).map((card) => ({ state: snapshotState(card) }));
  const future = plan.examDate > getLearningDayKey(now, { timeZone })!;
  const at = future ? getLearningDayStartForKey(plan.examDate, { timeZone })!.toISOString() : now;
  return { ...readiness(entries, plan, at), totalCards: entries.length, atExam: future };
}

/**
 * Deterministic day-by-day simulation of all active exams with the real scheduler (ADR-042). It changes no study state:
 * reviews due first, new cards fill the rest of the shared budget, buffer days take no new cards.
 */
export async function createExamPortfolioForecast(decks: readonly Deck[], cards: readonly CardStudySnapshot[], exams: readonly ExamPlan[], options: ExamForecastOptions): Promise<ExamPortfolioForecast> {
  const { now, preferences, timeZone, signal, capacity, history, todayOnly = false } = options, context = { dayStartHour: preferences.dayStartHour, timeZone };
  const pause = createMainThreadBudget();
  const today = getLearningDayKey(now, context)!, civilToday = getLearningDayKey(now, { timeZone })!;
  // The civil start of an exam day is a search over local time; each workload estimate needs it, so it is computed once per date.
  const examStartByDate = new Map<string, number>();
  const examStart = (date: string) => {
    let start = examStartByDate.get(date);
    if (start === undefined) { start = getLearningDayStartForKey(date, { timeZone })!.getTime(); examStartByDate.set(date, start); }
    return start;
  };
  const active = exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday && examDayDistance(civilToday, exam.examDate) <= 365);
  const { timing } = history;
  const hasRatings = history.ratingSamples >= EXAM_MODEL.minimumTimeSamples;
  const failureSlots = hasRatings ? Math.round(history.againShare * EXAM_MODEL.ratingPeriod) : 0;
  const ratingAt = (answer: number): ReviewRating => (answer * EXAM_MODEL.ratingSequenceStep + EXAM_MODEL.initialRatingSlot) % EXAM_MODEL.ratingPeriod < failureSlots ? "again" : "good";
  const deckById = new Map(decks.filter((deck) => !deck.deletedAt).map((deck) => [deck.id, deck]));
  const chapters = examDeckOrder(decks);
  const cardsByDeck = new Map<string, CardStudySnapshot[]>();
  for (const card of cards) if (card.status === "active") cardsByDeck.set(card.deckId, [...(cardsByDeck.get(card.deckId) ?? []), card]);
  const entriesById = new Map<string, Entry>();
  const summaries = new Map<string, ExamForecastSummary>();
  const allByExam = new Map<string, Entry[]>();
  let operations = 0;
  for (const exam of active) {
    signal?.throwIfAborted(); await pause();
    const selected = exam.deckIds.flatMap((id) => deckById.get(id) ?? []);
    const all: Entry[] = [];
    for (const deck of selected) {
      for (const card of cardsByDeck.get(deck.id) ?? []) {
        if (++operations % 1024 === 0) { signal?.throwIfAborted(); await pause(); }
        let entry = entriesById.get(card.cardId);
        if (!entry) {
          const state = snapshotState(card);
          entry = { card, deck, owners: [], state, due: Date.parse(state.dueAt), answers: 0, chapter: chapters.get(deck.id) ?? Number.MAX_SAFE_INTEGER, createdAt: card.createdAt };
          entriesById.set(card.cardId, entry);
        }
        entry.owners.push(exam);
        all.push(entry);
      }
    }
    allByExam.set(exam.id, all);
    const examTime = new Date(examStart(exam.examDate)).toISOString();
    const missing = exam.deckIds.length > selected.length;
    summaries.set(exam.id, {
      examId: exam.id, usableDays: 0, totalCards: all.length,
      remainingNewCount: all.filter((entry) => isNew(entry.state)).length, unscheduledNewCount: 0, overdueReviewCount: 0,
      requiredMinutes: 0, availableMinutes: 0, allocatedMinutes: 0,
      current: readiness(all, exam, examTime), predicted: readiness(all, exam, examTime), feasible: false,
      issues: [...(missing ? ["Ausgewählte Stapel wurden gelöscht."] : []), ...(!all.length ? ["Keine lernbaren Karten ausgewählt."] : [])],
      decks: selected.map((deck) => {
        const own = all.filter((entry) => entry.deck.id === deck.id), state = readiness(own, exam, examTime);
        return { deckId: deck.id, name: deck.name, total: own.length, known: own.filter((entry) => !isNew(entry.state)).length, security: state.security };
      }),
    });
  }
  const entries = [...entriesById.values()];
  const lastExam = active.map((exam) => exam.examDate).sort().at(-1);
  if (!lastExam) return { days: [], exams: [], uncertainty: "high", timing };
  const keys = Array.from({ length: examDayDistance(today, lastExam) }, (_, i) => shiftExamDay(today, i));
  const examDates = new Set(exams.filter((exam) => exam.status === "active").map((exam) => exam.examDate));
  const bufferByExam = new Map(active.map((exam) => [exam.id, new Set(exam.bufferDays ? keys.filter((key) => key < exam.examDate && !examDates.has(key) && getExamDayCapacity(key, capacity) > 0).slice(-exam.bufferDays) : [])]));
  const currentOwners = (entry: Entry, key: string) => entry.owners.filter((exam) => key < exam.examDate);
  const settingFor = (entry: Entry, key: string) => {
    const owners = currentOwners(entry, key);
    return getExamStudySettings(entry.deck.deckSettings, Math.max(...owners.map((exam) => exam.desiredRetention)), owners.some((exam) => exam.variants));
  };
  const heap = new ReviewHeap((a, b) => a.due - b.due || Number(b.state.lastRating === "again") - Number(a.state.lastRating === "again")
    || calculateRetrievability(a.state, now) - calculateRetrievability(b.state, now) || b.state.difficulty - a.state.difficulty || compareNew(a, b));
  const dueCountsByDay = new Map<string, number>();
  const trackDue = (due: number, amount: number) => { const key = getLearningDayKey(due, context); if (key) dueCountsByDay.set(key, Math.max(0, (dueCountsByDay.get(key) ?? 0) + amount)); };
  const enqueue = (entry: Entry) => { heap.push(entry); trackDue(entry.due, 1); };
  const fresh = entries.filter((entry) => isNew(entry.state)).sort(compareNew);
  for (const entry of entries) if (!isNew(entry.state)) enqueue(entry);
  const days: ExamPlanDay[] = [];
  const nextState = (entry: Pick<Entry, "state" | "answers" | "card">, at: number, settings: DeckSettings) => scheduleWithFsrs(entry.state, ratingAt(entry.answers++), {
    now: new Date(at).toISOString(), ...context, deckSettings: settings,
    isVariant: itemMethod(entry.state, entry.card, settings) === "variant",
    easyDaysContext: { ...context, easyDays: preferences.easyDays, dueCountsByDay },
  });
  for (const key of todayOnly ? keys.slice(0, 1) : keys) {
    signal?.throwIfAborted();
    const boundary = getLearningDayStartForKey(key, context)!.getTime(), nextBoundary = getLearningDayStartForKey(shiftExamDay(key, 1), context)!.getTime();
    const civilExamStart = examDates.has(shiftExamDay(key, 1)) ? examStart(shiftExamDay(key, 1)) : nextBoundary;
    const end = Math.min(nextBoundary, civilExamStart);
    const at = key === today ? Math.max(Date.parse(now), boundary) : boundary + 8 * 3_600_000 < end ? boundary + 8 * 3_600_000 : boundary;
    const budget = examDates.has(key) || at >= end ? 0 : getExamDayCapacity(key, capacity);
    const spent = key === today ? history.spentTodayMinutes : 0;
    const reserve = budget * capacity.reserveFraction;
    let remaining = Math.max(0, Math.min((budget - reserve - spent) * 60, (end - at) / 1000));
    const availableMinutes = remaining / 60;
    const blocks = new Map<string, StudyPlanBlock>();
    const newIds: string[] = [], reviewIds = new Set<string>();
    let newSeconds = 0, repeatedSeconds = 0, reviewCount = 0;
    const record = (entry: Entry, method: ExamStudyMethod, seconds: number) => {
      const owners = currentOwners(entry, key).map((exam) => exam.id).sort(), group = `${method}:${owners.join(",")}:${entry.deck.id}`;
      let block = blocks.get(group);
      if (!block) { block = { id: `${key}:${group}`, date: key, examIds: owners, deckId: entry.deck.id, method, plannedMinutes: 0, expectedItems: 0, priority: method === "new" ? 3 : method === "relearning" ? 0 : 1, cardIds: [] }; blocks.set(group, block); }
      block.plannedMinutes += seconds / 60; block.expectedItems++; if (!block.cardIds.includes(entry.card.cardId)) block.cardIds.push(entry.card.cardId);
      if (method === "new") { newSeconds += seconds; newIds.push(entry.card.cardId); } else { repeatedSeconds += seconds; reviewCount++; reviewIds.add(entry.card.cardId); }
      // Shared work is attributed fractionally, never booked twice as capacity.
      for (const id of owners) summaries.get(id)!.allocatedMinutes += seconds / 60 / owners.length;
    };
    while (remaining >= 5) {
      if (++operations % 256 === 0) { signal?.throwIfAborted(); await pause(); }
      const review = heap.peek();
      if (review && review.due < end) {
        if (reviewCount >= EXAM_MODEL.maxReviewsPerDay) break;
        const entry = heap.pop()!; trackDue(entry.due, -1);
        if (!currentOwners(entry, key).length || entry.answers >= EXAM_MODEL.maxProjectedAnswers) continue;
        const settings = settingFor(entry, key), method = itemMethod(entry.state, entry.card, settings), seconds = timing[method].seconds;
        if (seconds > remaining) { enqueue(entry); break; }
        const state = nextState(entry, Math.max(at, entry.due), settings);
        record(entry, method, seconds); remaining -= seconds; entry.state = state; entry.due = Date.parse(state.dueAt); enqueue(entry); continue;
      }
      if (newIds.length >= EXAM_MODEL.maxNewPerDay) break;
      const index = fresh.findIndex((entry) => {
        const owners = currentOwners(entry, key);
        return entry.due < end && owners.length > 0 && owners.every((exam) => !bufferByExam.get(exam.id)!.has(key));
      });
      if (index < 0) break;
      const entry = fresh[index], settings = settingFor(entry, key);
      // A new card includes its first learning steps of the day; their state stays hypothetical.
      const simulation = { ...entry };
      let time = Math.max(at, entry.due);
      simulation.state = nextState(simulation, time, settings);
      const steps: ExamStudyMethod[] = [];
      while (simulation.state.state !== "review" && Date.parse(simulation.state.dueAt) < end && steps.length < 12) {
        steps.push(itemMethod(simulation.state, simulation.card, settings));
        time = Math.max(time + 1000, Date.parse(simulation.state.dueAt)); simulation.state = nextState(simulation, time, settings);
      }
      const cost = timing.new.seconds + steps.reduce((sum, method) => sum + timing[method].seconds, 0);
      if (cost > remaining) break;
      record(entry, "new", timing.new.seconds);
      for (const method of steps) record(entry, method, timing[method].seconds);
      remaining -= cost; Object.assign(entry, { state: simulation.state, due: Date.parse(simulation.state.dueAt), answers: simulation.answers }); enqueue(entry); fresh.splice(index, 1);
    }
    const dayBlocks = [...blocks.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    days.push({ key, budgetMinutes: budget, spentMinutes: spent, newMinutes: newSeconds / 60, reviewMinutes: repeatedSeconds / 60,
      newCardIds: newIds, reviewCardIds: [...reviewIds], reviewCount, backlogCount: heap.countBefore(end),
      buffer: active.some((exam) => bufferByExam.get(exam.id)!.has(key)), blocks: dayBlocks });
    for (const exam of active.filter((exam) => key < exam.examDate)) {
      const summary = summaries.get(exam.id)!;
      if (availableMinutes > 0) summary.usableDays++;
      summary.availableMinutes += availableMinutes;
      if (shiftExamDay(key, 1) === exam.examDate) {
        const examBegins = examStart(exam.examDate), all = allByExam.get(exam.id)!;
        summary.unscheduledNewCount = all.filter((entry) => isNew(entry.state)).length;
        summary.overdueReviewCount = all.filter((entry) => !isNew(entry.state) && entry.due < examBegins).length;
        summary.predicted = readiness(all, exam, new Date(examBegins).toISOString());
        summary.feasible = !summary.issues.length && summary.unscheduledNewCount === 0 && summary.overdueReviewCount === 0 && summary.predicted.security !== null && summary.predicted.security >= exam.desiredRetention;
      }
    }
    await pause();
  }
  // Unconstrained workload: the same scheduler and rating mix without capacity limits; shared answers count once.
  for (let index = 0; index < (todayOnly ? 0 : entries.length); index++) {
    if (index % 128 === 0) { signal?.throwIfAborted(); await pause(); }
    const entry = entries[index], card = entry.card, state = snapshotState(card);
    const estimate = { ...entry, state, due: Date.parse(state.dueAt), answers: 0 };
    const end = examStart(entry.owners.map((exam) => exam.examDate).sort().at(-1)!);
    while (estimate.due < end && estimate.answers < EXAM_MODEL.maxProjectedAnswers) {
      const at = Math.max(Date.parse(now), estimate.due), key = getLearningDayKey(at, context)!;
      const owners = currentOwners(estimate, key); if (!owners.length) break;
      const settings = settingFor(estimate, key), method = itemMethod(estimate.state, card, settings);
      for (const owner of owners) summaries.get(owner.id)!.requiredMinutes += timing[method].seconds / 60 / owners.length;
      const next = nextState(estimate, at, settings); estimate.state = next; estimate.due = Math.max(at + 1000, Date.parse(next.dueAt));
    }
  }
  for (const summary of summaries.values()) {
    const exam = active.find((candidate) => candidate.id === summary.examId)!;
    summary.requiredMinutes = Math.max(summary.requiredMinutes, summary.allocatedMinutes);
    if (summary.unscheduledNewCount) summary.issues.push(`${summary.unscheduledNewCount} neue Karten passen nicht ins Zeitbudget.`);
    if (summary.overdueReviewCount) summary.issues.push(`${summary.overdueReviewCount} Wiederholungen bleiben vor der Prüfung offen.`);
    if (summary.predicted.security !== null && summary.predicted.security < exam.desiredRetention) summary.issues.push("Die Abrufsicherheit am Prüfungstag liegt unter dem Ziel.");
    if (!summary.usableDays && (summary.requiredMinutes > 0 || !summary.feasible)) summary.issues.push("Vor dieser Prüfung ist keine Lernzeit frei.");
  }
  return { days, exams: [...summaries.values()],
    uncertainty: Object.values(timing).some((estimate) => estimate.samples < EXAM_MODEL.minimumTimeSamples) ? "high" : "medium", timing };
}

/** Cards of today's unit or of one block; the session studies exactly these. */
export function getExamSessionCardIds(day: ExamPlanDay, blockId: string | null = null): string[] {
  return [...new Set(day.blocks.filter((block) => !blockId || block.id === blockId).flatMap((block) => block.cardIds))];
}

/** Ids of the decks the active exams study, for loading their study states. */
export function getActiveExamDeckIds(decks: readonly Deck[], exams: readonly ExamPlan[], civilToday: string): string[] {
  const available = new Set(decks.filter((deck) => !deck.deletedAt).map((deck) => deck.id));
  return [...new Set(exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday).flatMap((exam) => exam.deckIds))].filter((id) => available.has(id));
}

/** Session decks for exactly the planned cards, each with the exam settings of its deck (ADR-042). */
export function createExamSessionDecks(decks: readonly Deck[], cards: readonly Card[], exams: readonly ExamPlan[], todayKey: string): Deck[] {
  const root = createCoreDeck({ id: EXAM_SESSION_DECK_ID, name: "Heutige Einheit", createdAt: todayKey, updatedAt: todayKey });
  const session: Deck[] = [{ ...root, deckSettings: getExamStudySettings(root.deckSettings, root.deckSettings.schedulerProfile.desiredRetention, false) }];
  for (const deck of decks) {
    const own = cards.filter((card) => card.deckId === deck.id);
    if (own.length) session.push({ ...deck, parentDeckId: EXAM_SESSION_DECK_ID, cards: own, reviewEvents: [], deckSettings: getExamSessionDeckSettings(deck, exams, todayKey) });
  }
  return session;
}

/** Retention and variant switch for a deck while studying: the strictest active exam that still lies ahead. */
export function getExamSessionDeckSettings(deck: Deck, exams: readonly ExamPlan[], todayKey: string): DeckSettings {
  const owners = exams.filter((exam) => exam.status === "active" && exam.examDate > todayKey && exam.deckIds.includes(deck.id));
  if (!owners.length) return deck.deckSettings;
  return getExamStudySettings(deck.deckSettings, Math.max(...owners.map((exam) => exam.desiredRetention)), owners.some((exam) => exam.variants));
}
