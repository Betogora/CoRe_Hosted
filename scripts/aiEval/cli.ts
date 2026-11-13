import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { OUTPUT_ROOT, assignSplits, corpusCasesFile, handCasesFile, loadCases, readCases, readJson, sampleCorpus, seededRandom, writeJson } from "./cases.ts";
import { definitionFor } from "./definitions.ts";
import { generate, readAnswers, readMeta, runDirectory } from "./generate.ts";
import { answerRef, buildJudgeTable, labelRef, readLabels, readVerdicts, type JudgeItem, type JudgeTable, type Verdicts } from "./judge.ts";
import { LEDGER_FILE, REQUEST_TYPES, bestRun, latestCalibration, parseLedger, readLedger, type EvalLedger } from "./ledger.ts";
import { agreement, compare, decide, evaluateAnswers, ledgerRun, renderReport, summarize, type AnswerResult } from "./score.ts";

const USAGE = `npm run ai-eval -- <befehl> <anfragetyp> [optionen]

  cases <typ> [--corpus <n>] [--seed <n>]       Aufteilung festschreiben, optional n Korpusfälle ziehen
  generate <typ> --run <name> [--split test|train|all] [--repetitions <n>] [--dry]
  table <typ> --run <name>                      Richtertabelle des Laufs schreiben
  score <typ> --run <name> [--baseline] [--change "<satz>"] [--record]
  calibration-table <typ>                       Richtertabelle aus den Handurteilen schreiben
  calibration-score <typ> [--judge <modell>] [--record]

Anfragetypen: ${REQUEST_TYPES.map((type) => type.id).join(", ")}`;

const SEED = 20261111;
const saveLedger = (ledger: EvalLedger) => writeJson(LEDGER_FILE, parseLedger(ledger));

/** Tabelle und Schlüssel liegen getrennt, damit der Richter nur Eingabe und Ausgabe sieht. */
function writeTable(directory: string, table: JudgeTable, key: Record<string, string[]>) {
  writeJson(path.join(directory, "judge-table.json"), table);
  writeJson(path.join(directory, "judge-key.json"), key);
  console.log(`${table.entries.length} Einträge in ${directory}/judge-table.json. Der Richter schreibt ${directory}/judge-verdicts.json.`);
}

function verdictsIn(directory: string): Verdicts | null {
  const file = path.join(directory, "judge-verdicts.json");
  if (!existsSync(file)) return null;
  return readVerdicts(readJson(file), readJson(path.join(directory, "judge-table.json")) as JudgeTable, readJson(path.join(directory, "judge-key.json")) as Record<string, string[]>);
}

