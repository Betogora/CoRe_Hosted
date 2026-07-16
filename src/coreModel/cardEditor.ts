import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import { escapeCardHtmlText, hasCardRichTextContent } from "../richText.ts";
import type {
  CardEditorFieldErrors,
  CardEditorValidationResult,
  CardEditorValue,
  CardVariant,
  DerivedCardVariant,
  EditableCardType,
  LearningItem,
} from "../coreTypes.ts";
import { normalizeTags, stableContentHash } from "./coreValues.ts";
import { createCardVariant, createCoreCard, getOriginalVariant, normalizeLearningItem } from "./learningItems.ts";
import { createVersionEntry } from "./reviewState.ts";

interface ClozePart {
  groupId: number;
  text: string;
  hint: string;
}

interface ClozeGroup {
  groupId: number;
  clozes: ClozePart[];
}

interface EditorContentProjection {
  front: string;
  back: string;
  answerOptions: string[] | null;
  correctAnswer: string | null;
  explanation: string;
  clozeGroups: ClozeGroup[];
}

const EDITABLE_CARD_TYPES = new Set<EditableCardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);
const CLOZE_PATTERN = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function isEditableCardType(value: unknown): value is EditableCardType {
  return typeof value === "string" && EDITABLE_CARD_TYPES.has(value as EditableCardType);
}

function normalizeOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map((option) => String(option).trim()) : [];
}

function normalizeEditorValue(value: unknown): CardEditorValue | null {
  const input = objectRecord(value);
  if (!isEditableCardType(input.cardType)) return null;
  const tags = normalizeTags(input.tags);

  switch (input.cardType) {
    case "basic":
    case "basic-reversed":
      return {
        cardType: input.cardType,
        front: sanitizeCardHtml(input.front),
        back: sanitizeCardHtml(input.back),
        tags,
      };
    case "cloze":
      return {
        cardType: "cloze",
        textWithClozes: sanitizeCardHtml(input.textWithClozes),
        extra: sanitizeCardHtml(input.extra),
        tags,
      };
    case "multiple-choice":
      return {
        cardType: "multiple-choice",
        question: sanitizeCardHtml(input.question),
        options: normalizeOptions(input.options),
        correctOptionIndex: Number(input.correctOptionIndex),
        explanation: sanitizeCardHtml(input.explanation),
        tags,
      };
  }
}

export function parseClozeGroups(textWithClozes: string): ClozeGroup[] {
  const groups = new Map<number, ClozePart[]>();
  CLOZE_PATTERN.lastIndex = 0;
  let match = CLOZE_PATTERN.exec(textWithClozes);

  while (match) {
    const groupId = Number(match[1]);
    const cloze = { groupId, text: match[2], hint: match[3] ?? "" };
    groups.set(groupId, [...(groups.get(groupId) ?? []), cloze]);
    match = CLOZE_PATTERN.exec(textWithClozes);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupId, clozes]) => ({ groupId, clozes }));
}

function hasInvalidClozeSyntax(textWithClozes: string, groups: ClozeGroup[]): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  const unmatched = textWithClozes.replace(CLOZE_PATTERN, "");
  if (/\{\{c|\}\}/i.test(unmatched)) return true;
  return groups.some(({ groupId, clozes }) =>
    !Number.isInteger(groupId) || groupId < 1 || clozes.some((cloze) => !stripHtml(cloze.text).trim() || /\{\{|\}\}/.test(cloze.text)),
  );
}

