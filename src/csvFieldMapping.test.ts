import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeCsvFieldMapping,
  projectCsvFieldMapping,
  validateCsvFieldMapping,
  type CsvFieldMappingColumn,
} from "./csvFieldMapping.ts";

function targetByColumn(mapping: readonly CsvFieldMappingColumn[]) {
  return Object.fromEntries(mapping.map((entry) => [entry.columnId, entry]));
}

test("analysiert RFC4180-artige mehrzeilige und maskierte Felder", () => {
  const analysis = analyzeCsvFieldMapping([
    "Vorderseite,R\u00fcckseite,Tags,Kontext",
    '"Zeile 1',
    'Zeile 2","Antwort ""zitiert""","bio; test","Zusatz, mit Komma"',
  ].join("\r\n"));

  assert.deepEqual(analysis.errors, []);
  assert.equal(analysis.delimiter, ",");
  assert.deepEqual(analysis.columns.map((column) => column.name), ["Vorderseite", "R\u00fcckseite", "Tags", "Kontext"]);
  assert.equal(analysis.rows.length, 1);
  assert.equal(analysis.rows[0].sourceLine, 2);
  assert.deepEqual(analysis.sampleRows[0].values, [
    "Zeile 1\nZeile 2",
    'Antwort "zitiert"',
    "bio; test",
    "Zusatz, mit Komma",
  ]);

  const suggested = targetByColumn(analysis.suggestedMapping);
  assert.equal(suggested["column-0"].target, "front");
  assert.equal(suggested["column-1"].target, "back");
  assert.equal(suggested["column-2"].target, "tags");
  assert.deepEqual(suggested["column-3"], { columnId: "column-3", target: "field", fieldName: "Kontext" });

  const projected = projectCsvFieldMapping(analysis, analysis.suggestedMapping);
  assert.equal(projected.ok, true);
  assert.deepEqual(projected.records, [{
    sourceLine: 2,
    front: "Zeile 1\nZeile 2",
    back: 'Antwort "zitiert"',
    tags: ["bio", "test"],
    deck: null,
    guid: null,
    fields: [{ name: "Kontext", value: "Zusatz, mit Komma" }],
  }]);
});

test("belegt deutsche und englische Aliasnamen deterministisch vor", () => {
  const analysis = analyzeCsvFieldMapping(
    "question;Antwort;labels;Stapel;GUID;Hinweis;\nQ;A;bio;Medizin;note-1;Merksatz;ignorieren",
  );
  const suggested = analysis.suggestedMapping;

  assert.equal(analysis.delimiter, ";");
  assert.deepEqual(suggested, [
    { columnId: "column-0", target: "front" },
    { columnId: "column-1", target: "back" },
    { columnId: "column-2", target: "tags" },
    { columnId: "column-3", target: "deck" },
    { columnId: "column-4", target: "guid" },
    { columnId: "column-5", target: "field", fieldName: "Hinweis" },
    { columnId: "column-6", target: "ignore" },
  ]);

  const projected = projectCsvFieldMapping(analysis, suggested);
  assert.equal(projected.ok, true);
  assert.deepEqual(projected.records[0], {
    sourceLine: 2,
    front: "Q",
    back: "A",
    tags: ["bio"],
    deck: "Medizin",
    guid: "note-1",
    fields: [{ name: "Hinweis", value: "Merksatz" }],
  });
});

test("normalisiert BOM und tabellarische deutsche Umschriften", () => {
  const analysis = analyzeCsvFieldMapping("\uFEFFFrage\tRueckseite\tSchlagworte\nWas?\tDas.\tbio #zelle");

  assert.equal(analysis.delimiter, "\t");
  assert.deepEqual(analysis.columns.map((column) => column.name), ["Frage", "Rueckseite", "Schlagworte"]);
  assert.deepEqual(analysis.suggestedMapping.map((entry) => entry.target), ["front", "back", "tags"]);
  assert.deepEqual(projectCsvFieldMapping(analysis, analysis.suggestedMapping).records[0].tags, ["bio", "zelle"]);
});

