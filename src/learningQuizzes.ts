import * as v from "valibot";
import { deleteLearningDocument, listLearningDocuments, writeLearningDocument } from "./cloudLearningDocuments.ts";
import type { LearningContentAccount } from "./learningSummaries.ts";
import { readQuiz, type Quiz, type QuizAttempt } from "./quiz.ts";

/** Local copy: `revision` is the cloud revision it builds on, `pending` marks changes not yet in the cloud, a null quiz a pending deletion. */
interface StoredQuiz { id: string; deckId: string; quiz: Quiz | null; revision: number | null; pending: boolean }
type CloudAccount = LearningContentAccount & { cloud: NonNullable<LearningContentAccount["cloud"]> };
const TABLE = "learning_quizzes";

async function withQuizStore<T>(userId: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  if (!v.safeParse(v.pipe(v.string(), v.minLength(1), v.maxLength(200)), userId).success) throw new Error("Zum Speichern ist ein aktives Konto erforderlich.");
  if (typeof indexedDB === "undefined") throw new Error("Der lokale Speicher für Quizze ist nicht verfügbar.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`core.learningQuizzes.v1.${encodeURIComponent(userId)}`, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("quizzes", { keyPath: "id" }).createIndex("deckId", "deckId"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Der lokale Speicher für Quizze konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der lokale Speicher ist blockiert. Schließe andere CoRe-Tabs und versuche es erneut."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("quizzes", mode), request = run(transaction.objectStore("quizzes"));
      transaction.oncomplete = () => resolve(request?.result as T);
      transaction.onabort = transaction.onerror = () => reject(new Error("Die Quizze konnten nicht lokal gespeichert werden."));
    });
  } finally { db.close(); }
}
const readStored = (userId: string, deckId: string) => withQuizStore<StoredQuiz[]>(userId, "readonly", (store) => store.index("deckId").getAll(deckId));
const getStored = (userId: string, id: string) => withQuizStore<StoredQuiz | undefined>(userId, "readonly", (store) => store.get(id));
const writeStored = (userId: string, records: StoredQuiz[], removed: string[] = []) => withQuizStore<void>(userId, "readwrite", (store) => {
  for (const record of records) store.put(record);
  for (const id of removed) store.delete(id);
});

/** Attempts of both versions, each once, in the order they were finished. */
function mergeAttempts(a: QuizAttempt[], b: QuizAttempt[]): QuizAttempt[] {
  const byTime = new Map([...a, ...b].map((attempt) => [`${attempt.startedAt}|${attempt.finishedAt}`, attempt]));
  return [...byTime.values()].sort((x, y) => x.finishedAt.localeCompare(y.finishedAt)).slice(-100);
}

/** Pushes one pending record; after another device saved in between, both devices' attempts are kept on the newer cloud state. */
async function pushQuiz(account: CloudAccount, record: StoredQuiz, retry = true): Promise<boolean> {
  const { userId, cloud } = account;
  if (!record.quiz) {
    if (record.revision !== null) await deleteLearningDocument(cloud, TABLE, record.id);
    await writeStored(userId, [], [record.id]);
    return true;
  }
  const result = await writeLearningDocument(cloud, TABLE, { userId, id: record.id, deckId: record.deckId, document: record.quiz, baseRevision: record.revision });
  if ("revision" in result) {
    await writeStored(userId, [{ ...record, revision: result.revision, pending: false }]);
    return true;
  }
  const remote = result.conflict && !result.conflict.deleted ? readQuiz(result.conflict.document) : null;
  if (!remote) { await writeStored(userId, [], [record.id]); return true; }
  const merged: StoredQuiz = { ...record, quiz: { ...remote, attempts: mergeAttempts(remote.attempts, record.quiz.attempts) }, revision: result.conflict!.revision };
  await writeStored(userId, [merged]);
  return retry ? pushQuiz(account, merged, false) : false;
}

/** Quizzes of a deck, newest first: the cloud state merged with changes this browser has not uploaded yet, which are retried here. */
export async function loadDeckQuizzes(account: LearningContentAccount, deckId: string): Promise<Quiz[]> {
  const { userId, cloud } = account;
  const remote = cloud ? await listLearningDocuments(cloud, TABLE, [deckId]).catch(() => null) : null;
  if (cloud && remote) {
    const local = await readStored(userId, deckId), pending = new Set(local.filter((record) => record.pending).map((record) => record.id)), known = new Set(remote.map((row) => row.id));
    await writeStored(userId,
      remote.filter((row) => !row.deleted && !pending.has(row.id)).map((row) => ({ id: row.id, deckId, quiz: readQuiz(row.document), revision: row.revision, pending: false })),
      [...remote.filter((row) => row.deleted && !pending.has(row.id)).map((row) => row.id), ...local.filter((record) => !record.pending && !known.has(record.id)).map((record) => record.id)]);
    for (const record of local.filter((item) => item.pending)) await pushQuiz({ ...account, cloud }, record).catch(() => false);
  }
  return (await readStored(userId, deckId)).flatMap((record) => record.quiz ? [readQuiz(record.quiz)] : [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** Saves locally first and then to the account; offline the change waits for the next load. */
export async function saveDeckQuiz(account: LearningContentAccount, value: Quiz): Promise<Quiz> {
  const quiz = readQuiz(value), { userId, cloud } = account, existing = await getStored(userId, quiz.id);
  const record: StoredQuiz = { id: quiz.id, deckId: quiz.deckId, quiz, revision: existing?.revision ?? null, pending: Boolean(cloud) };
  await writeStored(userId, [record]);
  if (!cloud) return quiz;
  await pushQuiz({ ...account, cloud }, record).catch(() => false);
  return (await getStored(userId, quiz.id))?.quiz ?? quiz;
}

/** Deletes on every device; offline the deletion waits as a local mark. */
export async function deleteDeckQuiz(account: LearningContentAccount, id: string): Promise<void> {
  const { userId, cloud } = account, existing = await getStored(userId, id);
  if (!existing) return;
  if (!cloud || existing.revision === null) return writeStored(userId, [], [id]);
  const record = { ...existing, quiz: null, pending: true };
  await writeStored(userId, [record]);
  await pushQuiz({ ...account, cloud }, record).catch(() => false);
}
