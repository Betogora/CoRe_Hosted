import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { commitApkgImport, parseApkgToNormalizedImport, prepareApkgWorkerResult } from "../src/apkgImportInternal.ts";
import { createCloudStateRows } from "../src/cloudRepository.ts";
import { createCoreDeck, createLearningItemsFromEditorValue } from "../src/coreModel.ts";
import { normalizeContentEntities } from "../src/coreRepository.ts";
import type { Deck, NoteTypeDefinitionV1 } from "../src/coreTypes.ts";

// Measures how many bytes 1,000 learning contents occupy in Postgres, on the
// sync wire and in the browser replica. The APKG comes from
// scripts/create_footprint_apkg.py; the manual scenarios reuse the same text.

const NOTES_PER_KIND = 1_000;
const USER_ID = "00000000-0000-0000-0000-00000000f00d";
const apkgPath = resolve(process.argv[2] ?? "test-results/baseline/footprint.apkg");
const reportPath = resolve("test-results/baseline/content-footprint.json");
const ORGANS = ["Herz", "Niere", "Leber", "Lunge", "Milz", "Pankreas", "Schilddrüse", "Nebenniere", "Magen", "Dünndarm"];
const TOPICS = ["Physiologie", "Pathologie", "Pharmakologie", "Anatomie", "Diagnostik"];
const KINDS = ["basic", "reverse", "cloze"] as const;
type Kind = typeof KINDS[number];
type Scenario = { key: string; origin: "apkg" | "manual"; kind: Kind; decks: Deck[] };

function basicFields(index: number) {
  const organ = ORGANS[index % ORGANS.length];
  const topic = TOPICS[index % TOPICS.length];
  return {
    front: `Welche Aufgabe erfüllt das Organ <b>${organ}</b> im Kontext ${topic} (Frage ${index})?`,
    back: `Das Organ ${organ} reguliert im Kontext ${topic} zentrale Prozesse des Stoffwechsels.<br><ul><li>Merkmal A zu Frage ${index}</li><li>Merkmal B mit klinischer Relevanz</li><li>Typische Störung: Funktionseinschränkung mit Laborveränderungen</li></ul>`,
  };
}

function clozeFields(index: number) {
  const organ = ORGANS[index % ORGANS.length];
  const topic = TOPICS[index % TOPICS.length];
  return {
    textWithClozes: `Im Bereich ${topic} gilt für das Organ ${organ} (Aussage ${index}): Die wichtigste Funktion ist {{c1::die Regulation des Volumenhaushalts}}, gesteuert über {{c2::hormonelle Rückkopplung::Mechanismus}}. Bei Ausfall zeigt sich klinisch {{c3::eine Dekompensation}} mit erhöhtem {{c4::Kreatinin}} im Labor.`,
    extra: `Merke zu Aussage ${index}: Die Kombination aus Laborbefund und Klinik ist für ${organ} wegweisend. Differenzialdiagnosen im Kontext ${topic} sorgfältig abgrenzen.<br><i>Quelle: CoRe-Lehrtext ${index % 50}</i>`,
  };
}

function manualDeck(kind: Kind): Deck {
  const deck = createCoreDeck({ id: `footprint-manual-${kind}`, name: `Manuell ${kind}`, source: "manual" });
  for (let index = 0; index < NOTES_PER_KIND; index += 1) {
    const editorValue = kind === "cloze"
      ? { cardType: "cloze", ...clozeFields(index), tags: [] }
      : { cardType: kind === "reverse" ? "basic-reversed" : "basic", ...basicFields(index), tags: [] };
    deck.cards.push(...createLearningItemsFromEditorValue(deck.id, editorValue));
  }
  return deck;
}

