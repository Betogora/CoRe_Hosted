import React from "react";
import type { ExamPlan } from "../coreTypes.ts";
import { examTextColor } from "./examPlanningUi.ts";

export function ExamCalendarFilters({ exams, shown, color, onToggle }: {
  exams: ExamPlan[]; shown: ExamPlan[]; color: (exam: ExamPlan) => string; onToggle: (id: string) => void;
}) {
  const selected = new Set(shown.map((exam) => exam.id));
  return <div role="group" aria-label="Prüfungen im Kalender" className="order-last flex min-w-0 basis-full flex-wrap gap-2 core-caption sm:order-none sm:basis-auto sm:justify-end">
    {exams.map((exam) => {
      const active = selected.has(exam.id), tint = color(exam);
      return <button key={exam.id} type="button" aria-pressed={active} onClick={() => onToggle(exam.id)} className="min-h-control min-w-0 max-w-full break-words rounded-inset border px-3 py-2 text-left font-semibold transition-colors" style={{ borderColor: tint, background: active ? tint : `color-mix(in srgb, ${tint} 8%, var(--core-surface))`, color: active ? examTextColor(exam) : "var(--core-text)" }}>{exam.name}</button>;
    })}
  </div>;
}