export function validateCardEditorValue(value: unknown): CardEditorValidationResult {
  const normalized = normalizeEditorValue(value);
  if (!normalized) {
    return { ok: false, value: null, errors: { front: "Dieser Kartentyp kann hier nicht typgerecht bearbeitet werden." } };
  }

  const errors: CardEditorFieldErrors = {};
  switch (normalized.cardType) {
    case "basic":
    case "basic-reversed":
      if (!hasCardRichTextContent(normalized.front)) errors.front = "Bitte eine Vorderseite eingeben.";
      if (!hasCardRichTextContent(normalized.back)) errors.back = "Bitte eine Rückseite eingeben.";
      break;
    case "cloze": {
      const groups = parseClozeGroups(normalized.textWithClozes);
      if (!hasCardRichTextContent(normalized.textWithClozes)) {
        errors.textWithClozes = "Bitte einen Cloze-Text eingeben.";
      } else if (groups.length === 0 || hasInvalidClozeSyntax(normalized.textWithClozes, groups)) {
        errors.textWithClozes = "Bitte gültige Lücken wie {{c1::Begriff}} verwenden.";
      }
      break;
    }
    case "multiple-choice": {
      if (!hasCardRichTextContent(normalized.question)) errors.question = "Bitte eine Frage eingeben.";
      const nonEmptyOptions = normalized.options.filter(Boolean);
      if (nonEmptyOptions.length < 2 || nonEmptyOptions.length !== normalized.options.length) {
        errors.options = "Bitte mindestens zwei nichtleere Antwortoptionen eingeben.";
      } else if (new Set(nonEmptyOptions.map((option) => option.toLocaleLowerCase("de-DE"))).size !== nonEmptyOptions.length) {
        errors.options = "Antwortoptionen müssen eindeutig sein.";
      }
      if (!Number.isInteger(normalized.correctOptionIndex) || normalized.correctOptionIndex < 0 || normalized.correctOptionIndex >= normalized.options.length || !normalized.options[normalized.correctOptionIndex]) {
        errors.correctOptionIndex = "Bitte genau eine gültige richtige Antwort auswählen.";
      }
      break;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, value: null, errors }
    : { ok: true, value: normalized, errors: {} };
}

export class CardEditorValidationError extends Error {
  readonly fieldErrors: CardEditorFieldErrors;

  constructor(fieldErrors: CardEditorFieldErrors) {
    super("Die Karte enthält ungültige oder unvollständige Felder.");
    this.name = "CardEditorValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function assertValidCardEditorValue(value: unknown): CardEditorValue {
  const validation = validateCardEditorValue(value);
  if (!validation.ok) throw new CardEditorValidationError(validation.errors);
  return validation.value;
}

function revealClozeText(text: string): string {
  CLOZE_PATTERN.lastIndex = 0;
  return text.replace(CLOZE_PATTERN, "$2");
}

function renderClozeFront(text: string, groupId: number): string {
  CLOZE_PATTERN.lastIndex = 0;
  return text.replace(CLOZE_PATTERN, (_match, candidateGroup: string, value: string, hint: string | undefined) =>
    Number(candidateGroup) === groupId ? (hint ? `[...] (${hint})` : "[...]") : value,
  );
}

function renderMultipleChoiceAnswer(correctAnswer: string, explanation: string): string {
  const answer = `<p><strong>Richtige Antwort:</strong> ${escapeCardHtmlText(correctAnswer)}</p>`;
  return sanitizeCardHtml(explanation ? `${answer}${explanation}` : answer);
}

export function projectCardEditorContent(value: CardEditorValue): EditorContentProjection {
  switch (value.cardType) {
    case "basic":
    case "basic-reversed":
      return { front: value.front, back: value.back, answerOptions: null, correctAnswer: null, explanation: "", clozeGroups: [] };
    case "cloze": {
      const revealed = revealClozeText(value.textWithClozes);
      return {
        front: value.textWithClozes,
        back: sanitizeCardHtml(value.extra ? `${revealed}<hr>${value.extra}` : revealed),
        answerOptions: null,
        correctAnswer: null,
        explanation: value.extra,
        clozeGroups: parseClozeGroups(value.textWithClozes),
      };
    }
    case "multiple-choice": {
      const correctAnswer = value.options[value.correctOptionIndex];
      return {
        front: value.question,
        back: renderMultipleChoiceAnswer(correctAnswer, value.explanation),
        answerOptions: value.options,
        correctAnswer,
        explanation: value.explanation,
        clozeGroups: [],
      };
    }
  }
}

export function getCardEditorValue(card: LearningItem): CardEditorValue | null {
  const cardType = card.cardType ?? card.kind;
  if (!isEditableCardType(cardType)) return null;
  const original = getOriginalVariant(card);
  const tags = normalizeTags(card.tags ?? card.originalTags);

  switch (cardType) {
    case "basic":
    case "basic-reversed":
      return { cardType, front: card.originalFront, back: card.originalBack, tags };
    case "cloze":
      return {
        cardType: "cloze",
        textWithClozes: card.originalFront,
        extra: String(original?.explanation ?? card.meta?.explanation ?? ""),
        tags,
      };
    case "multiple-choice": {
      const options = normalizeOptions(original?.answerOptionsJson ?? card.meta?.answerOptions);
      const correctAnswer = String(original?.expectedAnswerJson ?? card.meta?.correctAnswer ?? "");
      return {
        cardType: "multiple-choice",
        question: card.originalFront,
        options,
        correctOptionIndex: options.indexOf(correctAnswer),
        explanation: String(original?.explanation ?? card.meta?.explanation ?? ""),
        tags,
      };
    }
  }
}

function updatedOriginalVariant(original: CardVariant, value: CardEditorValue, content: EditorContentProjection, updatedAt: string): CardVariant {
  return {
    ...original,
    variantType: value.cardType === "basic-reversed" ? "basic" : value.cardType === "multiple-choice" ? "mcq" : value.cardType,
    front: content.front,
    back: content.back,
    explanation: content.explanation,
    answerOptionsJson: content.answerOptions,
    expectedAnswerJson: content.correctAnswer,
    updatedAt,
    meta: { ...original.meta, cardType: value.cardType },
  };
}

function regenerateReverseVariants(card: LearningItem, original: CardVariant, content: EditorContentProjection, updatedAt: string): CardVariant[] {
  const derivedVariants = card.variants.filter((variant): variant is DerivedCardVariant => !variant.isOriginal);
  const reverseVariants = derivedVariants.filter((variant) => variant.variantType === "reverse" || variant.transformType === "front_back_style_shift");
  const retained = reverseVariants.find((variant) => variant.isActive) ?? reverseVariants[0];
  const reverse = retained
    ? {
        ...retained,
        front: content.back,
        back: content.front,
        isActive: true,
        qualityStatus: "active" as const,
        anchorVariantId: original.id,
        parentVariantId: original.id,
        updatedAt,
        meta: { ...retained.meta, cardType: "basic-reversed" },
      }
    : createCardVariant({
        id: stableContentHash({ learningItemId: card.id, direction: "reverse" }, "variant"),
        learningItemId: card.id,
        cardId: card.id,
        sourceCardId: card.id,
        variantType: "reverse",
        variantLevel: 2,
        front: content.back,
        back: content.front,
        generationSource: "user_edited",
        transformType: "front_back_style_shift",
        qualityStatus: "active",
        isOriginal: false,
        isActive: true,
        anchorVariantId: original.id,
        parentVariantId: original.id,
        sourceAnchors: card.sourceAnchors,
        createdAt: updatedAt,
        updatedAt,
        meta: { cardType: "basic-reversed", sourceType: card.sourceType },
      });

  return derivedVariants
    .map((variant) => {
      if (retained && variant.id === retained.id) return reverse;
      if (reverseVariants.some((candidate) => candidate.id === variant.id)) {
        return { ...variant, isActive: false, qualityStatus: "disabled" as const, updatedAt };
      }
      return variant;
    })
    .concat(retained ? [] : [reverse]);
}

function regenerateClozeVariants(card: LearningItem, original: CardVariant, content: EditorContentProjection, updatedAt: string): CardVariant[] {
  const derivedVariants = card.variants.filter((variant): variant is DerivedCardVariant => !variant.isOriginal);
  const existingByGroup = new Map<number, DerivedCardVariant>();
  for (const variant of derivedVariants) {
    const group = Number(variant.meta?.clozeGroup);
    if (!variant.isOriginal && Number.isInteger(group) && group > 0 && !existingByGroup.has(group)) existingByGroup.set(group, variant);
  }
  const activeGroupIds = new Set(content.clozeGroups.map((group) => group.groupId));
  const retained = card.variants
    .filter((variant): variant is DerivedCardVariant => !variant.isOriginal && !Number.isInteger(Number(variant.meta?.clozeGroup)))
    .concat(
      [...existingByGroup.entries()]
        .filter(([groupId]) => !activeGroupIds.has(groupId))
        .map(([, variant]) => ({ ...variant, isActive: false, qualityStatus: "disabled" as const, updatedAt })),
    );

  const active = content.clozeGroups.map(({ groupId, clozes }) => {
    const existing = existingByGroup.get(groupId);
    const common = {
      front: renderClozeFront(content.front, groupId),
      back: content.back,
      explanation: content.explanation,
      hintsJson: clozes.map((cloze) => cloze.hint).filter(Boolean),
      expectedAnswerJson: clozes.map((cloze) => cloze.text),
      isActive: true,
      qualityStatus: "active" as const,
      anchorVariantId: original.id,
      parentVariantId: original.id,
      updatedAt,
      meta: { ...(existing?.meta ?? {}), clozeGroup: groupId, cardType: "cloze", sourceType: card.sourceType },
    };
    return existing
      ? { ...existing, ...common }
      : createCardVariant({
          id: stableContentHash({ learningItemId: card.id, clozeGroup: groupId }, "variant"),
          learningItemId: card.id,
          cardId: card.id,
          sourceCardId: card.id,
          variantType: "cloze",
          variantLevel: 2,
          generationSource: "user_edited",
          transformType: "cloze_conversion",
          isOriginal: false,
          sourceAnchors: card.sourceAnchors,
          createdAt: updatedAt,
          ...common,
        });
  });

  return [...retained, ...active];
}

function synchronizeMultipleChoiceVariants(card: LearningItem, content: EditorContentProjection, updatedAt: string): CardVariant[] {
  return card.variants
    .filter((variant) => !variant.isOriginal)
    .map((variant) => variant.variantType === "mcq"
      ? {
          ...variant,
          back: content.back,
          explanation: content.explanation,
          answerOptionsJson: content.answerOptions,
          expectedAnswerJson: content.correctAnswer,
          updatedAt,
        }
      : variant);
}

export function saveCardEditorValue(cardInput: LearningItem, editorInput: unknown, reason = "Manuelle Bearbeitung"): LearningItem {
  const card = normalizeLearningItem(cardInput);
  const value = assertValidCardEditorValue(editorInput);
  if (value.cardType !== card.cardType && value.cardType !== card.kind) {
    throw new CardEditorValidationError({ front: "Der Kartentyp kann beim Bearbeiten nicht geändert werden." });
  }
  const currentValue = getCardEditorValue(card);
  if (!currentValue) throw new CardEditorValidationError({ front: "Dieser Kartentyp kann hier nicht typgerecht bearbeitet werden." });

  const updatedAt = new Date().toISOString();
  const content = projectCardEditorContent(value);
  const currentOriginal = getOriginalVariant(card);
  if (!currentOriginal) throw new Error("Die Originalvariante der Karte fehlt.");
  const original = updatedOriginalVariant(currentOriginal, value, content, updatedAt);
  const derivedVariants = value.cardType === "basic-reversed"
    ? regenerateReverseVariants(card, original, content, updatedAt)
    : value.cardType === "cloze"
      ? regenerateClozeVariants(card, original, content, updatedAt)
      : value.cardType === "multiple-choice"
        ? synchronizeMultipleChoiceVariants(card, content, updatedAt)
        : card.variants.filter((variant) => !variant.isOriginal);
  const meta = {
    ...card.meta,
    ...(value.cardType === "multiple-choice"
      ? { answerOptions: content.answerOptions, correctAnswer: content.correctAnswer, expectedAnswer: content.correctAnswer, explanation: content.explanation }
      : {}),
    ...(value.cardType === "cloze" ? { clozeGroupCount: content.clozeGroups.length, explanation: content.explanation } : {}),
  };
  const updated = createCoreCard({
    ...card,
    cardType: value.cardType,
    canonicalQuestion: content.front,
    canonicalAnswer: content.back,
    originalFront: content.front,
    originalBack: content.back,
    originalTags: value.tags,
    tags: value.tags,
    variants: [original, ...derivedVariants],
    immutableOriginal: card.immutableOriginal,
    createdAt: card.createdAt,
    updatedAt,
    meta,
  });

  return {
    ...updated,
    immutableOriginal: card.immutableOriginal,
    versionLog: [
      ...card.versionLog,
      createVersionEntry({
        objectType: "card",
        objectId: card.id,
        changeType: "content_updated",
        before: { originalFront: card.originalFront, originalBack: card.originalBack, originalTags: card.originalTags, kind: card.kind, editorValue: currentValue },
        after: { originalFront: updated.originalFront, originalBack: updated.originalBack, originalTags: updated.originalTags, kind: updated.kind, editorValue: value },
        reason,
        createdAt: updatedAt,
      }),
    ],
  };
}
