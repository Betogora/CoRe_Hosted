import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { SPLITS, outputRoot, assignSplits, type DraftCase, type EvalCase, type Split, corpusCasesFile, handCasesFile, loadCases, readCases, readJson, sampleCorpus, seededRandom, writeJson } from "./cases.ts";
import { definitionFor, judgeItemsFor, type EvalDefinition } from "./definitions.ts";
import { generate, payloadBuilder, payloadFingerprint, readAnswers, readMeta, runDirectory, type Candidate } from "./generate.ts";
import { JUDGE_INSTRUCTIONS_FILE, answerRef, referenceRef, borderlineCases, buildJudgeTable, labelRef, readLabels, readVerdicts, type JudgeBlock, type JudgeCache, type JudgeItem, type JudgeKey, type VerdictReading } from "./judge.ts";
import { LEDGER_FILE, REQUEST_TYPES, bestRun, confirmationState, parseLedger, readLedger, resultsFile, type EvalLedger, type EvalRun } from "./ledger.ts";
import { agreement, compare, decide, evaluateAnswers, ledgerRun, renderBorderline, renderReport, summarize, type AnswerResult } from "./score.ts";

const USAGE = `npm run ai-eval -- <befehl> <anfragetyp> [optionen]

  cases <typ> [--corpus <n>] [--seed <n>]       Aufteilung festschreiben, optional n Korpusfälle ziehen
  generate <typ> --run <name> [--split dev|train|holdout|all] [--repetitions <n>] [--budget <usd>] [--concurrency <n>] [--candidate <name>] [--dry]
  table <typ> --run <name>                      Richterblöcke des Laufs schreiben
  more <typ> --run <name> [--budget <usd>]         kippende Fälle für Kandidat und Bestand zweimal nachmessen
  score <typ> --run <name> --judge <modell> [--baseline] [--simplify] [--target <kriterien,kategorien>] [--confirm] [--change "<satz>"] [--reason "<zwei sätze>"] [--record]
  calibration-table <typ>                       Richterblöcke aus den Handurteilen schreiben
  calibration-score <typ> --judge <modell> [--record]

Anfragetypen: ${REQUEST_TYPES.map((type) => type.id).join(", ")}`;

const SEED = 20261111;
const MORE_REPETITIONS = 2;
const PROVISIONAL_LIMIT = 3;
const CONFIRM_REPETITIONS = 3;

function positive(value: string, option: string, integer = false) {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new Error(`--${option} ist eine ${integer ? "ganze " : ""}Zahl über 0, nicht „${value}“.`);
  return number;
}
const saveLedger = (ledger: EvalLedger) => writeJson(LEDGER_FILE, parseLedger(ledger));
const cacheFile = (id: string) => `${outputRoot()}/${id}/judge-cache.json`;
const readCache = (id: string) => (existsSync(cacheFile(id)) ? readJson(cacheFile(id)) : {}) as JudgeCache;
const blockFile = (directory: string, index: number) => path.join(directory, "judge", `block-${String(index + 1).padStart(3, "0")}.json`);
const verdictFile = (directory: string, index: number) => blockFile(directory, index).replace(/\.json$/, ".verdicts.json");

async function loadCandidate(id: string, name: string): Promise<Candidate> {
  const file = path.resolve(outputRoot(), id, "candidates", `${name}.ts`);
  if (!existsSync(file)) throw new Error(`Kandidat ${file} fehlt.`);
  const transform = (await import(pathToFileURL(file).href) as { default?: unknown }).default;
  if (typeof transform !== "function") throw new Error(`${file} exportiert keine Funktion (payload, request) => payload als default.`);
  return { name, transform: transform as Candidate["transform"] };
}

/**
 * Blöcke und Schlüssel liegen getrennt, damit der Richter nur Eingabe und Ausgabe sieht. Vorhandene Urteile werden nur
 * ersetzt, wenn „score“ sie schon in den Urteilscache übernommen hat (Nachmessung).
 */
