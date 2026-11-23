import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SPLITS, assignSplits, loadCases, sampleCorpus, seededRandom, type DraftCase, type EvalCase } from "./cases.ts";
import { corpusCategory, definitionFor, numberTokens, rephrased, wordDistance } from "./definitions.ts";
import { generate, mockCompletion, payloadBuilder, payloadFingerprint, readAnswers, type AnswerRow, type Outcome } from "./generate.ts";
import { answerRef, borderlineCases, buildJudgeTable, labelRef, readLabels, readVerdicts, type JudgeBlock, type Label, type Verdicts } from "./judge.ts";
import { REQUEST_TYPES } from "./ledger.ts";
import { agreement, compare, decide, evaluateAnswers, summarize, type AnswerResult } from "./score.ts";

const variant = definitionFor("card-variant-basic");
const help = definitionFor("card-help");
const variantType = REQUEST_TYPES[0];
const card = (front: string, back: string, avoid?: string[]) => ({ kind: "basic" as const, source: { front, back }, ...(avoid ? { avoid } : {}) });
const cases: EvalCase[] = [
  { id: "a", category: "definitionen", split: "dev", request: card("Was ist Osmose?", "Diffusion von Wasser") },
  { id: "b", category: "zahlen-formeln", split: "dev", request: card("In welchem Jahr begann die Französische Revolution?", "1789") },
];
const row = (caseId: string, repetition: number, output: unknown, outcome: Outcome = "answer"): AnswerRow => ({ caseId, repetition, outcome, error: outcome === "answer" ? null : outcome === "refused" ? "not_rephrasable" : "invalid_variant", output, model: "mock", totalTokens: 120, costUsd: 0.001, latencyMs: 1000 + repetition * 500, transcript: { request: null, response: null } });
const result = (caseId: string, repetition: number, main: boolean, criteria: Record<string, boolean> = { M1: true, M2: main }): AnswerResult => ({ caseId, repetition, category: "definitionen", trap: false, outcome: "answer", criteria, main, costUsd: 0.001, latencyMs: 1000, totalTokens: 100, model: "mock" });
const completion = (toolArguments: unknown, cost = 0) => new Response(JSON.stringify({ ...mockCompletion("create_card_variant", toolArguments), usage: { total_tokens: 120, cost } }), { status: 200 });

test("Versionierte Prüfkarten und Handurteile bestehen den Anfragevertrag und sind aufgeteilt", () => {
  for (const id of ["card-variant-basic", "card-variant-cloze", "card-variant-choice", "card-help"]) {
    const definition = definitionFor(id);
    const loaded = loadCases(definition);
    assert.ok(loaded.length >= 24);
    for (const category of new Set(loaded.map((entry) => entry.category))) {
      for (const split of ["train", "dev"] as const) assert.ok(loaded.some((entry) => entry.category === category && entry.split === split), `${id} ${category} ${split}`);
    }
    assert.deepEqual(loaded.filter((entry) => entry.refuse).map((entry) => entry.category), definition.refusal ? ["nicht-umformulierbar", "nicht-umformulierbar"] : []);
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
  const { H8 } = help.automatic;
  assert.equal(H8(null, "Kurze Antwort.\n- Punkt"), true);
  assert.equal(H8(null, "**Fett** ist kein Klartext."), false);
  assert.equal(H8(null, Array.from({ length: 151 }, () => "Wort").join(" ")), false);
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
  assert.ok(first.every((entry) => /^corpus-[0-9a-f]{10}-(?:explain|example)$/.test(entry.id) && /^note-[0-9a-f]{10}$/.test(entry.group ?? "") && help.parseRequest(entry.request)));
  assert.equal(first[0].group, first[1].group);
  assert.notDeepEqual(first, await sampleCorpus(help, 6, 2, "fixtures/apkg"));
});

test("Die Aufteilung folgt 40/30/30 je Kategorie, hält Gruppen zusammen, ist wiederholbar und lässt Zuordnungen stehen", () => {
  const drafts: DraftCase[] = Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, category: index < 10 ? "x" : "y", request: {}, ...(index === 1 || index === 2 ? { group: "g" } : {}) }));
  drafts[0].split = "holdout";
  drafts[2].split = "dev";
  const first = assignSplits(drafts, seededRandom(7));
  assert.deepEqual(first, assignSplits(drafts, seededRandom(7)));
  assert.deepEqual(first.slice(0, 3).map((entry) => entry.split), ["holdout", "dev", "dev"]);
  const count = (category: string) => SPLITS.map((split) => first.filter((entry) => entry.category === category && entry.split === split).length);
  assert.deepEqual([count("x"), count("y")], [[4, 3, 3], [4, 3, 3]]);
  assert.deepEqual(assignSplits(first, seededRandom(99)), first);
  assert.throws(() => assignSplits([{ ...drafts[1], split: "train" }, drafts[2]], seededRandom(1)), /Gruppe g liegt in mehreren Teilen/);
});

