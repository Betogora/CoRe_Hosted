import { performance } from "node:perf_hooks";
import type { CardStudySnapshot } from "../src/cloudRepositoryValidation.ts";
import { createCoreDeck } from "../src/coreModel.ts";
import type { ExamPlan, ReviewRating } from "../src/coreTypes.ts";
import { createExamPortfolioForecast, shiftExamDay } from "../src/examPlanning.ts";
import { createExamPlan, createStudyTimeCapacity } from "../src/examPlanSettings.ts";
import { getGlobalSchedulerPreferences } from "../src/learningProfiles.ts";

// Fixed exam-planning scenarios: total duration and the longest uninterrupted main-thread slice.
const RUNS = 5;
const now = "2026-10-20T08:00:00.000Z", today = "2026-10-20";
const decks = [createCoreDeck({ id: "root", name: "Root" }), ...["a", "b"].map((id) => createCoreDeck({ id, name: id.toUpperCase(), parentDeckId: "root" }))];
const options = { now, preferences: getGlobalSchedulerPreferences({}), timeZone: "UTC", capacity: createStudyTimeCapacity() };

// The planning scenario follows the cards' last answers. At the default goal of 92 % about 8 % of reviews fail, so 10/10/75/5 % is
// a slightly strict everyday mix; the stress case answers each button equally often, so every fourth answer is a lapse.
const usual = (index: number): ReviewRating => (index % 20 < 2 ? "again" : index % 20 < 4 ? "hard" : index % 20 < 19 ? "good" : "easy");
const uniform = (index: number): ReviewRating => (["again", "hard", "good", "easy"] as const)[index % 4];

function snapshot(id: string, deckId: string, index: number, known: boolean, mix = usual): CardStudySnapshot {
  return {
    cardId: id, noteId: `note-${id}`, deckId, status: "active", studyRevision: 0, activeVariantCount: 0, stabilityFast: known ? 2 + index * 0.013 : 0,
    createdAt: new Date(Date.parse("2026-10-01T08:00:00.000Z") + index * 1000).toISOString(),
    study: known
      ? { state: "review", dueAt: new Date(Date.parse(now) + (index % 30) * 86_400_000).toISOString(), stability: 2 + index * 0.013, difficulty: 3 + (index % 70) / 10, reps: 3 + (index % 15), lapses: index % 3,
        intervalDays: 3, learningStepIndex: 0, lastReviewedAt: new Date(Date.parse("2026-10-10T08:00:00.000Z") + index * 60_000).toISOString(), lastRating: mix(index) }
      : { state: "new", dueAt: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, intervalDays: 0, learningStepIndex: 0, lastReviewedAt: null, lastRating: null },
  };
}
const cards = (deckId: string, fresh: number, known: number, mix = usual) => [
  ...Array.from({ length: fresh }, (_, i) => snapshot(`${deckId}-new-${i}`, deckId, i, false)),
  ...Array.from({ length: known }, (_, i) => snapshot(`${deckId}-known-${i}`, deckId, i, true, mix)),
];
const exam = (id: string, deckIds: string[], days: number): ExamPlan => ({ ...createExamPlan(today, deckIds), id, name: id, examDate: shiftExamDay(today, days), bufferDays: 3,
  studyTime: { dailyMinutes: 60, weekdays: [true, true, true, true, true, true, false], dateOverrides: [] } });

const scenarios: Array<{ name: string; budgetMs: number; exams: ExamPlan[]; cards: CardStudySnapshot[] }> = [
  { name: "60 Tage · 5.000 neu · 2.000 bekannt · 2 Prüfungen", budgetMs: 1000, exams: [exam("A", ["a"], 45), exam("B", ["b"], 60)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
  { name: "200 Tage · 5.000 neu · 2.000 bekannt · 2 Prüfungen", budgetMs: 1000, exams: [exam("A", ["a"], 150), exam("B", ["b"], 200)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
  { name: "120 Tage · gemeinsame Stapel · 2 Prüfungen", budgetMs: 1000, exams: [exam("A", ["a"], 60), exam("B", ["root"], 120)], cards: [...cards("a", 2500, 1000), ...cards("b", 2500, 1000)] },
  { name: "Stressfall 200 Tage · je 25 % jeder Bewertung", budgetMs: 2000, exams: [exam("A", ["a"], 150), exam("B", ["b"], 200)], cards: [...cards("a", 2500, 1000, uniform), ...cards("b", 2500, 1000, uniform)] },
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
  const result = median(durations), over = result > scenario.budgetMs;
  if (over) process.exitCode = 1;
  console.log(`${scenario.name}: Median ${Math.round(result)} ms${over ? ` über dem Budget von ${scenario.budgetMs} ms` : ""}, längster Block ${Math.round(median(slices))} ms (Läufe ${durations.map(Math.round).join("/")})`);
}
