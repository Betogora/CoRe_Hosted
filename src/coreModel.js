import { sanitizeCardHtml } from "./htmlSafety.js";

export const CORE_CARD_TYPES = [
  "basic",
  "basic-reversed",
  "cloze",
  "image-occlusion",
  "multiple-choice",
  "free-text",
];

export const CORE_DECK_SOURCES = ["anki-apkg", "manual", "ai-assisted"];

function makeId(prefix) {
  const cryptoPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${cryptoPart}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return unique(tags.map((tag) => String(tag).trim()).filter(Boolean));
  }

  return unique(
    String(tags ?? "")
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

export function createCoreDeck({
  id = makeId("deck"),
  name,
  source,
  originalDeckId = null,
  cards = [],
  tags = [],
  importMeta = {},
  createdAt = new Date().toISOString(),
}) {
  if (!CORE_DECK_SOURCES.includes(source)) {
    throw new Error(`Unbekannte Kartenstapel-Quelle: ${source}`);
  }

  const deckTags = unique([...tags, ...cards.flatMap((card) => card.originalTags ?? [])]);

  return {
    id,
    name: name?.trim() || "Neuer Kartenstapel",
    source,
    originalDeckId,
    createdAt,
    cardCount: cards.length,
    tags: deckTags,
    importMeta,
    cards: cards.map((card) => ({ ...card, deckId: id })),
  };
}

export function createCoreCard({
  id = makeId("card"),
  deckId = "",
  cardType = "basic",
  source,
  sourceCardId = null,
  sourceNoteId = null,
  originalFront = "",
  originalBack = "",
  originalFields = [],
  originalTags = [],
  originalHtml,
  mediaRefs = [],
  draftStatus = "accepted",
  createdAt = new Date().toISOString(),
  meta = {},
}) {
  if (!CORE_CARD_TYPES.includes(cardType)) {
    throw new Error(`Unbekannter Kartentyp: ${cardType}`);
  }

  const sanitizedFront = sanitizeCardHtml(originalFront);
  const sanitizedBack = sanitizeCardHtml(originalBack);
  const fields = originalFields.map((field) => ({
    name: field.name,
    value: sanitizeCardHtml(field.value),
  }));
  const html = sanitizeCardHtml(originalHtml ?? [sanitizedFront, sanitizedBack].filter(Boolean).join("<hr>"));

  return {
    id,
    deckId,
    source,
    sourceCardId,
    sourceNoteId,
    originalFront: sanitizedFront,
    originalBack: sanitizedBack,
    originalFields: fields,
    originalTags: normalizeTags(originalTags),
    originalHtml: html,
    immutableOriginal: {
      front: sanitizedFront,
      back: sanitizedBack,
      fields,
      html,
      capturedAt: createdAt,
      source,
    },
    mediaRefs: unique(mediaRefs),
    kind: cardType,
    draftStatus,
    coreState: {
      isCoreReady: false,
      variantCount: 0,
      lastReviewedAt: null,
      repetitionLevel: 0,
    },
    createdAt,
    meta,
  };
}

export function createManualCoreDeck({ deckName, card, documentContext }) {
  const createdAt = new Date().toISOString();
  const coreCard = createCoreCard({
    source: "manual",
    cardType: card.cardType,
    originalFront: card.front,
    originalBack: card.back,
    originalFields: [
      { name: "Front", value: card.front },
      { name: "Back", value: card.back },
      { name: "Source selection", value: documentContext?.selection ?? "" },
    ].filter((field) => field.value),
    originalTags: card.tags,
    mediaRefs: card.mediaRefs,
    draftStatus: "accepted",
    createdAt,
    meta: {
      documentContext,
      answerOptions: card.answerOptions ?? [],
    },
  });

  return createCoreDeck({
    name: deckName,
    source: "manual",
    cards: [coreCard],
    createdAt,
    importMeta: {
      creationMethod: "manual",
      documentAssisted: Boolean(documentContext?.selection),
    },
  });
}

export function createAiDraftDeck({ deckName, config, drafts }) {
  const createdAt = new Date().toISOString();
  const cards = drafts.map((draft) =>
    createCoreCard({
      source: "ai-assisted",
      cardType: draft.cardType,
      originalFront: draft.front,
      originalBack: draft.back,
      originalTags: draft.tags,
      draftStatus: "draft",
      createdAt,
      meta: {
        aiConfig: config,
        reviewRequired: true,
      },
    }),
  );

  return createCoreDeck({
    name: deckName,
    source: "ai-assisted",
    cards,
    createdAt,
    importMeta: {
      creationMethod: "ai-assisted",
      draftOnly: true,
      config,
    },
  });
}

export function acceptAiDraftDeck(deck) {
  return {
    ...deck,
    cardCount: deck.cards.length,
    importMeta: {
      ...deck.importMeta,
      draftOnly: false,
      acceptedAt: new Date().toISOString(),
    },
    cards: deck.cards.map((card) => ({
      ...card,
      draftStatus: "accepted",
    })),
  };
}
