import {
  addRephrasedVariant,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
} from "./coreModel.js";
import { stripHtml } from "./htmlSafety.js";

const DEFAULT_VARIANT_TYPES = ["basic", "cloze", "reverse"];
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
Du erzeugst Karteikartenvarianten. Eine Variante ist keine neue Karte, sondern eine nahe Umformulierung derselben Wissenseinheit. Bleibe bei denselben Fakten. Füge keine neuen Inhalte hinzu. Erzeuge keine Transferfragen, keine Fallvignetten und keine Fragen zu angrenzenden Themen, außer dies wird ausdrücklich erlaubt. Die Antwort muss weiterhin aus der Originalantwort ableitbar sein.

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
- keine Erklärungstexte als Frage
- keine unnötig abstrakte Formulierung
- Sprache: {{language}}

Erlaubte Typen:
{{allowedVariantTypes}}

Ausgabeformat:
Gib ausschließlich valides JSON zurück.

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
      "reason": "kurze Begründung, warum es dieselbe Karte bleibt"
    }
  ]
}

Wichtige Regel:
Wenn du keine sinnvolle nahe Variante erzeugen kannst, gib weniger Varianten zurück. Erfinde keine neuen Inhalte.`;

function plain(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function normalizeComparisonText(value) {
  return plain(value).toLowerCase();
}

function normalizeVariantGenerationOptions(options = {}) {
  const requestedTypes =
    Array.isArray(options.allowedVariantTypes) && options.allowedVariantTypes.length > 0
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
  return (
    (item?.variants ?? [])
      .filter((variant) => !variant.isOriginal)
      .map((variant, index) => `${index + 1}. ${plain(variant.front)} -> ${plain(variant.back)}`)
      .join("\n") || "Keine."
  );
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

  return `${prompt}\n\nZusätzliche Optionen:\n${constraints.map((constraint) => `- ${constraint}`).join("\n")}`;
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
    errors.push("Transfer- oder Case-Varianten sind standardmäßig nicht erlaubt.");
  }
  if (variantLevel < 1 || variantLevel > normalizedOptions.maxVariantLevel) {
    errors.push(`variantLevel muss zwischen 1 und ${normalizedOptions.maxVariantLevel} liegen.`);
  }
  if (relationToOriginal !== "same_card_rephrasing" && !normalizedOptions.allowTransfer) {
    errors.push("relationToOriginal muss same_card_rephrasing sein.");
  }
  if (containsNewFacts && !normalizedOptions.allowNewFacts) {
    errors.push("containsNewFacts=true ist für nahe Varianten nicht erlaubt.");
  }
  if (abstractionLevel > 2 && !normalizedOptions.allowTransfer) {
    errors.push("abstractionLevel darf standardmäßig höchstens 2 sein.");
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
      errors: [`KI-Antwort ist kein gültiges JSON: ${error.message}`],
      rawJson: payload,
    };
  }

  if (!parsed || !Array.isArray(parsed.variants)) {
    return {
      variants,
      skippedVariants,
      warnings,
      errors: ["KI-Antwort benötigt ein variants-Array."],
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
      warnings: ["Keine KI-Antwort vorhanden. Übergib mockResponse/response oder einen provider, um Varianten zu erzeugen."],
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
