import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { ExamPlan } from "./coreTypes.ts";
import { createExamPlan, createStudyTimeCapacity } from "./examPlanSettings.ts";
import { createExamPortfolioForecast, createExamSessionDecks, getExamCurrentProgress, getExamLastNewDate, getExamPlanningKey, getExamSessionCardIds, getExamSessionDeckSettings, getExamStudyMinutes, getExamTopicOrder, getExamTopicTasks, shiftExamDay } from "./examPlanning.ts";
import { createDailyReviewQueue } from "./reviewService.ts";
import { getGlobalSchedulerPreferences } from "./learningProfiles.ts";

const now = "2026-10-20T08:00:00.000Z", date = "2026-10-20";
const preferences = getGlobalSchedulerPreferences({});
const capacity = createStudyTimeCapacity();
const options = { now, preferences, timeZone: "UTC", capacity, history: { ratings: {} } };
const decks = [createCoreDeck({ id: "root", name: "Prüfung" }), createCoreDeck({ id: "b", name: "B", parentDeckId: "root" }), createCoreDeck({ id: "a", name: "A", parentDeckId: "root" })];
function plan(patch: Partial<ExamPlan> = {}): ExamPlan {
  return { ...createExamPlan(date, ["root"]), id: "exam", name: "Prüfung", examDate: shiftExamDay(date, 20), studyTime: { dailyMinutes: 20, weekdays: Array(7).fill(true), dateOverrides: [] }, ...patch };
}
function card(index: number, deckId = "root", known = false): CardStudySnapshot {
  return { cardId: `card-${String(index).padStart(5, "0")}`, noteId: `note-${index}`, deckId, status: "active", studyRevision: 0, activeVariantCount: 0, maturityXp: 0, createdAt: "2026-10-01T08:00:00.000Z",
    study: { state: known ? "review" : "new", dueAt: now, stability: known ? 3 : 0, difficulty: 5, reps: known ? 10 : 0, lapses: 0, intervalDays: known ? 3 : 0, learningStepIndex: 0, lastReviewedAt: known ? "2026-10-17T08:00:00.000Z" : null, lastRating: known ? "good" : null } };
}
const cards = (count: number, deckId = "root") => Array.from({ length: count }, (_, i) => card(i, deckId));
const forecast = (input = cards(1000), exam = plan(), extra = {}) => createExamPortfolioForecast(decks, input, [exam], { ...options, ...extra });

