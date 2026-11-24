import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SPLITS, assignSplits, loadCases, placeholderCard, sampleCorpus, seededRandom, type DraftCase, type EvalCase } from "./cases.ts";
import { corpusCategory, definitionFor, judgeItemsFor, numberTokens, rephrased, wordDistance, type EvalDefinition } from "./definitions.ts";
import { generate, mockCompletion, payloadBuilder, payloadFingerprint, readAnswers, type AnswerRow, type Outcome } from "./generate.ts";
import { answerRef, borderlineCases, buildJudgeTable, labelRef, readLabels, readVerdicts, referenceRef, unsureKey, type JudgeBlock, type Label, type Verdicts } from "./judge.ts";
import { REQUEST_TYPES } from "./ledger.ts";
import { agreement, compare, decide, evaluateAnswers, summarize, type AnswerResult } from "./score.ts";

const variant = definitionFor("card-variant-basic");
const help = definitionFor("card-help");
const variantType = REQUEST_TYPES[0];
const card = (front: string, back: string, avoid?: string[]) => ({ kind: "basic" as const, source: { front, back }, ...(avoid ? { avoid } : {}) });
const cases: EvalCase[] = [
  { id: "a", category: "definitionen", subject: "naturwissenschaft", split: "dev", request: card("Was ist Osmose?", "Diffusion von Wasser") },
  { id: "b", category: "zahlen-formeln", subject: "naturwissenschaft", split: "dev", request: card("In welchem Jahr begann die Französische Revolution?", "1789") },
];
const row = (caseId: string, repetition: number, output: unknown, outcome: Outcome = "answer"): AnswerRow => ({ caseId, repetition, outcome, error: outcome === "answer" ? null : outcome === "refused" ? "not_rephrasable" : "invalid_variant", output, model: "mock", totalTokens: 120, costUsd: 0.001, latencyMs: 1000 + repetition * 500, transcript: { request: null, response: null } });
const result = (caseId: string, repetition: number, main: boolean, category = "definitionen"): AnswerResult => ({ caseId, repetition, category, trap: false, outcome: "answer", criteria: { M1: 1, M2: main ? 1 : 0 }, main: main ? 1 : 0, costUsd: 0.001, latencyMs: 1000, totalTokens: 100, model: "mock" });
const item = (definition: EvalDefinition, ref: string, request: unknown, output: unknown) => judgeItemsFor(definition, ref, request, output)[0];
const completion = (toolArguments: unknown, cost = 0) => new Response(JSON.stringify({ ...mockCompletion("create_card_variant", toolArguments), usage: { total_tokens: 120, cost } }), { status: 200 });

