import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createCoreRepository } from "./coreRepository.ts";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createWorkspaceHydrationService } from "./workspaceHydrationService.ts";
import { createExamLearningPlan, withExamLearningPlan } from "./examPlanSettings.ts";
import { getGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { createExamPortfolioForecast, createExamPlanForecast, createExamStudyDecks } from "./examPlanning.ts";
import { answerVariant } from "./reviewService.ts";

Object.assign(globalThis, { IDBKeyRange });
const now = "2026-10-08T08:00:00Z";
function initialState(userId: string) {
  const base = createCoreRepository().getState();
  const deck = createCoreDeck({ id: "exam-root", ownerId: userId, name: "Prüfung", source: "manual", cards: [createBasicLearningItem("exam-root", "Frage", "Antwort", { id: "exam-card", reviewState: { dueAt: now } })] });
  return { ...base, profile: { ...base.profile, userId }, decks: [deck] };
}

test("Planangaben überleben Reload und bleiben accountgebunden; ein Plansession-Review verändert keine Stapeleinstellungen", async () => {
  const indexedDb = new IDBFactory(), userId = randomUUID();
  const source = initialState(userId);
  let repository = await createIndexedDbCoreRepository({ userId, initialState: source, indexedDb });
  const plan = { ...createExamLearningPlan("2026-10-08", "exam-root"), chapterDeckIds: ["exam-root"], userId, desiredRetention: 0.95 };
  repository.saveProfile(withExamLearningPlan(repository.getShellState().profile, plan)); await repository.flush(); repository.close();
  repository = await createIndexedDbCoreRepository({ userId, initialState: source, indexedDb });
  const preferences = getGlobalSchedulerPreferences(repository.getShellState().profile);
  assert.deepEqual(preferences.examPlanning.exams[0], plan);
  const decks = await createWorkspaceHydrationService({ client: {}, repository, mediaStore: null }).prepareContentDecks(["exam-root"]);
  assert.equal(decks[0].cards.length, 1);
  const forecast = await createExamPlanForecast(decks, plan, { now, preferences, timeZone: "Europe/Berlin" });
  const session = createExamStudyDecks(decks, plan, forecast.days[0]);
  const result = answerVariant(session[0], "exam-card", null, "good", { now, timeZone: "Europe/Berlin" });
  repository.recordReview(result); await repository.flush();
  assert.equal((await repository.loadCard("exam-card"))?.reviewState.desiredRetention, 0.95);
  assert.equal(repository.getShellState().decks[0].deckSettings.schedulerProfile.desiredRetention, 0.9);
  repository.close();
  const otherUserId = randomUUID();
  const empty = createCoreRepository().getState();
  const other = await createIndexedDbCoreRepository({ userId: otherUserId, initialState: { ...empty, profile: { ...empty.profile, userId: otherUserId } }, indexedDb });
  assert.deepEqual(getGlobalSchedulerPreferences(other.getShellState().profile).examPlanning.exams, []);
  assert.equal((await other.loadExamPlanningDecks(["exam-root"])).length, 0);
  other.close();
});

test("vollständig gecachte Kapitel funktionieren offline; fehlende Körper werden sichtbar abgewiesen", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  const userId = randomUUID(), indexedDb = new IDBFactory();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: initialState(userId), indexedDb });
  try {
    const service = createWorkspaceHydrationService({ client: {}, repository, mediaStore: null });
    assert.equal((await service.prepareContentDecks(["exam-root"]))[0].cards.length, 1);
    await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
    await assert.rejects(service.prepareContentDecks(["exam-root"]), /fehlen Karten auf deinem Gerät/);
    await assert.rejects(service.prepareContentDecks(["fremd"]), /nicht mehr verfügbar/);
  } finally {
    repository.close();
    if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("gemeinsame Pläne, Review-Fortschritt, Tagesereignisse und originale Deckmetadaten bleiben nach Reload erhalten", async () => {
  const indexedDb = new IDBFactory(), userId = randomUUID(), source = initialState(userId);
  source.decks.push(createCoreDeck({ id: "second-root", ownerId: userId, name: "Zweiter Stapel", source: "manual", cards: [createBasicLearningItem("second-root", "Zweite Frage", "Antwort", { id: "second-card", reviewState: { dueAt: now } })] }));
  let repository = await createIndexedDbCoreRepository({ userId, initialState: source, indexedDb });
  const a = { ...createExamLearningPlan("2026-10-08", "exam-root", userId), id: "a", chapterDeckIds: ["exam-root", "second-root"], bufferDays: 0 };
  const b = { ...a, id: "b", name: "Prüfung B" };
  repository.saveProfile(withExamLearningPlan(withExamLearningPlan(repository.getShellState().profile, a), b)); await repository.flush();
  let preferences = getGlobalSchedulerPreferences(repository.getShellState().profile);
  let decks = await repository.loadExamPlanningDecks(["exam-root", "second-root"]);
  const before = await createExamPortfolioForecast(decks, preferences.examPlanning.exams, { now, preferences, timeZone: "Europe/Berlin" });
  const session = createExamStudyDecks(decks, a, before.days[0], preferences.examPlanning.exams);
  const other = session.find((deck) => deck.id === "second-root")!;
  assert.equal(other.parentDeckId, "exam-root");
  const result = answerVariant(other, "second-card", null, "good", { now, responseTimeMs: 60000 });
  repository.recordReview(result); await repository.flush();
  assert.equal(repository.getShellState().decks.find((deck) => deck.id === "second-root")!.parentDeckId, null);
  const dayEvents = await repository.loadExamPlanningDayEvents(now, 0, "Europe/Berlin");
  assert.equal(dayEvents.length, 1); assert.equal(dayEvents[0].id, result.event.id);
  decks = await repository.loadExamPlanningDecks(["exam-root", "second-root"]);
  const after = await createExamPortfolioForecast(decks, preferences.examPlanning.exams, { now, preferences, timeZone: "Europe/Berlin" });
  assert.ok(after.exams.every((exam, i) => exam.current.coverage > before.exams[i].current.coverage));
  assert.equal(after.days[0].spentMinutes, 1);
  repository.close();
  repository = await createIndexedDbCoreRepository({ userId, initialState: source, indexedDb });
  preferences = getGlobalSchedulerPreferences(repository.getShellState().profile);
  assert.equal(preferences.examPlanning.exams.length, 2);
  assert.equal((await repository.loadExamPlanningDayEvents(now, 0, "Europe/Berlin")).length, 1);
  assert.equal((await repository.loadCard("second-card"))!.reviewState.repetitions, result.updatedCard.reviewState.repetitions);
  repository.close();
});
