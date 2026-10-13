import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createLearningSummary, createSummarySettings, getSummaryReadingMinutes, loadLearningSummaries, readLearningSummary, saveLearningSummary, summaryPlainText } from "./learningSummaries.ts";

test("Zusammenfassungen bleiben nach erneutem Öffnen je Konto und Stapel getrennt", async () => {
  const account = `summary-test-${crypto.randomUUID()}`;
  const one = createLearningSummary("deck-a", "Kurze Übersicht", createSummarySettings());
  const two = createLearningSummary("deck-a", "Detaillierte Übersicht", { ...createSummarySettings(), length: "short", detail: "detailed" });
  await saveLearningSummary(account, one);
  await saveLearningSummary(account, two);
  await saveLearningSummary(account, createLearningSummary("deck-b", "Anderer Stapel", createSummarySettings()));
  assert.equal((await loadLearningSummaries(account, "deck-a")).length, 2);
  assert.deepEqual(await loadLearningSummaries(`${account}-other`, "deck-a"), []);
  const changed = await saveLearningSummary(account, { ...one, title: "Überarbeitet", html: "<p>Neuer Text</p>", font: "serif", fontSize: 22 });
  const reread = await loadLearningSummaries(account, "deck-a");
  assert.deepEqual(reread.find((item) => item.id === one.id), changed);
  assert.equal(reread.length, 2);
  assert.equal(reread.find((item) => item.id === two.id)?.settings.detail, "detailed");
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
  const account = `summary-test-${crypto.randomUUID()}`;
  const summary = await saveLearningSummary(account, createLearningSummary("deck", "Vorhanden", createSummarySettings()));
  await assert.rejects(saveLearningSummary(account, { ...summary, title: "" }));
  assert.deepEqual(await loadLearningSummaries(account, "deck"), [summary]);
  await assert.rejects(saveLearningSummary("", summary), /Konto/);
});

test("Lesezeit stammt aus dem tatsächlichen Inhalt statt der gewählten Ziellänge", () => {
  assert.equal(summaryPlainText("<h2>Portugal</h2><p>Lissabon</p><ul><li>Spanien</li><li>Madrid</li></ul>"), "Portugal\nLissabon\nSpanien\nMadrid");
  assert.equal(getSummaryReadingMinutes("<p><br></p>"), 0);
  assert.equal(getSummaryReadingMinutes("<p>Ein kurzer Text.</p>"), 1);
  assert.equal(getSummaryReadingMinutes(`<p>${"Wort ".repeat(201)}</p>`), 2);
});
