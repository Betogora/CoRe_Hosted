import type { EvalCase } from "./cases.ts";
import type { EvalDefinition } from "./definitions.ts";
import type { AnswerRow, RunMeta } from "./generate.ts";
import { answerRef, labelRef, type Label, type Verdicts } from "./judge.ts";
import type { EvalRun, RequestType } from "./ledger.ts";

/** Eine Antwort mit ihren Kriterien; ein Kriterium fehlt, wenn es für die Anfrage nicht gilt oder die Antwort den Vertrag nicht besteht. */
export type AnswerResult = { caseId: string; repetition: number; category: string; criteria: Record<string, boolean>; main: boolean; costUsd: number | null; latencyMs: number; totalTokens: number | null; model: string | null };

const RESAMPLES = 2000;
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const quantile = (values: readonly number[], share: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * share) - 1))] ?? 0;
const round = (value: number) => Math.round(value * 10000) / 10000;

/** Bewertet jede Antwort: Vertrag, automatische Kriterien und Richterurteile; fehlt eine Antwort oder ein Urteil, bricht die Auswertung ab. */
export function evaluateAnswers(definition: EvalDefinition, cases: readonly EvalCase[], repetitions: number, rows: readonly AnswerRow[], verdicts: Verdicts): AnswerResult[] {
  const byKey = new Map(rows.map((row) => [answerRef(row.caseId, row.repetition), row]));
  return cases.flatMap((entry) => Array.from({ length: repetitions }, (_, repetition) => {
    const ref = answerRef(entry.id, repetition);
    const row = byKey.get(ref);
    if (!row) throw new Error(`Antwort ${entry.id}#${repetition} fehlt. „generate“ mit demselben Laufnamen fortsetzen.`);
    const criteria: Record<string, boolean> = { [definition.contract]: row.ok };
    if (row.ok) {
      for (const [id, check] of Object.entries(definition.automatic)) criteria[id] = (criteria[id] ?? true) && check(entry.request, row.output);
      const judged = verdicts.get(ref);
      for (const { id } of definition.judged(entry.request)) {
        if (judged?.[id] === undefined) throw new Error(`Richterurteil ${id} für ${entry.id}#${repetition} fehlt.`);
        criteria[id] = (criteria[id] ?? true) && judged[id];
      }
    }
    return { caseId: entry.id, repetition, category: entry.category, criteria, main: definition.main.every((id) => criteria[id] ?? true), costUsd: row.costUsd, latencyMs: row.latencyMs, totalTokens: row.totalTokens, model: row.model };
  }));
}

function caseScores(results: readonly AnswerResult[]) {
  const scores = new Map<string, number[]>();
  for (const result of results) scores.set(result.caseId, [...(scores.get(result.caseId) ?? []), result.main ? 1 : 0]);
  return new Map([...scores].map(([caseId, values]) => [caseId, mean(values)]));
}

/** 95 %-Intervall eines Mittelwerts per Bootstrap über Fälle; Wiederholungen eines Falls bleiben zusammen. */
function bootstrap(values: readonly number[], random: () => number) {
  const means = Array.from({ length: RESAMPLES }, () => mean(Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)])));
  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}

function criteriaShares(results: readonly AnswerResult[]) {
  const ids = [...new Set(results.flatMap((result) => Object.keys(result.criteria)))].sort();
  return Object.fromEntries(ids.map((id) => [id, round(mean(results.filter((result) => id in result.criteria).map((result) => result.criteria[id] ? 1 : 0)))]));
}

export type Summary = ReturnType<typeof summarize>;

