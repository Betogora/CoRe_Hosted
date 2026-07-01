import { createSourceAnchor, createSourceDocument } from "./coreModel.js";

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv"];

function extensionOf(fileName = "") {
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isTextReadableFile(file) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type.startsWith("text/") || TEXT_EXTENSIONS.includes(extension);
}

export async function createDocumentFromFile(file) {
  if (!file) {
    throw new Error("Es wurde keine Datei uebergeben.");
  }

  const canReadText = isTextReadableFile(file);
  const text = canReadText ? await file.text() : "";
  const extension = extensionOf(file.name);
  const mimeType =
    file.type ||
    {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".md": "text/markdown",
      ".markdown": "text/markdown",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
    }[extension] ||
    "application/octet-stream";

  return createSourceDocument({
    fileName: file.name,
    mimeType,
    text,
    textExtractionStatus: canReadText ? "success" : "pending",
    metadata: {
      size: file.size ?? 0,
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      browserReadableText: canReadText,
    },
  });
}

export function createAnchorFromSelection(document, selection, targetField, options = {}) {
  const text = String(selection ?? "").trim();
  const sourceText = document?.text ?? "";
  const charStart = text && sourceText ? sourceText.indexOf(text) : -1;

  return createSourceAnchor({
    documentId: document?.id ?? null,
    documentName: document?.fileName ?? "",
    pageNumber: options.pageNumber ?? null,
    textQuote: text,
    charStart: charStart >= 0 ? charStart : null,
    charEnd: charStart >= 0 ? charStart + text.length : null,
    bbox: options.bbox ?? null,
    confidence: options.confidence ?? 1,
    targetField,
  });
}

export function splitDocumentIntoPassages(text, maxPassages = 12) {
  const clean = String(text ?? "").replace(/\r/g, "").trim();
  if (!clean) return [];

  const paragraphPassages = clean
    .split(/\n{2,}/)
    .map((passage) => passage.replace(/\s+/g, " ").trim())
    .filter((passage) => passage.length >= 24);

  if (paragraphPassages.length > 0) {
    return paragraphPassages.slice(0, maxPassages);
  }

  return clean
    .split(/(?<=[.!?])\s+/)
    .map((passage) => passage.trim())
    .filter((passage) => passage.length >= 24)
    .slice(0, maxPassages);
}

