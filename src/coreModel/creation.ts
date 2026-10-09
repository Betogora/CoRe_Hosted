import type { ChoiceOption, NoteContent, NoteField, RevealPrompt } from "../coreTypes.ts";
import type { AddableFieldRole } from "./noteEditor.ts";
import { escapeCardHtmlText, hasCardRichTextContent } from "../richText.ts";
import { normalizeTags } from "./coreValues.ts";
import { clozeOrdinals } from "./noteContent.ts";

/** What the manual editor offers today; it only shapes the universal content, it is no persisted type. */
export type ManualContentKind = "basic" | "basic-reversed" | "cloze" | "single-choice" | "multiple-choice";

export interface ManualNoteInput {
  kind: ManualContentKind;
  front: string;
  back: string;
  answerOptions?: string[];
  correctOptionIndices?: number[];
  /** Fields with a role; a question field joins the forward question and the reverse answer. */
  additionalFields?: Array<{ id?: string; name?: string; value?: string; role?: AddableFieldRole }>;
  /** The forward card of a question/answer content asks to type the back. */
  typeIn?: boolean;
  tags?: unknown;
}

export type ManualNoteField = "front" | "back" | "options" | "correctOptions";
export type ManualNoteErrors = Partial<Record<ManualNoteField, string>>;

const FIELD_NAMES: Record<ManualContentKind, [string, string]> = {
  basic: ["Vorderseite", "Rückseite"],
  "basic-reversed": ["Vorderseite", "Rückseite"],
  cloze: ["Text", "Zusatzinfo"],
  "single-choice": ["Frage", "Erklärung"],
  "multiple-choice": ["Frage", "Erklärung"],
};

function isChoice(kind: ManualContentKind): kind is "single-choice" | "multiple-choice" {
  return kind === "single-choice" || kind === "multiple-choice";
}

function additionalFieldId(id: string | undefined, index: number, used: Set<string>): string {
  const base = String(id ?? "").trim().replace(/[^\w-]+/g, "-") || `field-${index + 1}`;
  let candidate = base;
  for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
  used.add(candidate);
  return candidate;
}

/** Validation with the editor's German field messages; the content parser still guards the stored form. */
export function validateManualNoteInput(input: ManualNoteInput): ManualNoteErrors {
  const errors: ManualNoteErrors = {};
  if (input.kind === "cloze") {
    if (!hasCardRichTextContent(input.front)) errors.front = "Bitte einen Cloze-Text eingeben.";
    else if (!clozeOrdinals(input.front)?.length || /\{\{c\d+::\s*\}\}/i.test(input.front)) errors.front = "Bitte gültige Lücken wie {{c1::Begriff}} verwenden.";
    return errors;
  }
  if (isChoice(input.kind)) {
    if (!hasCardRichTextContent(input.front)) errors.front = "Bitte eine Frage eingeben.";
    const options = (input.answerOptions ?? []).map((option) => String(option).trim());
    const nonEmpty = options.filter(Boolean);
    if (nonEmpty.length < 2 || nonEmpty.length !== options.length) errors.options = "Bitte mindestens zwei nichtleere Antwortoptionen eingeben.";
    else if (new Set(nonEmpty.map((option) => option.toLocaleLowerCase("de-DE"))).size !== nonEmpty.length) errors.options = "Antwortoptionen müssen eindeutig sein.";
    const indices = [...new Set(input.correctOptionIndices ?? [])].filter((index) => Number.isInteger(index) && index >= 0 && index < options.length && Boolean(options[index]));
    if (input.kind === "single-choice" && indices.length !== 1) errors.correctOptions = "Bitte genau eine gültige richtige Antwort auswählen.";
    if (input.kind === "multiple-choice") {
      if (indices.length === 0) errors.correctOptions = "Bitte mindestens eine gültige richtige Antwort auswählen.";
      else if (indices.length >= options.length) errors.correctOptions = "Bitte mindestens eine Antwortoption als falsch belassen.";
    }
    return errors;
  }
  if (!hasCardRichTextContent(input.front)) errors.front = "Bitte eine Vorderseite eingeben.";
  if (!hasCardRichTextContent(input.back)) errors.back = "Bitte eine Rückseite eingeben.";
  return errors;
}

/**
 * Shapes the manual editor input into universal content (still unvalidated). Front and back become question
 * and answer; for cloze and choice the back is an extra shown after reveal. Additional fields on the front
 * join the question, fields on the back become extras.
 */
export function createManualNoteContent(input: ManualNoteInput): NoteContent {
  const [frontName, backName] = FIELD_NAMES[input.kind];
  const used = new Set(["front", "back"]);
  const additional = (input.additionalFields ?? [])
    .filter((field) => String(field.name ?? "").trim())
    .map((field, index): NoteField => ({
      id: additionalFieldId(field.id, index, used),
      name: String(field.name).trim(),
      role: field.role ?? "extra",
      html: String(field.value ?? ""),
    }));
  const fields: NoteField[] = [
    { id: "front", name: frontName, role: "prompt", html: input.front },
    { id: "back", name: backName, role: input.kind === "basic" || input.kind === "basic-reversed" ? "answer" : "extra", html: input.back },
    ...additional,
  ];
  const questionFieldIds = ["front", ...additional.filter((field) => field.role === "prompt").map((field) => field.id)];
  const prompts: RevealPrompt[] = [
    { key: "forward", name: "Vorwärts", instruction: "", questionFieldIds, answerFieldIds: ["back"], requires: null, typeInFieldId: input.typeIn ? "back" : null },
    ...(input.kind === "basic-reversed"
      ? [{ key: "reverse", name: "Rückwärts", instruction: "", questionFieldIds: ["back"], answerFieldIds: questionFieldIds, requires: null, typeInFieldId: null }]
      : []),
  ];
  const correct = new Set(input.correctOptionIndices ?? []);
  const options: ChoiceOption[] = (input.answerOptions ?? []).map((option, index) => ({
    id: `option-${index + 1}`,
    html: escapeCardHtmlText(String(option).trim()),
    correct: correct.has(index),
  }));
  return {
    schemaVersion: 1,
    fields,
    interaction: input.kind === "cloze"
      ? { kind: "cloze" }
      : isChoice(input.kind)
        ? { kind: "choice", mode: input.kind === "single-choice" ? "single" : "multiple", options }
        : { kind: "reveal", prompts },
    speech: [],
    tags: normalizeTags(input.tags),
  };
}
