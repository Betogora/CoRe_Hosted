import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLearningSummary, createSummarySettings, deleteLearningSummary, duplicateLearningSummary, getSummaryReadingMinutes, loadLearningSummaries, readLearningSummary, saveLearningSummary, summaryPlainText } from "./learningSummaries.ts";

const local = (userId = `summary-test-${crypto.randomUUID()}`) => ({ userId, cloud: null });

/** In-memory `learning_summaries` with the database's revision stamping; `offline` makes every request fail like a lost connection. */
function fakeCloud() {
  const rows = new Map<string, Record<string, any>>(), state = { offline: false };
  const client = { from: () => {
    let op = "select", payload: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    const run = () => {
      if (state.offline) return { data: null, error: new Error("offline") };
      if (op === "insert") { const row: Record<string, any> = { ...structuredClone(payload), revision: 1, deleted_at: null }; rows.set(String(row.id), row); return { data: [structuredClone(row)], error: null }; }
      const hits = [...rows.values()].filter((row) => filters.every(([column, value]) => row[column] === value));
      if (op === "update") for (const row of hits) Object.assign(row, structuredClone(payload), { revision: row.revision + 1 });
      return { data: structuredClone(hits), error: null };
    };
    const builder: any = {
      select: () => builder, eq: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
      insert: (row: Record<string, unknown>) => { op = "insert"; payload = row; return builder; },
      update: (values: Record<string, unknown>) => { op = "update"; payload = values; return builder; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
  } };
  return { rows, state, account: (userId: string) => ({ userId, cloud: client as unknown as SupabaseClient }) };
}
/** A new browser of the same account: its local copy starts empty. */
const freshDevice = (userId: string) => new Promise((resolve) => { indexedDB.deleteDatabase(`core.learningSummaries.v2.${encodeURIComponent(userId)}`).onsuccess = resolve; });

test("Zusammenfassungen bleiben nach erneutem Öffnen je Konto und Stapel getrennt", async () => {
  const account = local();
  const one = createLearningSummary("deck-a", "Kurze Übersicht", createSummarySettings());
  const two = createLearningSummary("deck-a", "Detaillierte Übersicht", { ...createSummarySettings(), length: "short", detail: "detailed" });
  await saveLearningSummary(account, one);
  await saveLearningSummary(account, two);
  await saveLearningSummary(account, createLearningSummary("deck-b", "Anderer Stapel", createSummarySettings()));
  assert.equal((await loadLearningSummaries(account, "deck-a")).summaries.length, 2);
  assert.deepEqual((await loadLearningSummaries(local(`${account.userId}-other`), "deck-a")).summaries, []);
  const { saved: changed } = await saveLearningSummary(account, { ...one, title: "Überarbeitet", html: "<p>Neuer Text</p>", font: "serif", fontSize: 22 });
  const { summaries: reread, unsynced } = await loadLearningSummaries(account, "deck-a");
  assert.deepEqual(reread.find((item) => item.id === one.id), changed);
  assert.deepEqual([reread.length, reread.find((item) => item.id === two.id)?.settings.detail, unsynced.size], [2, "detailed", 0]);
});

test("Duplizieren legt eine eigenständige Kopie an; Löschen entfernt nur diese Fassung im eigenen Konto", async () => {
  const account = local();
  const { saved: original } = await saveLearningSummary(account, { ...createLearningSummary("deck", "x".repeat(120), createSummarySettings()), html: "<p>Text</p>", font: "serif" });
  const { saved: copy } = await saveLearningSummary(account, duplicateLearningSummary(original, "2030-01-01T00:00:00.000Z"));
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.title, `Kopie von ${"x".repeat(110)}`);
  assert.deepEqual({ ...copy, id: original.id, title: original.title, createdAt: original.createdAt, updatedAt: original.updatedAt }, original);
  await deleteLearningSummary(local(`${account.userId}-other`), original.id);
  assert.equal((await loadLearningSummaries(account, "deck")).summaries.length, 2);
  await deleteLearningSummary(account, original.id);
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries, [copy]);
});

test("Online gespeicherte Fassungen erscheinen auf einem neuen Gerät; Löschen gilt überall", async () => {
  const cloud = fakeCloud(), account = cloud.account(`summary-cloud-${crypto.randomUUID()}`);
  const { saved: one, unsynced } = await saveLearningSummary(account, createLearningSummary("deck", "Eins", createSummarySettings()));
  await saveLearningSummary(account, createLearningSummary("deck", "Zwei", createSummarySettings()));
  assert.deepEqual([unsynced, cloud.rows.get(one.id)?.revision, cloud.rows.get(one.id)?.deck_id], [false, 1, "deck"]);
  await freshDevice(account.userId); cloud.state.offline = true;
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries, []);
  cloud.state.offline = false;
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries.map((item) => item.title).sort(), ["Eins", "Zwei"]);
  await deleteLearningSummary(account, one.id);
  assert.ok(cloud.rows.get(one.id)?.deleted_at);
  await freshDevice(account.userId);
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries.map((item) => item.title), ["Zwei"]);
});

