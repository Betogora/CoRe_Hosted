import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createManualNoteContent, createNote } from "./coreModel.ts";
import { defaultTextImportOptions, parseTextImport, planTextImport, readTextImportFile, type ExistingTextImportNote } from "./textImport.ts";

const plan = (text: string, fileName = "karten.txt", existing: ExistingTextImportNote[] = [], options: Partial<ReturnType<typeof defaultTextImportOptions>> = {}) => {
  const parsed = parseTextImport(text, fileName);
  return planTextImport(parsed, { ...defaultTextImportOptions(parsed), ...options }, existing);
};

test("header lines set separator, html, tags, columns, deck, form and tag column; others warn", () => {
  const parsed = parseTextImport([
    "#separator:Pipe",
    "#html:true",
    "#tags:anatomie herz",
    "#columns:Frage|Antwort|Schlagworte",
    "#deck:Anatomie",
    "#notetype:Basic (and reversed card)",
    "#tags column:3",
    "#guid column:4",
    "Herz|<b>Pumpe</b>|kreislauf",
  ].join("\n"), "karten.txt");

  assert.equal(parsed.separator, "|");
  assert.equal(parsed.html, true);
  assert.deepEqual(parsed.tags, ["anatomie", "herz"]);
  assert.deepEqual(parsed.columnNames, ["Frage", "Antwort", "Schlagworte"]);
  assert.equal(parsed.deckName, "Anatomie");
  assert.equal(parsed.kind, "basic-reversed");
  assert.equal(parsed.tagsColumn, 2);
  assert.deepEqual(parsed.rows, [{ line: 9, values: ["Herz", "<b>Pumpe</b>", "kreislauf"] }]);
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /#guid column:4/);
  assert.deepEqual(defaultTextImportOptions(parsed), { kind: "basic-reversed", columns: ["front", "back", "tags"], duplicates: "update" });

  const result = planTextImport(parsed, defaultTextImportOptions(parsed), []);
  assert.equal(result.cardCount, 2);
  assert.deepEqual(result.creates[0].tags, ["anatomie", "herz", "kreislauf"]);
  assert.equal(result.creates[0].fields[1].html, "<b>Pumpe</b>");
});

test("without a header the first separator splitting every row wins, also with uneven columns; a single character also counts", () => {
  assert.equal(parseTextImport("a;b\nc;d\n", "x.txt").separator, ";");
  assert.equal(parseTextImport("a,b;1\nc,d;2\n", "x.txt").separator, ";");
  assert.equal(parseTextImport("a,b\nc,d,e\n", "x.csv").separator, ",");
  assert.equal(parseTextImport("Haus;house\nBaum;tree;pflanze\n", "x.txt").separator, ";");
  assert.equal(parseTextImport("a\tb\nc\td\n", "x.csv").separator, "\t");
  assert.equal(parseTextImport("a;b\nc;d\n", "x.tsv").separator, "\t");
  assert.equal(parseTextImport("#separator:~\na~b\n", "x.txt").separator, "~");
  assert.equal(parseTextImport("#separator:Semicolon\na,b;c\n", "x.txt").rows[0].values.length, 2);
});

test("quoted fields keep separators, escaped quotes and line breaks; empty lines are skipped", () => {
  const parsed = parseTextImport("\uFEFF\"Was, genau?\";\"Zeile 1\nZeile \"\"2\"\"\"\r\n\r\nB;C\n", "x.csv");
  assert.equal(parsed.separator, ";");
  assert.deepEqual(parsed.rows, [
    { line: 1, values: ["Was, genau?", "Zeile 1\nZeile \"2\""] },
    { line: 4, values: ["B", "C"] },
  ]);
});

test("html off escapes text and turns line breaks into <br>; html on keeps markup", () => {
  const off = plan("<i>A</i>;B", "x.txt");
  assert.equal(off.creates.length, 1);
  assert.equal(off.creates[0].fields[0].html, "&lt;i&gt;A&lt;/i&gt;");
  assert.match(plan("\"<i>A</i>\";\"1\n2\"", "x.txt").creates[0].fields[1].html, /^1<br ?\/?>2$/);
  assert.equal(plan("#html:true\n<i>A</i>;B", "x.txt").creates[0].fields[0].html, "<i>A</i>");
});