function writeTable(directory: string, blocks: readonly JudgeBlock[], key: JudgeKey, cache: JudgeCache = {}) {
  const judgeDirectory = path.join(directory, "judge");
  const keyFile = path.join(directory, "judge-key.json");
  const judgedBefore = existsSync(keyFile) ? Object.values((readJson(keyFile) as JudgeKey).hashes) : [];
  if (existsSync(judgeDirectory) && readdirSync(judgeDirectory).some((name) => name.endsWith(".verdicts.json"))
    && !(judgedBefore.length && judgedBefore.every((entryHash) => cache[entryHash]))) {
    throw new Error(`In ${judgeDirectory} liegen schon Urteile. Erst „score“ ausführen; neue Blöcke nur nach Löschen dieses Ordners.`);
  }
  rmSync(judgeDirectory, { recursive: true, force: true });
  blocks.forEach((block, index) => writeJson(blockFile(directory, index), block));
  writeJson(path.join(directory, "judge-key.json"), key);
  const cached = Object.keys(key.cached).length;
  if (!blocks.length) { console.log(`Alle ${cached} Antworten haben ein Urteil im Cache; kein Richter nötig.`); return; }
  console.log(`${blocks.reduce((sum, block) => sum + block.entries.length, 0)} Einträge in ${blocks.length} Blöcken, davon ${Object.keys(key.duplicates).length} Doppel; ${cached} Antworten aus dem Cache. Je Block einen Richter starten:`);
  blocks.forEach((_, index) => console.log(`  Bewerte \`${blockFile(directory, index).replace(/\\/g, "/")}\`.`));
}

function verdictsIn(directory: string, cache: JudgeCache): { blocks: JudgeBlock[]; key: JudgeKey; reading: VerdictReading } {
  const keyFile = path.join(directory, "judge-key.json");
  if (!existsSync(keyFile)) throw new Error(`${keyFile} fehlt. Zuerst „table“ ausführen und die Richter bewerten lassen.`);
  const key = readJson(keyFile) as JudgeKey;
  const count = existsSync(path.join(directory, "judge")) ? readdirSync(path.join(directory, "judge")).filter((name) => /^block-\d{3}\.json$/.test(name)).length : 0;
  const blocks = Array.from({ length: count }, (_, index) => readJson(blockFile(directory, index)) as JudgeBlock);
  const files = blocks.map((_, index) => existsSync(verdictFile(directory, index)) ? readJson(verdictFile(directory, index)) : null);
  return { blocks, key, reading: readVerdicts(blocks, files, key, cache) };
}

function requireJudge(model: string | undefined) {
  if (!model) throw new Error("--judge <modell> fehlt: das Modell, das die Blöcke bewertet hat, etwa claude-opus-5-5.");
  return model;
}

/** Mit `confirm` misst die Sammelprüfung gegen den letzten bestätigten Stand, sonst jeder Lauf gegen den Bestand. */
function referenceFor(ledger: EvalLedger, id: EvalRun["requestType"], confirm: boolean) {
  const state = confirmationState(ledger, id);
  if (!confirm) return bestRun(ledger, id);
  if (!state.pending) throw new Error("Es gibt keine vorläufigen Schritte; eine Sammelprüfung ist nicht nötig.");
  return state.confirmed;
}

const REFERENCE_META = "reference.json";

function checkCodeBuildsRun(definition: EvalDefinition, cases: readonly EvalCase[], fingerprint: string, candidate: string | null) {
  if (payloadFingerprint(payloadBuilder(definition), cases) !== fingerprint) {
    throw new Error(`Der Code baut einen anderen Payload als der gemessene Lauf${candidate ? ` mit Kandidat ${candidate}` : ""}. Erst den Kandidaten in die Route übernehmen und die Promptversion erhöhen, dann erneut eintragen.`);
  }
}

