import React from "react";
import type { ExamForecastSummary } from "../examPlanning.ts";
import { formatExamPercent } from "./examPlanningUi.ts";

/** Pace follows the current workload forecast, rather than implying a chance of passing. */
export function ExamPace({ summary, compact = false }: { summary: ExamForecastSummary; compact?: boolean }) {
  const slack = Math.max(0, summary.availableMinutes - summary.requiredMinutes);
  const comfortable = summary.feasible && slack > summary.availableMinutes * 0.2;
  return <div className="grid gap-2 rounded-control bg-core-subtle p-4" data-testid="exam-pace">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="core-body text-core-text">{!summary.feasible ? "Mehr Lernzeit nötig" : comfortable ? "Gut im Zeitplan" : "Im Zeitplan"}</strong><span className="core-caption text-core-muted">{formatExamPercent(summary.current.coverage)} Stoff bearbeitet</span></div>
    <div role="progressbar" aria-label="Bearbeiteter Prüfungsstoff" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.current.coverage * 100)} className="h-2 overflow-hidden rounded-round bg-core-border"><span className="block h-full bg-core-action" style={{ width: `${summary.current.coverage * 100}%` }} /></div>
    <p className="core-caption text-core-muted">{summary.feasible ? "Lernziel laut Prognose erreichbar." : summary.issues[0] ?? "Dein Lernziel braucht mehr Zeit."}{!compact ? " Zeiten sind geschätzt und werden aus deinem Lernstand neu berechnet." : ""}</p>
  </div>;
}
