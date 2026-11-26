import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { fakeLearningCloud, freshDevice as resetDevice } from "../tests/support/fakeLearningCloud.ts";
import { deleteDeckQuiz, loadDeckQuizzes, saveDeckQuiz } from "./learningQuizzes.ts";
import { addQuizAttempt, type Quiz } from "./quiz.ts";

const freshDevice = (userId: string) => resetDevice(`core.learningQuizzes.v1.${encodeURIComponent(userId)}`);
const fakeCloud = () => { const cloud = fakeLearningCloud(); return { ...cloud, rows: cloud.table("learning_quizzes") }; };
const quiz = (id: string, deckId = "deck", createdAt = "2026-11-20T09:00:00.000Z"): Quiz => ({
  version: 1, id, deckId, title: `Quiz ${id}`, source: { kind: "cards", withSubdecks: false },
  settings: { questionCount: 1, cardForms: ["single-choice"], wishes: "", trackTime: false }, createdAt, updatedAt: createdAt,
  questions: [{ id: "q1", form: "single-choice", front: "Welche?", options: [{ text: "A", correct: true }, { text: "B", correct: false }], explanation: "" }], attempts: [],
});
const attempt = (finishedAt: string) => ({ startedAt: finishedAt, finishedAt, answers: { q1: [0] }, helped: [] });

test("quizzes stay per account and deck, newest first", async () => {
  const account = { userId: `quiz-local-${crypto.randomUUID()}`, cloud: null };
  await saveDeckQuiz(account, quiz("old"));
  await saveDeckQuiz(account, quiz("new", "deck", "2026-11-21T09:00:00.000Z"));
  await saveDeckQuiz(account, quiz("other", "deck-b"));
  assert.deepEqual((await loadDeckQuizzes(account, "deck")).map((item) => item.id), ["new", "old"]);
  assert.deepEqual(await loadDeckQuizzes({ ...account, userId: `${account.userId}-other` }, "deck"), []);
  await deleteDeckQuiz(account, "old");
  assert.deepEqual((await loadDeckQuizzes(account, "deck")).map((item) => item.id), ["new"]);
  await assert.rejects(saveDeckQuiz(account, { ...quiz("bad"), questions: [] }), /ungültig/);
});

test("online quizzes reach a new device, offline changes follow on the next load, and a deletion holds everywhere", async () => {
  const cloud = fakeCloud(), account = cloud.account(`quiz-cloud-${crypto.randomUUID()}`);
  await saveDeckQuiz(account, quiz("one"));
  assert.deepEqual([cloud.rows.get("one")?.revision, cloud.rows.get("one")?.deck_id], [1, "deck"]);
  cloud.state.offline = true;
  await saveDeckQuiz(account, addQuizAttempt(quiz("one"), attempt("2026-11-20T10:00:00.000Z")));
  assert.equal(cloud.rows.get("one")?.document.attempts.length, 0);
  cloud.state.offline = false;
  await loadDeckQuizzes(account, "deck");
  assert.deepEqual([cloud.rows.get("one")?.revision, cloud.rows.get("one")?.document.attempts.length], [2, 1]);
  await freshDevice(account.userId);
  assert.deepEqual((await loadDeckQuizzes(account, "deck")).map((item) => item.attempts.length), [1]);
  await deleteDeckQuiz(account, "one");
  assert.ok(cloud.rows.get("one")?.deleted_at);
  await freshDevice(account.userId);
  assert.deepEqual(await loadDeckQuizzes(account, "deck"), []);
});

test("a quiz deleted while its first upload is on its way is deleted online too", async () => {
  const cloud = fakeCloud(), account = cloud.account(`quiz-race-${crypto.randomUUID()}`);
  let release!: () => void, inserting!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), inserted = new Promise<void>((resolve) => { inserting = resolve; });
  const from = account.cloud.from.bind(account.cloud);
  Object.assign(account.cloud, { from: (name: string) => {
    type Request = { then: (resolve: (value: unknown) => unknown) => Promise<unknown> };
    const builder = from(name) as unknown as { insert: (row: object) => Request }, insert = builder.insert;
    builder.insert = (row) => {
      const run = insert(row), then = run.then;
      inserting();
      run.then = (resolve: (value: unknown) => unknown) => gate.then(() => then(resolve));
      return run;
    };
    return builder;
  } });
  const saving = saveDeckQuiz(account, quiz("gone"));
  await inserted;
  await deleteDeckQuiz(account, "gone");
  release();
  await saving;
  assert.ok(cloud.rows.get("gone")?.deleted_at);
  assert.deepEqual(await loadDeckQuizzes(account, "deck"), []);
});

test("attempts finished on two devices in between are both kept", async () => {
  const cloud = fakeCloud(), account = cloud.account(`quiz-conflict-${crypto.randomUUID()}`);
  const stored = await saveDeckQuiz(account, quiz("shared"));
  const remote = addQuizAttempt(stored, attempt("2026-11-20T10:00:00.000Z"));
  Object.assign(cloud.rows.get("shared")!, { document: remote, revision: 2 });
  const saved = await saveDeckQuiz(account, addQuizAttempt(stored, attempt("2026-11-20T11:00:00.000Z")));
  assert.deepEqual(saved.attempts.map((item) => item.finishedAt), ["2026-11-20T10:00:00.000Z", "2026-11-20T11:00:00.000Z"]);
  assert.deepEqual([cloud.rows.get("shared")?.revision, cloud.rows.get("shared")?.document.attempts.length], [3, 2]);
});
