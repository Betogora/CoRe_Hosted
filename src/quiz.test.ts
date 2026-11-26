import assert from "node:assert/strict";
import test from "node:test";
import { createRetryQuiz, formatQuizDuration, isQuizAnswerCorrect, quizHelpCard, scoreQuizAttempt, type Quiz, type QuizQuestion } from "./quiz.ts";

const question = (id: string, form: QuizQuestion["form"], correct: boolean[]): QuizQuestion =>
  ({ id, form, front: `Frage ${id}`, back: "", options: correct.map((value, index) => ({ text: `Option ${index}`, correct: value })), explanation: `Erklärung ${id}`, sources: ["s1"], sourceLabels: ["Seite 1"] });
const single = question("a", "single-choice", [false, true, false]);
const multiple = question("b", "multiple-choice", [true, false, true]);
const quiz: Quiz = {
  version: 1, id: "quiz", deckId: "deck", title: "Probe", source: { kind: "cards", withSubdecks: false, cardCount: 2 },
  settings: { questionCount: 2, cardForms: ["single-choice", "multiple-choice"], wishes: "", trackTime: false },
  createdAt: "2026-11-20T09:00:00.000Z", updatedAt: "2026-11-20T09:00:00.000Z", questions: [single, multiple], attempts: [],
};

test("multiple choice counts only when exactly the right options are chosen; an open question is wrong", () => {
  assert.equal(isQuizAnswerCorrect(single, [1]), true);
  assert.equal(isQuizAnswerCorrect(single, [0]), false);
  assert.equal(isQuizAnswerCorrect(single, undefined), false);
  assert.equal(isQuizAnswerCorrect(multiple, [0, 2]), true);
  assert.equal(isQuizAnswerCorrect(multiple, [0]), false);
  assert.equal(isQuizAnswerCorrect(multiple, [0, 1, 2]), false);
  assert.equal(isQuizAnswerCorrect(multiple, []), false);
});

test("an attempt scores right answers as a rounded percentage", () => {
  const attempt = { startedAt: "", finishedAt: "", answers: { a: [1], b: [0] }, helped: [] };
  assert.deepEqual(scoreQuizAttempt(quiz, attempt), { correct: 1, total: 2, percent: 50 });
  assert.deepEqual(scoreQuizAttempt({ ...quiz, questions: [] }, attempt), { correct: 0, total: 0, percent: 0 });
  assert.equal(formatQuizDuration(492_000), "8:12");
});

test("repeating the mistakes creates a quiz of its own from the wrong questions", () => {
  const retry = createRetryQuiz(quiz, { startedAt: "", finishedAt: "", answers: { a: [1], b: [0] }, helped: [] }, "retry", "2026-11-21T09:00:00.000Z");
  assert.deepEqual(retry.questions, [multiple]);
  assert.deepEqual(retry.source, { kind: "quiz", quizId: "quiz" });
  assert.equal(retry.title, "Probe · nur falsche");
  assert.equal(createRetryQuiz(retry, { startedAt: "", finishedAt: "", answers: {}, helped: [] }, "again", "2026-11-22T09:00:00.000Z").title, "Probe · nur falsche");
  assert.deepEqual(retry.attempts, []);
});

test("the AI help gets the question and its options without the solution", () => {
  const card = quizHelpCard(single);
  assert.deepEqual(card, { prompt: "Frage a", answer: "Antwortmöglichkeiten:\nA) Option 0\nB) Option 1\nC) Option 2" });
  assert.deepEqual(quizHelpCard(question("a", "single-choice", [true, false, false])), card);
});
