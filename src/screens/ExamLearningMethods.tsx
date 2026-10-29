import React from "react";
import { BookOpen, ClipboardCheck, Files, ListChecks } from "lucide-react";
import type { ExamPlan } from "../coreTypes.ts";

type Methods = Pick<ExamPlan, "readSummaryBeforeTopics" | "quizChaptersPerTask">;

export function ExamLearningMethods({ plan, onChange }: { plan: Methods; onChange: (fields: Partial<Methods>) => void }) {
  const quizGroup = React.useId();
  const bundled = (plan.quizChaptersPerTask ?? 1) > 1;
  return <div className="grid min-w-0 gap-5" data-testid="exam-learning-methods">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className={`flex min-h-control min-w-0 cursor-pointer items-start gap-4 rounded-panel border p-4 sm:p-5 ${plan.readSummaryBeforeTopics ? "border-core-action bg-core-info-soft" : "border-core-border bg-core-surface"}`}>
        <BookOpen size={28} aria-hidden="true" className="shrink-0 text-core-action" />
        <span className="min-w-0 flex-1 core-body font-semibold text-core-text">Vor jedem Kapitel Zusammenfassung lesen</span>
        <input type="checkbox" aria-label="Vor jedem Kapitel Zusammenfassung lesen" className="mt-1 size-5 shrink-0 accent-core-action" checked={plan.readSummaryBeforeTopics ?? false} onChange={(event) => onChange({ readSummaryBeforeTopics: event.target.checked })} />
      </label>
      <label className={`flex min-h-control min-w-0 cursor-pointer items-start gap-4 rounded-panel border p-4 sm:p-5 ${plan.quizChaptersPerTask ? "border-core-action bg-core-info-soft" : "border-core-border bg-core-surface"}`}>
        <ClipboardCheck size={28} aria-hidden="true" className="shrink-0 text-core-action" />
        <span className="min-w-0 flex-1 core-body font-semibold text-core-text">Wissen mit Quizzen überprüfen</span>
        <input type="checkbox" aria-label="Wissen mit Quizzen überprüfen" className="mt-1 size-5 shrink-0 accent-core-action" checked={Boolean(plan.quizChaptersPerTask)} onChange={(event) => onChange({ quizChaptersPerTask: event.target.checked ? 1 : undefined })} />
      </label>
    </div>
    {plan.quizChaptersPerTask ? <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-3 core-body font-semibold text-core-text">Wann möchtest du dich überprüfen?</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className={`flex min-h-control min-w-0 cursor-pointer items-center gap-3 rounded-control border p-4 ${!bundled ? "border-core-action bg-core-info-soft" : "border-core-border bg-core-surface"}`}>
          <ListChecks size={24} aria-hidden="true" className="shrink-0 text-core-muted" />
          <span className="min-w-0 flex-1 core-body text-core-text">Nach jedem Kapitel</span>
          <input type="radio" name={quizGroup} className="size-5 shrink-0 accent-core-action" checked={!bundled} onChange={() => onChange({ quizChaptersPerTask: 1 })} />
        </label>
        <label className={`flex min-h-control min-w-0 cursor-pointer items-center gap-3 rounded-control border p-4 ${bundled ? "border-core-action bg-core-info-soft" : "border-core-border bg-core-surface"}`}>
          <Files size={24} aria-hidden="true" className="shrink-0 text-core-muted" />
          <span className="min-w-0 flex-1 core-body text-core-text">Mehrere Kapitel bündeln</span>
          <input type="radio" name={quizGroup} className="size-5 shrink-0 accent-core-action" checked={bundled} onChange={() => onChange({ quizChaptersPerTask: 3 })} />
        </label>
      </div>
      {bundled ? <label className="grid max-w-xs gap-2 core-body font-semibold text-core-muted">Kapitel pro Quiz<input type="number" inputMode="numeric" min={2} max={200} className="min-h-control w-full min-w-0 rounded-control border border-core-border bg-core-surface px-3 text-core-text" value={plan.quizChaptersPerTask} onChange={(event) => onChange({ quizChaptersPerTask: Math.min(200, Math.max(2, Math.round(Number(event.target.value) || 2))) })} /></label> : null}
    </fieldset> : null}
  </div>;
}
