import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openAsBlob, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as v from "valibot";
import { readAnkiPackage } from "../../src/apkgImportInternal.ts";
import { translateAnkiPackage } from "../../src/apkgNoteTranslation.ts";
import { cardVariantSource } from "../../src/coreVariantService.ts";
import type { EvalDefinition } from "./definitions.ts";
import { parseStrict } from "./ledger.ts";

export const OUTPUT_ROOT = "output/ai-eval";
export const handCasesFile = (id: string) => `fixtures/ai-eval/${id}.cases.json`;
export const corpusCasesFile = (id: string) => `${OUTPUT_ROOT}/${id}/corpus.cases.json`;

const split = v.picklist(["train", "test"]);
const casesSchema = v.strictObject({
  cases: v.array(v.strictObject({
    id: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
    category: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
    split: v.optional(split),
    request: v.unknown(),
  })),
});

export type DraftCase = v.InferOutput<typeof casesSchema>["cases"][number];
export type EvalCase = DraftCase & { split: "train" | "test" };

/** Fester Zufall: derselbe Startwert liefert dieselbe Folge (mulberry32). */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<Item>(items: readonly Item[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Liest eine Falldatei und prüft jede Anfrage mit dem Vertrag der Route. */
export function readCases(definition: EvalDefinition, file: string): DraftCase[] {
  if (!existsSync(file)) return [];
  return parseStrict(casesSchema, readJson(file), file).cases.map((entry) => {
    const request = definition.parseRequest(entry.request);
    if (!request) throw new Error(`${file}: Fall ${entry.id} besteht den Anfragevertrag der Route nicht.`);
    return { ...entry, request };
  });
}

/** Teilt Fälle ohne Aufteilung je Kategorie hälftig zu; bestehende Zuordnungen bleiben unverändert. */
export function assignSplits(cases: readonly DraftCase[], random: () => number): EvalCase[] {
  const assigned = new Map<string, "train" | "test">();
  for (const category of [...new Set(cases.map((entry) => entry.category))].sort()) {
    const members = cases.filter((entry) => entry.category === category);
    let test = members.filter((entry) => entry.split === "test").length;
    let train = members.filter((entry) => entry.split === "train").length;
    for (const entry of shuffled(members.filter((candidate) => !candidate.split), random)) {
      const next = test < train || (test === train && random() < 0.5) ? "test" : "train";
      if (next === "test") test++; else train++;
      assigned.set(entry.id, next);
    }
  }
  return cases.map((entry) => ({ ...entry, split: entry.split ?? assigned.get(entry.id)! }));
}

/** Alle Fälle eines Anfragetyps: versionierte Prüfkarten und lokale Korpusfälle, jede Kennung einmal und mit Aufteilung. */
export function loadCases(definition: EvalDefinition): EvalCase[] {
  const cases = [handCasesFile(definition.id), corpusCasesFile(definition.id)].flatMap((file) => readCases(definition, file));
  const duplicate = cases.find((entry, index) => cases.findIndex((other) => other.id === entry.id) !== index);
  if (duplicate) throw new Error(`Fall ${duplicate.id} kommt mehrfach vor.`);
  const open = cases.filter((entry) => !entry.split).length;
  if (open) throw new Error(`${open} Fälle ohne Aufteilung. Zuerst „npm run ai-eval -- cases ${definition.id}“ ausführen.`);
  return cases as EvalCase[];
}

/** Zieht Karten mit Frage und Antwort aus dem lokalen APKG-Korpus; derselbe Startwert liefert dieselbe Auswahl. */
export async function sampleCorpus(definition: EvalDefinition, count: number, seed: number, directory = "fixtures/apkg/corpus"): Promise<DraftCase[]> {
  const files = existsSync(directory) ? readdirSync(directory).filter((name) => /\.(?:apkg|colpkg)$/i.test(name)).sort() : [];
  if (!files.length) throw new Error(`Kein Korpus in ${directory}.`);
  const cards = new Map<string, { front: string; back: string }>();
  for (const name of files) {
    const graph = await translateAnkiPackage(await readAnkiPackage(Object.assign(await openAsBlob(path.join(directory, name)), { name })));
    const notes = new Map(graph.notes.map((note) => [note.id, note]));
    for (const card of graph.cards) {
      const note = notes.get(card.noteId);
      const source = note && cardVariantSource(note, card);
      if (source && !/<img|\[sound:/i.test(note.content.fields.map((field) => field.html).join(""))) cards.set(createHash("sha1").update(`${source.front}\u0000${source.back}`).digest("hex").slice(0, 10), source);
    }
  }
  const keys = shuffled([...cards.keys()].sort(), seededRandom(seed));
  const cases: DraftCase[] = [];
  for (const key of keys) {
    const entries = definition.fromCorpus(cards.get(key)!).filter((entry) => definition.parseRequest(entry.request));
    if (cases.length + entries.length > count) break;
    cases.push(...entries.map((entry) => ({ id: `corpus-${key}${entry.suffix}`, category: entry.category, request: entry.request as unknown })));
  }
  return cases;
}
