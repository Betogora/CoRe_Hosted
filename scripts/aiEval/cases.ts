import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openAsBlob, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as v from "valibot";
import { readAnkiPackage } from "../../src/apkgImportInternal.ts";
import { translateAnkiPackage } from "../../src/apkgNoteTranslation.ts";
import type { AiCardVariantSource } from "../../src/aiCardVariantContract.ts";
import { cardVariantSource } from "../../src/coreVariantService.ts";
import type { EvalDefinition } from "./definitions.ts";
import { parseStrict } from "./ledger.ts";

/** Wird bei jedem Aufruf gelesen, damit auch `CORE_AI_EVAL_DIR` aus `.env.local` greift, das die CLI nach den Imports lädt. */
export const outputRoot = () => (process.env.CORE_AI_EVAL_DIR ?? "output/ai-eval").replace(/\\/g, "/");
export const handCasesFile = (id: string) => `fixtures/ai-eval/${id}.cases.json`;
export const corpusCasesFile = (id: string) => `${outputRoot()}/${id}/corpus.cases.json`;

export const SPLITS = ["train", "dev", "holdout"] as const;
export type Split = (typeof SPLITS)[number];
const SHARES: Record<Split, number> = { train: 0.35, dev: 0.4, holdout: 0.25 };
/** `fundus` sind Karten aus den eigenen Stapeln im Korpus. */
export const SUBJECTS = ["medizin", "naturwissenschaft", "technik-it", "mathematik", "sprachen", "recht-wirtschaft", "geschichte-geografie", "fundus"] as const;
const CORPUS_CARDS_PER_DECK = 3;
const slug = v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/));
const casesSchema = v.strictObject({
  cases: v.array(v.strictObject({
    id: slug,
    category: slug,
    subject: v.picklist(SUBJECTS),
    difficulty: v.optional(v.picklist(["leicht", "mittel", "schwer"])),
    /** Gesicherte Fachaussagen zum Fall; der Richter sieht sie als `referenz`. */
    reference: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
    split: v.optional(v.picklist(SPLITS)),
    /** Fälle derselben Gruppe (eine Karte, Notiz oder Quelle) landen immer im selben Teil. */
    group: v.optional(slug),
    /** Falle für ein kritisches Kriterium; der Bericht zählt sie getrennt. */
    trap: v.optional(v.literal(true)),
    /** Das Modell soll den Fall mit dem Ablehnungscode der Definition als ungeeignet melden. */
    refuse: v.optional(v.literal(true)),
    request: v.unknown(),
  })),
});

export type DraftCase = v.InferOutput<typeof casesSchema>["cases"][number];
export type EvalCase = DraftCase & { split: Split };

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

export function readCases(definition: EvalDefinition, file: string): DraftCase[] {
  if (!existsSync(file)) return [];
  return parseStrict(casesSchema, readJson(file), file).cases.map((entry) => {
    const request = definition.parseRequest(entry.request);
    if (!request) throw new Error(`${file}: Fall ${entry.id} besteht den Anfragevertrag der Route nicht.`);
    if (entry.refuse && !definition.refusal) throw new Error(`${file}: Fall ${entry.id} erwartet eine Ablehnung, die ${definition.id} nicht kennt.`);
    return { ...entry, request };
  });
}

/**
 * Je Kategorie geht jede Gruppe ohne Teil in den Teil, dem nach seinem Anteil in Kategorie und Fach zusammen die meisten
 * Fälle fehlen; bei Gleichstand zuerst `train` vor `dev` vor `holdout`. Eine Gruppe zählt zu Kategorie und Fach ihres
 * ersten Falls, und vorhandene Zuordnungen bleiben stehen.
 */
