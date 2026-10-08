import type { ChoiceOption, Note, NoteContent } from "../coreTypes.ts";
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

export type NoteEditorValidation =
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
