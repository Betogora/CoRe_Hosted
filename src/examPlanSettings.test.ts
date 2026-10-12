import assert from "node:assert/strict";
import test from "node:test";
import { createCoreRepository } from "./coreRepository.ts";
import { createExamLearningPlan, readExamLearningPlan, withExamLearningPlan, removeExamLearningPlan, createStudyTimeCapacity, readStudyTimeCapacity, readExamPlanningSettings } from "./examPlanSettings.ts";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { createCloudProfile, createProfileRow } from "./cloudAuth.ts";

const config = { ...createExamLearningPlan("2026-10-08", "deck"), chapterDeckIds: ["deck"] };
test("Prüfungspläne werden an ihrer Vertrauensgrenze streng validiert", () => {
  assert.deepEqual(readExamLearningPlan(config), config);
  assert.equal(readExamLearningPlan({ ...config, examDate: "2026-02-30" }), null);
  assert.equal(readExamLearningPlan({ ...config, weekdays: [true] }), null);
  assert.equal(readExamLearningPlan({ ...config, coverage: 200 }), null);
  assert.equal(readExamLearningPlan({ ...config, cards: false, questions: false }), null);
  assert.equal(readExamLearningPlan({ ...config, unwanted: "value" }), null);
});
test("Änderungen der globalen Lernwerte erhalten den gespeicherten Prüfungsplan", () => {
  const profile = withExamLearningPlan(createCoreRepository().getState().profile, config);
  assert.deepEqual(getGlobalSchedulerPreferences(withGlobalSchedulerPreferences(profile, { dayStartHour: 3 })).examPlanning.exams[0], { ...config, userId: profile.userId });
  assert.deepEqual(getGlobalSchedulerPreferences(removeExamLearningPlan(profile, config.id)).examPlanning.exams, []);
});
test("bestehender Cloud-Profilpfad überträgt und liest die Planangaben vollständig", () => {
  const state = createCoreRepository().getState();
  const userId = "00000000-0000-4000-8000-000000000008";
  const profile = withExamLearningPlan({ ...state.profile, userId }, config);
  const row = createProfileRow(profile, { id: userId, email: "planung@example.test" });
  const cloudProfile = createCloudProfile(row, { id: userId, email: "planung@example.test" });
  assert.deepEqual(getGlobalSchedulerPreferences(cloudProfile).examPlanning.exams[0], { ...config, userId: profile.userId });
});


test("versionierte Prüfungssammlung erhält mehrere Pläne, Abdeckung und Sicherheit unabhängig sowie Konto-Scope", () => {
  const base = createCoreRepository().getState().profile;
  const a = { ...config, id: "a", coverage: 70, desiredRetention: 0.97 }, b = { ...config, id: "b", coverage: 100, desiredRetention: 0.85 };
  const profile = withExamLearningPlan(withExamLearningPlan(base, a), b);
  assert.equal(readExamPlanningSettings(profile).exams.length, 2);
  const changed = withExamLearningPlan(profile, { ...a, status: "paused" });
  assert.equal(readExamPlanningSettings(changed).exams.find((exam) => exam.id === "a")?.status, "paused");
  assert.equal(readExamPlanningSettings(removeExamLearningPlan(changed, "b")).exams.length, 1);
  assert.throws(() => withExamLearningPlan(profile, { ...a, userId: "other-account" }), /ungültig/);
});

test("temporäre gemeinsame Kapazität verändert keine Grundeinstellungen; Ausnahmedaten sind validiert", () => {
  const base = createCoreRepository().getState().profile;
  const capacity = { ...createStudyTimeCapacity(), weekdayMinutes: 90, dateOverrides: [{ date: "2026-10-09", minutes: 0 }] };
  const profile = withExamLearningPlan(base, config, capacity);
  const settings = readExamPlanningSettings(profile);
  assert.equal(settings.capacity.weekdayMinutes, 45);
  assert.equal(settings.preparationCapacity?.weekdayMinutes, 90);
  assert.equal(readStudyTimeCapacity({ ...capacity, dateOverrides: [capacity.dateOverrides[0], capacity.dateOverrides[0]] }), null);
  assert.equal(readExamPlanningSettings(withExamLearningPlan(profile, config, null)).preparationCapacity, null);
});

test("erster einzelner Prüfungsplan wird ohne Kartenmutation in die accountgebundene Sammlung übernommen", () => {
  const profile = createCoreRepository().getState().profile;
  const { version, userId, name, status, priority, variants, updatedAt, ...old } = config;
  const migrated = readExamPlanningSettings({ ...profile, schedulerPreferences: { examLearningPlan: { ...old, cards: true, questions: false, weekdayMinutes: 35, weekendMinutes: 50, weekdays: [true,true,true,true,true,false,false] } } });
  assert.equal(migrated.exams[0].id, config.id);
  assert.equal(migrated.exams[0].userId, profile.userId);
  assert.equal(migrated.capacity.weekdayMinutes, 35);
  assert.equal(migrated.version, 2);
});