export function assignSplits(cases: readonly DraftCase[], random: () => number): EvalCase[] {
  const groups = new Map<string, DraftCase[]>();
  for (const entry of cases) groups.set(entry.group ?? entry.id, [...(groups.get(entry.group ?? entry.id) ?? []), entry]);
  const fixed = new Map<string, Split>();
  for (const [key, members] of groups) {
    const splits = new Set(members.flatMap((entry) => entry.split ?? []));
    if (splits.size > 1) throw new Error(`Gruppe ${key} liegt in mehreren Teilen: ${[...splits].join(", ")}.`);
    if (splits.size) fixed.set(key, [...splits][0]);
  }
  const assigned = new Map(fixed);
  const subjects = new Map<string, Record<Split, number>>();
  const tally = (key: string) => {
    const subject = groups.get(key)![0].subject;
    if (!subjects.has(subject)) subjects.set(subject, { train: 0, dev: 0, holdout: 0 });
    return subjects.get(subject)!;
  };
  for (const [key, split] of fixed) tally(key)[split] += groups.get(key)!.length;
  const missing = (counts: Record<Split, number>, split: Split, size: number) => SHARES[split] * (counts.train + counts.dev + counts.holdout + size) - counts[split];
  for (const category of [...new Set(cases.map((entry) => entry.category))].sort()) {
    const keys = [...groups.keys()].filter((key) => groups.get(key)![0].category === category);
    const counts: Record<Split, number> = { train: 0, dev: 0, holdout: 0 };
    for (const key of keys) if (fixed.has(key)) counts[fixed.get(key)!] += groups.get(key)!.length;
    for (const key of shuffled(keys.filter((candidate) => !fixed.has(candidate)), random)) {
      const size = groups.get(key)!.length;
      const subject = tally(key);
      const deficit = (split: Split) => Math.round((missing(counts, split, size) + missing(subject, split, size)) * 1000);
      const largest = Math.max(...SPLITS.map(deficit));
      const split = SPLITS.find((candidate) => deficit(candidate) === largest)!;
      counts[split] += size;
      subject[split] += size;
      assigned.set(key, split);
    }
  }
  return cases.map((entry) => ({ ...entry, split: assigned.get(entry.group ?? entry.id)! }));
}

export function loadCases(definition: EvalDefinition): EvalCase[] {
  const cases = [handCasesFile(definition.id), corpusCasesFile(definition.id)].flatMap((file) => readCases(definition, file));
  const duplicate = cases.find((entry, index) => cases.findIndex((other) => other.id === entry.id) !== index);
  if (duplicate) throw new Error(`Fall ${duplicate.id} kommt mehrfach vor.`);
  const open = cases.filter((entry) => !entry.split).length;
  if (open) throw new Error(`${open} Fälle ohne Aufteilung. Zuerst „npm run ai-eval -- cases ${definition.id}“ ausführen.`);
  return cases as EvalCase[];
}

/**
 * Echte Stapel enthalten gelöschte, Platzhalter- und ID-Karten. Sie sind kein Lerninhalt; eine Ablehnung wäre dort richtig
 * und würde als Fehler des Modells zählen.
 */
export const placeholderCard = ({ front, back }: { front: string; back: string }) =>
  /!DELETE|PLATZHALTER|Inhalt gelöscht/i.test(`${front} ${back}`) || /^\s*\d{10,}\s*$/.test(front) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(back.trim());

export async function sampleCorpus(definition: EvalDefinition, count: number, seed: number, directory = "fixtures/apkg/corpus"): Promise<DraftCase[]> {
  const files = existsSync(directory) ? readdirSync(directory).filter((name) => /\.(?:apkg|colpkg)$/i.test(name)).sort() : [];
  if (!files.length) throw new Error(`Kein Korpus in ${directory}.`);
  const hash = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 10);
  const cards = new Map<string, { source: AiCardVariantSource; note: string; deck: string }>();
  for (const name of files) {
    const graph = await translateAnkiPackage(await readAnkiPackage(Object.assign(await openAsBlob(path.join(directory, name)), { name })));
    const notes = new Map(graph.notes.map((note) => [note.id, note]));
    for (const card of graph.cards) {
      const note = notes.get(card.noteId);
      const source = note && cardVariantSource(note, card);
      const html = note?.content.fields.map((field) => field.html).join("\u0000") ?? "";
      if (source && !/<img|\[sound:/i.test(html) && !placeholderCard(source)) cards.set(hash(`${source.front}\u0000${source.back}`), { source, note: hash(`${name}\u0000${html}`), deck: `${name}\u0000${card.deckId}` });
    }
  }
  const keys = shuffled([...cards.keys()].sort(), seededRandom(seed));
  const cases: DraftCase[] = [];
  const perDeck = new Map<string, number>();
  for (const key of keys) {
    const { source, note, deck } = cards.get(key)!;
    if ((perDeck.get(deck) ?? 0) >= CORPUS_CARDS_PER_DECK) continue;
    const entries = (definition.fromCorpus?.(source) ?? []).filter((entry) => definition.parseRequest(entry.request));
    if (!entries.length) continue;
    if (cases.length + entries.length > count) break;
    perDeck.set(deck, (perDeck.get(deck) ?? 0) + 1);
    cases.push(...entries.map((entry) => ({ id: `corpus-${key}${entry.suffix}`, category: entry.category, subject: "fundus" as const, group: `note-${note}`, request: entry.request as unknown })));
  }
  return cases;
}
