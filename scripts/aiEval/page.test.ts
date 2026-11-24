import assert from "node:assert/strict";
import test from "node:test";
import { OPENROUTER_MODEL } from "../../server/aiRoute.ts";
import { REQUEST_TYPES, bestRun, confirmationState, holdoutFor, parseLedger, seriesFor, type EvalLedger } from "./ledger.ts";
import { aiEvalDocument, balanceSection, bestTable, progressSections } from "./page.ts";

const variant = REQUEST_TYPES[0];
const run = {
  requestType: variant.id, run: "2026-11-12-baseline", date: "2026-11-12", split: "dev" as const, promptVersion: variant.promptVersion, candidate: null, fingerprint: "0123456789abcdef",
  model: OPENROUTER_MODEL, reasoning: "low", change: "Baseline", decision: "baseline" as const, cases: 60, repetitions: 3, main: 0.9, low: 0.84, high: 0.95, criteria: { M2: 0.98 },
  outcomes: { answer: 170, refused: 6, rejected: 4, timeout: 0 }, traps: { answers: 24, errors: 0 }, costUsd: 0.0004, costTotalUsd: 0.072, latencyP90Ms: 2300,
  judge: { model: "claude-opus-5-5", fingerprint: "fedcba9876543210", entries: 150, cached: 0, noise: { M2: 0.1, M6: 0.2 } },
};
const holdout = { ...run, run: "2026-11-12-rueckhalt", split: "holdout" as const, decision: "holdout" as const, change: "Rückhalt", main: 0.86, low: 0.8, high: 0.92, judge: { ...run.judge, entries: 50, cached: 100 } };
const round = (decision: "accepted" | "rejected", promptVersion: string, main: number) => ({ ...run, promptVersion, change: "Zahlen wörtlich übernehmen", decision, main, low: main - 0.05, high: main + 0.04, comparison: { noise: 0.04, gained: 6, lost: 2 } });
const sample = (): EvalLedger => parseLedger({
  runs: [run, holdout, round("rejected", "card-variant-v5", 0.88), round("accepted", "card-variant-v6", 0.95)],
  calibrations: [{ requestType: variant.id, date: "2026-11-11", judge: "claude-opus-5-5", entries: 40, agreement: 0.925, falsePasses: 1 }],
});

test("Ledger verlangt eine Baseline vor Runden, Vergleiche nur bei Runden und die kritischen Kriterien", () => {
  assert.throws(() => parseLedger({ runs: [round("accepted", "card-variant-v5", 0.9)], calibrations: [] }), /fehlt eine Baseline/);
  assert.throws(() => parseLedger({ runs: [{ ...run, comparison: { noise: 0.04, gained: 1, lost: 0 } }], calibrations: [] }), /Baseline oder Messung am Rückhalt nie/);
  assert.throws(() => parseLedger({ runs: [{ ...run, criteria: {} }], calibrations: [] }), /M2 fehlt/);
  assert.throws(() => parseLedger({ runs: [{ ...run, low: 0.95 }], calibrations: [] }), /außerhalb seines Intervalls/);
  assert.throws(() => parseLedger({ runs: [{ ...run, requestType: "quiz" }], calibrations: [] }), /ledger\.json: runs\.0\.requestType/);
  assert.throws(() => parseLedger({ runs: [{ ...holdout, decision: "baseline" }], calibrations: [] }), /Entscheidung holdout, und nur sie/);
  assert.throws(() => parseLedger({ runs: [run, { ...holdout, comparison: { noise: 0.04, gained: 1, lost: 0 } }], calibrations: [] }), /Rückhalt nie/);
});

test("Vorläufige Schritte werden Bestand; eine verworfene Sammelprüfung setzt auf den letzten bestätigten Stand zurück", () => {
  const provisional = (name: string, main: number) => ({ ...round("accepted", "card-variant-v6", main), run: name, decision: "provisional" as const, reason: "Behoben." });
  const confirm = (decision: "accepted" | "rejected") => ({ ...round(decision, "card-variant-v7", 0.93), run: `sammel-${decision}`, confirmation: true as const });
  const open = parseLedger({ runs: [run, provisional("p1", 0.91), provisional("p2", 0.92)], calibrations: [] });
  assert.equal(bestRun(open, variant.id)?.run, "p2");
  assert.deepEqual([confirmationState(open, variant.id).confirmed?.run, confirmationState(open, variant.id).pending], [run.run, 2]);
  const failed = parseLedger({ ...open, runs: [...open.runs, confirm("rejected")] });
  assert.equal(bestRun(failed, variant.id)?.run, run.run);
  assert.equal(confirmationState(failed, variant.id).pending, 0);
  const passed = parseLedger({ ...open, runs: [...open.runs, confirm("accepted")] });
  assert.deepEqual([bestRun(passed, variant.id)?.run, confirmationState(passed, variant.id).confirmed?.run], ["sammel-accepted", "sammel-accepted"]);
  assert.equal(seriesFor(failed, variant.id).at(-1)?.reference?.run, run.run, "eine Sammelprüfung misst gegen den letzten bestätigten Stand");
});