test("Erzeugung: jede Anfrage endet in einer Antwortklasse, Anbieterfehler werden wiederholt, ein zweiter Aufruf setzt fort", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
  try {
    const responses: (() => Response)[] = [
      () => completion({ rephrasable: true, front: "Was ist Osmose?", back: "Diffusion von Wasser" }, 0.01),
      () => new Response("{}", { status: 429 }),
      () => completion({ rephrasable: true, front: "Wie nennt man die Diffusion von Wasser durch eine Membran?", back: "Diffusion von Wasser" }),
      () => completion({ rephrasable: false, front: "", back: "" }, 0.02),
      () => { throw Object.assign(new Error("abgelaufen"), { name: "TimeoutError" }); },
      ...Array.from({ length: 5 }, () => () => new Response("{}", { status: 503 })),
      () => completion({ rephrasable: true, front: "Welcher Vorgang ist die Diffusion von Wasser?", back: "Diffusion von Wasser" }),
    ];
    let calls = 0;
    const fetchImpl = (async () => responses[calls++]()) as typeof fetch;
    const options = { definition: variant, cases: cases.slice(0, 1), repetitions: 5, split: "dev" as const, directory, apiKey: "test", fetchImpl, concurrency: 1, retryDelayMs: 0, log: () => {} };
    assert.equal(await generate(options), 1);
    assert.deepEqual(readAnswers(directory).map((entry) => [entry.repetition, entry.outcome, entry.error, entry.costUsd]), [
      [0, "rejected", "invalid_variant", 0.01], [1, "answer", null, 0], [2, "refused", "not_rephrasable", 0.02], [3, "timeout", "provider_timeout", null],
    ]);
    assert.equal(await generate(options), 0);
    assert.equal(calls, 11);
    assert.deepEqual(readAnswers(directory).map((entry) => entry.repetition), [0, 1, 2, 3, 4]);
    await assert.rejects(generate({ ...options, repetitions: 3 }), /mit repetitions = 5 begonnen/);
    const changed = { ...variant, buildPayload: (request: unknown) => ({ ...variant.buildPayload(request), max_tokens: 1 }) };
    await assert.rejects(generate({ ...options, definition: changed }), /mit fingerprint = [0-9a-f]{16} begonnen/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Erzeugung: Verwerfen der Route und eine Antwort ohne JSON zählen als Antwort, das Budget hält den Lauf an", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
  try {
    const cloze = definitionFor("card-variant-cloze");
    const request = cloze.parseRequest({ kind: "cloze", source: { front: "Die Hauptstadt Frankreichs ist {{c1::Paris}}.", back: "Paris" } });
    let calls = 0;
    const fetchImpl = (async () => calls++ === 0 ? new Response("kein JSON", { status: 200 }) : completion({ rephrasable: true, front: "Frankreichs Hauptstadt heißt Paris.", back: "Paris" }, 0.4)) as typeof fetch;
    const options = { definition: cloze, cases: [{ id: "l", category: "x", split: "dev" as const, request }], repetitions: 5, split: "dev" as const, directory, apiKey: "test", fetchImpl, concurrency: 1, budgetUsd: 1, log: () => {} };
    await assert.rejects(generate(options), /Budget von 1 USD erreicht/);
    assert.deepEqual(readAnswers(directory).map((entry) => [entry.outcome, entry.error]), [["rejected", "invalid_provider_response"], ["rejected", "invalid_gaps"], ["rejected", "invalid_gaps"], ["rejected", "invalid_gaps"]]);
    assert.equal(await generate({ ...options, budgetUsd: 2 }), 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const verdictFor = (block: JudgeBlock, results: (entry: string, id: string) => boolean, sure = () => 3) => ({
  verdicts: block.entries.map((entry) => ({ entry: entry.entry, results: Object.fromEntries(entry.criteria.map((id) => [id, results(entry.entry, id)])), sure: Object.fromEntries(entry.criteria.map((id) => [id, sure()])) })),
});

test("Richtertabelle: ohne Dubletten und ohne Herkunft; unvollständige Urteile brechen ab", () => {
  const same = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const items = [0, 1].map((repetition) => ({ ref: answerRef("a", repetition), request: cases[0].request, output: same }));
  const control = { ref: labelRef("kontrolle-1"), request: cases[1].request, output: { front: "Wann endete die Französische Revolution?", back: "1789" } };
  const { blocks, key } = buildJudgeTable(variant, [...items, control], seededRandom(1), { instructions: "Auftrag", requests: [] });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].entries.length, 2);
  assert.doesNotMatch(JSON.stringify(blocks), /answer:|label:|kontrolle/);
  assert.deepEqual(blocks[0].criteria.map((criterion) => criterion.id), ["M2", "M6"]);
  assert.deepEqual(readVerdicts(blocks, [verdictFor(blocks[0], () => true)], key).judged, 1, "Kontrolleinträge zählen nicht als bewertete Einträge");
  assert.deepEqual(Object.values(key.entries).map((refs) => refs.length).sort(), [1, 2]);
  assert.equal(Object.keys(key.hashes).length, 1, "Kontrolleinträge kommen nie in den Urteilscache");
  const complete = verdictFor(blocks[0], () => true);
  assert.deepEqual(readVerdicts(blocks, [complete], key).verdicts.get(answerRef("a", 1)), { M2: true, M6: true });
  assert.throws(() => readVerdicts(blocks, [null], key), /Urteile fehlen für Block 1/);
  assert.throws(() => readVerdicts(blocks, [{ verdicts: complete.verdicts.slice(1) }], key), /unvollständig \(1 Einträge\)/);
  assert.throws(() => readVerdicts(blocks, [{ verdicts: complete.verdicts.map((verdict) => ({ ...verdict, sure: { M2: 3 } })) }], key), /braucht genau M2, M6/);
});

test("Richterblöcke: höchstens 25 Einträge, Doppel in einem anderen Block, Rauschen aus gekippten Doppeln, Urteilscache für gleiche Ausgaben", () => {
  const items = Array.from({ length: 60 }, (_, index) => ({ ref: answerRef(`c${index}`, 0), request: cases[0].request, output: { front: `Variante Nummer ${index}?`, back: "Diffusion von Wasser" } }));
  const { blocks, key } = buildJudgeTable(variant, items, seededRandom(2), { instructions: "Auftrag", requests: [] });
  assert.equal(blocks.length, 3);
  assert.equal(blocks.reduce((sum, block) => sum + block.entries.length, 0), 70);
  assert.ok(blocks.every((block) => block.entries.filter((entry) => !key.duplicates[entry.entry]).length <= 25));
  assert.equal(Object.keys(key.duplicates).length, 10);
  const blockOf = (entry: string) => blocks.findIndex((block) => block.entries.some((candidate) => candidate.entry === entry));
  for (const [duplicate, original] of Object.entries(key.duplicates)) assert.notEqual(blockOf(duplicate), blockOf(original));
  const flippedOn = Object.keys(key.duplicates)[0];
  const reading = readVerdicts(blocks, blocks.map((block) => verdictFor(block, (entry, id) => !(entry === flippedOn && id === "M2"), () => 2)), key);
  assert.deepEqual(reading.noise, { M2: 0.1, M6: 0 });
  assert.deepEqual([reading.judged, reading.cached, Object.keys(reading.fresh).length], [60, 0, 60]);
  const borderline = borderlineCases(blocks, reading);
  assert.equal(borderline.find(({ id }) => id === "M2")!.cases[0].entry, key.duplicates[flippedOn], "gekippte Urteile stehen vorn");
  assert.ok(borderline.every(({ cases: picked }) => picked.length === 3));

  const again = buildJudgeTable(variant, [...items, { ref: answerRef("neu", 0), request: cases[0].request, output: { front: "Ganz neue Variante?", back: "Diffusion von Wasser" } }], seededRandom(3), { instructions: "Auftrag", requests: [], cache: reading.fresh });
  assert.deepEqual([again.blocks.length, again.blocks[0].entries.length, Object.keys(again.key.cached).length], [1, 1, 60]);
  const cachedReading = readVerdicts(again.blocks, [verdictFor(again.blocks[0], () => false)], again.key, reading.fresh);
  assert.deepEqual([cachedReading.verdicts.get(answerRef("c5", 0)), cachedReading.verdicts.get(answerRef("neu", 0))], [{ M2: true, M6: true }, { M2: false, M6: false }]);
  assert.equal(buildJudgeTable(variant, items, seededRandom(3), { instructions: "Geänderter Auftrag", requests: [], cache: reading.fresh }).blocks.length, 3, "ein anderer Richterauftrag nutzt den Cache nicht");
  assert.notEqual(again.key.judge, buildJudgeTable(variant, items, seededRandom(3), { instructions: "Geänderter Auftrag", requests: [] }).key.judge);
});

test("Fingerabdruck des Richters hängt am Fallsatz, nicht an den Antworten eines Laufs", () => {
  const explain = help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode: "explain" });
  const example = help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode: "example" });
  const answer = { ref: answerRef("x", 0), request: explain, output: "ATP speichert Energie." };
  const fingerprint = (items: typeof answer[]) => buildJudgeTable(help, items, seededRandom(1), { instructions: "Auftrag", requests: [explain, example] }).key.judge;
  assert.equal(fingerprint([answer]), fingerprint([]), "fehlt H4, weil alle Beispiel-Antworten verworfen wurden, bleibt der Fingerabdruck gleich");
});

