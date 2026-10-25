import React from "react";
import type { ExamPlanningData, ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { Deck, ExamPlan, GlobalSchedulerPreferences, StudyTimeCapacity } from "../coreTypes.ts";
import { createExamPortfolioForecast, getActiveExamDeckIds, getExamDeckIds, type ExamPortfolioForecast } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";

interface ExamForecastInput {
  decks: Deck[];
  exams: ExamPlan[];
  capacity: StudyTimeCapacity;
  preferences: GlobalSchedulerPreferences;
  timeZone: string;
  now: string;
  onLoadPlanningData: ExamPlanningScreenProps["onLoadPlanningData"];
  /** Wait before calculating, so typing in the editor does not start a calculation per key. */
  delayMs?: number;
  /** Also load study states of paused, completed and past exams, for their progress; only active exams are planned. */
  includeInactive?: boolean;
  /** Off when a parent already provides the same plan, so it is computed once. */
  enabled?: boolean;
}

export type ExamForecastState = ReturnType<typeof useExamForecast>;

/**
 * Forecast of all active exams. Study states load once per deck selection; changes to dates, goals or time only
 * recalculate locally.
 */
export function useExamForecast({ decks, exams, capacity, preferences, timeZone, now, onLoadPlanningData, delayMs = 0, includeInactive = false, enabled = true }: ExamForecastInput) {
  const [result, setResult] = React.useState<{ key: string; forecast: ExamPortfolioForecast; data: ExamPlanningData } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const loaded = React.useRef<{ scope: string; revision: number; data: ExamPlanningData } | null>(null);
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const deckIds = !enabled ? [] : includeInactive ? [...new Set(exams.flatMap((exam) => [...getExamDeckIds(decks, exam)]))] : getActiveExamDeckIds(decks, exams, civilToday);
  const scope = deckIds.slice().sort().join("\n");
  const deckKey = decks.map((deck) => `${deck.id}:${deck.updatedAt}:${deck.parentDeckId ?? ""}`).join("|");
  // Of the checklist only frozen targets shape the plan; checking a task off does not recalculate.
  const targets = (preferences.examPlanning.dailyTasks ?? []).filter((task) => task.kind === "study").map((task) => [task.id, task.date, task.planningKey, task.cardIds]);
  const key = JSON.stringify([exams, capacity, targets, preferences.dayStartHour, preferences.easyDays, now, timeZone, scope, deckKey, revision]);

  const calculate = React.useEffectEvent(async (signal: AbortSignal) => {
    setBusy(true);
    setError("");
    try {
      const cached = loaded.current;
      const data = cached && cached.scope === scope && cached.revision === revision ? cached.data : await onLoadPlanningData(deckIds, signal, { fresh: revision > 0 });
      signal.throwIfAborted();
      loaded.current = { scope, revision, data };
      const forecast = await createExamPortfolioForecast(decks, data.cards, exams, { now, preferences, timeZone, capacity, signal, dailyTasks: preferences.examPlanning.dailyTasks });
      signal.throwIfAborted();
      setResult({ key, forecast, data });
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Die Prüfungsplanung konnte nicht berechnet werden.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  });

  React.useEffect(() => {
    if (!deckIds.length) {
      setResult(null);
      setBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => void calculate(controller.signal), delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The key covers every input of the calculation.
  }, [key, delayMs]);

  return {
    forecast: deckIds.length ? result?.forecast ?? null : null,
    current: result?.key === key,
    cards: result?.data.cards ?? [],
    busy,
    error,
    /** Loads the study states again, e.g. after studying elsewhere. */
    reload: () => setRevision((value) => value + 1),
  };
}
