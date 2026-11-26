import type { EvalCase } from "./cases.ts";
import { judgeItemsFor, type EvalDefinition } from "./definitions.ts";
import type { AnswerRow, Outcome, RunMeta } from "./generate.ts";
import { answerRef, labelRef, unsureKey, type Label, type Verdicts, type borderlineCases } from "./judge.ts";
import type { EvalRun, RequestType } from "./ledger.ts";

/**
 * `criteria` und `main` sind Anteile: 0 oder 1 bei einem Richtereintrag je Antwort, sonst der Anteil bestandener Einträge.
 * Ein Kriterium fehlt, wenn es für die Anfrage nicht gilt, die Antwort den Vertrag nicht besteht oder eine der beiden
 * Seiten (Fall oder Modell) eine Ablehnung ist. `main` ist `null`, wenn ein Hauptkriterium nur ein Urteil mit Sicherheit 1
 * hat und kein sicheres Hauptkriterium durchfällt; die Antwort zählt dann für den Hauptwert nicht.
 */
export type AnswerResult = { caseId: string; /** Fehlt in älteren Ergebnissen; dann ist der Fall seine eigene Gruppe. */ group?: string; repetition: number; category: string; trap: boolean; outcome: Outcome; criteria: Record<string, number>; main: number | null; metrics?: Record<string, number>; costUsd: number | null; latencyMs: number; totalTokens: number | null; model: string | null };

const RESAMPLES = 2000;
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const quantile = (values: readonly number[], share: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * share) - 1))] ?? 0;
const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Wiederholungen `0` bis `repetitions − 1` müssen je Fall vorliegen; weitere Zeilen eines Falls (Nachmessungen) zählen mit.
 * `refFor` bildet den Schlüssel der Richterurteile; `unsure` nennt Urteile mit Sicherheit 1.
 */
export function evaluateAnswers(definition: EvalDefinition, cases: readonly EvalCase[], repetitions: number, rows: readonly AnswerRow[], verdicts: Verdicts, { refFor = answerRef, unsure = new Set<string>() }: { refFor?: (caseId: string, repetition: number) => string; unsure?: ReadonlySet<string> } = {}): AnswerResult[] {
  const byKey = new Map(rows.map((row) => [refFor(row.caseId, row.repetition), row]));
  const isMain = (id: string) => definition.main.includes(id);
  const repetitionsOf = (caseId: string) => [...new Set([...Array.from({ length: repetitions }, (_, repetition) => repetition), ...rows.filter((row) => row.caseId === caseId).map((row) => row.repetition)])].sort((a, b) => a - b);
  return cases.flatMap((entry) => repetitionsOf(entry.id).map((repetition) => {
    const ref = refFor(entry.id, repetition);
    const row = byKey.get(ref);
    if (!row) throw new Error(`Antwort ${entry.id}#${repetition} fehlt. „generate“ mit demselben Laufnamen fortsetzen.`);
    const valid = row.outcome === "answer" || row.outcome === "refused";
    const passed: Record<string, boolean> = { [definition.contract]: valid };
    if (valid && definition.refusal) passed[definition.refusal.criterion] = (row.outcome === "refused") === Boolean(entry.refuse);
    const shares: Record<string, number[]> = {};
    let itemMains: number[] = [];
    let undecided = false;
    const judging = row.outcome === "answer" && !entry.refuse;
    if (judging) {
      for (const [id, check] of Object.entries(definition.automatic)) passed[id] = check(entry.request, row.output);
      for (const item of judgeItemsFor(definition, ref, entry.request, row.output)) {
        const judged = verdicts.get(item.ref);
        let doubtful = false;
        const itemPassed = item.criteria.flatMap(({ id }) => {
          if (judged?.[id] === undefined) throw new Error(`Richterurteil ${id} für ${item.ref.replace(/^\w+:/, "")} fehlt.`);
          if (unsure.has(unsureKey(item.ref, id))) { doubtful ||= isMain(id.split(":")[0]); return []; }
          (shares[id.split(":")[0]] ??= []).push(judged[id] ? 1 : 0);
          return [{ id: id.split(":")[0], ok: judged[id] }];
        });
        const failedMain = itemPassed.some(({ id, ok }) => isMain(id) && !ok);
        if (doubtful && !failedMain) undecided = true;
        else if (itemPassed.some(({ id }) => isMain(id))) itemMains.push(failedMain ? 0 : 1);
      }
    }
    const criteria = { ...Object.fromEntries(Object.entries(passed).map(([id, ok]) => [id, ok ? 1 : 0])), ...Object.fromEntries(Object.entries(shares).map(([id, values]) => [id, round(mean(values))])) };
    const automaticMain = Object.entries(passed).every(([id, ok]) => ok || !isMain(id));
    if (definition.items && !itemMains.length && !undecided) itemMains = [0];
    const main = !valid || !automaticMain ? 0 : itemMains.length ? round(mean(itemMains)) : undecided ? null : 1;
    const metrics = judging && definition.metrics ? { metrics: definition.metrics(entry.request, row.output) } : {};
    return { caseId: entry.id, group: entry.group ?? entry.id, repetition, category: entry.category, trap: Boolean(entry.trap), outcome: row.outcome, criteria, main, ...metrics, costUsd: row.costUsd, latencyMs: row.latencyMs, totalTokens: row.totalTokens, model: row.model };
  }));
}

