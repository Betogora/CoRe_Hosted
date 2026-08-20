import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import { findChoiceAnswerIndices, normalizeChoiceAnswerList, readChoiceCorrectAnswers } from "../choiceAnswers.ts";
import { escapeCardHtmlText, hasCardRichTextContent } from "../richText.ts";
import type {
  CardContentPayload,
  CardContentPayloadValidationResult,
  CardEditorFieldErrors,
  CardEditorValidationResult,
  CardEditorValue,
  EditableCardType,
  LearningItem,
  LearningItemDocumentV1,
  NoteTypeDefinitionV1,
} from "../coreTypes.ts";
import { normalizeTags } from "./coreValues.ts";
import { normalizeLearningItem } from "./learningItems.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "./learningItemContent.ts";

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
  correctAnswers: string[];
  explanation: string;
  clozeGroups: ClozeGroup[];
}

export type CardPreviewDraft =
  | { kind: "editor"; value: CardEditorValue }
  | { kind: "document"; fields: Array<{ id: string; value: string }>; tags: string[] };

export interface CardPreviewProjection {
  item: LearningItem;
  variant: null;
  definition: NoteTypeDefinitionV1;
}

const EDITABLE_CARD_TYPES = new Set<EditableCardType>(["basic", "basic-with-images", "basic-reversed", "cloze", "single-choice", "multiple-choice"]);
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

function normalizeOptionIndices(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Number.isInteger))];
}

function normalizeEditorValue(value: unknown): CardEditorValue | null {
  const input = objectRecord(value);
  if (!isEditableCardType(input.cardType)) return null;
  const tags = normalizeTags(input.tags);

  switch (input.cardType) {
    case "basic":
    case "basic-with-images":
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
    case "single-choice":
      return {
        cardType: "single-choice",
        question: sanitizeCardHtml(input.question),
        options: normalizeOptions(input.options),
        correctOptionIndex: Number(input.correctOptionIndex),
        explanation: sanitizeCardHtml(input.explanation),
        tags,
      };
    case "multiple-choice":
      return {
        cardType: "multiple-choice",
        question: sanitizeCardHtml(input.question),
        options: normalizeOptions(input.options),
        correctOptionIndices: normalizeOptionIndices(
          Array.isArray(input.correctOptionIndices) ? input.correctOptionIndices : [input.correctOptionIndex],
        ),
        explanation: sanitizeCardHtml(input.explanation),
        tags,
      };
  }
}

function primaryEditorFields(document: LearningItemDocumentV1) {
  const front = document.fields.find((field) => field.semanticRole === "prompt")
    ?? document.fields.find((field) => field.placement === "front")
    ?? document.fields[0]
    ?? null;
  const back = document.fields.find((field) => field.semanticRole === "answer")
    ?? document.fields.find((field) => field.placement === "back" && field.id !== front?.id)
    ?? document.fields.find((field) => field.id !== front?.id)
    ?? null;
  return { front, back };
}

