import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck, createReviewState, rescheduleLearningItem } from "./coreModel.ts";
import { createExamLearningPlan, createStudyTimeCapacity } from "./examPlanSettings.ts";
import { createExamPortfolioForecast, getExamCurrentProgress, resolveExamSessionPlan, getExamBlockResumeIds, getExamBlockQueue, estimateExamTiming, getExamDayCapacity, createExamPlanForecast, createExamStudyDecks, getExamPlanChapters, getExamStudySettings } from "./examPlanning.ts";
import { getGlobalSchedulerPreferences } from "./learningProfiles.ts";
import { getLearningDayKey } from "./learningDay.ts";
import { scheduleWithFsrs } from "./scheduler.ts";
import { answerVariant, createDailyReviewQueue } from "./reviewService.ts";
import { createRephraseVariant } from "./coreVariantService.ts";
import type { Deck, ExamLearningPlan } from "./coreTypes.ts";

const now = "2026-10-08T08:00:00.000Z";
const preferences = getGlobalSchedulerPreferences({});
const capacity = { ...createStudyTimeCapacity(), weekdayMinutes: 15, weekendMinutes: 15, weekdays: Array(7).fill(true), reserveFraction: 0 };
const options = { now, preferences, timeZone: "Europe/Berlin", capacity };
function fixture(count = 40): Deck[] {
  return [createCoreDeck({ id: "root", name: "Prüfung", source: "manual", cards: Array.from({ length: count }, (_, i) =>
    createBasicLearningItem("root", `Frage ${i}`, "Antwort", { id: `card-${i}`, createdAt: "2026-10-01T08:00:00.000Z", reviewState: { dueAt: now } })) })];
}
function plan(patch: Partial<ExamLearningPlan> = {}): ExamLearningPlan {
  return { ...createExamLearningPlan("2026-10-08", "root"), chapterDeckIds: ["root"], coverage: 100, ...patch };
}

test("neuer Stoff kommt früh, Reviews verbrauchen Budget und Puffer erlauben nur Wiederholungen", async () => {
  const decks = fixture(200), original = JSON.stringify(decks);
  const forecast = await createExamPlanForecast(decks, plan(), options);
  assert.ok(forecast.days[0].newCardIds.length > 0);
  assert.ok(forecast.days[0].reviewCount > 0, "erste Lernschritte zählen mit");
  assert.ok(forecast.days.slice(1).some((day) => day.reviewCount > day.newCardIds.length * 2));
  assert.equal(forecast.days.slice(-3).every((day) => day.buffer && day.newCardIds.length === 0), true);
  assert.equal(forecast.days.some((day) => day.key === "2026-11-19"), false, "Prüfungstag bleibt frei");
  for (const day of forecast.days) assert.ok(day.newMinutes + day.reviewMinutes <= day.budgetMinutes + 0.001);
  assert.equal(JSON.stringify(decks), original, "Prognose verändert weder Lernstand noch Inhalte");
});

test("ein gelernter Inhalt folgt tatsächlichen Scheduler-Intervallen, keiner Kapitel-Wiederholungsphase", async () => {
  const decks = fixture(1);
  decks[0].cards[0].reviewState = createReviewState({ state: "review", reps: 10, repetitions: 10, dueAt: now, stability: 3, difficulty: 5, lastReviewedAt: "2026-10-05T08:00:00Z" });
  const config = plan({ bufferDays: 0 });
  const firstState = scheduleWithFsrs(decks[0].cards[0].reviewState, "good", { now, deckSettings: getExamStudySettings(decks[0], config), timeZone: options.timeZone, dayStartHour: 0 });
  const expectedDay = getLearningDayKey(firstState.dueAt, { timeZone: options.timeZone })!;
  const forecast = await createExamPlanForecast(decks, config, options);
  const reviewed = forecast.days.filter((day) => day.reviewCardIds.includes("card-0"));
  assert.equal(reviewed[0].key, "2026-10-08");
  assert.equal(reviewed[1].key, expectedDay);
  assert.ok(reviewed.length < forecast.days.length / 2);
  assert.equal(forecast.remainingNewCount, 0);
});

