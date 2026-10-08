import { spawnSync } from "node:child_process";
import { openAsBlob, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readAnkiPackage } from "../src/apkgImportInternal.ts";
import { translateAnkiPackage, type NoteSource, type NoteTypeSource } from "../src/apkgNoteTranslation.ts";
import { createCloudStateRows } from "../src/cloudRepository.ts";
import { createCoreDeck, createManualNoteContent, createNote } from "../src/coreModel.ts";
import type { Deck, Note } from "../src/coreTypes.ts";
import { localSupabaseDatabaseContainer } from "./localE2EEnvironment.ts";

// Measures how many bytes 1,000 contents occupy in Postgres, on the sync wire and
// in the browser replica. The APKG comes from scripts/create_footprint_apkg.py and
// runs through the app's note translation; the manual scenarios reuse the same text.

const NOTES_PER_KIND = 1_000;
const USER_ID = "00000000-0000-0000-0000-00000000f00d";
const apkgPath = resolve(process.argv[2] ?? "test-results/baseline/footprint.apkg");
const reportPath = resolve("test-results/baseline/content-footprint.json");
const ORGANS = ["Herz", "Niere", "Leber", "Lunge", "Milz", "Pankreas", "Schilddrüse", "Nebenniere", "Magen", "Dünndarm"];
const TOPICS = ["Physiologie", "Pathologie", "Pharmakologie", "Anatomie", "Diagnostik"];
const KINDS = ["basic", "reverse", "cloze"] as const;
type Kind = typeof KINDS[number];
type Scenario = { key: string; origin: "apkg" | "manual"; kind: Kind; decks: Deck[]; notes: Note[]; noteTypeSources: NoteTypeSource[]; noteSources: NoteSource[] };

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

function manualScenario(kind: Kind): Scenario {
  const deck = createCoreDeck({ id: `footprint-manual-${kind}`, name: `Manuell ${kind}`, source: "manual" });
  const notes: Note[] = [];
  for (let index = 0; index < NOTES_PER_KIND; index += 1) {
    const { textWithClozes, extra } = clozeFields(index);
    const { front, back } = kind === "cloze" ? { front: textWithClozes, back: extra } : basicFields(index);
    const graph = createNote({ deckId: deck.id, content: createManualNoteContent({ kind: kind === "cloze" ? "cloze" : kind === "reverse" ? "basic-reversed" : "basic", front, back }) });
    notes.push(graph.note);
    deck.cards.push(...graph.cards);
  }
  return { key: `manual-${kind}`, origin: "manual", kind, decks: [deck], notes, noteTypeSources: [], noteSources: [] };
}

/** The footprint APKG through the app's translation; each scenario keeps only its deck's notes and sources. */
async function importedScenarios(): Promise<Scenario[]> {
  const file = Object.assign(await openAsBlob(apkgPath), { name: basename(apkgPath) });
  const graph = translateAnkiPackage(await readAnkiPackage(file));
  const kindForDeck: Record<string, Kind> = { "Basic": "basic", "Basic und umgekehrt": "reverse", "Lückentext": "cloze" };
  return KINDS.map((kind) => {
    const importDecks = graph.decks.filter((deck) => kindForDeck[deck.name] === kind);
    if (importDecks.length !== 1) throw new Error(`Importstapel für ${kind} wurde nicht eindeutig gefunden.`);
    const deck = createCoreDeck({ id: importDecks[0].id, name: importDecks[0].name, source: "anki-apkg", ankiDeckId: importDecks[0].ankiDeckId, cards: graph.cards.filter((card) => card.deckId === importDecks[0].id) });
    const noteIds = new Set(deck.cards.map((card) => card.noteId));
    const notes = graph.notes.filter((note) => noteIds.has(note.id));
    const sourceIds = new Set(notes.map((note) => note.noteTypeSourceId));
    return {
      key: `apkg-${kind}`,
      origin: "apkg" as const,
      kind,
      decks: [deck],
      notes,
      noteTypeSources: graph.noteTypeSources.filter((source) => sourceIds.has(source.id)),
      noteSources: graph.noteSources.filter((source) => noteIds.has(source.noteId)),
    };
  });
}

