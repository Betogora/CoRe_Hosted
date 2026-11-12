import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assignSplits, loadCases, sampleCorpus, seededRandom, type DraftCase, type EvalCase } from "./cases.ts";
import { corpusCategory, definitionFor, numberTokens, rephrased, wordDistance } from "./definitions.ts";
import { generate, mockCompletion, readAnswers, type AnswerRow } from "./generate.ts";
import { answerRef, buildJudgeTable, labelRef, readLabels, readVerdicts, type Label, type Verdicts } from "./judge.ts";
import { REQUEST_TYPES } from "./ledger.ts";
import { agreement, compare, decide, evaluateAnswers, summarize, type AnswerResult } from "./score.ts";

const variant = definitionFor("card-variant-basic");
const help = definitionFor("card-help");
const variantType = REQUEST_TYPES[0];
const card = (front: string, back: string, avoid?: string[]) => ({ source: { front, back }, ...(avoid ? { avoid } : {}) });
const cases: EvalCase[] = [
  { id: "a", category: "definitionen", split: "test", request: card("Was ist Osmose?", "Diffusion von Wasser") },
  { id: "b", category: "zahlen-formeln", split: "test", request: card("In welchem Jahr begann die Französische Revolution?", "1789") },
];
const row = (caseId: string, repetition: number, output: unknown, ok = true): AnswerRow => ({ caseId, repetition, ok, error: ok ? null : "invalid_variant", output, model: ok ? "mock" : null, totalTokens: ok ? 120 : null, costUsd: ok ? 0.001 : null, latencyMs: 1000 + repetition * 500, transcript: { request: null, response: null } });
const result = (caseId: string, repetition: number, main: boolean, criteria: Record<string, boolean> = { M1: true, M2: main }): AnswerResult => ({ caseId, repetition, category: "definitionen", criteria, main, costUsd: 0.001, latencyMs: 1000, totalTokens: 100, model: "mock" });

test("Versionierte Prüfkarten und Handurteile bestehen den Anfragevertrag und sind aufgeteilt", () => {
  for (const definition of [variant, help]) {
    const loaded = loadCases(definition);
    assert.ok(loaded.length >= 24);
    for (const category of new Set(loaded.map((entry) => entry.category))) {
      assert.deepEqual([...new Set(loaded.filter((entry) => entry.category === category).map((entry) => entry.split))].sort(), ["test", "train"], category);
    }
    assert.doesNotThrow(() => readLabels(definition));
  }
});

test("Automatische Kriterien der Varianten: Zahlen zeichengenau, erkennbar umformuliert, anders als vorhandene Varianten", () => {
  assert.equal(wordDistance("Wie viele Bundesländer hat Deutschland?", "Wie viele Bundesländer besitzt Deutschland?"), 1);
  assert.equal(rephrased("Wie viele Bundesländer hat Deutschland?", "Wie viele Bundesländer besitzt Deutschland?"), false);
  assert.equal(rephrased("Wie viele Bundesländer hat Deutschland?", "Aus wie vielen Bundesländern besteht Deutschland?"), true);
  assert.deepEqual(numberTokens("Von etwa −70 mV auf +30 mV, (1789)."), ["−70", "+30", "1789"]);
  const { M3, M4, M5 } = variant.automatic;
  const request = card("Wie groß ist die Lichtgeschwindigkeit?", "Etwa 299.792 km/s", ["Welchen Wert hat die Lichtgeschwindigkeit?"]);
  assert.equal(M3(request, { front: "Welche Geschwindigkeit erreicht Licht?", back: "Etwa 299.792 km/s" }), true);
  assert.equal(M3(request, { front: "Welche Geschwindigkeit erreicht Licht?", back: "Etwa 300.000 km/s" }), false);
  assert.equal(M4(request, { front: "Wie groß ist die Lichtgeschwindigkeit genau?", back: "x" }), false);
  assert.equal(M5(request, { front: "Welchen Wert hat die Lichtgeschwindigkeit ungefähr?", back: "x" }), false);
  assert.equal(M5(request, { front: "Mit welcher Geschwindigkeit breitet sich Licht aus?", back: "x" }), true);
});

test("Lernhilfe: Länge und Format automatisch, je Modus genau ein eigenes Richterkriterium", () => {
  const { H1 } = help.automatic;
  assert.equal(H1(null, "Kurze Antwort.\n- Punkt"), true);
  assert.equal(H1(null, "**Fett** ist kein Klartext."), false);
  assert.equal(H1(null, Array.from({ length: 151 }, () => "Wort").join(" ")), false);
  const ids = (mode: string, question?: string) => help.judged(help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode, ...(question ? { question } : {}) })).map((criterion) => criterion.id);
  assert.deepEqual(ids("explain"), ["H1", "H2", "H3", "H6", "H7"]);
  assert.deepEqual(ids("example"), ["H1", "H2", "H4", "H6", "H7"]);
  assert.deepEqual(ids("question", "Warum?"), ["H1", "H2", "H5", "H6", "H7"]);
});

