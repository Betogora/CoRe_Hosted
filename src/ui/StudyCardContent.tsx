import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { CardVariant, LearningItem, NoteTypeDefinitionV1 } from "../coreTypes.ts";
import { stripHtml } from "../htmlSafety.ts";
import { CardPresentationSurface } from "./CardPresentationSurface.tsx";

function normalizeChoiceOptions(value: unknown) {
  if (Array.isArray(value)) return value.map((option) => String(option).trim()).filter(Boolean);
  return String(value ?? "").split(/\n+/).map((option) => option.trim()).filter(Boolean);
}

function normalizedAnswer(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

function sameAnswer(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export interface StudyCardContentProps {
  item?: LearningItem | null;
  variant?: CardVariant | null;
  definition?: NoteTypeDefinitionV1 | null;
  mediaUrls?: Record<string, string>;
  revealed: boolean;
  selectedChoice: string;
  onSelectChoice: (option: string) => void;
  questionRef?: React.RefObject<HTMLDivElement | null>;
  answerRef?: React.RefObject<HTMLDivElement | null>;
}

export function StudyCardContent({ item, variant, definition, mediaUrls = {}, revealed, selectedChoice, onSelectChoice, questionRef, answerRef }: StudyCardContentProps) {
  const rawCardType = String(item?.kind ?? item?.cardType ?? variant?.meta?.cardType ?? "basic");
  const cardType = variant?.variantType === "reverse" ? "basic-reversed" : rawCardType;
  const answerOptions = normalizeChoiceOptions(variant?.answerOptionsJson ?? item?.meta?.answerOptions ?? []);
  const expectedAnswer = normalizedAnswer(variant?.expectedAnswerJson ?? item?.meta?.correctAnswer ?? item?.meta?.expectedAnswer ?? variant?.back ?? "");
  const isMultipleChoice = cardType === "multiple-choice" && answerOptions.length >= 2 && expectedAnswer && answerOptions.some((option) => sameAnswer(option, expectedAnswer));
  const selectedChoiceIsCorrect = Boolean(isMultipleChoice && selectedChoice && sameAnswer(selectedChoice, expectedAnswer));
  const feedbackClass = !selectedChoice
    ? "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-secondary)]"
    : selectedChoiceIsCorrect
      ? "border-core-success bg-core-success-soft text-core-text"
      : "border-core-danger bg-core-danger-soft text-core-text";
  const presentationProps = { item, variant, definition, mediaUrls, surface: "review" as const, showCompatibility: false };

  return (
    <div className="w-full">
      <div ref={questionRef} tabIndex={-1} role="group" aria-label="Frage" className="core-study-card-front text-[var(--core-text)] outline-none">
        <CardPresentationSurface {...presentationProps} side="question" title="Frage" loadingLabel={stripHtml(variant?.front ?? "")} />
      </div>

      {isMultipleChoice ? (
        <div className="mt-6 grid gap-3">
          {answerOptions.map((option, index) => {
            const isSelected = sameAnswer(option, selectedChoice);
            const isCorrect = sameAnswer(option, expectedAnswer);
            const isWrongSelection = revealed && isSelected && !isCorrect;
            const stateClass = revealed
              ? isCorrect
                ? "core-mcq-option-correct border-core-success bg-core-success-soft text-core-text"
                : isWrongSelection
                  ? "core-mcq-option-wrong border-core-danger bg-core-danger-soft text-core-text"
                  : "border-[var(--core-border)] bg-core-surface text-[var(--core-text-muted)]"
              : isSelected
                ? "border-[var(--core-action-primary)] bg-[var(--core-surface-muted)] text-[var(--core-text)]"
                : "border-[var(--core-border)] bg-core-surface text-[var(--core-text-secondary)] hover:border-[var(--core-border-interactive)] hover:bg-[var(--core-surface-muted)]";
            return (
              <button key={option} type="button" onClick={() => onSelectChoice(option)} disabled={revealed} aria-pressed={isSelected} aria-label={`Antwortoption ${String.fromCharCode(65 + index)}: ${option}`} className={`core-mcq-option flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left core-body font-semibold ${stateClass}`}>
                <span><span className="mr-2 core-caption uppercase tracking-wide opacity-70">{String.fromCharCode(65 + index)}</span>{option}</span>
                {revealed && isCorrect ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : null}
                {isWrongSelection ? <XCircle className="shrink-0" size={18} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {cardType === "multiple-choice" && !isMultipleChoice ? (
        <div className="mt-6 rounded-2xl border border-core-warning bg-core-warning-soft p-4 core-body font-semibold text-core-text" role="alert">
          Diese Multiple-Choice-Karte hat keine vollständigen Antwortoptionen und wird wie eine normale Karte angezeigt.
        </div>
      ) : null}

      {revealed ? (
        <>
          <div data-testid="study-card-answer-separator" className="my-8 h-0.5 bg-[var(--core-border-interactive)] opacity-70" />
          <div ref={answerRef} tabIndex={-1} role="group" aria-label="Antwort" className="core-study-card-back text-[var(--core-text)] outline-none">
            <CardPresentationSurface {...presentationProps} side="answer" title="Antwort" loadingLabel={stripHtml(variant?.back ?? "")} />
          </div>
          {isMultipleChoice ? (
            <div className={`core-mcq-feedback mt-5 rounded-2xl border p-4 ${feedbackClass}`}>
              <p className="font-semibold">{selectedChoice ? (selectedChoiceIsCorrect ? "Richtig ausgewählt." : "Nicht ganz.") : "Lösung aufgedeckt."}</p>
              <p className="mt-2">Richtige Antwort: {expectedAnswer}</p>
              {selectedChoice ? <p className="mt-1">Deine Auswahl: {selectedChoice}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
