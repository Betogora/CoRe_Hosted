import { summarySettingsSchema, summaryChoices, type SummarySettings } from "./learningSummarySettings.ts";
export { createSummarySettings, summaryChoices, type SummarySettings } from "./learningSummarySettings.ts";
import * as v from "valibot";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteLearningDocument, listLearningDocuments, writeLearningDocument } from "./cloudLearningDocuments.ts";
import { sanitizeCardHtml, stripHtml } from "./htmlSafety.ts";

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const generationSchema = v.strictObject({
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  privacyMode: v.picklist(["zdr", "non_zdr"]),
  promptVersion: v.picklist(["learning-summary-v1", "learning-summary-v2", "learning-summary-v3"]),
  generatedAt: v.pipe(v.string(), v.isoTimestamp()),
  materialUnits: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
  relations: v.optional(v.pipe(v.array(v.strictObject({ from: v.pipe(v.string(), v.minLength(1), v.maxLength(160)), to: v.pipe(v.string(), v.minLength(1), v.maxLength(160)) })), v.maxLength(12))),
  evidence: v.optional(v.pipe(v.array(v.strictObject({
    heading: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
    references: v.pipe(v.array(v.strictObject({ label: v.pipe(v.string(), v.minLength(1)), href: v.nullable(v.string()) })), v.minLength(1), v.maxLength(500)),
  })), v.maxLength(240))),
});
export type SummaryGeneration = v.InferOutput<typeof generationSchema>;
const summarySchema = v.strictObject({
  version: v.literal(1), id: identifier, deckId: identifier,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  html: v.pipe(v.string(), v.maxLength(100_000)),
  settings: summarySettingsSchema,
  generation: v.optional(generationSchema),
  font: v.picklist(["sans", "serif"]), fontSize: v.picklist([14, 16, 22]),
  createdAt: v.pipe(v.string(), v.isoTimestamp()), updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type LearningSummary = v.InferOutput<typeof summarySchema>;
/** Heading of the generated notes section; the mind map translator skips it. */
export const SUMMARY_NOTES_HEADING = "Hinweise zum Material";

export function readLearningSummary(value: unknown): LearningSummary {
  const parsed = v.safeParse(summarySchema, value);
  if (!parsed.success || !parsed.output.title.trim() || Date.parse(parsed.output.updatedAt) < Date.parse(parsed.output.createdAt)) {
    throw new Error("Die gespeicherte Zusammenfassung ist ungültig und kann nicht geöffnet werden.");
  }
  return { ...parsed.output, title: parsed.output.title.trim(), html: sanitizeCardHtml(parsed.output.html) };
}

export function createLearningSummary(deckId: string, title: string, settings: SummarySettings, now = new Date().toISOString()): LearningSummary {
  return readLearningSummary({ version: 1, id: `summary_${crypto.randomUUID()}`, deckId, title: title.trim(), html: "", settings, font: "sans", fontSize: 16, createdAt: now, updatedAt: now });
}

/** A copy with its own id; content, settings and generation details stay, the title starts with `prefix`. */
export function duplicateLearningSummary(summary: LearningSummary, now = new Date().toISOString(), prefix = "Kopie von"): LearningSummary {
  return readLearningSummary({ ...summary, id: `summary_${crypto.randomUUID()}`, title: `${prefix} ${summary.title}`.slice(0, 120), createdAt: now, updatedAt: now });
}

export function summaryPlainText(html: string): string {
  return stripHtml(html.replace(/<(?:br|hr)\b[^>]*>/gi, "\n").replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|tr)>/gi, "\n")).replace(/[\t ]*\n[\t ]*/g, "\n").trim();
}

export function getSummaryReadingMinutes(html: string): number {
  const words = summaryPlainText(html).split(/\s+/).filter(Boolean).length;
  return words ? Math.max(1, Math.ceil(words / 200)) : 0;
}

export function summaryDescription(summary: LearningSummary): string {
  const length = summaryChoices.length.find((choice) => choice.value === summary.settings.length)!.label;
  const detail = summaryChoices.detail.find((choice) => choice.value === summary.settings.detail)!.label;
  const minutes = getSummaryReadingMinutes(summary.html);
  return `${length} · ${detail} · ${minutes ? `${minutes} Min. Lesezeit` : "Leerer Entwurf"}`;
}

/** Whose summaries are read and written; without `cloud` they stay in this browser (catalog, tests, app without Supabase). */
export interface LearningContentAccount { userId: string; cloud: SupabaseClient | null }
/** Local copy: `revision` is the cloud revision it builds on, `pending` marks changes not yet in the cloud, a null summary a pending deletion. */
interface StoredSummary { id: string; deckId: string; summary: LearningSummary | null; revision: number | null; pending: boolean }
/** The summary now holding the draft, whether it still waits for the cloud, and after a conflict the cloud state of the original. */
export interface SavedLearningSummary { saved: LearningSummary; unsynced: boolean; replaced: { id: string; summary: LearningSummary | null } | null }
const TABLE = "learning_summaries";
const SAVE_FAILED = "Die Zusammenfassung konnte nicht lokal gespeichert werden. Dein Entwurf bleibt geöffnet.";