test("Korpuskarten bekommen ihre Kategorie nach der ersten zutreffenden Regel", () => {
  assert.equal(corpusCategory({ front: "In welchem Jahr?", back: "1789" }), "zahlen-formeln");
  assert.equal(corpusCategory({ front: "Welche Phase folgt nach der Metaphase?", back: "Die Anaphase" }), "richtung-reihenfolge");
  assert.equal(corpusCategory({ front: "Nenne die Basen.", back: "Adenin, Thymin, Guanin" }), "aufzaehlungen");
  assert.equal(corpusCategory({ front: "Was ist Osmose?", back: "Diffusion von Wasser durch eine Membran" }), "definitionen");
  assert.equal(corpusCategory({ front: "Hauptstadt?", back: "Canberra" }), "kurzantworten");
});

test("Korpusziehung liefert bei gleichem Startwert dieselben Fälle im Anfragevertrag der Route", async () => {
  const first = await sampleCorpus(help, 6, 1, "fixtures/apkg");
  assert.deepEqual(first, await sampleCorpus(help, 6, 1, "fixtures/apkg"));
  assert.equal(first.length, 6);
  assert.ok(first.every((entry) => /^corpus-[0-9a-f]{10}-(?:explain|example)$/.test(entry.id) && help.parseRequest(entry.request)));
  assert.notDeepEqual(first, await sampleCorpus(help, 6, 2, "fixtures/apkg"));
});

test("Die Aufteilung ist je Kategorie hälftig, wiederholbar und lässt bestehende Zuordnungen stehen", () => {
  const drafts: DraftCase[] = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, category: index < 6 ? "x" : "y", request: {} }));
  drafts[0].split = "train";
  const first = assignSplits(drafts, seededRandom(7));
  assert.deepEqual(first, assignSplits(drafts, seededRandom(7)));
  assert.equal(first[0].split, "train");
  const tests = (category: string) => first.filter((entry) => entry.category === category && entry.split === "test").length;
  assert.deepEqual([tests("x"), tests("y")], [3, 2]);
  assert.deepEqual(assignSplits(first, seededRandom(99)), first);
});

test("Erzeugung: Vertragsfehler zählen als Antwort, Infrastrukturfehler bleiben offen, ein zweiter Aufruf setzt fort", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
  try {
    let calls = 0;
    const answer = (front: string) => new Response(JSON.stringify(mockCompletion("create_card_variant", { front, back: "Diffusion von Wasser" })), { status: 200 });
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return answer("Was ist Osmose?");
      if (calls === 2) return new Response("{}", { status: 429 });
      return answer("Wie nennt man die Diffusion von Wasser durch eine Membran?");
    }) as typeof fetch;
    const options = { definition: variant, cases: cases.slice(0, 1), repetitions: 3, split: "test" as const, directory, apiKey: "test", fetchImpl, concurrency: 1, log: () => {} };
    assert.equal(await generate(options), 1);
    assert.deepEqual(readAnswers(directory).map((entry) => [entry.repetition, entry.ok, entry.error]), [[0, false, "invalid_variant"], [2, true, null]]);
    assert.equal(await generate(options), 0);
    assert.equal(calls, 4);
    assert.deepEqual(readAnswers(directory).map((entry) => entry.repetition).sort(), [0, 1, 2]);
    await assert.rejects(generate({ ...options, repetitions: 5 }), /mit repetitions = 3 begonnen/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Richtertabelle: ohne Dubletten und ohne Herkunft; unvollständige Urteile brechen ab", () => {
  const same = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const items = [0, 1].map((repetition) => ({ ref: answerRef("a", repetition), request: cases[0].request, output: same }));
  const control = { ref: labelRef("kontrolle-1"), request: cases[1].request, output: { front: "Wann endete die Französische Revolution?", back: "1789" } };
  const { table, key } = buildJudgeTable(variant, [...items, control], seededRandom(1));
  assert.equal(table.entries.length, 2);
  assert.doesNotMatch(JSON.stringify(table), /answer:|label:|kontrolle/);
  assert.deepEqual(table.criteria.map((criterion) => criterion.id), ["M2", "M6"]);
  assert.deepEqual(Object.values(key).map((refs) => refs.length).sort(), [1, 2]);
  const complete = { verdicts: table.entries.map((entry) => ({ entry: entry.entry, results: { M2: true, M6: false } })) };
  const verdicts = readVerdicts(complete, table, key);
  assert.deepEqual(verdicts.get(answerRef("a", 1)), { M2: true, M6: false });
  assert.throws(() => readVerdicts({ verdicts: complete.verdicts.slice(1) }, table, key), /unvollständig \(1 Einträge\)/);
  assert.throws(() => readVerdicts({ verdicts: [{ ...complete.verdicts[0], results: { M2: true } }, complete.verdicts[1]] }, table, key), /braucht genau M2, M6/);
});

