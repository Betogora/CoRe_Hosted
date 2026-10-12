import { isLearningItemReviewBlocked } from "./coreModel.ts";
import type { Deck, ExamLearningPlan, ExamQuizCapability, ExamStudyMethod, GlobalSchedulerPreferences, LearningItem, ReviewEvent, ReviewRating, ReviewState, StudyPlanBlock, StudyTimeCapacity } from "./coreTypes.ts";
import { getLearningDayKey, getLearningDayStartForKey } from "./learningDay.ts";
import { calculateRetrievability, scheduleWithFsrs, SCHEDULER_VERSION } from "./scheduler.ts";
import { markLearningSettingsCustom } from "./learningProfiles.ts";
import { collectDeckTreeIds } from "./coreWorkspace.ts";
import { chooseReviewCard } from "./coreVariantService.ts";
import { createDailyReviewQueue } from "./reviewService.ts";

export const EXAM_MODEL = {
  version: "exam-heuristic-2", coverage: [70, 85, 90, 100], retention: [0.85, 0.9, 0.95, 0.97],
  minimumTimeSamples: 10, recentTimeSamples: 80,
  defaultSeconds: { new: 60, review: 20, relearning: 30, variant: 30 },
  maxProjectedAnswers: 500, maxObservedFailureFraction: 1,
  ratingPeriod: 20, ratingSequenceStep: 7, initialRatingSlot: 19,
} as const;
export const EXAM_QUIZ_CAPABILITIES: readonly ExamQuizCapability[] = [
  { available: false, kind: "multiple-choice" }, { available: false, kind: "past-papers" }, { available: false, kind: "simulation" },
];
export type ExamPhase = "Aufbau" | "Festigung" | "Transfer" | "Endspurt";
export interface ExamPlanDay {
  key: string; budgetMinutes: number; reserveMinutes: number; spentMinutes: number;
  newMinutes: number; reviewMinutes: number; newCardIds: string[]; reviewCardIds: string[];
  reviewCount: number; backlogCount: number; buffer: boolean; blocks: StudyPlanBlock[];
  chapters: Array<{ deckId: string; name: string; newCount: number; reviewCount: number }>;
}
export interface ExamReadiness {
  coverage: number; security: number | null; achievement: number;
}
export interface ExamForecastSummary {
  examId: string; calendarDays: number; usableDays: number; totalCards: number; targetCards: number;
  knownCards: number; remainingNewCount: number; unscheduledNewCount: number; overdueReviewCount: number;
  requiredMinutes: number; availableMinutes: number; allocatedMinutes: number; reserveMinutes: number;
  current: ExamReadiness; predicted: ExamReadiness; feasible: boolean; issues: string[];
  chapters: Array<{ deckId: string; name: string; total: number; known: number; security: number | null }>;
  phases: Array<{ phase: ExamPhase; days: number }>;
}
export interface ExamPortfolioForecast {
  days: ExamPlanDay[]; exams: ExamForecastSummary[]; generatedAt: string;
  modelVersion: string; schedulerVersion: string; uncertainty: "high" | "medium";
  timing: Record<ExamStudyMethod, { seconds: number; samples: number }>;
  ratingAssumption: string;
}
export interface ExamPlanForecast extends ExamForecastSummary {
  days: ExamPlanDay[]; newMinutes: number; reviewMinutes: number;
  reviewSeconds: number; usesMeasuredTime: boolean; generatedAt: string;
}
interface Entry { item: LearningItem; deck: Deck; owners: ExamLearningPlan[]; requiredBy: string[]; state: ReviewState; due: number; answers: number }
interface ForecastOptions { now: string; preferences: GlobalSchedulerPreferences; timeZone: string; signal?: AbortSignal; capacity?: StudyTimeCapacity }
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class ReviewHeap {
  private values: Entry[] = [];
  constructor(private compare: (a: Entry, b: Entry) => number) {}
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
export function getExamPlanChapters(decks: Deck[], rootDeckId: string): Deck[] {
  const ids = collectDeckTreeIds(decks, rootDeckId);
  return decks.filter((deck) => ids.has(deck.id) && !deck.deletedAt).sort((a, b) => (a.hierarchyPath?.join(" / ") || a.name).localeCompare(b.hierarchyPath?.join(" / ") || b.name, "de"));
}
export function isExamQuestion(item: LearningItem) { return item.cardType === "single-choice" || item.cardType === "multiple-choice"; }
function isEligible(item: LearningItem) {
  return item.status === "active" && item.draftStatus !== "draft" && !item.deletedAt && !isLearningItemReviewBlocked(item) && !item.syncConflict && !item.meta.catalogOnly;
}
function isNew(state: ReviewState) { return state.state === "new" && state.repetitions === 0; }
function itemMethod(item: LearningItem, settings: Deck["deckSettings"], now?: string): ExamStudyMethod {
  if (isNew(item.reviewState)) return "new";
  if (chooseReviewCard(item, settings, { now }).reviewable.isVariant) return "variant";
  return item.reviewState.state === "learning" || item.reviewState.state === "relearning" ? "relearning" : "review";
}
export function getExamPlanFormAvailability(decks: Deck[], plan: ExamLearningPlan) {
  const items = decks.filter((deck) => plan.chapterDeckIds.includes(deck.id)).flatMap((deck) => deck.cards).filter(isEligible);
  return { cards: items.length > 0, questions: items.some(isExamQuestion), variants: items.some((item) => item.variants.some((variant) => variant.isActive && variant.qualityStatus === "active")) };
}
export function resolveExamSessionPlan(decks: Deck[], plan: ExamLearningPlan, requestedRoot?: string): ExamLearningPlan {
  const available = new Set(decks.filter((deck) => !deck.deletedAt).map((deck) => deck.id));
  const rootDeckId = requestedRoot ?? (available.has(plan.rootDeckId) ? plan.rootDeckId : plan.chapterDeckIds.find((id) => available.has(id)));
  if (!rootDeckId || !available.has(rootDeckId) || (rootDeckId !== plan.rootDeckId && !plan.chapterDeckIds.includes(rootDeckId))) {
    throw new Error("Der Startstapel ist nicht mehr verfügbar. Bearbeite die Stapelauswahl deiner Prüfung.");
  }
  return { ...plan, rootDeckId };
}
export function getExamStudySettings(deck: Deck, plan: ExamLearningPlan): Deck["deckSettings"] {
  return { ...deck.deckSettings, coreMode: plan.variants ? deck.deckSettings.coreMode : "off", ...markLearningSettingsCustom({
    ...deck.deckSettings,
    newCardsPerDay: 500, maximumReviewsPerDay: 2000, newReviewOrder: "reviews-first",
    schedulerProfile: { ...deck.deckSettings.schedulerProfile, presetId: "custom", desiredRetention: plan.desiredRetention },
  }), learningProfileSource: null, newCardsTodayOverride: null };
}
function beforeState(event: ReviewEvent): string {
  const raw = event.schedulerBefore;
  if (!raw || typeof raw !== "object") return "review";
  const value = raw as Record<string, unknown>, card = value.card;
  return String(card && typeof card === "object" ? (card as Record<string, unknown>).state : value.state ?? "review");
}
function observationMethod(event: ReviewEvent): ExamStudyMethod {
  const state = beforeState(event);
  return event.variantId ? "variant" : state === "new" ? "new" : state === "relearning" || state === "learning" ? "relearning" : "review";
}
export function estimateExamTiming(decks: Deck[]): ExamPortfolioForecast["timing"] {
  const events = uniqueEvents(decks).filter((event) => event.rating !== "manual" && event.responseTimeMs !== null && event.responseTimeMs >= 1000 && event.responseTimeMs <= 180_000)
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt) || a.id.localeCompare(b.id));
  const buckets: Record<ExamStudyMethod, number[]> = { new: [], review: [], relearning: [], variant: [] };
  for (const event of events) {
    const method = observationMethod(event);
    if (buckets[method].length < EXAM_MODEL.recentTimeSamples) buckets[method].push(event.responseTimeMs! / 1000);
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, samples]) => {
    const method = key as ExamStudyMethod;
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    return [method, { seconds: samples.length >= EXAM_MODEL.minimumTimeSamples ? Math.max(5, Math.min(120, Math.round(median))) : EXAM_MODEL.defaultSeconds[method], samples: samples.length }];
  })) as ExamPortfolioForecast["timing"];
}
function uniqueEvents(decks: Deck[]) { return [...new Map(decks.flatMap((deck) => deck.reviewEvents).map((event) => [event.id, event])).values()]; }
export function getExamDayCapacity(key: string, capacity: StudyTimeCapacity) {
  const override = capacity.dateOverrides.find((day) => day.date === key);
  if (override) return override.minutes;
  const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
  return capacity.weekdays[weekday] ? Math.max(capacity.minimumMinutes, weekday < 5 ? capacity.weekdayMinutes : capacity.weekendMinutes) : 0;
}
function priority(plan: ExamLearningPlan) { return plan.priority === "high" ? 2 : plan.priority === "normal" ? 1 : 0; }
function priorityOwners(entry: Entry) { return isNew(entry.state) ? entry.owners.filter((exam) => entry.requiredBy.includes(exam.id)) : entry.owners; }
function deadline(entry: Entry) { return priorityOwners(entry).map((exam) => exam.examDate).sort()[0]; }
function compareNew(a: Entry, b: Entry) {
  return Math.max(...priorityOwners(b).map(priority)) - Math.max(...priorityOwners(a).map(priority))
    || deadline(a).localeCompare(deadline(b)) || b.state.difficulty - a.state.difficulty
    || a.item.createdAt.localeCompare(b.item.createdAt) || a.item.id.localeCompare(b.item.id);
}
function readiness(entries: ReadonlyArray<{ item: LearningItem; state: ReviewState }>, allCount: number, plan: ExamLearningPlan, at: string, projected: boolean): ExamReadiness {
  const known = entries.filter((entry) => !isNew(projected ? entry.state : entry.item.reviewState));
  const coverage = allCount ? known.length / allCount : 0;
  const security = known.length ? known.reduce((sum, entry) => sum + calculateRetrievability(projected ? entry.state : entry.item.reviewState, at), 0) / known.length : null;
  const achievement = Math.min(1, coverage / (plan.coverage / 100)) * Math.min(1, (security ?? 0) / plan.desiredRetention);
  return { coverage, security, achievement };
}
export function getExamCurrentProgress(decks: Deck[], plan: ExamLearningPlan, now: string, timeZone: string) {
  const items = [...new Map(decks.filter((deck) => !deck.deletedAt && plan.chapterDeckIds.includes(deck.id)).flatMap((deck) => deck.cards).filter(isEligible).map((item) => [item.id, item])).values()];
  const future = plan.examDate > getLearningDayKey(now, { timeZone })!;
  const at = future ? getLearningDayStartForKey(plan.examDate, { timeZone })!.toISOString() : now;
  const records = items.map((item) => ({ item, state: item.reviewState }));
  return { ...readiness(records, items.length, plan, at, false), totalCards: items.length, atExam: future };
}

