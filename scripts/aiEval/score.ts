import type { EvalCase } from "./cases.ts";
import type { EvalDefinition } from "./definitions.ts";
import type { AnswerRow, Outcome, RunMeta } from "./generate.ts";
import { answerRef, labelRef, type Label, type Verdicts, type borderlineCases } from "./judge.ts";
import type { EvalRun, RequestType } from "./ledger.ts";

/**
 * Ein Kriterium fehlt in `criteria`, wenn es für die Anfrage nicht gilt, die Antwort den Vertrag nicht besteht oder eine
 * der beiden Seiten (Fall oder Modell) eine Ablehnung ist.
 */
export type AnswerResult = { caseId: string; repetition: number; category: string; trap: boolean; outcome: Outcome; criteria: Record<string, boolean>; main: boolean; costUsd: number | null; latencyMs: number; totalTokens: number | null; model: string | null };

const RESAMPLES = 2000;
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const quantile = (values: readonly number[], share: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * share) - 1))] ?? 0;
const round = (value: number) => Math.round(value * 10000) / 10000;

export function evaluateAnswers(definition: EvalDefinition, cases: readonly EvalCase[], repetitions: number, rows: readonly AnswerRow[], verdicts: Verdicts): AnswerResult[] {
  const byKey = new Map(rows.map((row) => [answerRef(row.caseId, row.repetition), row]));
  return cases.flatMap((entry) => Array.from({ length: repetitions }, (_, repetition) => {
    const ref = answerRef(entry.id, repetition);
    const row = byKey.get(ref);
    if (!row) throw new Error(`Antwort ${entry.id}#${repetition} fehlt. „generate“ mit demselben Laufnamen fortsetzen.`);
    const valid = row.outcome === "answer" || row.outcome === "refused";
    const criteria: Record<string, boolean> = { [definition.contract]: valid };
    if (valid && definition.refusal) criteria[definition.refusal.criterion] = (row.outcome === "refused") === Boolean(entry.refuse);
    if (row.outcome === "answer" && !entry.refuse) {
      for (const [id, check] of Object.entries(definition.automatic)) criteria[id] = (criteria[id] ?? true) && check(entry.request, row.output);
      const judged = verdicts.get(ref);
      for (const { id } of definition.judged(entry.request)) {
        if (judged?.[id] === undefined) throw new Error(`Richterurteil ${id} für ${entry.id}#${repetition} fehlt.`);
        criteria[id] = (criteria[id] ?? true) && judged[id];
      }
    }
    return { caseId: entry.id, repetition, category: entry.category, trap: Boolean(entry.trap), outcome: row.outcome, criteria, main: definition.main.every((id) => criteria[id] ?? true), costUsd: row.costUsd, latencyMs: row.latencyMs, totalTokens: row.totalTokens, model: row.model };
  }));
}

function caseScores(results: readonly AnswerResult[]) {
  const scores = new Map<string, number[]>();
  for (const result of results) scores.set(result.caseId, [...(scores.get(result.caseId) ?? []), result.main ? 1 : 0]);
  return new Map([...scores].map(([caseId, values]) => [caseId, mean(values)]));
}

/** Bootstrap über Fälle: Wiederholungen eines Falls bleiben zusammen. */
function bootstrap(values: readonly number[], random: () => number) {
  const means = Array.from({ length: RESAMPLES }, () => mean(Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)])));
  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}

function criteriaShares(results: readonly AnswerResult[]) {
  const ids = [...new Set(results.flatMap((result) => Object.keys(result.criteria)))].sort();
  return Object.fromEntries(ids.map((id) => [id, round(mean(results.filter((result) => id in result.criteria).map((result) => result.criteria[id] ? 1 : 0)))]));
}

export type Summary = ReturnType<typeof summarize>;

