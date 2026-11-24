import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as v from "valibot";
import { readJson, shuffled } from "./cases.ts";
import type { EvalDefinition, JudgedCriterion, Rendered } from "./definitions.ts";
import { parseStrict } from "./ledger.ts";

export const labelsFile = (id: string) => `fixtures/ai-eval/${id}.labels.json`;
export const JUDGE_INSTRUCTIONS_FILE = ".claude/agents/eval-judge.md";
const BLOCK_ENTRIES = 25;
const BLOCK_CHARS = 12_000;
const DUPLICATE_SHARE = 0.1;
const MIN_DUPLICATES = 10;

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
const sure = v.picklist([1, 2, 3]);
const verdictsSchema = v.strictObject({
  verdicts: v.array(v.strictObject({ entry: v.string(), results: v.record(v.string(), v.boolean()), sure: v.record(v.string(), sure), note: v.optional(v.string()) })),
});

/** `control` mischt den Eintrag als Kontrolleintrag in jede Richtertabelle. */
export type Label = v.InferOutput<typeof labelsSchema>["entries"][number];
/** `ref` führt zurück zur Antwort oder zum Handurteil (`judgeItemsFor`). */
export type JudgeItem = { ref: string; criteria: JudgedCriterion[]; rendered: Rendered };
export type JudgeEntry = { entry: string; criteria: string[]; eingabe: Record<string, string>; ausgabe: Record<string, string> };
export type JudgeBlock = { requestType: string; criteria: JudgedCriterion[]; entries: JudgeEntry[] };
/** `sure`: 3 eindeutig, 2 auch anders vertretbar, 1 knapp. */
export type Verdict = { results: Record<string, boolean>; sure: Record<string, number>; note?: string };
export type Verdicts = Map<string, Record<string, boolean>>;
/** Schlüssel des Urteilscache ist `entryHash`; ein Urteil gilt nur für denselben Richterauftrag, Bogen, Eingabe und Ausgabe. */
export type JudgeCache = Record<string, Verdict>;
/**
 * `entries`: Eintrag → Antworten oder Handurteile. `duplicates`: Doppel → Original in einem anderen Block. `hashes`: Eintrag →
 * Cacheschlüssel (Kontrolleinträge haben keinen). `cached`: Antwort → Cacheschlüssel ihres Urteils ohne neuen Richter.
 */
export type JudgeKey = { judge: string; entries: Record<string, string[]>; duplicates: Record<string, string>; hashes: Record<string, string>; cached: Record<string, string> };

export const answerRef = (caseId: string, repetition: number) => `answer:${caseId}#${repetition}`;
export const labelRef = (id: string) => `label:${id}`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const baseId = (id: string) => id.split(":")[0];

export function readLabels(definition: EvalDefinition): Label[] {
  const file = labelsFile(definition.id);
  if (!existsSync(file)) return [];
  if (definition.items) throw new Error(`${file}: Handurteile gibt es nur für Anfragetypen mit einem Richtereintrag je Antwort.`);
  return parseStrict(labelsSchema, readJson(file), file).entries.map((entry) => {
    const request = definition.parseRequest(entry.request);
    if (!request) throw new Error(`${file}: Eintrag ${entry.id} besteht den Anfragevertrag der Route nicht.`);
    const expected = definition.judged(request).map((criterion) => criterion.id).sort().join(", ");
    if (Object.keys(entry.verdicts).sort().join(", ") !== expected) throw new Error(`${file}: Eintrag ${entry.id} braucht genau die Urteile ${expected}.`);
    return { ...entry, request };
  });
}

/**
 * Die Blöcke verraten weder Fall noch Wiederholung noch Kontrolleintrag. Einträge mit Urteil im Cache gehen in keinen
 * Block; ab zwei Blöcken steht ein Anteil der übrigen ein zweites Mal in einem anderen Block.
 */
