import { existsSync } from "node:fs";
import * as v from "valibot";
import { readJson, shuffled } from "./cases.ts";
import type { EvalDefinition, JudgedCriterion } from "./definitions.ts";
import { parseStrict } from "./ledger.ts";

export const labelsFile = (id: string) => `fixtures/ai-eval/${id}.labels.json`;

const labelsSchema = v.strictObject({
  entries: v.array(v.strictObject({
    id: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
    request: v.unknown(),
    output: v.unknown(),
    verdicts: v.record(v.string(), v.boolean()),
    control: v.optional(v.boolean()),
    note: v.optional(v.string()),
  })),
});
const verdictsSchema = v.strictObject({
  verdicts: v.array(v.strictObject({ entry: v.string(), results: v.record(v.string(), v.boolean()), note: v.optional(v.string()) })),
});

/** Ein von Hand bewerteter Eintrag; `control` mischt ihn als Kontrolleintrag in jede Richtertabelle. */
export type Label = v.InferOutput<typeof labelsSchema>["entries"][number];
/** Ein zu bewertendes Paar aus Anfrage und Antwort; `ref` führt zurück zur Antwort oder zum Handurteil. */
export type JudgeItem = { ref: string; request: unknown; output: unknown };
export type JudgeTable = { requestType: string; criteria: JudgedCriterion[]; entries: { entry: string; criteria: string[]; eingabe: Record<string, string>; ausgabe: Record<string, string> }[] };
export type Verdicts = Map<string, Record<string, boolean>>;

export const answerRef = (caseId: string, repetition: number) => `answer:${caseId}#${repetition}`;
export const labelRef = (id: string) => `label:${id}`;

/** Handurteile eines Anfragetyps; jedes deckt genau die Kriterien ab, die der Richter für diesen Eintrag bewertet. */
export function readLabels(definition: EvalDefinition): Label[] {
  const file = labelsFile(definition.id);
  if (!existsSync(file)) return [];
  return parseStrict(labelsSchema, readJson(file), file).entries.map((entry) => {
    const request = definition.parseRequest(entry.request);
    if (!request) throw new Error(`${file}: Eintrag ${entry.id} besteht den Anfragevertrag der Route nicht.`);
    const expected = definition.judged(request).map((criterion) => criterion.id).sort().join(", ");
    if (Object.keys(entry.verdicts).sort().join(", ") !== expected) throw new Error(`${file}: Eintrag ${entry.id} braucht genau die Urteile ${expected}.`);
    return { ...entry, request };
  });
}

/** Eine Tabelle für den Richter: ohne Dubletten, gemischt und ohne Hinweis auf Fall, Wiederholung oder Kontrolleintrag. */
export function buildJudgeTable(definition: EvalDefinition, items: readonly JudgeItem[], random: () => number) {
  const groups = new Map<string, JudgeItem[]>();
  for (const item of items) {
    const identity = JSON.stringify([item.request, item.output]);
    groups.set(identity, [...(groups.get(identity) ?? []), item]);
  }
  const criteria = new Map<string, JudgedCriterion>();
  const key: Record<string, string[]> = {};
  const entries = shuffled([...groups.values()], random).map((group, index) => {
    const entry = `e${String(index + 1).padStart(4, "0")}`;
    const judged = definition.judged(group[0].request);
    for (const criterion of judged) criteria.set(criterion.id, criterion);
    key[entry] = group.map((item) => item.ref);
    return { entry, criteria: judged.map((criterion) => criterion.id), ...definition.render(group[0].request, group[0].output) };
  });
  const table: JudgeTable = { requestType: definition.id, criteria: [...criteria.values()], entries };
  return { table, key };
}

/** Liest die Urteile des Richters, prüft sie auf Vollständigkeit und ordnet sie über den Schlüssel den Antworten zu. */
export function readVerdicts(value: unknown, table: JudgeTable, key: Record<string, string[]>): Verdicts {
  const results = new Map(parseStrict(verdictsSchema, value, "Richterurteile").verdicts.map((verdict) => [verdict.entry, verdict.results]));
  const verdicts: Verdicts = new Map();
  const problems: string[] = [];
  for (const entry of table.entries) {
    const given = results.get(entry.entry);
    if (!given || Object.keys(given).sort().join(",") !== [...entry.criteria].sort().join(",")) problems.push(`${entry.entry} braucht genau ${entry.criteria.join(", ")}`);
    else for (const ref of key[entry.entry]) verdicts.set(ref, given);
  }
  if (problems.length) throw new Error(`Richterurteile unvollständig (${problems.length} Einträge), zum Beispiel: ${problems.slice(0, 3).join("; ")}.`);
  return verdicts;
}
