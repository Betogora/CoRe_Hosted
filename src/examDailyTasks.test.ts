import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import { EXAM_PLANNING_LIMITS, createExamPlan, createStudyTimeCapacity, validateExamPlanningSettings, normalizeExamPlanningSettings, removeExamPlan, upsertExamPlan } from "./examPlanSettings.ts";
import { getExamSessionTargetIds, getExamSummaryTaskDeckId, reconcileExamDailyTasks, setExamDailyTaskChecked, withExamDailyTasks } from "./examDailyTasks.ts";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { type ExamPortfolioForecast } from "./examPlanning.ts";
import type { CardStudySnapshot } from "./cloudRepositoryValidation.ts";
import type { ExamPlanningSettings } from "./coreTypes.ts";

const now = "2026-10-20T12:00:00.000Z", date = "2026-10-20";
const made = createBasicNote("heart", "Frage", "Antwort", { createdAt: now });
const { extra: _extra, ...study } = made.cards[0].study;
const card: CardStudySnapshot = { cardId: made.cards[0].id, deckId: "heart", noteId: made.note.id, status: "active", study, studyRevision: 0, activeVariantCount: 0, createdAt: now, maturityXp: 0 };
const decks = [createCoreDeck({ id: "root", name: "Anatomie" }), ...["heart", "lung", "kidney", "brain"].map((id) => createCoreDeck({ id, name: id, parentDeckId: "root" }))];
const exam = { ...createExamPlan(date, decks.map((deck) => deck.id)), id: "exam", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-30", studyTime: { dailyMinutes: 120, weekdays: Array(7).fill(true), dateOverrides: [] } };
const settings: ExamPlanningSettings = { version: 3, exams: [exam], capacity: createStudyTimeCapacity() };
const forecast: ExamPortfolioForecast = { days: [{ key: date, budgetMinutes: 60, newCardIds: [card.cardId], reviewCardIds: [], summaries: [], blocks: [{ id: "new", date, deckId: "heart", examIds: [exam.id], method: "new", expectedItems: 1, cardIds: [card.cardId] }] }], exams: [{ examId: exam.id, decks: decks.slice(1).map((deck) => ({ deckId: deck.id, name: deck.name, known: 0, total: 1,  })), usableDays: 10, totalCards: 4, remainingNewCount: 4, unscheduledNewCount: 0, availableMinutes: 60, current: { coverage: 0, consolidated: 0,  }, issues: [] }] };
const reconcile = (saved = settings, cards = [card], plan = forecast, at = now) => reconcileExamDailyTasks(saved, decks, plan, cards, at, "Europe/Berlin", 4);

test("Lesehäkchen bleiben je Thema dauerhaft, und Abgleich verändert keine gespeicherten Objekte", () => {
  const enabled = { ...settings, exams: [{ ...exam, readSummaryBeforeTopics: true }] };
  const projection = { ...forecast, days: [{ ...forecast.days[0], summaries: [{ examId: exam.id, deckId: "heart" }] }] };
  const tasks = reconcile(enabled, [card], projection), saved = { ...enabled, dailyTasks: tasks }, before = JSON.stringify(saved);
  reconcile(saved, [card], projection);
  assert.equal(JSON.stringify(saved), before);
  const id = `summary:${exam.id}:heart`, done = withExamDailyTasks(saved, setExamDailyTaskChecked(tasks, id, true));
  assert.deepEqual(done.exams[0].completedSummaryDeckIds, ["heart"]);
  assert.deepEqual(withExamDailyTasks(done, setExamDailyTaskChecked(done.dailyTasks!, id, false)).exams[0].completedSummaryDeckIds, []);
});

test("Tagesziele bleiben bei Neuberechnung erhalten", () => {
  const tasks = reconcile();
  assert.deepEqual(tasks.map((task) => task.id), ["topic:exam:heart"]);
  const empty = { ...forecast, days: [{ ...forecast.days[0], blocks: [] }] };
  assert.deepEqual(reconcile({ ...settings, dailyTasks: tasks }, [card], empty), tasks);
});

test("geänderte Planung ersetzt offene Ziele und erhält manuell erledigte Arbeit", () => {
  const capturedAt = "2026-10-20T08:00:00.000Z";
  const task = { ...reconcile()[0], cardIds: ["previous-card"], planningKey: "previous-plan", capturedAt };
  const open = reconcile({ ...settings, dailyTasks: [task] }).find((entry) => entry.id === task.id)!;
  assert.deepEqual(open.cardIds, [card.cardId]); assert.equal(open.capturedAt, now);
  const completed = reconcile({ ...settings, dailyTasks: [{ ...task, completed: "manual" }] }).find((entry) => entry.id === task.id)!;
  assert.deepEqual(completed.cardIds, ["previous-card", card.cardId]);
  assert.equal(completed.completed, "manual"); assert.equal(completed.capturedAt, capturedAt);
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

test("Aufgaben-IDs und Sitzungsziele kommen aus dem Aufgabenmodul", () => {
  assert.equal(getExamSummaryTaskDeckId(`summary:${encodeURIComponent("exam:1")}:${encodeURIComponent("Herz & Lunge")}`), "Herz & Lunge");
  assert.equal(getExamSummaryTaskDeckId("topic:exam:heart"), null);
  const tasks = reconcile();
  assert.deepEqual(getExamSessionTargetIds(tasks, forecast.days[0], date, "topic:exam:heart"), [card.cardId]);
  assert.deepEqual(getExamSessionTargetIds(tasks, forecast.days[0], date, null), [card.cardId]);
  assert.deepEqual(getExamSessionTargetIds(tasks, forecast.days[0], "2026-10-21", "new"), [], "Kalenderblöcke anderer Tage starten keine Sitzung");
});

test("der Abgleich kürzt Zielkarten auf die zulässige Zahl an Kartenverweisen", () => {
  const many = Array.from({ length: EXAM_PLANNING_LIMITS.dailyCardRefs + 5 }, (_, i) => `many-${i}`);
  const plan = { ...forecast, days: [{ ...forecast.days[0], newCardIds: many, blocks: [{ ...forecast.days[0].blocks[0], cardIds: many, expectedItems: many.length }] }] };
  const tasks = reconcile(settings, [card], plan);
  assert.equal(tasks.reduce((sum, task) => sum + task.cardIds.length, 0), EXAM_PLANNING_LIMITS.dailyCardRefs);
});
