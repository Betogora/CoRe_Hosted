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
