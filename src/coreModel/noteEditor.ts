import type { ChoiceOption, Note, NoteContent, NoteField, NoteFieldRole, RevealPrompt } from "../coreTypes.ts";
import { stripSanitizedHtml } from "../htmlSafety.ts";
import { escapeCardHtmlText, hasCardRichTextContent } from "../richText.ts";
import { normalizeTags } from "./coreValues.ts";
import { parseNoteContent } from "./noteContent.ts";

/** Editable parts of a content: field HTML, choice options and tags; structure and prompts stay as they are. */
export interface NoteEditorValue {
  fields: Record<string, string>;
  options: Array<{ id: string; text: string; correct: boolean }> | null;
  tags: string[];
}

export type NoteEditorErrors = Record<string, string>;

type NoteEditorValidation =
  | { ok: true; content: NoteContent; errors: Record<string, never> }
  | { ok: false; content: null; errors: NoteEditorErrors };

function optionText(option: ChoiceOption): string {
  return stripSanitizedHtml(option.html).replace(/\s+/g, " ").trim();
}

export function noteEditorValue(note: Pick<Note, "content">): NoteEditorValue {
  const { content } = note;
  return {
    fields: Object.fromEntries(content.fields.map((field) => [field.id, field.html])),
    options: content.interaction.kind === "choice"
      ? content.interaction.options.map((option) => ({ id: option.id, text: optionText(option), correct: option.correct }))
      : null,
    tags: [...content.tags],
  };
}

/** Applies editor values to the content; option HTML is only replaced when its text changed. */
export function applyNoteEditorValue(content: NoteContent, value: NoteEditorValue): NoteContent {
  const interaction = content.interaction.kind === "choice" && value.options
    ? {
      ...content.interaction,
      options: value.options.map((option): ChoiceOption => {
        const previous = content.interaction.kind === "choice" ? content.interaction.options.find((candidate) => candidate.id === option.id) : undefined;
        const text = option.text.trim();
        return {
          id: option.id,
          html: previous && optionText(previous) === text ? previous.html : escapeCardHtmlText(text),
          correct: option.correct,
        };
      }),
    }
    : content.interaction;
  return {
    ...content,
    fields: content.fields.map((field) => ({ ...field, html: value.fields[field.id] ?? field.html })),
    interaction,
    tags: normalizeTags(value.tags),
  };
}

// --- Building blocks (K6.1) ----------------------------------------------------------------

/** Field roles the editor can add; a question field only where a prompt asks it. */
export type AddableFieldRole = Extract<NoteFieldRole, "prompt" | "hint" | "extra" | "source">;

/** Forward and optional reverse prompt of a plain question/answer content; null for any other structure. */
function plainRevealPrompts(content: NoteContent): { forward: RevealPrompt; reverse: RevealPrompt | null } | null {
  if (content.interaction.kind !== "reveal") return null;
  const { prompts } = content.interaction;
  const forward = prompts.find((prompt) => prompt.key === "forward");
  if (!forward || prompts.some((prompt) => prompt.key !== "forward" && prompt.key !== "reverse")) return null;
  return { forward, reverse: prompts.find((prompt) => prompt.key === "reverse") ?? null };
}

function reversePrompt(forward: RevealPrompt): RevealPrompt {
  return { key: "reverse", name: "Rückwärts", instruction: "", questionFieldIds: forward.answerFieldIds, answerFieldIds: forward.questionFieldIds, requires: null, typeInFieldId: null };
}

/** Switchable building blocks of a content; null where its structure does not offer them. */
export function noteBlocks(content: NoteContent): { reverse: boolean | null; typeIn: boolean | null; fieldRoles: AddableFieldRole[] } {
  const plain = plainRevealPrompts(content);
  const asksPromptFields = Boolean(plain) || content.interaction.kind === "cloze" || content.interaction.kind === "choice";
  return {
    reverse: plain ? plain.reverse !== null : null,
    typeIn: plain ? plain.forward.typeInFieldId !== null : null,
    fieldRoles: asksPromptFields ? ["prompt", "hint", "extra", "source"] : ["hint", "extra", "source"],
  };
}

/** Adds or removes the reverse direction; the change planner turns it into a new or removed card. */
export function setNoteReverse(content: NoteContent, enabled: boolean): NoteContent {
  const plain = plainRevealPrompts(content);
  if (!plain || (plain.reverse !== null) === enabled) return content;
  return { ...content, interaction: { kind: "reveal", prompts: enabled ? [plain.forward, reversePrompt(plain.forward)] : [plain.forward] } };
}

/** The forward card asks to type its first answer field. */
export function setNoteTypeIn(content: NoteContent, enabled: boolean): NoteContent {
  const plain = plainRevealPrompts(content);
  if (!plain) return content;
  const typeInFieldId = enabled ? plain.forward.answerFieldIds[0] ?? null : null;
  const forward = { ...plain.forward, typeInFieldId };
  return { ...content, interaction: { kind: "reveal", prompts: plain.reverse ? [forward, plain.reverse] : [forward] } };
}