async function importedScenarios(): Promise<{ scenarios: Scenario[]; definitions: NoteTypeDefinitionV1[] }> {
  const bytes = await readFile(apkgPath);
  const file = { name: basename(apkgPath), size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const committed = commitApkgImport(prepareApkgWorkerResult(await parseApkgToNormalizedImport(file)));
  const kindForDeck: Record<string, Kind> = { "Basic": "basic", "Basic und umgekehrt": "reverse", "Lückentext": "cloze" };
  const scenarios = KINDS.map((kind) => ({
    key: `apkg-${kind}`,
    origin: "apkg" as const,
    kind,
    decks: committed.decks.filter((deck: Deck) => kindForDeck[deck.name] === kind),
  }));
  for (const scenario of scenarios) {
    if (scenario.decks.length !== 1) throw new Error(`Importstapel für ${scenario.kind} wurde nicht eindeutig gefunden.`);
  }
  return { scenarios, definitions: committed.commitGraph.noteTypeDefinitions };
}

function utf8Bytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function databaseContainer() {
  const docker = process.platform === "win32" ? "docker.exe" : "docker";
  const container = `supabase_db_${basename(process.cwd())}`;
  const lookup = spawnSync(docker, ["ps", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"], { encoding: "utf8" });
  if (lookup.status !== 0 || lookup.stdout.trim() !== container) {
    throw new Error(`Die lokale Supabase-Datenbank ${container} läuft nicht. Starte sie mit „npx supabase start“.`);
  }
  return { docker, container };
}

function insertSql(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]).join(", ");
  return `insert into public.${table} (${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table}, $core_json$${JSON.stringify(rows)}$core_json$::jsonb);\n`;
}

function measureDatabase(decks: Deck[], definitions: NoteTypeDefinitionV1[]) {
  const rows = createCloudStateRows({ decks, noteTypeDefinitions: definitions }, USER_ID);
  const sql = [
    "begin;",
    `insert into auth.users (id, email) values ('${USER_ID}', 'footprint@core.local');`,
    insertSql("decks", rows.decks),
    insertSql("note_type_definitions", rows.note_type_definitions),
    insertSql("cards", rows.cards),
    `\\pset tuples_only on`,
    `\\pset format unaligned`,
    `select json_build_object(
      'cards', (select coalesce(json_object_agg(deck_id, value), '{}'::json) from (
        select deck_id, json_build_object('rows', count(*), 'storedBytes', sum(pg_column_size(c.*)), 'wireBytes', sum(octet_length(to_jsonb(c)::text)),
          'definitionIds', array_agg(distinct note_type_definition_id)) as value
        from public.cards c where user_id = '${USER_ID}' group by deck_id) per_deck),
      'catalog', (select coalesce(json_object_agg(deck_id, value), '{}'::json) from (
        select deck_id, json_build_object('rows', count(*), 'storedBytes', sum(pg_column_size(k.*))) as value
        from public.card_catalog k where user_id = '${USER_ID}' group by deck_id) per_deck),
      'definitions', (select coalesce(json_object_agg(id, json_build_object('storedBytes', pg_column_size(d.*), 'wireBytes', octet_length(to_jsonb(d)::text))), '{}'::json)
        from public.note_type_definitions d where user_id = '${USER_ID}')
    );`,
    "rollback;",
  ].join("\n");
  const { docker, container } = databaseContainer();
  const execution = spawnSync(docker, ["exec", "-i", container, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (execution.status !== 0) throw new Error(`Datenbankmessung fehlgeschlagen:\n${execution.stderr || execution.stdout}`);
  const jsonLine = execution.stdout.split(/\r?\n/).find((line) => line.trim().startsWith("{"));
  if (!jsonLine) throw new Error(`Datenbankmessung lieferte kein Ergebnis:\n${execution.stdout}`);
  return JSON.parse(jsonLine);
}

const imported = await importedScenarios();
const manualDecks = KINDS.map(manualDeck);
const manual = normalizeContentEntities(manualDecks, []);
const scenarios: Scenario[] = [
  ...imported.scenarios,
  ...KINDS.map((kind, index) => ({ key: `manual-${kind}`, origin: "manual" as const, kind, decks: [manual.decks[index] as Deck] })),
];
const definitions = [...imported.definitions, ...manual.definitions];
const database = measureDatabase(scenarios.flatMap((scenario) => scenario.decks), definitions);
const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

const results = scenarios.map((scenario) => {
  const cards = scenario.decks.flatMap((deck) => deck.cards);
  const deckIds = scenario.decks.map((deck) => deck.id);
  const cardRows = deckIds.map((id) => database.cards[id]).filter(Boolean);
  const catalogRows = deckIds.map((id) => database.catalog[id]).filter(Boolean);
  const definitionIds = [...new Set(cardRows.flatMap((row: any) => row.definitionIds as string[]))];
  const sum = (values: number[]) => values.reduce((total, value) => total + Number(value ?? 0), 0);
  const cardsStored = sum(cardRows.map((row: any) => row.storedBytes));
  const catalogStored = sum(catalogRows.map((row: any) => row.storedBytes));
  const definitionsStored = sum(definitionIds.map((id) => database.definitions[id]?.storedBytes ?? 0));
  const cardsWire = sum(cardRows.map((row: any) => row.wireBytes));
  const definitionsWire = sum(definitionIds.map((id) => database.definitions[id]?.wireBytes ?? 0));
  const replicaCardBytes = sum(cards.map(utf8Bytes));
  const replicaDefinitionBytes = sum(definitionIds.map((id) => utf8Bytes(definitionById.get(id) ?? null)));
  return {
    scenario: scenario.key,
    origin: scenario.origin,
    kind: scenario.kind,
    notes: NOTES_PER_KIND,
    cards: cards.length,
    noteTypeDefinitions: definitionIds.length,
    postgres: {
      cardRowBytes: cardsStored,
      catalogRowBytes: catalogStored,
      definitionRowBytes: definitionsStored,
      totalBytes: cardsStored + catalogStored + definitionsStored,
    },
    syncWireBytes: cardsWire + definitionsWire,
    browserReplica: {
      cardBodyBytes: replicaCardBytes,
      definitionBytes: replicaDefinitionBytes,
      learningWindow50CardsBytes: Math.round(replicaCardBytes / cards.length * 50),
    },
  };
});

const report = {
  measuredAt: new Date().toISOString(),
  method: "Postgres: pg_column_size je Zeile; Sync: octet_length(to_jsonb(Zeile)); Browser: UTF-8-JSON der Kartenkörper und Definitionen.",
  fixture: basename(apkgPath),
  results,
};
await mkdir(resolve("test-results/baseline"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