/** `requests` sind alle Anfragen des Fallsatzes; ihre Kriterien bestimmen den Fingerabdruck, egal welche Antworten ein Lauf hat. */
export function buildJudgeTable(definition: EvalDefinition, items: readonly JudgeItem[], random: () => number, { instructions, requests, cache = {} }: { instructions: string; requests: readonly unknown[]; cache?: JudgeCache }) {
  const groups = new Map<string, JudgeItem[]>();
  for (const item of items) {
    const identity = JSON.stringify([item.criteria.map((criterion) => criterion.id), item.rendered]);
    groups.set(identity, [...(groups.get(identity) ?? []), item]);
  }
  const allCriteria = new Map<string, JudgedCriterion>();
  const key: JudgeKey = { judge: "", entries: {}, duplicates: {}, hashes: {}, cached: {} };
  const open: { refs: string[]; hash: string | null; criteria: JudgedCriterion[]; rendered: Rendered }[] = [];
  for (const group of groups.values()) {
    const { criteria, rendered } = group[0];
    for (const criterion of criteria) allCriteria.set(criterion.id, criterion);
    const control = group.some((item) => item.ref.startsWith("label:"));
    const entryHash = control ? null : hash(JSON.stringify([instructions, criteria, rendered]));
    if (entryHash && cache[entryHash]) for (const item of group) key.cached[item.ref] = entryHash;
    else open.push({ refs: group.map((item) => item.ref), hash: entryHash, criteria, rendered });
  }
  for (const request of requests) for (const criterion of definition.judged(request)) allCriteria.set(criterion.id, criterion);
  key.judge = hash(JSON.stringify([instructions, [...allCriteria.values()].sort((a, b) => a.id.localeCompare(b.id))]));

  const entries: JudgeEntry[] = shuffled(open, random).map((group, index) => {
    const entry = `e${String(index + 1).padStart(4, "0")}`;
    key.entries[entry] = group.refs;
    if (group.hash) key.hashes[entry] = group.hash;
    return { entry, criteria: group.criteria.map((criterion) => criterion.id), ...group.rendered };
  });
  const chunks: JudgeEntry[][] = [];
  for (const entry of entries) {
    const last = chunks.at(-1);
    if (last && last.length < BLOCK_ENTRIES && JSON.stringify([...last, entry]).length <= BLOCK_CHARS) last.push(entry);
    else chunks.push([entry]);
  }
  if (chunks.length > 1) {
    const blockOf = new Map(chunks.flatMap((chunk, index) => chunk.map((entry) => [entry.entry, index] as const)));
    const originals = shuffled(entries.filter((entry) => key.hashes[entry.entry]), random).slice(0, Math.max(MIN_DUPLICATES, Math.ceil(entries.length * DUPLICATE_SHARE)));
    originals.forEach((original, index) => {
      const entry = `e${String(entries.length + index + 1).padStart(4, "0")}`;
      key.duplicates[entry] = original.entry;
      chunks[(blockOf.get(original.entry)! + 1) % chunks.length].push({ ...original, entry });
    });
  }
  const blocks: JudgeBlock[] = chunks.map((chunk) => ({
    requestType: definition.id,
    criteria: [...new Set(chunk.flatMap((entry) => entry.criteria))].sort().map((id) => allCriteria.get(id)!),
    entries: shuffled(chunk, random),
  }));
  return { blocks, key };
}