test("Versionierte Prüfkarten und Handurteile bestehen den Anfragevertrag und sind aufgeteilt", () => {
  for (const id of ["card-variant-basic", "card-variant-cloze", "card-variant-choice", "card-help"]) {
    const definition = definitionFor(id);
    const loaded = loadCases(definition);
    assert.ok(loaded.length >= 24);
    for (const category of new Set(loaded.map((entry) => entry.category))) {
      for (const split of ["train", "dev"] as const) assert.ok(loaded.some((entry) => entry.category === category && entry.split === split), `${id} ${category} ${split}`);
    }
    const refused = loaded.filter((entry) => entry.refuse);
    assert.ok(definition.refusal ? refused.length >= 2 && refused.every((entry) => entry.category === "nicht-umformulierbar") : !refused.length, id);
    const groups = new Map<string, Set<string>>();
    for (const entry of loaded) if (entry.group) groups.set(entry.group, new Set([...(groups.get(entry.group) ?? []), entry.split]));
    assert.ok([...groups.values()].every((splits) => splits.size === 1), `${id}: eine Gruppe liegt in mehreren Teilen`);
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

test("Korpusziehung überspringt gelöschte, Platzhalter- und ID-Karten echter Stapel", () => {
  assert.equal(placeholderCard({ front: "Inhalt gelöscht - !DELETE markierte Karte", back: "Inhalt gelöscht - !DELETE markierte Karte Hydrozephalus" }), true);
  assert.equal(placeholderCard({ front: "Alte PLATZHALTER - delete", back: "1684769975937 4489d860" }), true);
  assert.equal(placeholderCard({ front: "1671009369950", back: "d29bdef1-fd5e-48bb-9f37-7329b24d0e45" }), true);
  assert.equal(placeholderCard({ front: "Spannmuskeln M. vocalis", back: "N. laryngeus inferior" }), false);
});

test("Korpusziehung liefert bei gleichem Startwert dieselben Fälle im Anfragevertrag der Route", async () => {
  const first = await sampleCorpus(help, 6, 1, "fixtures/apkg");
  assert.deepEqual(first, await sampleCorpus(help, 6, 1, "fixtures/apkg"));
  assert.equal(first.length, 6);
  assert.ok(first.every((entry) => entry.subject === "fundus" && /^corpus-[0-9a-f]{10}-(?:explain|example)$/.test(entry.id) && /^note-[0-9a-f]{10}$/.test(entry.group ?? "") && help.parseRequest(entry.request)));
  assert.equal(first[0].group, first[1].group);
  assert.notDeepEqual(first, await sampleCorpus(help, 6, 2, "fixtures/apkg"));
});

test("Die Aufteilung folgt 35/40/25 je Kategorie und je Fach, hält Gruppen zusammen, ist wiederholbar und lässt Zuordnungen stehen", () => {
  const drafts: DraftCase[] = Array.from({ length: 40 }, (_, index) => ({ id: `c${index}`, category: index < 20 ? "x" : "y", subject: index % 3 ? "medizin" : "sprachen", request: {}, ...(index === 1 || index === 2 ? { group: "g" } : {}) }));
  drafts[0].split = "holdout";
  drafts[2].split = "dev";
  const first = assignSplits(drafts, seededRandom(7));
  assert.deepEqual(first, assignSplits(drafts, seededRandom(7)));
  assert.deepEqual(first.slice(0, 3).map((entry) => entry.split), ["holdout", "dev", "dev"]);
  const count = (field: "category" | "subject", value: string) => SPLITS.map((split) => first.filter((entry) => entry[field] === value && entry.split === split).length);
  assert.deepEqual([count("category", "x"), count("category", "y"), count("subject", "medizin"), count("subject", "sprachen")], [[7, 8, 5], [7, 8, 5], [9, 11, 6], [5, 5, 4]]);
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
    const options = { definition: cloze, cases: [{ id: "l", category: "x", subject: "naturwissenschaft" as const, split: "dev" as const, request }], repetitions: 5, split: "dev" as const, directory, apiKey: "test", fetchImpl, concurrency: 1, budgetUsd: 1, log: () => {} };
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

test("Referenzaussagen eines Falls stehen in jeder Richtereingabe, sonst keine", () => {
  const output = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const reference = ["Osmose ist die Diffusion von Wasser durch eine semipermeable Membran.", "Sie folgt dem Konzentrationsgefälle."];
  assert.equal(judgeItemsFor(variant, answerRef("a", 0), cases[0].request, output, reference)[0].rendered.eingabe.referenz, reference.join("\n"));
  assert.equal("referenz" in item(variant, answerRef("a", 0), cases[0].request, output).rendered.eingabe, false);
});

test("Richtertabelle: ohne Dubletten und ohne Herkunft; unvollständige Urteile brechen ab", () => {
  const same = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const items = [0, 1].map((repetition) => item(variant, answerRef("a", repetition), cases[0].request, same));
  const control = item(variant, labelRef("kontrolle-1"), cases[1].request, { front: "Wann endete die Französische Revolution?", back: "1789" });
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
  const items = Array.from({ length: 60 }, (_, index) => item(variant, answerRef(`c${index}`, 0), cases[0].request, { front: `Variante Nummer ${index}?`, back: "Diffusion von Wasser" }));
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
  assert.ok(borderline.every(({ cases: picked }) => picked.every((entry) => !key.duplicates[entry.entry])), "Doppel erscheinen nicht als eigener Grenzfall");

  const again = buildJudgeTable(variant, [...items, item(variant, answerRef("neu", 0), cases[0].request, { front: "Ganz neue Variante?", back: "Diffusion von Wasser" })], seededRandom(3), { instructions: "Auftrag", requests: [], cache: reading.fresh });
  assert.deepEqual([again.blocks.length, again.blocks[0].entries.length, Object.keys(again.key.cached).length], [1, 1, 60]);
  const cachedReading = readVerdicts(again.blocks, [verdictFor(again.blocks[0], () => false)], again.key, reading.fresh);
  assert.deepEqual([cachedReading.verdicts.get(answerRef("c5", 0)), cachedReading.verdicts.get(answerRef("neu", 0))], [{ M2: true, M6: true }, { M2: false, M6: false }]);
  assert.equal(buildJudgeTable(variant, items, seededRandom(3), { instructions: "Geänderter Auftrag", requests: [], cache: reading.fresh }).blocks.length, 3, "ein anderer Richterauftrag nutzt den Cache nicht");
  assert.notEqual(again.key.judge, buildJudgeTable(variant, items, seededRandom(3), { instructions: "Geänderter Auftrag", requests: [] }).key.judge);
});

test("Rauschen zählt je Einzelurteil: eine gekippte von vier Kernaussagen ist ein Viertel, nicht der ganze Eintrag", () => {
  const criteria = [1, 2, 3, 4].map((index) => ({ id: `Q6:doc-${index}`, title: `Kernaussage ${index}`, pass: "ja", fail: "nein" }));
  const entry = (id: string) => ({ entry: id, criteria: criteria.map((criterion) => criterion.id), eingabe: { quelle: "doc" }, ausgabe: { karten: "1. Frage → Antwort" } });
  const blocks: JudgeBlock[] = [{ requestType: "source-cards", criteria, entries: [entry("e0001")] }, { requestType: "source-cards", criteria, entries: [entry("e0002")] }];
  const key = { judge: "0000000000000000", entries: { e0001: [answerRef("d", 0)] }, duplicates: { e0002: "e0001" }, hashes: { e0001: "h" }, cached: {} };
  const verdict = (id: string, flip: boolean) => ({ verdicts: [{ entry: id, results: Object.fromEntries(criteria.map((criterion, index) => [criterion.id, !(flip && index === 0)])), sure: Object.fromEntries(criteria.map((criterion) => [criterion.id, 3])) }] });
  assert.deepEqual(readVerdicts(blocks, [verdict("e0001", false), verdict("e0002", true)], key).noise, { Q6: 0.25 });
});

test("Fingerabdruck des Richters hängt am Fallsatz, nicht an den Antworten eines Laufs", () => {
  const explain = help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode: "explain" });
  const example = help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode: "example" });
  const answer = item(help, answerRef("x", 0), explain, "ATP speichert Energie.");
  const fingerprint = (items: typeof answer[]) => buildJudgeTable(help, items, seededRandom(1), { instructions: "Auftrag", requests: [explain, example] }).key.judge;
  assert.equal(fingerprint([answer]), fingerprint([]), "fehlt H4, weil alle Beispiel-Antworten verworfen wurden, bleibt der Fingerabdruck gleich");
  const withReference = (reference: string) => buildJudgeTable(help, [answer], seededRandom(1), { instructions: "Auftrag", requests: [explain, example], references: [[reference], []] }).key.judge;
  assert.notEqual(withReference("ATP ist der universelle Energieträger der Zelle."), withReference("ATP liefert Energie durch Hydrolyse."), "eine geänderte Referenz verlangt eine neue Baseline");
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
  assert.deepEqual(results.map((entry) => entry.main), [1, 0, 0, 0]);
  assert.deepEqual(results[1].criteria, { M1: 0 });
  assert.equal(results[2].criteria.M3, 0);
  const summary = summarize(results, seededRandom(3));
  assert.deepEqual([summary.cases, summary.repetitions, summary.main], [2, 2, 0.25]);
  assert.deepEqual([summary.criteria.M1, summary.criteria.M2, summary.criteria.M3], [0.75, 0.6667, 0.6667]);
  assert.ok(summary.low <= summary.main && summary.main <= summary.high);
  assert.equal(summary.latencyP90Ms, 1500);
  assert.throws(() => evaluateAnswers(variant, cases, 2, rows.slice(1), verdicts), /Antwort a#0 fehlt/);
  assert.throws(() => evaluateAnswers(variant, cases, 2, rows, new Map()), /Richterurteil M2 für a#0 fehlt/);
});

test("Auswertung: Nachmessungen zählen mit, ein Urteil mit Sicherheit 1 weder als bestanden noch als durchgefallen", () => {
  const good = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const rows = [0, 1, 2, 3].map((repetition) => row("a", repetition, good));
  const verdicts: Verdicts = new Map(rows.map((entry) => [answerRef("a", entry.repetition), { M2: entry.repetition !== 1, M6: true }]));
  const unsure = new Set([unsureKey(answerRef("a", 1), "M2")]);
  const results = evaluateAnswers(variant, cases.slice(0, 1), 2, rows, verdicts, { unsure });
  assert.deepEqual(results.map((entry) => [entry.repetition, entry.main, entry.criteria.M2]), [[0, 1, 1], [1, null, undefined], [2, 1, 1], [3, 1, 1]]);
  const summary = summarize(results, seededRandom(1));
  assert.deepEqual([summary.repetitions, summary.main], [4, 1]);
  const helpCase: EvalCase = { id: "h", category: "sonstige", subject: "naturwissenschaft", split: "dev", request: help.parseRequest({ card: { prompt: "Was ist ATP?", answer: "Energieträger" }, mode: "explain" }) };
  const helpVerdict = { H1: true, H2: true, H3: true, H6: false, H7: true };
  const helpResults = evaluateAnswers(help, [helpCase], 1, [row("h", 0, "ATP speichert Energie.")], new Map([[answerRef("h", 0), helpVerdict]]), { unsure: new Set([unsureKey(answerRef("h", 0), "H2")]) });
  assert.equal(helpResults[0].main, 0, "ein sicher durchgefallenes Hauptkriterium entscheidet trotz unsicherem anderen");
  const remeasured = evaluateAnswers(variant, cases.slice(0, 1), 0, [row("a", 0, good)], new Map([[referenceRef("a", 0), { M2: false, M6: true }]]), { refFor: referenceRef });
  assert.deepEqual(remeasured.map((entry) => entry.main), [0]);
});

test("Auswertung: Eine Ablehnung besteht nur, wenn der Fall sie erwartet, und geht nie an den Richter", () => {
  const refuse: EvalCase = { id: "r", category: "nicht-umformulierbar", subject: "naturwissenschaft", split: "dev", refuse: true, request: card("xqzt vblm?", "krwp") };
  const good = { front: "Wie nennt man die Diffusion von Wasser?", back: "Diffusion von Wasser" };
  const rows = [row("r", 0, null, "refused"), row("r", 1, { front: "Was bedeutet xqzt?", back: "krwp" }), row("a", 0, null, "refused"), row("a", 1, good)];
  const results = evaluateAnswers(variant, [refuse, cases[0]], 2, rows, new Map([[answerRef("a", 1), { M2: true, M6: true }]]));
  assert.deepEqual(results.map((entry) => [entry.outcome, entry.criteria, entry.main]), [
    ["refused", { M1: 1, M7: 1 }, 1],
    ["answer", { M1: 1, M7: 0 }, 0],
    ["refused", { M1: 1, M7: 0 }, 0],
    ["answer", { M1: 1, M7: 1, M3: 1, M4: 1, M5: 1, M2: 1, M6: 1 }, 1],
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

test("Vergleich mit Fehlerbild: vorläufig bei zwei Fällen Saldo am Ziel und höchstens einem verlorenen im Rest", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `c${index}`);
  const category = (index: number) => index < 6 ? "beispiel" : "sonstige";
  const reference = ids.flatMap((id, index) => [0, 1].map((repetition) => result(id, repetition, index >= 3, category(index))));
  const aimed = ids.flatMap((id, index) => [0, 1].map((repetition) => result(id, repetition, index >= 1 && index !== 20, category(index))));
  const summaries = [aimed, reference].map((entries) => summarize(entries, seededRandom(5)));
  const plain = compare(aimed, reference, seededRandom(5));
  assert.equal(plain.targeted, null);
  assert.deepEqual(decide(variantType, summaries[0], summaries[1], plain).decision, "rejected");
  const targeted = compare(aimed, reference, seededRandom(5), ["beispiel"]);
  assert.deepEqual([targeted.targeted?.aimed, targeted.targeted?.rest], [{ cases: 6, gained: 2, lost: 0 }, { cases: 34, gained: 0, lost: 1 }]);
  assert.deepEqual(decide(variantType, summaries[0], summaries[1], targeted), { decision: "provisional", failed: [] });
  const broken = ids.flatMap((id, index) => [0, 1].map((repetition) => result(id, repetition, index >= 1 && index !== 20 && index !== 21, category(index))));
  const worse = compare(broken, reference, seededRandom(5), ["beispiel"]);
  assert.deepEqual(decide(variantType, summarize(broken, seededRandom(5)), summaries[1], worse).failed, ["Abstand nicht über dem Rauschen", "übrige Fälle um mehr als einen schlechter"]);
  assert.throws(() => compare(aimed, reference, seededRandom(5), ["M2"]), /keinen oder jeden Fall/, "ohne Rest prüft das Fehlerbild nichts");
  assert.throws(() => compare(aimed, reference, seededRandom(5), ["beispeil"]), /kennt beispeil nicht/);
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

const sourceCards = definitionFor("source-cards");
const summary = definitionFor("learning-summary");
const toolCompletion = (tool: string, toolArguments: unknown, cost = 0.001) => new Response(JSON.stringify({ ...mockCompletion(tool, toolArguments), usage: { total_tokens: 500, cost } }), { status: 200 });
const sourceCard = (front: string, source = "s1", extra: Record<string, unknown> = {}) => ({ form: "basic", front, back: "Antwort", options: [], explanation: "", sources: [source], ...extra });

test("Karten aus einer Quelle: jedes Prüfdokument wird gelesen, das PDF über seine gelesenen Seiten ohne die Seite ohne Textlayer", () => {
  for (const source of ["zellatmung.md", "gewaltenteilung.txt", "netzwerk-glossar.csv", "franzoesische-revolution.tsv", "ohmsches-gesetz.pdf"]) {
    const request = sourceCards.parseRequest({ source, profile: "standard" }) as { units: { label: string }[]; keypoints: string[] };
    assert.ok(request.units.length >= 1 && request.keypoints.length >= 9, source);
  }
  const pdf = sourceCards.parseRequest({ source: "ohmsches-gesetz.pdf", profile: "weniger" }) as { units: { label: string }[]; settings: { amount: string } };
  assert.deepEqual([...new Set(pdf.units.map((unit) => unit.label))], ["Seite 1", "Seite 3"]);
  assert.equal(pdf.settings.amount, "less");
  assert.equal(sourceCards.parseRequest({ source: "fehlt.md", profile: "standard" }), null);
  assert.equal(sourceCards.parseRequest({ source: "zellatmung.md", profile: "viel" }), null);
});

test("Karten aus einer Quelle: ein Auftrag läuft wie in der App, wird anteilig gewertet und liefert Messgrößen", async () => {
  const request = sourceCards.parseRequest({ source: "gewaltenteilung.txt", profile: "standard" }) as { units: unknown[]; keypoints: string[] };
  const fronts = Array.from({ length: 12 }, (_, index) => `Welche Aussage ${index + 1} trifft auf die Gewaltenteilung zu?`);
  const output = await sourceCards.run!(request, async () => mockCompletion("create_source_cards", { cards: fronts.map((front) => sourceCard(front)), warnings: [] })) as { cards: unknown[]; failed: number };
  assert.deepEqual([output.cards.length, output.failed], [12, 0]);
  const items = judgeItemsFor(sourceCards, answerRef("g", 0), request, output);
  const cards = items.filter((entry) => entry.key.startsWith("karte-"));
  const keypoints = items.find((entry) => entry.key === "kernaussagen")!;
  assert.equal(cards.length, 5, "Stichprobe von fünf Karten");
  assert.deepEqual(cards[0].criteria.map((criterion) => criterion.id), ["Q2", "Q3", "Q4"]);
  assert.match(cards[0].rendered.eingabe.belegstellen, /Gewaltenteilung/);
  assert.equal(keypoints.criteria.length, request.keypoints.length);
  assert.ok(keypoints.criteria.every((criterion) => criterion.id.startsWith("Q6:gewaltenteilung-")));
  const verdicts: Verdicts = new Map(items.map((entry, index) => [entry.ref, Object.fromEntries(entry.criteria.map((criterion, position) => [criterion.id, !(index === 0 && criterion.id === "Q3") && !(entry.key === "kernaussagen" && position < 2)]))]));
  const [graded] = evaluateAnswers(sourceCards, [{ id: "g", category: "standard", subject: "naturwissenschaft", split: "dev", request }], 1, [{ ...row("g", 0, output), outcome: "answer" }], verdicts);
  assert.equal(graded.main, 0.8, "vier von fünf Karten bestehen Q2 bis Q4");
  assert.equal(graded.criteria.Q6, Math.round((request.keypoints.length - 2) / request.keypoints.length * 10000) / 10000);
  assert.equal(graded.criteria.Q1, 1);
  assert.equal(graded.metrics!.karten, 12);
  assert.equal(graded.metrics!.anteil_frage_antwort, 1);

  const counting = sourceCards.parseRequest({ source: "gewaltenteilung.txt", profile: "mehr" });
  assert.deepEqual(judgeItemsFor(sourceCards, answerRef("g", 0), counting, output).filter((entry) => entry.key.startsWith("karte-")).map((entry) => entry.criteria.map((criterion) => criterion.id).join()), ["Q2", "Q2", "Q2"]);
});

test("Karten aus einer Quelle: eine Zeitüberschreitung ist ein gescheiterter Abschnitt, ein Schlüsselfehler lässt den Fall offen und hält an", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
  try {
    const request = sourceCards.parseRequest({ source: "zellatmung.md", profile: "standard" });
    const entry: EvalCase = { id: "z", category: "standard", subject: "naturwissenschaft", split: "dev", request };
    const options = { definition: sourceCards, cases: [entry], repetitions: 1, split: "dev" as const, directory, apiKey: "test", concurrency: 1, retryDelayMs: 0, log: () => {} };
    await generate({ ...options, fetchImpl: (async () => { throw Object.assign(new Error("abgelaufen"), { name: "TimeoutError" }); }) as typeof fetch });
    const [answer] = readAnswers(directory);
    assert.deepEqual([answer.outcome, (answer.output as { failed: number }).failed], ["answer", 1]);
    const [graded] = evaluateAnswers(sourceCards, [entry], 1, [answer], new Map(judgeItemsFor(sourceCards, answerRef("z", 0), request, answer.output).map((item) => [item.ref, Object.fromEntries(item.criteria.map((criterion) => [criterion.id, true]))])));
    assert.deepEqual([graded.criteria.Q1, graded.main], [0, 0], "ein gescheiterter Abschnitt nimmt den Hauptwert");

    const second = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
    await assert.rejects(generate({ ...options, directory: second, fetchImpl: (async () => new Response("{}", { status: 402 })) as typeof fetch }), /Angehalten: provider_budget_exhausted/);
    assert.equal(readAnswers(second).length, 0);
    rmSync(second, { recursive: true, force: true });

    const third = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
    await generate({ ...options, directory: third, fetchImpl: (async () => toolCompletion("create_source_cards", { cards: [sourceCard("Wo läuft die Glykolyse ab?")], warnings: [] }, 0.002)) as typeof fetch });
    const [costed] = readAnswers(third);
    assert.deepEqual([costed.costUsd, (costed.transcript.request as unknown[]).length], [0.002, 1]);
    rmSync(third, { recursive: true, force: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Zusammenfassung: Länge, Darstellung, Stichwörter und Querbezüge automatisch; Abschnitte und Kernaussagen an den Richter", () => {
  const request = summary.parseRequest({ set: "netzwerk-karten-und-quelle", profile: "kurz-stichpunkte-wiederholen" }) as { route: { settings: { length: string; format: string; material: string } }; contradictions: string[] };
  assert.deepEqual([request.route.settings.length, request.route.settings.format, request.route.settings.material], ["short", "bullets", "cards-and-source"]);
  assert.equal(summary.parseRequest({ set: "fehlt", profile: "standard" }), null);
  const block = (heading: string, points: [string, string][], paragraphs: string[] = []) => ({ heading, paragraphs, points: points.map(([keyword, text]) => ({ keyword, text })), references: ["m1"] });
  const output = {
    sections: [{ ...block("Adressen", [["IPv4", "32 Bit"], ["DNS", "Namen zu Adressen"]]), subsections: [block("Transport", [["TCP", "verbindungsorientiert"]])] }],
    warnings: ["HTTPS-Port widersprüchlich: 8443 oder 443."], relations: [{ from: "TCP", to: "DNS" }],
  };
  const { Z2, Z3, Z4, Z5 } = summary.automatic;
  assert.deepEqual([Z2(request, output), Z3(request, output), Z4(request, output), Z5(request, output)], [true, true, true, true]);
  assert.equal(Z3(request, { ...output, sections: [{ ...block("Adressen", [], ["Nur Fließtext."]), subsections: [] }] }), false, "Stichpunkte verlangt");
  assert.equal(Z4(request, { ...output, sections: [{ ...block("A", [["DNS", "x"], ["dns", "y"]]), subsections: [] }] }), false);
  assert.equal(Z5(request, { ...output, relations: [{ from: "TCP", to: "Router" }] }), false);
  assert.equal(Z5(request, { ...output, relations: [{ from: "tcp", to: "dns" }] }), true, "wie die Mindmap ohne Groß-/Kleinschreibung");
  const seen: unknown[] = [];
  payloadBuilder(summary, { name: "k", transform: (payload, route) => { seen.push(route); return payload; } })(request);
  assert.equal(seen[0], request.route, "ein Kandidat bekommt die Anfrage an die Route");
  assert.equal(Z2(request, { ...output, sections: [{ ...block("Lang", [], [Array.from({ length: 400 }, () => "Wort").join(" ")]), subsections: [] }] }), false, "über dem 1,25-Fachen von 300 Wörtern");
  const items = judgeItemsFor(summary, answerRef("n", 0), request, output);
  assert.deepEqual(items.filter((entry) => entry.key.startsWith("abschnitt-")).map((entry) => entry.rendered.ausgabe.ueberschrift).sort(), ["Adressen", "Transport"]);
  const keypoints = items.find((entry) => entry.key === "kernaussagen")!;
  assert.ok(keypoints.criteria.some((criterion) => criterion.id === "Z9:netzwerk-karten-und-quelle-1"));
  assert.match(keypoints.rendered.ausgabe.warnungen, /8443/);
});

