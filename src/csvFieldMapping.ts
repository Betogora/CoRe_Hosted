export const CSV_FIELD_MAPPING_TARGETS = ["field", "front", "back", "tags", "deck", "guid", "ignore"] as const;

export type CsvFieldMappingTarget = (typeof CSV_FIELD_MAPPING_TARGETS)[number];
export type CsvDelimiter = "," | ";" | "\t";

export interface CsvFieldMappingColumn {
  columnId: string;
  target: CsvFieldMappingTarget;
  fieldName?: string;
}

export interface CsvFieldMappingHeader {
  columnId: string;
  index: number;
  name: string;
  sourceName: string;
}

export interface CsvFieldMappingRow {
  sourceLine: number;
  values: string[];
}

export type CsvFieldMappingIssueCode =
  | "empty_csv"
  | "malformed_csv"
  | "missing_data_rows"
  | "missing_column_mapping"
  | "duplicate_column_mapping"
  | "unknown_column"
  | "unknown_target"
  | "missing_front_mapping"
  | "missing_back_mapping"
  | "duplicate_target"
  | "missing_field_name"
  | "duplicate_field_name"
  | "missing_front_value"
  | "missing_back_value"
  | "duplicate_guid";

export interface CsvFieldMappingIssue {
  code: CsvFieldMappingIssueCode;
  message: string;
  columnId?: string;
  sourceLine?: number;
}

export interface CsvFieldMappingAnalysis {
  delimiter: CsvDelimiter;
  columns: CsvFieldMappingHeader[];
  rows: CsvFieldMappingRow[];
  sampleRows: CsvFieldMappingRow[];
  suggestedMapping: CsvFieldMappingColumn[];
  errors: CsvFieldMappingIssue[];
}

export interface CsvFieldMappingValidation {
  ok: boolean;
  errors: CsvFieldMappingIssue[];
}

export interface CsvFieldProjection {
  sourceLine: number;
  front: string;
  back: string;
  tags: string[];
  deck: string | null;
  guid: string | null;
  fields: Array<{ name: string; value: string }>;
}

export interface CsvFieldProjectionResult {
  ok: boolean;
  records: CsvFieldProjection[];
  errors: CsvFieldMappingIssue[];
}

interface ParsedCsvRow {
  sourceLine: number;
  values: string[];
}

const TARGET_SET = new Set<string>(CSV_FIELD_MAPPING_TARGETS);
const SINGLETON_TARGETS = ["front", "back", "tags", "deck", "guid"] as const;
const ALIASES: Record<Exclude<CsvFieldMappingTarget, "field" | "ignore">, Set<string>> = {
  front: new Set(["front", "frontside", "vorderseite", "frage", "question", "prompt", "cue", "begriff", "term"]),
  back: new Set(["back", "backside", "ruckseite", "rueckseite", "antwort", "answer", "response", "losung", "loesung", "definition"]),
  tags: new Set(["tag", "tags", "label", "labels", "schlagwort", "schlagworte", "kategorie", "kategorien", "category", "categories"]),
  deck: new Set(["deck", "deckname", "stapel", "stapelname", "kartenstapel"]),
  guid: new Set(["guid", "id", "importid", "externalid", "externeid", "noteid", "notizid"]),
};

function normalizedIdentifier(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isEmptyRow(row: ParsedCsvRow): boolean {
  return row.values.every((value) => !value.trim());
}

function detectDelimiter(csv: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && (character === "\r" || character === "\n")) break;
    if (!quoted && counts.has(character as CsvDelimiter)) {
      const delimiter = character as CsvDelimiter;
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }

  return ([",", ";", "\t"] as const).reduce((selected, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(selected) ?? 0) ? candidate : selected,
  );
}

