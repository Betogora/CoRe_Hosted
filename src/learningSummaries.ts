import { summarySettingsSchema, summaryChoices, type SummarySettings } from "./learningSummarySettings.ts";
export { createSummarySettings, summaryChoices, type SummarySettings } from "./learningSummarySettings.ts";
import * as v from "valibot";
import { sanitizeCardHtml, stripHtml } from "./htmlSafety.ts";

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const generationSchema = v.strictObject({
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  privacyMode: v.picklist(["zdr", "non_zdr"]),
  promptVersion: v.picklist(["learning-summary-v1", "learning-summary-v2"]),
  generatedAt: v.pipe(v.string(), v.isoTimestamp()),
  materialUnits: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
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

async function openSummaryDatabase(userId: string): Promise<IDBDatabase> {
  if (!v.safeParse(identifier, userId).success) throw new Error("Zum Speichern ist ein aktives Konto erforderlich.");
  if (typeof indexedDB === "undefined") throw new Error("Der lokale Speicher für Zusammenfassungen ist nicht verfügbar.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`core.learningSummaries.v1.${encodeURIComponent(userId)}`, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("summaries", { keyPath: "id" });
      store.createIndex("deckId", "deckId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Der lokale Speicher für Zusammenfassungen konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der lokale Speicher ist blockiert. Schließe andere CoRe-Tabs und versuche es erneut."));
  });
}

export async function loadLearningSummaries(userId: string, deckId: string): Promise<LearningSummary[]> {
  const db = await openSummaryDatabase(userId);
  try {
    const rows: unknown = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction("summaries", "readonly");
      const request = transaction.objectStore("summaries").index("deckId").getAll(deckId);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new Error("Die Zusammenfassungen konnten nicht geladen werden."));
    });
    if (!Array.isArray(rows)) throw new Error("Der lokale Zusammenfassungsspeicher ist ungültig.");
    return rows.map(readLearningSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  } finally { db.close(); }
}

export async function saveLearningSummary(userId: string, value: unknown): Promise<LearningSummary> {
  const summary = readLearningSummary(value);
  const db = await openSummaryDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("summaries", "readwrite");
      transaction.objectStore("summaries").put(summary);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error("Die Zusammenfassung konnte nicht lokal gespeichert werden. Dein Entwurf bleibt geöffnet."));
    });
    return summary;
  } finally { db.close(); }
}
