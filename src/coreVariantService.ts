import { createCardVariant, createDefaultDeckSettings, getActiveVariants, stableContentHash } from "./coreModel.ts";
import { stripSanitizedHtml } from "./htmlSafety.ts";
import { isCardReadyForVariants } from "./coreVariantService/variantSelection.ts";
import { getDurabilityDays } from "./scheduler.ts";
import type { Card, CardVariant, Note, VariantFeedbackType } from "./coreTypes.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];

export { selectReviewVariant } from "./coreVariantService/variantSelection.ts";

function plainText(html: string): string {
  return stripSanitizedHtml(html).replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/** Plain question and answer of a reveal card; the only source of AI rephrasings (other building blocks follow later). */
export function cardVariantSource(note: Pick<Note, "content">, card: Pick<Card, "promptKey">): { front: string; back: string } | null {
  const { content } = note;
  if (content.interaction.kind !== "reveal") return null;
  const prompt = content.interaction.prompts.find((candidate) => candidate.key === card.promptKey);
  if (!prompt) return null;
  const fieldText = (ids: string[]) => ids
    .map((id) => content.fields.find((field) => field.id === id))
    .map((field) => field ? plainText(field.html) : "")
    .filter(Boolean)
    .join(" ");
  const front = fieldText(prompt.questionFieldIds);
  const back = fieldText(prompt.answerFieldIds);
  return front && back ? { front, back } : null;
}

/** A rephrased variant shown as a transient front/back content of its card; extra and source fields stay visible. */
export function variantPresentation(note: Note, card: Card, variant: CardVariant): { note: Note; card: Card } {
  const supplements = note.content.fields.filter((field) => field.role === "extra" || field.role === "source");
  return {
    note: {
      ...note,
      content: {
        schemaVersion: 1,
        fields: [
          { id: "variant-front", name: "Vorderseite", role: "prompt", html: variant.front },
          { id: "variant-back", name: "Rückseite", role: "answer", html: variant.back },
          ...supplements,
        ],
        interaction: { kind: "reveal", prompts: [{ key: "forward", name: "Variante", instruction: "", questionFieldIds: ["variant-front"], answerFieldIds: ["variant-back"], requires: null, typeInFieldId: null }] },
        speech: [],
        tags: note.content.tags,
      },
    },
    card: { ...card, id: variant.id, promptKey: "forward" },
  };
}

/** Whether a new rephrasing may be generated for the card; the reasons explain a disabled action. */
export function classifyCardEligibility(note: Pick<Note, "content">, card: Card, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const reasons: string[] = [];
  if (settings.coreMode === "off") reasons.push("Content Repetition ist für diesen Stapel ausgeschaltet.");
  if (note.content.interaction.kind !== "reveal") reasons.push("Varianten gibt es nur für Karten mit Frage und Antwort.");
  else if (!cardVariantSource(note, card)) reasons.push("Frage oder Antwort fehlt.");
  if (getActiveVariants(card).length >= settings.maxActiveVariantsPerCard) {
    reasons.push(`Die Karte hat bereits ${settings.maxActiveVariantsPerCard === 1 ? "eine aktive Variante" : `${settings.maxActiveVariantsPerCard} aktive Varianten`}; mehr erlaubt der Stapel nicht.`);
  }
  return { eligible: reasons.length === 0, reasons };
}

/** Durability of a card compared with the deck's threshold for asking rephrasings. */
export function describeVariantReadiness(card: Card, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const ready = isCardReadyForVariants(card, settings);
  const reason = settings.coreMode === "off"
    ? "Content Repetition ist für diesen Stapel ausgeschaltet."
    : ready
      ? "Im Review wechseln sich die Karte und ihre Varianten ab."
      : card.study.state !== "review" || card.study.lastRating === "again"
        ? "Bis zur nächsten richtigen Wiederholung wird die Karte selbst abgefragt."
        : "Bis zur Haltbarkeit des Stapels wird die Karte selbst abgefragt.";
  return {
    durabilityDays: Math.round(getDurabilityDays({ state: card.study.state, stability: card.study.stability, stabilityFast: card.study.extra.stabilityFast, difficulty: card.study.difficulty })),
    thresholdDays: settings.variantThresholdDays,
    ready,
    reason,
    activeCount: getActiveVariants(card).length,
    maxActive: settings.maxActiveVariantsPerCard,
  };
}

export function deactivateVariant(card: Card, variantId: string, _reason = "Nutzer hat die Variante deaktiviert."): Card {
  const updatedAt = new Date().toISOString();
  return { ...card, variants: card.variants.map((variant) => variant.id === variantId ? { ...variant, isActive: false, qualityStatus: "disabled", updatedAt, revision: variant.revision + 1 } : variant), updatedAt };
}

/**
 * Replaces a variant's wording. An edited variant counts as the learner's own: regenerating the deck's variants keeps
 * it, a content change still makes it outdated.
 */
export function editVariantText(card: Card, variantId: string, text: { front: string; back: string }, updatedAt = new Date().toISOString()): Card {
  const variant = card.variants.find((candidate) => candidate.id === variantId && !candidate.deletedAt);
  if (!variant) throw new Error("Die Variante wurde nicht gefunden.");
  const edited = createCardVariant({ ...variant, front: text.front, back: text.back, meta: { ...variant.meta, editedAt: updatedAt }, updatedAt, revision: variant.revision + 1 });
  if (!stripSanitizedHtml(edited.front).trim() || !stripSanitizedHtml(edited.back).trim()) throw new Error("Frage und Antwort der Variante dürfen nicht leer sein.");
  if (edited.contentHash === variant.contentHash) return card;
  if (card.variants.some((candidate) => candidate.id !== variantId && !candidate.deletedAt && candidate.contentHash === edited.contentHash)) {
    throw new Error("Diese Formulierung gibt es für die Karte schon.");
  }
  return { ...card, variants: card.variants.map((candidate) => candidate.id === variantId ? edited : candidate), updatedAt };
}

/** Whether the learner edited the variant's wording (`editVariantText`). */
export function isEditedVariant(variant: CardVariant): boolean {
  return typeof variant.meta.editedAt === "string";
}

/** Takes a disabled or reported variant back into rotation; outdated or deleted ones stay out. Feedback history stays. */
export function reactivateVariant(card: Card, variantId: string, updatedAt = new Date().toISOString()): Card {
  return {
    ...card,
    variants: card.variants.map((variant) => variant.id === variantId && !variant.deletedAt && variant.meta.outdated !== true
      ? { ...variant, isActive: true, qualityStatus: "active", updatedAt, revision: variant.revision + 1 }
      : variant),
    updatedAt,
  };
}

/** Removes a variant; like replaced outdated variants it stays as a tombstone so sync deletes it everywhere. */
export function deleteVariant(card: Card, variantId: string, updatedAt = new Date().toISOString()): Card {
  return {
    ...card,
    variants: card.variants.map((variant) => variant.id === variantId && !variant.deletedAt
      ? { ...variant, isActive: false, deletedAt: updatedAt, updatedAt, revision: variant.revision + 1 }
      : variant),
    updatedAt,
  };
}

export function flagVariant(card: Card, variantId: string, type: VariantFeedbackType, note = ""): Card {
  const updatedAt = new Date().toISOString();
  return {
    ...card,
    variants: card.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      isActive: false,
      qualityStatus: "flagged",
      feedback: [...variant.feedback, { id: stableContentHash({ variantId, type, note, updatedAt }, "feedback"), type, note, createdAt: updatedAt }],
      updatedAt,
      revision: variant.revision + 1,
    } : variant),
    updatedAt,
  };
}
