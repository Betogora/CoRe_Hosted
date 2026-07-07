import { commitApkgImport, createApkgImportPreview, dryRunApkgImport } from "./apkgImport.js";
import { generateCardsFromDocument } from "./aiOrchestrator.js";
import { acceptAiDraftDeck, createManualCoreDeck, createSourceDocument } from "./coreModel.js";
import { createDocumentFromFile } from "./documentModel.js";
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

function appendWithNewline(current, addition) {
  return current ? `${current}\n${addition}` : addition;
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

function createManualDeckInput(input = {}) {
  const cardType = input.cardType ?? "basic";
  const document = input.document ?? null;

  return {
    deckName: input.deckName,
    card: {
      cardType,
      front: input.front,
      back: input.back,
      tags: input.tags,
      answerOptions: cardType === "multiple-choice" ? String(input.back ?? "").split("\n").filter(Boolean) : [],
      mediaRefs: document?.fileName && cardType === "image-occlusion" ? [document.fileName] : [],
    },
    documentContext: {
      document,
      documentId: document?.id,
      fileName: document?.fileName,
      mimeType: document?.mimeType,
      documentText: input.documentText,
      selection: input.selection,
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

    captureManualSelection({ activeField = "front", front = "", back = "", documentText = "", selectedText = "" } = {}) {
      const selection = String(selectedText || documentText.slice(0, 400)).trim();
      if (!selection) return { changed: false, front, back, selection: "" };

      return {
        changed: true,
        selection,
        front: activeField === "back" ? front : appendWithNewline(front, selection),
        back: activeField === "back" ? appendWithNewline(back, selection) : back,
      };
    },

    canCreateManualCard({ cardType = "basic", front = "", back = "" } = {}) {
      return Boolean(String(front).trim() && (String(back).trim() || cardType === "image-occlusion"));
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