test("Fingerabdruck des Payloads: unabhängig von der Feldreihenfolge, empfindlich für Nutzernachricht und Kandidat", () => {
  const code = payloadFingerprint(payloadBuilder(variant), cases);
  const reordered = { name: "umgestellt", transform: (payload: unknown) => Object.fromEntries(Object.entries(payload as object).reverse()) };
  assert.equal(payloadFingerprint(payloadBuilder(variant, reordered), cases), code);
  const userMessage = { name: "nutzer", transform: (payload: unknown) => {
    const value = payload as { messages: { role: string; content: string }[] };
    return { ...value, messages: value.messages.map((message) => message.role === "user" ? { ...message, content: `Bitte genau: ${message.content}` } : message) };
  } };
  assert.notEqual(payloadFingerprint(payloadBuilder(variant, userMessage), cases), code);
});

test("Auswertung: Hauptwert verlangt Vertrag, automatische Kriterien und Richterurteil; Kriterien zählen nur gültige Antworten", () => {
  const good = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const rows = [row("a", 0, good), row("a", 1, null, "rejected"), row("b", 0, { front: "Wann fing die Französische Revolution an?", back: "1799" }), row("b", 1, { front: "Wann fing die Französische Revolution an?", back: "1789" })];
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

test("Auswertung: Eine Ablehnung besteht nur, wenn der Fall sie erwartet, und geht nie an den Richter", () => {
  const refuse: EvalCase = { id: "r", category: "nicht-umformulierbar", split: "dev", refuse: true, request: card("xqzt vblm?", "krwp") };
  const good = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const rows = [row("r", 0, null, "refused"), row("r", 1, { front: "Was bedeutet xqzt?", back: "krwp" }), row("a", 0, null, "refused"), row("a", 1, good)];
  const results = evaluateAnswers(variant, [refuse, cases[0]], 2, rows, new Map([[answerRef("a", 1), { M2: true, M6: true }]]));
  assert.deepEqual(results.map((entry) => [entry.outcome, entry.criteria, entry.main]), [
    ["refused", { M1: true, M7: true }, true],
    ["answer", { M1: true, M7: false }, false],
    ["refused", { M1: true, M7: false }, false],
    ["answer", { M1: true, M7: true, M3: true, M4: true, M5: true, M2: true, M6: true }, true],
  ]);
  assert.deepEqual(summarize(results, seededRandom(1)).outcomes, { answer: 2, refused: 2, rejected: 0, timeout: 0 });
  const trapped = evaluateAnswers(variant, [{ ...cases[0], trap: true }], 2, [row("a", 0, good), row("a", 1, good)], new Map([[answerRef("a", 0), { M2: false, M6: true }], [answerRef("a", 1), { M2: true, M6: true }]]));
  assert.deepEqual(summarize(trapped, seededRandom(1), ["M2"]).traps, { answers: 2, errors: 1 });
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
  assert.deepEqual(decide(variantType, summaries[0], summaries[1], strong), { decision: "accepted", failed: [] });
  const weak = compare(noisy, reference, seededRandom(5));
  assert.deepEqual([weak.delta, weak.gained, weak.lost], [0, 1, 1]);
  assert.deepEqual(decide(variantType, summaries[2], summaries[1], weak).failed, ["Abstand nicht über dem Rauschen"]);
  assert.equal(decide(variantType, summaries[2], summaries[1], weak, true).decision, "accepted", "eine Vereinfachung darf im Rauschen liegen");
  const saturated = compare(reference, reference, seededRandom(5));
  assert.deepEqual([saturated.delta, saturated.noise], [0, 0]);
  assert.equal(decide(variantType, summaries[1], summaries[1], saturated, true).decision, "accepted", "gleich gut gilt als nicht schlechter");
  const worseCritical = { ...summaries[0], criteria: { ...summaries[0].criteria, M2: 0.1 } };
  assert.deepEqual(decide(variantType, worseCritical, summaries[1], strong).failed, ["kritisches Kriterium M2 schlechter"]);
  const slower = { ...summaries[0], costUsd: summaries[1].costUsd * 1.3, latencyP90Ms: summaries[1].latencyP90Ms * 1.21 };
  assert.deepEqual(decide(variantType, slower, summaries[1], strong).failed, ["Kosten über dem 1,2-Fachen", "Latenz p90 über dem 1,2-Fachen"]);
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
