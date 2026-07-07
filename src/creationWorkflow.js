import { commitApkgImport, createApkgImportPreview, dryRunApkgImport } from "./apkgImport.js";
import { generateCardsFromDocument } from "./aiOrchestrator.js";
import { acceptAiDraftDeck, createManualCoreDeck, createSourceDocument } from "./coreModel.js";
import { createAnchorFromSelection, createDocumentFromFile } from "./documentModel.js";
import { appendPlainTextToCardHtml, hasCardRichTextContent } from "./richText.js";
import { importCsvAsNormalizedDeck, importTextAsNormalizedDeck } from "./importService.js";
import { storeDeckMedia } from "./mediaStore.js";

function describeError(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function createApkgJob(file, status, overrides = {}) {
  return {
    fileName: file?.name ?? "APKG-Datei",
    fileSize: file?.size ?? 0,
    status,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function normalizePasteMode(mode) {
  return mode === "csv" || mode === "spreadsheet" ? mode : "text";
}

function createPasteImportInput({ mode, deckName, content }) {
  const normalizedMode = normalizePasteMode(mode);
  if (normalizedMode === "text") return { deckName, text: content };

  return {
    deckName,
    csv: content,
    sourceType: "csv_import",
    format: normalizedMode === "spreadsheet" ? "spreadsheet" : "csv",
  };
}

function normalizeAnswerOptions(value) {
  if (Array.isArray(value)) return value.map((option) => String(option).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim())
    .filter(Boolean);
}

function createManualDeckInput(input = {}) {
  const cardType = input.cardType ?? "basic";
  const document = input.document ?? null;
  const answerOptions = normalizeAnswerOptions(input.answerOptions);
  const correctAnswer = String(input.correctAnswer ?? answerOptions[0] ?? input.back ?? "").trim();
  const rawExpectedAnswer = String(input.expectedAnswer ?? input.back ?? "").trim();
  const expectedAnswer = rawExpectedAnswer || correctAnswer;
  const back = cardType === "multiple-choice" ? String(input.back || correctAnswer).trim() : input.back;

  return {
    deckName: input.deckName,
    card: {
      cardType,
      front: input.front,
      back,
      tags: input.tags,
      answerOptions: cardType === "multiple-choice" ? answerOptions : [],
      correctAnswer,
      expectedAnswer,
      mediaRefs: document?.fileName && cardType === "image-occlusion" ? [document.fileName] : [],
    },
    documentContext: {
      document,
      documentId: document?.id,
      fileName: document?.fileName,
      mimeType: document?.mimeType,
      documentText: input.documentText,
      selection: input.selection,
      sourceAnchor: input.sourceAnchor,
      targetField: input.activeField ?? "front",
    },
  };
}

export function createCreationWorkflow() {
  return {
    async parseApkgFile(file, { onStep, existingDecks = [] } = {}) {
      try {
        const result = await createApkgImportPreview(file, onStep);
        const dryRun = result.preview ? await dryRunApkgImport(result.preview, { existingDecks }) : null;
        const mediaStatus = result.preview ? await storeDeckMedia(result.preview.deck, result.preview.mediaFiles) : null;
        const mediaErrors = mediaStatus?.errors ?? [];
        const reportWarnings = dryRun?.report?.warnings ?? [];
        const reportErrors = dryRun?.report?.errors ?? [];

        return {
          preview: result.preview ? { ...result.preview, importReport: dryRun?.report ?? result.preview.importReport } : null,
          mediaStatus,
          job: {
            ...result.job,
            status: reportErrors.length > 0 ? "error" : result.job.status,
            warnings: [...new Set([...(result.job.warnings ?? []), ...reportWarnings, ...mediaErrors])],
            errors: [...new Set([...(result.job.errors ?? []), ...reportErrors])],
          },
        };
      } catch (error) {
        return {
          preview: null,
          mediaStatus: null,
          job: createApkgJob(file, "error", {
            errors: [describeError(error, "Der Import ist fehlgeschlagen.")],
          }),
        };
      }
    },

    async commitApkgPreview(preview, { existingDecks = [] } = {}) {
      if (!preview) {
        return {
          deck: null,
          report: {
            warnings: [],
            errors: ["Keine APKG-Vorschau zum Importieren vorhanden."],
          },
        };
      }
      return commitApkgImport(preview, { existingDecks });
    },

    importPastedDeck({ mode = "text", deckName = "Importierter Stapel", content = "", dryRun = false } = {}) {
      const normalizedMode = normalizePasteMode(mode);
      const input = createPasteImportInput({ mode: normalizedMode, deckName, content });

      return normalizedMode === "text"
        ? importTextAsNormalizedDeck(input, { dryRun })
        : importCsvAsNormalizedDeck(input, { dryRun });
    },

    async readSourceDocument(file) {
      return createDocumentFromFile(file);
    },

    captureManualSelection({ activeField = "front", front = "", back = "", document = null, documentText = "", selectedText = "", sourceAnchorOptions = {} } = {}) {
      const selection = String(selectedText ?? "").trim();
      if (!selection) return { changed: false, front, back, selection: "" };
      const sourceAnchor = document ? createAnchorFromSelection({ ...document, text: documentText || document.text }, selection, activeField, sourceAnchorOptions) : null;

      return {
        changed: true,
        selection,
        sourceAnchor,
        front: activeField === "back" ? front : appendPlainTextToCardHtml(front, selection),
        back: activeField === "back" ? appendPlainTextToCardHtml(back, selection) : back,
      };
    },

    canCreateManualCard({ cardType = "basic", front = "", back = "", answerOptions = [], correctAnswer = "" } = {}) {
      const hasFront = hasCardRichTextContent(front);
      if (cardType === "cloze") return hasFront;
      if (cardType === "image-occlusion") return hasFront;
      if (cardType === "multiple-choice") {
        return hasFront && normalizeAnswerOptions(answerOptions).length >= 2 && Boolean(String(correctAnswer || back).trim());
      }
      return hasFront && hasCardRichTextContent(back);
    },

    createManualDeckInput(input = {}) {
      return createManualDeckInput(input);
    },

    createManualDeck(input = {}) {
      return createManualCoreDeck(createManualDeckInput(input));
    },

    createInitialAiDocument(overrides = {}) {
      return createSourceDocument({
        fileName: "Textquelle",
        text: "",
        textExtractionStatus: "success",
        ...overrides,
      });
    },

    updateAiDocumentText(document, text) {
      return {
        ...document,
        text,
        textExtractionStatus: text ? "success" : document?.textExtractionStatus,
      };
    },

    toggleAiCardType(config = {}, cardType) {
      const currentTypes = Array.isArray(config.cardTypes) ? config.cardTypes : ["basic"];
      const cardTypes = currentTypes.includes(cardType)
        ? currentTypes.filter((value) => value !== cardType)
        : [...currentTypes, cardType];
      return { ...config, cardTypes: cardTypes.length ? cardTypes : ["basic"] };
    },

    generateAiDrafts({ document, config = {}, deckName = "" } = {}) {
      const result = generateCardsFromDocument({
        document,
        config,
        deckName: deckName || config.subject || "KI-Entwürfe",
      });

      return {
        ...result,
        statusMessage: result.validation.valid
          ? `${result.draftDeck.cards.length} Entwürfe generiert.`
          : result.validation.errors.join(" "),
      };
    },

    updateDraftCard(cards = [], cardId, patch = {}) {
      return cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card));
    },

    acceptAiDrafts(draftDeck, draftCards = []) {
      if (!draftDeck || draftCards.length === 0) return null;
      return acceptAiDraftDeck({ ...draftDeck, cards: draftCards });
    },
  };
}