export async function createExamPortfolioForecast(decks: Deck[], exams: ExamLearningPlan[], options: ForecastOptions): Promise<ExamPortfolioForecast> {
  const { now, preferences, timeZone, signal } = options, context = { dayStartHour: preferences.dayStartHour, timeZone };
  const today = getLearningDayKey(now, context)!, civilToday = getLearningDayKey(now, { timeZone })!;
  const capacity = options.capacity ?? preferences.examPlanning.preparationCapacity ?? preferences.examPlanning.capacity;
  const active = exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday && examDayDistance(civilToday, exam.examDate) <= 365);
  const timing = estimateExamTiming(decks);
  const history = uniqueEvents(decks).filter((event) => event.rating !== "manual").sort((a, b) => b.answeredAt.localeCompare(a.answeredAt) || a.id.localeCompare(b.id)).slice(0, 80);
  const hasRatings = history.length >= EXAM_MODEL.minimumTimeSamples;
  const failureSlots = hasRatings ? Math.round(Math.min(EXAM_MODEL.maxObservedFailureFraction, history.filter((event) => event.rating === "again").length / history.length) * EXAM_MODEL.ratingPeriod) : 0;
  const hardSlots = hasRatings ? Math.min(EXAM_MODEL.ratingPeriod - failureSlots, Math.round(history.filter((event) => event.rating === "hard").length / history.length * EXAM_MODEL.ratingPeriod)) : 0;
  const easySlots = hasRatings ? Math.min(EXAM_MODEL.ratingPeriod - failureSlots - hardSlots, Math.round(history.filter((event) => event.rating === "easy").length / history.length * EXAM_MODEL.ratingPeriod)) : 0;
  const ratingAt = (answer: number): ReviewRating => {
    const slot = (answer * EXAM_MODEL.ratingSequenceStep + EXAM_MODEL.initialRatingSlot) % EXAM_MODEL.ratingPeriod;
    return slot < failureSlots ? "again" : slot < failureSlots + hardSlots ? "hard" : slot >= EXAM_MODEL.ratingPeriod - easySlots ? "easy" : "good";
  };
  const entriesById = new Map<string, Entry>();
  const summaries = new Map<string, ExamForecastSummary>();
  const allByExam = new Map<string, Entry[]>();
  const chosenByExam = new Map<string, Entry[]>();
  let operations = 0;
  for (const exam of active) {
    signal?.throwIfAborted(); await pause();
    const selected = decks.filter((deck) => !deck.deletedAt && exam.chapterDeckIds.includes(deck.id));
    const chosen: Entry[] = [], all: Entry[] = [];
    for (const deck of selected) {
      const items = deck.cards.filter(isEligible);
      const known = items.filter((item) => !isNew(item.reviewState));
      const fresh = items.filter((item) => isNew(item.reviewState)).sort((a, b) => b.reviewState.difficulty - a.reviewState.difficulty || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      const target = new Set([...known, ...fresh.slice(0, Math.max(0, Math.ceil(items.length * exam.coverage / 100) - known.length))].map((item) => item.id));
      for (const item of items) {
        if (++operations % 1024 === 0) { signal?.throwIfAborted(); await pause(); }
        let entry = entriesById.get(item.id);
        if (!entry) { entry = { item, deck, owners: [], requiredBy: [], state: item.reviewState, due: Date.parse(item.reviewState.dueAt), answers: 0 }; entriesById.set(item.id, entry); }
        entry.owners.push(exam);
        all.push(entry);
        if (target.has(item.id)) { entry.requiredBy.push(exam.id); chosen.push(entry); }
      }
    }
    allByExam.set(exam.id, all);
    chosenByExam.set(exam.id, chosen);
    const examTime = getLearningDayStartForKey(exam.examDate, { timeZone })!.toISOString();
    const current = readiness(all, all.length, exam, examTime, false);
    const missing = exam.chapterDeckIds.filter((id) => !selected.some((deck) => deck.id === id));
    summaries.set(exam.id, { examId: exam.id, calendarDays: examDayDistance(today, exam.examDate), usableDays: 0,
      totalCards: all.length, targetCards: chosen.length, knownCards: all.filter((entry) => !isNew(entry.state)).length,
      remainingNewCount: chosen.filter((entry) => isNew(entry.state)).length, unscheduledNewCount: 0, overdueReviewCount: 0,
      requiredMinutes: 0, availableMinutes: 0, allocatedMinutes: 0, reserveMinutes: 0,
      current, predicted: current, feasible: false, issues: [...(missing.length ? ["Ausgewählte Stapel wurden gelöscht oder sind nicht mehr verfügbar."] : []), ...(!all.length ? ["Keine aktiven, lernbaren Karten ausgewählt."] : [])],
      chapters: selected.map((deck) => { const chapter = all.filter((entry) => entry.deck.id === deck.id), r = readiness(chapter, chapter.length, exam, examTime, false); return { deckId: deck.id, name: deck.name, total: chapter.length, known: chapter.filter((entry) => !isNew(entry.state)).length, security: r.security }; }),
      phases: [] });
  }
  const entries = [...entriesById.values()].filter((entry) => entry.requiredBy.length);
  const lastExam = active.map((exam) => exam.examDate).sort().at(-1);
  if (!lastExam) return { days: [], exams: [], generatedAt: now, modelVersion: EXAM_MODEL.version, schedulerVersion: SCHEDULER_VERSION, uncertainty: "high", timing, ratingAssumption: "Noch keine aktive Prüfung mit zukünftigem Termin." };
  const keys = Array.from({ length: examDayDistance(today, lastExam) }, (_, i) => shiftExamDay(today, i));
  const examDates = new Set(exams.filter((exam) => exam.status === "active").map((exam) => exam.examDate));
  const bufferByExam = new Map(active.map((exam) => [exam.id, new Set(exam.bufferDays ? keys.filter((key) => key < exam.examDate && !examDates.has(key) && getExamDayCapacity(key, capacity) > 0).slice(-exam.bufferDays) : [])]));
  const currentOwners = (entry: Entry, key: string) => entry.owners.filter((exam) => key < exam.examDate);
  const settingFor = (entry: Entry, key: string) => {
    const owners = currentOwners(entry, key);
    return getExamStudySettings(entry.deck, { ...owners[0], desiredRetention: Math.max(...owners.map((exam) => exam.desiredRetention)), variants: owners.some((exam) => exam.variants) });
  };
  const heap = new ReviewHeap((a, b) => a.due - b.due || Number(b.state.lastRating === "again" || b.state.fallbackUntilCorrect) - Number(a.state.lastRating === "again" || a.state.fallbackUntilCorrect) || calculateRetrievability(a.state, now) - calculateRetrievability(b.state, now) || b.state.difficulty - a.state.difficulty || compareNew(a, b));
  const dueCountsByDay = new Map<string, number>();
  const trackDue = (due: number, amount: number) => { const key = getLearningDayKey(due, context); if (key) dueCountsByDay.set(key, Math.max(0, (dueCountsByDay.get(key) ?? 0) + amount)); };
  const enqueue = (entry: Entry) => { heap.push(entry); trackDue(entry.due, 1); };
  const fresh = entries.filter((entry) => isNew(entry.state)).sort(compareNew);
  for (const entry of entries) if (!isNew(entry.state)) enqueue(entry);
  const days: ExamPlanDay[] = [];
  const nextState = (entry: Entry, at: number, key: string) => {
    const settings = settingFor(entry, key);
    const variant = chooseReviewCard({ ...entry.item, reviewState: entry.state }, settings, { now: at }).reviewable;
    return scheduleWithFsrs(entry.state, ratingAt(entry.answers++), {
      now: new Date(at).toISOString(), ...context, deckSettings: settings,
      isVariant: variant.isVariant, variantId: variant.variant?.id ?? null, variantIsOriginal: !variant.isVariant,
      variantLevel: variant.variant?.variantLevel, variantType: variant.variant?.variantType,
      easyDaysContext: { ...context, easyDays: preferences.easyDays, dueCountsByDay },
    });
  };
  const classify = (entry: Entry, key: string): ExamStudyMethod => {
    return itemMethod({ ...entry.item, reviewState: entry.state }, settingFor(entry, key), now);
  };
  for (const key of keys) {
    signal?.throwIfAborted();
    const boundary = getLearningDayStartForKey(key, context)!.getTime(), nextBoundary = getLearningDayStartForKey(shiftExamDay(key, 1), context)!.getTime();
    const civilExamStart = examDates.has(shiftExamDay(key, 1)) ? getLearningDayStartForKey(shiftExamDay(key, 1), { timeZone })!.getTime() : nextBoundary;
    const end = Math.min(nextBoundary, civilExamStart);
    const at = key === today ? Math.max(Date.parse(now), boundary) : boundary + 8 * 3_600_000 < end ? boundary + 8 * 3_600_000 : boundary;
    const budget = examDates.has(key) || at >= end ? 0 : getExamDayCapacity(key, capacity);
    const todaysEvents = key === today ? uniqueEvents(decks).filter((event) => event.rating !== "manual" && getLearningDayKey(event.answeredAt, context) === key) : [];
    const spent = todaysEvents.reduce((sum, event) => sum + (event.responseTimeMs ?? timing[observationMethod(event)].seconds * 1000) / 60_000, 0);
    const reserve = budget * capacity.reserveFraction;
    let remaining = Math.max(0, Math.min((budget - reserve - spent) * 60, (end - at) / 1000));
    const availableMinutes = remaining / 60;
    const blocks = new Map<string, StudyPlanBlock>(), chapterCounts = new Map<string, { deckId: string; name: string; newCount: number; reviewCount: number }>();
    const newIds: string[] = [], reviewIds = new Set<string>();
    let newSeconds = 0, repeatedSeconds = 0, reviewCount = 0;
    const record = (entry: Entry, method: ExamStudyMethod, seconds: number) => {
      const owners = currentOwners(entry, key).map((exam) => exam.id).sort(), group = `${method}:${owners.join(",")}:${entry.deck.id}`;
      let block = blocks.get(group);
      if (!block) { block = { id: `${key}:${group}`, date: key, examIds: owners, deckIds: [entry.deck.id], method, plannedMinutes: 0, actualMinutes: 0, expectedItems: 0, priority: method === "new" ? 3 : method === "relearning" ? 0 : 1, status: "planned", learningItemIds: [] }; blocks.set(group, block); }
      block.plannedMinutes += seconds / 60; block.expectedItems++; if (!block.learningItemIds.includes(entry.item.id)) block.learningItemIds.push(entry.item.id);
      const chapter = chapterCounts.get(entry.deck.id) ?? { deckId: entry.deck.id, name: entry.deck.name, newCount: 0, reviewCount: 0 };
      chapter[method === "new" ? "newCount" : "reviewCount"]++; chapterCounts.set(entry.deck.id, chapter);
      if (method === "new") { newSeconds += seconds; newIds.push(entry.item.id); } else { repeatedSeconds += seconds; reviewCount++; reviewIds.add(entry.item.id); }
      // Shared work is attributed fractionally, never booked twice as capacity.
      for (const id of owners) summaries.get(id)!.allocatedMinutes += seconds / 60 / owners.length;
    };
    while (remaining >= 5) {
      if (++operations % 256 === 0) { signal?.throwIfAborted(); await pause(); }
      const review = heap.peek();
      if (review && review.due < end) {
        if (reviewCount >= 2000) break;
        const entry = heap.pop()!; trackDue(entry.due, -1);
        if (!currentOwners(entry, key).length || entry.answers >= EXAM_MODEL.maxProjectedAnswers) continue;
        const method = classify(entry, key), seconds = timing[method].seconds;
        if (seconds > remaining) { enqueue(entry); break; }
        const state = nextState(entry, Math.max(at, entry.due), key);
        record(entry, method, seconds); remaining -= seconds; entry.state = state; entry.due = Date.parse(state.dueAt); enqueue(entry); continue;
      }
      if (newIds.length >= 500) break;
      const index = fresh.findIndex((entry) => {
        const owners = currentOwners(entry, key);
        return entry.due < end && owners.some((exam) => entry.requiredBy.includes(exam.id)) && owners.every((exam) => !bufferByExam.get(exam.id)!.has(key));
      });
      if (index < 0) break;
      const entry = fresh[index], firstSeconds = timing.new.seconds + (isExamQuestion(entry.item) && timing.new.samples < EXAM_MODEL.minimumTimeSamples ? 30 : 0);
      // A single new item includes its initial learning steps; their state remains hypothetical.
      let simulation = { ...entry }, time = Math.max(at, entry.due);
      simulation.state = nextState(simulation, time, key);
      const steps: ExamStudyMethod[] = [];
      while (simulation.state.state !== "review" && Date.parse(simulation.state.dueAt) < end && steps.length < 12) {
        steps.push(classify(simulation, key));
        time = Math.max(time + 1000, Date.parse(simulation.state.dueAt)); simulation.state = nextState(simulation, time, key);
      }
      const cost = firstSeconds + steps.reduce((sum, method) => sum + timing[method].seconds, 0);
      if (cost > remaining) break;
      record(entry, "new", firstSeconds);
      for (const method of steps) record(entry, method, timing[method].seconds);
      remaining -= cost; Object.assign(entry, { state: simulation.state, due: Date.parse(simulation.state.dueAt), answers: simulation.answers }); enqueue(entry); fresh.splice(index, 1);
    }
    const actualBlocks = [...blocks.values()];
    // Review history is the sole source of completed minutes, including ordinary sessions.
    const actualByGroup = new Map<string, StudyPlanBlock>();
    for (const event of todaysEvents) {
      const entry = entriesById.get(event.learningItemId);
      if (!entry?.owners.length) continue;
      const method = observationMethod(event);
      const owners = currentOwners(entry, key).map((exam) => exam.id).sort(), group = `${method}:${owners.join(",")}:${entry.deck.id}`;
      let block = actualByGroup.get(group);
      if (!block) { block = { id: `${key}:completed:${group}`, date: key, examIds: owners, deckIds: [entry.deck.id], method, plannedMinutes: 0, actualMinutes: 0, expectedItems: 0, priority: 0, status: "completed", learningItemIds: [] }; actualByGroup.set(group, block); }
      block.actualMinutes += (event.responseTimeMs ?? 0) / 60_000; block.expectedItems++; if (!block.learningItemIds.includes(entry.item.id)) block.learningItemIds.push(entry.item.id);
    }
    actualBlocks.push(...actualByGroup.values());
    days.push({ key, budgetMinutes: budget, reserveMinutes: reserve, spentMinutes: spent, newMinutes: newSeconds / 60, reviewMinutes: repeatedSeconds / 60,
      newCardIds: newIds, reviewCardIds: [...reviewIds], reviewCount, backlogCount: heap.countBefore(end), buffer: active.some((exam) => bufferByExam.get(exam.id)!.has(key)),
      blocks: actualBlocks.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)), chapters: [...chapterCounts.values()] });
    for (const exam of active.filter((exam) => key < exam.examDate)) {
      const summary = summaries.get(exam.id)!;
      if (availableMinutes > 0) summary.usableDays++;
      summary.availableMinutes += availableMinutes; summary.reserveMinutes += reserve;
      const chosen = chosenByExam.get(exam.id)!;
      const remainingNew = chosen.filter((entry) => isNew(entry.state)).length;
      const phase: ExamPhase = bufferByExam.get(exam.id)!.has(key) || examDayDistance(key, exam.examDate) <= 3 ? "Endspurt" : remainingNew > 0 || actualBlocks.some((block) => block.method === "new" && block.examIds.includes(exam.id)) ? "Aufbau" : chosen.some((entry) => entry.state.state === "learning" || entry.state.state === "relearning" || entry.state.lastRating === "again") ? "Festigung" : exam.variants && actualBlocks.some((block) => block.examIds.includes(exam.id) && block.method === "variant") ? "Transfer" : "Festigung";
      const previous = summary.phases.at(-1); if (previous?.phase === phase) previous.days++; else summary.phases.push({ phase, days: 1 });
      if (shiftExamDay(key, 1) === exam.examDate) {
        const examStart = getLearningDayStartForKey(exam.examDate, { timeZone })!.getTime();
        summary.unscheduledNewCount = remainingNew;
        summary.overdueReviewCount = allByExam.get(exam.id)!.filter((entry) => !isNew(entry.state) && entry.due < examStart).length;
        summary.predicted = readiness(allByExam.get(exam.id)!, summary.totalCards, exam, new Date(examStart).toISOString(), true);
        summary.feasible = !summary.issues.length && remainingNew === 0 && summary.overdueReviewCount === 0 && summary.predicted.security !== null && summary.predicted.security >= exam.desiredRetention;
      }
    }
    await pause();
  }
  // Unconstrained workload: the same scheduler, with observed rating mix, without capacity limits.
  // Attribute shared answers once to all still-relevant exams; this is a lower-bound timing scenario.
  for (let index = 0; index < entries.length; index++) {
    if (index % 128 === 0) { signal?.throwIfAborted(); await pause(); }
    const entry = entries[index], estimate: Entry = { ...entry, state: entry.item.reviewState, due: Date.parse(entry.item.reviewState.dueAt), answers: 0 };
    const lastDeadline = entry.owners.map((exam) => exam.examDate).sort().at(-1)!;
    const end = getLearningDayStartForKey(lastDeadline, { timeZone })!.getTime();
    while (estimate.due < end && estimate.answers < EXAM_MODEL.maxProjectedAnswers) {
      const at = Math.max(Date.parse(now), estimate.due), key = getLearningDayKey(at, context)!;
      const owners = currentOwners(estimate, key); if (!owners.length) break;
      if (isNew(estimate.state) && !owners.some((exam) => estimate.requiredBy.includes(exam.id))) break;
      const method = classify(estimate, key), seconds = timing[method].seconds + (method === "new" && isExamQuestion(estimate.item) && timing.new.samples < EXAM_MODEL.minimumTimeSamples ? 30 : 0);
      for (const owner of owners) summaries.get(owner.id)!.requiredMinutes += seconds / 60 / owners.length;
      const state = nextState(estimate, at, key); estimate.state = state; estimate.due = Math.max(at + 1000, Date.parse(state.dueAt));
    }
  }
  for (const summary of summaries.values()) {
    summary.requiredMinutes = Math.max(summary.requiredMinutes, summary.allocatedMinutes);
    if (summary.unscheduledNewCount) summary.issues.push(`${summary.unscheduledNewCount} neue Karten passen noch nicht ins gemeinsame Zeitbudget.`);
    if (summary.overdueReviewCount) summary.issues.push(`${summary.overdueReviewCount} Wiederholungen bleiben vor der Prüfung offen.`);
    if (summary.predicted.security !== null && summary.predicted.security < active.find((exam) => exam.id === summary.examId)!.desiredRetention) summary.issues.push("Die geschätzte Abrufsicherheit am Prüfungstag liegt unter deinem Ziel.");
    if (!summary.usableDays && (summary.requiredMinutes > 0 || !summary.feasible)) summary.issues.push("Keine verfügbare Lernzeit vor dieser Prüfung.");
  }
  return { days, exams: [...summaries.values()], generatedAt: now, modelVersion: EXAM_MODEL.version, schedulerVersion: SCHEDULER_VERSION,
    uncertainty: Object.values(timing).some((estimate) => estimate.samples < EXAM_MODEL.minimumTimeSamples) ? "high" : "medium", timing,
    ratingAssumption: hasRatings ? "Deterministisches Szenario mit dem begrenzten Again/Hard/Good/Easy-Mix der letzten 80 Antworten." : "Szenario mit erfolgreichen Antworten („Gut“); zu wenig Historie für eine persönliche Fehlerquote." };
}
export async function createExamPlanForecast(decks: Deck[], plan: ExamLearningPlan, options: ForecastOptions): Promise<ExamPlanForecast> {
  const today = getLearningDayKey(options.now, { timeZone: options.timeZone })!;
  if (plan.examDate <= today || examDayDistance(today, plan.examDate) > 365) throw new Error("Wähle einen Prüfungstag innerhalb der nächsten 365 Tage.");
  const portfolio = await createExamPortfolioForecast(decks, [plan], options), summary = portfolio.exams[0];
  if (!summary?.totalCards) throw new Error("Für die ausgewählten Kapitel sind keine lernbaren Karten vorhanden.");
  return { ...summary, days: portfolio.days, newMinutes: portfolio.days.reduce((sum, day) => sum + day.newMinutes, 0),
    reviewMinutes: portfolio.days.reduce((sum, day) => sum + day.reviewMinutes, 0), reviewSeconds: portfolio.timing.review.seconds,
    usesMeasuredTime: portfolio.timing.review.samples >= EXAM_MODEL.minimumTimeSamples, generatedAt: options.now };
}
export function createExamStudyDecks(decks: Deck[], plan: ExamLearningPlan, day: ExamPlanDay, exams: ExamLearningPlan[] = [plan], blockId?: string, resumeIds: string[] = []): Deck[] {
  const blocks = day.blocks.filter((block) => block.status !== "completed" && block.examIds.includes(plan.id) && (!blockId || block.id === blockId));
  const resume = new Set(resumeIds);
  const ids = new Set([...blocks.flatMap((block) => block.learningItemIds), ...resume]);
  const selected = decks.filter((deck) => deck.id === plan.rootDeckId || deck.cards.some((item) => ids.has(item.id)));
  return selected.map((deck) => {
    const applicable = exams.filter((exam) => exam.status === "active" && exam.chapterDeckIds.includes(deck.id) && exam.examDate > day.key);
    const settings = { ...plan, variants: applicable.some((exam) => exam.variants), desiredRetention: Math.max(plan.desiredRetention, ...applicable.map((exam) => exam.desiredRetention)) };
    return { ...deck, parentDeckId: deck.id === plan.rootDeckId ? null : plan.rootDeckId,
      cards: deck.cards.filter((item) => ids.has(item.id) && isEligible(item) && (!blockId || resume.has(item.id)
        || blocks.some((block) => block.learningItemIds.includes(item.id) && block.method === itemMethod(item, getExamStudySettings(deck, settings))))),
      reviewEvents: deck.reviewEvents.filter((event) => ids.has(event.learningItemId)),
      deckSettings: getExamStudySettings(deck, settings) };
  });
}

