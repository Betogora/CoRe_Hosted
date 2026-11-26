import type { AiCardHelpRequest } from "./aiCardHelpContract.ts";
import type { SourceCardProposal } from "./aiSourceCards.ts";
import { evaluateNoteChoice } from "./notePresentation.ts";

export const QUIZ_QUESTION_FORMS = [
  { value: "single-choice", label: "Single Choice" },
  { value: "multiple-choice", label: "Multiple Choice" },
] as const;
export const QUIZ_QUESTION_COUNT = { min: 5, max: 20, initial: 10 } as const;

export type QuizQuestionForm = typeof QUIZ_QUESTION_FORMS[number]["value"];
/** A card suggestion as the source-card route returns it, so a question is stored as a card without translation. */
export type QuizQuestion = SourceCardProposal & { form: QuizQuestionForm };

export type QuizSource =
  | { kind: "cards"; withSubdecks: boolean; cardCount: number }
  | { kind: "file"; fileName: string }
  /** The questions answered wrong in another quiz. */
  | { kind: "quiz"; quizId: string };

export interface QuizSettings {
  questionCount: number;
  cardForms: QuizQuestionForm[];
  wishes: string;
  trackTime: boolean;
}

export interface QuizAttempt {
  startedAt: string;
  finishedAt: string;
  /** Only with `settings.trackTime`. */
  durationMs?: number;
  /** Chosen option indices per question id; an unanswered question is missing. */
  answers: Record<string, number[]>;
  /** Questions whose AI help was used before handing in. */
  helped: string[];
}

export interface Quiz {
  version: 1;
  id: string;
  deckId: string;
  title: string;
  source: QuizSource;
  settings: QuizSettings;
  createdAt: string;
  updatedAt: string;
  questions: QuizQuestion[];
  attempts: QuizAttempt[];
}

export const quizOptionId = (index: number) => String(index);

/** The stored option indices as the selection the option list shows. */
export function quizSelection(chosen: readonly number[] = []): Record<string, boolean> {
  return Object.fromEntries(chosen.map((index) => [quizOptionId(index), true]));
}

/** Multiple choice counts only when every option is judged right. */
export function isQuizAnswerCorrect(question: QuizQuestion, chosen: readonly number[] = []): boolean {
  const options = question.options.map((option, index) => ({ id: quizOptionId(index), correct: option.correct }));
  return evaluateNoteChoice({ mode: question.form === "single-choice" ? "single" : "multiple", options }, quizSelection(chosen)).every((option) => option.correct);
}

export function scoreQuizAttempt(quiz: Quiz, attempt: QuizAttempt) {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((question) => isQuizAnswerCorrect(question, attempt.answers[question.id])).length;
  return { correct, total, percent: total ? Math.round(correct / total * 100) : 0 };
}

/**
 * What the AI help learns before handing in: the question and its options, without which of them are right and without
 * the explanation. The contract demands an answer, so the unmarked options stand there.
 */
export function quizHelpCard(question: QuizQuestion): AiCardHelpRequest["card"] {
  return { prompt: question.front, answer: ["Antwortmöglichkeiten:", ...question.options.map((option, index) => `${String.fromCharCode(65 + index)}) ${option.text}`)].join("\n") };
}

/** Minutes and seconds, as in `8:12`. */
export function formatQuizDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A quiz of its own from the questions the attempt got wrong, so its result never mixes with the full quiz. */
export function createRetryQuiz(quiz: Quiz, attempt: QuizAttempt, id: string, now: string): Quiz {
  const questions = quiz.questions.filter((question) => !isQuizAnswerCorrect(question, attempt.answers[question.id]));
  return {
    ...quiz, id, title: `${quiz.title.replace(/ · nur falsche$/, "")} · nur falsche`, source: { kind: "quiz", quizId: quiz.id },
    settings: { ...quiz.settings, questionCount: questions.length }, createdAt: now, updatedAt: now, questions, attempts: [],
  };
}