test("knappes Budget priorisiert fällige Karten und meldet fehlende Stoffabdeckung", async () => {
  const decks = fixture(100);
  decks[0].cards[0].reviewState = createReviewState({ state: "review", reps: 3, dueAt: now, stability: 3, lastReviewedAt: "2026-10-05T08:00:00Z" });
  const forecast = await createExamPlanForecast(decks, plan(), { ...options, capacity: { ...capacity, weekdayMinutes: 1, weekendMinutes: 1 } });
  assert.ok(forecast.days[0].reviewCardIds.includes("card-0"));
  assert.equal(forecast.days[0].newCardIds.length, 0);
  assert.equal(forecast.feasible, false);
  assert.ok(forecast.unscheduledNewCount > 0);
});

test("freie Tage bleiben auch über den Wechsel zur Winterzeit frei", async () => {
  const forecast = await createExamPlanForecast(fixture(80), plan(), { ...options, capacity: { ...capacity, weekdays: [true, true, true, true, true, false, false] }, preferences: { ...preferences, dayStartHour: 3 } });
  assert.equal(forecast.days.length, 42);
  assert.ok(forecast.days.some((day) => day.key === "2026-10-25"));
  for (const day of forecast.days) {
    if ([0, 6].includes(new Date(`${day.key}T12:00:00Z`).getUTCDay())) {
      assert.equal(day.budgetMinutes, 0); assert.equal(day.reviewCount, 0); assert.equal(day.newCardIds.length, 0);
    }
  }
});

test("Kapitelabdeckung zählt eigene Karten genau einmal und erhält bereits gelernte Inhalte", async () => {
  const root = fixture(10)[0], child = { ...fixture(10)[0], id: "chapter", name: "Kapitel", parentDeckId: "root", cards: fixture(10)[0].cards.map((card) => ({ ...card, id: `child-${card.id}`, deckId: "chapter" })) };
  root.cards[0].reviewState = createReviewState({ state: "review", reps: 4, dueAt: now, stability: 10, lastReviewedAt: now });
  const config = plan({ chapterDeckIds: ["root", "chapter", "root"], coverage: 50 });
  const forecast = await createExamPlanForecast([root, child], config, options);
  assert.equal(forecast.totalCards, 20); assert.equal(forecast.targetCards, 10); assert.equal(forecast.remainingNewCount, 9);
  assert.deepEqual(getExamPlanChapters([root, child], "root").map((deck) => deck.id).sort(), ["chapter", "root"]);
});

test("Vorhandene Auswahlfragen bleiben reguläre Lernkarten; gesperrte Inhalte werden ausgeschlossen", async () => {
  const decks = fixture(8);
  decks[0].cards[0] = { ...decks[0].cards[0], cardType: "single-choice", kind: "single-choice" };
  decks[0].cards[1].status = "suspended";
  decks[0].cards[2].syncConflict = true;
  decks[0].cards[3].draftStatus = "draft";
  const cardsOnly = await createExamPlanForecast(decks, plan(), options);
  assert.equal(cardsOnly.totalCards, 5);
  assert.ok(cardsOnly.days[0].newCardIds.includes("card-0"));
});

test("Plansitzung erhält Lernstände, grenzt den Scope ein und verwendet das gewünschte Retentionsziel", async () => {
  const decks = fixture(20), config = plan({ desiredRetention: 0.95 });
  const forecast = await createExamPlanForecast(decks, config, options);
  const session = createExamStudyDecks(decks, config, forecast.days[0]);
  assert.equal(session[0].deckSettings.schedulerProfile.desiredRetention, 0.95);
  assert.equal(decks[0].deckSettings.schedulerProfile.desiredRetention, 0.9);
  const allowed = new Set([...forecast.days[0].newCardIds, ...forecast.days[0].reviewCardIds]);
  assert.ok(session[0].cards.every((item) => allowed.has(item.id)));
  assert.deepEqual(session[0].cards[0].reviewState, decks[0].cards.find((item) => item.id === session[0].cards[0].id)!.reviewState);
});

test("ungültige Horizonte, fehlende Lerntage und abgebrochene Berechnungen bleiben sichtbare Fehler", async () => {
  await assert.rejects(createExamPlanForecast(fixture(), plan({ examDate: "2026-10-08" }), options), /Prüfungstag/);
  const noTime = await createExamPlanForecast(fixture(), plan(), { ...options, capacity: { ...capacity, weekdays: Array(7).fill(false) } });
  assert.equal(noTime.feasible, false); assert.equal(noTime.usableDays, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createExamPlanForecast(fixture(), plan(), { ...options, signal: controller.signal }), /abort/i);
});

