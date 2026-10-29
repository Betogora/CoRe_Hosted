import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import { createCoreDeck, createReviewState } from "./coreModel.ts";
import type { Card, Deck, DeckSettings, ExamDailyTask, ExamPlan, GlobalSchedulerPreferences, ReviewRating, ReviewState, StudyTimeCapacity } from "./coreTypes.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import { EXAM_SESSION_DECK_ID, getExamPlanningKey, getExamQuizPlanningKey, getExamQuizTaskId } from "./examPlanSettings.ts";
import { getLearningDayKey, getLearningDayStartForKey } from "./learningDay.ts";
import { markLearningSettingsCustom } from "./learningProfiles.ts";
import { createMainThreadBudget } from "./mainThreadBudget.ts";
import { calculateRetrievability, scheduleWithFsrs } from "./scheduler.ts";
import { balanceExamContacts, type ContactColumn } from "./examContactPlanning.ts";

type ExamStudyMethod = "new" | "review" | "relearning" | "variant";
export interface StudyPlanBlock {
  id: string; date: string; examIds: string[]; deckId: string; method: ExamStudyMethod;
  expectedItems: number; cardIds: string[];
}
export interface ExamPlanDay {
  key: string; budgetMinutes: number; newCardIds: string[]; reviewCardIds: string[]; blocks: StudyPlanBlock[];
  summaries: Array<{ examId: string; deckId: string }>;
  quizzes?: Array<{ examId: string; deckIds: string[] }>;
}
export interface ExamReadiness { coverage: number; consolidated: number }
export interface ExamForecastSummary {
  examId: string; studyDays: number; totalCards: number; remainingNewCount: number;
  unscheduledNewCount: number; availableMinutes: number; current: ExamReadiness; issues: string[];
  decks: Array<{ deckId: string; name: string; total: number; known: number }>;
}
export interface ExamPortfolioForecast { days: ExamPlanDay[]; exams: ExamForecastSummary[] }
export interface ExamForecastOptions {
  now: string; preferences: Pick<GlobalSchedulerPreferences, "dayStartHour" | "easyDays">; timeZone: string;
  capacity: StudyTimeCapacity; signal?: AbortSignal; dailyTasks?: readonly ExamDailyTask[];
}
export function shiftExamDay(key: string, days: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function examDayDistance(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
/** More than two new cards per planned minute leaves under 30 seconds per card including its learning steps. */
export const EXAM_NEW_CARDS_PER_MINUTE_LIMIT = 2;
export function isExamDayOverloaded(newCards: number, minutes: number) { return newCards > Math.max(minutes, 1) * EXAM_NEW_CARDS_PER_MINUTE_LIMIT; }
/** From the day after its date an exam counts as completed, whether or not it was closed by hand. */
export function getExamStatus(exam: Pick<ExamPlan, "status" | "examDate">, civilToday: string): ExamPlan["status"] {
  return exam.status === "active" && exam.examDate < civilToday ? "completed" : exam.status;
}
export function getExamLastNewDate(exam: ExamPlan) { return shiftExamDay(exam.examDate, -exam.bufferDays); }
/** Scopes are cached per deck list and exam object; both are immutable application state. */
const deckScopes = new WeakMap<readonly Deck[], WeakMap<object, ReadonlySet<string>>>();
/** Decks of an exam: the nearest selected or excluded ancestor (or the deck itself) decides, so new subdecks join their selected parent. */
export function getExamDeckIds(decks: readonly Deck[], exam: Pick<ExamPlan, "deckIds" | "excludedDeckIds">): ReadonlySet<string> {
  const cache = deckScopes.get(decks) ?? new WeakMap<object, ReadonlySet<string>>(), cached = cache.get(exam);
  if (cached) return cached;
  deckScopes.set(decks, cache);
  const parents = new Map(decks.filter((deck) => !deck.deletedAt).map((deck) => [deck.id, deck.parentDeckId])), included = new Set(exam.deckIds), excluded = new Set(exam.excludedDeckIds);
  const result = new Set<string>();
  for (const id of parents.keys()) {
    for (let current: string | null | undefined = id, depth = 0; current && depth <= parents.size; current = parents.get(current), depth++) {
      if (excluded.has(current)) break;
      if (included.has(current)) { result.add(id); break; }
    }
  }
  cache.set(exam, result);
  return result;
}
/** Selecting or deselecting a deck keeps the selection minimal: one mark per subtree, exclusions only below a selected deck. */
export function toggleExamDeckSelection(decks: readonly Deck[], exam: Pick<ExamPlan, "deckIds" | "excludedDeckIds">, deckId: string, selected: boolean): Pick<ExamPlan, "deckIds" | "excludedDeckIds"> {
  const subtree = new Set([deckId]);
  for (let grew = true; grew;) { grew = false; for (const deck of decks) if (deck.parentDeckId && subtree.has(deck.parentDeckId) && !subtree.has(deck.id)) { subtree.add(deck.id); grew = true; } }
  const rest = { deckIds: exam.deckIds.filter((id) => !subtree.has(id)), excludedDeckIds: (exam.excludedDeckIds ?? []).filter((id) => !subtree.has(id)) };
  const inherited = getExamDeckIds(decks, rest).has(deckId);
  return { deckIds: selected && !inherited ? [...rest.deckIds, deckId] : rest.deckIds, excludedDeckIds: !selected && inherited ? [...rest.excludedDeckIds, deckId] : rest.excludedDeckIds };
}
export function getExamTopicOrder(decks: readonly Deck[], exam: ExamPlan): string[] {
  const children = buildSortedDeckChildren(decks.filter((deck) => !deck.deletedAt)), scope = getExamDeckIds(decks, exam), order: string[] = [];
  const visit = (parent: string | null) => { for (const deck of children.get(parent) ?? []) { if (scope.has(deck.id)) order.push(deck.id); visit(deck.id); } };
  visit(null);
  return [...(exam.topicOrder ?? []).filter((id) => order.includes(id)), ...order.filter((id) => !exam.topicOrder?.includes(id))];
}
function isNew(state: Pick<ReviewState, "state" | "reps">) { return state.state === "new" && state.reps === 0; }
function snapshotState(card: CardStudySnapshot) { return createReviewState({ ...card.study, maturityXp: card.maturityXp }); }
function readiness(cards: readonly CardStudySnapshot[]): ExamReadiness {
  return { coverage: cards.length ? cards.filter((card) => !isNew(card.study)).length / cards.length : 0,
    consolidated: cards.length ? cards.filter((card) => card.study.state === "review" && card.study.lastRating !== "again" && card.maturityXp >= 81).length / cards.length : 0 };
}
export function getExamCurrentProgress(decks: readonly Deck[], cards: readonly CardStudySnapshot[], plan: ExamPlan) {
  const scope = getExamDeckIds(decks, plan), own = cards.filter((card) => card.status === "active" && scope.has(card.deckId));
  return { ...readiness(own), totalCards: own.length };
}
function baseMinutes(key: string, exam: ExamPlan) {
  const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7, time = exam.studyTime;
  return time.dateOverrides.find((day) => day.date === key)?.minutes ?? (time.weekdays[weekday] ? time.weeklyMinutes?.[weekday] ?? time.dailyMinutes : 0);
}
/** The exam's own blocks replace its time for that date; blocks without an exam are calendar notes only. */
export function getExamStudyMinutes(key: string, exam: ExamPlan, exams: readonly ExamPlan[], capacity: StudyTimeCapacity): number {
  if ((exam.studyStartDate && key < exam.studyStartDate) || key >= exam.examDate || exams.some((entry) => entry.status === "active" && entry.examDate === key)) return 0;
  const own = (capacity.timeBlocks ?? []).filter((block) => block.date === key && block.examId === exam.id);
  return own.length ? own.reduce((sum, block) => sum + block.end - block.start, 0) : baseMinutes(key, exam);
}
function getExamStudySettings(settings: DeckSettings, desiredRetention: number, variants: boolean): DeckSettings {
  return { ...settings, ...markLearningSettingsCustom({ ...settings, newCardsPerDay: 500, maximumReviewsPerDay: 2000, newReviewOrder: "reviews-first", newCardSortOrder: "oldest-first", buryNewSiblings: false,
    schedulerProfile: { ...settings.schedulerProfile, presetId: "custom", desiredRetention } }), coreMode: variants ? settings.coreMode : "off", learningProfileSource: null, newCardsTodayOverride: null };
}
function methodFor(card: CardStudySnapshot, settings: DeckSettings): ExamStudyMethod {
  if (isNew(card.study)) return "new";
  if (settings.coreMode === "on" && card.activeVariantCount > 0 && card.maturityXp >= settings.variantThresholdXp) return "variant";
  return card.study.state === "learning" || card.study.state === "relearning" ? "relearning" : "review";
}

/** Whole-horizon contact planning, including for today's start. Study states remain hypothetical. */
export async function createExamPortfolioForecast(decks: readonly Deck[], cards: readonly CardStudySnapshot[], exams: readonly ExamPlan[], options: ExamForecastOptions): Promise<ExamPortfolioForecast> {
  const { now, preferences, timeZone, signal, capacity } = options, context = { dayStartHour: preferences.dayStartHour, timeZone };
  const pause = createMainThreadBudget(), today = getLearningDayKey(now, context)!, civilToday = getLearningDayKey(now, { timeZone })!;
  const active = exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday && examDayDistance(civilToday, exam.examDate) <= 365);
  const last = active.map((exam) => exam.examDate).sort().at(-1);
  if (!last) return { days: [], exams: [] };
  const keys = Array.from({ length: examDayDistance(today, last) }, (_, i) => shiftExamDay(today, i));
  const days: ExamPlanDay[] = keys.map((key) => ({ key, budgetMinutes: active.reduce((sum, exam) => sum + getExamStudyMinutes(key, exam, active, capacity), 0), newCardIds: [], reviewCardIds: [], blocks: [], summaries: [] }));
  const recorded = new Map(days.map((day) => [day, {
    blocks: new Map<string, StudyPlanBlock>(), newCards: new Set<string>(), reviews: new Set<string>(),
  }]));
  const deckById = new Map(decks.filter((deck) => !deck.deletedAt).map((deck) => [deck.id, deck])), cardsByDeck = new Map<string, CardStudySnapshot[]>();
  for (const card of cards) if (card.status === "active" && deckById.has(card.deckId)) { const own = cardsByDeck.get(card.deckId) ?? []; own.push(card); cardsByDeck.set(card.deckId, own); }
  for (const own of cardsByDeck.values()) own.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.cardId.localeCompare(b.cardId));
  // The latest answers of the planned cards form the simplified scenario; below ten answers every contact counts as "good".
  const ratings: Partial<Record<ReviewRating, number>> = {};
  for (const card of cards) if (card.study.lastRating) ratings[card.study.lastRating] = (ratings[card.study.lastRating] ?? 0) + 1;
  const ratingTotal = Object.values(ratings).reduce((sum, value) => sum + (value ?? 0), 0);
  const ratingAt = (answer: number): ReviewRating => {
    if (ratingTotal < 10) return "good";
    const slot = ((answer * 7 + 19) % 101) / 101 * ratingTotal; let threshold = 0;
    for (const rating of ["again", "hard", "good", "easy"] as const) { threshold += ratings[rating] ?? 0; if (slot < threshold) return rating; }
    return "good";
  };
  let operations = 0;
  const summaries: ExamForecastSummary[] = [];
  // Shared decks are planned once, by the exam whose new cards are due first; later exams see that load.
  const planningOrder = [...active].sort((a, b) => getExamLastNewDate(a).localeCompare(getExamLastNewDate(b)) || a.examDate.localeCompare(b.examDate) || a.id.localeCompare(b.id));
  const ownerByDeck = new Map<string, string>();
  for (const exam of planningOrder) for (const id of getExamDeckIds(decks, exam)) if (!ownerByDeck.has(id)) ownerByDeck.set(id, exam.id);
  const plannedContacts = new Float64Array(keys.length), readingTopics = new Set<string>();
  for (const exam of planningOrder) {
    signal?.throwIfAborted(); await pause();
    const length = examDayDistance(today, exam.examDate), ownDays = days.slice(0, length), ownKeys = keys.slice(0, length);
    const minutes = ownKeys.map((key) => getExamStudyMinutes(key, exam, active, capacity));
    const order = getExamTopicOrder(decks, exam), own = order.flatMap((id) => cardsByDeck.get(id) ?? []), planned = own.filter((card) => ownerByDeck.get(card.deckId) === exam.id);
    const allFresh = planned.filter((card) => isNew(card.study));
    const cutoff = getExamLastNewDate(exam), introductionEnd = getLearningDayStartForKey(shiftExamDay(cutoff, 1), { timeZone })!.getTime();
    const started = !exam.studyStartDate || today >= exam.studyStartDate;
    const frozen = options.dailyTasks?.filter((task) => started && civilToday <= cutoff && task.date === today && task.examId === exam.id && task.kind === "study" && (!task.planningKey || task.planningKey === getExamPlanningKey(exam, capacity))) ?? [];
    const frozenIds = new Set(frozen.flatMap((task) => task.cardIds)), fixedFresh = allFresh.filter((card) => frozenIds.has(card.cardId)), fresh = allFresh.filter((card) => !frozenIds.has(card.cardId));
    let eligible = ownKeys.flatMap((key, i) => key <= cutoff && minutes[i] > 0 ? [i] : []);
    const settingsByDeck = new Map(order.map((id) => [id, getExamSessionDeckSettings(decks, deckById.get(id)!, active, today)]));
    const dayStarts = ownKeys.map((key) => getLearningDayStartForKey(key, context)!.getTime());
    const examStart = getLearningDayStartForKey(exam.examDate, { timeZone })!.getTime();
    const ends = ownKeys.map((key) => Math.min(getLearningDayStartForKey(shiftExamDay(key, 1), context)!.getTime(), examStart));
    const windows = ownKeys.map((key, i) => {
      if (minutes[i] <= 0) return [];
      const clock = (minute: number) => minute === 1440 ? getLearningDayStartForKey(shiftExamDay(key, 1), { timeZone })!.getTime() : getLearningDayStartForKey(key, { timeZone, dayStartHour: Math.floor(minute / 60) })!.getTime() + minute % 60 * 60000;
      const blocks = (capacity.timeBlocks ?? []).filter((block) => block.date === key && block.examId === exam.id);
      return blocks.length ? blocks.map((block) => [Math.max(dayStarts[i], clock(block.start)), Math.min(ends[i], clock(block.end))]).sort((a, b) => a[0] - b[0]) : [[Math.min(ends[i] - 1, dayStarts[i] + 8 * 3600000), ends[i]]];
    });
    eligible = eligible.filter((i) => windows[i].some(([begin, end]) => Math.max(begin, i === 0 ? Date.parse(now) : begin) < Math.min(end, introductionEnd)));
    if (frozen.length && eligible.some((i) => i > 0)) eligible = eligible.filter((i) => i > 0);
    const nextContact = (due: number, start: number) => {
      for (let i = start; i < length; i++) for (const [begin, end] of windows[i]) { const at = Math.max(due, begin, i === 0 ? Date.parse(now) : begin); if (at < end) return { day: i, at }; }
      return null;
    };
    const dueCountsByDay = new Map<string, number>();
    for (const card of own.filter((entry) => !isNew(entry.study))) {
      const key = getLearningDayKey(card.study.dueAt, context);
      if (key) dueCountsByDay.set(key, (dueCountsByDay.get(key) ?? 0) + 1);
    }
    const simulate = async (initial: ReviewState, settings: DeckSettings, start: number): Promise<ContactColumn> => {
      const contacts = new Float64Array(length); let state = initial, after = start, due = Math.max(Date.parse(initial.dueAt), dayStarts[start]), answer = 0;
      while (true) {
        if (++operations % 16 === 0) { signal?.throwIfAborted(); await pause(); }
        const next = nextContact(due, after); if (!next) break;
        contacts[next.day]++; state = scheduleWithFsrs(state, ratingAt(answer++), { now: new Date(next.at).toISOString(), ...context, deckSettings: settings, easyDaysContext: { ...context, easyDays: preferences.easyDays, dueCountsByDay } });
        after = next.day; due = Math.max(next.at + 1000, Date.parse(state.dueAt));
      }
      return { contacts, recall: calculateRetrievability(state, new Date(examStart).toISOString()) };
    };
    const baseline = new Float64Array(length), knownGroups = new Map<string, { card: CardStudySnapshot; count: number }>();
    for (const card of planned.filter((entry) => !isNew(entry.study))) {
      const signature = JSON.stringify([card.study, settingsByDeck.get(card.deckId)]), group = knownGroups.get(signature);
      if (group) group.count++; else knownGroups.set(signature, { card, count: 1 });
      if (started && Date.parse(card.study.dueAt) < ends[0]) record(ownDays[0], card, methodFor(card, settingsByDeck.get(card.deckId)!));
    }
    for (const { card, count } of knownGroups.values()) { const projection = await simulate(snapshotState(card), settingsByDeck.get(card.deckId)!, 0); projection.contacts.forEach((value, i) => { baseline[i] += value * count; }); }
    const fixedGroups = new Map<string, { settings: DeckSettings; count: number }>();
    for (const card of fixedFresh) {
      record(ownDays[0], card, "new");
      const settings = settingsByDeck.get(card.deckId)!, signature = JSON.stringify(settings.schedulerProfile), group = fixedGroups.get(signature);
      if (group) group.count++; else fixedGroups.set(signature, { settings, count: 1 });
    }
    for (const { settings, count } of fixedGroups.values()) {
      const projection = await simulate(createReviewState({ state: "new", reps: 0, dueAt: now }), settings, 0);
      projection.contacts.forEach((value, i) => { baseline[i] += value * count; });
    }
    const columnCache = new Map<string, ContactColumn>(), columns: ContactColumn[] = [], groups = new Map<string, { settings: DeckSettings; count: number }>();
    for (const card of fresh) { const settings = settingsByDeck.get(card.deckId)!, key = JSON.stringify(settings.schedulerProfile), group = groups.get(key); if (group) group.count++; else groups.set(key, { settings, count: 1 }); }
    for (const start of eligible) {
      const mixed: ContactColumn = { contacts: new Float64Array(length), recall: 0 };
      for (const [key, group] of groups) {
        const cacheKey = `${start}:${key}`; let column = columnCache.get(cacheKey);
        if (!column) { column = await simulate(createReviewState({ state: "new", reps: 0, dueAt: new Date(dayStarts[start]).toISOString() }), group.settings, start); columnCache.set(cacheKey, column); }
        const share = group.count / fresh.length; column.contacts.forEach((value, i) => { mixed.contacts[i] += value * share; }); mixed.recall += column.recall * share;
      }
      columns.push(mixed);
    }
    const load = Float64Array.from(baseline);
    for (let i = 0; i < length; i++) if (days[i].budgetMinutes > 0) load[i] += plannedContacts[i] * minutes[i] / days[i].budgetMinutes;
    const counts = await balanceExamContacts(columns, load, minutes, eligible, fresh.length, pause, signal);
    const minimumDates = new Map(exam.topicDates?.map((entry) => [entry.deckId, entry.date])); let cursor = 0;
    for (let slot = 0; slot < eligible.length; slot++) {
      const day = ownDays[eligible[slot]], remaining = fresh.length - cursor; if (!remaining) break;
      let count = slot === eligible.length - 1 ? remaining : Math.min(remaining, counts[slot]);
      if (count > 0 && slot < eligible.length - 1) {
        const target = cursor + count, boundaries: number[] = [], halves: number[] = [];
        for (let i = cursor; i < fresh.length;) { let end = i + 1; while (end < fresh.length && fresh[end].deckId === fresh[i].deckId) end++; boundaries.push(end); halves.push(i + Math.ceil((end - i) / 2)); i = end; }
        const near = (values: number[]) => values.filter((end) => Math.abs(end - target) <= count * .25 && Math.abs(end - target) <= (fresh.length - target) * .25).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
        const boundary = near(boundaries) ?? near(halves); if (boundary !== undefined) count = boundary - cursor;
      }
      let taken = 0;
      while (taken < count && cursor < fresh.length) { const card = fresh[cursor]; if ((minimumDates.get(card.deckId) ?? day.key) > day.key) break; record(day, card, "new"); cursor++; taken++; }
      if (slot + 1 < counts.length) {
        const planned = counts.slice(slot + 1).reduce((sum, value) => sum + value, 0), rest = fresh.length - cursor;
        if (planned !== rest) {
          const weight = eligible.slice(slot + 1).reduce((sum, i) => sum + minutes[i], 0); let allocated = 0;
          for (let next = slot + 1; next < counts.length; next++) { counts[next] = next === counts.length - 1 ? rest - allocated : Math.floor(rest * (planned ? counts[next] / planned : minutes[eligible[next]] / weight)); allocated += counts[next]; }
        }
      }
    }
    // A reading task waits on the topic's first day and stays on today once the topic has begun, until checked or fully introduced; shared topics get it once.
    for (const id of exam.readSummaryBeforeTopics ? order : []) {
      const topic = own.filter((card) => card.deckId === id);
      if (readingTopics.has(id) || exam.completedSummaryDeckIds?.includes(id) || !topic.some((card) => isNew(card.study))) continue;
      readingTopics.add(id);
      const day = topic.some((card) => !isNew(card.study)) ? (started ? ownDays[0] : ownDays.find((_, index) => minutes[index] > 0)) : ownDays.find((entry) => entry.blocks.some((block) => block.deckId === id && block.method === "new"));
      day?.summaries.push({ examId: exam.id, deckId: id });
    }
    let unplannedQuizzes = 0;
    if (exam.quizChaptersPerTask) {
      const quizPlanningKey = getExamQuizPlanningKey(exam, capacity);
      const chapters = order.filter((id) => (cardsByDeck.get(id)?.length ?? 0) > 0);
      for (let index = 0; index < chapters.length; index += exam.quizChaptersPerTask) {
        signal?.throwIfAborted(); await pause();
        const deckIds = chapters.slice(index, index + exam.quizChaptersPerTask);
        if (deckIds.every((id) => exam.completedQuizDeckIds?.includes(id))) continue;
        const id = getExamQuizTaskId(exam.id, deckIds);
        const frozen = options.dailyTasks?.some((task) => task.id === id && task.date === today && (!task.planningKey || task.planningKey === quizPlanningKey));
        const newCards = deckIds.flatMap((id) => cardsByDeck.get(id) ?? []).filter((card) => isNew(card.study));
        const introductions = ownDays.flatMap((day) => day.blocks.filter((block) => block.method === "new" && deckIds.includes(block.deckId)).map((block) => ({ date: day.key, cardIds: block.cardIds })));
        const introduced = new Set(introductions.flatMap((entry) => entry.cardIds));
        if (!frozen && newCards.some((card) => !introduced.has(card.cardId))) { unplannedQuizzes++; continue; }
        const after = frozen ? today : introductions.at(-1)?.date ?? today;
        const day = ownDays.find((day, index) => day.key >= after && minutes[index] > 0);
        if (day) (day.quizzes ??= []).push({ examId: exam.id, deckIds }); else unplannedQuizzes++;
      }
    }
    // The concrete assignment, including rounding and differing learning profiles, is the load later exams see.
    const projectedContacts = Float64Array.from(baseline);
    for (let start = 0; start < ownDays.length; start++) for (const block of ownDays[start].blocks.filter((entry) => entry.method === "new" && entry.examIds.includes(exam.id))) {
      const count = block.cardIds.filter((id) => !frozenIds.has(id)).length;
      if (!count) continue;
      const settings = settingsByDeck.get(block.deckId)!, cacheKey = `${start}:${JSON.stringify(settings.schedulerProfile)}`;
      const column = columnCache.get(cacheKey) ?? await simulate(createReviewState({ state: "new", reps: 0, dueAt: new Date(dayStarts[start]).toISOString() }), settings, start);
      column.contacts.forEach((value, i) => { projectedContacts[i] += value * count; });
    }
    summaries.push({ examId: exam.id, studyDays: minutes.filter((value) => value > 0).length, totalCards: own.length, remainingNewCount: own.filter((card) => isNew(card.study)).length, unscheduledNewCount: fresh.length - cursor, availableMinutes: minutes.reduce((sum, value) => sum + value, 0), current: readiness(own), issues: [
      ...(exam.deckIds.some((id) => !deckById.has(id)) ? ["Ausgewählte Stapel wurden gelöscht."] : []), ...(!own.length ? ["Keine lernbaren Karten ausgewählt."] : []),
      ...(fresh.length && !eligible.length ? [cutoff < civilToday ? `${fresh.length} neue Karten sind nach dem Einführungsstichtag noch offen.` : "Wähle mindestens einen Lerntag vor dem Einführungsstichtag."] : []),
      ...(cursor < fresh.length && eligible.length ? [`${fresh.length - cursor} neue Karten sind wegen ihrer gewünschten Themenstarttage noch offen.`] : []),
      ...(unplannedQuizzes ? [`${unplannedQuizzes} ${unplannedQuizzes === 1 ? "Quizaufgabe ist" : "Quizaufgaben sind"} noch nicht eingeplant.`] : []),
      ...overloadIssue(ownDays.filter((day, i) => isExamDayOverloaded(day.blocks.filter((block) => block.method === "new" && block.examIds.includes(exam.id)).reduce((sum, block) => sum + block.cardIds.length, 0), minutes[i])).length),
    ], decks: order.map((id) => { const selected = cardsByDeck.get(id) ?? []; return { deckId: id, name: deckById.get(id)!.name, total: selected.length, known: selected.filter((card) => !isNew(card.study)).length }; }) });
    projectedContacts.forEach((value, i) => { plannedContacts[i] += value; });
    function record(day: ExamPlanDay, card: CardStudySnapshot, method: ExamStudyMethod) {
      const index = recorded.get(day)!, key = JSON.stringify([card.deckId, method, card.cardId]);
      if (index.blocks.has(key)) return;
      let block = day.blocks.find((entry) => entry.deckId === card.deckId && entry.method === method && entry.examIds[0] === exam.id);
      if (!block) { block = { id: `${day.key}:${exam.id}:${method}:${card.deckId}`, date: day.key, examIds: [exam.id], deckId: card.deckId, method, expectedItems: 0, cardIds: [] }; day.blocks.push(block); }
      block.cardIds.push(card.cardId); block.expectedItems++;
      index.blocks.set(key, block);
      if (method === "new") { if (!index.newCards.has(card.cardId)) { index.newCards.add(card.cardId); day.newCardIds.push(card.cardId); } }
      else if (!index.reviews.has(card.cardId)) { index.reviews.add(card.cardId); day.reviewCardIds.push(card.cardId); }
    }
  }
  return { days, exams: summaries };
}
function overloadIssue(days: number) {
  return days ? [`An ${days} ${days === 1 ? "Tag" : "Tagen"} sind mehr als ${EXAM_NEW_CARDS_PER_MINUTE_LIMIT} neue Karten pro Minute Lernzeit eingeplant.`] : [];
}
export function getExamSessionCardIds(day: ExamPlanDay, blockId: string | null = null): string[] {
  if (blockId?.startsWith("topic:")) return [...new Set(day.blocks.flatMap((block) => block.examIds.some((id) => blockId === examTopicId(id, block.deckId)) ? block.cardIds : []))];
  return [...new Set(day.blocks.filter((block) => !blockId || block.id === blockId).flatMap((block) => block.cardIds))];
}
function examTopicId(examId: string, deckId: string) { return `topic:${encodeURIComponent(examId)}:${encodeURIComponent(deckId)}`; }
export function getExamTopicTasks(day: ExamPlanDay, examId: string): StudyPlanBlock[] {
  const tasks = new Map<string, StudyPlanBlock>();
  for (const block of day.blocks.filter((entry) => entry.examIds.includes(examId))) {
    const task = tasks.get(block.deckId);
    if (task) { task.expectedItems += block.expectedItems; task.cardIds = [...new Set([...task.cardIds, ...block.cardIds])]; if (block.method === "new") task.method = "new"; }
    else tasks.set(block.deckId, { ...block, id: examTopicId(examId, block.deckId), cardIds: [...block.cardIds] });
  }
  return [...tasks.values()];
}
export function getActiveExamDeckIds(decks: readonly Deck[], exams: readonly ExamPlan[], civilToday: string): string[] {
  const available = new Set(decks.filter((deck) => !deck.deletedAt).map((deck) => deck.id));
  return [...new Set(exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday).flatMap((exam) => [...getExamDeckIds(decks, exam)]))].filter((id) => available.has(id));
}
export function createExamSessionDecks(decks: readonly Deck[], cards: readonly Card[], exams: readonly ExamPlan[], todayKey: string): Deck[] {
  const root = createCoreDeck({ id: EXAM_SESSION_DECK_ID, name: "Heutige Einheit", createdAt: todayKey, updatedAt: todayKey });
  const session: Deck[] = [{ ...root, plannedOrder: true, deckSettings: getExamStudySettings(root.deckSettings, root.deckSettings.schedulerProfile.desiredRetention, false) }];
  const selected = new Set(cards.map((card) => card.deckId));
  const order = [...new Set(exams.filter((exam) => exam.status === "active" && exam.examDate > todayKey).slice().sort((a, b) => a.examDate.localeCompare(b.examDate)).flatMap((exam) => getExamTopicOrder(decks, exam)))].filter((id) => selected.has(id));
  for (const id of order) { const deck = decks.find((entry) => entry.id === id); if (deck) session.push({ ...deck, parentDeckId: EXAM_SESSION_DECK_ID, cards: cards.filter((card) => card.deckId === id), reviewEvents: [], deckSettings: getExamSessionDeckSettings(decks, deck, exams, todayKey) }); }
  return session;
}
export function getExamSessionDeckSettings(decks: readonly Deck[], deck: Deck, exams: readonly ExamPlan[], todayKey: string): DeckSettings {
  const owners = exams.filter((exam) => exam.status === "active" && exam.examDate > todayKey && getExamDeckIds(decks, exam).has(deck.id));
  return owners.length ? getExamStudySettings(deck.deckSettings, Math.max(...owners.map((exam) => exam.desiredRetention)), owners.some((exam) => exam.variants)) : deck.deckSettings;
}
