import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { fakeLearningCloud, freshDevice as resetDevice } from "../tests/support/fakeLearningCloud.ts";
import { createLearningSummary, createSummarySettings, deleteLearningSummary, duplicateLearningSummary, getSummaryReadingMinutes, loadLearningSummaries, readLearningSummary, saveLearningSummary, summaryPlainText } from "./learningSummaries.ts";

const local = (userId = `summary-test-${crypto.randomUUID()}`) => ({ userId, cloud: null });

const freshDevice = (userId: string) => resetDevice(`core.learningSummaries.v2.${encodeURIComponent(userId)}`);
const fakeCloud = () => { const cloud = fakeLearningCloud(); return { ...cloud, rows: cloud.table("learning_summaries") }; };

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

test("Seiten und Zeichnungen bleiben gespeichert; Textprojektion und alte Fassungen bleiben lesbar", async () => {
  const account = local();
  const original = createLearningSummary("deck", "Mein Skript", createSummarySettings());
  assert.equal(readLearningSummary(original).pages, undefined);
  const pages = [{ id: "page-a", html: "<p>Erste Seite</p>", strokes: [{ id: "stroke-a", tool: "pen", color: "#657494", width: 3, points: [[10, 20], [300, 400]] }] },
    { id: "page-b", html: "<p>Zweite Seite<script>evil()</script></p>", strokes: [] }];
  const { saved: stored } = await saveLearningSummary(account, { ...original, html: "Veraltete Projektion", pages });
  assert.equal(stored.pages?.length, 2);
  assert.deepEqual(stored.pages?.[0].strokes, pages[0].strokes);
  assert.equal(stored.html, stored.pages?.map((page) => page.html).join("\n"));
  assert.match(stored.html, /Erste Seite/);
  assert.doesNotMatch(stored.html, /script|Veraltete/);
  assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries, [stored]);
  for (const invalid of [
    { ...pages[0], strokes: [{ ...pages[0].strokes[0], points: [[NaN, 10]] }] },
    { ...pages[0], strokes: [{ ...pages[0].strokes[0], color: "url(javascript:evil)" }] },
    { ...pages[0], strokes: [{ ...pages[0].strokes[0], width: -1 }] },
  ]) assert.throws(() => readLearningSummary({ ...original, pages: [invalid] }));
  assert.throws(() => readLearningSummary({ ...original, pages: [pages[0], pages[0]] }));
});

test("Seitenformate und Infinity-Koordinaten bleiben erhalten und werden validiert", async () => {
  const account = local();
  const original = createLearningSummary("deck", "Freie Fläche", createSummarySettings());
  const pages = [{ id: "page", html: "<p>Notiz</p>", strokes: [{ id: "stroke", tool: "pen", space: "infinity", color: "#657494", width: 3, points: [[-1500, 2300], [2500, -300]] }] }];
  assert.equal(readLearningSummary(original).pageFormat, undefined);
  for (const pageFormat of ["portrait", "landscape", "infinity"] as const) {
    const { saved: stored } = await saveLearningSummary(account, { ...original, pageFormat, pages });
    assert.equal(stored.pageFormat, pageFormat);
    assert.deepEqual(stored.pages, pages);
    assert.deepEqual((await loadLearningSummaries(account, "deck")).summaries, [stored]);
  }
  assert.throws(() => readLearningSummary({ ...original, pageFormat: "other" }));
  for (const point of [[Infinity, 0], [0, -1_000_001]]) {
    assert.throws(() => readLearningSummary({ ...original, pages: [{ ...pages[0], strokes: [{ ...pages[0].strokes[0], points: [point] }] }] }));
  }
});

test("Seiten und Striche überstehen Cloud-Roundtrip, Kopie und Konfliktfassung", async () => {
  const cloud = fakeCloud(), account = cloud.account(`summary-pages-cloud-${crypto.randomUUID()}`);
  const pages = [{ id: "page", html: "<p>Meine Notiz</p>", strokes: [{ id: "stroke", tool: "pen", space: "infinity", color: "#657494", width: 3, points: [[-50, 2000]] }] }];
  const { saved: original } = await saveLearningSummary(account, { ...createLearningSummary("deck", "Seiten", createSummarySettings()), pages, pageFormat: "landscape" });
  await freshDevice(account.userId);
  const reopened = (await loadLearningSummaries(account, "deck")).summaries[0];
  assert.deepEqual(reopened, original);
  const { saved: copy } = await saveLearningSummary(account, duplicateLearningSummary(reopened));
  assert.deepEqual([copy.pageFormat, copy.pages], ["landscape", pages]);
  Object.assign(cloud.rows.get(original.id)!, { document: { ...original, pageFormat: "portrait" }, revision: 2 });
  const conflict = await saveLearningSummary(account, { ...original, pageFormat: "infinity" });
  assert.notEqual(conflict.saved.id, original.id);
  assert.deepEqual([conflict.saved.pageFormat, conflict.saved.pages, conflict.replaced?.summary?.pageFormat], ["infinity", pages, "portrait"]);
});
