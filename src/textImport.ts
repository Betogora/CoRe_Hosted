import {
  createManualNoteContent,
  noteEditorValue,
  normalizeTags,
  parseNoteContent,
  validateManualNoteInput,
  validateNoteEditorValue,
} from "./coreModel.ts";
import type { Note, NoteContent } from "./coreTypes.ts";
import { stripSanitizedHtml } from "./htmlSafety.ts";
import { escapeCardHtmlText } from "./richText.ts";

const TEXT_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const TEXT_IMPORT_MAX_ROWS = 50_000;
const TEXT_IMPORT_EXTENSIONS = [".txt", ".csv", ".tsv"];

export type TextImportKind = "basic" | "basic-reversed" | "cloze";
export type TextImportColumnRole = "front" | "back" | "tags" | "ignore";
export type TextImportDuplicateMode = "update" | "skip" | "create";

export interface ParsedTextImport {
  separator: string;
  html: boolean;
  tags: string[];
  columnNames: string[] | null;
  columnCount: number;
  deckName: string | null;
  kind: TextImportKind | null;
  /** Zero-based `#tags column`. */
  tagsColumn: number | null;
  rows: Array<{ line: number; values: string[] }>;
  warnings: string[];
}

export interface TextImportOptions {
  kind: TextImportKind;
  columns: TextImportColumnRole[];
  duplicates: TextImportDuplicateMode;
}

export type ExistingTextImportNote = Pick<Note, "id" | "content" | "source">;

export interface TextImportPlan {
  creates: NoteContent[];
  updates: Array<{ noteId: string; content: NoteContent }>;
  /** Duplicates left out, and updates that change nothing. */
  skippedCount: number;
  errors: Array<{ line: number; message: string }>;
  cardCount: number;
}

/** Without a deck id the contents go into a new deck of that name. */
export interface TextImportSaveInput extends Pick<TextImportPlan, "creates" | "updates"> {
  deckId: string | null;
  deckName: string;
}

const SEPARATOR_NAMES: Record<string, string> = { tab: "\t", comma: ",", semicolon: ";", space: " ", pipe: "|", colon: ":" };
const DETECTED_SEPARATORS = ["\t", ";", ",", "|", ":"];
const DETECTION_ROWS = 20;
const NOTETYPES: Record<string, TextImportKind> = {
  basic: "basic",
  einfach: "basic",
  "basic (and reversed card)": "basic-reversed",
  "einfach (beide richtungen)": "basic-reversed",
  cloze: "cloze",
  "lückentext": "cloze",
};

