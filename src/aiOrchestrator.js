import { createAiDraftDeck, makeId, stableContentHash } from "./coreModel.js";
import { createAnchorFromSelection, splitDocumentIntoPassages } from "./documentModel.js";

const CAPABILITY_MODEL = {
  eligibility_classifier: { provider: "local", model: "rule-small", class: "small" },
  variant_rephrase: { provider: "local", model: "rule-rephrase", class: "medium" },
  card_generator: { provider: "local", model: "extractive-draft", class: "medium" },
  source_anchor_validator: { provider: "local", model: "anchor-check", class: "small" },
  graph_builder: { provider: "local", model: "keyword-graph", class: "medium" },
  chat_retriever: { provider: "local", model: "card-search", class: "small" },
  quality_checker: { provider: "local", model: "rule-quality", class: "medium" },
};

export function selectModel(task, policy = {}, context = {}) {
  const capability = CAPABILITY_MODEL[task] ?? CAPABILITY_MODEL.card_generator;
  const costTier = policy.costTier ?? "balanced";

  if (policy.allowExternalModels && costTier === "quality" && context.requiresReasoning) {
    return { provider: "external-ready", model: "quality-router-slot", class: "large", estimatedCost: policy.maxCostPerJob ?? null };
  }

  return { ...capability, estimatedCost: 0 };
}

export function createAiJob({ jobType, deckId = null, inputRef = {}, policy = {}, status = "queued", resultRef = null, error = null }) {
  const createdAt = new Date().toISOString();
  return {
    id: makeId("job"),
    jobType,
    status,
    userId: "local-user",
    deckId,
    inputRef,
    policy,
    resultRef,
    error,
    createdAt,
    startedAt: status === "queued" ? null : createdAt,
    finishedAt: ["succeeded", "failed", "cancelled"].includes(status) ? createdAt : null,
  };
}

function firstWords(text, count = 9) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, count)
    .join(" ");
}

function createCloze(passage) {
  const words = passage.split(/\s+/);
  const candidateIndex = words.findIndex((word) => word.length > 7 && /^[A-Za-zA-ZÄÖÜäöüß-]+$/.test(word));

  if (candidateIndex < 0) {
    return passage;
  }

  const clean = words[candidateIndex].replace(/[,.!?;:]$/, "");
  words[candidateIndex] = words[candidateIndex].replace(clean, `{{c1::${clean}}}`);
  return words.join(" ");
}

function buildDraftFromPassage(passage, index, config, document) {
  const typePreference = config.cardTypes?.[index % config.cardTypes.length] ?? "basic";
  const cardType = typePreference === "cloze" ? "cloze" : "basic";
  const quote = passage.slice(0, 420);
  const anchor = createAnchorFromSelection(document, quote, "ai-draft", {
    confidence: 0.84,
    pageNumber: config.pageNumber ?? null,
  });

  if (cardType === "cloze") {
    const cloze = createCloze(passage);
    return {
      type: "cloze",
      front: cloze,
      back: passage,
      tags: [config.subject, "ki-entwurf"].filter(Boolean),
      sourceAnchors: [anchor],
      confidence: 0.78,
      warnings: [],
    };
  }

  return {
    type: "basic",
    front: `Welche Kernaussage steckt in: ${firstWords(passage)}?`,
    back: passage,
    tags: [config.subject, "ki-entwurf"].filter(Boolean),
    sourceAnchors: [anchor],
    confidence: 0.82,
    warnings: [],
  };
}

export function validateCardGenerationOutput(output, policy = {}) {
  const errors = [];

  if (!output || !Array.isArray(output.cards)) {
    errors.push("cards muss ein Array sein.");
  }

  for (const [index, card] of (output?.cards ?? []).entries()) {
    if (!card.type || !card.front || !card.back) {
      errors.push(`Karte ${index + 1} benoetigt type, front und back.`);
    }
    if (policy.requireSourceAnchors !== false && (!Array.isArray(card.sourceAnchors) || card.sourceAnchors.length === 0)) {
      errors.push(`Karte ${index + 1} benoetigt einen Quellenanker.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateCardsFromDocument({ document, config = {}, deckName = "" }) {
  const policy = {
    costTier: config.costTier ?? "balanced",
    allowLocalModels: true,
    allowExternalModels: false,
    requireSourceAnchors: true,
    requireHumanApprovalForNewCards: true,
  };
  const modelChoice = selectModel("card_generator", policy, { requiresReasoning: false });
  const job = createAiJob({
    jobType: "card_generation",
    inputRef: {
      documentId: document?.id ?? null,
      config,
    },
    policy,
    status: "running",
  });
  const passages = splitDocumentIntoPassages(document?.text ?? config.rawText ?? "", Math.max(1, Number(config.cardCount ?? 6)));
  const cards = passages.map((passage, index) => buildDraftFromPassage(passage, index, config, document));
  const output = {
    cards,
    coverage: {
      sourcePages: config.pageNumber ? [config.pageNumber] : [],
      estimatedCoverage: passages.length > 0 ? Math.min(0.92, passages.length / Math.max(4, Number(config.cardCount ?? 6))) : 0,
      omittedSections: document?.textExtractionStatus === "pending" ? ["Textlayer noch nicht extrahiert"] : [],
    },
    modelRun: {
      id: makeId("run"),
      provider: modelChoice.provider,
      model: modelChoice.model,
      promptVersion: "card-generation-local-v1",
      structuredOutputHash: stableContentHash(cards, "run"),
      validationStatus: "valid",
    },
  };
  const validation = validateCardGenerationOutput(output, policy);

  if (!validation.valid) {
    return {
      job: {
        ...job,
        status: "failed",
        error: { validationErrors: validation.errors },
        finishedAt: new Date().toISOString(),
      },
      draftDeck: null,
      output,
      validation,
    };
  }

  const draftDeck = createAiDraftDeck({
    deckName: deckName || config.subject || "KI-Entwuerfe",
    config,
    drafts: output.cards,
    sourceDocuments: document ? [document] : [],
  });

  return {
    job: {
      ...job,
      status: "succeeded",
      resultRef: {
        draftDeckId: draftDeck.id,
        cardCount: draftDeck.cards.length,
        modelRun: output.modelRun,
      },
      finishedAt: new Date().toISOString(),
    },
    draftDeck,
    output,
    validation,
  };
}

