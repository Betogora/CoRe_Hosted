import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import { createExamPlan, createStudyTimeCapacity, validateExamPlanningSettings, normalizeExamPlanningSettings, removeExamPlan, upsertExamPlan } from "./examPlanSettings.ts";
import { getExamQuizDeckIds, reconcileExamDailyTasks, setExamDailyTaskChecked } from "./examDailyTasks.ts";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { estimateExamHistory, type ExamPortfolioForecast } from "./examPlanning.ts";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { ExamPlanningSettings } from "./coreTypes.ts";

const now = "2026-10-20T12:00:00.000Z", date = "2026-10-20";
const made = createBasicNote("heart", "Frage", "Antwort", { createdAt: now });
const { extra: _extra, ...study } = made.cards[0].study;
const card: CardStudySnapshot = { cardId: made.cards[0].id, deckId: "heart", noteId: made.note.id, status: "active", study, studyRevision: 0, activeVariantCount: 0, createdAt: now, maturityXp: 0 };
const decks = [createCoreDeck({ id: "root", name: "Anatomie" }), ...["heart", "lung", "kidney", "brain"].map((id) => createCoreDeck({ id, name: id, parentDeckId: "root" }))];
const exam = { ...createExamPlan(date, decks.map((deck) => deck.id)), id: "exam", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-30" };
const settings: ExamPlanningSettings = { version: 1, exams: [exam], capacity: { ...createStudyTimeCapacity(), weekdays: Array(7).fill(true) } };
const forecast: ExamPortfolioForecast = { days: [{ key: date, budgetMinutes: 60, spentMinutes: 0, newMinutes: 1, reviewMinutes: 0, newCardIds: [card.cardId], reviewCardIds: [], reviewCount: 0, backlogCount: 0, buffer: false, blocks: [{ id: "new", date, deckId: "heart", examIds: [exam.id], method: "new", plannedMinutes: 1, expectedItems: 1, priority: 1, cardIds: [card.cardId] }] }], exams: [{ examId: exam.id, decks: decks.slice(1).map((deck) => ({ deckId: deck.id, name: deck.name, known: 0, total: 1, security: null })), usableDays: 10, totalCards: 4, remainingNewCount: 4, unscheduledNewCount: 0, overdueReviewCount: 0, requiredMinutes: 10, availableMinutes: 60, allocatedMinutes: 10, current: { coverage: 0, consolidated: 0, security: null, achievement: 0 }, predicted: { coverage: 1, consolidated: 1, security: 1, achievement: 1 }, feasible: true, issues: [] }], uncertainty: "high", timing: estimateExamHistory(null, date).timing };
const reconcile = (saved = settings, cards = [card], plan = forecast, at = now) => reconcileExamDailyTasks(saved, decks, plan, cards, at, "Europe/Berlin", 4);

test("Tagesziele bleiben bei Neuberechnung erhalten, Themenquizze bündeln verwandte Stapel", () => {
  const tasks = reconcile();
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, "topic:exam:heart");
  assert.deepEqual(tasks[1].deckIds, ["heart", "lung", "kidney"]);
  assert.deepEqual(getExamQuizDeckIds(exam, decks, forecast, "2026-10-23"), ["brain"]);
  const empty = { ...forecast, days: [{ ...forecast.days[0], blocks: [] }] };
  assert.deepEqual(reconcile({ ...settings, dailyTasks: tasks }, [card], empty), tasks);
});

test("nur tatsächlich abgeschlossene Karten haken automatisch ab; Lernschritte und fehlende Daten bleiben offen", () => {
  const tasks = reconcile();
  const saved = { ...settings, dailyTasks: tasks };
  const done = { ...card, studyRevision: 3, study: { ...study, state: "review" as const, lastReviewedAt: "2026-10-20T12:10:00.000Z", dueAt: "2026-10-22T08:00:00.000Z" } };
  const after = "2026-10-20T12:11:00.000Z";
  assert.equal(reconcile(saved, [done], forecast, after)[0].completed, "automatic");
  for (const candidate of [card, { ...done, study: { ...done.study, state: "learning" as const } }, { ...done, study: { ...done.study, dueAt: "2026-10-20T13:00:00.000Z" } }, { ...done, study: { ...done.study, lastReviewedAt: "2026-10-19T12:10:00.000Z" } }]) assert.equal(reconcile(saved, [candidate], forecast, after)[0].completed, null);
  assert.equal(reconcile(saved, [], forecast, after)[0].completed, null);
  const automatic = reconcile(saved, [done], forecast, after);
  assert.equal(reconcile({ ...settings, dailyTasks: automatic }, [card], forecast, after)[0].completed, null, "Rückgängig im Lernstand öffnet die Aufgabe erneut");
});

test("manuelle Häkchen sind widerrufbar und verändern keine Karten; ein neuer Lerntag setzt die Liste zurück", () => {
  const tasks = reconcile();
  const checked = setExamDailyTaskChecked(tasks, tasks[0].id, true);
  assert.equal(reconcile({ ...settings, dailyTasks: checked })[0].completed, "manual");
  assert.equal(setExamDailyTaskChecked(checked, tasks[0].id, false)[0].completed, null);
  assert.equal(card.studyRevision, 0);
  const next = { ...forecast, days: [{ ...forecast.days[0], key: "2026-10-21" }] };
  const nextTasks = reconcile({ ...settings, dailyTasks: checked }, [card], next, "2026-10-21T12:00:00.000Z");
  assert.ok(nextTasks.every((task) => task.date === "2026-10-21" && task.completed === null));
});

test("Checkliste bleibt im Profil erhalten, wird bei Scopeänderung bereinigt und strikt validiert", () => {
  const saved = validateExamPlanningSettings({ ...settings, dailyTasks: reconcile() });
  assert.deepEqual(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: saved })).examPlanning.dailyTasks, saved.dailyTasks);
  assert.deepEqual(removeExamPlan(saved, exam.id).dailyTasks, []);
  assert.deepEqual(upsertExamPlan(saved, { ...exam, deckIds: ["root"] }).dailyTasks, []);
  const task = saved.dailyTasks![0];
  for (const invalid of [[task, task], [{ ...task, examId: "other" }], [{ ...task, id: "arbitrary" }], [{ ...task, cardIds: ["x", "x"] }], [{ ...task, completed: "done" }]]) assert.throws(() => validateExamPlanningSettings({ ...settings, dailyTasks: invalid }));
  assert.deepEqual(normalizeExamPlanningSettings({ ...settings, dailyTasks: [{ ...task, completed: "done" }] }).exams, [exam]);
});


test("vor der Lerntagsgrenze bleibt die Checkliste erhalten und Teilfortschritt hakt nicht vorzeitig ab", () => {
  const tasks = reconcile();
  const second = { ...card, cardId: "second" };
  tasks[0] = { ...tasks[0], cardIds: [card.cardId, second.cardId] };
  const done = { ...card, study: { ...study, state: "review" as const, lastReviewedAt: "2026-10-21T00:00:00.000Z", dueAt: "2026-10-22T08:00:00.000Z" } };
  const at = "2026-10-21T00:30:00.000Z";
  assert.equal(reconcile({ ...settings, dailyTasks: tasks }, [done, second], forecast, at)[0].completed, null);
  const both = reconcile({ ...settings, dailyTasks: tasks }, [done, { ...done, cardId: second.cardId }], forecast, at);
  assert.equal(both[0].completed, "automatic");
  assert.equal(both[0].date, date);
});
