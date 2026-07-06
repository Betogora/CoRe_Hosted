import { stripHtml } from "./htmlSafety.js";
import {
  CORE_CARD_TYPES,
  addRephrasedVariant,
  createCardVariant,
  createDefaultDeckSettings,
  createVersionEntry,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  stableContentHash,
} from "./coreModel.js";

const VOCAB_TAGS = ["vocab", "vocabulary", "vokabel", "wortschatz", "translation"];
const EXACT_WORDING_TAGS = ["exact", "wortlaut", "definition", "quote", "gesetz"];
const DEFAULT_VARIANT_TYPES = ["basic", "cloze", "reverse"];
const AUTOMATIC_REPHRASE_TYPES = new Set(DEFAULT_VARIANT_TYPES);
const TRANSFER_LIKE_TYPES = new Set(["transfer", "case"]);
const DEFAULT_VARIATION_PROMPT_OPTIONS = {
  numberOfVariants: 3,
  language: "de",
  maxVariantLevel: 3,
  allowedVariantTypes: DEFAULT_VARIANT_TYPES,
  keepCloseToOriginal: true,
  allowNewFacts: false,
  allowTransfer: false,
  allowCaseVignette: false,
};

export const CARD_VARIATION_PROMPT_VERSION = "card-variation-near-rephrase-v1";

export const CARD_VARIATION_PROMPT_TEMPLATE = `SYSTEM / INSTRUCTION:
Du erzeugst Karteikartenvarianten. Eine Variante ist keine neue Karte, sondern eine nahe Umformulierung derselben Wissenseinheit. Bleibe bei denselben Fakten. Fuege keine neuen Inhalte hinzu. Erzeuge keine Transferfragen, keine Fallvignetten und keine Fragen zu angrenzenden Themen, ausser dies wird ausdruecklich erlaubt. Die Antwort muss weiterhin aus der Originalantwort ableitbar sein.

USER-CONTEXT:
Originalfrage:
{{canonicalQuestion}}

Originalantwort:
{{canonicalAnswer}}

Optional vorhandene Varianten:
{{existingVariants}}

Aufgabe:
Erzeuge {{numberOfVariants}} neue Varianten derselben Karte.

Regeln:
- gleiche Wissenseinheit
- keine neuen Fakten
- keine neuen Konzepte
- nahe Umformulierung
- kurze, klare Frage
- Antwort fachlich gleichwertig zur Originalantwort
- keine Fallbeispiele
- keine Transferfragen
- keine Erklaertexte als Frage
- keine unnoetig abstrakte Formulierung
- Sprache: {{language}}

Erlaubte Typen:
{{allowedVariantTypes}}

Ausgabeformat:
Gib ausschliesslich valides JSON zurueck.

JSON-Schema:
{
  "variants": [
    {
      "front": "string",
      "back": "string",
      "variantType": "basic | cloze | reverse",
      "variantLevel": 1,
      "relationToOriginal": "same_card_rephrasing",
      "containsNewFacts": false,
      "abstractionLevel": 1,
      "reason": "kurze Begruendung, warum es dieselbe Karte bleibt"
    }
  ]
}

Wichtige Regel:
Wenn du keine sinnvolle nahe Variante erzeugen kannst, gib weniger Varianten zurueck. Erfinde keine neuen Inhalte.`;