export function isTextImportFile(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** UTF-8, else Windows-1252 as German Excel saves CSV. */
export async function readTextImportFile(file: Blob & { name: string }): Promise<ParsedTextImport> {
  if (file.size > TEXT_IMPORT_MAX_BYTES) throw new Error("Die Datei ist größer als 20 MB. Bitte teile sie in kleinere Dateien auf.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return parseTextImport(text, file.name);
}

/**
 * Splits text into records: `"…"` quotes with `""` as escape may hold separators and line breaks; empty lines and, as in
 * Anki, lines starting with `#` are skipped.
 */
function parseRecords(text: string, separator: string, firstLine: number, limit = Number.POSITIVE_INFINITY) {
  const records: ParsedTextImport["rows"] = [];
  let values: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = true;
  let line = firstLine;
  let recordLine = firstLine;
  const endRecord = () => {
    values.push(field);
    if (values.length > 1 || values[0] !== "") records.push({ line: recordLine, values });
    values = [];
    field = "";
    fieldStart = true;
  };
  for (let index = 0; index < text.length && records.length < limit; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else {
        if (char === "\n") line += 1;
        field += char;
      }
    } else if (fieldStart && values.length === 0 && char === "#") {
      const end = text.indexOf("\n", index);
      index = end < 0 ? text.length : end;
      line += 1;
      recordLine = line;
    } else if (fieldStart && char === "\"") {
      quoted = true;
      fieldStart = false;
    } else if (char === separator) {
      values.push(field);
      field = "";
      fieldStart = true;
    } else if (char === "\n") {
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
      fieldStart = false;
    }
  }
  if (records.length < limit && (field !== "" || values.length > 0)) endRecord();
  return records;
}

function detectSeparator(body: string, firstLine: number, fileName: string): string {
  if (fileName.toLowerCase().endsWith(".tsv")) return "\t";
  // Rows may differ in length (an extra column in some); every sampled row must split at least once.
  const splitting = DETECTED_SEPARATORS.find((separator) => {
    const records = parseRecords(body, separator, firstLine, DETECTION_ROWS);
    return records.length > 0 && records.every((record) => record.values.length >= 2);
  });
  return splitting ?? (fileName.toLowerCase().endsWith(".csv") ? "," : "\t");
}

export function parseTextImport(source: string, fileName: string): ParsedTextImport {
  const lines = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const warnings: string[] = [];
  const headers = new Map<string, string>();
  let headerCount = 0;
  for (const line of lines) {
    if (!line.startsWith("#")) break;
    headerCount += 1;
    const match = /^#([^:]+):(.*)$/.exec(line);
    const key = match?.[1].trim().toLowerCase() ?? "";
    if (match && ["separator", "html", "tags", "columns", "deck", "notetype", "tags column"].includes(key)) headers.set(key, match[2].trim());
    else warnings.push(`Kopfzeile „${line}“ wird nicht unterstützt und ignoriert.`);
  }
  const body = lines.slice(headerCount).join("\n");
  const firstLine = headerCount + 1;

  const separatorHeader = headers.get("separator");
  let separator = separatorHeader ? SEPARATOR_NAMES[separatorHeader.toLowerCase()] ?? (separatorHeader.length === 1 ? separatorHeader : null) : null;
  if (separatorHeader && !separator) warnings.push(`Trennzeichen „${separatorHeader}“ ist unbekannt und wird erkannt.`);
  separator ??= detectSeparator(body, firstLine, fileName);

  const htmlHeader = headers.get("html")?.toLowerCase();
  const notetype = headers.get("notetype");
  const kind = notetype === undefined ? null : NOTETYPES[notetype.toLowerCase()] ?? null;
  if (notetype !== undefined && !kind) warnings.push(`Notiztyp „${notetype}“ wird nicht unterstützt.`);
  const tagsColumnHeader = headers.get("tags column");
  const tagsColumn = tagsColumnHeader === undefined ? null : Number(tagsColumnHeader);
  if (tagsColumn !== null && !(Number.isInteger(tagsColumn) && tagsColumn >= 1)) warnings.push(`Tag-Spalte „${tagsColumnHeader}“ ist ungültig.`);
  const columns = headers.get("columns");

  const rows = parseRecords(body, separator, firstLine);
  if (rows.length > TEXT_IMPORT_MAX_ROWS) throw new Error("Die Datei hat mehr als 50.000 Zeilen. Bitte teile sie in kleinere Dateien auf.");
  if (!rows.length) throw new Error("Die Datei enthält keine Zeilen.");
  const columnNames = columns === undefined ? null : parseRecords(columns, separator, 1, 1)[0]?.values.map((name) => name.trim()) ?? [];
  return {
    separator,
    html: htmlHeader === "true",
    tags: normalizeTags(headers.get("tags") ?? ""),
    columnNames,
    columnCount: Math.max(columnNames?.length ?? 0, ...rows.map((row) => row.values.length)),
    deckName: headers.get("deck") || null,
    kind,
    tagsColumn: tagsColumn !== null && Number.isInteger(tagsColumn) && tagsColumn >= 1 ? tagsColumn - 1 : null,
    rows,
    warnings,
  };
}

export function defaultTextImportOptions(parsed: ParsedTextImport): TextImportOptions {
  const tagsColumn = parsed.tagsColumn ?? parsed.columnNames?.findIndex((name) => name.toLowerCase() === "tags") ?? -1;
  const contentColumns = Array.from({ length: parsed.columnCount }, (_, index) => index).filter((index) => index !== tagsColumn);
  return {
    kind: parsed.kind ?? "basic",
    columns: Array.from({ length: parsed.columnCount }, (_, index): TextImportColumnRole =>
      index === tagsColumn ? "tags" : index === contentColumns[0] ? "front" : index === contentColumns[1] ? "back" : "ignore"),
    duplicates: "update",
  };
}

function fieldHtml(value: string, html: boolean) {
  return html ? value : escapeCardHtmlText(value).replace(/\n/g, "<br>");
}

function contentKind(content: NoteContent): TextImportKind | null {
  if (content.interaction.kind === "cloze") return "cloze";
  if (content.interaction.kind !== "reveal") return null;
  return content.interaction.prompts.length === 1 ? "basic" : content.interaction.prompts.length === 2 ? "basic-reversed" : null;
}

function updatedContent(existing: ExistingTextImportNote, front: string, back: string, tags: string[]): NoteContent | null {
  const value = noteEditorValue(existing);
  const first = existing.content.fields.find((field) => field.role === "prompt") ?? existing.content.fields[0];
  const second = existing.content.fields.find((field) => field !== first && field.role !== "prompt");
  if (first) value.fields[first.id] = front;
  if (second) value.fields[second.id] = back;
  value.tags = normalizeTags([...value.tags, ...tags]);
  const result = validateNoteEditorValue(existing, value);
  return result.ok ? result.content : null;
}

/** As in Anki, the first field decides: its full plain text, for a cloze its markup, so an update keeps every deletion. */
function duplicateKey(content: NoteContent): string {
  const first = content.fields.find((field) => field.role === "prompt") ?? content.fields[0];
  if (!first) return "";
  return (content.interaction.kind === "cloze" ? first.html : stripSanitizedHtml(first.html)).replace(/\s+/g, " ").trim();
}

const cardCountOf = (content: NoteContent) => {
  const parsed = parseNoteContent(content);
  return parsed.ok ? parsed.promptKeys.length : 0;
};

export function planTextImport(parsed: ParsedTextImport, options: TextImportOptions, existing: readonly ExistingTextImportNote[]): TextImportPlan {
  const columnOf = (role: TextImportColumnRole) => options.columns.indexOf(role);
  const tagColumns = options.columns.flatMap((role, index) => role === "tags" ? [index] : []);
  const plan: TextImportPlan = { creates: [], updates: [], skippedCount: 0, errors: [], cardCount: 0 };
  type Known = { existing: ExistingTextImportNote; update: number | null } | { create: number };
  const known = new Map<string, Known>();
  if (options.duplicates !== "create") {
    for (const note of existing) {
      if (contentKind(note.content) === options.kind) known.set(duplicateKey(note.content), { existing: note, update: null });
    }
  }
  for (const row of parsed.rows) {
    const value = (index: number) => index < 0 ? "" : row.values[index] ?? "";
    const tags = normalizeTags([...parsed.tags, ...tagColumns.flatMap((index) => value(index).split(/\s+/))]);
    const input = { kind: options.kind, front: fieldHtml(value(columnOf("front")), parsed.html), back: fieldHtml(value(columnOf("back")), parsed.html), tags };
    const errors = Object.values(validateManualNoteInput(input));
    const content = errors.length ? null : parseNoteContent(createManualNoteContent(input));
    if (!content?.ok) {
      plan.errors.push({ line: row.line, message: errors.join(" ") || (content && !content.ok ? content.errors.join(" ") : "") });
      continue;
    }
    const key = duplicateKey(content.value);
    const duplicate = options.duplicates === "create" || !key ? undefined : known.get(key);
    if (duplicate && options.duplicates === "skip") {
      plan.skippedCount += 1;
    } else if (duplicate && "create" in duplicate) {
      plan.creates[duplicate.create] = content.value;
    } else if (duplicate) {
      const next = updatedContent(duplicate.existing, input.front, input.back, tags);
      if (!next) plan.errors.push({ line: row.line, message: "Der vorhandene Inhalt lässt sich damit nicht aktualisieren." });
      else if (JSON.stringify(next) === JSON.stringify(duplicate.existing.content)) plan.skippedCount += 1;
      else if (duplicate.update === null) duplicate.update = plan.updates.push({ noteId: duplicate.existing.id, content: next }) - 1;
      else plan.updates[duplicate.update] = { noteId: duplicate.existing.id, content: next };
    } else {
      const index = plan.creates.push(content.value) - 1;
      if (options.duplicates !== "create" && key) known.set(key, { create: index });
    }
  }
  plan.cardCount = [...plan.creates, ...plan.updates.map((update) => update.content)].reduce((total, content) => total + cardCountOf(content), 0);
  return plan;
}