type CaseScore = { caseId: string; group: string; score: number };

function caseScores(results: readonly AnswerResult[], value: (result: AnswerResult) => number | null | undefined = (result) => result.main): CaseScore[] {
  const scores = new Map<string, { group: string; values: number[] }>();
  for (const result of results) {
    const score = value(result);
    if (score === null || score === undefined) continue;
    const entry = scores.get(result.caseId) ?? { group: result.group ?? result.caseId, values: [] };
    entry.values.push(score);
    scores.set(result.caseId, entry);
  }
  return [...scores].map(([caseId, { group, values }]) => ({ caseId, group, score: mean(values) }));
}

/**
 * Bootstrap über Gruppen: Fälle derselben Karte, Notiz oder Quelle und die Wiederholungen eines Falls bleiben zusammen.
 * `above` und `below` sind die Anteile der Stichproben mit Mittel über bzw. unter null.
 */
function bootstrap(scores: readonly CaseScore[], random: () => number) {
  const byGroup = new Map<string, number[]>();
  for (const { group, score } of scores) byGroup.set(group, [...(byGroup.get(group) ?? []), score]);
  const groups = [...byGroup.values()];
  const means = Array.from({ length: RESAMPLES }, () => mean(Array.from({ length: groups.length }, () => groups[Math.floor(random() * groups.length)]).flat()));
  return { low: quantile(means, 0.025), high: quantile(means, 0.975), above: means.filter((value) => value > 0).length / RESAMPLES, below: means.filter((value) => value < 0).length / RESAMPLES };
}

function pairs(candidate: readonly AnswerResult[], reference: readonly AnswerResult[], value?: (result: AnswerResult) => number | null | undefined): CaseScore[] {
  const before = new Map(caseScores(reference, value).map((entry) => [entry.caseId, entry.score]));
  return caseScores(candidate, value).flatMap((entry) => before.has(entry.caseId) ? [{ ...entry, score: entry.score - before.get(entry.caseId)! }] : []);
}

function criteriaShares(results: readonly AnswerResult[]) {
  const ids = [...new Set(results.flatMap((result) => Object.keys(result.criteria)))].sort();
  return Object.fromEntries(ids.map((id) => [id, round(mean(results.filter((result) => id in result.criteria).map((result) => result.criteria[id])))]));
}

function metricMeans(results: readonly AnswerResult[]) {
  const ids = [...new Set(results.flatMap((result) => Object.keys(result.metrics ?? {})))].sort();
  return Object.fromEntries(ids.map((id) => [id, round(mean(results.flatMap((result) => result.metrics && id in result.metrics ? [result.metrics[id]] : [])))]));
}

export type Summary = ReturnType<typeof summarize>;

