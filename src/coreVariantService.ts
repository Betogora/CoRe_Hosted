import { createDefaultDeckSettings, getActiveVariants, stableContentHash } from "./coreModel.ts";
import { stripSanitizedHtml } from "./htmlSafety.ts";
import { isCardReadyForVariants } from "./coreVariantService/variantSelection.ts";
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
  if (note.content.interaction.kind !== "reveal") reasons.push("KI-Umformulierungen sind nur für Karten mit Frage und Antwort verfügbar.");
  else if (!cardVariantSource(note, card)) reasons.push("Frage oder Antwort fehlt.");
  if (getActiveVariants(card).length >= settings.maxActiveVariantsPerCard) {
    reasons.push(`Die Karte hat bereits ${settings.maxActiveVariantsPerCard === 1 ? "eine aktive Variante" : `${settings.maxActiveVariantsPerCard} aktive Varianten`}; mehr erlaubt der Stapel nicht.`);
  }
  return { eligible: reasons.length === 0, reasons };
}

/** Learning level of a card compared with the deck's threshold for asking rephrasings. */
export function describeVariantReadiness(card: Card, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const ready = isCardReadyForVariants(card, settings);
  const reason = settings.coreMode === "off"
    ? "Content Repetition ist für diesen Stapel ausgeschaltet."
    : ready
      ? "Im Review wechseln sich die Karte und ihre Varianten ab."
      : card.study.state !== "review" || card.study.lastRating === "again"
        ? "Bis zur nächsten richtigen Wiederholung wird die Karte selbst abgefragt."
        : "Bis zur Lernstufe des Stapels wird die Karte selbst abgefragt.";
  return {
    maturityXp: card.study.extra.maturityXp,
    thresholdXp: settings.variantThresholdXp,
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