function plain(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function normalizeComparisonText(value) {
  return plain(value).toLowerCase();
}

function normalizeVariantGenerationOptions(options = {}) {
  const requestedTypes = Array.isArray(options.allowedVariantTypes) && options.allowedVariantTypes.length > 0
    ? options.allowedVariantTypes
    : DEFAULT_VARIATION_PROMPT_OPTIONS.allowedVariantTypes;
  const allowedVariantTypes = requestedTypes
    .filter((type) => DEFAULT_VARIANT_TYPES.includes(type) || (type === "transfer" && options.allowTransfer) || (type === "case" && options.allowCaseVignette))
    .filter((type, index, list) => list.indexOf(type) === index);

  return {
    ...DEFAULT_VARIATION_PROMPT_OPTIONS,
    ...options,
    numberOfVariants: Math.max(1, Math.round(Number(options.numberOfVariants ?? DEFAULT_VARIATION_PROMPT_OPTIONS.numberOfVariants) || 1)),
    language: options.language ?? DEFAULT_VARIATION_PROMPT_OPTIONS.language,
    maxVariantLevel: Math.min(3, Math.max(1, Math.round(Number(options.maxVariantLevel ?? DEFAULT_VARIATION_PROMPT_OPTIONS.maxVariantLevel) || 3))),
    allowedVariantTypes: allowedVariantTypes.length > 0 ? allowedVariantTypes : DEFAULT_VARIANT_TYPES,
    keepCloseToOriginal: options.keepCloseToOriginal ?? DEFAULT_VARIATION_PROMPT_OPTIONS.keepCloseToOriginal,
    allowNewFacts: options.allowNewFacts ?? DEFAULT_VARIATION_PROMPT_OPTIONS.allowNewFacts,
    allowTransfer: options.allowTransfer ?? DEFAULT_VARIATION_PROMPT_OPTIONS.allowTransfer,
    allowCaseVignette: options.allowCaseVignette ?? DEFAULT_VARIATION_PROMPT_OPTIONS.allowCaseVignette,
  };
}

function extractExistingVariants(item) {
  return (item?.variants ?? [])
    .filter((variant) => !variant.isOriginal)
    .map((variant, index) => `${index + 1}. ${plain(variant.front)} -> ${plain(variant.back)}`)
    .join("\n") || "Keine.";
}

function fillPromptTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

function parseResponseText(response) {
  if (typeof response === "string") return response;
  if (typeof response?.content === "string") return response.content;
  if (typeof response?.text === "string") return response.text;
  if (typeof response?.rawResponse === "string") return response.rawResponse;
  if (response && typeof response === "object") return JSON.stringify(response);
  return "";
}

function extractJsonPayload(text) {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function transformTypeForVariantType(variantType) {
  if (variantType === "cloze") return "cloze_conversion";
  if (variantType === "reverse") return "front_back_style_shift";
  return "rephrase";
}

function collectDuplicateKeys(item) {
  const keys = new Set();
  const originalFront = getLearningItemQuestion(item);
  const originalBack = getLearningItemAnswer(item);
  if (originalFront || originalBack) {
    keys.add(`${normalizeComparisonText(originalFront)}\n${normalizeComparisonText(originalBack)}`);
  }

  for (const variant of item?.variants ?? []) {
    keys.add(`${normalizeComparisonText(variant.front)}\n${normalizeComparisonText(variant.back)}`);
  }

  return keys;
}

export function buildCardVariationPrompt(item, options = {}) {
  const normalizedOptions = normalizeVariantGenerationOptions(options);
  const canonicalQuestion = plain(getLearningItemQuestion(item) || item?.originalFront || item?.front);
  const canonicalAnswer = plain(getLearningItemAnswer(item) || item?.originalBack || item?.back);
  const prompt = fillPromptTemplate(CARD_VARIATION_PROMPT_TEMPLATE, {
    canonicalQuestion,
    canonicalAnswer,
    existingVariants: extractExistingVariants(item),
    numberOfVariants: normalizedOptions.numberOfVariants,
    language: normalizedOptions.language,
    allowedVariantTypes: normalizedOptions.allowedVariantTypes.join(", "),
  });
  const constraints = [
    `Prompt-Version: ${CARD_VARIATION_PROMPT_VERSION}`,
    `Maximales Varianten-Level: ${normalizedOptions.maxVariantLevel}`,
    `Nahe am Original bleiben: ${normalizedOptions.keepCloseToOriginal ? "ja" : "nein"}`,
    `Neue Fakten erlaubt: ${normalizedOptions.allowNewFacts ? "ja" : "nein"}`,
    `Transferfragen erlaubt: ${normalizedOptions.allowTransfer ? "ja" : "nein"}`,
    `Fallvignetten erlaubt: ${normalizedOptions.allowCaseVignette ? "ja" : "nein"}`,
  ];

  return `${prompt}\n\nZusaetzliche Optionen:\n${constraints.map((constraint) => `- ${constraint}`).join("\n")}`;
}

export function validateVariantSuggestion(suggestion, originalItem = null, options = {}) {
  const normalizedOptions = normalizeVariantGenerationOptions(options);
  const errors = [];
  const warnings = [];
  const front = plain(suggestion?.front);
  const back = plain(suggestion?.back);
  const variantType = suggestion?.variantType ?? "basic";
  const variantLevel = Math.round(Number(suggestion?.variantLevel ?? 1) || 1);
  const relationToOriginal = suggestion?.relationToOriginal ?? "same_card_rephrasing";
  const containsNewFacts = Boolean(suggestion?.containsNewFacts);
  const abstractionLevel = Math.round(Number(suggestion?.abstractionLevel ?? 1) || 1);

  if (!front) errors.push("front fehlt oder ist leer.");
  if (!back) errors.push("back fehlt oder ist leer.");
  if (!normalizedOptions.allowedVariantTypes.includes(variantType)) {
    errors.push(`variantType ${String(variantType)} ist nicht erlaubt.`);
  }
  if (TRANSFER_LIKE_TYPES.has(variantType) && !(normalizedOptions.allowTransfer || normalizedOptions.allowCaseVignette)) {
    errors.push("Transfer- oder Case-Varianten sind standardmaessig nicht erlaubt.");
  }
  if (variantLevel < 1 || variantLevel > normalizedOptions.maxVariantLevel) {
    errors.push(`variantLevel muss zwischen 1 und ${normalizedOptions.maxVariantLevel} liegen.`);
  }
  if (relationToOriginal !== "same_card_rephrasing" && !normalizedOptions.allowTransfer) {
    errors.push("relationToOriginal muss same_card_rephrasing sein.");
  }
  if (containsNewFacts && !normalizedOptions.allowNewFacts) {
    errors.push("containsNewFacts=true ist fuer nahe Varianten nicht erlaubt.");
  }
  if (abstractionLevel > 2 && !normalizedOptions.allowTransfer) {
    errors.push("abstractionLevel darf standardmaessig hoechstens 2 sein.");
  }

  if (originalItem) {
    const duplicateKey = `${normalizeComparisonText(front)}\n${normalizeComparisonText(back)}`;
    if (collectDuplicateKeys(originalItem).has(duplicateKey)) {
      errors.push("Variante ist eine identische Dublette zur Originalkarte oder zu bestehenden Varianten.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestion: {
      front,
      back,
      variantType,
      variantLevel: Math.min(normalizedOptions.maxVariantLevel, Math.max(1, variantLevel)),
      relationToOriginal,
      containsNewFacts,
      abstractionLevel,
      reason: plain(suggestion?.reason),
      generationSource: "ai_generated",
      transformType: transformTypeForVariantType(variantType),
    },
  };
}

export function parseVariantGenerationResponse(response, options = {}) {
  const warnings = [];
  const errors = [];
  const skippedVariants = [];
  const variants = [];
  const payload = extractJsonPayload(parseResponseText(response));
  let parsed = null;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    return {
      variants,
      skippedVariants,
      warnings,
      errors: [`KI-Antwort ist kein gueltiges JSON: ${error.message}`],
      rawJson: payload,
    };
  }

  if (!parsed || !Array.isArray(parsed.variants)) {
    return {
      variants,
      skippedVariants,
      warnings,
      errors: ["KI-Antwort benoetigt ein variants-Array."],
      rawJson: payload,
    };
  }

  parsed.variants.forEach((suggestion, index) => {
    const validation = validateVariantSuggestion(suggestion, options.originalItem, options);
    warnings.push(...validation.warnings.map((warning) => `Variante ${index + 1}: ${warning}`));
    if (validation.valid) {
      variants.push(validation.suggestion);
      return;
    }

    skippedVariants.push({
      index,
      suggestion,
      errors: validation.errors,
    });
  });

  return {
    variants,
    skippedVariants,
    warnings,
    errors,
    rawJson: payload,
  };
}

export function generateRephrasedVariantsForLearningItem(item, options = {}) {
  const promptUsed = buildCardVariationPrompt(item, options);
  const provider = options.variantProvider ?? options.provider ?? null;
  const providerResponse = provider
    ? provider({ prompt: promptUsed, learningItem: item, options: normalizeVariantGenerationOptions(options) })
    : null;
  const rawResponse = options.mockResponse ?? options.response ?? options.rawResponse ?? providerResponse;
  const warnings = [];

  if (!rawResponse) {
    return {
      learningItem: item,
      card: item,
      createdVariants: [],
      skippedVariants: [],
      warnings: ["Keine KI-Antwort vorhanden. Uebergib mockResponse/response oder einen provider, um Varianten zu erzeugen."],
      promptUsed,
    };
  }

  if (rawResponse && typeof rawResponse.then === "function") {
    return {
      learningItem: item,
      card: item,
      createdVariants: [],
      skippedVariants: [],
      warnings: ["Asynchrone Provider-Antworten sind in der lokalen Sync-Pipeline noch nicht angeschlossen."],
      promptUsed,
    };
  }

  let updatedItem = item;
  const createdVariants = [];
  const skippedVariants = [];
  const parseResult = parseVariantGenerationResponse(rawResponse, { ...options, originalItem: updatedItem });
  warnings.push(...parseResult.warnings);
  skippedVariants.push(...parseResult.skippedVariants);

  if (parseResult.errors.length > 0) {
    return {
      learningItem: updatedItem,
      card: updatedItem,
      createdVariants,
      skippedVariants,
      warnings,
      errors: parseResult.errors,
      promptUsed,
      ...(options.includeRawResponse ? { rawResponse } : {}),
    };
  }

  for (const suggestion of parseResult.variants) {
    const validation = validateVariantSuggestion(suggestion, updatedItem, options);
    if (!validation.valid) {
      skippedVariants.push({ suggestion, errors: validation.errors });
      continue;
    }

    const originalVariant = getOriginalVariant(updatedItem);
    updatedItem = addRephrasedVariant(updatedItem, validation.suggestion.front, validation.suggestion.back, {
      variantType: validation.suggestion.variantType,
      variantLevel: validation.suggestion.variantLevel,
      generationSource: "ai_generated",
      transformType: validation.suggestion.transformType,
      explanation: validation.suggestion.reason,
      anchorVariantId: originalVariant?.id,
      parentVariantId: originalVariant?.id,
      modelRunId: options.modelRunId ?? null,
      meta: {
        promptVersion: CARD_VARIATION_PROMPT_VERSION,
        relationToOriginal: validation.suggestion.relationToOriginal,
        containsNewFacts: validation.suggestion.containsNewFacts,
        abstractionLevel: validation.suggestion.abstractionLevel,
        style: options.style ?? null,
      },
    });
    const createdVariant = updatedItem.variants.find((variant) => variant.front === validation.suggestion.front && !variant.isOriginal) ?? null;
    if (createdVariant) createdVariants.push(createdVariant);
  }

  return {
    learningItem: updatedItem,
    card: updatedItem,
    createdVariants,
    skippedVariants,
    warnings,
    promptUsed,
    ...(options.includeRawResponse ? { rawResponse } : {}),
  };
}

function lowerTags(card) {
  return (card.originalTags ?? []).map((tag) => String(tag).toLowerCase());
}

function containsMathLikeText(text) {
  return /(\$[^$]+\$|\\\(|\\\[|=>|<=|>=|[a-z]\s*=\s*[^?]+)/i.test(text);
}

function isVeryShort(front, back) {
  const combinedLength = `${front} ${back}`.trim().length;
  return front.length < 10 || back.length < 8 || combinedLength < 34;
}

function blockedByDeckSettings(card, deckSettings, transformType) {
  const blacklist = deckSettings.blacklist ?? {};
  const tags = lowerTags(card);

  return (
    blacklist.cardTypes?.includes(card.kind) ||
    blacklist.cardIds?.includes(card.id) ||
    blacklist.transforms?.includes(transformType) ||
    tags.some((tag) => blacklist.tags?.map((value) => String(value).toLowerCase()).includes(tag))
  );
}

export function classifyCardEligibility(card, deckSettings = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const front = plain(card.originalFront);
  const back = plain(card.originalBack);
  const tags = lowerTags(card);
  const reasons = [];
  const blockedTransforms = [];

  if (!CORE_CARD_TYPES.includes(card.kind)) {
    reasons.push("Unbekannter Kartentyp.");
  }
  if (settings.coreMode === "off") {
    reasons.push("CoRe-Modus ist fuer diesen Stapel ausgeschaltet.");
  }
  if (blockedByDeckSettings(card, settings, "rephrase")) {
    reasons.push("Deck-, Karten- oder Transformations-Blacklist greift.");
    blockedTransforms.push("rephrase");
  }
  if (tags.some((tag) => VOCAB_TAGS.includes(tag))) {
    reasons.push("Vokabel- oder reine Uebersetzungskarte.");
  }
  if (tags.some((tag) => EXACT_WORDING_TAGS.includes(tag)) || card.meta?.exactWordingRequired) {
    reasons.push("Exakter Wortlaut ist wahrscheinlich Lernziel.");
  }
  if (card.kind === "image-occlusion") {
    reasons.push("Bildvariation ist im MVP nicht aktiv.");
    blockedTransforms.push("image_variation");
  }
  if (isVeryShort(front, back)) {
    reasons.push("Zu wenig textlicher Kontext fuer robuste Variation.");
  }
  if (containsMathLikeText(`${front} ${back}`)) {
    reasons.push("Mathematische oder formelartige Karte braucht manuelle Freigabe.");
  }

  const eligible = reasons.length === 0;
  const allowedTransforms = eligible
    ? ["rephrase", ...(card.kind === "basic" ? ["front_back_style_shift", "cloze_conversion"] : [])]
    : [];
  const score = eligible ? Math.min(0.95, 0.58 + Math.min(0.3, (front.length + back.length) / 700)) : Math.max(0.08, 0.42 - reasons.length * 0.07);

  return {
    eligible,
    score: Math.round(score * 100) / 100,
    allowedTransforms,
    blockedTransforms,
    reason: eligible ? "Ausreichend textlicher Kontext und kein Blacklist-Treffer." : reasons.join(" "),
    recommendedCoreMode: eligible ? settings.coreMode : "off_or_original_only",
  };
}

function rephraseQuestion(front) {
  const clean = plain(front).replace(/\?+$/, "");

  if (/^was\s+ist\s+/i.test(clean)) {
    return clean.replace(/^was\s+ist\s+/i, "Wie laesst sich ") + " beschreiben?";
  }
  if (/^welche\s+/i.test(clean)) {
    return clean.replace(/^welche\s+/i, "Nenne die ") + ".";
  }
  if (/^warum\s+/i.test(clean)) {
    return clean.replace(/^warum\s+/i, "Begruende, weshalb ") + ".";
  }
  if (/^wie\s+/i.test(clean)) {
    return clean.replace(/^wie\s+/i, "Beschreibe, wie ") + ".";
  }

  return `Formuliere den Kerninhalt zu: ${clean}`;
}

export function createRephraseVariant(card, options = {}) {
  const profile = {
    language: options.language ?? "de",
    preserveMeaning: true,
    reduceVisualRecognition: true,
    maxVariants: 1,
    style: options.style ?? "careful-local-rephrase",
  };
  const variantFront = rephraseQuestion(card.originalFront);
  const variantBack = card.originalBack;

  return createCardVariant({
    sourceCardId: card.id,
    learningItemId: card.id,
    cardId: card.id,
    variantType: "basic",
    variantLevel: 2,
    front: variantFront,
    back: variantBack,
    transformType: "rephrase",
    transformProfile: profile,
    generationSource: "ai_generated",
    isOriginal: false,
    modelRunId: options.modelRunId ?? null,
    confidence: options.confidence ?? 0.82,
    semanticDelta: "none",
    changedRecognitionCues: ["opening", "ending", "case_pattern"],
    sourceAnchors: card.sourceAnchors ?? [],
    meta: {
      generatedBy: "local-core-variant-service",
      sourceContentHash: card.contentHash,
    },
  });
}

export function getActiveVariants(card) {
  return (card.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal);
}

function inferLearningPhase(state = {}) {
  const repetitions = Number(state.repetitions ?? 0);
  if (!state.state || (state.state === "new" && repetitions > 0)) return repetitions > 0 ? "review" : "new";
  return state.state;
}

function clampAutomaticLevel(level) {
  return Math.min(3, Math.max(1, Math.round(Number(level) || 1)));
}

function rotateVariant(candidates, state = {}) {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((left, right) => {
    const levelDiff = Number(left.variantLevel ?? 1) - Number(right.variantLevel ?? 1);
    return levelDiff || String(left.id).localeCompare(String(right.id));
  });
  const index = Math.abs(Number(state.repetitions ?? 0)) % sorted.length;
  return sorted[index];
}

export function isAutomaticRephraseVariant(variant, options = {}) {
  if (!variant || variant.isOriginal || variant.qualityStatus !== "active" || variant.isActive === false) return false;
  const variantType = variant.variantType ?? "basic";
  const variantLevel = Number(variant.variantLevel ?? 1);
  const explicitlyAllowedTransferLike = (variantType === "transfer" && options.allowTransfer) || (variantType === "case" && options.allowCaseVignette);
  if (!AUTOMATIC_REPHRASE_TYPES.has(variantType) && !explicitlyAllowedTransferLike) return false;
  if (variantLevel < 1 || variantLevel > (options.maxVariantLevel ?? 3)) return false;
  if (variant.meta?.relationToOriginal && variant.meta.relationToOriginal !== "same_card_rephrasing") return Boolean(options.allowTransfer);
  if (variant.meta?.containsNewFacts) return Boolean(options.allowNewFacts);
  if (Number(variant.meta?.abstractionLevel ?? 1) > 2 && !options.allowTransfer) return false;
  return true;
}

export function selectAutomaticReviewVariant(card, options = {}) {
  const original = getOriginalVariant(card);
  const state = card?.learningItemState ?? card?.reviewState ?? {};
  const phase = inferLearningPhase(state);
  const preferredLevel = clampAutomaticLevel(options.preferredVariantLevel ?? state.preferredVariantLevel ?? 1);
  const nearVariants = getActiveVariants(card).filter((variant) =>
    isAutomaticRephraseVariant(variant, {
      maxVariantLevel: 3,
      allowNewFacts: false,
      allowTransfer: Boolean(options.allowTransfer),
      allowCaseVignette: Boolean(options.allowCaseVignette),
    }),
  );

  if (phase === "new") return original;

  if (state.lastRating === "again" || state.lastRating === "hard") {
    return nearVariants.find((variant) => Number(variant.variantLevel ?? 1) <= 1) ?? original;
  }

  if (phase === "learning" || phase === "relearning") {
    if (!options.allowLearningVariant) return original;
    return rotateVariant(nearVariants.filter((variant) => Number(variant.variantLevel ?? 1) <= Math.min(2, preferredLevel)), state) ?? original;
  }

  if (phase === "review") {
    const allowed = nearVariants.filter((variant) => Number(variant.variantLevel ?? 1) <= preferredLevel);
    if (state.lastRating === "good" || state.lastRating === "easy") {
      return rotateVariant(allowed.filter((variant) => Number(variant.variantLevel ?? 1) >= 2), state) ?? rotateVariant(allowed, state) ?? original;
    }
    return rotateVariant(allowed, state) ?? original;
  }

  return original;
}

export function ensureVariantsForCard(card, deckSettings = {}, options = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const eligibility = classifyCardEligibility(card, settings);
  const activeVariants = getActiveVariants(card);

  if (!eligibility.eligible || activeVariants.length >= settings.maxActiveVariantsPerCard) {
    return {
      card: {
        ...card,
        meta: { ...card.meta, eligibility },
        coreState: { ...card.coreState, eligibility, variantCount: activeVariants.length },
      },
      generated: [],
      eligibility,
    };
  }

  const nextVariant = createRephraseVariant(card, options);
  const existingHashes = new Set((card.variants ?? []).map((variant) => variant.contentHash));
  const generated = existingHashes.has(nextVariant.contentHash) ? [] : [nextVariant];
  const existingGeneratedVariants = (card.variants ?? []).filter((variant) => !variant.isOriginal);
  const originalVariants = (card.variants ?? []).filter((variant) => variant.isOriginal);
  const variants = [...existingGeneratedVariants, ...generated, ...originalVariants];

  return {
    card: {
      ...card,
      variants,
      meta: { ...card.meta, eligibility },
      coreState: {
        ...card.coreState,
        eligibility,
        variantCount: variants.filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal).length,
      },
      updatedAt: new Date().toISOString(),
    },
    generated,
    eligibility,
  };
}

export function toReviewable(card, variant = null) {
  if (!variant) {
    return {
      id: card.id,
      reviewableType: "card",
      sourceCardId: card.id,
      front: card.originalFront,
      back: card.originalBack,
      sourceAnchors: card.sourceAnchors ?? [],
      isVariant: false,
      card,
    };
  }

  return {
    id: variant.id,
    reviewableType: "variant",
    sourceCardId: card.id,
    front: variant.front,
    back: variant.back,
    sourceAnchors: variant.sourceAnchors ?? card.sourceAnchors ?? [],
    transformType: variant.transformType,
    isVariant: true,
    card,
    variant,
  };
}

export function chooseReviewCard(card, deckSettings = {}, options = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const baseEligibility = classifyCardEligibility(card, settings);
  let nextCard = {
    ...card,
    meta: { ...card.meta, eligibility: baseEligibility },
    coreState: { ...card.coreState, eligibility: baseEligibility },
  };

  if (settings.coreMode === "off" || !baseEligibility.eligible) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const maturityXp = Number(card.reviewState?.maturityXp ?? card.coreState?.maturityXp ?? 0);
  if (maturityXp < settings.variantThresholdXp) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  if (settings.coreMode === "manual" && !options.variantSession) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const activeVariant = selectAutomaticReviewVariant(nextCard, { allowLearningVariant: true });
  if (activeVariant && !activeVariant.isOriginal) {
    return { card: nextCard, reviewable: toReviewable(nextCard, activeVariant), generated: [], eligibility: baseEligibility };
  }

  if (options.allowGenerate === false) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const ensured = ensureVariantsForCard(nextCard, settings, options);
  nextCard = ensured.card;
  const generatedVariant = ensured.generated[0] ?? null;

  return {
    card: nextCard,
    reviewable: generatedVariant && options.showGeneratedImmediately !== false ? toReviewable(nextCard, generatedVariant) : toReviewable(nextCard),
    generated: ensured.generated,
    eligibility: ensured.eligibility,
  };
}

export function deactivateVariant(card, variantId, reason = "Nutzer hat die Variante deaktiviert.") {
  const updatedAt = new Date().toISOString();
  return {
    ...card,
    variants: (card.variants ?? []).map((variant) =>
      variant.id === variantId
        ? {
            ...variant,
            qualityStatus: "disabled",
            updatedAt,
            versionLog: [
              ...(variant.versionLog ?? []),
              createVersionEntry({
                objectType: "variant",
                objectId: variant.id,
                changeType: "disabled",
                before: { qualityStatus: variant.qualityStatus },
                after: { qualityStatus: "disabled" },
                reason,
                createdAt: updatedAt,
              }),
            ],
          }
        : variant,
    ),
    updatedAt,
  };
}

export function flagVariant(card, variantId, feedbackType, note = "") {
  const updatedAt = new Date().toISOString();
  const feedback = {
    id: stableContentHash({ variantId, feedbackType, note, updatedAt }, "feedback"),
    type: feedbackType,
    note,
    createdAt: updatedAt,
  };

  return {
    ...card,
    variants: (card.variants ?? []).map((variant) =>
      variant.id === variantId
        ? {
            ...variant,
            qualityStatus: "flagged",
            feedback: [...(variant.feedback ?? []), feedback],
            updatedAt,
            versionLog: [
              ...(variant.versionLog ?? []),
              createVersionEntry({
                objectType: "variant",
                objectId: variant.id,
                changeType: "flagged",
                before: { qualityStatus: variant.qualityStatus },
                after: { qualityStatus: "flagged", feedbackType },
                reason: note,
                createdAt: updatedAt,
              }),
            ],
          }
        : variant,
    ),
    updatedAt,
  };
}