test("invalid rows are listed with their line and reason and skipped", () => {
  const result = plan("Frage;Antwort\nNur Frage;\n;Nur Antwort\nCloze;ohne Lücke", "x.txt");
  assert.equal(result.creates.length, 2);
  assert.deepEqual(result.errors, [
    { line: 2, message: "Bitte eine Rückseite eingeben." },
    { line: 3, message: "Bitte eine Vorderseite eingeben." },
  ]);
  const cloze = plan("#notetype:Lückentext\n{{c1::Herz}} pumpt;Extra\nKeine Lücke;", "x.txt");
  assert.equal(cloze.creates.length, 1);
  assert.equal(cloze.cardCount, 1);
  assert.deepEqual(cloze.errors, [{ line: 3, message: "Bitte gültige Lücken wie {{c1::Begriff}} verwenden." }]);
});

test("files beyond the limits are refused with a German message", async () => {
  assert.throws(() => parseTextImport("", "x.txt"), /keine Zeilen/);
  assert.throws(() => parseTextImport(Array.from({ length: 50_001 }, (_, index) => `F${index};A`).join("\n"), "x.txt"), /mehr als 50\.000 Zeilen/);
  const large = Object.assign(new Blob(["x"]), { name: "gross.csv" });
  Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });
  await assert.rejects(readTextImportFile(large), /größer als 20 MB/);
});

test("duplicates of the same form in the target deck are updated, skipped or created anew", () => {
  const graph = createBasicNote("deck", "Herz", "alt", { tags: ["eigen"] });
  const reversed = createNote({ content: createManualNoteContent({ kind: "basic-reversed", front: "Lunge", back: "Atmung" }), deckId: "deck" });
  const existing = [graph.note, reversed.note];
  const file = "Herz;neu;kreislauf\nLunge;Gasaustausch;\nHerz;neu;kreislauf\nNiere;Filter;";
  const columns = ["front", "back", "tags"] as const;

  const updated = plan(file, "x.txt", existing, { columns: [...columns] });
  assert.equal(updated.updates.length, 1);
  assert.equal(updated.updates[0].noteId, graph.note.id);
  assert.equal(updated.updates[0].content.fields[1].html, "neu");
  assert.deepEqual(updated.updates[0].content.tags, ["eigen", "kreislauf"]);
  assert.deepEqual(updated.creates.map((content) => content.fields[0].html), ["Lunge", "Niere"]);
  assert.equal(updated.cardCount, 3);

  const skipped = plan(file, "x.txt", existing, { columns: [...columns], duplicates: "skip" });
  assert.equal(skipped.updates.length, 0);
  assert.equal(skipped.skippedCount, 2);
  assert.deepEqual(skipped.creates.map((content) => content.fields[0].html), ["Lunge", "Niere"]);

  const created = plan(file, "x.txt", existing, { columns: [...columns], duplicates: "create" });
  assert.equal(created.updates.length, 0);
  assert.deepEqual(created.creates.map((content) => content.fields[0].html), ["Herz", "Lunge", "Herz", "Niere"]);

  const unchanged = plan("Herz;alt", "x.txt", existing);
  assert.equal(unchanged.updates.length, 0);
  assert.equal(unchanged.skippedCount, 1);
});

test("comment lines are skipped anywhere; a cloze duplicate compares its markup, a basic one the whole first field", () => {
  const parsed = parseTextImport("a;b\n#Kapitel 2\nc;d\n", "x.txt");
  assert.deepEqual(parsed.rows.map((row) => [row.line, row.values[0]]), [[1, "a"], [3, "c"]]);

  const clozes = parseTextImport("{{c1::A}} und B;Extra\n", "x.txt");
  const existing = planTextImport(parseTextImport("{{c1::A}} und {{c2::B}};Extra\n", "y.txt"), { ...defaultTextImportOptions(clozes), kind: "cloze" }, []).creates[0];
  const plan = planTextImport(clozes, { ...defaultTextImportOptions(clozes), kind: "cloze" }, [{ id: "n1", content: existing, source: "manual" }]);
  assert.deepEqual([plan.creates.length, plan.updates.length], [1, 0], "another deletion set is another content, so no card loses its study state");

  const long = "x".repeat(300);
  const basics = parseTextImport(`${long}1;a\n${long}2;b\n`, "x.txt");
  assert.equal(planTextImport(basics, defaultTextImportOptions(basics), []).creates.length, 2, "texts that only differ after 240 characters stay apart");
});