async function main(argv: string[]) {
  const { values, positionals: [command, id] } = parseArgs({ args: argv, allowPositionals: true, options: {
    run: { type: "string" }, split: { type: "string", default: "test" }, repetitions: { type: "string", default: "3" }, dry: { type: "boolean", default: false },
    corpus: { type: "string" }, seed: { type: "string", default: String(SEED) }, baseline: { type: "boolean", default: false }, change: { type: "string" },
    record: { type: "boolean", default: false }, judge: { type: "string", default: "claude-opus-5-5" },
  } });
  if (!command || !id) throw new Error(USAGE);
  const definition = definitionFor(id);
  const type = REQUEST_TYPES.find((candidate) => candidate.id === definition.id)!;
  const random = seededRandom(Number(values.seed));
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
    if (hand.length) writeJson(handCasesFile(id), { cases: assigned.slice(0, hand.length) });
    if (corpus.length) writeJson(corpusCasesFile(id), { cases: assigned.slice(hand.length) });
    const count = (split: string) => assigned.filter((entry) => entry.split === split).length;
    console.log(`${hand.length} Prüfkarten, ${corpus.length} Korpusfälle; Training ${count("train")}, Test ${count("test")}.`);
    for (const category of [...new Set(assigned.map((entry) => entry.category))].sort()) console.log(`  ${category}: ${assigned.filter((entry) => entry.category === category).length}`);
    return;
  }

  if (command === "generate") {
    if (!["test", "train", "all"].includes(values.split)) throw new Error("--split ist test, train oder all.");
    const split = values.split as "test" | "train" | "all";
    const apiKey = values.dry ? "dry" : process.env.OPENROUTER_EVAL_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_EVAL_API_KEY fehlt (Umgebungsvariable oder .env.local). Der Eval nutzt einen eigenen Schlüssel mit eigenem Limit.");
    const cases = loadCases(definition).filter((entry) => split === "all" || entry.split === split);
    const open = await generate({ definition, cases, repetitions: Number(values.repetitions), split, directory: runDirectory(id, run()), apiKey, dry: values.dry });
    if (open) throw new Error(`${open} Antworten fehlen noch. Denselben Befehl erneut ausführen.`);
    return;
  }

  if (command === "table") {
    const directory = runDirectory(id, run());
    const cases = new Map(loadCases(definition).map((entry) => [entry.id, entry]));
    const answers: JudgeItem[] = readAnswers(directory).filter((row) => row.ok).map((row) => ({ ref: answerRef(row.caseId, row.repetition), request: cases.get(row.caseId)!.request, output: row.output }));
    const controls: JudgeItem[] = readLabels(definition).filter((label) => label.control).map((label) => ({ ref: labelRef(label.id), request: label.request, output: label.output }));
    const { table, key } = buildJudgeTable(definition, [...answers, ...controls], random);
    writeTable(directory, table, key);
    return;
  }

  if (command === "score") {
    const name = run();
    const directory = runDirectory(id, name);
    const meta = readMeta(directory);
    const cases = loadCases(definition).filter((entry) => meta.split === "all" || entry.split === meta.split);
    const judged = verdictsIn(directory);
    if (!judged && !meta.dry) throw new Error(`${directory}/judge-verdicts.json fehlt. Zuerst „table“ ausführen und den Richter bewerten lassen.`);
    // Trockenlauf ohne Richter: Jedes Richterkriterium gilt als bestanden.
    const verdicts: Verdicts = judged ?? new Map(cases.flatMap((entry) => Array.from({ length: meta.repetitions }, (_, repetition) => [answerRef(entry.id, repetition), Object.fromEntries(definition.judged(entry.request).map((criterion) => [criterion.id, true]))] as const)));
    const results = evaluateAnswers(definition, cases, meta.repetitions, readAnswers(directory), verdicts);
    writeJson(path.join(directory, "results.json"), results);
    const summary = summarize(results, random);
    const controlLabels = readLabels(definition).filter((label) => label.control);
    const controls = judged && controlLabels.length ? agreement(type, controlLabels, judged) : null;
    const ledger = readLedger();
    const reference = values.baseline ? null : bestRun(ledger, type.id);
    if (!values.baseline && !reference) throw new Error("Im Ledger steht noch kein Bestand. Den ersten Lauf mit --baseline auswerten.");
    let comparison = null;
    let decision: "baseline" | "accepted" | "rejected" = "baseline";
    if (reference) {
      const file = path.join(runDirectory(id, reference.run), "results.json");
      if (!existsSync(file)) throw new Error(`Die Rohdaten des Bestands fehlen lokal: ${file}. Ohne sie gibt es keinen gepaarten Vergleich.`);
      const before = readJson(file) as AnswerResult[];
      comparison = compare(results, before, random);
      decision = decide(type, summary, summarize(before, random), comparison);
    }
    const report = renderReport({ type, run: name, meta, summary, comparison, decision, controls });
    writeFileSync(path.join(directory, "report.md"), report, "utf8");
    console.log(report);
    if (!values.record) return;
    if (meta.dry) throw new Error("Ein Trockenlauf kommt nicht ins Ledger.");
    if (meta.split !== "test") throw new Error("Ins Ledger kommen nur Läufe auf dem Testteil.");
    if (!latestCalibration(ledger, type.id)) throw new Error("Der Richter ist für diesen Anfragetyp noch nicht kalibriert (calibration-score --record).");
    if (controls?.falsePasses) throw new Error("Der Richter hat einen Kontrolleintrag bei einem kritischen Kriterium fälschlich bestehen lassen. Der Lauf kommt nicht ins Ledger.");
    if (!values.change && decision !== "baseline") throw new Error("--change \"<die eine Änderung in einem Satz>\" fehlt.");
    saveLedger({ ...ledger, runs: [...ledger.runs, ledgerRun(type, name, meta, summary, decision, values.change ?? "Baseline", comparison)] });
    console.log(`Im Ledger eingetragen: ${decision}. Danach „npm run docs:build“.`);
    return;
  }

  const calibration = `${OUTPUT_ROOT}/${id}/calibration`;
  if (command === "calibration-table") {
    const labels = readLabels(definition);
    if (!labels.length) throw new Error(`Keine Handurteile für ${id}.`);
    const { table, key } = buildJudgeTable(definition, labels.map((label) => ({ ref: labelRef(label.id), request: label.request, output: label.output })), random);
    writeTable(calibration, table, key);
    return;
  }

  if (command === "calibration-score") {
    const verdicts = verdictsIn(calibration);
    if (!verdicts) throw new Error(`${calibration}/judge-verdicts.json fehlt.`);
    const result = agreement(type, readLabels(definition), verdicts);
    console.log(`${result.entries} Einträge; kritische Kriterien: ${(result.agreement * 100).toFixed(1)} % Übereinstimmung, ${result.falsePasses} fälschlich bestanden.`);
    for (const criterion of result.criteria) console.log(`  ${criterion.id}: ${(criterion.agreement * 100).toFixed(1)} % bei ${criterion.entries} Einträgen, Kappa ${criterion.kappa.toFixed(2)}, fälschlich bestanden ${criterion.falsePasses}, fälschlich durchgefallen ${criterion.falseFails}`);
    for (const line of result.disagreements) console.log(`  Abweichung: ${line}`);
    if (!values.record) return;
    const ledger = readLedger();
    saveLedger({ ...ledger, calibrations: [...ledger.calibrations, { requestType: type.id, date: new Date().toISOString().slice(0, 10), judge: values.judge, entries: result.entries, agreement: result.agreement, falsePasses: result.falsePasses }] });
    console.log("Kalibrierung im Ledger eingetragen. Danach „npm run docs:build“.");
    return;
  }

  throw new Error(USAGE);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
main(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
