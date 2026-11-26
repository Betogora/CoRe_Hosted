import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SOURCE_PORTION_CHARS, type AiSourceCardsRequest, type GeneratedSourceCard } from "./aiSourceCardsContract.ts";
import { MAX_AI_SOURCE_WISHES_CHARS } from "./aiSourceCreation.ts";
import { createManualNoteContent, createNote } from "./coreModel.ts";
import {
  MAX_QUIZ_WISHES_CHARS, addQuizAttempt, createRetryQuiz, formatQuizDuration, generateQuizQuestions, isQuizAnswerCorrect, quizHelpCard, quizQuestionsFromCards,
  readQuiz, sampleQuizMaterial, scoreQuizAttempt, type Quiz, type QuizQuestion,
} from "./quiz.ts";

const question = (id: string, form: QuizQuestion["form"], correct: boolean[]): QuizQuestion =>
  ({ id, form, front: `Frage ${id}`, options: correct.map((value, index) => ({ text: `Option ${index}`, correct: value })), explanation: `Erklärung ${id}` });
const single = question("a", "single-choice", [false, true, false]);
const multiple = question("b", "multiple-choice", [true, false, true]);
const quiz: Quiz = {
  version: 1, id: "quiz", deckId: "deck", title: "Probe", source: { kind: "cards", withSubdecks: false },
  settings: { questionCount: 2, cardForms: ["single-choice", "multiple-choice"], wishes: "", trackTime: false },
  createdAt: "2026-11-20T09:00:00.000Z", updatedAt: "2026-11-20T09:00:00.000Z", questions: [single, multiple], attempts: [],
};
const attempt = (answers: Record<string, number[]>, finishedAt = "2026-11-20T09:10:00.000Z") => ({ startedAt: "2026-11-20T09:05:00.000Z", finishedAt, answers, helped: [] });
/** Deterministic stand-in for Math.random, so shuffles are repeatable. */
const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

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
  assert.deepEqual(scoreQuizAttempt(quiz, attempt({ a: [1], b: [0] })), { correct: 1, total: 2, percent: 50 });
  assert.equal(formatQuizDuration(492_000), "8:12");
});

test("repeating the mistakes creates a quiz of its own from the wrong questions", () => {
  const retry = createRetryQuiz(quiz, attempt({ a: [1], b: [0] }), "retry", "2026-11-21T09:00:00.000Z");
  assert.deepEqual(retry.questions, [multiple]);
  assert.deepEqual(retry.source, { kind: "quiz", quizId: "quiz" });
  assert.equal(retry.title, "Probe · nur falsche");
  assert.equal(createRetryQuiz(retry, attempt({}), "again", "2026-11-22T09:00:00.000Z").title, "Probe · nur falsche");
  assert.deepEqual(retry.attempts, []);
  assert.equal(readQuiz(createRetryQuiz({ ...quiz, title: "x".repeat(200) }, attempt({}), "long", "2026-11-22T09:00:00.000Z")).title.length, 200);
});

test("attempts are kept in order up to their limit", () => {
  let current = quiz;
  for (let index = 0; index < 101; index += 1) current = addQuizAttempt(current, attempt({ a: [index % 3] }, new Date(Date.UTC(2026, 10, 21, 0, index)).toISOString()));
  assert.equal(current.attempts.length, 100);
  assert.deepEqual(current.attempts[0].answers, { a: [1] });
  assert.equal(current.updatedAt, current.attempts.at(-1)!.finishedAt);
});

test("the AI help gets the question and its options without the solution", () => {
  const card = quizHelpCard(single);
  assert.deepEqual(card, { prompt: "Frage a", answer: "Antwortmöglichkeiten:\nA) Option 0\nB) Option 1\nC) Option 2" });
  assert.deepEqual(quizHelpCard(question("a", "single-choice", [true, false, false])), card);
});

test("a stored quiz is validated before it opens", () => {
  assert.deepEqual(readQuiz(structuredClone(quiz)), quiz);
  assert.throws(() => readQuiz({ ...quiz, questions: [question("a", "single-choice", [true, true])] }), /ungültig/);
  assert.throws(() => readQuiz({ ...quiz, questions: [question("a", "multiple-choice", [true, true])] }), /ungültig/);
  assert.throws(() => readQuiz({ ...quiz, questions: [single, single] }), /ungültig/);
  assert.throws(() => readQuiz({ ...quiz, questions: [] }), /ungültig/);
  assert.throws(() => readQuiz({ ...quiz, source: { kind: "cards", withSubdecks: false, sourceLabels: ["Seite 1"] } }), /ungültig/);
});