test("Der Rückhalt gehört zu keiner Reihe und wird dem Bestand mit gleicher Promptversion zugeordnet", () => {
  const ledger = parseLedger({ runs: [run, holdout], calibrations: [] });
  assert.equal(seriesFor(ledger, variant.id).length, 1);
  assert.equal(holdoutFor(ledger, run)?.run, holdout.run);
  assert.equal(holdoutFor(ledger, { ...run, promptVersion: "card-variant-v9" }), null);
  assert.match(bestTable(ledger), /<td>86,0 % \(80,0–92,0\)<\/td><td>95,0 %<\/td><td>M2 98,0 %<\/td><td>0 Fehler in 24<\/td>/);
  assert.match(bestTable(ledger), /nicht kalibriert · Rauschen bis 20,0 %/);
});

test("Verworfene Runden ändern den Bestand nicht; jede Runde misst gegen den Bestand davor", () => {
  const ledger = sample();
  assert.deepEqual(seriesFor(ledger, variant.id).map(({ reference }) => reference?.promptVersion ?? null), [null, variant.promptVersion, variant.promptVersion]);
  assert.equal(bestRun(ledger, variant.id)?.promptVersion, "card-variant-v6");
  assert.equal(bestRun(ledger, "card-help"), null);
});

test("Bestand zeigt je Anfragetyp genau eine Zeile und markiert einen ungemessenen Prompt im Code", () => {
  const empty = bestTable(parseLedger({ runs: [], calibrations: [] }));
  assert.equal([...empty.matchAll(/<tr><th scope="row">/g)].length, REQUEST_TYPES.length);
  assert.equal([...empty.matchAll(/Noch kein Lauf/g)].length, REQUEST_TYPES.length);
  assert.match(bestTable(parseLedger({ runs: [run], calibrations: [] })), /<td>Gemessen<\/td><td><code>card-variant-v\d+<\/code><\/td><td>90,0 % \(84,0–95,0\)<\/td><td>–<\/td><td>95,0 %<\/td><td>M2 98,0 %<\/td>/);
  const html = bestTable(sample());
  assert.equal([...html.matchAll(/<tr><th scope="row">/g)].length, REQUEST_TYPES.length);
  assert.match(html, /Prompt im Code nicht gemessen<\/td><td><code>card-variant-v6<\/code>/);
  assert.match(html, /92,5 % · 40 Einträge · 1 falsch bestanden/);
});

test("Verlauf zeichnet je Lauf einen Punkt, hält den Bestand als Linie und listet die Läufe mit Abstand zum Bestand", () => {
  assert.equal(progressSections(parseLedger({ runs: [], calibrations: [] })), "<p>Noch kein Lauf im Ledger.</p>");
  const html = progressSections(sample());
  const plot = html.match(/<svg class="docs-eval-plot"[\s\S]*?<\/svg>/)![0];
  assert.equal([...plot.matchAll(/<circle/g)].length, 3);
  assert.equal([...plot.matchAll(/data-decision="rejected"/g)].length, 1);
  assert.match(plot, /<path class="best" d="M[\d. ]+H[\d.]+V[\d.]+H[\d.]+"\/>/);
  assert.match(plot, /Ziel 95,0 %/);
  assert.doesNotMatch(plot, /NaN|undefined/);
  assert.match(html, /<td>−2,0 Pkt\.<\/td><td>±4,0 Pkt\.<\/td><td>\+6 \/ −2<\/td>/);
  assert.match(html, /<td>\+5,0 Pkt\.<\/td>/);
  assert.equal([...html.matchAll(/<h3 id="ai-eval--verlauf-/g)].length, 1);
});

test("Die Bilanz summiert Läufe, Antworten, Kosten und Richteraufwand je Anfragetyp", () => {
  assert.equal(balanceSection(parseLedger({ runs: [], calibrations: [] })), "<p>Noch kein Lauf im Ledger.</p>");
  const html = balanceSection(sample());
  assert.match(html, /<th scope="row">Variante Frage\/Antwort<\/th><td>4<\/td><td>720<\/td><td>0,29 USD<\/td><td>500<\/td><td>16,7 %<\/td><td>90,0 %<\/td><td>95,0 %<\/td><td>95,0 %<\/td>/);
  assert.match(html, /<th scope="row">alle<\/th><td>4<\/td>/);
});

test("Die Leseseite hängt Bestand, Verlauf und Bilanz an ihre Abschnitte", () => {
  const html = aiEvalDocument("# KI-Eval\n## Bestand\nText.\n## Verlauf\nText.\n## Bilanz\nText.\n## Ablage\n", sample());
  const order = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ["ai-eval--bestand", "ai-eval--verlauf", `ai-eval--verlauf-${variant.id}`, "ai-eval--bilanz", "ai-eval--ablage"]);
  assert.ok(html.indexOf("Bestand je Anfragetyp") < html.indexOf('id="ai-eval--verlauf"'));
  assert.throws(() => aiEvalDocument("# KI-Eval\n## Bestand\n", sample()), /Abschnitt ai-eval--verlauf fehlt in docs\/ai-eval\.md/);
});