const NEW_FIELD_NAMES: Record<AddableFieldRole, string> = { prompt: "Zusatzfrage", hint: "Hinweis", extra: "Zusatz", source: "Quelle" };

/** Adds an empty field; a question field joins the forward question and the reverse answer. */
export function addNoteField(content: NoteContent, role: AddableFieldRole): { content: NoteContent; fieldId: string } {
  if (!noteBlocks(content).fieldRoles.includes(role)) throw new Error("Dieser Inhalt kann kein solches Feld aufnehmen.");
  const ids = new Set(content.fields.map((field) => field.id));
  let index = 1;
  while (ids.has(`field-${index}`)) index += 1;
  const base = NEW_FIELD_NAMES[role];
  const sameName = content.fields.filter((field) => field.name === base || field.name.startsWith(`${base} `)).length;
  const field: NoteField = { id: `field-${index}`, name: sameName ? `${base} ${sameName + 1}` : base, role, html: "" };
  const plain = role === "prompt" ? plainRevealPrompts(content) : null;
  const interaction = plain
    ? (() => {
      const forward = { ...plain.forward, questionFieldIds: [...plain.forward.questionFieldIds, field.id] };
      return { kind: "reveal" as const, prompts: plain.reverse ? [forward, { ...plain.reverse, answerFieldIds: forward.questionFieldIds }] : [forward] };
    })()
    : content.interaction;
  return { content: { ...content, fields: [...content.fields, field], interaction }, fieldId: field.id };
}

/** A field may go when no prompt loses its last question or answer and a cloze or choice keeps a question. */
export function canRemoveNoteField(content: NoteContent, fieldId: string): boolean {
  const field = content.fields.find((candidate) => candidate.id === fieldId);
  if (!field) return false;
  const { interaction } = content;
  if (interaction.kind === "reveal") {
    return interaction.prompts.every((prompt) => prompt.questionFieldIds.some((id) => id !== fieldId) && prompt.answerFieldIds.some((id) => id !== fieldId));
  }
  if (interaction.kind === "image-occlusion") return true;
  return field.role !== "prompt" || content.fields.some((candidate) => candidate.id !== fieldId && candidate.role === "prompt");
}

export function removeNoteField(content: NoteContent, fieldId: string): NoteContent {
  if (!canRemoveNoteField(content, fieldId)) throw new Error("Dieses Feld trägt eine Abfrage und kann nicht entfernt werden.");
  const without = (ids: string[]) => ids.filter((id) => id !== fieldId);
  const interaction = content.interaction.kind === "reveal"
    ? {
      kind: "reveal" as const,
      prompts: content.interaction.prompts.map((prompt) => ({
        ...prompt,
        questionFieldIds: without(prompt.questionFieldIds),
        answerFieldIds: without(prompt.answerFieldIds),
        typeInFieldId: prompt.typeInFieldId === fieldId ? null : prompt.typeInFieldId,
        requires: prompt.requires && prompt.requires.fieldIds.includes(fieldId)
          ? (without(prompt.requires.fieldIds).length ? { ...prompt.requires, fieldIds: without(prompt.requires.fieldIds) } : null)
          : prompt.requires,
      })),
    }
    : content.interaction;
  return { ...content, fields: content.fields.filter((field) => field.id !== fieldId), interaction };
}

export function renameNoteField(content: NoteContent, fieldId: string, name: string): NoteContent {
  return { ...content, fields: content.fields.map((field) => field.id === fieldId ? { ...field, name } : field) };
}

/**
 * Validates edited content. Manual question/answer notes keep the editor's required front and back; all
 * notes must still produce a card. Errors are keyed by field id, `options` or `form`.
 */
export function validateNoteEditorValue(note: Pick<Note, "content" | "source">, value: NoteEditorValue): NoteEditorValidation {
  const errors: NoteEditorErrors = {};
  const candidate = applyNoteEditorValue(note.content, value);
  if (note.source === "manual" && candidate.interaction.kind === "reveal") {
    for (const id of ["front", "back"]) {
      const field = candidate.fields.find((entry) => entry.id === id);
      if (field && !hasCardRichTextContent(field.html)) errors[id] = id === "front" ? "Bitte eine Vorderseite eingeben." : "Bitte eine Rückseite eingeben.";
    }
  }
  if (candidate.interaction.kind === "choice") {
    const texts = (value.options ?? []).map((option) => option.text.trim());
    if (texts.some((text) => !text)) errors.options = "Bitte mindestens zwei nichtleere Antwortoptionen eingeben.";
    else if (new Set(texts.map((text) => text.toLocaleLowerCase("de-DE"))).size !== texts.length) errors.options = "Antwortoptionen müssen eindeutig sein.";
  }
  const parsed = parseNoteContent(candidate);
  if (!parsed.ok && Object.keys(errors).length === 0) errors.form = parsed.errors.join(" ");
  return Object.keys(errors).length > 0 || !parsed.ok
    ? { ok: false, content: null, errors }
    : { ok: true, content: parsed.value, errors: {} };
}