test("the material is a random sample that fits one request", () => {
  const units = Array.from({ length: 40 }, (_, index) => ({ label: `Karte ${index + 1}`, text: "x".repeat(1_000) }));
  const sample = sampleQuizMaterial(units, seeded());
  assert.equal(sample.length, MAX_SOURCE_PORTION_CHARS / 1_000);
  assert.notDeepEqual(sample.map((unit) => unit.label), units.slice(0, sample.length).map((unit) => unit.label));
  assert.deepEqual(sampleQuizMaterial([{ label: "Lang", text: "y".repeat(MAX_SOURCE_PORTION_CHARS + 10) }]).map((unit) => unit.text.length), [MAX_SOURCE_PORTION_CHARS]);
});

test("generated cards become questions with shuffled options; other forms fall out", () => {
  const card = (form: GeneratedSourceCard["form"], front: string): GeneratedSourceCard => ({
    form, front, back: "", explanation: "Weil.", sources: ["s1"],
    options: form === "cloze" ? [] : ["Richtig", "Falsch 1", "Falsch 2", "Falsch 3"].map((text, index) => ({ text, correct: index === 0 })),
  });
  const questions = quizQuestionsFromCards({ cards: [card("single-choice", "Eins"), card("cloze", "{{c1::Zwei}}"), card("multiple-choice", "Drei")], warnings: [], discarded: 0 }, seeded(7));
  assert.deepEqual(questions.map((item) => [item.id, item.form, item.front, item.explanation]), [["q1", "single-choice", "Eins", "Weil."], ["q3", "multiple-choice", "Drei", "Weil."]]);
  assert.deepEqual(questions[0].options.map((option) => option.text).sort(), ["Falsch 1", "Falsch 2", "Falsch 3", "Richtig"]);
  assert.ok(questions.some((item) => !item.options[0].correct));
});

test("a card quiz asks the source-card route once about a sample of the deck's cards", async () => {
  const notes = Array.from({ length: 80 }, (_, index) => createNote({ deckId: "deck", content: createManualNoteContent({ kind: "basic", front: `Frage ${index}`, back: `Antwort ${index}`, additionalFields: [] }) }).note);
  const requests: AiSourceCardsRequest[] = [];
  let opened: string[] = [];
  const questions = await generateQuizQuestions({ deckIds: ["deck", "child"], file: null, settings: { ...quiz.settings, questionCount: 8, wishes: "Nur Jahreszahlen" } }, {
    listCardIds: async (deckIds) => { assert.deepEqual(deckIds, ["deck", "child"]); return notes.map((note) => `card-${note.id}`); },
    openNotes: async (cardIds) => { opened = cardIds; return notes.filter((note) => cardIds.includes(`card-${note.id}`)); },
    readFile: async () => assert.fail("Keine Datei"),
    request: async (request) => {
      requests.push(request);
      return { cards: [{ form: "single-choice", front: "Welche?", back: "", explanation: "", sources: ["s1"], options: [{ text: "A", correct: true }, { text: "B", correct: false }] }], warnings: [], discarded: 0 };
    },
  }, new AbortController().signal, seeded(3));
  assert.equal(opened.length, 60);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.deepEqual([request.limit, request.avoid, request.settings.cardForms, request.units.length], [8, [], ["single-choice", "multiple-choice"], 60]);
  assert.match(request.settings.wishes, /^Die Karten sind Fragen eines Quiz zur Selbstprüfung\. Erstelle genau 8 Fragen .* genau vier Antwortmöglichkeiten\.\nNur Jahreszahlen$/);
  assert.match(request.units[0].text, /^F: Frage \d+\nA: Antwort \d+$/);
  assert.equal(questions.length, 1);
  assert.ok(MAX_QUIZ_WISHES_CHARS > 1_000 && MAX_QUIZ_WISHES_CHARS < MAX_AI_SOURCE_WISHES_CHARS);
});

test("a PDF quiz reads its pages, and a quiz without questions is not created", async () => {
  const sources = {
    listCardIds: async () => assert.fail("Keine Karten"), openNotes: async () => [],
    readFile: async (file: File) => [{ label: "Seite 1", text: `Inhalt von ${file.name}` }],
    request: async (request: AiSourceCardsRequest) => {
      assert.deepEqual(request.units, [{ id: "s1", label: "Seite 1", text: "Inhalt von skript.pdf" }]);
      return { cards: [], warnings: [], discarded: 2 };
    },
  };
  await assert.rejects(generateQuizQuestions({ deckIds: [], file: new File(["%PDF"], "skript.pdf"), settings: quiz.settings }, sources, new AbortController().signal), /keine verwendbaren Fragen/);
  await assert.rejects(generateQuizQuestions({ deckIds: ["deck"], file: null, settings: quiz.settings }, { ...sources, listCardIds: async () => [] }, new AbortController().signal), /keine Karten mit lesbarem Text/);
});