export function getExamBlockResumeIds(decks: Deck[], plan: ExamLearningPlan, blockId: string, options: ForecastOptions): string[] {
  const context = { timeZone: options.timeZone, dayStartHour: options.preferences.dayStartHour };
  const today = getLearningDayKey(options.now, context);
  return [...new Set(decks.filter((deck) => plan.chapterDeckIds.includes(deck.id)).flatMap((deck) => deck.reviewEvents)
    .filter((event) => event.flags.examBlockId === blockId && event.flags.examPlanId === plan.id && getLearningDayKey(event.answeredAt, context) === today)
    .map((event) => event.learningItemId))];
}

export function getExamBlockQueue(decks: Deck[], exams: ExamLearningPlan[], day: ExamPlanDay, block: StudyPlanBlock, options: ForecastOptions) {
  const plan = exams.find((exam) => block.examIds.includes(exam.id));
  if (!plan) return null;
  const sessionPlan = resolveExamSessionPlan(decks, plan);
  const session = createExamStudyDecks(decks, sessionPlan, day, exams, block.id);
  return createDailyReviewQueue(session, { deckId: sessionPlan.rootDeckId, now: options.now, dayStartHour: options.preferences.dayStartHour,
    learnAheadMinutes: options.preferences.learnAheadMinutes, timeZone: options.timeZone });
}
