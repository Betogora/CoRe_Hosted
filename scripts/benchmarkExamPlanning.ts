import { performance } from "node:perf_hooks";
import type { CardStudySnapshot } from "../src/cloudRepositoryValidation.ts";
import { createCoreDeck } from "../src/coreModel.ts";
import type { ExamPlan } from "../src/coreTypes.ts";
import { createExamPortfolioForecast, shiftExamDay } from "../src/examPlanning.ts";
import { createExamPlan, createStudyTimeCapacity } from "../src/examPlanSettings.ts";
import { getGlobalSchedulerPreferences } from "../src/learningProfiles.ts";

// Fixed exam-planning scenarios: total duration and the longest uninterrupted main-thread slice.
const RUNS = 5;
const now = "2026-10-20T08:00:00.000Z", today = "2026-10-20";
const decks = [createCoreDeck({ id: "root", name: "Root" }), ...["a", "b"].map((id) => createCoreDeck({ id, name: id.toUpperCase(), parentDeckId: "root" }))];
const options = { now, preferences: getGlobalSchedulerPreferences({}), timeZone: "UTC", capacity: createStudyTimeCapacity() };

function snapshot(id: string, deckId: string, index: number, known: boolean): CardStudySnapshot {
  return {
    cardId: id, noteId: `note-${id}`, deckId, status: "active", studyRevision: 0, activeVariantCount: 0, stabilityFast: known ? 2 + index * 0.013 : 0,
    createdAt: new Date(Date.parse("2026-10-01T08:00:00.000Z") + index * 1000).toISOString(),
    study: known
      ? { state: "review", dueAt: new Date(Date.parse(now) + (index % 30) * 86_400_000).toISOString(), stability: 2 + index * 0.013, difficulty: 3 + (index % 70) / 10, reps: 3 + (index % 15), lapses: index % 3,
        intervalDays: 3, learningStepIndex: 0, lastReviewedAt: new Date(Date.parse("2026-10-10T08:00:00.000Z") + index * 60_000).toISOString(), lastRating: (["again", "hard", "good", "easy"] as const)[index % 4] }
      : { state: "new", dueAt: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, intervalDays: 0, learningStepIndex: 0, lastReviewedAt: null, lastRating: null },
  };
}
const cards = (deckId: string, fresh: number, known: number) => [
  ...Array.from({ length: fresh }, (_, i) => snapshot(`${deckId}-new-${i}`, deckId, i, false)),
  ...Array.from({ length: known }, (_, i) => snapshot(`${deckId}-known-${i}`, deckId, i, true)),
];
const exam = (id: string, deckIds: string[], days: number): ExamPlan => ({ ...createExamPlan(today, deckIds), id, name: id, examDate: shiftExamDay(today, days), bufferDays: 3,
  studyTime: { dailyMinutes: 60, weekdays: [true, true, true, true, true, true, false], dateOverrides: [] } });

const scenarios: Array<{ name: string; exams: ExamPlan[]; cards: CardStudySnapshot[] }> = [
  { name: "60 Tage · 5.000 neu · 2.000 bekannt · 2 Prüfungen", exams: [exam("A", ["a"], 45), exam("B", ["b"], 60)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
  { name: "200 Tage · 5.000 neu · 2.000 bekannt · 2 Prüfungen", exams: [exam("A", ["a"], 150), exam("B", ["b"], 200)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
  { name: "120 Tage · gemeinsame Stapel · 2 Prüfungen", exams: [exam("A", ["a"], 60), exam("B", ["root"], 120)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
];

function median(values: number[]) { return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0; }

for (const scenario of scenarios) {
  const durations: number[] = [], slices: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    let last = performance.now(), longest = 0;
    const heartbeat = setInterval(() => { const current = performance.now(); longest = Math.max(longest, current - last - 1); last = current; }, 1);
    const startedAt = performance.now();
    await createExamPortfolioForecast(decks, scenario.cards, scenario.exams, options);
    durations.push(performance.now() - startedAt);
    longest = Math.max(longest, performance.now() - last);
    clearInterval(heartbeat);
    slices.push(longest);
  }
  console.log(`${scenario.name}: Median ${Math.round(median(durations))} ms, längster Block ${Math.round(median(slices))} ms (Läufe ${durations.map(Math.round).join("/")})`);
}
