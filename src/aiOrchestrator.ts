import { createAiDraftDeck, makeId, stableContentHash } from "./coreModel.ts";
import { createAnchorFromSelection, splitDocumentIntoPassages } from "./documentModel.ts";

const CAPABILITY_MODEL = {
  eligibility_classifier: { provider: "local", model: "rule-small", class: "small" },
  variant_rephrase: { provider: "local", model: "rule-rephrase", class: "medium" },
  card_generator: { provider: "local", model: "extractive-draft", class: "medium" },
  source_anchor_validator: { provider: "local", model: "anchor-check", class: "small" },
  graph_builder: { provider: "local", model: "keyword-graph", class: "medium" },
  chat_retriever: { provider: "local", model: "card-search", class: "small" },
  quality_checker: { provider: "local", model: "rule-quality", class: "medium" },
};

export function selectModel(task: any, policy: any = {}, context: any = {}) {
  const capability = (CAPABILITY_MODEL as Record<string, (typeof CAPABILITY_MODEL)["card_generator"]>)[String(task)] ?? CAPABILITY_MODEL.card_generator;
  const costTier = policy.costTier ?? "balanced";

  if (policy.allowExternalModels && costTier === "quality" && context.requiresReasoning) {
    return { provider: "external-ready", model: "quality-router-slot", class: "large", estimatedCost: policy.maxCostPerJob ?? null };
  }

  return { ...capability, estimatedCost: 0 };
}

export function createAiJob({
  jobType,
  deckId = null,
  inputRef = {},
  policy = {},
  status = "queued",
  resultRef = null,
  error = null,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
}: any) {
  const createdAt = new Date().toISOString();
  return {
    id: makeId("job"),
    jobType,
    status,
    contractVersion: 0,
    userId: "local-user",
    deckId,
    inputRef,
    policy,
    resultRef,
    error,
    createdAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    startedAt: status === "queued" ? null : createdAt,
    finishedAt: ["succeeded", "failed", "cancelled"].includes(status) ? createdAt : null,
  };
}

function firstWords(text: any, count: any = 9) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, count)
    .join(" ");
}

function createCloze(passage: any) {
  const words = passage.split(/\s+/);
  const candidateIndex = words.findIndex((word: any) => word.length > 7 && /^[A-Za-zA-ZÄÖÜäöüß-]+$/.test(word));

  if (candidateIndex < 0) {
    return passage;
  }

  const clean = words[candidateIndex].replace(/[,.!?;:]$/, "");
  words[candidateIndex] = words[candidateIndex].replace(clean, `{{c1::${clean}}}`);
  return words.join(" ");
}

function buildDraftFromPassage(passage: any, index: any, config: any, document: any) {
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

export function validateCardGenerationOutput(output: any, policy: any = {}) {
  const errors: any[] = [];

  if (!output || !Array.isArray(output.cards)) {
    errors.push("cards muss ein Array sein.");
  }

  for (const [index, card] of (output?.cards ?? []).entries()) {
    if (!card.type || !card.front || !card.back) {
      errors.push(`Karte ${index + 1} benötigt type, front und back.`);
    }
    if (policy.requireSourceAnchors !== false && (!Array.isArray(card.sourceAnchors) || card.sourceAnchors.length === 0)) {
      errors.push(`Karte ${index + 1} benötigt einen Quellenanker.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateCardsFromDocument({ document, config = {}, deckName = "" }: any) {
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
  const cards = passages.map((passage: any, index: any) => buildDraftFromPassage(passage, index, config, document));
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
    deckName: deckName || config.subject || "KI-Entwürfe",
    config,
    drafts: output.cards.map((card: any) => ({ ...card, type: card.type ?? "basic" })),
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