function documentForEditorValue(card: LearningItem, value: CardEditorValue): LearningItemDocumentV1 {
  const projected = projectCardEditorContent(value);
  const fields = primaryEditorFields(card.contentDocument);
  return {
    ...card.contentDocument,
    tags: value.tags,
    fields: card.contentDocument.fields.map((field) => ({
      ...field,
      value: field.id === fields.front?.id
        ? projected.front
        : field.id === fields.back?.id
          ? value.cardType === "cloze" || value.cardType === "single-choice" || value.cardType === "multiple-choice" ? projected.explanation : projected.back
          : field.value,
    })),
    ...(value.cardType === "single-choice" || value.cardType === "multiple-choice"
      ? { interaction: { choice: { options: value.options, correctAnswers: projected.correctAnswers, explanation: value.explanation } } }
      : {}),
  };
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
    case "basic-with-images":
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
    case "single-choice":
    case "multiple-choice": {
      if (!hasCardRichTextContent(normalized.question)) errors.question = "Bitte eine Frage eingeben.";
      const nonEmptyOptions = normalized.options.filter(Boolean);
      if (nonEmptyOptions.length < 2 || nonEmptyOptions.length !== normalized.options.length) {
        errors.options = "Bitte mindestens zwei nichtleere Antwortoptionen eingeben.";
      } else if (new Set(nonEmptyOptions.map((option) => option.toLocaleLowerCase("de-DE"))).size !== nonEmptyOptions.length) {
        errors.options = "Antwortoptionen müssen eindeutig sein.";
      }
      if (normalized.cardType === "single-choice") {
        if (!Number.isInteger(normalized.correctOptionIndex) || normalized.correctOptionIndex < 0 || normalized.correctOptionIndex >= normalized.options.length || !normalized.options[normalized.correctOptionIndex]) {
          errors.correctOptionIndex = "Bitte genau eine gültige richtige Antwort auswählen.";
        }
      } else {
        const validIndices = normalized.correctOptionIndices.filter((index) => index >= 0 && index < normalized.options.length && Boolean(normalized.options[index]));
        if (validIndices.length !== normalized.correctOptionIndices.length || validIndices.length === 0) {
          errors.correctOptionIndices = "Bitte mindestens eine gültige richtige Antwort auswählen.";
        } else if (validIndices.length >= normalized.options.length) {
          errors.correctOptionIndices = "Bitte mindestens eine Antwortoption als falsch belassen.";
        }
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

function renderChoiceAnswer(correctAnswers: string[], explanation: string): string {
  const label = correctAnswers.length === 1 ? "Richtige Antwort:" : "Richtige Antworten:";
  const answer = `<p><strong>${label}</strong> ${correctAnswers.map(escapeCardHtmlText).join(", ")}</p>`;
  return sanitizeCardHtml(explanation ? `${answer}${explanation}` : answer);
}

export function projectCardEditorContent(value: CardEditorValue): EditorContentProjection {
  switch (value.cardType) {
    case "basic":
    case "basic-with-images":
    case "basic-reversed":
      return { front: value.front, back: value.back, answerOptions: null, correctAnswers: [], explanation: "", clozeGroups: [] };
    case "cloze": {
      const revealed = revealClozeText(value.textWithClozes);
      return {
        front: value.textWithClozes,
        back: sanitizeCardHtml(value.extra ? `${revealed}<hr>${value.extra}` : revealed),
        answerOptions: null,
        correctAnswers: [],
        explanation: value.extra,
        clozeGroups: parseClozeGroups(value.textWithClozes),
      };
    }
    case "single-choice":
    case "multiple-choice": {
      const correctOptionIndices = value.cardType === "single-choice" ? [value.correctOptionIndex] : value.correctOptionIndices;
      const correctAnswers = correctOptionIndices.map((index) => value.options[index]).filter(Boolean);
      return {
        front: value.question,
        back: renderChoiceAnswer(correctAnswers, value.explanation),
        answerOptions: value.options,
        correctAnswers,
        explanation: value.explanation,
        clozeGroups: [],
      };
    }
  }
}

export function getCardEditorValue(card: LearningItem): CardEditorValue | null {
  const cardType = card.cardType ?? card.kind;
  if (!isEditableCardType(cardType)) return null;
  const tags = normalizeTags(card.tags ?? card.originalTags);

  switch (cardType) {
    case "basic":
    case "basic-with-images":
    case "basic-reversed": {
      const fields = primaryEditorFields(card.contentDocument);
      return {
        cardType,
        front: fields.front?.value ?? card.originalFront,
        back: fields.back?.value ?? card.originalBack,
        tags,
      };
    }
    case "cloze":
      return {
        cardType: "cloze",
        textWithClozes: card.originalFront,
        extra: card.contentDocument.fields[1]?.value ?? String(card.meta?.explanation ?? ""),
        tags,
      };
    case "single-choice":
    case "multiple-choice": {
      const choice = card.contentDocument.interaction?.choice;
      const options = normalizeOptions(choice?.options ?? card.meta?.answerOptions);
      const storedCorrectAnswers = readChoiceCorrectAnswers(choice);
      const correctAnswers = storedCorrectAnswers.length > 0
        ? storedCorrectAnswers
        : normalizeChoiceAnswerList(card.meta?.correctAnswers ?? card.meta?.correctAnswer ?? "");
      const correctOptionIndices = findChoiceAnswerIndices(options, correctAnswers);
      const common = {
        question: card.originalFront,
        options,
        explanation: choice?.explanation ?? String(card.meta?.explanation ?? ""),
        tags,
      };
      return cardType === "single-choice"
        ? { ...common, cardType: "single-choice", correctOptionIndex: correctOptionIndices[0] ?? -1 }
        : { ...common, cardType: "multiple-choice", correctOptionIndices };
    }
  }
}

function cloneEditorValue(value: CardEditorValue): CardEditorValue {
  if (value.cardType === "single-choice" || value.cardType === "multiple-choice") {
    return {
      ...value,
      options: [...value.options],
      ...(value.cardType === "multiple-choice" ? { correctOptionIndices: [...value.correctOptionIndices] } : {}),
      tags: [...value.tags],
    } as CardEditorValue;
  }
  return { ...value, tags: [...value.tags] };
}

export function getCardContentPayload(card: LearningItem): CardContentPayload | null {
  const editorValue = getCardEditorValue(card);
  if (!editorValue) return null;
  return {
    editorValue: cloneEditorValue(editorValue),
    mediaRefs: [...card.mediaRefs],
  };
}

export function validateCardContentPayload(value: unknown): CardContentPayloadValidationResult {
  const input = objectRecord(value);
  const editorValidation = validateCardEditorValue(input.editorValue);
  if (!editorValidation.ok) {
    return { ok: false, value: null, error: "Die Kartenfelder sind ungültig oder unvollständig." };
  }
  if (!Array.isArray(input.mediaRefs) || input.mediaRefs.some((mediaRef) => typeof mediaRef !== "string" || !mediaRef.trim())) {
    return { ok: false, value: null, error: "Die Medienreferenzen sind ungültig." };
  }
  return {
    ok: true,
    value: {
      editorValue: cloneEditorValue(editorValidation.value),
      mediaRefs: [...new Set(input.mediaRefs.map((mediaRef) => mediaRef.trim()))],
    },
    error: null,
  };
}

export function saveCardEditorValue(cardInput: LearningItem, editorInput: unknown, storedDefinition?: NoteTypeDefinitionV1): LearningItem {
  const card = normalizeLearningItem(cardInput);
  const value = assertValidCardEditorValue(editorInput);
  if (value.cardType !== card.cardType && value.cardType !== card.kind) {
    throw new CardEditorValidationError({ front: "Der Kartentyp kann beim Bearbeiten nicht geändert werden." });
  }
  const currentValue = getCardEditorValue(card);
  if (!currentValue) throw new CardEditorValidationError({ front: "Dieser Kartentyp kann hier nicht typgerecht bearbeitet werden." });
  const document = documentForEditorValue(card, value);
  const definition = storedDefinition ?? createCoreNoteTypeDefinition({
    document,
    kind: value.cardType === "cloze" ? "cloze" : "normal",
    interaction: value.cardType === "single-choice" || value.cardType === "multiple-choice" ? "choice" : value.cardType === "cloze" ? "cloze" : "reveal",
    reverse: value.cardType === "basic-reversed",
    createdAt: card.createdAt,
  });
  const previous = { ...card, contentDocument: documentForEditorValue(card, currentValue) };
  return applyLearningItemContent({ previous, document, definition, reason: "edit" }).item;
}

export function projectCardPreviewDraft(input: {
  item: LearningItem;
  definition: NoteTypeDefinitionV1;
  draft: CardPreviewDraft;
}): CardPreviewProjection | null {
  const draft = input.draft;
  let document: LearningItemDocumentV1 | null;
  if (draft.kind === "editor") {
    const value = normalizeEditorValue(draft.value);
    document = value ? documentForEditorValue(input.item, value) : null;
  } else {
    const fieldValues = new Map(draft.fields.map((field) => [field.id, field.value]));
    document = {
      ...input.item.contentDocument,
      tags: normalizeTags(draft.tags),
      fields: input.item.contentDocument.fields.map((field) => ({
        ...field,
        value: fieldValues.get(field.id) ?? field.value,
      })),
    };
  }
  if (!document) return null;

  const projected = applyLearningItemContent({
    previous: input.item,
    document,
    definition: input.definition,
    reason: "edit",
  }).item;
  const item = {
    ...projected,
    revision: input.item.revision,
    contentRevision: input.item.contentRevision,
    updatedAt: input.item.updatedAt,
  };
  return { item, variant: null, definition: input.definition };
}
