import assert from "node:assert/strict";
import test from "node:test";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import { createCoreDeck } from "./coreModel.ts";
import type { ExamPlan } from "./coreTypes.ts";
import { createExamPlan, createStudyTimeCapacity } from "./examPlanSettings.ts";
import {
  EXAM_MODEL,
  createExamPortfolioForecast,
  estimateExamHistory,
  getExamCurrentProgress,
  getExamSessionCardIds,
  getExamSessionDeckSettings,
  getExamDayCapacity,
  getExamTopicTasks,
  type ExamHistory,
} from "./examPlanning.ts";
import { getLearningDayKey } from "./learningDay.ts";
import { getGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { scheduleWithFsrs } from "./scheduler.ts";
import type { AccountStatisticsSnapshot } from "./workspaceReplica.ts";

const now = "2026-10-08T08:00:00.000Z";
const timeZone = "Europe/Berlin";
const preferences = getGlobalSchedulerPreferences({});
const capacity = { ...createStudyTimeCapacity(), weekdayMinutes: 15, weekendMinutes: 15, weekdays: Array(7).fill(true), reserveFraction: 0 };
const history: ExamHistory = { timing: { new: { seconds: 60, samples: 0 }, review: { seconds: 20, samples: 0 }, relearning: { seconds: 30, samples: 0 }, variant: { seconds: 30, samples: 0 } }, againShare: 0, ratingSamples: 0, spentTodayMinutes: 0 };
const options = { now, preferences, timeZone, capacity, history };
const decks = [createCoreDeck({ id: "root", name: "Prüfung" }), createCoreDeck({ id: "chapter-b", name: "B", parentDeckId: "root" }), createCoreDeck({ id: "chapter-a", name: "A", parentDeckId: "root" })];

function card(index: number, patch: Partial<CardStudySnapshot> & { study?: Partial<CardStudySnapshot["study"]> } = {}): CardStudySnapshot {
  return {
    cardId: `card-${String(index).padStart(3, "0")}`, deckId: "root", noteId: `note-${index}`, status: "active", studyRevision: 0, activeVariantCount: 0,
    createdAt: `2026-10-01T08:${String(index % 60).padStart(2, "0")}:00.000Z`, maturityXp: 0, ...patch,
    study: { state: "new", dueAt: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, intervalDays: 0, learningStepIndex: 0, lastReviewedAt: null, lastRating: null, ...patch.study },
  };
}
const cards = (count: number, patch: Partial<CardStudySnapshot> = {}) => Array.from({ length: count }, (_, index) => card(index, patch));
const reviewed = { state: "review" as const, reps: 10, lapses: 0, intervalDays: 3, learningStepIndex: 0, dueAt: now, stability: 3, difficulty: 5, lastReviewedAt: "2026-10-05T08:00:00.000Z", lastRating: "good" as const };
function plan(patch: Partial<ExamPlan> = {}): ExamPlan {
  return { ...createExamPlan("2026-10-08", ["root"]), name: "Prüfung", ...patch };
}

test("neuer Stoff kommt früh, Wiederholungen verbrauchen Budget und Puffertage nehmen nur Wiederholungen", async () => {
  const input = cards(200), original = JSON.stringify(input);
  const forecast = await createExamPortfolioForecast(decks, input, [plan()], options);
  const [first] = forecast.days;
  assert.ok(first.newCardIds.length > 0);
  assert.ok(first.reviewCount > 0, "erste Lernschritte zählen mit");
  assert.equal(forecast.days.slice(-3).every((day) => day.buffer && day.newCardIds.length === 0), true);
  assert.equal(forecast.days.some((day) => day.key === "2026-11-19"), false, "der Prüfungstag bleibt frei");
  for (const day of forecast.days) assert.ok(day.newMinutes + day.reviewMinutes <= day.budgetMinutes + 0.001);
  assert.equal(JSON.stringify(input), original, "die Prognose verändert keine Lernstände");
});

test("eine gelernte Karte folgt den Intervallen des Schedulers", async () => {
  const config = plan({ bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, [card(0, { study: reviewed })], [config], options);
  const reviewedDays = forecast.days.filter((day) => day.reviewCardIds.includes("card-000"));
  const firstState = scheduleWithFsrs({ ...reviewed }, "good", { now, timeZone, dayStartHour: 0, deckSettings: getExamSessionDeckSettings(decks[0], [config], "2026-10-08") });
  assert.equal(reviewedDays[0].key, "2026-10-08");
  assert.equal(reviewedDays[1].key, getLearningDayKey(firstState.dueAt, { timeZone }));
  assert.ok(reviewedDays.length < forecast.days.length / 2);
  assert.equal(forecast.exams[0].feasible, true);
});

test("knappes Budget nimmt fällige Wiederholungen zuerst und meldet nicht eingeplante neue Karten", async () => {
  const forecast = await createExamPortfolioForecast(decks, [card(0, { study: reviewed }), ...cards(100).slice(1)], [plan()], { ...options, capacity: { ...capacity, weekdayMinutes: 1, weekendMinutes: 1 } });
  assert.ok(forecast.days[0].reviewCardIds.includes("card-000"));
  assert.equal(forecast.days[0].newCardIds.length, 0);
  assert.equal(forecast.exams[0].feasible, false);
  assert.ok(forecast.exams[0].unscheduledNewCount > 0);
  assert.match(forecast.exams[0].issues.join(" "), /neue Karten passen nicht/);
});

test("freie Wochentage bleiben auch über den Wechsel zur Winterzeit frei", async () => {
  const forecast = await createExamPortfolioForecast(decks, cards(80), [plan()], { ...options, capacity: { ...capacity, weekdays: [true, true, true, true, true, false, false] }, preferences: { ...preferences, dayStartHour: 3 } });
  assert.equal(forecast.days.length, 42);
  for (const day of forecast.days.filter((entry) => [0, 6].includes(new Date(`${entry.key}T12:00:00Z`).getUTCDay()))) {
    assert.equal(day.budgetMinutes, 0);
    assert.equal(day.reviewCount + day.newCardIds.length, 0);
  }
});

test("neue Karten folgen der Kapitelreihenfolge des Stapelbaums, darin der Erstellreihenfolge", async () => {
  const input = [card(1, { deckId: "chapter-b" }), card(2, { deckId: "chapter-a", createdAt: "2026-10-03T08:00:00.000Z" }), card(3, { deckId: "chapter-a", createdAt: "2026-10-02T08:00:00.000Z" }), card(4)];
  const forecast = await createExamPortfolioForecast(decks, input, [plan({ deckIds: ["root", "chapter-a", "chapter-b"] })], { ...options, capacity: { ...capacity, weekdayMinutes: 60, weekendMinutes: 60 } });
  assert.deepEqual(forecast.days[0].newCardIds, ["card-004", "card-003", "card-002", "card-001"]);
});

test("mehrere Prüfungen teilen Minuten und gemeinsame Karten ohne doppelte Arbeit", async () => {
  const a = plan({ id: "a", bufferDays: 0 }), b = plan({ id: "b", examDate: "2026-11-25", bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, cards(25), [a, b], { ...options, capacity: { ...capacity, reserveFraction: 0.15 } });
  const [first] = forecast.days;
  assert.equal(new Set(first.newCardIds).size, first.newCardIds.length);
  assert.ok(first.blocks.some((block) => block.examIds.length === 2));
  assert.ok(first.newMinutes + first.reviewMinutes <= first.budgetMinutes * 0.85 + 0.001);
  const allocated = forecast.exams.reduce((sum, exam) => sum + exam.allocatedMinutes, 0);
  assert.ok(Math.abs(allocated - forecast.days.reduce((sum, day) => sum + day.newMinutes + day.reviewMinutes, 0)) < 0.001);
});

test("Priorität und Termin bestimmen die neuen Karten; überfällige Wiederholungen behalten Vorrang", async () => {
  const input = [...cards(50), ...cards(50, { deckId: "chapter-a" }).map((entry, index) => ({ ...entry, cardId: `other-${index}` }))];
  input[50] = { ...input[50], study: { ...input[50].study, ...reviewed } };
  const a = plan({ id: "a", examDate: "2026-10-20", bufferDays: 0 }), b = plan({ id: "b", deckIds: ["chapter-a"], examDate: "2026-11-20", bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, input, [b, a], options);
  assert.ok(forecast.days[0].reviewCardIds.includes("other-0"));
  assert.ok(forecast.days[0].newCardIds.every((id) => id.startsWith("card-")), "der nähere Termin führt");
  const urgent = await createExamPortfolioForecast(decks, input, [{ ...b, priority: "high" }, a], options);
  assert.ok(urgent.days[0].newCardIds.every((id) => id.startsWith("other-")), "hohe Priorität führt");
});

test("pausierte und abgeschlossene Prüfungen buchen keine Arbeit, behalten aber ihren Lernstand", async () => {
  const input = [card(0, { study: reviewed }), ...cards(5).slice(1)];
  const forecast = await createExamPortfolioForecast(decks, input, [plan({ status: "paused" }), plan({ status: "completed" })], options);
  assert.deepEqual(forecast.days, []);
  const progress = getExamCurrentProgress(input, plan({ status: "paused" }), now, timeZone);
  assert.equal(progress.totalCards, 5);
  assert.equal(progress.coverage, 0.2);
});

test("Varianten zählen als eigene Methode und lassen sich je Prüfung abschalten", async () => {
  const variantDeck = createCoreDeck({ id: "root", name: "Prüfung", deckSettings: { coreMode: "on" } });
  const input = [card(0, { study: reviewed, activeVariantCount: 1, maturityXp: 500 })];
  const withVariants = await createExamPortfolioForecast([variantDeck], input, [plan({ bufferDays: 0 })], options);
  assert.equal(withVariants.days[0].blocks[0].method, "variant");
  const without = await createExamPortfolioForecast([variantDeck], input, [plan({ bufferDays: 0, variants: false })], options);
  assert.equal(without.days[0].blocks[0].method, "review");
});

test("Sitzungen lernen genau die Karten des Tages oder eines Blocks mit dem strengsten Retentionsziel", async () => {
  const forecast = await createExamPortfolioForecast(decks, cards(30), [plan()], options);
  const [day] = forecast.days, block = day.blocks.at(-1)!;
  assert.deepEqual(getExamSessionCardIds(day).sort(), [...new Set(day.blocks.flatMap((entry) => entry.cardIds))].sort());
  assert.deepEqual(getExamSessionCardIds(day, block.id), block.cardIds);
  const settings = getExamSessionDeckSettings(decks[0], [plan({ desiredRetention: 0.95 }), plan({ desiredRetention: 0.85 }), plan({ desiredRetention: 0.97, examDate: "2026-10-08" })], "2026-10-08");
  assert.equal(settings.schedulerProfile.desiredRetention, 0.95, "vergangene Prüfungen heben die Retention nicht mehr an");
  assert.equal(settings.newCardsPerDay, EXAM_MODEL.maxNewPerDay);
  assert.equal(decks[0].deckSettings.schedulerProfile.desiredRetention, 0.9, "die Stapeleinstellungen bleiben unverändert");
  assert.equal(getExamSessionDeckSettings(decks[1], [plan()], "2026-10-08"), decks[1].deckSettings);
});

test("Zeiten und Fehlerquote kommen aus den Statistik-Rollups, mit Standardwerten bei wenig Daten", () => {
  const day = { total: 40, learning: 10, relearning: 2, young: 20, mature: 8, successful: 30, timedCount: 20, durationMs: 600_000, durationLearningMs: 150_000, durationRelearningMs: 20_000, durationYoungMs: 200_000, durationMatureMs: 80_000 };
  const statistics = { reviewsByDay: { "2026-10-07": day, "2026-10-08": { ...day, durationMs: 300_000 } } } as unknown as AccountStatisticsSnapshot;
  const estimate = estimateExamHistory(statistics, "2026-10-08");
  assert.deepEqual(estimate.timing.new, { seconds: 30, samples: 10 }, "nur der gestoppte Anteil zählt");
  assert.deepEqual(estimate.timing.review, { seconds: 20, samples: 28 });
  assert.equal(estimate.timing.relearning.seconds, EXAM_MODEL.defaultSeconds.relearning);
  assert.equal(estimate.againShare, 0.25);
  assert.equal(estimate.spentTodayMinutes, 5);
  assert.deepEqual(estimateExamHistory(null, "2026-10-08").timing.new, { seconds: EXAM_MODEL.defaultSeconds.new, samples: 0 });
});

test("der Sitzungsstart plant nur heute und erhält dabei denselben Tag", async () => {
  const input = [card(0, { study: reviewed }), ...cards(120).slice(1)];
  const exam = plan();
  const full = await createExamPortfolioForecast(decks, input, [exam], options);
  const today = await createExamPortfolioForecast(decks, input, [exam], { ...options, todayOnly: true });
  assert.equal(today.days.length, 1);
  assert.deepEqual(today.days[0], full.days[0]);
  assert.equal(today.exams[0].requiredMinutes, today.exams[0].allocatedMinutes, "ohne Aufwandsschätzung über alle Tage");
});

test("heute schon gelernte Minuten verringern das heutige Budget", async () => {
  const spent = await createExamPortfolioForecast(decks, cards(100), [plan()], { ...options, history: { ...history, spentTodayMinutes: 15 } });
  assert.equal(spent.days[0].newCardIds.length + spent.days[0].reviewCount, 0);
  assert.ok(spent.days[1].newCardIds.length > 0);
});

test("eine abgebrochene Berechnung endet sichtbar", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(createExamPortfolioForecast(decks, cards(10), [plan()], { ...options, signal: controller.signal }), /abort/i);
});


test("individuelle Wochenzeiten, Tagesausnahmen und feste Blöcke bestimmen das Budget", () => {
  const custom = { ...capacity, weeklyMinutes: [180, 240, 60, 120, 0, 0, 0], weekdays: Array(7).fill(true) };
  assert.equal(getExamDayCapacity("2026-10-12", custom), 180);
  assert.equal(getExamDayCapacity("2026-10-13", custom), 240);
  const changed = { ...custom, dateOverrides: [{ date: "2026-10-12", minutes: 45 }] };
  assert.equal(getExamDayCapacity("2026-10-12", changed), 45);
  assert.equal(getExamDayCapacity("2026-10-12", { ...changed, timeBlocks: [{ id: "x", examId: "a", date: "2026-10-12", start: 480, end: 660 }] }), 180);
});

test("das nächste Thema wird nicht in den Rest des Tages zerschnitten", async () => {
  const input = [...cards(3, { deckId: "chapter-a" }), ...cards(3, { deckId: "chapter-b" }).map((value) => ({ ...value, cardId: value.cardId + "b" }))];
  const forecast = await createExamPortfolioForecast(decks, input, [plan({ deckIds: ["chapter-a", "chapter-b"], bufferDays: 0 })], { ...options, capacity: { ...capacity, weekdayMinutes: 7, weekendMinutes: 7 } });
  assert.equal(forecast.days[0].newCardIds.length, 3);
  assert.equal(forecast.days[0].blocks.filter((block) => block.method === "new").every((block) => block.deckId === "chapter-a"), true);
  assert.equal(forecast.days[1].newCardIds.length, 3);
  assert.equal(forecast.days[1].blocks.filter((block) => block.method === "new").every((block) => block.deckId === "chapter-b"), true);
});

test("Thementage ändern die Einführung, Wiederholungen bleiben fällig", async () => {
  const input = [card(1, { deckId: "chapter-a" }), card(2, { deckId: "chapter-b" }), card(3, { deckId: "chapter-a", study: reviewed })];
  const exam = plan({ deckIds: ["chapter-a", "chapter-b"], topicDates: [{ deckId: "chapter-a", date: "2026-10-10" }] });
  const forecast = await createExamPortfolioForecast(decks, input, [exam], options);
  assert.deepEqual(forecast.days[0].newCardIds, ["card-002"]);
  assert.ok(forecast.days[0].reviewCardIds.includes("card-003"));
  assert.ok(forecast.days.find((day) => day.key === "2026-10-10")!.newCardIds.includes("card-001"));
});

test("reservierte Zeit ist nur für die zugeordnete Prüfung verfügbar und bleibt im Budget", async () => {
  const a = plan({ id: "a", deckIds: ["chapter-a"] }), b = plan({ id: "b", deckIds: ["chapter-b"] });
  const input = [...cards(5, { deckId: "chapter-a" }), ...cards(5, { deckId: "chapter-b" }).map((value) => ({ ...value, cardId: value.cardId + "b" }))];
  const settings = { ...capacity, timeBlocks: [{ id: "block", date: "2026-10-08", start: 480, end: 495, examId: "a" }] };
  const forecast = await createExamPortfolioForecast(decks, input, [a, b], { ...options, capacity: settings });
  assert.equal(forecast.days[0].blocks.every((block) => block.examIds.includes("a")), true);
  assert.ok(forecast.days[1].blocks.some((block) => block.examIds.includes("b")));
  assert.ok(forecast.days[0].newMinutes + forecast.days[0].reviewMinutes <= 15);
  const quick = await createExamPortfolioForecast(decks, input, [a, b], { ...options, capacity: settings, todayOnly: true });
  assert.deepEqual(quick.days[0], forecast.days[0]);
});


test("nach einem vollen Themenbudget bleibt die reservierte Zeit anderer Prüfungen nutzbar", async () => {
  const a = plan({ id: "a", deckIds: ["root", "chapter-a"] }), b = plan({ id: "b", deckIds: ["chapter-b"] });
  const input = [card(100), ...cards(20, { deckId: "chapter-a" }), ...cards(3, { deckId: "chapter-b" }).map((value) => ({ ...value, cardId: value.cardId + "b" }))];
  const timeBlocks = [{ id: "a", examId: "a", date: "2026-10-08", start: 480, end: 490 }, { id: "b", examId: "b", date: "2026-10-08", start: 490, end: 500 }];
  const forecast = await createExamPortfolioForecast(decks, input, [a, b], { ...options, capacity: { ...capacity, timeBlocks } });
  assert.ok(forecast.days[0].blocks.some((block) => block.examIds.includes("a")));
  assert.ok(forecast.days[0].blocks.some((block) => block.examIds.includes("b")));
  const tasks = getExamTopicTasks(forecast.days[0], "b");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].cardIds.length, 3);
  assert.deepEqual(getExamSessionCardIds(forecast.days[0], tasks[0].id), tasks[0].cardIds);
  assert.deepEqual(getExamSessionCardIds(forecast.days[0], "topic:missing:missing"), []);
});


test("unzugeordnete Lernzeit ist gemeinsam verfügbar, die Fachzuordnung reserviert sie", async () => {
  const a = plan({ id: "a", deckIds: ["chapter-a"] }), b = plan({ id: "b", deckIds: ["chapter-b"] });
  const input = [...cards(5, { deckId: "chapter-a" }), ...cards(5, { deckId: "chapter-b" }).map((value) => ({ ...value, cardId: value.cardId + "b" }))];
  const block = { id: "free", date: "2026-10-08", start: 780, end: 810, examId: null };
  const shared = await createExamPortfolioForecast(decks, input, [a, b], { ...options, capacity: { ...capacity, timeBlocks: [block] }, todayOnly: true });
  assert.ok(shared.days[0].blocks.some((entry) => entry.examIds.includes("a")));
  assert.ok(shared.days[0].blocks.some((entry) => entry.examIds.includes("b")));
  assert.ok(shared.days[0].newMinutes + shared.days[0].reviewMinutes <= 30);
  const assigned = await createExamPortfolioForecast(decks, input, [a, b], { ...options, capacity: { ...capacity, timeBlocks: [{ ...block, examId: "a" }] }, todayOnly: true });
  assert.ok(assigned.days[0].blocks.length > 0);
  assert.ok(assigned.days[0].blocks.every((entry) => entry.examIds.includes("a")));
});