/** Eine Falle zählt als Fehler, wenn eines der kritischen Kriterien `critical` durchfällt. */
export function summarize(results: readonly AnswerResult[], random: () => number, critical: readonly string[] = []) {
  const traps = results.filter((result) => result.trap);
  const scored = caseScores(results);
  const scores = scored.map(({ score }) => score);
  const counts = new Map<string, number>();
  for (const result of results) counts.set(result.caseId, (counts.get(result.caseId) ?? 0) + 1);
  const costs = results.flatMap((result) => result.costUsd === null ? [] : [result.costUsd]);
  const latencies = results.map((result) => result.latencyMs);
  const interval = bootstrap(scored, random);
  return {
    cases: scores.length,
    repetitions: Math.min(...counts.values()),
    main: round(mean(scores)),
    low: round(interval.low),
    high: round(interval.high),
    criteria: criteriaShares(results),
    metrics: metricMeans(results),
    traps: { answers: traps.length, errors: traps.filter((result) => critical.some((id) => id in result.criteria && result.criteria[id] < 1)).length },
    outcomes: Object.fromEntries((["answer", "refused", "rejected", "timeout"] as const).map((outcome) => [outcome, results.filter((result) => result.outcome === outcome).length])) as Record<Outcome, number>,
    categories: [...new Set(results.map((result) => result.category))].sort().map((category) => {
      const members = results.filter((result) => result.category === category);
      return { category, answers: members.length, main: round(mean(members.flatMap((result) => result.main === null ? [] : [result.main]))), criteria: criteriaShares(members), metrics: metricMeans(members) };
    }),
    costUsd: mean(costs),
    costTotalUsd: costs.reduce((sum, value) => sum + value, 0),
    latencyP50Ms: quantile(latencies, 0.5),
    latencyP90Ms: quantile(latencies, 0.9),
    tokens: Math.round(mean(results.flatMap((result) => result.totalTokens === null ? [] : [result.totalTokens]))),
    models: [...new Set(results.flatMap((result) => result.model ?? []))].sort(),
  };
}

/** Fälle, bei denen eine Antwort ein Kriterium aus `target` trägt oder deren Kategorie in `target` steht. */
function targetCases(results: readonly AnswerResult[], target: readonly string[]) {
  const known = new Set(results.flatMap((result) => [result.category, ...Object.keys(result.criteria)]));
  const unknown = target.filter((name) => !known.has(name));
  if (unknown.length) throw new Error(`--target kennt ${unknown.join(", ")} nicht; erlaubt sind Kriterien und Kategorien des Laufs.`);
  return new Set(results.filter((result) => target.includes(result.category) || Object.keys(result.criteria).some((id) => target.includes(id))).map((result) => result.caseId));
}

/**
 * Gepaart auf gemeinsamen Fällen; Rauschen ist die halbe Breite des 95 %-Intervalls des Abstands, `better` und `worse` die
 * Anteile der Stichproben mit positivem bzw. negativem Abstand, `critical` dasselbe `worse` je kritischem Kriterium.
 * Mit `target` zählt der Vergleich gewonnene und verlorene Fälle getrennt für das genannte Fehlerbild und den Rest.
 */
export function compare(candidate: readonly AnswerResult[], reference: readonly AnswerResult[], random: () => number, target: readonly string[] = [], critical: readonly string[] = []) {
  const paired = pairs(candidate, reference);
  if (!paired.length) throw new Error("Kandidat und Bestand haben keinen gemeinsamen Fall.");
  const { low, high, above, below } = bootstrap(paired, random);
  const tally = (members: readonly CaseScore[]) => ({ cases: members.length, gained: members.filter(({ score }) => score > 0).length, lost: members.filter(({ score }) => score < 0).length });
  const aimed = targetCases([...candidate, ...reference], target);
  if (target.length && (!paired.some(({ caseId }) => aimed.has(caseId)) || paired.every(({ caseId }) => aimed.has(caseId)))) throw new Error(`Das Fehlerbild ${target.join(", ")} trifft keinen oder jeden Fall; enger fassen, etwa mit einer Kategorie oder einem Modus-Kriterium.`);
  return {
    delta: round(mean(paired.map(({ score }) => score))), noise: round((high - low) / 2), better: round(above), worse: round(below), ...tally(paired),
    critical: Object.fromEntries(critical.flatMap((id) => {
      const criterion = pairs(candidate, reference, (result) => result.criteria[id]);
      return criterion.length ? [[id, round(bootstrap(criterion, random).below)]] : [];
    })) as Record<string, number>,
    targeted: target.length ? { target: [...target], aimed: tally(paired.filter(({ caseId }) => aimed.has(caseId))), rest: tally(paired.filter(({ caseId }) => !aimed.has(caseId))) } : null,
  };
}

const DECISIVE_SHARE = 0.9;
const TARGET_MARGIN = 2;
const REST_MARGIN = 1;
const NOT_BETTER = "besser in weniger als 90 % der Stichproben";