test("meldet fehlende, doppelte und ung\u00fcltige Zuordnungen gemeinsam", () => {
  const analysis = analyzeCsvFieldMapping("Front,Back,Kontext,Notiz,Leer\nF,B,K,N,L");
  const mapping: CsvFieldMappingColumn[] = [
    { columnId: "column-0", target: "front" },
    { columnId: "column-0", target: "back" },
    { columnId: "column-1", target: "front" },
    { columnId: "column-2", target: "field", fieldName: "Zusatz" },
    { columnId: "column-3", target: "field", fieldName: "zus\u00e4tz" },
    { columnId: "column-99", target: "ignore" },
  ];
  const validation = validateCsvFieldMapping(analysis, mapping);
  const codes = validation.errors.map((error) => error.code);

  assert.equal(validation.ok, false);
  assert.ok(codes.includes("unknown_column"));
  assert.ok(codes.includes("duplicate_column_mapping"));
  assert.ok(codes.includes("duplicate_target"));
  assert.ok(codes.includes("missing_column_mapping"));
  assert.ok(codes.includes("duplicate_field_name"));
});

test("fordert genau eine Vorder- und R\u00fcckseite sowie benannte Zusatzfelder", () => {
  const analysis = analyzeCsvFieldMapping("A,B,C\n1,2,3");
  const validation = validateCsvFieldMapping(analysis, [
    { columnId: "column-0", target: "field", fieldName: "" },
    { columnId: "column-1", target: "ignore" },
    { columnId: "column-2", target: "ignore" },
  ]);

  assert.equal(validation.ok, false);
  assert.deepEqual(
    validation.errors.map((error) => error.code).sort(),
    ["missing_back_mapping", "missing_field_name", "missing_front_mapping"].sort(),
  );
});

test("verwirft Projektionen mit leeren Pflichtwerten oder doppelten GUIDs", () => {
  const analysis = analyzeCsvFieldMapping("Front,Back,GUID\nF1,B1,g-1\n,B2,g-1\nF3,,g-3");
  const projected = projectCsvFieldMapping(analysis, analysis.suggestedMapping);

  assert.equal(projected.ok, false);
  assert.deepEqual(projected.records, []);
  assert.deepEqual(
    projected.errors.map((error) => ({ code: error.code, sourceLine: error.sourceLine })),
    [
      { code: "missing_front_value", sourceLine: 3 },
      { code: "duplicate_guid", sourceLine: 3 },
      { code: "missing_back_value", sourceLine: 4 },
    ],
  );
});

test("meldet nicht geschlossene Anf\u00fchrungszeichen und fehlende Datenzeilen", () => {
  const malformed = analyzeCsvFieldMapping('Front,Back\n"offen,Antwort');
  assert.equal(malformed.errors.some((error) => error.code === "malformed_csv"), true);
  assert.equal(projectCsvFieldMapping(malformed, malformed.suggestedMapping).ok, false);

  const headerOnly = analyzeCsvFieldMapping("Front,Back");
  assert.equal(headerOnly.errors.some((error) => error.code === "missing_data_rows"), true);

  const empty = analyzeCsvFieldMapping("");
  assert.equal(empty.errors.some((error) => error.code === "empty_csv"), true);
});

test("erweitert schmale Kopfzeilen verlustfrei um benannte Zusatzspalten", () => {
  const analysis = analyzeCsvFieldMapping("Front,Back\nF,B,Kontextwert");

  assert.deepEqual(analysis.columns.map((column) => column.name), ["Front", "Back", "Spalte 3"]);
  assert.deepEqual(analysis.suggestedMapping[2], { columnId: "column-2", target: "ignore" });
  const mapping = analysis.suggestedMapping.map((entry) => entry.columnId === "column-2"
    ? { columnId: entry.columnId, target: "field" as const, fieldName: "Zusatz" }
    : entry);
  const projected = projectCsvFieldMapping(analysis, mapping);

  assert.equal(projected.ok, true);
  assert.deepEqual(projected.records[0].fields, [{ name: "Zusatz", value: "Kontextwert" }]);
});