test("Bewertungen außerhalb der heutigen Plansession verändern deren Tageszähler nicht", async () => {
  const source = fixture(20)[0];
  const reviewed = answerVariant(source, "card-19", null, "good", { now });
  const deck = { ...reviewed.deck, cards: reviewed.deck.cards.map((item) => item.id === "card-19" ? rescheduleLearningItem(item, "2027-01-01T12:00:00Z") : item) };
  const config = plan();
  const forecast = await createExamPlanForecast([deck], config, options);
  const session = createExamStudyDecks([deck], config, forecast.days[0]);
  assert.ok(!session[0].cards.some((item) => item.id === "card-19"));
  assert.equal(session[0].reviewEvents.length, 0);
  assert.equal(createDailyReviewQueue(session, { now, deckId: "root" }).newCardsIntroducedToday, 0);
});

test("der Prüfungskalendertag bleibt auch vor einem verschobenen Tagesbeginn frei", async () => {
  const config = plan({ examDate: "2026-10-09", bufferDays: 0 });
  await assert.rejects(createExamPlanForecast(fixture(), config, { ...options, now: "2026-10-09T00:30:00+02:00", preferences: { ...preferences, dayStartHour: 3 } }), /Prüfungstag/);
});

test("ein gespeicherter Plan bleibt während der letzten Puffertage für fällige Reviews nutzbar", async () => {
  const decks = fixture(1);
  decks[0].cards[0].reviewState = createReviewState({ state: "review", reps: 10, dueAt: now, stability: 3, difficulty: 5, lastReviewedAt: "2026-10-05T08:00:00Z" });
  const forecast = await createExamPlanForecast(decks, plan({ examDate: "2026-10-10", bufferDays: 3 }), options);
  assert.equal(forecast.days.length, 2);
  assert.ok(forecast.days.every((day) => day.buffer && day.newCardIds.length === 0));
  assert.ok(forecast.days[0].reviewCardIds.includes("card-0"));
  assert.equal(forecast.feasible, true);
  const missing = await createExamPlanForecast(fixture(5), plan({ examDate: "2026-10-10", bufferDays: 3 }), options);
  assert.equal(missing.feasible, false);
  assert.equal(missing.unscheduledNewCount, 5);
});


