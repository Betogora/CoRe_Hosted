import { createCoreDeck, createLearningItemsFromNormalizedInput } from "./coreModel.js";

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === "\t" || char === ";") && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function createTextImportDeck({ deckName = "Text-Import", text = "", tags = [] }) {
  const passages = String(text)
    .split(/\n{2,}/)
    .map((passage) => passage.trim())
    .filter((passage) => passage.length > 0);
  const normalizedItems = passages.map((passage, index) => {
    const [front, ...backParts] = passage.split(/\n-+\n|\nAntwort:\s*/i);
    const back = backParts.join("\n").trim() || passage;
    return {
      canonicalQuestion: front.trim() || `Textkarte ${index + 1}`,
      canonicalAnswer: back,
      tags,
      meta: {
        importFormat: "text",
      },
    };
  });
  const result = createLearningItemsFromNormalizedInput("", normalizedItems, {
    source: "text-import",
    sourceType: "mixed",
    tags,
  });
  const cards = result.createdItems;

  return createCoreDeck({
    name: deckName,
    source: "text-import",
    cards,
    tags,
    importMeta: {
      creationMethod: "text-import",
      detectedCards: cards.length,
      warnings: cards.length === 0 ? ["Keine importierbaren Textabschnitte erkannt.", ...result.warnings] : result.warnings,
    },
  });
}

export function createCsvImportDeck({ deckName = "CSV-Import", csv = "" }) {
  return createTableImportDeck({ deckName, table: csv, format: "csv" });
}

export function createTableImportDeck({ deckName = "Tabellen-Import", table = "", format = "spreadsheet" }) {
  const normalizedFormat = format === "csv" ? "csv" : "spreadsheet";
  const source = normalizedFormat === "csv" ? "csv-import" : "spreadsheet-import";
  const lines = String(table)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = splitCsvLine(lines[0] ?? "").map((value) => value.toLowerCase());
  const hasHeader = header.includes("front") || header.includes("back");
  const frontIndex = hasHeader ? Math.max(0, header.indexOf("front")) : 0;
  const backIndex = hasHeader ? Math.max(1, header.indexOf("back")) : 1;
  const tagsIndex = hasHeader ? header.indexOf("tags") : 2;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const normalizedItems = dataLines
    .map(splitCsvLine)
    .filter((columns) => columns[frontIndex] || columns[backIndex])
    .map((columns) => ({
        canonicalQuestion: columns[frontIndex] ?? "",
        canonicalAnswer: columns[backIndex] ?? "",
        tags: tagsIndex >= 0 ? columns[tagsIndex] ?? "" : "",
        meta: {
          importFormat: normalizedFormat,
          rawColumns: columns,
        },
      }));
  const result = createLearningItemsFromNormalizedInput("", normalizedItems, {
    source,
    sourceType: "mixed",
  });
  const cards = result.createdItems;

  return createCoreDeck({
    name: deckName,
    source,
    cards,
    importMeta: {
      creationMethod: `${normalizedFormat}-import`,
      detectedCards: cards.length,
      warnings: cards.length === 0 ? ["Keine Front/Back-Spalten erkannt.", ...result.warnings] : result.warnings,
    },
  });
}
