import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { normalizeChoiceAnswerList, sameChoiceAnswer } from "../choiceAnswers.ts";
import type { CardVariant, LearningItem, NoteTypeDefinitionV1 } from "../coreTypes.ts";
import { stripHtml } from "../htmlSafety.ts";
import { ActionButton } from "./actionUi.tsx";
import { CardPresentationSurface } from "./CardPresentationSurface.tsx";

function normalizeChoiceOptions(value: unknown) {
  return normalizeChoiceAnswerList(Array.isArray(value) ? value : String(value ?? "").split(/\n+/));
}

function sameAnswerSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((answer) => right.some((candidate) => sameChoiceAnswer(answer, candidate)));
}

export interface StudyCardContentProps {
  item?: LearningItem | null;
  variant?: CardVariant | null;
  definition?: NoteTypeDefinitionV1 | null;
  mediaUrls?: Record<string, string>;
  revealed: boolean;
  selectedChoices: string[];
  onSelectedChoicesChange: (options: string[]) => void;
  onReveal: () => void;
  questionRef?: React.RefObject<HTMLDivElement | null>;
  answerRef?: React.RefObject<HTMLDivElement | null>;
}

export function StudyCardContent({ item, variant, definition, mediaUrls = {}, revealed, selectedChoices, onSelectedChoicesChange, onReveal, questionRef, answerRef }: StudyCardContentProps) {
  const cardType = variant?.variantType === "reverse" ? "basic-reversed" : String(item?.kind ?? item?.cardType ?? variant?.meta?.cardType ?? "basic");
  const answerOptions = normalizeChoiceOptions(variant?.answerOptionsJson ?? item?.meta?.answerOptions ?? []);
  const expectedAnswers = normalizeChoiceAnswerList(
    variant?.expectedAnswerJson
      ?? item?.meta?.correctAnswers
      ?? item?.meta?.correctAnswer
      ?? item?.meta?.expectedAnswer
      ?? "",
  );
  const isSingleChoice = cardType === "single-choice";
  const isMultipleChoice = cardType === "multiple-choice";
  const isChoice = (isSingleChoice || isMultipleChoice)
    && answerOptions.length >= 2
    && expectedAnswers.length > 0
    && expectedAnswers.length < answerOptions.length
    && (isMultipleChoice || expectedAnswers.length === 1)
    && expectedAnswers.every((answer) => answerOptions.some((option) => sameChoiceAnswer(option, answer)));
  const hasIncompleteChoice = (isSingleChoice || isMultipleChoice) && !isChoice;
  const selectedChoiceIsCorrect = Boolean(isChoice && selectedChoices.length > 0 && sameAnswerSet(selectedChoices, expectedAnswers));
  const choiceFeedbackClass = selectedChoices.length === 0
    ? "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-secondary)]"
    : selectedChoiceIsCorrect
      ? "border-core-success bg-core-success-soft text-core-text"
      : "border-core-danger bg-core-danger-soft text-core-text";
  const presentationProps = { item, variant, definition, mediaUrls, surface: "review" as const, showCompatibility: false };

  function selectChoice(option: string) {
    if (revealed || !isChoice) return;
    if (isSingleChoice) {
      onSelectedChoicesChange([option]);
      onReveal();
      return;
    }
    onSelectedChoicesChange(
      selectedChoices.some((selected) => sameChoiceAnswer(selected, option))
        ? selectedChoices.filter((selected) => !sameChoiceAnswer(selected, option))
        : [...selectedChoices, option],
    );
  }

  return (
    <div className="w-full">
      <div ref={questionRef} tabIndex={-1} role="group" aria-label="Frage" className="core-study-card-front text-[var(--core-text)] outline-none">
        <CardPresentationSurface {...presentationProps} side="question" title="Frage" loadingLabel={stripHtml(variant?.front ?? "")} />
      </div>

      {isChoice ? (
        <div className="mt-6 grid gap-3">
          {answerOptions.map((option, index) => {
            const isSelected = selectedChoices.some((selected) => sameChoiceAnswer(option, selected));
            const isCorrect = expectedAnswers.some((answer) => sameChoiceAnswer(option, answer));
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
              <button key={option} type="button" onClick={() => selectChoice(option)} disabled={revealed} aria-pressed={isSelected} aria-label={`Antwortoption ${String.fromCharCode(65 + index)}: ${option}`} className={`core-mcq-option flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left core-body font-semibold ${stateClass}`}>
                <span><span className="mr-2 core-caption uppercase tracking-wide opacity-70">{String.fromCharCode(65 + index)}</span>{option}</span>
                {revealed && isCorrect ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : null}
                {isWrongSelection ? <XCircle className="shrink-0" size={18} aria-hidden="true" /> : null}
              </button>
            );
          })}
          {isMultipleChoice && !revealed ? (
            <ActionButton type="button" variant="primary" disabled={selectedChoices.length === 0} onClick={onReveal} className="mt-1 w-fit">
              Antwort prüfen
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {hasIncompleteChoice ? (
        <div className="mt-6 rounded-2xl border border-core-warning bg-core-warning-soft p-4 core-body font-semibold text-core-text" role="alert">
          Diese Auswahlkarte hat keine vollständigen Antwortoptionen und wird wie eine normale Karte angezeigt.
        </div>
      ) : null}

      {revealed ? (
        <>
          <div data-testid="study-card-answer-separator" className="my-8 h-0.5 bg-[var(--core-border-interactive)] opacity-70" />
          <div ref={answerRef} tabIndex={-1} role="group" aria-label="Antwort" className="core-study-card-back text-[var(--core-text)] outline-none">
            <CardPresentationSurface {...presentationProps} side="answer" title="Antwort" loadingLabel={stripHtml(variant?.back ?? "")} />
          </div>
          {isChoice ? (
            <div className={`core-mcq-feedback mt-5 rounded-2xl border p-4 ${choiceFeedbackClass}`}>
              <p className="font-semibold">{selectedChoices.length > 0 ? (selectedChoiceIsCorrect ? "Richtig ausgewählt." : "Nicht ganz.") : "Lösung aufgedeckt."}</p>
              <p className="mt-2">{expectedAnswers.length === 1 ? "Richtige Antwort" : "Richtige Antworten"}: {expectedAnswers.join(", ")}</p>
              {selectedChoices.length > 0 ? <p className="mt-1">Deine Auswahl: {selectedChoices.join(", ")}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