/** `files` steht je Block für die gelesene Urteilsdatei oder `null`, wenn sie fehlt. */
export function readVerdicts(blocks: readonly JudgeBlock[], files: readonly unknown[], key: JudgeKey, cache: JudgeCache = {}) {
  const given = new Map<string, Verdict>();
  const missing: number[] = [];
  const problems: string[] = [];
  blocks.forEach((block, index) => {
    if (files[index] === null) { missing.push(index + 1); return; }
    const results = new Map(parseStrict(verdictsSchema, files[index], `Richterurteile Block ${index + 1}`).verdicts.map((verdict) => [verdict.entry, verdict]));
    for (const entry of block.entries) {
      const verdict = results.get(entry.entry);
      const expected = [...entry.criteria].sort().join(",");
      if (!verdict || Object.keys(verdict.results).sort().join(",") !== expected || Object.keys(verdict.sure).sort().join(",") !== expected) problems.push(`${entry.entry} braucht genau ${entry.criteria.join(", ")}`);
      else given.set(entry.entry, { results: verdict.results, sure: verdict.sure, ...(verdict.note ? { note: verdict.note } : {}) });
    }
  });
  if (missing.length) throw new Error(`Urteile fehlen für Block ${missing.join(", ")}. Für diese Blöcke den Richter erneut starten.`);
  if (problems.length) throw new Error(`Richterurteile unvollständig (${problems.length} Einträge), zum Beispiel: ${problems.slice(0, 3).join("; ")}.`);

  const verdicts: Verdicts = new Map();
  for (const [entry, refs] of Object.entries(key.entries)) for (const ref of refs) verdicts.set(ref, given.get(entry)!.results);
  for (const [ref, entryHash] of Object.entries(key.cached)) {
    if (!cache[entryHash]) throw new Error(`Das Urteil für ${ref} fehlt im Urteilscache. Den Ordner judge des Laufs löschen und „table“ erneut ausführen.`);
    verdicts.set(ref, cache[entryHash].results);
  }
  const fresh: JudgeCache = Object.fromEntries(Object.entries(key.hashes).map(([entry, entryHash]) => [entryHash, given.get(entry)!]));
  const pairs = Object.entries(key.duplicates).map(([duplicate, original]) => ({ original, a: given.get(original)!, b: given.get(duplicate)! }));
  const flipped = new Map<string, Set<string>>();
  const noise: Record<string, number> = {};
  // Je Einzelurteil gezählt: Ein Eintrag mit 20 Kernaussagen, von denen eine kippt, ist eine Abweichung unter 20.
  for (const id of [...new Set(pairs.flatMap(({ a }) => Object.keys(a.results).map(baseId)))].sort()) {
    const judgments = pairs.flatMap(({ original, a, b }) => Object.keys(a.results).filter((criterion) => baseId(criterion) === id).map((criterion) => ({ original, changed: a.results[criterion] !== b.results[criterion] })));
    flipped.set(id, new Set(judgments.filter(({ changed }) => changed).map(({ original }) => original)));
    noise[id] = Math.round(judgments.filter(({ changed }) => changed).length / judgments.length * 10000) / 10000;
  }
  return { verdicts, given, fresh, noise, flipped, duplicates: new Set(Object.keys(key.duplicates)), judged: Object.keys(key.hashes).length, cached: new Set(Object.values(key.cached)).size };
}

export type VerdictReading = ReturnType<typeof readVerdicts>;

/** Je Kriterium bis zu drei Einträge: zuerst gekippte Doppelurteile, dann die mit der geringsten Sicherheit unter 3. */
/** Kriterien je Kernaussage oder Widerspruch (`Q6:x`) zählen gemeinsam: Sicherheit ist die geringste, bestanden heißt alle. */
export function borderlineCases(blocks: readonly JudgeBlock[], reading: Pick<VerdictReading, "given" | "flipped" | "duplicates">) {
  const entries = new Map(blocks.flatMap((block) => block.entries).filter((entry) => !reading.duplicates.has(entry.entry)).map((entry) => [entry.entry, entry]));
  const criteria = [...new Set([...entries.values()].flatMap((entry) => entry.criteria.map(baseId)))].sort();
  return criteria.map((id) => {
    const flipped = reading.flipped.get(id) ?? new Set<string>();
    const ids = (entry: JudgeEntry) => entry.criteria.filter((criterion) => baseId(criterion) === id);
    const sure = (entry: JudgeEntry) => Math.min(...ids(entry).map((criterion) => reading.given.get(entry.entry)!.sure[criterion]));
    const candidates = [...entries.values()].filter((entry) => ids(entry).length && (flipped.has(entry.entry) || sure(entry) < 3));
    const rank = (entry: JudgeEntry) => (flipped.has(entry.entry) ? 0 : 1) * 10 + sure(entry);
    const picked = [...candidates].sort((a, b) => rank(a) - rank(b) || a.entry.localeCompare(b.entry)).slice(0, 3);
    return { id, cases: picked.map((entry) => ({ entry: entry.entry, flipped: flipped.has(entry.entry), note: reading.given.get(entry.entry)!.note, sure: sure(entry), passed: ids(entry).every((criterion) => reading.given.get(entry.entry)!.results[criterion]), eingabe: entry.eingabe, ausgabe: entry.ausgabe })) };
  }).filter(({ cases }) => cases.length);
}