/** Eine Falle zählt als Fehler, wenn eines der kritischen Kriterien `critical` durchfällt. */
export function summarize(results: readonly AnswerResult[], random: () => number, critical: readonly string[] = []) {
  const traps = results.filter((result) => result.trap);
  const scores = [...caseScores(results).values()];
  const costs = results.flatMap((result) => result.costUsd === null ? [] : [result.costUsd]);
  const latencies = results.map((result) => result.latencyMs);
  const interval = bootstrap(scores, random);
  return {
    cases: scores.length,
    repetitions: results.length / scores.length,
    main: round(mean(scores)),
    low: round(interval.low),
    high: round(interval.high),
    criteria: criteriaShares(results),
    traps: { answers: traps.length, errors: traps.filter((result) => critical.some((id) => result.criteria[id] === false)).length },
    outcomes: Object.fromEntries((["answer", "refused", "rejected", "timeout"] as const).map((outcome) => [outcome, results.filter((result) => result.outcome === outcome).length])) as Record<Outcome, number>,
    categories: [...new Set(results.map((result) => result.category))].sort().map((category) => {
      const members = results.filter((result) => result.category === category);
      return { category, answers: members.length, main: round(mean(members.map((result) => result.main ? 1 : 0))), criteria: criteriaShares(members) };
    }),
    costUsd: mean(costs),
    costTotalUsd: costs.reduce((sum, value) => sum + value, 0),
    latencyP50Ms: quantile(latencies, 0.5),
    latencyP90Ms: quantile(latencies, 0.9),
    tokens: Math.round(mean(results.flatMap((result) => result.totalTokens === null ? [] : [result.totalTokens]))),
    models: [...new Set(results.flatMap((result) => result.model ?? []))].sort(),
  };
}

/** Gepaart auf gemeinsamen Fällen; Rauschen ist die halbe Breite des 95 %-Intervalls des Abstands. */
export function compare(candidate: readonly AnswerResult[], reference: readonly AnswerResult[], random: () => number) {
  const before = caseScores(reference);
  const differences = [...caseScores(candidate)].flatMap(([caseId, score]) => before.has(caseId) ? [score - before.get(caseId)!] : []);
  if (!differences.length) throw new Error("Kandidat und Bestand haben keinen gemeinsamen Fall.");
  const { low, high } = bootstrap(differences, random);
  return { cases: differences.length, delta: round(mean(differences)), noise: round((high - low) / 2), gained: differences.filter((value) => value > 0).length, lost: differences.filter((value) => value < 0).length };
}

const LIMIT = 1.2;

/** `failed` nennt die verletzten Bedingungen; leer heißt übernommen. */
export function decide(type: RequestType, candidate: Summary, reference: Summary, comparison: ReturnType<typeof compare>, simplify = false) {
  const failed = [
    ...(simplify ? comparison.delta >= -comparison.noise : comparison.delta > comparison.noise) ? [] : [simplify ? "messbar schlechter als der Bestand" : "Abstand nicht über dem Rauschen"],
    ...type.critical.filter((id) => (candidate.criteria[id] ?? 0) < (reference.criteria[id] ?? 0)).map((id) => `kritisches Kriterium ${id} schlechter`),
    ...candidate.costUsd > reference.costUsd * LIMIT ? ["Kosten über dem 1,2-Fachen"] : [],
    ...candidate.latencyP90Ms > reference.latencyP90Ms * LIMIT ? ["Latenz p90 über dem 1,2-Fachen"] : [],
  ];
  return { decision: failed.length ? "rejected" as const : "accepted" as const, failed };
}

