import React from "react";
import type { ExamPlan } from "../coreTypes.ts";
import { CoreTag } from "../ui/coreUi.tsx";

export function ExamCalendarFilters({ exams, shown, color, onToggle }: {
  exams: ExamPlan[]; shown: ExamPlan[]; color: (exam: ExamPlan) => string; onToggle: (id: string) => void;
}) {
  const selected = new Set(shown.map((exam) => exam.id));
  return <div role="group" aria-label="Prüfungen im Kalender" className="order-last flex min-w-0 basis-full flex-wrap gap-x-1 sm:order-none sm:basis-auto sm:justify-end">
    {exams.map((exam) => {
      const active = selected.has(exam.id), tint = color(exam);
      return <button key={exam.id} type="button" aria-pressed={active} onClick={() => onToggle(exam.id)} className="core-exam-filter" style={{ "--core-exam-tint": tint } as React.CSSProperties}><CoreTag tone={active ? "neutral" : "outline"} dot={tint}>{exam.name}</CoreTag></button>;
    })}
  </div>;
}