/** `failed` nennt die verletzten Bedingungen; leer heißt übernommen oder vorläufig übernommen. */
export function decide(comparison: ReturnType<typeof compare>, simplify = false) {
  const failed = [
    ...(simplify ? comparison.worse < DECISIVE_SHARE : comparison.better >= DECISIVE_SHARE) ? [] : [simplify ? "schlechter in mindestens 90 % der Stichproben" : NOT_BETTER],
    ...Object.entries(comparison.critical).filter(([, worse]) => worse >= DECISIVE_SHARE).map(([id]) => `kritisches Kriterium ${id} schlechter in mindestens 90 % der Stichproben`),
  ];
  const targeted = comparison.targeted;
  if (targeted && failed.length === 1 && failed[0] === NOT_BETTER) {
    const aimedMet = targeted.aimed.gained - targeted.aimed.lost >= TARGET_MARGIN;
    const restMet = targeted.rest.lost - targeted.rest.gained <= REST_MARGIN;
    if (aimedMet && restMet) return { decision: "provisional" as const, failed: [] };
    return { decision: "rejected" as const, failed: [...failed, ...aimedMet ? [] : ["Fehlerbild nicht um zwei Fälle besser"], ...restMet ? [] : ["übrige Fälle um mehr als einen schlechter"]] };
  }
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
export function ledgerRun({ type, run, meta, summary, decision, change, comparison, judge, promptVersion, reason, confirmation = false }: { type: RequestType; run: string; meta: RunMeta; summary: Summary; decision: EvalRun["decision"]; change: string; comparison: ReturnType<typeof compare> | null; judge: EvalRun["judge"]; promptVersion: string; reason?: string; confirmation?: boolean }): EvalRun {
  return {
    requestType: type.id, run, date: meta.date, split: meta.split === "holdout" ? "holdout" : "dev", promptVersion, candidate: meta.candidate, fingerprint: meta.fingerprint,
    model: meta.model, reasoning: meta.reasoning, change, decision,
    cases: summary.cases, repetitions: summary.repetitions, main: summary.main, low: summary.low, high: summary.high, criteria: summary.criteria,
    outcomes: summary.outcomes, traps: summary.traps,
    costUsd: Number(summary.costUsd.toPrecision(3)), costTotalUsd: Number(summary.costTotalUsd.toPrecision(3)), latencyP90Ms: summary.latencyP90Ms, judge,
    ...(Object.keys(summary.metrics).length ? { metrics: summary.metrics } : {}),
    ...(comparison ? { comparison: { noise: comparison.noise, better: comparison.better, gained: comparison.gained, lost: comparison.lost, ...comparison.targeted ? { target: comparison.targeted.target } : {} } } : {}),
    ...(reason ? { reason } : {}),
    ...(confirmation ? { confirmation: true as const } : {}),
  };
}

const number = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const percent = (share: number) => `${(share * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

type ReportJudge = { model: string; fingerprint: string; entries: number; cached: number; noise: Record<string, number> };
const fields = (record: Record<string, string>) => Object.entries(record).map(([name, value]) => `${name}: ${value}`).join(" · ");

/** `decision` ist `null` bei Läufen auf dem Trainingsteil, die nichts entscheiden. */
export function renderReport({ type, run, meta, summary, comparison, decision, failed = [], controls, judge }: { type: RequestType; run: string; meta: RunMeta; summary: Summary; comparison: ReturnType<typeof compare> | null; decision: EvalRun["decision"] | null; failed?: readonly string[]; controls: ReturnType<typeof agreement> | null; judge: ReportJudge | null }) {
  const ids = Object.keys(summary.criteria);
  const metricIds = Object.keys(summary.metrics);
  const noise = judge ? Object.entries(judge.noise).map(([id, share]) => `${id} ${percent(share)}`).join(", ") : "";
  const lines = [
    `# ${type.label}: Lauf ${run}`,
    "",
    `Prompt ${meta.promptVersion}${meta.candidate ? ` mit Kandidat ${meta.candidate}` : ""}, Modell ${meta.model}, Reasoning ${meta.reasoning}, Fingerabdruck ${meta.fingerprint}, ${summary.cases} Fälle × ${summary.repetitions} (${meta.split})${meta.dry ? ", Trockenlauf mit nachgebildeten Antworten" : ""}.`,
    "",
    `- Hauptwert: **${percent(summary.main)}** (${number(summary.main * summary.cases * summary.repetitions)} von ${summary.cases * summary.repetitions} Antworten richtig; 95 %-Intervall ${percent(summary.low)} bis ${percent(summary.high)})${type.target === null ? "" : `, Ziel ${percent(type.target)}`}`,
    `- Kosten: ${summary.costUsd.toPrecision(3)} USD je Antwort, ${summary.costTotalUsd.toFixed(4)} USD im Lauf; ${summary.tokens} Tokens je Antwort`,
    `- Latenz: Median ${summary.latencyP50Ms} ms, p90 ${summary.latencyP90Ms} ms`,
    `- Antworten: ${summary.outcomes.answer} angenommen, ${summary.outcomes.refused} als ungeeignet abgelehnt, ${summary.outcomes.rejected} von der Route verworfen, ${summary.outcomes.timeout} Zeitüberschreitungen`,
    `- Geantwortete Modelle: ${summary.models.join(", ") || "keine"}`,
    ...(summary.traps.answers ? [`- Fallen: ${summary.traps.errors} Fehler bei kritischen Kriterien in ${summary.traps.answers} Antworten${summary.traps.errors ? "" : ` (Obergrenze 3/n = ${percent(3 / summary.traps.answers)})`}`] : []),
    ...(judge ? [`- Richter: ${judge.model}, Fingerabdruck ${judge.fingerprint}; ${judge.entries} Einträge neu bewertet, ${judge.cached} aus dem Urteilscache${noise ? `; Rauschen der Doppelurteile ${noise}` : ""}`] : []),
    comparison ? `- Gegen den Bestand: ${comparison.delta >= 0 ? "+" : "−"}${percent(Math.abs(comparison.delta))} Punkte bei Rauschen ±${percent(comparison.noise)}, besser in ${percent(comparison.better)} der Stichproben, ${comparison.gained} Fälle gewonnen, ${comparison.lost} verloren (${comparison.cases} gemeinsame Fälle)` : `- Kein Vergleich: ${decision === "holdout" ? "Rückhalt" : decision === "baseline" ? "Baseline" : "Trainingsteil"}`,
    ...(comparison?.targeted ? [`- Fehlerbild ${comparison.targeted.target.join(", ")}: ${comparison.targeted.aimed.gained} Fälle gewonnen, ${comparison.targeted.aimed.lost} verloren (${comparison.targeted.aimed.cases} Fälle); übrige: ${comparison.targeted.rest.gained} gewonnen, ${comparison.targeted.rest.lost} verloren`] : []),
    ...(decision ? [`- Entscheidung: ${decision}${failed.length ? ` (${failed.join(", ")})` : ""}`] : []),
    ...(controls ? [`- Kontrolleinträge: ${controls.entries - new Set(controls.disagreements.map((line) => line.split(" ")[0])).size} von ${controls.entries} wie das Handurteil${controls.disagreements.length ? `; Abweichungen: ${controls.disagreements.join("; ")}` : ""}`] : []),
    "",
    `| Kategorie | Antworten | Hauptwert | ${ids.join(" | ")} |`,
    `| --- | --- | --- | ${ids.map(() => "---").join(" | ")} |`,
    ...summary.categories.map((category) => `| ${category.category} | ${category.answers} | ${percent(category.main)} | ${ids.map((id) => id in category.criteria ? percent(category.criteria[id]) : "–").join(" | ")} |`),
    `| alle | ${summary.cases * summary.repetitions} | ${percent(summary.main)} | ${ids.map((id) => percent(summary.criteria[id])).join(" | ")} |`,
    "",
    ...metricIds.length ? [
      "Messgrößen je Antwort, gemittelt:",
      "",
      `| Kategorie | ${metricIds.join(" | ")} |`,
      `| --- | ${metricIds.map(() => "---").join(" | ")} |`,
      ...[...summary.categories.map((category) => ({ name: category.category, values: category.metrics })), { name: "alle", values: summary.metrics }]
        .map(({ name, values }) => `| ${name} | ${metricIds.map((id) => id in values ? number(values[id]) : "–").join(" | ")} |`),
      "",
    ] : [],
  ];
  return lines.join("\n");
}

export function renderBorderline(type: RequestType, run: string, borderline: ReturnType<typeof borderlineCases>) {
  return [`# ${type.label}: Grenzfälle in Lauf ${run}`, "", ...borderline.length ? borderline.flatMap(({ id, cases }) => [
    `## ${id}`, "",
    ...cases.flatMap((entry) => [
      `- ${entry.entry}: ${entry.passed ? "bestanden" : "nicht bestanden"}, Sicherheit ${entry.sure}${entry.flipped ? ", Doppelurteil gekippt" : ""}${entry.note ? ` – ${entry.note}` : ""}`,
      `  - Eingabe: ${fields(entry.eingabe)}`,
      `  - Ausgabe: ${fields(entry.ausgabe)}`,
    ]),
    "",
  ]) : ["Keine: alle neuen Urteile sind eindeutig, kein Doppelurteil ist gekippt.", ""]].join("\n");
}
