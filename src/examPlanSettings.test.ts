import assert from "node:assert/strict";
import test from "node:test";
import { EXAM_PLANNING_LIMITS, createExamPlan, createStudyTimeCapacity, normalizeExamPlanningSettings, removeExamPlan, upsertExamPlan, validateExamPlanningSettings } from "./examPlanSettings.ts";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "./learningProfiles.ts";

const exam = (id: string) => ({ ...createExamPlan("2026-10-08", ["deck-a"]), id, name: `Prüfung ${id}` });

test("Prüfungspläne bleiben beim Ändern anderer Lernwerte im Profil erhalten", () => {
  const settings = upsertExamPlan(normalizeExamPlanningSettings(undefined), exam("a"));
  const profile = withGlobalSchedulerPreferences({}, { examPlanning: settings });
  const changed = withGlobalSchedulerPreferences(profile, { dayStartHour: 5 });
  assert.deepEqual(getGlobalSchedulerPreferences(changed).examPlanning, settings);
  assert.equal(getGlobalSchedulerPreferences(changed).dayStartHour, 5);
});

test("gewählte Prüfungsfarben bleiben im Profil und alte Pläne ohne Farbe gültig", () => {
  const settings = upsertExamPlan(normalizeExamPlanningSettings(undefined), { ...exam("a"), colorIndex: 19 });
  assert.equal(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: settings })).examPlanning.exams[0].colorIndex, 19);
  assert.equal(upsertExamPlan(settings, { ...exam("a"), colorIndex: 0 }).exams[0].colorIndex, 0);
  assert.equal(normalizeExamPlanningSettings({ exams: [exam("old")] }).exams[0].colorIndex, undefined);
  for (const colorIndex of [-1, 20, 1.5, "blue"]) assert.throws(() => validateExamPlanningSettings({ ...settings, exams: [{ ...exam("a"), colorIndex }] }), /ungültig/);
  const custom = upsertExamPlan(settings, { ...exam("a"), color: "#FAE321" });
  assert.equal(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: custom })).examPlanning.exams[0].color, "#fae321");
  for (const color of ["red", "#fff", "#00000000", "var(--core-action)"]) assert.throws(() => validateExamPlanningSettings({ ...settings, exams: [{ ...exam("a"), color }] }), /ungültig/);
});

test("ungültige Prüfungen fallen einzeln weg, gültige bleiben", () => {
  const stored = { version: 1, capacity: { ...createStudyTimeCapacity(), weekdays: [true] }, exams: [exam("a"), { ...exam("b"), examDate: "2026-02-30" }, exam("a"), { ...exam("c"), deckIds: [] }, exam("d")] };
  const settings = normalizeExamPlanningSettings(stored);
  assert.deepEqual(settings.exams.map((entry) => entry.id), ["a", "d"]);
  assert.deepEqual(settings.capacity, createStudyTimeCapacity(), "eine ungültige Lernzeit fällt auf die Standardwerte zurück");
  assert.deepEqual(normalizeExamPlanningSettings("kaputt"), { version: 1, exams: [], capacity: createStudyTimeCapacity() });
});

test("Obergrenzen halten das Profil klein: 20 Prüfungen mit je 200 Stapeln", () => {
  let settings = normalizeExamPlanningSettings(undefined);
  for (let index = 0; index < EXAM_PLANNING_LIMITS.exams; index++) settings = upsertExamPlan(settings, exam(`exam-${index}`));
  assert.throws(() => upsertExamPlan(settings, exam("zu-viel")), /Höchstens 20 Prüfungen/);
  assert.equal(upsertExamPlan(settings, { ...exam("exam-3"), name: "Neu" }).exams[3].name, "Neu", "bestehende Prüfungen lassen sich weiter bearbeiten");
  assert.throws(() => upsertExamPlan(removeExamPlan(settings, "exam-0"), { ...exam("x"), deckIds: Array.from({ length: 201 }, (_, index) => `deck-${index}`) }), /ungültig/);
});

test("Ausnahmetage sind eindeutig und Namen nicht leer", () => {
  const settings = normalizeExamPlanningSettings(undefined);
  const capacity = { ...settings.capacity, dateOverrides: [{ date: "2026-10-09", minutes: 0 }, { date: "2026-10-09", minutes: 30 }] };
  assert.throws(() => validateExamPlanningSettings({ ...settings, capacity }), /ungültig/);
  assert.throws(() => upsertExamPlan(settings, { ...exam("a"), name: "   " }), /ungültig/);
});


