import * as v from "valibot";
import type { AiCardHelpRequest } from "./aiCardHelpContract.ts";
import { noteMaterialText } from "./aiLearningSummary.ts";
import type { SourceUnit } from "./aiSourceCards.ts";
import { MAX_SOURCE_CARDS_PER_PORTION, MAX_SOURCE_PORTION_CHARS, MAX_SOURCE_PORTION_UNITS, SOURCE_CARD_LIMITS, type AiSourceCardsRequest, type GeneratedSourceCards } from "./aiSourceCardsContract.ts";
import { MAX_AI_SOURCE_WISHES_CHARS, createAiSourceCreationDraft } from "./aiSourceCreation.ts";
import type { Note } from "./coreTypes.ts";
import { evaluateNoteChoice } from "./notePresentation.ts";

export const QUIZ_QUESTION_FORMS = [
  { value: "single-choice", label: "Single Choice" },
  { value: "multiple-choice", label: "Multiple Choice" },
] as const;
export const QUIZ_QUESTION_COUNT = { min: 5, max: 20, initial: 10 } as const;
export const QUIZ_TITLE_MAX = 200;
const MAX_QUIZ_ATTEMPTS = 100;
/** Cards opened per quiz; the material of one request rarely holds more. */
const QUIZ_CARD_SAMPLE = 60;

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const timestamp = v.pipe(v.string(), v.isoTimestamp());
const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const questionForm = v.picklist(QUIZ_QUESTION_FORMS.map((form) => form.value));
const questionSchema = v.strictObject({
  id: identifier,
  form: questionForm,
  front: text(SOURCE_CARD_LIMITS.text),
  options: v.pipe(v.array(v.strictObject({ text: text(SOURCE_CARD_LIMITS.text), correct: v.boolean() })), v.minLength(2), v.maxLength(SOURCE_CARD_LIMITS.options)),
  explanation: v.pipe(v.string(), v.maxLength(SOURCE_CARD_LIMITS.explanation)),
});
const optionIndex = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(SOURCE_CARD_LIMITS.options - 1));
const attemptSchema = v.strictObject({
  startedAt: timestamp,
  finishedAt: timestamp,
  durationMs: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(0))),
  answers: v.record(identifier, v.pipe(v.array(optionIndex), v.minLength(1))),
  helped: v.array(identifier),
});
const quizSchema = v.strictObject({
  version: v.literal(1),
  id: identifier,
  deckId: identifier,
  title: text(QUIZ_TITLE_MAX),
  source: v.variant("kind", [
    v.strictObject({ kind: v.literal("cards"), withSubdecks: v.boolean() }),
    v.strictObject({ kind: v.literal("file"), fileName: text(255) }),
    /** The questions answered wrong in another quiz. */
    v.strictObject({ kind: v.literal("quiz"), quizId: identifier }),
  ]),
  settings: v.strictObject({
    questionCount: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(QUIZ_QUESTION_COUNT.max)),
    cardForms: v.pipe(v.array(questionForm), v.minLength(1)),
    wishes: v.pipe(v.string(), v.maxLength(MAX_AI_SOURCE_WISHES_CHARS)),
    trackTime: v.boolean(),
  }),
  createdAt: timestamp,
  updatedAt: timestamp,
  questions: v.pipe(v.array(questionSchema), v.minLength(1), v.maxLength(MAX_SOURCE_CARDS_PER_PORTION)),
  attempts: v.pipe(v.array(attemptSchema), v.maxLength(MAX_QUIZ_ATTEMPTS)),
});

export type Quiz = v.InferOutput<typeof quizSchema>;
export type QuizQuestion = Quiz["questions"][number];
export type QuizQuestionForm = QuizQuestion["form"];
export type QuizSource = Quiz["source"];
export type QuizSettings = Quiz["settings"];
/** `answers` holds the chosen option indices of each answered question; `helped` the questions whose AI help was used. */
export type QuizAttempt = Quiz["attempts"][number];

const hasValidChoice = (question: QuizQuestion) => {
  const correct = question.options.filter((option) => option.correct).length;
  return question.form === "single-choice" ? correct === 1 : correct >= 1 && correct < question.options.length;
};