function parseCsvRows(csv: string, delimiter: CsvDelimiter): { rows: ParsedCsvRow[]; errors: CsvFieldMappingIssue[] } {
  const rows: ParsedCsvRow[] = [];
  const errors: CsvFieldMappingIssue[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let sourceLine = 1;
  let rowSourceLine = 1;

  function finishField() {
    row.push(field);
    field = "";
  }

  function finishRow() {
    finishField();
    rows.push({ sourceLine: rowSourceLine, values: row });
    row = [];
  }

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (quoted) {
      if (character === '"' && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else if (character === "\r" || character === "\n") {
        field += "\n";
        if (character === "\r" && nextCharacter === "\n") index += 1;
        sourceLine += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && nextCharacter === "\n") index += 1;
      sourceLine += 1;
      rowSourceLine = sourceLine;
    } else {
      field += character;
    }
  }

  if (quoted) {
    errors.push({
      code: "malformed_csv",
      message: `Nicht geschlossene Anf\u00fchrungszeichen ab Zeile ${rowSourceLine}.`,
      sourceLine: rowSourceLine,
    });
  }
  if (field.length > 0 || row.length > 0) finishRow();

  return { rows: rows.filter((candidate) => !isEmptyRow(candidate)), errors };
}

function inferredTarget(header: CsvFieldMappingHeader): CsvFieldMappingColumn {
  const normalized = normalizedIdentifier(header.sourceName);
  if (!normalized) return { columnId: header.columnId, target: "ignore" };

  for (const target of SINGLETON_TARGETS) {
    if (ALIASES[target].has(normalized)) return { columnId: header.columnId, target };
  }
  return { columnId: header.columnId, target: "field", fieldName: header.name };
}

export function analyzeCsvFieldMapping(csv: string, { sampleSize = 5 }: { sampleSize?: number } = {}): CsvFieldMappingAnalysis {
  const source = String(csv ?? "");
  const delimiter = detectDelimiter(source);
  const parsed = parseCsvRows(source, delimiter);
  const errors = [...parsed.errors];

  if (parsed.rows.length === 0) {
    errors.push({ code: "empty_csv", message: "Die CSV-Datei enth\u00e4lt keine Kopfzeile." });
    return { delimiter, columns: [], rows: [], sampleRows: [], suggestedMapping: [], errors };
  }

  const [headerRow, ...dataRows] = parsed.rows;
  const maxColumnCount = Math.max(headerRow.values.length, ...dataRows.map((row) => row.values.length));
  const columns = Array.from({ length: maxColumnCount }, (_, index): CsvFieldMappingHeader => {
    const sourceName = index === 0 ? (headerRow.values[index] ?? "").replace(/^\uFEFF/, "").trim() : (headerRow.values[index] ?? "").trim();
    return {
      columnId: `column-${index}`,
      index,
      name: sourceName || `Spalte ${index + 1}`,
      sourceName,
    };
  });
  const rows = dataRows.map((row) => ({
    sourceLine: row.sourceLine,
    values: columns.map((column) => row.values[column.index] ?? ""),
  }));

  if (rows.length === 0) {
    errors.push({ code: "missing_data_rows", message: "Die CSV-Datei enth\u00e4lt keine Datenzeilen." });
  }

  return {
    delimiter,
    columns,
    rows,
    sampleRows: rows.slice(0, Math.max(0, Math.floor(sampleSize))),
    suggestedMapping: columns.map(inferredTarget),
    errors,
  };
}

export function validateCsvFieldMapping(
  analysis: CsvFieldMappingAnalysis,
  mapping: readonly CsvFieldMappingColumn[],
): CsvFieldMappingValidation {
  const errors = [...analysis.errors];
  const columnsById = new Map(analysis.columns.map((column) => [column.columnId, column]));
  const mappingsByColumn = new Map<string, CsvFieldMappingColumn[]>();

  for (const entry of mapping) {
    if (!columnsById.has(entry.columnId)) {
      errors.push({ code: "unknown_column", message: `Unbekannte CSV-Spalte: ${entry.columnId}.`, columnId: entry.columnId });
      continue;
    }
    mappingsByColumn.set(entry.columnId, [...(mappingsByColumn.get(entry.columnId) ?? []), entry]);
    if (!TARGET_SET.has(entry.target)) {
      errors.push({ code: "unknown_target", message: `Unbekanntes Zuordnungsziel f\u00fcr ${entry.columnId}.`, columnId: entry.columnId });
    }
  }

  for (const column of analysis.columns) {
    const entries = mappingsByColumn.get(column.columnId) ?? [];
    if (entries.length === 0) {
      errors.push({ code: "missing_column_mapping", message: `F\u00fcr \u201e${column.name}\u201c fehlt eine Zuordnung.`, columnId: column.columnId });
    } else if (entries.length > 1) {
      errors.push({ code: "duplicate_column_mapping", message: `\u201e${column.name}\u201c wurde mehrfach zugeordnet.`, columnId: column.columnId });
    }
  }

  for (const target of SINGLETON_TARGETS) {
    const entries = mapping.filter((entry) => entry.target === target && columnsById.has(entry.columnId));
    if (entries.length > 1) {
      errors.push({ code: "duplicate_target", message: `Das Ziel \u201e${target}\u201c darf nur einer Spalte zugeordnet werden.` });
    }
  }
  if (!mapping.some((entry) => entry.target === "front" && columnsById.has(entry.columnId))) {
    errors.push({ code: "missing_front_mapping", message: "Bitte ordne genau eine Spalte der Vorderseite zu." });
  }
  if (!mapping.some((entry) => entry.target === "back" && columnsById.has(entry.columnId))) {
    errors.push({ code: "missing_back_mapping", message: "Bitte ordne genau eine Spalte der R\u00fcckseite zu." });
  }

  const fieldNames = new Map<string, CsvFieldMappingColumn>();
  for (const entry of mapping.filter((candidate) => candidate.target === "field" && columnsById.has(candidate.columnId))) {
    const fieldName = String(entry.fieldName ?? "").trim();
    if (!fieldName) {
      errors.push({ code: "missing_field_name", message: "Ein zus\u00e4tzliches Feld ben\u00f6tigt einen Namen.", columnId: entry.columnId });
      continue;
    }
    const normalized = normalizedIdentifier(fieldName);
    const duplicate = fieldNames.get(normalized);
    if (duplicate) {
      errors.push({ code: "duplicate_field_name", message: `Der Feldname \u201e${fieldName}\u201c ist nicht eindeutig.`, columnId: entry.columnId });
    } else {
      fieldNames.set(normalized, entry);
    }
  }

  return { ok: errors.length === 0, errors };
}

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[\s,;#]+/).map((tag) => tag.trim()).filter(Boolean))];
}

export function projectCsvFieldMapping(
  analysis: CsvFieldMappingAnalysis,
  mapping: readonly CsvFieldMappingColumn[],
): CsvFieldProjectionResult {
  const validation = validateCsvFieldMapping(analysis, mapping);
  if (!validation.ok) return { ok: false, records: [], errors: validation.errors };

  const mappingByColumn = new Map(mapping.map((entry) => [entry.columnId, entry]));
  const records: CsvFieldProjection[] = [];
  const errors: CsvFieldMappingIssue[] = [];
  const guidLines = new Map<string, number>();

  for (const row of analysis.rows) {
    const record: CsvFieldProjection = {
      sourceLine: row.sourceLine,
      front: "",
      back: "",
      tags: [],
      deck: null,
      guid: null,
      fields: [],
    };

    for (const column of analysis.columns) {
      const entry = mappingByColumn.get(column.columnId)!;
      const value = row.values[column.index] ?? "";
      if (entry.target === "front") record.front = value;
      else if (entry.target === "back") record.back = value;
      else if (entry.target === "tags") record.tags = splitTags(value);
      else if (entry.target === "deck") record.deck = value.trim() || null;
      else if (entry.target === "guid") record.guid = value.trim() || null;
      else if (entry.target === "field") record.fields.push({ name: String(entry.fieldName).trim(), value });
    }

    if (!record.front.trim()) {
      errors.push({ code: "missing_front_value", message: `Zeile ${row.sourceLine}: Die Vorderseite ist leer.`, sourceLine: row.sourceLine });
    }
    if (!record.back.trim()) {
      errors.push({ code: "missing_back_value", message: `Zeile ${row.sourceLine}: Die R\u00fcckseite ist leer.`, sourceLine: row.sourceLine });
    }
    if (record.guid) {
      const previousLine = guidLines.get(record.guid);
      if (previousLine !== undefined) {
        errors.push({
          code: "duplicate_guid",
          message: `Zeile ${row.sourceLine}: Die GUID \u201e${record.guid}\u201c wurde bereits in Zeile ${previousLine} verwendet.`,
          sourceLine: row.sourceLine,
        });
      } else {
        guidLines.set(record.guid, row.sourceLine);
      }
    }
    records.push(record);
  }

  return errors.length > 0
    ? { ok: false, records: [], errors }
    : { ok: true, records, errors: [] };
}