async function withSummaryStore<T>(userId: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void, failure: string): Promise<T> {
  if (!v.safeParse(identifier, userId).success) throw new Error("Zum Speichern ist ein aktives Konto erforderlich.");
  if (typeof indexedDB === "undefined") throw new Error("Der lokale Speicher für Zusammenfassungen ist nicht verfügbar.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`core.learningSummaries.v2.${encodeURIComponent(userId)}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("summaries", { keyPath: "id" }).createIndex("deckId", "deckId");
      indexedDB.deleteDatabase(`core.learningSummaries.v1.${encodeURIComponent(userId)}`); // Nur lokal gespeicherte Altfassungen entfallen (Entscheidung I2).
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Der lokale Speicher für Zusammenfassungen konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der lokale Speicher ist blockiert. Schließe andere CoRe-Tabs und versuche es erneut."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("summaries", mode), request = run(transaction.objectStore("summaries"));
      transaction.oncomplete = () => resolve(request?.result as T);
      transaction.onabort = transaction.onerror = () => reject(new Error(failure));
    });
  } finally { db.close(); }
}
const readStored = (userId: string, deckId: string) => withSummaryStore<StoredSummary[]>(userId, "readonly", (store) => store.index("deckId").getAll(deckId), "Die Zusammenfassungen konnten nicht geladen werden.");
const getStored = (userId: string, id: string) => withSummaryStore<StoredSummary | undefined>(userId, "readonly", (store) => store.get(id), "Die Zusammenfassung konnte nicht geladen werden.");
const writeStored = (userId: string, records: StoredSummary[], removed: string[] = []) => withSummaryStore<void>(userId, "readwrite", (store) => {
  for (const record of records) store.put(record);
  for (const id of removed) store.delete(id);
}, SAVE_FAILED);

/** Pushes one pending record. After a conflict (decision I3) the draft continues as „Konfliktfassung von …“ and the original takes the cloud state. */
async function pushSummary(account: LearningContentAccount & { cloud: SupabaseClient }, record: StoredSummary): Promise<SavedLearningSummary | null> {
  const { userId, cloud } = account;
  if (!record.summary) {
    if (record.revision !== null) await deleteLearningDocument(cloud, TABLE, record.id);
    await writeStored(userId, [], [record.id]);
    return null;
  }
  const result = await writeLearningDocument(cloud, TABLE, { userId, id: record.id, deckId: record.deckId, document: record.summary, baseRevision: record.revision });
  if ("revision" in result) {
    await writeStored(userId, [{ ...record, revision: result.revision, pending: false }]);
    return { saved: record.summary, unsynced: false, replaced: null };
  }
  const remote = result.conflict && !result.conflict.deleted ? readLearningSummary(result.conflict.document) : null;
  const draft = duplicateLearningSummary(record.summary, undefined, "Konfliktfassung von"), copy: StoredSummary = { id: draft.id, deckId: draft.deckId, summary: draft, revision: null, pending: true };
  await writeStored(userId, [copy, ...(remote ? [{ ...record, summary: remote, revision: result.conflict!.revision, pending: false }] : [])], remote ? [] : [record.id]);
  const pushed = await pushSummary(account, copy).catch(() => null);
  return { saved: draft, unsynced: !pushed, replaced: { id: record.id, summary: remote } };
}

/** Summaries of a deck: the cloud state merged with changes this browser has not uploaded yet, which are retried here. Offline the last local copy is shown. */
export async function loadLearningSummaries(account: LearningContentAccount, deckId: string): Promise<{ summaries: LearningSummary[]; unsynced: Set<string> }> {
  const { userId, cloud } = account;
  const remote = cloud ? await listLearningDocuments(cloud, TABLE, deckId).catch(() => null) : null;
  if (cloud && remote) {
    const local = await readStored(userId, deckId), pending = new Set(local.filter((record) => record.pending).map((record) => record.id)), known = new Set(remote.map((row) => row.id));
    await writeStored(userId,
      remote.filter((row) => !row.deleted && !pending.has(row.id)).map((row) => ({ id: row.id, deckId, summary: readLearningSummary(row.document), revision: row.revision, pending: false })),
      [...remote.filter((row) => row.deleted && !pending.has(row.id)).map((row) => row.id), ...local.filter((record) => !record.pending && !known.has(record.id)).map((record) => record.id)]);
    for (const record of local.filter((item) => item.pending)) await pushSummary({ ...account, cloud }, record).catch(() => null);
  }
  const records = await readStored(userId, deckId);
  return {
    summaries: records.flatMap((record) => record.summary ? [readLearningSummary(record.summary)] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
    unsynced: new Set(records.filter((record) => record.pending).map((record) => record.id)),
  };
}

/** Saves locally first and then to the cloud; without a connection the summary stays marked as not yet synchronised. */
export async function saveLearningSummary(account: LearningContentAccount, value: unknown): Promise<SavedLearningSummary> {
  const summary = readLearningSummary(value), { userId, cloud } = account, existing = await getStored(userId, summary.id);
  const record: StoredSummary = { id: summary.id, deckId: summary.deckId, summary, revision: existing?.revision ?? null, pending: Boolean(cloud) };
  await writeStored(userId, [record]);
  if (!cloud) return { saved: summary, unsynced: false, replaced: null };
  return await pushSummary({ ...account, cloud }, record).catch(() => null) ?? { saved: summary, unsynced: true, replaced: null };
}

/** Deletes on every device; offline the deletion waits as a local mark. */
export async function deleteLearningSummary(account: LearningContentAccount, id: string): Promise<void> {
  const { userId, cloud } = account, existing = await getStored(userId, id);
  if (!existing) return;
  if (!cloud || existing.revision === null) return writeStored(userId, [], [id]);
  const record = { ...existing, summary: null, pending: true };
  await writeStored(userId, [record]);
  await pushSummary({ ...account, cloud }, record).catch(() => null);
}