export function readQuiz(value: unknown): Quiz {
  const parsed = v.safeParse(quizSchema, value);
  if (!parsed.success || !parsed.output.questions.every(hasValidChoice) || new Set(parsed.output.questions.map((question) => question.id)).size !== parsed.output.questions.length) {
    throw new Error("Das gespeicherte Quiz ist ungültig und kann nicht geöffnet werden.");
  }
  return parsed.output;
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

/** Older attempts fall out beyond the stored limit. */
export function addQuizAttempt(quiz: Quiz, attempt: QuizAttempt): Quiz {
  return { ...quiz, updatedAt: attempt.finishedAt, attempts: [...quiz.attempts, attempt].slice(-MAX_QUIZ_ATTEMPTS) };
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
    ...quiz, id, title: `${quiz.title.replace(/ · nur falsche$/, "").slice(0, QUIZ_TITLE_MAX - 14)} · nur falsche`, source: { kind: "quiz", quizId: quiz.id },
    settings: { ...quiz.settings, questionCount: questions.length }, createdAt: now, updatedAt: now, questions, attempts: [],
  };
}

export interface QuizGenerationInput {
  /** The decks whose cards a card quiz asks about. */
  deckIds: string[];
  /** The PDF of a file quiz; it is read for the questions and never stored. */
  file: File | null;
  settings: QuizSettings;
}

export interface QuizMaterialSources {
  listCardIds: (deckIds: string[]) => Promise<string[]>;
  openNotes: (cardIds: string[]) => Promise<Note[]>;
  readFile: (file: File) => Promise<SourceUnit[]>;
  request: (request: AiSourceCardsRequest, signal: AbortSignal) => Promise<GeneratedSourceCards>;
}

const QUIZ_WISH = (count: number) => `Die Karten sind Fragen eines Quiz zur Selbstprüfung. Erstelle genau ${count} Fragen zu verschiedenen Einheiten des Materials. Jede Frage hat genau vier Antwortmöglichkeiten.`;
export const MAX_QUIZ_WISHES_CHARS = MAX_AI_SOURCE_WISHES_CHARS - QUIZ_WISH(QUIZ_QUESTION_COUNT.max).length - 1;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/**
 * The material of one request, drawn at random: the model asks about the first units it reads, so the same order would
 * give the same quiz every time.
 */
export function sampleQuizMaterial(units: readonly SourceUnit[], random = Math.random): SourceUnit[] {
  const sample: SourceUnit[] = [];
  let size = 0;
  for (const unit of shuffled(units, random)) {
    const clipped = { label: unit.label.slice(0, 120), text: unit.text.slice(0, MAX_SOURCE_PORTION_CHARS) };
    if (sample.length === MAX_SOURCE_PORTION_UNITS || size + clipped.text.length > MAX_SOURCE_PORTION_CHARS) continue;
    sample.push(clipped);
    size += clipped.text.length;
  }
  return sample;
}

/** The route sizes its card range by the material; the largest amount keeps short material from capping the question count. */
export function quizSourceCardsRequest(units: readonly SourceUnit[], settings: QuizSettings): AiSourceCardsRequest {
  return {
    settings: { ...createAiSourceCreationDraft().settings, amount: "more", cardForms: settings.cardForms, wishes: [QUIZ_WISH(settings.questionCount), settings.wishes].filter(Boolean).join("\n") },
    units: units.map((unit, index) => ({ id: `s${index + 1}`, ...unit })), avoid: [], limit: settings.questionCount,
  };
}

/** The model mostly lists the right option first; the quiz shows the options in random order. */
export function quizQuestionsFromCards(generated: GeneratedSourceCards, random = Math.random): QuizQuestion[] {
  return generated.cards.flatMap((card, index) => card.form === "single-choice" || card.form === "multiple-choice"
    ? [{ id: `q${index + 1}`, form: card.form, front: card.front, options: shuffled(card.options, random), explanation: card.explanation }] : []);
}

export async function generateQuizQuestions(input: QuizGenerationInput, sources: QuizMaterialSources, signal: AbortSignal, random = Math.random): Promise<QuizQuestion[]> {
  let units: SourceUnit[];
  if (input.file) units = await sources.readFile(input.file);
  else {
    const cardIds = shuffled(await sources.listCardIds(input.deckIds), random).slice(0, QUIZ_CARD_SAMPLE);
    signal.throwIfAborted();
    const notes = [...new Map((await sources.openNotes(cardIds)).map((note) => [note.id, note])).values()];
    units = notes.flatMap((note) => {
      const material = noteMaterialText(note);
      return material?.text ? [{ label: material.label, text: material.text }] : [];
    });
  }
  signal.throwIfAborted();
  if (!units.length) throw new Error(input.file ? "Die Datei enthält keinen lesbaren Text." : "Der Stapel enthält keine Karten mit lesbarem Text.");
  const questions = quizQuestionsFromCards(await sources.request(quizSourceCardsRequest(sampleQuizMaterial(units, random), input.settings), signal), random);
  if (!questions.length) throw new Error("Die KI hat keine verwendbaren Fragen geliefert. Versuche es erneut.");
  return questions;
}