test("neue Zeit- und Themenangaben überstehen die Profilnormalisierung", () => {
  const settings = { ...normalizeExamPlanningSettings(undefined), exams: [{ ...exam("a"), topicDates: [{ deckId: "deck-a", date: "2026-10-12" }] }], capacity: { ...createStudyTimeCapacity(), weeklyMinutes: [180, 240, 60, 0, 90, 0, 0], timeBlocks: [{ id: "block-a", date: "2026-10-12", start: 480, end: 660, examId: "a" }] } };
  assert.deepEqual(validateExamPlanningSettings(settings), settings);
  assert.deepEqual(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: settings })).examPlanning, settings);
  assert.deepEqual(removeExamPlan(settings, "a").capacity.timeBlocks, []);
});

test("überlappende, rückwärts laufende und fremde Zeitblöcke werden abgelehnt", () => {
  const settings = upsertExamPlan(normalizeExamPlanningSettings(undefined), exam("a"));
  const block = { id: "1", date: "2026-10-12", start: 480, end: 660, examId: "a" };
  for (const extra of [{ ...block, id: "2", start: 650 }, { ...block, id: "2", start: 700, end: 600 }, { ...block, id: "2", date: "2026-10-13", examId: "missing" }]) {
    assert.throws(() => validateExamPlanningSettings({ ...settings, capacity: { ...settings.capacity, timeBlocks: [block, extra] } }), /ungültig/);
  }
  const valid = validateExamPlanningSettings({ ...settings, capacity: { ...settings.capacity, timeBlocks: [block, { ...block, id: "2", start: 660, end: 720 }] } });
  assert.equal(valid.capacity.timeBlocks?.length, 2);
  assert.throws(() => upsertExamPlan(settings, { ...exam("a"), topicDates: [{ deckId: "missing", date: "2026-10-12" }] }), /ungültig/);
});


test("Lernzeit bleibt ohne Fachzuordnung speicherbar und kollisionsgeprüft", () => {
  const block = { id: "free", date: "2026-10-12", start: 780, end: 900, examId: null };
  const settings = { ...normalizeExamPlanningSettings(undefined), capacity: { ...createStudyTimeCapacity(), timeBlocks: [block] } };
  assert.deepEqual(validateExamPlanningSettings(settings), settings);
  assert.deepEqual(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: settings })).examPlanning.capacity.timeBlocks, [block]);
  assert.throws(() => validateExamPlanningSettings({ ...settings, capacity: { ...settings.capacity, timeBlocks: [block, { ...block, id: "overlap", start: 870 }] } }), /ungültig/);
  const withExam = upsertExamPlan(settings, exam("a"));
  const assigned = validateExamPlanningSettings({ ...withExam, capacity: { ...withExam.capacity, timeBlocks: [{ ...block, examId: "a" }] } });
  assert.equal(assigned.capacity.timeBlocks?.[0].examId, "a");
  assert.deepEqual(removeExamPlan(withExam, "a").capacity.timeBlocks, [block]);
});

test("Karten und Quiz behalten ihre getrennte Zeitblock-Zuordnung im Profil", () => {
  const settings = upsertExamPlan(normalizeExamPlanningSettings(undefined), exam("a"));
  const block = { id: "cards", date: "2026-10-12", start: 480, end: 540, examId: "a", kind: "study" as const };
  const quiz = { ...block, id: "quiz", start: 540, end: 570, kind: "quiz" as const };
  const next = validateExamPlanningSettings({ ...settings, capacity: { ...settings.capacity, timeBlocks: [block, quiz] } });
  assert.deepEqual(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences({}, { examPlanning: next })).examPlanning.capacity.timeBlocks, [block, quiz]);
  for (const invalid of [{ ...quiz, examId: null }, { ...quiz, kind: "unknown" }, { ...quiz, start: 530 }]) {
    assert.throws(() => validateExamPlanningSettings({ ...settings, capacity: { ...settings.capacity, timeBlocks: [block, invalid] } }), /ungültig/);
  }
});
