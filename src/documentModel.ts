import { makeId } from "./coreModel.ts";
import { loadPdfJs } from "./pdfRuntime.ts";

export interface TransientSourceDocument {
  id: string;
  fileName: string;
  mimeType: string;
  text: string;
  textExtractionStatus: "success" | "empty" | "error" | "unsupported";
  metadata: Record<string, unknown>;
}

function createTransientSourceDocument(input: Omit<TransientSourceDocument, "id">): TransientSourceDocument {
  return { id: makeId("transient-document"), ...input };
}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv"];
const PDF_EXTENSIONS = [".pdf"];

export const READABLE_SOURCE_DOCUMENT_ACCEPT = [...TEXT_EXTENSIONS, ...PDF_EXTENSIONS].join(",");
export const READABLE_SOURCE_DOCUMENT_LABEL = "PDF, Text, Markdown, CSV oder TSV";

function extensionOf(fileName: unknown = "") {
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

const TEXT_MIME_TYPES = ["text/plain", "text/markdown", "text/csv", "text/tab-separated-values"];

function isTextReadableFile(file: Pick<File, "name" | "type">) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return TEXT_MIME_TYPES.includes(type) || TEXT_EXTENSIONS.includes(extension);
}

function isPdfFile(file: Pick<File, "name" | "type">) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type === "application/pdf" || PDF_EXTENSIONS.includes(extension);
}

/** Whether a chosen or dropped file is one of the readable source formats; other files are rejected before reading. */
export function isReadableSourceDocument(file: Pick<File, "name" | "type">): boolean {
  return isTextReadableFile(file) || isPdfFile(file);
}

function createBaseMetadata(file: Pick<File, "size" | "lastModified">, overrides: Record<string, unknown> = {}) {
  return {
    size: file.size ?? 0,
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    ...overrides,
  };
}

/** A text item of a PDF page as pdf.js delivers it; marked-content entries carry neither field. */
interface PdfTextItem {
  str?: unknown;
  transform?: unknown;
}

interface PdfPageText {
  pageNumber: number;
  text: string;
  textItemCount: number;
}

function normalizePdfTextItem(item: PdfTextItem | null | undefined) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    text: String(item?.str ?? "").replace(/\s+/g, " ").trim(),
    x: Number(transform[4] ?? 0),
    y: Number(transform[5] ?? 0),
  };
}

function formatPdfTextContentItems(items: readonly PdfTextItem[] = [], { pageNumber = null }: { pageNumber?: number | null } = {}) {
  const normalizedItems = items.map(normalizePdfTextItem).filter((item) => item.text);
  if (normalizedItems.length === 0) return pageNumber ? `Seite ${pageNumber}\nKein Textlayer gefunden.` : "";

  const lines: Array<{ y: number; items: typeof normalizedItems }> = [];
  for (const item of normalizedItems.sort((left, right) => right.y - left.y || left.x - right.x)) {
    const existingLine = lines.find((line) => Math.abs(line.y - item.y) <= 3);
    if (existingLine) {
      existingLine.items.push(item);
      existingLine.y = (existingLine.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  const textLines = lines
    .sort((left, right) => right.y - left.y)
    .map((line) =>
      line.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter(Boolean);

  return [pageNumber ? `Seite ${pageNumber}` : "", ...textLines].filter(Boolean).join("\n");
}

function joinPageTexts(pages: readonly PdfPageText[]) {
  let cursor = 0;
  const parts: string[] = [];
  const pagesWithOffsets = pages.map((page) => {
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

async function readPdfText(file: Pick<File, "arrayBuffer">) {
  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];

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

export async function createDocumentFromFile(file: File) {
  if (!file) {
    throw new Error("Es wurde keine Datei übergeben.");
  }

  const canReadText = isTextReadableFile(file);
  const extension = extensionOf(file.name);
  const mimeType =
    file.type ||
    ({
      ".pdf": "application/pdf",
      ".md": "text/markdown",
      ".markdown": "text/markdown",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
    } as Record<string, string | undefined>)[extension] ||
    "application/octet-stream";

  if (canReadText) {
    const text = await file.text();
    return createTransientSourceDocument({
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
      return createTransientSourceDocument({
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
      return createTransientSourceDocument({
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

  return createTransientSourceDocument({
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
