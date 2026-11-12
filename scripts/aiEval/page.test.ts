import assert from "node:assert/strict";
import test from "node:test";
import { OPENROUTER_MODEL } from "../../server/aiRoute.ts";
import { REQUEST_TYPES, bestRun, parseLedger, seriesFor, type EvalLedger } from "./ledger.ts";
import { aiEvalDocument, bestTable, progressSections } from "./page.ts";

const variant = REQUEST_TYPES[0];
const run = { requestType: variant.id, run: "2026-11-12-baseline", date: "2026-11-12", promptVersion: variant.promptVersion, model: OPENROUTER_MODEL, reasoning: "low", change: "Baseline", decision: "baseline", cases: 60, repetitions: 3, main: 0.9, low: 0.84, high: 0.95, criteria: { M2: 0.98 }, costUsd: 0.0004, latencyP90Ms: 2300 };
const round = (decision: "accepted" | "rejected", promptVersion: string, main: number) => ({ ...run, promptVersion, change: "Zahlen wörtlich übernehmen", decision, main, low: main - 0.05, high: main + 0.04, comparison: { noise: 0.04, gained: 6, lost: 2 } });
const sample = (): EvalLedger => parseLedger({
  runs: [run, round("rejected", "card-variant-v5", 0.88), round("accepted", "card-variant-v6", 0.95)],
  calibrations: [{ requestType: variant.id, date: "2026-11-11", judge: "claude-opus-5-5", entries: 40, agreement: 0.925, falsePasses: 1 }],
});

test("Ledger verlangt eine Baseline vor Runden, Vergleiche nur bei Runden und die kritischen Kriterien", () => {
  assert.throws(() => parseLedger({ runs: [round("accepted", "card-variant-v5", 0.9)], calibrations: [] }), /fehlt eine Baseline/);
  assert.throws(() => parseLedger({ runs: [{ ...run, comparison: { noise: 0.04, gained: 1, lost: 0 } }], calibrations: [] }), /Baseline nie/);
  assert.throws(() => parseLedger({ runs: [{ ...run, criteria: {} }], calibrations: [] }), /M2 fehlt/);
  assert.throws(() => parseLedger({ runs: [{ ...run, low: 0.95 }], calibrations: [] }), /außerhalb seines Intervalls/);
  assert.throws(() => parseLedger({ runs: [{ ...run, requestType: "quiz" }], calibrations: [] }), /ledger\.json: runs\.0\.requestType/);
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
  assert.match(bestTable(parseLedger({ runs: [run], calibrations: [] })), /<td>Gemessen<\/td><td><code>card-variant-v\d+<\/code><\/td><td>90,0 % \(84,0–95,0\)<\/td><td>95,0 %<\/td><td>M2 98,0 %<\/td>/);
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

test("Die Leseseite hängt Bestand und Verlauf an ihre Abschnitte", () => {
  const html = aiEvalDocument("# KI-Eval\n## Bestand\nText.\n## Verlauf\nText.\n## Ablage\n", sample());
  const order = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ["ai-eval--bestand", "ai-eval--verlauf", `ai-eval--verlauf-${variant.id}`, "ai-eval--ablage"]);
  assert.ok(html.indexOf("Bestand je Anfragetyp") < html.indexOf('id="ai-eval--verlauf"'));
  assert.throws(() => aiEvalDocument("# KI-Eval\n## Bestand\n", sample()), /Abschnitt ai-eval--verlauf fehlt in docs\/ai-eval\.md/);
});