function utf8Bytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function databaseContainer() {
  const docker = process.platform === "win32" ? "docker.exe" : "docker";
  const container = localSupabaseDatabaseContainer(readFileSync(resolve("supabase/config.toml"), "utf8"));
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

const MEASURED_TABLES = ["notes", "cards", "card_catalog", "note_sources", "note_type_sources"] as const;
const NOTE_DECK = "(select min(c.deck_id) from public.cards c where c.user_id = t.user_id and c.note_id = t.id)";
const DECK_EXPRESSION: Record<typeof MEASURED_TABLES[number], string> = {
  notes: NOTE_DECK,
  cards: "deck_id",
  card_catalog: "deck_id",
  note_sources: NOTE_DECK,
  note_type_sources: "(select min(c.deck_id) from public.notes n join public.cards c on c.user_id = n.user_id and c.note_id = n.id where n.user_id = t.user_id and n.note_type_source_id = t.id)",
};

/** Writes every scenario in one rolled-back transaction and reads row sizes per scenario deck. */
function measureDatabase(scenarios: Scenario[]) {
  const rows = createCloudStateRows({
    decks: scenarios.flatMap((scenario) => scenario.decks),
    notes: scenarios.flatMap((scenario) => scenario.notes),
    noteTypeSources: scenarios.flatMap((scenario) => scenario.noteTypeSources),
    noteSources: scenarios.flatMap((scenario) => scenario.noteSources),
  }, USER_ID);
  const perDeck = (table: typeof MEASURED_TABLES[number]) => `'${table}', (select coalesce(json_object_agg(deck_id, value), '{}'::json) from (
        select ${DECK_EXPRESSION[table]} as deck_id, json_build_object('rows', count(*), 'storedBytes', sum(pg_column_size(t.*)), 'wireBytes', sum(octet_length(to_jsonb(t)::text))) as value
        from public.${table} t where user_id = '${USER_ID}' group by 1) per_deck)`;
  const sql = [
    "begin;",
    `insert into auth.users (id, email) values ('${USER_ID}', 'footprint@core.local');`,
    insertSql("decks", rows.decks),
    insertSql("note_type_sources", rows.note_type_sources),
    insertSql("notes", rows.notes),
    insertSql("note_sources", rows.note_sources),
    insertSql("cards", rows.cards),
    `\\pset tuples_only on`,
    `\\pset format unaligned`,
    `select json_build_object(${MEASURED_TABLES.map(perDeck).join(", ")});`,
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

const scenarios: Scenario[] = [...await importedScenarios(), ...KINDS.map(manualScenario)];
const database = measureDatabase(scenarios);

const results = scenarios.map((scenario) => {
  const cards = scenario.decks.flatMap((deck) => deck.cards);
  const deckId = scenario.decks[0].id;
  const table = (name: typeof MEASURED_TABLES[number]) => database[name][deckId] ?? { rows: 0, storedBytes: 0, wireBytes: 0 };
  const stored = Object.fromEntries(MEASURED_TABLES.map((name) => [name, Number(table(name).storedBytes)])) as Record<typeof MEASURED_TABLES[number], number>;
  const syncWireBytes = (["notes", "cards", "note_sources", "note_type_sources"] as const).reduce((sum, name) => sum + Number(table(name).wireBytes), 0);
  // Browser replica: content once per note plus a card body per card (study state and variants).
  const replicaBytes = scenario.notes.reduce((sum, note) => sum + utf8Bytes(note), 0) + cards.reduce((sum, card) => sum + utf8Bytes(card), 0);
  return {
    scenario: scenario.key,
    origin: scenario.origin,
    kind: scenario.kind,
    notes: scenario.notes.length,
    cards: cards.length,
    postgres: {
      noteRowBytes: stored.notes,
      cardRowBytes: stored.cards,
      catalogRowBytes: stored.card_catalog,
      sourceRowBytes: stored.note_sources + stored.note_type_sources,
      totalBytes: Object.values(stored).reduce((sum, value) => sum + value, 0),
    },
    syncWireBytes,
    browserReplica: {
      bodyBytes: replicaBytes,
      learningWindow50CardsBytes: Math.round(replicaBytes / cards.length * 50),
    },
  };
});

const report = {
  measuredAt: new Date().toISOString(),
  method: "Postgres: pg_column_size je Zeile in notes, cards, card_catalog, note_sources und note_type_sources; Sync: octet_length(to_jsonb(Zeile)) ohne Katalogprojektion; Browser: UTF-8-JSON der Inhalte und Kartenkörper.",
  fixture: basename(apkgPath),
  results,
};
await mkdir(resolve("test-results/baseline"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