export function agreement(type: RequestType, labels: readonly Label[], verdicts: Verdicts) {
  const pairs = labels.flatMap((label) => {
    const judged = verdicts.get(labelRef(label.id));
    if (!judged) throw new Error(`Richterurteil für Eintrag ${label.id} fehlt.`);
    return Object.entries(label.verdicts).map(([id, human]) => ({ label: label.id, id, human, judge: judged[id] }));
  });
  const criteria = [...new Set(pairs.map((pair) => pair.id))].sort().map((id) => {
    const members = pairs.filter((pair) => pair.id === id);
    const observed = mean(members.map((pair) => pair.human === pair.judge ? 1 : 0));
    const humanPass = mean(members.map((pair) => pair.human ? 1 : 0)), judgePass = mean(members.map((pair) => pair.judge ? 1 : 0));
    const expected = humanPass * judgePass + (1 - humanPass) * (1 - judgePass);
    return { id, entries: members.length, agreement: round(observed), kappa: expected === 1 ? 1 : round((observed - expected) / (1 - expected)), falsePasses: members.filter((pair) => pair.judge && !pair.human).length, falseFails: members.filter((pair) => !pair.judge && pair.human).length };
  });
  const critical = pairs.filter((pair) => (type.critical as readonly string[]).includes(pair.id));
  return {
    entries: labels.length,
    agreement: round(mean(critical.map((pair) => pair.human === pair.judge ? 1 : 0))),
    falsePasses: new Set(critical.filter((pair) => pair.judge && !pair.human).map((pair) => pair.label)).size,
    criteria,
    disagreements: pairs.filter((pair) => pair.human !== pair.judge).map((pair) => `${pair.label} ${pair.id}: Handurteil ${pair.human ? "bestanden" : "nicht bestanden"}, Richter ${pair.judge ? "bestanden" : "nicht bestanden"}`),
  };
}

/** `promptVersion` ist bei Baseline, Übernahme und Rückhalt die Version im Code, sonst die beim Erzeugen. */
export function ledgerRun({ type, run, meta, summary, decision, change, comparison, judge, promptVersion }: { type: RequestType; run: string; meta: RunMeta; summary: Summary; decision: EvalRun["decision"]; change: string; comparison: ReturnType<typeof compare> | null; judge: EvalRun["judge"]; promptVersion: string }): EvalRun {
  return {
    requestType: type.id, run, date: meta.date, split: meta.split === "holdout" ? "holdout" : "dev", promptVersion, candidate: meta.candidate, fingerprint: meta.fingerprint,
    model: meta.model, reasoning: meta.reasoning, change, decision,
    cases: summary.cases, repetitions: summary.repetitions, main: summary.main, low: summary.low, high: summary.high, criteria: summary.criteria,
    outcomes: summary.outcomes, traps: summary.traps,
    costUsd: Number(summary.costUsd.toPrecision(3)), costTotalUsd: Number(summary.costTotalUsd.toPrecision(3)), latencyP90Ms: summary.latencyP90Ms, judge,
    ...(comparison ? { comparison: { noise: comparison.noise, gained: comparison.gained, lost: comparison.lost } } : {}),
  };
}

