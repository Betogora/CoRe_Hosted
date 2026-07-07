import { createSourceAnchor, createSourceDocument } from "./coreModel.js";

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv"];
const PDF_EXTENSIONS = [".pdf"];
const DOCX_EXTENSIONS = [".docx"];

function extensionOf(fileName = "") {
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isTextReadableFile(file) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type.startsWith("text/") || TEXT_EXTENSIONS.includes(extension);
}

export function isPdfFile(file) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type === "application/pdf" || PDF_EXTENSIONS.includes(extension);
}

export function isDocxFile(file) {
  const type = file?.type ?? "";
  const extension = extensionOf(file?.name);
  return type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || DOCX_EXTENSIONS.includes(extension);
}

function createBaseMetadata(file, overrides = {}) {
  return {
    size: file.size ?? 0,
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    ...overrides,
  };
}

function normalizePdfTextItem(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    text: String(item?.str ?? "").replace(/\s+/g, " ").trim(),
    x: Number(transform[4] ?? 0),
    y: Number(transform[5] ?? 0),
  };
}

export function formatPdfTextContentItems(items = [], { pageNumber = null } = {}) {
  const normalizedItems = items.map(normalizePdfTextItem).filter((item) => item.text);
  if (normalizedItems.length === 0) return pageNumber ? `Seite ${pageNumber}\nKein Textlayer gefunden.` : "";

  const lines = [];
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

function joinPageTexts(pages) {
  let cursor = 0;
  const parts = [];
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

async function readPdfText(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages = [];

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

function pageNumberForSelection(document, charStart) {
  const pages = document?.metadata?.pages ?? [];
  if (!Number.isFinite(charStart) || charStart < 0 || !Array.isArray(pages)) return null;
  return pages.find((page) => charStart >= page.charStart && charStart <= page.charEnd)?.pageNumber ?? null;
}

export async function createDocumentFromFile(file) {
  if (!file) {
    throw new Error("Es wurde keine Datei übergeben.");
  }

  const canReadText = isTextReadableFile(file);
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

  if (isDocxFile(file)) {
    return createSourceDocument({
      fileName: file.name,
      mimeType,
      text: "",
      textExtractionStatus: "unsupported",
      metadata: createBaseMetadata(file, {
        browserReadableText: false,
        extractionMethod: "unsupported-docx",
        userMessage: "Word-Dokumente werden im nächsten Dokument-Schritt ausgelesen.",
      }),
    });
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

export function createAnchorFromSelection(document, selection, targetField, options = {}) {
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