test("Auswertung: Hauptwert verlangt Vertrag, automatische Kriterien und Richterurteil; Kriterien zählen nur gültige Antworten", () => {
  const good = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const rows = [row("a", 0, good), row("a", 1, null, false), row("b", 0, { front: "Wann fing die Französische Revolution an?", back: "1799" }), row("b", 1, { front: "Wann fing die Französische Revolution an?", back: "1789" })];
  const verdicts: Verdicts = new Map([[answerRef("a", 0), { M2: true, M6: true }], [answerRef("b", 0), { M2: true, M6: true }], [answerRef("b", 1), { M2: false, M6: true }]]);
  const results = evaluateAnswers(variant, cases, 2, rows, verdicts);
  assert.deepEqual(results.map((entry) => entry.main), [true, false, false, false]);
  assert.deepEqual(results[1].criteria, { M1: false });
  assert.equal(results[2].criteria.M3, false);
  const summary = summarize(results, seededRandom(3));
  assert.deepEqual([summary.cases, summary.repetitions, summary.main], [2, 2, 0.25]);
  assert.deepEqual([summary.criteria.M1, summary.criteria.M2, summary.criteria.M3], [0.75, 0.6667, 0.6667]);
  assert.ok(summary.low <= summary.main && summary.main <= summary.high);
  assert.equal(summary.latencyP90Ms, 1500);
  assert.throws(() => evaluateAnswers(variant, cases, 2, rows.slice(1), verdicts), /Antwort a#0 fehlt/);
  assert.throws(() => evaluateAnswers(variant, cases, 2, rows, new Map()), /Richterurteil M2 für a#0 fehlt/);
});

test("Vergleich: übernommen nur über dem Rauschen und ohne schlechteres kritisches Kriterium", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `c${index}`);
  const reference = ids.flatMap((id, index) => [0, 1, 2].map((repetition) => result(id, repetition, index < 20)));
  const better = ids.flatMap((id, index) => [0, 1, 2].map((repetition) => result(id, repetition, index < 34)));
  const noisy = ids.flatMap((id, index) => [0, 1, 2].map((repetition) => result(id, repetition, index < 21 && index !== 3)));
  const strong = compare(better, reference, seededRandom(5));
  assert.deepEqual([strong.delta, strong.gained, strong.lost, strong.cases], [0.35, 14, 0, 40]);
  assert.ok(strong.noise > 0 && strong.noise < strong.delta);
  const summaries = [better, reference, noisy].map((entries) => summarize(entries, seededRandom(5)));
  assert.equal(decide(variantType, summaries[0], summaries[1], strong), "accepted");
  const weak = compare(noisy, reference, seededRandom(5));
  assert.deepEqual([weak.delta, weak.gained, weak.lost], [0, 1, 1]);
  assert.equal(decide(variantType, summaries[2], summaries[1], weak), "rejected");
  const worseCritical = { ...summaries[0], criteria: { ...summaries[0].criteria, M2: 0.1 } };
  assert.equal(decide(variantType, worseCritical, summaries[1], strong), "rejected");
  assert.throws(() => compare(better, [result("fremd", 0, true)], seededRandom(5)), /keinen gemeinsamen Fall/);
});

test("Kalibrierung: Übereinstimmung der kritischen Kriterien, Kappa und fälschlich bestandene Einträge", () => {
  const label = (id: string, M2: boolean, M6: boolean): Label => ({ id, request: cases[0].request, output: {}, verdicts: { M2, M6 } });
  const labels = [label("l1", true, true), label("l2", false, true), label("l3", false, false), label("l4", true, true)];
  const verdicts: Verdicts = new Map([[labelRef("l1"), { M2: true, M6: true }], [labelRef("l2"), { M2: true, M6: true }], [labelRef("l3"), { M2: false, M6: true }], [labelRef("l4"), { M2: true, M6: true }]]);
  const outcome = agreement(variantType, labels, verdicts);
  assert.deepEqual([outcome.entries, outcome.agreement, outcome.falsePasses], [4, 0.75, 1]);
  assert.deepEqual(outcome.criteria.find((criterion) => criterion.id === "M2"), { id: "M2", entries: 4, agreement: 0.75, kappa: 0.5, falsePasses: 1, falseFails: 0 });
  assert.deepEqual(outcome.disagreements, ["l2 M2: Handurteil nicht bestanden, Richter bestanden", "l3 M6: Handurteil nicht bestanden, Richter bestanden"]);
  assert.throws(() => agreement(variantType, labels, new Map()), /Richterurteil für Eintrag l1 fehlt/);
});
