import { createSourceAnchor, createSourceDocument } from "./coreModel.ts";
import { loadPdfJs } from "./pdfRuntime.ts";

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv"];
const PDF_EXTENSIONS = [".pdf"];

export const READABLE_SOURCE_DOCUMENT_ACCEPT = [...TEXT_EXTENSIONS, ...PDF_EXTENSIONS].join(",");
export const READABLE_SOURCE_DOCUMENT_LABEL = "PDF, Text, Markdown, CSV oder TSV";

function extensionOf(fileName: any = "") {
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isTextReadableFile(file: any) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type.startsWith("text/") || TEXT_EXTENSIONS.includes(extension);
}

export function isPdfFile(file: any) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type === "application/pdf" || PDF_EXTENSIONS.includes(extension);
}

function createBaseMetadata(file: any, overrides: any = {}) {
  return {
    size: file.size ?? 0,
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    ...overrides,
  };
}

function normalizePdfTextItem(item: any) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    text: String(item?.str ?? "").replace(/\s+/g, " ").trim(),
    x: Number(transform[4] ?? 0),
    y: Number(transform[5] ?? 0),
  };
}

export function formatPdfTextContentItems(items: any = [], { pageNumber = null }: any = {}) {
  const normalizedItems = items.map(normalizePdfTextItem).filter((item: any) => item.text);
  if (normalizedItems.length === 0) return pageNumber ? `Seite ${pageNumber}\nKein Textlayer gefunden.` : "";

  const lines: any[] = [];
  for (const item of normalizedItems.sort((left: any, right: any) => right.y - left.y || left.x - right.x)) {
    const existingLine = lines.find((line: any) => Math.abs(line.y - item.y) <= 3);
    if (existingLine) {
      existingLine.items.push(item);
      existingLine.y = (existingLine.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  const textLines = lines
    .sort((left: any, right: any) => right.y - left.y)
    .map((line: any) =>
      line.items
        .sort((left: any, right: any) => left.x - right.x)
        .map((item: any) => item.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter(Boolean);

  return [pageNumber ? `Seite ${pageNumber}` : "", ...textLines].filter(Boolean).join("\n");
}

function joinPageTexts(pages: any) {
  let cursor = 0;
  const parts: any[] = [];
  const pagesWithOffsets = pages.map((page: any) => {
    const text = String(page.text ?? "").trim();
    const charStart = cursor;
    parts.push(text);
    cursor += text.length + 2;
    return {
      ...page,
      charStart,
      charEnd: charStart + text.length,
    };
  });

  return {
    text: parts.filter(Boolean).join("\n\n"),
    pages: pagesWithOffsets,
  };
}

async function readPdfText(file: any) {
  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages: any[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = formatPdfTextContentItems(textContent.items, { pageNumber });
      pages.push({
        pageNumber,
        text,
        textItemCount: textContent.items?.length ?? 0,
      });
    }
  } finally {
    pdf.destroy?.();
  }

  return joinPageTexts(pages);
}

function pageNumberForSelection(document: any, charStart: any) {
  const pages = document?.metadata?.pages ?? [];
  if (!Number.isFinite(charStart) || charStart < 0 || !Array.isArray(pages)) return null;
  return pages.find((page: any) => charStart >= page.charStart && charStart <= page.charEnd)?.pageNumber ?? null;
}

export async function createDocumentFromFile(file: any) {
  if (!file) {
    throw new Error("Es wurde keine Datei übergeben.");
  }

  const canReadText = isTextReadableFile(file);
  const extension = extensionOf(file.name);
  const mimeType =
    file.type ||
    {
      ".pdf": "application/pdf",
      ".md": "text/markdown",
      ".markdown": "text/markdown",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
    }[extension] ||
    "application/octet-stream";

  if (canReadText) {
    const text = await file.text();
    return createSourceDocument({
      fileName: file.name,
      mimeType,
      text,
      textExtractionStatus: "success",
      metadata: createBaseMetadata(file, {
        browserReadableText: true,
        extractionMethod: "browser-text",
      }),
    });
  }

  if (isPdfFile(file)) {
    try {
      const extracted = await readPdfText(file);
      const text = extracted.text.trim();
      return createSourceDocument({
        fileName: file.name,
        mimeType,
        text,
        textExtractionStatus: text ? "success" : "empty",
        metadata: createBaseMetadata(file, {
          browserReadableText: Boolean(text),
          extractionMethod: "pdfjs-dist",
          pages: extracted.pages,
        }),
      });
    } catch (error) {
      return createSourceDocument({
        fileName: file.name,
        mimeType,
        text: "",
        textExtractionStatus: "error",
        metadata: createBaseMetadata(file, {
          browserReadableText: false,
          extractionMethod: "pdfjs-dist",
          extractionError: error instanceof Error ? error.message : "PDF konnte nicht ausgelesen werden.",
        }),
      });
    }
  }

  return createSourceDocument({
    fileName: file.name,
    mimeType,
    text: "",
    textExtractionStatus: "unsupported",
    metadata: createBaseMetadata(file, {
      browserReadableText: false,
      extractionMethod: "unsupported",
    }),
  });
}

export function createAnchorFromSelection(document: any, selection: any, targetField: any, options: any = {}) {
  const text = String(selection ?? "").trim();
  const sourceText = document?.text ?? "";
  const charStart = text && sourceText ? sourceText.indexOf(text) : -1;
  const pageNumber = options.pageNumber ?? pageNumberForSelection(document, charStart);

  return createSourceAnchor({
    documentId: document?.id ?? null,
    documentName: document?.fileName ?? "",
    pageNumber,
    textQuote: text,
    charStart: charStart >= 0 ? charStart : null,
    charEnd: charStart >= 0 ? charStart + text.length : null,
    bbox: options.bbox ?? null,
    confidence: options.confidence ?? 1,
    targetField,
  });
}

export function splitDocumentIntoPassages(text: any, maxPassages: any = 12) {
  const clean = String(text ?? "").replace(/\r/g, "").trim();
  if (!clean) return [];

  const paragraphPassages = clean
    .split(/\n{2,}/)
    .map((passage: any) => passage.replace(/\s+/g, " ").trim())
    .filter((passage: any) => passage.length >= 24);

  if (paragraphPassages.length > 0) {
    return paragraphPassages.slice(0, maxPassages);
  }

  return clean
    .split(/(?<=[.!?])\s+/)
    .map((passage: any) => passage.trim())
    .filter((passage: any) => passage.length >= 24)
    .slice(0, maxPassages);
}