test("Offline gespeicherte Änderungen und Löschungen werden beim nächsten Öffnen hochgeladen", async () => {
  const cloud = fakeCloud(), account = cloud.account(`summary-offline-${crypto.randomUUID()}`);
  const { saved: kept } = await saveLearningSummary(account, createLearningSummary("deck", "Bleibt", createSummarySettings()));
  cloud.state.offline = true;
  const { saved, unsynced } = await saveLearningSummary(account, createLearningSummary("deck", "Offline", createSummarySettings()));
  await deleteLearningSummary(account, kept.id);
  const offline = await loadLearningSummaries(account, "deck");
  assert.deepEqual([unsynced, offline.summaries.map((item) => item.id), [...offline.unsynced].sort()], [true, [saved.id], [kept.id, saved.id].sort()]);
  cloud.state.offline = false;
  const online = await loadLearningSummaries(account, "deck");
  assert.deepEqual([online.summaries.map((item) => item.id), online.unsynced.size, cloud.rows.get(saved.id)?.revision, Boolean(cloud.rows.get(kept.id)?.deleted_at)], [[saved.id], 0, 1, true]);
});

test("Ein Konflikt erhält beide Stände: eigene Änderungen werden zur Konfliktfassung, das Original zeigt den Cloudstand", async () => {
  const cloud = fakeCloud(), account = cloud.account(`summary-conflict-${crypto.randomUUID()}`);
  const { saved: original } = await saveLearningSummary(account, createLearningSummary("deck", "Gemeinsam", createSummarySettings()));
  Object.assign(cloud.rows.get(original.id)!, { document: { ...original, html: "<p>Anderes Gerät</p>" }, revision: 2 });
  const result = await saveLearningSummary(account, { ...original, html: "<p>Dieses Gerät</p>" });
  assert.deepEqual([result.saved.title, result.saved.html, result.replaced?.summary?.html, result.unsynced], ["Konfliktfassung von Gemeinsam", "<p>Dieses Gerät</p>", "<p>Anderes Gerät</p>", false]);
  assert.equal(cloud.rows.size, 2);
  const { summaries } = await loadLearningSummaries(account, "deck");
  assert.deepEqual(summaries.map((item) => item.html).sort(), ["<p>Anderes Gerät</p>", "<p>Dieses Gerät</p>"]);
  Object.assign(cloud.rows.get(original.id)!, { deleted_at: new Date().toISOString(), revision: 3 });
  const removed = await saveLearningSummary(account, { ...summaries.find((item) => item.id === original.id)!, html: "<p>Nochmals</p>" });
  assert.deepEqual([removed.replaced, removed.saved.html], [{ id: original.id, summary: null }, "<p>Nochmals</p>"]);
});

test("unbekannte Zusammenfassungspayloads werden validiert und HTML wird sanitisiert", () => {
  const summary = createLearningSummary("deck", " Titel ", createSummarySettings());
  const cleaned = readLearningSummary({ ...summary, html: '<p style="color:red">Text<script>alert(1)</script><img src="javascript:evil" onerror="evil()"></p>' });
  assert.equal(cleaned.title, "Titel");
  assert.doesNotMatch(cleaned.html, /<script|onerror|javascript:/);
  assert.match(cleaned.html, /color:red/);
  assert.throws(() => readLearningSummary({ ...summary, title: " " }));
  assert.throws(() => readLearningSummary({ ...summary, settings: { ...summary.settings, detail: "anything" } }));
  assert.throws(() => readLearningSummary({ ...summary, html: "x".repeat(100_001) }));
});

test("ungültige Writes erhalten vorhandene Fassungen; ohne Konto wird nicht gespeichert", async () => {
  const account = local();
  const { saved: summary } = await saveLearningSummary(account, createLearningSummary("deck", "Vorhanden", createSummarySettings()));
  await assert.rejects(saveLearningSummary(account, { ...summary, title: "" }));
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries, [summary]);
  await assert.rejects(saveLearningSummary(local(""), summary), /Konto/);
});

test("Lesezeit stammt aus dem tatsächlichen Inhalt statt der gewählten Ziellänge", () => {
  assert.equal(summaryPlainText("<h2>Portugal</h2><p>Lissabon</p><ul><li>Spanien</li><li>Madrid</li></ul>"), "Portugal\nLissabon\nSpanien\nMadrid");
  assert.equal(getSummaryReadingMinutes("<p><br></p>"), 0);
  assert.equal(getSummaryReadingMinutes("<p>Ein kurzer Text.</p>"), 1);
  assert.equal(getSummaryReadingMinutes(`<p>${"Wort ".repeat(201)}</p>`), 2);
});