async function main(argv: string[]) {
  const { values, positionals: [command, id] } = parseArgs({ args: argv, allowPositionals: true, options: {
    run: { type: "string" }, split: { type: "string", default: "dev" }, repetitions: { type: "string", default: "2" }, dry: { type: "boolean", default: false },
    budget: { type: "string", default: "1" }, concurrency: { type: "string", default: "4" }, candidate: { type: "string" },
    corpus: { type: "string" }, seed: { type: "string", default: String(SEED) }, baseline: { type: "boolean", default: false }, simplify: { type: "boolean", default: false },
    change: { type: "string" }, record: { type: "boolean", default: false }, judge: { type: "string" },
    target: { type: "string" }, reason: { type: "string" }, confirm: { type: "boolean", default: false },
  } });
  if (!command || !id) throw new Error(USAGE);
  const definition = definitionFor(id);
  const type = REQUEST_TYPES.find((candidate) => candidate.id === definition.id)!;
  const random = seededRandom(Number(values.seed));
  const instructions = () => readFileSync(JUDGE_INSTRUCTIONS_FILE, "utf8").replace(/\r\n/g, "\n");
  const run = () => {
    if (!values.run || !/^[a-z0-9.-]+$/.test(values.run)) throw new Error("--run <name> fehlt oder enthält andere Zeichen als a–z, 0–9, Punkt und Bindestrich.");
    return values.run;
  };

  if (command === "cases") {
    const hand = readCases(definition, handCasesFile(id));
    const known = readCases(definition, corpusCasesFile(id));
    const sampled = values.corpus ? await sampleCorpus(definition, Number(values.corpus), Number(values.seed)) : [];
    const corpus = [...known, ...sampled.filter((entry) => !known.some((other) => other.id === entry.id))];
    const assigned = assignSplits([...hand, ...corpus], random);
    // The files keep the request as written; readCases returns it parsed, which may be much larger.
    const raw = new Map([handCasesFile(id), corpusCasesFile(id)].flatMap((file) => existsSync(file) ? (readJson(file) as { cases: DraftCase[] }).cases.map((entry) => [entry.id, entry.request] as const) : []));
    const written = assigned.map((entry) => ({ ...entry, request: raw.get(entry.id) ?? entry.request }));
    if (hand.length) writeJson(handCasesFile(id), { cases: written.slice(0, hand.length) });
    if (corpus.length) writeJson(corpusCasesFile(id), { cases: written.slice(hand.length) });
    const count = (members: readonly EvalCase[]) => SPLITS.map((split) => `${split} ${members.filter((entry) => entry.split === split).length}`).join(", ");
    console.log(`${hand.length} Prüfkarten, ${corpus.length} Korpusfälle; ${count(assigned)}.`);
    for (const category of [...new Set(assigned.map((entry) => entry.category))].sort()) console.log(`  ${category}: ${count(assigned.filter((entry) => entry.category === category))}`);
    return;
  }

  if (command === "generate") {
    if (![...SPLITS, "all"].includes(values.split)) throw new Error(`--split ist ${SPLITS.join(", ")} oder all.`);
    const split = values.split as Split | "all";
    const apiKey = values.dry ? "dry" : process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt (Benutzer-Umgebungsvariable oder .env.local). Der Eval nutzt den lokalen Schlüssel mit seinem Limit.");
    const cases = loadCases(definition).filter((entry) => split === "all" || entry.split === split);
    const candidate = values.candidate ? await loadCandidate(id, values.candidate) : null;
    const open = await generate({ definition, candidate, cases, repetitions: positive(values.repetitions, "repetitions", true), split, directory: runDirectory(id, run()), apiKey, dry: values.dry, budgetUsd: positive(values.budget, "budget"), concurrency: positive(values.concurrency, "concurrency", true) });
    if (open) throw new Error(`${open} Antworten fehlen noch. Denselben Befehl erneut ausführen.`);
    return;
  }

  if (command === "table") {
    const directory = runDirectory(id, run());
    const cases = new Map(loadCases(definition).map((entry) => [entry.id, entry]));
    const items = (file: "answers.jsonl" | "reference.jsonl", refFor: typeof answerRef): JudgeItem[] => readAnswers(directory, file).filter((row) => row.outcome === "answer" && !cases.get(row.caseId)!.refuse).flatMap((row) => judgeItemsFor(definition, refFor(row.caseId, row.repetition), cases.get(row.caseId)!.request, row.output));
    const controls: JudgeItem[] = readLabels(definition).filter((label) => label.control).flatMap((label) => judgeItemsFor(definition, labelRef(label.id), label.request, label.output));
    const cache = readCache(id);
    const { blocks, key } = buildJudgeTable(definition, [...items("answers.jsonl", answerRef), ...items("reference.jsonl", referenceRef), ...controls], random, { instructions: instructions(), requests: [...cases.values()].map((entry) => entry.request), cache });
    writeTable(directory, blocks, key, cache);
    return;
  }

  if (command === "score") {
    const name = run();
    const directory = runDirectory(id, name);
    const meta = readMeta(directory);
    const cases = loadCases(definition).filter((entry) => meta.split === "all" || entry.split === meta.split);
    const cache = readCache(id);
    const judged = meta.dry ? null : verdictsIn(directory, cache);
    const judgeModel = meta.dry ? "nachgebildet" : requireJudge(values.judge);
    const caseById = new Map(cases.map((entry) => [entry.id, entry]));
    const verdicts = judged?.reading.verdicts ?? new Map((["answers.jsonl", "reference.jsonl"] as const).flatMap((file) => readAnswers(directory, file).filter((row) => row.outcome === "answer" && caseById.has(row.caseId))
      .flatMap((row) => judgeItemsFor(definition, (file === "answers.jsonl" ? answerRef : referenceRef)(row.caseId, row.repetition), caseById.get(row.caseId)!.request, row.output))
      .map((item) => [item.ref, Object.fromEntries(item.criteria.map((criterion) => [criterion.id, true]))] as const)));
    const unsure = judged?.reading.unsure ?? new Set<string>();
    const results = evaluateAnswers(definition, cases, meta.repetitions, readAnswers(directory), verdicts, { unsure });
    writeJson(path.join(directory, "results.json"), results);
    const summary = summarize(results, random, type.critical);
    const controlLabels = readLabels(definition).filter((label) => label.control);
    const controls = judged && controlLabels.length ? agreement(type, controlLabels, judged.reading.verdicts) : null;
    if (judged && !controls?.falsePasses) writeJson(cacheFile(id), { ...cache, ...judged.reading.fresh });
    const judge: EvalRun["judge"] = { model: judgeModel, fingerprint: judged?.key.judge ?? "0000000000000000", entries: judged?.reading.judged ?? 0, cached: judged?.reading.cached ?? 0, noise: judged?.reading.noise ?? {} };

    const ledger = readLedger();
    const holdout = meta.split === "holdout";
    const decides = meta.split === "dev";
    const confirm = values.confirm;
    const state = confirmationState(ledger, type.id);
    const target = values.target ? values.target.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
    if (confirm && (meta.candidate || meta.repetitions < CONFIRM_REPETITIONS)) throw new Error(`Eine Sammelprüfung misst den Code ohne Kandidat mit mindestens ${CONFIRM_REPETITIONS} Wiederholungen.`);
    if (confirm && target.length) throw new Error("Eine Sammelprüfung entscheidet über den ganzen Teil, ohne --target.");
    const reference = values.baseline || !decides ? null : referenceFor(ledger, type.id, confirm);
    if (decides && !values.baseline && !reference) throw new Error("Im Ledger steht noch kein Bestand. Den ersten Lauf mit --baseline auswerten.");
    if (reference && reference.judge.fingerprint !== judge.fingerprint && !meta.dry) throw new Error(`Der Bestand wurde mit einem anderen Richterauftrag oder Bogen bewertet (${reference.judge.fingerprint}, jetzt ${judge.fingerprint}). Die Reihe mit --baseline neu beginnen.`);
    let comparison = null;
    let remeasuredCost = 0;
    let decision: EvalRun["decision"] | null = holdout ? "holdout" : decides ? "baseline" : null;
    let failed: string[] = [];
    if (reference) {
      const file = resultsFile(id, reference.run);
      if (!existsSync(file)) throw new Error(`${file} fehlt. Ohne die Ergebnisse des Bestands gibt es keinen gepaarten Vergleich.`);
      const remeasured = readAnswers(directory, "reference.jsonl");
      if (remeasured.length && (confirm || (readJson(path.join(directory, REFERENCE_META)) as { run: string }).run !== reference.run)) throw new Error(`Die Nachmessung in ${directory} gilt nicht dem Bestand ${reference.run}.`);
      const extra = (rows: readonly { caseId: string; repetition: number }[], from: number) => rows.filter((entry) => entry.repetition >= from).map((entry) => entry.caseId).sort().join(",");
      if (extra(readAnswers(directory), meta.repetitions) !== extra(remeasured, 0)) throw new Error("Die Nachmessung ist unvollständig: Kandidat und Bestand haben nicht dieselben Zusatzantworten. „more“ erneut ausführen.");
      remeasuredCost = remeasured.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
      const before = [...readJson(file) as AnswerResult[], ...evaluateAnswers(definition, cases.filter((entry) => remeasured.some((row) => row.caseId === entry.id)), 0, remeasured, verdicts, { refFor: referenceRef, unsure })];
      comparison = compare(results, before, random, target);
      ({ decision, failed } = decide(type, summary, summarize(before, random, type.critical), comparison, values.simplify));
      if (decision === "accepted" && !confirm && state.pending) decision = "provisional";
    }
    const report = renderReport({ type, run: name, meta, summary, comparison, decision, failed, controls, judge: judged ? judge : null });
    writeFileSync(path.join(directory, "report.md"), report, "utf8");
    console.log(report);
    if (judged) {
      const file = path.join(directory, "grenzfaelle.md");
      writeFileSync(file, renderBorderline(type, name, borderlineCases(judged.blocks, judged.reading)), "utf8");
      console.log(`Grenzfälle für den Nutzer: ${file.replace(/\\/g, "/")}`);
    }
    if (!values.record) return;
    if (meta.dry) throw new Error("Ein Trockenlauf kommt nicht ins Ledger.");
    if (!decision) throw new Error("Ins Ledger kommen nur Läufe auf dem Entscheidungsteil (dev) oder dem Rückhalt (holdout).");
    if (controls?.falsePasses) throw new Error("Der Richter hat einen Kontrolleintrag bei einem kritischen Kriterium fälschlich bestehen lassen. Der Lauf kommt nicht ins Ledger.");
    if (!values.change && !confirm && decision !== "baseline" && decision !== "holdout") throw new Error("--change \"<die eine Änderung in einem Satz>\" fehlt.");
    if (!values.reason && !confirm && (decision === "accepted" || decision === "provisional")) throw new Error("--reason \"<zwei Sätze aus den geänderten Trainingsantworten: Fehlerbild behoben, nichts Neues kaputt>\" fehlt.");
    if (decision === "provisional" && state.pending >= PROVISIONAL_LIMIT) throw new Error(`Schon ${state.pending} vorläufige Schritte offen. Erst die Sammelprüfung (--confirm) auswerten.`);
    if (decision !== "rejected") checkCodeBuildsRun(definition, cases, meta.fingerprint, meta.candidate);
    if (existsSync(resultsFile(id, name))) throw new Error(`${resultsFile(id, name)} gibt es schon. Ein Lauf kommt nur einmal ins Ledger.`);
    const change = values.change ?? (confirm ? `Sammelprüfung von ${state.pending} vorläufigen Schritten` : decision === "holdout" ? "Rückhalt" : "Baseline");
    const next = parseLedger({ ...ledger, runs: [...ledger.runs, ledgerRun({ type, run: name, meta, summary: { ...summary, costTotalUsd: summary.costTotalUsd + remeasuredCost }, decision, change, comparison, judge, promptVersion: decision === "rejected" && !confirm ? meta.promptVersion : type.promptVersion, reason: values.reason, confirmation: confirm })] });
    writeJson(resultsFile(id, name), results);
    saveLedger(next);
    console.log(`Im Ledger eingetragen: ${decision}. Danach „npm run docs:build“.`);
    if (confirm && decision === "rejected") console.log(`Bestand ist wieder ${state.confirmed?.run}. Die vorläufigen Schritte im Code zurücknehmen; die mit dem stärksten Beleg als neue Kandidaten messen.`);
    return;
  }

  if (command === "more") {
    const name = run();
    const directory = runDirectory(id, name);
    const meta = readMeta(directory);
    if (meta.split !== "dev") throw new Error("Nachgemessen wird nur auf dem Entscheidungsteil.");
    const resultsPath = path.join(directory, "results.json");
    if (!existsSync(resultsPath)) throw new Error(`${resultsPath} fehlt. Erst „table“, Richter und „score“ ausführen.`);
    if (definition.items) throw new Error("Nachgemessen wird nur bei Typen mit einem Richtereintrag je Antwort; hier mehr Wiederholungen beim Erzeugen wählen.");
    if (meta.repetitions >= CONFIRM_REPETITIONS && !meta.candidate) throw new Error("Eine Sammelprüfung wird nicht nachgemessen; sie hat schon mehr Wiederholungen.");
    const reference = bestRun(readLedger(), type.id);
    if (!reference) throw new Error("Im Ledger steht noch kein Bestand.");
    const cases = loadCases(definition).filter((entry) => entry.split === "dev");
    const candidate = meta.candidate ? await loadCandidate(id, meta.candidate) : null;
    if (payloadFingerprint(payloadBuilder(definition, candidate), cases) !== meta.fingerprint) throw new Error(`Der Kandidat baut nicht mehr den Payload von ${name}.`);
    if (payloadFingerprint(payloadBuilder(definition), cases) !== reference.fingerprint) throw new Error(`Der Code baut nicht den Payload des Bestands ${reference.run}; ihn kann nur der Code von damals nachmessen.`);
    const own = readJson(resultsPath) as AnswerResult[];
    const before = readJson(resultsFile(id, reference.run)) as AnswerResult[];
    const mains = (rows: readonly AnswerResult[], caseId: string) => rows.flatMap((row) => row.caseId === caseId && row.main !== null ? [row.main] : []);
    const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const wobbly = cases.filter((entry) => {
      const mine = mains(own, entry.id), theirs = mains(before, entry.id);
      return new Set(mine).size > 1 || new Set(theirs).size > 1 || average(mine) !== average(theirs);
    });
    if (!wobbly.length) { console.log("Kein Fall kippt; keine Nachmessung nötig."); return; }
    if (existsSync(path.join(directory, REFERENCE_META)) && (readJson(path.join(directory, REFERENCE_META)) as { run: string }).run !== reference.run) throw new Error(`${name} wurde schon gegen einen anderen Bestand nachgemessen.`);
    writeJson(path.join(directory, REFERENCE_META), { run: reference.run });
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey && !meta.dry) throw new Error("OPENROUTER_API_KEY fehlt (Benutzer-Umgebungsvariable oder .env.local).");
    const common = { definition, cases: wobbly, split: meta.split, directory, extend: true, apiKey: apiKey ?? "dry", dry: meta.dry, budgetUsd: positive(values.budget, "budget"), concurrency: positive(values.concurrency, "concurrency", true) };
    console.log(`${wobbly.length} von ${cases.length} Fällen kippen; je ${MORE_REPETITIONS} weitere Antworten für Kandidat und Bestand ${reference.run}.`);
    const open = await generate({ ...common, candidate, repetitions: meta.repetitions + MORE_REPETITIONS })
      + await generate({ ...common, candidate: null, repetitions: MORE_REPETITIONS, file: "reference.jsonl" });
    if (open) throw new Error(`${open} Antworten fehlen noch. Denselben Befehl erneut ausführen.`);
    console.log("Danach „table“, Richter und „score“ wie gewohnt.");
    return;
  }

  const calibration = `${outputRoot()}/${id}/calibration`;
  if (command === "calibration-table") {
    const labels = readLabels(definition);
    if (!labels.length) throw new Error(`Keine Handurteile für ${id}.`);
    const { blocks, key } = buildJudgeTable(definition, labels.flatMap((label) => judgeItemsFor(definition, labelRef(label.id), label.request, label.output)), random, { instructions: instructions(), requests: labels.map((label) => label.request) });
    writeTable(calibration, blocks, key);
    return;
  }

  if (command === "calibration-score") {
    const judgeModel = requireJudge(values.judge);
    const result = agreement(type, readLabels(definition), verdictsIn(calibration, {}).reading.verdicts);
    console.log(`${result.entries} Einträge; kritische Kriterien: ${(result.agreement * 100).toFixed(1)} % Übereinstimmung, ${result.falsePasses} fälschlich bestanden.`);
    for (const criterion of result.criteria) console.log(`  ${criterion.id}: ${(criterion.agreement * 100).toFixed(1)} % bei ${criterion.entries} Einträgen, Kappa ${criterion.kappa.toFixed(2)}, fälschlich bestanden ${criterion.falsePasses}, fälschlich durchgefallen ${criterion.falseFails}`);
    for (const line of result.disagreements) console.log(`  Abweichung: ${line}`);
    if (!values.record) return;
    const ledger = readLedger();
    saveLedger({ ...ledger, calibrations: [...ledger.calibrations, { requestType: type.id, date: new Date().toISOString().slice(0, 10), judge: judgeModel, entries: result.entries, agreement: result.agreement, falsePasses: result.falsePasses }] });
    console.log("Kalibrierung im Ledger eingetragen. Danach „npm run docs:build“.");
    return;
  }

  throw new Error(USAGE);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
main(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
