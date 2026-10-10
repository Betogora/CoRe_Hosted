import type {
  ChoiceOption,
  NoteContent,
  NoteField,
  NoteFieldRequirement,
  NoteFieldRole,
  NoteInteraction,
  NoteSpeech,
  OcclusionMask,
  OcclusionShape,
  RevealPrompt,
} from "../coreTypes.ts";
import { sanitizeNoteHtml, stripSanitizedHtml } from "../htmlSafety.ts";
import { normalizeTags } from "./coreValues.ts";

type NoteContentParseResult =
  | { ok: true; value: NoteContent; promptKeys: string[] }
  | { ok: false; errors: string[] };

const FIELD_ROLES = new Set<NoteFieldRole>(["prompt", "answer", "hint", "extra", "source", "note"]);
const PROMPT_KEY = /^[a-z0-9][a-z0-9-]*$/;
const MEDIA_SOURCE = /\s(?:src|poster)="([^"]+)"/gi;
const SOUND_TAG = /\[sound:([^\]\r\n]+)\]/gi;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unitNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** A field counts as filled when it has visible text or embedded media, like Anki's card generation. */
function noteFieldHasContent(html: string): boolean {
  return stripSanitizedHtml(html).replace(/&nbsp;/gi, " ").trim().length > 0 || /<(?:img|audio|video)\b|\[sound:/i.test(html);
}

/** Cloze ordinals in Anki syntax, including `{{c1,2::…}}` and nested deletions. Returns null when a deletion is not closed. */
export function clozeOrdinals(html: string): number[] | null {
  const ordinals = new Set<number>();
  let depth = 0;
  for (const token of html.matchAll(/\{\{c(\d+(?:,\d+)*)::|\}\}/gi)) {
    if (token[1]) {
      depth += 1;
      for (const ordinal of token[1].split(",").map(Number)) if (ordinal > 0) ordinals.add(ordinal);
    } else if (depth > 0) {
      depth -= 1;
    }
  }
  return depth === 0 ? [...ordinals].sort((left, right) => left - right) : null;
}

function parseFields(input: unknown, errors: string[]): NoteField[] {
  const fields = list(input).map((candidate, index): NoteField => {
    const field = record(candidate);
    const role = field.role as NoteFieldRole;
    if (!text(field.id)) errors.push(`Feld ${index + 1} hat keine ID.`);
    if (!text(field.name)) errors.push(`Feld ${index + 1} hat keinen Namen.`);
    if (!FIELD_ROLES.has(role)) errors.push(`Feld „${text(field.name) || index + 1}“ hat keine gültige Rolle.`);
    return { id: text(field.id), name: text(field.name), role, html: sanitizeNoteHtml(field.html) };
  });
  if (fields.length === 0) errors.push("Ein Inhalt braucht mindestens ein Feld.");
  if (new Set(fields.map((field) => field.id)).size !== fields.length) errors.push("Feld-IDs müssen eindeutig sein.");
  if (new Set(fields.map((field) => field.name.toLocaleLowerCase("de"))).size !== fields.length) errors.push("Feldnamen müssen eindeutig sein.");
  return fields;
}

function fieldIdList(value: unknown, fieldIds: Set<string>, label: string, errors: string[]): string[] {
  const ids = list(value).map(text);
  for (const id of ids) if (!fieldIds.has(id)) errors.push(`${label} verweist auf das unbekannte Feld „${id}“.`);
  return ids;
}

function parseRequirement(value: unknown, fieldIds: Set<string>, label: string, errors: string[]): NoteFieldRequirement | null {
  if (value === null || value === undefined) return null;
  const requirement = record(value);
  if (requirement.mode !== "all" && requirement.mode !== "any") errors.push(`${label} hat keine gültige Bedingung.`);
  const ids = fieldIdList(requirement.fieldIds, fieldIds, label, errors);
  if (ids.length === 0) errors.push(`${label} hat eine Bedingung ohne Felder.`);
  return { mode: requirement.mode as NoteFieldRequirement["mode"], fieldIds: ids };
}

function parsePrompts(value: unknown, fieldIds: Set<string>, errors: string[]): RevealPrompt[] {
  const prompts = list(value).map((candidate, index): RevealPrompt => {
    const prompt = record(candidate);
    const label = `Abfrage „${text(prompt.name) || text(prompt.key) || index + 1}“`;
    if (!PROMPT_KEY.test(text(prompt.key))) errors.push(`${label} hat keinen gültigen Schlüssel.`);
    if (!text(prompt.name)) errors.push(`${label} hat keinen Namen.`);
    const questionFieldIds = fieldIdList(prompt.questionFieldIds, fieldIds, label, errors);
    if (questionFieldIds.length === 0) errors.push(`${label} zeigt auf der Vorderseite kein Feld.`);
    const typeInFieldId = text(prompt.typeInFieldId) || null;
    if (typeInFieldId && !fieldIds.has(typeInFieldId)) errors.push(`${label} verweist beim Eintippen auf ein unbekanntes Feld.`);
    return {
      key: text(prompt.key),
      name: text(prompt.name),
      instruction: text(prompt.instruction),
      questionFieldIds,
      answerFieldIds: fieldIdList(prompt.answerFieldIds, fieldIds, label, errors),
      requires: parseRequirement(prompt.requires, fieldIds, label, errors),
      typeInFieldId,
    };
  });
  if (prompts.length === 0) errors.push("Ein aufdeckbarer Inhalt braucht mindestens eine Abfrage.");
  if (new Set(prompts.map((prompt) => prompt.key)).size !== prompts.length) errors.push("Abfrageschlüssel müssen eindeutig sein.");
  return prompts;
}

function parseChoice(input: Record<string, unknown>, errors: string[]): NoteInteraction {
  const mode = input.mode as "single" | "multiple" | "kprim";
  if (!["single", "multiple", "kprim"].includes(mode)) errors.push("Die Auswahlfrage hat keinen gültigen Modus.");
  const options = list(input.options).map((candidate, index): ChoiceOption => {
    const option = record(candidate);
    if (!text(option.id)) errors.push(`Antwortoption ${index + 1} hat keine ID.`);
    if (typeof option.correct !== "boolean") errors.push(`Antwortoption ${index + 1} ist weder richtig noch falsch markiert.`);
    const html = sanitizeNoteHtml(option.html);
    if (!noteFieldHasContent(html)) errors.push(`Antwortoption ${index + 1} ist leer.`);
    return { id: text(option.id), html, correct: option.correct === true };
  });
  const correct = options.filter((option) => option.correct).length;
  if (new Set(options.map((option) => option.id)).size !== options.length) errors.push("Antwortoptionen brauchen eindeutige IDs.");
  if (mode === "kprim" && options.length !== 4) errors.push("Kprim braucht genau vier Aussagen.");
  if (mode !== "kprim" && options.length < 2) errors.push("Eine Auswahlfrage braucht mindestens zwei Antwortoptionen.");
  if (mode === "single" && correct !== 1) errors.push("Single Choice braucht genau eine richtige Antwort.");
  if (mode === "multiple" && (correct === 0 || correct === options.length)) {
    errors.push("Multiple Choice braucht mindestens eine richtige und eine falsche Antwort.");
  }
  return { kind: "choice", mode, options };
}

function isLocalMedia(value: string): boolean {
  return Boolean(value) && !/^[a-z][a-z\d+.-]*:/i.test(value);
}

function parseShape(value: unknown, label: string, errors: string[]): OcclusionShape {
  const shape = record(value);
  if (shape.kind === "overlay") {
    const answer = text(shape.answer) || null;
    if (!isLocalMedia(text(shape.question)) || (answer !== null && !isLocalMedia(answer))) errors.push(`${label} braucht lokale Maskenbilder.`);
    return { kind: "overlay", question: text(shape.question), answer };
  }
  const angle = typeof shape.angle === "number" && Number.isFinite(shape.angle) ? shape.angle : 0;
  if (shape.kind === "rect" || shape.kind === "ellipse") {
    const [left, top, width, height] = [shape.left, shape.top, shape.width, shape.height].map(unitNumber);
    if (left === null || top === null || width === null || height === null || !width || !height) {
      errors.push(`${label} braucht eine Position und Größe zwischen 0 und 1.`);
    }
    return { kind: shape.kind, left: left ?? 0, top: top ?? 0, width: width ?? 0, height: height ?? 0, angle };
  }
  if (shape.kind === "polygon") {
    const points = list(shape.points).map((point) => list(point).map(unitNumber));
    if (points.length < 3 || points.some((point) => point.length !== 2 || point.includes(null))) {
      errors.push(`${label} braucht mindestens drei Punkte zwischen 0 und 1.`);
    }
    return { kind: "polygon", points: points.map(([x, y]) => [x ?? 0, y ?? 0]) };
  }
  if (shape.kind === "text") {
    const [left, top] = [shape.left, shape.top].map(unitNumber);
    const scale = typeof shape.scale === "number" && shape.scale > 0 ? shape.scale : 1;
    const fontSize = unitNumber(shape.fontSize) || null;
    if (left === null || top === null || !text(shape.text)) errors.push(`${label} braucht Text und eine Position zwischen 0 und 1.`);
    return { kind: "text", left: left ?? 0, top: top ?? 0, text: text(shape.text), scale, fontSize, angle };
  }
  errors.push(`${label} hat keine gültige Form.`);
  return { kind: "rect", left: 0, top: 0, width: 0, height: 0, angle };
}

function parseImageOcclusion(input: Record<string, unknown>, errors: string[]): NoteInteraction {
  const image = text(input.image);
  const mode = input.mode as "hide-all-guess-one" | "hide-one-guess-one";
  if (!isLocalMedia(image)) errors.push("Die Bildverdeckung braucht ein lokales Bild.");
  if (mode !== "hide-all-guess-one" && mode !== "hide-one-guess-one") errors.push("Die Bildverdeckung hat keinen gültigen Modus.");
  const masks = list(input.masks).map((candidate, index): OcclusionMask => {
    const mask = record(candidate);
    const label = `Maske ${index + 1}`;
    if (!text(mask.id)) errors.push(`${label} hat keine ID.`);
    if (!Number.isSafeInteger(mask.ordinal) || Number(mask.ordinal) < (mask.alwaysOccluded === true ? 0 : 1)) errors.push(`${label} hat keine gültige Gruppennummer.`);
    return {
      id: text(mask.id),
      ordinal: Number(mask.ordinal),
      shape: parseShape(mask.shape, label, errors),
      alwaysOccluded: mask.alwaysOccluded === true,
    };
  });
  if (!masks.some((mask) => mask.ordinal > 0)) errors.push("Die Bildverdeckung braucht mindestens eine abgefragte Maske.");
  if (new Set(masks.map((mask) => mask.id)).size !== masks.length) errors.push("Masken brauchen eindeutige IDs.");
  return { kind: "image-occlusion", image, mode, masks };
}

function parseInteraction(value: unknown, fields: NoteField[], errors: string[]): NoteInteraction {
  const input = record(value);
  const fieldIds = new Set(fields.map((field) => field.id));
  const promptFields = fields.filter((field) => field.role === "prompt");
  if (input.kind === "reveal") return { kind: "reveal", prompts: parsePrompts(input.prompts, fieldIds, errors) };
  if (input.kind === "cloze") {
    if (promptFields.length === 0) errors.push("Ein Lückentext braucht mindestens ein Feld mit der Rolle Frage.");
    for (const field of promptFields) {
      if (clozeOrdinals(field.html) === null) errors.push(`Feld „${field.name}“ enthält eine nicht geschlossene Lücke.`);
    }
    return { kind: "cloze" };
  }
  if (input.kind === "choice") {
    if (promptFields.length === 0) errors.push("Eine Auswahlfrage braucht mindestens ein Feld mit der Rolle Frage.");
    return parseChoice(input, errors);
  }
  if (input.kind === "image-occlusion") return parseImageOcclusion(input, errors);
  errors.push("Der Inhalt hat keine gültige Abfrageart.");
  return { kind: "cloze" };
}

function parseSpeech(value: unknown, fieldIds: Set<string>, errors: string[]): NoteSpeech[] {
  return list(value).map((candidate) => {
    const speech = record(candidate);
    const fieldId = text(speech.fieldId);
    if (!fieldIds.has(fieldId)) errors.push(`Vorlesen verweist auf das unbekannte Feld „${fieldId}“.`);
    if (!/^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(text(speech.language))) errors.push(`Vorlesen für „${fieldId}“ hat keine gültige Sprache.`);
    return { fieldId, language: text(speech.language) };
  });
}

function requirementMet(requirement: NoteFieldRequirement | null, filled: Set<string>): boolean {
  if (!requirement) return true;
  return requirement.mode === "all"
    ? requirement.fieldIds.every((id) => filled.has(id))
    : requirement.fieldIds.some((id) => filled.has(id));
}

/**
 * Card keys a note produces, in stable order: one per satisfied reveal prompt
 * (`<prompt key>`), `choice`, one per cloze ordinal (`cloze:N`) or one per
 * occlusion group (`io:N`). A reveal prompt also needs a filled question field.
 */
/** Short German name of a card's prompt within its content, such as „Lücke 2“, „Rückwärts“ or „Maske 1“. */
export function notePromptLabel(content: NoteContent, promptKey: string): string {
  const [kind, number] = promptKey.split(":");
  if (kind === "cloze" && number) return `Lücke ${number}`;
  if (kind === "io" && number) return `Maske ${number}`;
  if (promptKey === "choice") return "Auswahl";
  const prompt = content.interaction.kind === "reveal" ? content.interaction.prompts.find((candidate) => candidate.key === promptKey) : undefined;
  return prompt?.name.trim() || promptKey;
}

export function deriveNotePromptKeys(content: NoteContent): string[] {
  const interaction = content.interaction;
  if (interaction.kind === "choice") return ["choice"];
  if (interaction.kind === "image-occlusion") {
    return [...new Set(interaction.masks.map((mask) => mask.ordinal).filter((ordinal) => ordinal > 0))].sort((left, right) => left - right).map((ordinal) => `io:${ordinal}`);
  }
  if (interaction.kind === "cloze") {
    const ordinals = new Set(content.fields.filter((field) => field.role === "prompt").flatMap((field) => clozeOrdinals(field.html) ?? []));
    return [...ordinals].sort((left, right) => left - right).map((ordinal) => `cloze:${ordinal}`);
  }
  const filled = new Set(content.fields.filter((field) => noteFieldHasContent(field.html)).map((field) => field.id));
  return interaction.prompts
    .filter((prompt) => requirementMet(prompt.requires, filled) && prompt.questionFieldIds.some((id) => filled.has(id)))
    .map((prompt) => prompt.key);
}

function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Media file names referenced by the note, used for storage links and offline downloads. */
export function noteContentMediaRefs(content: NoteContent): string[] {
  const refs = new Set<string>();
  const htmlParts = [
    ...content.fields.map((field) => field.html),
    ...(content.interaction.kind === "choice" ? content.interaction.options.map((option) => option.html) : []),
  ];
  for (const html of htmlParts) {
    for (const match of html.matchAll(MEDIA_SOURCE)) if (!match[1].startsWith("data:")) refs.add(decodeAttribute(match[1]));
    for (const match of html.matchAll(SOUND_TAG)) refs.add(match[1].trim());
  }
  if (content.interaction.kind === "image-occlusion") {
    refs.add(content.interaction.image);
    for (const { shape } of content.interaction.masks) {
      if (shape.kind !== "overlay") continue;
      refs.add(shape.question);
      if (shape.answer) refs.add(shape.answer);
    }
  }
  return [...refs].sort();
}

/** Validates untrusted note content and returns it with sanitized HTML and normalized tags. */
export function parseNoteContent(input: unknown): NoteContentParseResult {
  const errors: string[] = [];
  const source = record(input);
  if (source.schemaVersion !== 1) errors.push("Unbekannte Version des Inhaltsschemas.");
  const fields = parseFields(source.fields, errors);
  const interaction = parseInteraction(source.interaction, fields, errors);
  const speech = parseSpeech(source.speech, new Set(fields.map((field) => field.id)), errors);
  if (errors.length > 0) return { ok: false, errors };
  const value: NoteContent = { schemaVersion: 1, fields, interaction, speech, tags: normalizeTags(source.tags) };
  const promptKeys = deriveNotePromptKeys(value);
  if (promptKeys.length === 0) return { ok: false, errors: ["Aus diesem Inhalt entsteht keine Karte."] };
  return { ok: true, value, promptKeys };
}
