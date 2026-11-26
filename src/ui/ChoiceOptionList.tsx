import { CheckCircle2, XCircle } from "lucide-react";
import { evaluateNoteChoice } from "../notePresentation.ts";
import { CoreVerdictControl } from "./coreUi.tsx";

export interface ChoiceOption {
  id: string;
  correct: boolean;
  /** Plain text: the accessible name, and the visible text where `html` is missing. */
  label: string;
  /** Sanitized markup of a rendered card option. */
  html?: string;
}

/** `missed`: a correct option that was not chosen. */
type OptionTone = "idle" | "selected" | "correct" | "missed" | "wrong" | "muted";

export function ChoiceOptionList({ mode, options, answers, revealed, onAnswersChange }: {
  mode: "single" | "multiple" | "kprim";
  options: readonly ChoiceOption[];
  /** `true` marks a chosen option; Kprim carries the verdict per statement and leaves undecided ones out. */
  answers: Readonly<Record<string, boolean>>;
  /** Shows right and wrong and locks the choice. */
  revealed: boolean;
  onAnswersChange?: (answers: Record<string, boolean>) => void;
}) {
  const results = evaluateNoteChoice({ mode, options }, answers);
  return <div className="grid gap-2" role="group" aria-label="Antwortoptionen">
    {options.map((option, index) => {
      const result = results[index];
      const isSelected = answers[option.id] === true;
      const letter = String.fromCharCode(65 + index);
      const tone: OptionTone = !revealed ? (isSelected && mode !== "kprim" ? "selected" : "idle")
        : mode === "kprim" ? (result.selected === null ? "idle" : result.correct ? "correct" : "wrong")
          : option.correct ? (isSelected ? "correct" : "missed") : isSelected ? "wrong" : "muted";
      const StateIcon = tone === "correct" || tone === "missed" ? CheckCircle2 : tone === "wrong" ? XCircle : null;
      const stateIcon = StateIcon ? <StateIcon className="core-mcq-state-icon" size={20} aria-hidden="true" /> : null;
      const badge = <span aria-hidden="true" className="core-mcq-letter">{letter}</span>;
      const text = option.html === undefined
        ? <div className="min-w-0 flex-1 [overflow-wrap:anywhere] core-body text-inherit">{option.label}</div>
        : <div className="card-html min-w-0 flex-1 overflow-x-auto core-body text-inherit" dangerouslySetInnerHTML={{ __html: option.html }} />;
      const feedback = tone === "correct" ? "core-mcq-option-correct" : tone === "wrong" ? "core-mcq-option-wrong" : "";
      if (mode === "kprim") return <div key={option.id} data-tone={tone} className={`core-kprim-option grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${feedback}`}>
        <div className="flex min-w-0 items-center gap-3">{badge}{text}</div>
        <div className="grid justify-items-start gap-2 sm:justify-items-end">
          <CoreVerdictControl label={`Aussage ${letter}`} disabled={revealed} value={result.selected} onValueChange={(value) => onAnswersChange?.({ ...answers, [option.id]: value })} />
          {revealed ? <p className="flex items-center gap-1.5 core-caption font-semibold text-core-text">{stateIcon}Lösung: {option.correct ? "richtig" : "falsch"}</p> : null}
        </div>
      </div>;
      const indicator = stateIcon ?? <span aria-hidden="true" className="core-mcq-indicator" data-shape={mode === "single" ? "dot" : "box"}>
        {mode === "single" ? null : <svg viewBox="0 0 17 18"><polyline points="1 9 7 14 15 4" /></svg>}
      </span>;
      return <button key={option.id} type="button" disabled={revealed} aria-pressed={isSelected} data-tone={tone}
        aria-label={`Antwortoption ${letter}: ${option.label}${tone === "correct" ? " (richtig)" : tone === "missed" ? " (richtig, nicht gewählt)" : tone === "wrong" ? " (falsch gewählt)" : ""}`}
        className={`core-mcq-option ${feedback}`}
        onClick={() => onAnswersChange?.(mode === "single" ? { [option.id]: true } : { ...answers, [option.id]: !answers[option.id] })}>{badge}{text}{indicator}</button>;
    })}
  </div>;
}
