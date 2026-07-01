import { stripHtml } from "./htmlSafety.js";
import {
  CORE_CARD_TYPES,
  createCardVariant,
  createDefaultDeckSettings,
  createVersionEntry,
  stableContentHash,
} from "./coreModel.js";

const VOCAB_TAGS = ["vocab", "vocabulary", "vokabel", "wortschatz", "translation"];
const EXACT_WORDING_TAGS = ["exact", "wortlaut", "definition", "quote", "gesetz"];

function plain(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
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
    front: variantFront,
    back: variantBack,
    transformType: "rephrase",
    transformProfile: profile,
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
  return (card.variants ?? []).filter((variant) => variant.qualityStatus === "active");
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
  const variants = [...(card.variants ?? []), ...generated];

  return {
    card: {
      ...card,
      variants,
      meta: { ...card.meta, eligibility },
      coreState: {
        ...card.coreState,
        eligibility,
        variantCount: variants.filter((variant) => variant.qualityStatus === "active").length,
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

  const activeVariant = getActiveVariants(nextCard)[0];
  if (activeVariant) {
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