test("mehrere Prüfungen teilen Minuten und gemeinsame Learning Items ohne doppelte Arbeit", async () => {
  const decks = fixture(25), a = plan({ id: "anatomy", name: "Anatomie", bufferDays: 0 }), b = plan({ id: "biology", name: "Biochemie", examDate: "2026-11-25", bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, [a, b], { ...options, capacity: { ...capacity, reserveFraction: 0.15 } });
  const first = forecast.days[0];
  assert.equal(new Set(first.newCardIds).size, first.newCardIds.length);
  assert.ok(first.blocks.some((block) => block.examIds.length === 2));
  assert.ok(first.newMinutes + first.reviewMinutes <= first.budgetMinutes * 0.85 + 0.001);
  const allocated = forecast.exams.reduce((sum, exam) => sum + exam.allocatedMinutes, 0);
  assert.ok(Math.abs(allocated - forecast.days.reduce((sum, day) => sum + day.newMinutes + day.reviewMinutes, 0)) < 0.001);
  const single = await createExamPortfolioForecast(decks, [b], { ...options, capacity: { ...capacity, reserveFraction: 0.15 } });
  assert.deepEqual(first.newCardIds, single.days[0].newCardIds);
});

test("Priorität und Termin bestimmen neue Inhalte deterministisch; überfällige Reviews behalten Vorrang", async () => {
  const aDeck = fixture(50)[0], bDeck = { ...fixture(50)[0], id: "other", cards: fixture(50)[0].cards.map((item) => ({ ...item, id: "other-" + item.id, deckId: "other" })) };
  bDeck.cards[0].reviewState = createReviewState({ state: "review", reps: 5, dueAt: now, stability: 4, lastReviewedAt: "2026-10-05T08:00:00Z" });
  const a = plan({ id: "a", examDate: "2026-10-20", bufferDays: 0 }), b = plan({ id: "b", rootDeckId: "other", chapterDeckIds: ["other"], examDate: "2026-11-20", bufferDays: 0 });
  const forecast = await createExamPortfolioForecast([aDeck, bDeck], [b, a], options);
  assert.ok(forecast.days[0].reviewCardIds.includes("other-card-0"));
  assert.ok(forecast.days[0].newCardIds.every((id) => !id.startsWith("other-")));
  const urgent = await createExamPortfolioForecast([aDeck, bDeck], [a, { ...b, priority: "high" }], options);
  assert.ok(urgent.days[0].newCardIds.every((id) => id.startsWith("other-")));
  const repeated = await createExamPortfolioForecast([aDeck, bDeck], [b, a], options);
  assert.deepEqual(repeated, forecast);
});

test("unabhängige Hauptstapel starten im vorhandenen Reviewbaum ohne Änderung der Originalhierarchie", async () => {
  const decks = fixture(8), other = { ...fixture(8)[0], id: "other", name: "Zweiter Hauptstapel", cards: fixture(8)[0].cards.map((item) => ({ ...item, id: "second-" + item.id, deckId: "other" })) };
  const config = plan({ chapterDeckIds: ["root", "other"], bufferDays: 0 });
  const forecast = await createExamPlanForecast([...decks, other], config, options);
  const session = createExamStudyDecks([...decks, other], config, forecast.days[0]);
  const queue = createDailyReviewQueue(session, { now, deckId: "root", timeZone: options.timeZone });
  assert.ok(queue.items.some((item) => item.deckId === "other"));
  assert.equal(other.parentDeckId, null);
  assert.equal(new Set(queue.items.map((item) => item.learningItemId)).size, queue.total);
});

test("Zeitkalibrierung trennt Methoden und widersteht Ausreißern", () => {
  const deck = fixture(1)[0];
  const base = answerVariant(deck, "card-0", null, "good", { now, responseTimeMs: 10000 }).event;
  deck.reviewEvents = ["new", "review", "relearning", "variant"].flatMap((method, j) => Array.from({ length: 12 }, (_, i) => ({
    ...base, id: method + i, variantId: method === "variant" ? "v" : null,
    schedulerBefore: { state: method === "variant" ? "review" : method }, responseTimeMs: i === 11 ? 170000 : 10000 * (j + 1),
  })));
  const time = estimateExamTiming([deck]);
  assert.deepEqual(Object.values(time).map((entry) => entry.seconds), [10, 20, 30, 40]);
  assert.ok(Object.values(time).every((entry) => entry.samples === 12));
});

test("freie Ausnahmetage, Mindestkapazität und bereits gelernte Minuten werden einmal berücksichtigt", async () => {
  const decks = fixture(30), result = answerVariant(decks[0], "card-0", null, "good", { now, responseTimeMs: 60000 });
  decks[0] = result.deck;
  const adjusted = { ...capacity, weekdayMinutes: 10, weekendMinutes: 10, minimumMinutes: 20, reserveFraction: 0.1, dateOverrides: [{ date: "2026-10-09", minutes: 0 }] };
  assert.equal(getExamDayCapacity("2026-10-08", adjusted), 20);
  assert.equal(getExamDayCapacity("2026-10-09", adjusted), 0);
  const forecast = await createExamPortfolioForecast(decks, [plan()], { ...options, capacity: adjusted });
  assert.equal(forecast.days[0].spentMinutes, 1);
  assert.ok(forecast.days[0].newMinutes + forecast.days[0].reviewMinutes <= 17.001);
  assert.equal(forecast.days[1].blocks.length, 0);
  const completed = forecast.days[0].blocks.filter((block) => block.status === "completed");
  assert.equal(completed.reduce((sum, block) => sum + block.actualMinutes, 0), 1);
});

test("ausgelassene Tage werden neu kalkuliert, pausierte/abgeschlossene Prüfungen buchen keine Arbeit", async () => {
  const config = plan(), decks = fixture(100);
  const tomorrow = { ...options, now: "2026-10-15T08:00:00Z" };
  const forecast = await createExamPortfolioForecast(decks, [config, { ...config, id: "paused", status: "paused" }, { ...config, id: "done", status: "completed" }], tomorrow);
  assert.equal(forecast.exams.length, 1);
  assert.equal(forecast.days[0].key, "2026-10-15");
  assert.ok(forecast.days.every((day) => day.newMinutes + day.reviewMinutes <= day.budgetMinutes + 0.001));
});

test("ein echtes Review aktualisiert Abdeckung und Prognose; Planung schreibt keinen Scheduler-State", async () => {
  const decks = fixture(10), config = plan({ bufferDays: 0 });
  const before = await createExamPortfolioForecast(decks, [config], options);
  const result = answerVariant(decks[0], "card-0", null, "again", { now, responseTimeMs: 12000 });
  const snapshot = JSON.stringify(result.deck);
  const after = await createExamPortfolioForecast([result.deck], [config], options);
  assert.ok(after.exams[0].current.coverage > before.exams[0].current.coverage);
  assert.equal(JSON.stringify(result.deck), snapshot);
  assert.ok(after.days[0].blocks.some((block) => block.method === "relearning"));
  assert.ok(after.exams[0].predicted.achievement >= 0 && after.exams[0].predicted.achievement <= 1);
});

test("Prognostizierte erste Lernschritte sind vor dem neuen Item keine aktive Relearning-Aufgabe", async () => {
  const decks = fixture(10), config = plan({ bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, [config], options), day = forecast.days[0];
  const block = day.blocks.find((block) => block.method === "relearning")!;
  assert.ok(block);
  assert.equal(getExamBlockQueue(decks, [config], day, block, options)?.total, 0);
  const newBlock = day.blocks.find((block) => block.method === "new")!;
  assert.ok(getExamBlockQueue(decks, [config], day, newBlock, options)!.total > 0);
});

test("stabile Karten, morgen liegende Prüfung und fehlende Kapitel erzeugen nachvollziehbare Ergebnisse", async () => {
  const decks = fixture(1);
  decks[0].cards[0].reviewState = createReviewState({ state: "review", reps: 15, stability: 100, dueAt: "2027-01-01T08:00:00Z", lastReviewedAt: now });
  const forecast = await createExamPortfolioForecast(decks, [plan({ examDate: "2026-10-09", chapterDeckIds: ["root", "removed"] })], options);
  assert.equal(forecast.days.length, 1);
  assert.equal(forecast.exams[0].remainingNewCount, 0);
  assert.equal(forecast.exams[0].requiredMinutes, 0);
  assert.ok(forecast.exams[0].issues.some((issue) => issue.includes("gelöscht")));
  assert.equal(forecast.exams[0].feasible, false);
});

test("Varianten bleiben eine Methode desselben Items und lassen sich für Plansitzungen ausschalten", async () => {
  const decks = fixture(1), config = plan({ bufferDays: 0 });
  const item = decks[0].cards[0];
  item.reviewState = createReviewState({ state: "review", reps: 10, maturityXp: 140, dueAt: now, stability: 8, lastReviewedAt: "2026-10-05T08:00:00Z" });
  item.variants = [createRephraseVariant(item, { front: "Andere Frage", back: "Antwort" })];
  decks[0].deckSettings.coreMode = "auto";
  const snapshot = JSON.stringify(decks);
  const forecast = await createExamPortfolioForecast(decks, [config], options);
  assert.equal(forecast.exams[0].totalCards, 1);
  assert.ok(forecast.days[0].blocks.some((block) => block.method === "variant"));
  const without = await createExamPortfolioForecast(decks, [{ ...config, variants: false }], options);
  assert.ok(!without.days[0].blocks.some((block) => block.method === "variant"));
  assert.equal(getExamStudySettings(decks[0], { ...config, variants: false }).coreMode, "off");
  assert.equal(JSON.stringify(decks), snapshot);
});

test("großer neuer Bestand bleibt kapazitätsbegrenzt und weist die verbleibende Lücke aus", async () => {
  const forecast = await createExamPortfolioForecast(fixture(1200), [plan({ examDate: "2026-10-15", bufferDays: 1 })], options);
  assert.equal(forecast.exams[0].totalCards, 1200);
  assert.ok(forecast.exams[0].unscheduledNewCount > 0);
  assert.equal(forecast.exams[0].feasible, false);
  assert.ok(forecast.days.every((day) => day.newMinutes + day.reviewMinutes <= day.budgetMinutes + 0.001));
});

test("gemeinsame neue Karten respektieren den Puffer aller noch aktiven Prüfungen", async () => {
  const decks = fixture(5), a = plan({ id: "a", examDate: "2026-10-09", bufferDays: 1 }), b = plan({ id: "b", examDate: "2026-10-15", bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, [a, b], options);
  assert.equal(forecast.days[0].newCardIds.length, 0);
  assert.equal(forecast.exams[0].unscheduledNewCount, 5);
  assert.ok(forecast.days.slice(2).some((day) => day.newCardIds.length > 0));
  assert.ok(forecast.days.slice(2).flatMap((day) => day.blocks).every((block) => !block.examIds.includes("a")));
});

test("Editor-Rückkehr und Reload erhalten echte Lernschritte eines bereits bewerteten New-Blocks", async () => {
  const decks = fixture(1), config = plan({ bufferDays: 0 });
  const first = await createExamPortfolioForecast(decks, [config], options);
  const block = first.days[0].blocks.find((block) => block.method === "new")!;
  const result = answerVariant(decks[0], "card-0", null, "good", { now, flags: { examPlanId: config.id, examBlockId: block.id } });
  const current = await createExamPortfolioForecast([result.deck], [config], options);
  assert.ok(!current.days[0].blocks.some((entry) => entry.id === block.id && entry.status !== "completed"));
  const resume = getExamBlockResumeIds([result.deck], config, block.id, options);
  assert.deepEqual(resume, ["card-0"]);
  const session = createExamStudyDecks([result.deck], config, current.days[0], [config], block.id, resume);
  assert.equal(session[0].cards.length, 1);
  assert.equal(session[0].cards[0].reviewState.state, "learning");
  assert.ok(createDailyReviewQueue(session, { now, deckId: "root", learnAheadMinutes: 20, timeZone: options.timeZone }).total > 0);
  assert.deepEqual(getExamBlockResumeIds([result.deck], config, "unknown", options), []);
});

test("ein gelöschter Sitzungsanker blockiert keine überlebenden ausgewählten Hauptstapel", async () => {
  const config = plan({ chapterDeckIds: ["removed", "root"], rootDeckId: "removed", bufferDays: 0 }), decks = fixture(5);
  const resolved = resolveExamSessionPlan(decks, config);
  assert.equal(resolved.rootDeckId, "root");
  assert.equal(config.rootDeckId, "removed");
  const forecast = await createExamPortfolioForecast(decks, [config], options), block = forecast.days[0].blocks.find((block) => block.method === "new")!;
  assert.ok(getExamBlockQueue(decks, [config], forecast.days[0], block, options)!.total > 0);
  assert.throws(() => resolveExamSessionPlan(decks, config, "unselected"), /Startstapel/);
});

test("gemeinsame Sicherheitsziele gelten unabhängig vom Einführungskontingent; Wissensstände werden nicht dupliziert", async () => {
  const decks = fixture(10), a = plan({ id: "a", coverage: 100, desiredRetention: 0.85, bufferDays: 0 }), b = plan({ id: "b", coverage: 50, desiredRetention: 0.97, bufferDays: 0 });
  const forecast = await createExamPortfolioForecast(decks, [a, b], options);
  assert.equal(forecast.exams[0].targetCards, 10); assert.equal(forecast.exams[1].targetCards, 5);
  assert.ok(forecast.days[0].newCardIds.length > forecast.exams[1].targetCards);
  assert.ok(forecast.days[0].blocks.filter((block) => block.method === "new").every((block) => block.examIds.length === 2));
  const session = createExamStudyDecks(decks, a, forecast.days[0], [a,b]);
  assert.equal(session[0].deckSettings.schedulerProfile.desiredRetention, 0.97);
  assert.equal(new Set(session[0].cards.map((card) => card.id)).size, session[0].cards.length);
  assert.equal(decks[0].deckSettings.schedulerProfile.desiredRetention, 0.9);
});

test("abgeschlossene und pausierte Prüfungen behalten Kartenfortschritt ohne aktive Prognose oder neue Arbeit", async () => {
  const decks = fixture(2), config = plan({ status: "completed", examDate: "2026-10-01" });
  decks[0] = answerVariant(decks[0], "card-0", null, "good", { now }).deck;
  const current = getExamCurrentProgress(decks, config, now, options.timeZone);
  assert.equal(current.coverage, 0.5);
  assert.equal(current.atExam, false);
  assert.equal(current.totalCards, 2);
  assert.ok(current.security !== null);
  const forecast = await createExamPortfolioForecast(decks, [config], options);
  assert.equal(forecast.days.length, 0);
  assert.equal(forecast.exams.length, 0);
});

test("bereits stabile Zielkenntnisse benötigen bei leerem Zeitbudget keine fiktiven Aufgaben", async () => {
  const decks = fixture(1);
  decks[0].cards[0].reviewState = createReviewState({ state: "review", reps: 10, stability: 100, lastReviewedAt: now, dueAt: "2027-01-01T08:00:00Z" });
  const forecast = await createExamPortfolioForecast(decks, [plan({ examDate: "2026-10-09" })], { ...options, capacity: { ...capacity, weekdays: Array(7).fill(false) } });
  assert.equal(forecast.exams[0].feasible, true);
  assert.equal(forecast.exams[0].issues.length, 0);
  assert.equal(forecast.days[0].blocks.length, 0);
});