const percent = (share: number) => `${(share * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

type ReportJudge = { model: string; fingerprint: string; entries: number; cached: number; noise: Record<string, number> };
const fields = (record: Record<string, string>) => Object.entries(record).map(([name, value]) => `${name}: ${value}`).join(" · ");

/** `decision` ist `null` bei Läufen auf dem Trainingsteil, die nichts entscheiden. */
export function renderReport({ type, run, meta, summary, comparison, decision, failed = [], controls, judge }: { type: RequestType; run: string; meta: RunMeta; summary: Summary; comparison: ReturnType<typeof compare> | null; decision: EvalRun["decision"] | null; failed?: readonly string[]; controls: ReturnType<typeof agreement> | null; judge: ReportJudge | null }) {
  const ids = Object.keys(summary.criteria);
  const noise = judge ? Object.entries(judge.noise).map(([id, share]) => `${id} ${percent(share)}`).join(", ") : "";
  const lines = [
    `# ${type.label}: Lauf ${run}`,
    "",
    `Prompt ${meta.promptVersion}${meta.candidate ? ` mit Kandidat ${meta.candidate}` : ""}, Modell ${meta.model}, Reasoning ${meta.reasoning}, Fingerabdruck ${meta.fingerprint}, ${summary.cases} Fälle × ${summary.repetitions} (${meta.split})${meta.dry ? ", Trockenlauf mit nachgebildeten Antworten" : ""}.`,
    "",
    `- Hauptwert: ${percent(summary.main)} (95 %-Intervall ${percent(summary.low)} bis ${percent(summary.high)})${type.target === null ? "" : `, Ziel ${percent(type.target)}`}`,
    `- Kosten: ${summary.costUsd.toPrecision(3)} USD je Antwort, ${summary.costTotalUsd.toFixed(4)} USD im Lauf; ${summary.tokens} Tokens je Antwort`,
    `- Latenz: Median ${summary.latencyP50Ms} ms, p90 ${summary.latencyP90Ms} ms`,
    `- Antworten: ${summary.outcomes.answer} angenommen, ${summary.outcomes.refused} als ungeeignet abgelehnt, ${summary.outcomes.rejected} von der Route verworfen, ${summary.outcomes.timeout} Zeitüberschreitungen`,
    `- Geantwortete Modelle: ${summary.models.join(", ") || "keine"}`,
    ...(summary.traps.answers ? [`- Fallen: ${summary.traps.errors} Fehler bei kritischen Kriterien in ${summary.traps.answers} Antworten${summary.traps.errors ? "" : ` (Obergrenze 3/n = ${percent(3 / summary.traps.answers)})`}`] : []),
    ...(judge ? [`- Richter: ${judge.model}, Fingerabdruck ${judge.fingerprint}; ${judge.entries} Einträge neu bewertet, ${judge.cached} aus dem Urteilscache${noise ? `; Rauschen der Doppelurteile ${noise}` : ""}`] : []),
    comparison ? `- Gegen den Bestand: ${comparison.delta >= 0 ? "+" : "−"}${percent(Math.abs(comparison.delta))} Punkte bei Rauschen ±${percent(comparison.noise)}, ${comparison.gained} Fälle gewonnen, ${comparison.lost} verloren (${comparison.cases} gemeinsame Fälle)` : `- Kein Vergleich: ${decision === "holdout" ? "Rückhalt" : decision === "baseline" ? "Baseline" : "Trainingsteil"}`,
    ...(decision ? [`- Entscheidung: ${decision}${failed.length ? ` (${failed.join(", ")})` : ""}`] : []),
    ...(controls ? [`- Kontrolleinträge: ${controls.entries - new Set(controls.disagreements.map((line) => line.split(" ")[0])).size} von ${controls.entries} wie das Handurteil${controls.disagreements.length ? `; Abweichungen: ${controls.disagreements.join("; ")}` : ""}`] : []),
    "",
    `| Kategorie | Antworten | Hauptwert | ${ids.join(" | ")} |`,
    `| --- | --- | --- | ${ids.map(() => "---").join(" | ")} |`,
    ...summary.categories.map((category) => `| ${category.category} | ${category.answers} | ${percent(category.main)} | ${ids.map((id) => id in category.criteria ? percent(category.criteria[id]) : "–").join(" | ")} |`),
    `| alle | ${summary.cases * summary.repetitions} | ${percent(summary.main)} | ${ids.map((id) => percent(summary.criteria[id])).join(" | ")} |`,
    "",
  ];
  return lines.join("\n");
}

/** Enthält Ein- und Ausgaben; die Datei ist für den Nutzer, der Agent liest sie nur bei Läufen auf dem Trainingsteil. */
export function renderBorderline(type: RequestType, run: string, borderline: ReturnType<typeof borderlineCases>) {
  return [`# ${type.label}: Grenzfälle in Lauf ${run}`, "", ...borderline.length ? borderline.flatMap(({ id, cases }) => [
    `## ${id}`, "",
    ...cases.flatMap((entry) => [
      `- ${entry.entry}: ${entry.passed ? "bestanden" : "nicht bestanden"}, Sicherheit ${entry.sure[id]}${entry.flipped ? ", Doppelurteil gekippt" : ""}${entry.note ? ` – ${entry.note}` : ""}`,
      `  - Eingabe: ${fields(entry.eingabe)}`,
      `  - Ausgabe: ${fields(entry.ausgabe)}`,
    ]),
    "",
  ]) : ["Keine: alle neuen Urteile sind eindeutig, kein Doppelurteil ist gekippt.", ""]].join("\n");
}