test("1000 neue Karten werden vollständig und ohne Zeitkapazität bis zum Stichtag verteilt", async () => {
  const input = cards(1000), original = JSON.stringify(input), exam = plan({ examDate: shiftExamDay(date, 90) });
  const result = await forecast(input, exam);
  const ids = result.days.flatMap((day) => day.newCardIds);
  assert.equal(ids.length, 1000); assert.equal(new Set(ids).size, 1000);
  assert.equal(result.exams[0].unscheduledNewCount, 0);
  assert.ok(result.days.filter((day) => day.key > getExamLastNewDate(exam)).every((day) => !day.newCardIds.length));
  const counts = result.days.map((day) => day.newCardIds.length);
  assert.ok(counts.slice(0, 14).reduce((a, b) => a + b) > counts.slice(73, 87).reduce((a, b) => a + b), counts.join(","));
  assert.equal(JSON.stringify(input), original);
  assert.ok(result.days.slice(1).every((day) => day.reviewCount === 0), "hypothetische Wiederholungen erscheinen nicht als zukünftige Aufgaben");
});
test("selbst 6000 Karten an einem einzigen Tag bleiben planbar", async () => {
  const exam = plan({ examDate: shiftExamDay(date, 1), bufferDays: 0, studyTime: { dailyMinutes: 1, weekdays: Array(7).fill(true), dateOverrides: [] } });
  const result = await forecast(cards(6000), exam);
  assert.equal(result.days[0].newCardIds.length, 6000); assert.equal(result.exams[0].unscheduledNewCount, 0);
});
test("proportional skalierte Stunden verändern die Verteilung nicht", async () => {
  const exam = plan(), input = cards(400);
  const first = await forecast(input, exam);
  const second = await forecast(input, { ...exam, studyTime: { ...exam.studyTime!, dailyMinutes: 200 } });
  assert.deepEqual(first.days.map((day) => day.newCardIds), second.days.map((day) => day.newCardIds));
});
test("gespeicherte Tagesziele bleiben auch in der gesamten Kalenderplanung stabil", async () => {
  const exam = plan(), input = cards(200), first = await forecast(input, exam), target = first.days[0].newCardIds;
  const dailyTasks = [{ id: `topic:${exam.id}:root`, date, examId: exam.id, kind: "study" as const, deckIds: ["root"], cardIds: target, capturedAt: now, completed: null, planningKey: getExamPlanningKey(exam, capacity) }];
  const second = await forecast(input, exam, { dailyTasks });
  assert.deepEqual(second.days[0].newCardIds, target);
  assert.equal(second.days.flatMap((day) => day.newCardIds).length, 200);
  assert.ok(second.exams[0].projectedContacts!.every(Number.isFinite));
});
test("sechs und drei Stunden ergeben bei gleicher Kontaktfolge das Verhältnis zwei zu eins", async () => {
  const exam = plan({ examDate: shiftExamDay(date, 2), bufferDays: 0 });
  const capacity = { ...options.capacity, timeBlocks: [{ id: "six", date, start: 480, end: 840, examId: exam.id }, { id: "three", date: shiftExamDay(date, 1), start: 480, end: 660, examId: exam.id }] };
  const result = await forecast(cards(600), exam, { capacity });
  assert.equal(result.days[0].newCardIds.length, 400);
  assert.equal(result.days[1].newCardIds.length, 200);
});
test("konkrete Blöcke ersetzen nur die Zeit ihres Faches an diesem Datum", () => {
  const first = plan(), second = plan({ id: "second" }), exams = [first, second];
  const time = { ...capacity, timeBlocks: [{ id: "six", date, start: 480, end: 840, examId: first.id }] };
  assert.equal(getExamStudyMinutes(date, first, exams, time), 360);
  assert.equal(getExamStudyMinutes(date, second, exams, time), 20);
  assert.equal(getExamStudyMinutes(shiftExamDay(date, 1), first, exams, time), 20);
  const shared = { ...capacity, timeBlocks: [{ id: "shared", date, start: 480, end: 600, examId: null }] };
  assert.equal(getExamStudyMinutes(date, first, exams, shared), 60);
});
test("freie Tage, Ausnahmen und Puffer werden kalendarisch respektiert", async () => {
  const exam = plan({ studyTime: { dailyMinutes: 20, weekdays: [true, true, true, true, true, false, false], dateOverrides: [{ date: "2026-10-22", minutes: 0 }] } });
  const result = await forecast(cards(100), exam);
  assert.ok(result.days.filter((day) => [0, 6].includes(new Date(`${day.key}T12:00Z`).getUTCDay()) || day.key === "2026-10-22").every((day) => !day.newCardIds.length));
  assert.equal(getExamLastNewDate(plan({ examDate: "2026-11-20", bufferDays: 4 })), "2026-11-16");
});
test("fehlende Einführungstage und verstrichene Stichtage bleiben ausdrücklich offen", async () => {
  const exam = plan({ studyTime: { dailyMinutes: 0, weekdays: Array(7).fill(false), dateOverrides: [] } });
  const result = await forecast(cards(100), exam);
  assert.equal(result.exams[0].unscheduledNewCount, 100); assert.match(result.exams[0].issues.join(" "), /Lerntag/);
  const late = await forecast(cards(100), plan({ bufferDays: 30 }));
  assert.equal(late.exams[0].unscheduledNewCount, 100); assert.match(late.exams[0].issues.join(" "), /stichtag/i);
});
test("der kalendarische Stichtag endet auch vor der späteren Lerntagsgrenze", async () => {
  const exam = plan({ examDate: "2026-10-25", bufferDays: 4 });
  const result = await forecast(cards(100), exam, { now: "2026-10-22T02:00:00.000Z", preferences: { ...preferences, dayStartHour: 4 } });
  assert.equal(result.days[0].key, "2026-10-21");
  assert.equal(result.days.flatMap((day) => day.newCardIds).length, 0);
  assert.equal(result.exams[0].unscheduledNewCount, 100);
});
test("Themen bleiben chronologisch zusammen, große Themen dürfen über mehrere Tage laufen", async () => {
  const input = [...cards(250, "a"), ...cards(250, "b").map((entry) => ({ ...entry, cardId: `b-${entry.cardId}` }))];
  const exam = plan({ deckIds: ["a", "b"], topicOrder: ["b", "a"], readSummaryBeforeTopics: true });
  const result = await forecast(input, exam), ids = result.days.flatMap((day) => day.newCardIds);
  assert.equal(ids.length, 500); assert.ok(ids.slice(0, 250).every((id) => id.startsWith("b-")));
  assert.ok(result.days.filter((day) => day.newCardIds.some((id) => id.startsWith("b-"))).length > 1);
  assert.deepEqual(getExamTopicOrder(decks, exam), ["b", "a"]);
  assert.equal(result.days.flatMap((day) => day.summaries).length, 2);
});
test("echte Fälligkeiten bleiben ohne Zeitlimit sichtbar; bekannte Karten sind nicht erneut neu", async () => {
  const known = card(1001, "root", true), result = await forecast([...cards(50), known]);
  assert.deepEqual(result.days[0].reviewCardIds, [known.cardId]);
  assert.ok(!result.days.flatMap((day) => day.newCardIds).includes(known.cardId));
  assert.equal(result.exams[0].remainingNewCount, 50);
});
test("gemeinsame Karten werden beim Sitzungsstart nicht doppelt ausgegeben", async () => {
  const exam = plan({ examDate: shiftExamDay(date, 1), bufferDays: 0 }), input = [...cards(80), card(81, "root", true)];
  const result = await createExamPortfolioForecast(decks, input, [exam, { ...exam, id: "other" }], options), day = result.days[0];
  assert.deepEqual(day.newCardIds, input.slice(0, 80).map((entry) => entry.cardId));
  assert.deepEqual(day.reviewCardIds, [input[80].cardId]); assert.equal(day.reviewCount, 1);
  assert.equal(day.blocks.length, 2);
  for (const block of day.blocks) {
    assert.deepEqual(block.examIds, [exam.id, "other"]);
    assert.equal(block.expectedItems, block.method === "new" ? 80 : 1);
  }
  assert.deepEqual(new Set(getExamSessionCardIds(day)), new Set(input.map((entry) => entry.cardId)));
  const tasks = getExamTopicTasks(day, exam.id);
  assert.deepEqual(getExamSessionCardIds(day, tasks[0].id), tasks[0].cardIds);
});
test("eine erneute Planung verteilt nur tatsächlich noch ungesehene Karten", async () => {
  const input = cards(80), initial = await forecast(input), learned = new Set(initial.days[0].newCardIds);
  const changed = input.map((entry) => learned.has(entry.cardId) ? { ...entry, study: { ...entry.study, state: "review" as const, reps: 1, dueAt: shiftExamDay(date, 2) + "T08:00:00Z", lastRating: "good" as const, lastReviewedAt: now } } : entry);
  const result = await forecast(changed, plan(), { now: shiftExamDay(date, 1) + "T08:00:00Z" });
  assert.equal(result.days.flatMap((day) => day.newCardIds).length, 80 - learned.size);
});
test("Sitzungen erhalten geplante Reihenfolge auch über normale Tageslimits hinaus", () => {
  const own = Array.from({ length: 600 }, (_, i) => ({ ...createBasicNote(i < 300 ? "b" : "a", "F", "A", { createdAt: now }).cards[0], id: `card-${i}` }));
  const exam = plan({ deckIds: ["a", "b"], topicOrder: ["b", "a"] }), session = createExamSessionDecks(decks, own, [exam], date);
  const queue = createDailyReviewQueue(session, { deckId: "exam-session", now, timeZone: "UTC" });
  assert.equal(queue.total, 600); assert.deepEqual(queue.items.map((entry) => entry.cardId), own.map((entry) => entry.id));
  assert.equal(getExamSessionDeckSettings(decks[1], [exam], date).schedulerProfile.desiredRetention, .9);
});
test("aktueller Fortschritt unterscheidet gesehen und gefestigt ohne Prognose", () => {
  const known = { ...card(1, "root", true), maturityXp: 81 };
  assert.deepEqual(getExamCurrentProgress([known, card(2)], plan()), { totalCards: 2, coverage: .5, consolidated: .5 });
});
test("abgebrochene Planung endet sichtbar", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(forecast(cards(100), plan(), { signal: controller.signal }), /abort/i);
});
