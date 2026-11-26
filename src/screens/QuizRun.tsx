import React from "react";
import { ArrowLeft, Check, Timer } from "lucide-react";
import { formatQuizDuration, quizHelpCard, quizOptionId, quizSelection, type Quiz, type QuizQuestion } from "../quiz.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ChoiceOptionList } from "../ui/ChoiceOptionList.tsx";
import { ActionDialog } from "../ui/coreUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { StudyAiHelp, type AskCardHelp } from "./StudyAiHelp.tsx";

export interface QuizRunState {
  quizId: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Chosen option indices per question id. */
  answers: Record<string, number[]>;
  helped: string[];
  /** The question whose AI help is open. */
  help: string | null;
  confirm: "submit" | "leave" | null;
}

export function QuizViewHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  return <div className="core-quiz-view-header">
    <CoreTooltip label={backLabel}><IconButton className="-ml-2" variant="ghost" icon={ArrowLeft} label={backLabel} onClick={onBack} /></CoreTooltip>
    <h3 className="core-heading-2 text-core-text">{title}</h3>
  </div>;
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="flex shrink-0 items-center gap-1.5 core-body tabular-nums text-core-secondary"><Timer size={16} aria-hidden="true" /><span className="sr-only">Dauer </span>{formatQuizDuration(now - startedAt)}<span className="sr-only"> Minuten</span></span>;
}

export function QuizRun({ quiz, run, onChange, onSubmit, onLeave, onAskHelp }: {
  quiz: Quiz;
  run: QuizRunState;
  onChange: (patch: Partial<QuizRunState>) => void;
  onSubmit: () => void;
  onLeave: () => void;
  onAskHelp: AskCardHelp;
}) {
  const id = React.useId();
  const total = quiz.questions.length;
  const open = quiz.questions.filter((question) => !run.answers[question.id]?.length);
  const answered = total - open.length;
  const questionId = (question: QuizQuestion) => `${id}-${question.id}`;
  const focusFirstOpen = () => {
    const element = open[0] ? document.getElementById(questionId(open[0])) : null;
    element?.scrollIntoView({ block: "start" });
    element?.querySelector<HTMLElement>(".core-mcq-option")?.focus({ preventScroll: true });
  };

  return <div className="core-quiz-view">
    <QuizViewHeader title={quiz.title} backLabel="Alle Quizze" onBack={() => answered ? onChange({ confirm: "leave" }) : onLeave()} />
    <ol className="core-quiz-questions">
      {quiz.questions.map((question, index) => <li key={question.id} id={questionId(question)} className="core-quiz-question">
        <span aria-hidden="true">{index + 1}</span>
        <h4 className="core-heading-2 text-core-text"><span className="sr-only">Frage {index + 1}: </span>{question.front}</h4>
        <StudyAiHelp entry="inline" subject="question" card={quizHelpCard(question)} open={run.help === question.id} onOpenChange={(next) => onChange({ help: next ? question.id : null })}
          onAsk={(request, signal) => {
            if (!run.helped.includes(question.id)) onChange({ helped: [...run.helped, question.id] });
            return onAskHelp(request, signal);
          }} />
        <ChoiceOptionList mode={question.form === "single-choice" ? "single" : "multiple"} revealed={false} answers={quizSelection(run.answers[question.id])}
          options={question.options.map((option, optionIndex) => ({ id: quizOptionId(optionIndex), correct: option.correct, label: option.text }))}
          onAnswersChange={(answers) => onChange({ answers: { ...run.answers, [question.id]: question.options.flatMap((_, optionIndex) => answers[quizOptionId(optionIndex)] ? [optionIndex] : []) } })} />
      </li>)}
    </ol>
    <div className="core-quiz-bar core-overlay" role="group" aria-label="Abgabe">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
          <p className="core-body font-semibold text-core-text" role="status">{answered} von {total} beantwortet</p>
          {quiz.settings.trackTime ? <ElapsedTime startedAt={run.startedAt} /> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-round bg-core-subtle" aria-hidden="true">
          <div className="h-full rounded-round bg-core-action transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${total ? answered / total * 100 : 0}%` }} />
        </div>
      </div>
      <ActionButton variant="primary" icon={Check} onClick={() => open.length ? onChange({ confirm: "submit" }) : onSubmit()}>Abgeben</ActionButton>
    </div>
    <ActionDialog open={run.confirm === "submit"} title={open.length === 1 ? "1 Frage ist noch offen" : `${open.length} Fragen sind noch offen`} description="Offene Fragen zählen als falsch."
      cancelLabel="Offene Frage zeigen" confirmLabel="Abgeben" onCancel={() => onChange({ confirm: null })} onConfirm={onSubmit}
      restoreFocus={(reason) => { if (reason === "cancel") focusFirstOpen(); }} />
    <ActionDialog open={run.confirm === "leave"} destructive title="Quiz verlassen?" description={answered === 1 ? "Deine Antwort wird verworfen." : `Deine ${answered} Antworten werden verworfen.`}
      cancelLabel="Weitermachen" confirmLabel="Verlassen" onCancel={() => onChange({ confirm: null })} onConfirm={onLeave} />
  </div>;
}