export function summarize(results: readonly AnswerResult[], random: () => number) {
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

/** Gepaarter Vergleich auf gemeinsamen Fällen: Abstand, Rauschen als halbe Breite seines 95 %-Intervalls und Fallwechsel. */
export function compare(candidate: readonly AnswerResult[], reference: readonly AnswerResult[], random: () => number) {
  const before = caseScores(reference);
  const differences = [...caseScores(candidate)].flatMap(([caseId, score]) => before.has(caseId) ? [score - before.get(caseId)!] : []);
  if (!differences.length) throw new Error("Kandidat und Bestand haben keinen gemeinsamen Fall.");
  const { low, high } = bootstrap(differences, random);
  return { cases: differences.length, delta: round(mean(differences)), noise: round((high - low) / 2), gained: differences.filter((value) => value > 0).length, lost: differences.filter((value) => value < 0).length };
}

/** ADR-049: übernommen nur, wenn der Testwert über das Rauschen steigt und kein kritisches Kriterium schlechter wird. */
export function decide(type: RequestType, candidate: Summary, reference: Summary, comparison: ReturnType<typeof compare>): "accepted" | "rejected" {
  const criticalHolds = type.critical.every((id) => (candidate.criteria[id] ?? 0) >= (reference.criteria[id] ?? 0));
  return comparison.delta > comparison.noise && criticalHolds ? "accepted" : "rejected";
}

/** Vergleicht Richter und Handurteil auf den bewerteten Einträgen. */
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

export function ledgerRun(type: RequestType, run: string, meta: RunMeta, summary: Summary, decision: EvalRun["decision"], change: string, comparison: ReturnType<typeof compare> | null): EvalRun {
  return {
    requestType: type.id, run, date: meta.date, promptVersion: meta.promptVersion, model: meta.model, reasoning: meta.reasoning, change, decision,
    cases: summary.cases, repetitions: summary.repetitions, main: summary.main, low: summary.low, high: summary.high, criteria: summary.criteria,
    costUsd: Number(summary.costUsd.toPrecision(3)), latencyP90Ms: summary.latencyP90Ms,
    ...(comparison ? { comparison: { noise: comparison.noise, gained: comparison.gained, lost: comparison.lost } } : {}),
  };
}

const percent = (share: number) => `${(share * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Bericht eines Laufs als Markdown: Hauptwert, Kriterien je Kategorie, Kosten, Vergleich und Kontrolleinträge. */
export function renderReport({ type, run, meta, summary, comparison, decision, controls }: { type: RequestType; run: string; meta: RunMeta; summary: Summary; comparison: ReturnType<typeof compare> | null; decision: EvalRun["decision"]; controls: ReturnType<typeof agreement> | null }) {
  const ids = Object.keys(summary.criteria);
  const lines = [
    `# ${type.label}: Lauf ${run}`,
    "",
    `Prompt ${meta.promptVersion}, Modell ${meta.model}, Reasoning ${meta.reasoning}, ${summary.cases} Fälle × ${summary.repetitions} (${meta.split})${meta.dry ? ", Trockenlauf mit nachgebildeten Antworten" : ""}.`,
    "",
    `- Hauptwert: ${percent(summary.main)} (95 %-Intervall ${percent(summary.low)} bis ${percent(summary.high)})${type.target === null ? "" : `, Ziel ${percent(type.target)}`}`,
    `- Kosten: ${summary.costUsd.toPrecision(3)} USD je Antwort, ${summary.costTotalUsd.toFixed(4)} USD im Lauf; ${summary.tokens} Tokens je Antwort`,
    `- Latenz: Median ${summary.latencyP50Ms} ms, p90 ${summary.latencyP90Ms} ms`,
    `- Geantwortete Modelle: ${summary.models.join(", ") || "keine"}`,
    comparison ? `- Gegen den Bestand: ${comparison.delta >= 0 ? "+" : "−"}${percent(Math.abs(comparison.delta))} Punkte bei Rauschen ±${percent(comparison.noise)}, ${comparison.gained} Fälle gewonnen, ${comparison.lost} verloren (${comparison.cases} gemeinsame Fälle)` : "- Kein Vergleich: Baseline",
    `- Entscheidung: ${decision}`,
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
