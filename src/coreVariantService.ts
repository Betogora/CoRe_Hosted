import { createCardVariant, createDefaultDeckSettings, getActiveVariants } from "./coreModel.ts";
import { stripSanitizedHtml } from "./htmlSafety.ts";
import { isCardReadyForVariants } from "./coreVariantService/variantSelection.ts";
import { getDurabilityDays } from "./scheduler.ts";
import { checkClozeVariant, clozeAnswerText, clozeVariantGaps, type AiCardVariantSource } from "./aiCardVariantContract.ts";
import { mapClozes } from "./clozeSyntax.ts";
import type { Card, CardVariant, Note, NoteContent, NoteField } from "./coreTypes.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];

export { selectReviewVariant } from "./coreVariantService/variantSelection.ts";

function plainText(html: string): string {
  return stripSanitizedHtml(html).replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * The cloze text of one gap group: its gaps stay in Anki syntax, every other gap becomes its plain text.
 * A group with a gap nested in its own gap has no source.
 */
function clozeVariantSource(content: NoteContent, ordinal: number): AiCardVariantSource | null {
  const answers: string[] = [];
  const text = content.fields.filter((field) => field.role === "prompt").map((field) => plainText(field.html)).filter(Boolean).join(" ");
  const front = mapClozes(text, (token, inner) => {
    if (!token.ordinals.includes(ordinal)) return inner;
    answers.push(inner);
    return `{{c${ordinal}::${inner}${token.hint ? `::${token.hint}` : ""}}}`;
  });
  return front && answers.length && clozeVariantGaps(front) ? { kind: "cloze", front, back: clozeAnswerText(answers) } : null;
}

/** Plain question and answer of a reveal card or the cloze text of a cloze card; the only source of AI rephrasings. */
export function cardVariantSource(note: Pick<Note, "content">, card: Pick<Card, "promptKey">): AiCardVariantSource | null {
  const { content } = note;
  if (content.interaction.kind === "cloze") return clozeVariantSource(content, Number(card.promptKey.replace(/^cloze:/, "")));
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
  return front && back ? { kind: prompt.typeInFieldId ? "type-in" : "basic", front, back } : null;
}

/**
 * A rephrased variant shown as a transient content of its card; hint, extra and source fields stay.
 * A cloze variant is a cloze text asked with the card's own gap group. A typed answer keeps the card's own answer
 * fields, so the learner types exactly what the card itself expects. Speech stays only for fields taken over
 * unchanged: a rephrasing may be in another language than the voice.
 */
export function variantPresentation(note: Note, card: Card, variant: CardVariant): { note: Note; card: Card } {
  const { interaction } = note.content;
  const prompt = interaction.kind === "reveal" ? interaction.prompts.find((candidate) => candidate.key === card.promptKey) : undefined;
  const typedAnswer = prompt?.typeInFieldId ? prompt : null;
  const supplements = note.content.fields.filter((field) => field.role === "hint" || field.role === "extra" || field.role === "source");
  const answerFields = interaction.kind === "cloze" ? []
    : typedAnswer ? note.content.fields.filter((field) => typedAnswer.answerFieldIds.includes(field.id) && !supplements.includes(field))
      : [{ id: "variant-back", name: "Rückseite", role: "answer" as const, html: variant.back }];
  const fields = [...answerFields, ...supplements];
  const content = (questionField: NoteField, presented: NoteContent["interaction"]): NoteContent => ({
    schemaVersion: 1,
    fields: [questionField, ...fields],
    interaction: presented,
    speech: note.content.speech.filter((entry) => fields.some((field) => field.id === entry.fieldId)),
    tags: note.content.tags,
  });
  if (interaction.kind === "cloze") {
    return { note: { ...note, content: content({ id: "variant-text", name: "Text", role: "prompt", html: variant.front }, { kind: "cloze" }) }, card: { ...card, id: variant.id } };
  }
  return {
    note: {
      ...note,
      content: content(
        { id: "variant-front", name: "Vorderseite", role: "prompt", html: variant.front },
        { kind: "reveal", prompts: [{ key: "forward", name: "Variante", instruction: "", questionFieldIds: ["variant-front"], answerFieldIds: answerFields.map((field) => field.id), requires: null, typeInFieldId: typedAnswer?.typeInFieldId ?? null }] },
      ),
    },
    card: { ...card, id: variant.id, promptKey: "forward" },
  };
}

/** Whether a new rephrasing may be generated for the card; the reasons explain a disabled action. */
export function classifyCardEligibility(note: Pick<Note, "content">, card: Card, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const reasons: string[] = [];
  if (settings.coreMode === "off") reasons.push("Content Repetition ist für diesen Stapel ausgeschaltet.");
  const { kind } = note.content.interaction;
  if (kind !== "reveal" && kind !== "cloze") reasons.push("Varianten gibt es nur für Frage–Antwort- und Lückentextkarten.");
  else if (!cardVariantSource(note, card)) reasons.push(kind === "cloze" ? "Die Lücke dieser Karte ist leer oder verschachtelt." : "Frage oder Antwort fehlt.");
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
 * it, a content change still makes it outdated. A cloze variant must keep the card's gap group with the same solutions
 * (`source` from `cardVariantSource`); its answer stays theirs.
 */
export function editVariantText(card: Card, variantId: string, text: { front: string; back: string }, updatedAt = new Date().toISOString(), source: AiCardVariantSource | null = null): Card {
  const variant = card.variants.find((candidate) => candidate.id === variantId && !candidate.deletedAt);
  if (!variant) throw new Error("Die Variante wurde nicht gefunden.");
  if (source?.kind === "cloze") {
    const problem = checkClozeVariant(source.front, plainText(text.front));
    if (problem === "invalid_gaps" || problem === "changed_answer") throw new Error("Die Variante braucht die Lücke der Karte mit derselben Lösung.");
    text = { front: text.front, back: source.back };
  }
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

