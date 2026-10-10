import type { AnkiPackage, AnkiPackageMediaFile, AnkiReviewHistoryEntry } from "./apkgImportInternal.ts";
import type {
  Card,
  ChoiceOption,
  Note,
  NoteContent,
  NoteField,
  NoteFieldRole,
  NoteSpeech,
  OcclusionMask,
  OcclusionShape,
  RevealPrompt,
  ReviewRating,
  ReviewSchedulerState,
} from "./coreTypes.ts";
import { makeId, stableContentHash } from "./coreModel/coreValues.ts";
import { noteContentMediaRefs } from "./coreModel/noteContent.ts";
import { createNote } from "./coreModel/notes.ts";
import { cardStudyFromReviewState, createReviewState } from "./coreModel/reviewState.ts";
import { compileSafeTemplate, type SafeTemplateAstNode } from "./safeTemplate.ts";
import { scheduleWithFsrs } from "./scheduler.ts";

// ADR-033: versioned translators turn Anki note types into the universal CoRe content.
// The pipeline is pure apart from reading media for nothing but its index; it is wired into the app in the cutover (K4.9).

interface TranslatorId { id: string; version: number }
type FieldRole = NoteFieldRole | "consumed";

export interface ImportDeck {
  id: string;
  ankiDeckId: string | null;
  name: string;
  hierarchyPath: string[];
  parentDeckId: string | null;
}

export interface ImportReviewEvent {
  id: string;
  cardId: string;
  rating: ReviewRating;
  answeredAt: string;
  responseTimeMs: number | null;
  schedulerBefore: unknown;
  schedulerAfter: unknown;
  flags: Record<string, unknown>;
}

/** Invisible Anki template per note type, kept so improved translators can re-translate imports (K5.4). */
export interface NoteTypeSource {
  id: string;
  ankiNotetypeId: string;
  name: string;
  translator: TranslatorId;
  kind: number;
  originalStockKind: number;
  css: string;
  fields: Array<{ name: string; ordinal: number }>;
  templates: Array<{ name: string; ordinal: number; front: string; back: string; targetDeckId: string | null }>;
  config: unknown;
}

/** Raw Anki field values of an imported note (media names already canonical), the input of any re-translation. */
export interface NoteSource {
  noteId: string;
  noteTypeSourceId: string;
  fields: string[];
}

type StudyMigration = "fsrs-memory-state" | "revlog-replay" | "classic-state" | "new";

export interface ApkgNotetypeReport {
  ankiNotetypeId: string;
  name: string;
  translator: TranslatorId;
  notes: number;
  cards: number;
  /** Notes that only became a plain field list because the translator's result was invalid. */
  fallbackNotes: number;
  /** Notes without any displayable field; they are skipped. */
  untranslatableNotes: number;
  fieldRoles: Record<string, FieldRole>;
  /** Fields that keep no visible role in the review and remain editor-only notes. */
  unmappedFields: string[];
  missingMedia: string[];
  study: Record<StudyMigration, number>;
}

export interface ApkgTranslationReport {
  packageFormat: string;
  mediaFormat: string;
  detected: { decks: number; notes: number; cards: number; reviewEvents: number };
  imported: { decks: number; notes: number; cards: number; mediaFiles: number; reviewEvents: number };
  notetypes: ApkgNotetypeReport[];
  /** Cards CoRe derives from the content although the package has none, e.g. after deleted Anki cards. */
  addedCards: number;
  /** Anki cards whose prompt no longer exists in the translated content. */
  droppedCards: number;
  reviewHistory: { skipped: number; unmapped: number; duplicates: number };
  missingMedia: string[];
  warnings: string[];
  errors: string[];
}

export interface ApkgImportGraph {
  decks: ImportDeck[];
  notes: Note[];
  cards: Card[];
  mediaFiles: AnkiPackageMediaFile[];
  reviewEvents: ImportReviewEvent[];
  noteTypeSources: NoteTypeSource[];
  noteSources: NoteSource[];
  report: ApkgTranslationReport;
}

interface NotetypePlan {
  translator: TranslatorId;
  fieldRoles: Record<string, FieldRole>;
  promptKey(ordinal: number): string;
  /** Media whose text the content needs (Image Occlusion Enhanced mask SVGs); read before the translation. */
  maskMedia?(values: string[]): string[];
  /**
   * Untrusted content candidate validated by createNote; null when the note does not fit the translator.
   * `maskSvgs` holds the texts of `maskMedia` and is missing when the package media are unavailable.
   */
  content(values: string[], maskSvgs?: ReadonlyMap<string, string>): Omit<NoteContent, "tags"> | null;
}

interface AnkiModel {
  name: string;
  kind: number;
  originalStockKind: number;
  css: string;
  fields: string[];
  templates: Array<{ ordinal: number; name: string; front: string; back: string; targetDeckId: string | null }>;
  config: unknown;
}

const BASIC = { id: "anki-basic", version: 1 };
const CLOZE = { id: "anki-cloze", version: 1 };
const IMAGE_OCCLUSION = { id: "anki-image-occlusion", version: 2 };
const IMAGE_OCCLUSION_ENHANCED = { id: "image-occlusion-enhanced", version: 2 };
const MULTIPLE_CHOICE = { id: "multiple-choice-for-anki", version: 1 };
const ANKING = { id: "anking", version: 1 };
const GENERIC = { id: "generic", version: 1 };
const FIELD_LIST = { id: "field-list", version: 1 };
const DAY_MS = 86_400_000;

// --- Small text helpers -------------------------------------------------------------------

function plainText(html: string): string {
  return html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ").trim();
}

function hasContent(html: string): boolean {
  return plainText(html).length > 0 || /<(?:img|audio|video)\b|\[sound:/i.test(html);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|apos);/gi, (_match, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[name.toLowerCase()]!)
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, number: string) => {
      const code = number[0].toLowerCase() === "x" ? Number.parseInt(number.slice(1), 16) : Number(number);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function firstImageSource(html: string): string {
  const match = html.match(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
}

/** Anki's `{{furigana:…}}`: `漢字[かんじ]` becomes ruby text. */
function furigana(html: string, mode: "furigana" | "kana" | "kanji"): string {
  return html.replace(/ ?([^ >[\]]+?)\[([^\]]+?)\]/g, (_match, base: string, reading: string) =>
    mode === "kana" ? reading : mode === "kanji" ? base : `<ruby>${base}<rt>${reading}</rt></ruby>`);
}

// --- Note type model ----------------------------------------------------------------------

function normalizeModel(raw: any): AnkiModel {
  const config = raw?.config ?? {};
  const fields = [...(Array.isArray(raw?.flds) ? raw.flds : [])].sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0));
  const templates = [...(Array.isArray(raw?.tmpls) ? raw.tmpls : [])].sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0));
  return {
    name: String(raw?.name ?? "Unbekannter Notiztyp"),
    kind: Number(config.kind ?? raw?.type ?? 0),
    originalStockKind: Number(config.originalStockKind ?? raw?.originalStockKind ?? 0),
    css: String(config.css ?? raw?.css ?? ""),
    fields: fields.map((field, index) => String(field.name ?? `Feld ${index + 1}`)),
    templates: templates.map((template, index) => ({
      ordinal: Number(template.ord ?? index),
      name: String(template.name ?? `Karte ${index + 1}`),
      front: String(template.config?.questionFormat ?? template.qfmt ?? ""),
      back: String(template.config?.answerFormat ?? template.afmt ?? ""),
      targetDeckId: template.config?.targetDeckId ?? (template.did == null ? null : String(template.did)),
    })),
    config: jsonSafe(config),
  };
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null, (_key, item) => typeof item === "bigint" ? String(item) : item instanceof Uint8Array ? undefined : item));
}

function fieldId(ordinal: number) {
  return `f${ordinal}`;
}

function contentFields(model: AnkiModel, roles: Record<string, FieldRole>, values: string[], transform: (ordinal: number, html: string) => string = (_ordinal, html) => html): NoteField[] {
  return model.fields.flatMap((name, ordinal) => {
    const role = roles[name];
    return role === "consumed" ? [] : [{ id: fieldId(ordinal), name, role, html: transform(ordinal, values[ordinal] ?? "") }];
  });
}

// --- Template analysis for the generic translator (K5.3) ------------------------------------

interface TemplateRef {
  ordinal: number;
  filters: string[];
  conditions: number[];
  answerSide: boolean;
  /** Inside a `{{#Field}}` section with a button, i.e. only shown on demand. */
  behindButton: boolean;
  /** Inside an element hidden with `display:none` until a control reveals it. */
  hidden: boolean;
  /** Static text on the same line before and after the field, and the line above it. */
  line: { before: string; after: string; previous: string };
  /** `href="prefix{{Field}}suffix"`: the field holds a link target. */
  href: { prefix: string; suffix: string } | null;
}

const BLOCK_BREAK = /<(?:br|p|hr|li|tr|table|h[1-6])\b[^>]*>|<\/(?:p|li|tr|table|h[1-6])>/i;
// Note-type metadata keeps its role wherever the template shows it, e.g. in a header on both sides.
const METADATA_FIELD = /^(?:note ?id|ankihub[_ ]?id|guid|date[- ]?stamp|id \(hidden\))$/i;
const SOURCE_FIELD = /^(?:sources?|quellen?)$|\b(?:amboss|links?|url)\b/i;
const EXTRA_FIELD = /^(?:back )?extra$/i;

function withoutScripts(source: string) {
  return source.replace(/<(script|style)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, "");
}

/** Visible template text without buttons and links, which are Anki controls rather than card text. */
function staticText(html: string) {
  return plainText(decodeHtmlEntities(html.replace(/<(button|a)\b[\s\S]*?<\/\1>/gi, " "))).replace(/\u200b/g, "").trim();
}

function analyzeTemplate(source: string, model: AnkiModel) {
  const fields = model.fields.map((name, ordinal) => ({ id: fieldId(ordinal), name }));
  const { ast } = compileSafeTemplate(withoutScripts(source), fields);
  const refs: TemplateRef[] = [];
  let answerSide = false;
  const visit = (nodes: SafeTemplateAstNode[], conditions: number[], behindButton: boolean) => {
    nodes.forEach((node, index) => {
      if (node.kind === "text") {
        if (/<hr\b[^>]*\bid\s*=\s*["']?answer\b/i.test(node.value)) answerSide = true;
      } else if (node.kind === "front-side") {
        answerSide = true;
      } else if (node.kind === "conditional") {
        const ordinal = model.fields.indexOf(node.sourceName);
        const button = node.children.some((child) => child.kind === "text" && /<button\b|\sonclick\s*=/i.test(child.value));
        visit(node.children, node.inverted || ordinal < 0 ? conditions : [...conditions, ordinal], behindButton || button);
      } else {
        const ordinal = model.fields.indexOf(node.sourceName);
        if (ordinal < 0) return;
        const previous = nodes[index - 1]?.kind === "text" ? (nodes[index - 1] as { value: string }).value : "";
        const next = nodes[index + 1]?.kind === "text" ? (nodes[index + 1] as { value: string }).value : "";
        const href = previous.match(/\shref\s*=\s*(["'])([^"']*)$/i);
        refs.push({
          ordinal,
          filters: node.filters,
          conditions,
          answerSide,
          behindButton,
          hidden: /<[a-z][^>]*display\s*:\s*none/i.test(previous.slice(previous.lastIndexOf("</") + 1)),
          line: {
            before: staticText(previous.split(BLOCK_BREAK).at(-1)!),
            after: staticText(next.split(BLOCK_BREAK)[0]),
            previous: previous.split(BLOCK_BREAK).slice(0, -1).map(staticText).filter(Boolean).at(-1) ?? "",
          },
          href: href ? { prefix: href[2], suffix: next.slice(0, Math.max(0, next.indexOf(href[1]))) } : null,
        });
      }
    });
  };
  visit(ast.nodes, [], false);
  return { refs, hasAnswerMarker: answerSide };
}

const isHint = (ref: TemplateRef) => ref.filters.includes("hint");
const isTypeIn = (ref: TemplateRef) => ref.filters.includes("type");
const ttsLanguage = (ref: TemplateRef) => ref.filters.find((filter) => filter.startsWith("tts "))?.split(/\s+/)[1] ?? null;
const isDisplayed = (ref: TemplateRef) => !isHint(ref) && !isTypeIn(ref) && ttsLanguage(ref) === null && ref.href === null && !ref.behindButton;

/** A link target becomes a link labelled with the field name, so it renders as a source chip. */
function linkField(name: string, html: string, href: { prefix: string; suffix: string }) {
  const url = `${href.prefix}${plainText(html)}${href.suffix}`;
  return /<a\b/i.test(html) || !/^https?:\/\/\S+$/.test(url) ? html : `<a href="${escapeAttribute(url)}">${escapeAttribute(name)}</a>`;
}

function genericPlan(model: AnkiModel, translator: TranslatorId, promptKey: (ordinal: number) => string): NotetypePlan {
  const cloze = model.kind === 1;
  const roles: Record<string, FieldRole> = {};
  const assign = (ordinal: number, role: NoteFieldRole) => { roles[model.fields[ordinal]] ??= role; };
  const prompts: RevealPrompt[] = [];
  const speech = new Map<number, string>();
  const rubyModes = new Map<number, "furigana" | "kana" | "kanji">();
  const links = new Map<number, { prefix: string; suffix: string }>();
  model.fields.forEach((name, ordinal) => {
    if (METADATA_FIELD.test(name.trim())) assign(ordinal, "note");
    else if (SOURCE_FIELD.test(name.trim())) assign(ordinal, "source");
    else if (EXTRA_FIELD.test(name.trim())) assign(ordinal, "extra");
  });

  for (const template of model.templates) {
    const front = analyzeTemplate(template.front, model);
    const back = analyzeTemplate(template.back, model);
    const frontOrdinals = new Set(front.refs.map((ref) => ref.ordinal));
    for (const ref of [...front.refs, ...back.refs]) {
      const language = ttsLanguage(ref);
      if (language) speech.set(ref.ordinal, language);
      const ruby = ref.filters.find((filter): filter is "furigana" | "kana" | "kanji" => filter === "furigana" || filter === "kana" || filter === "kanji");
      if (ruby) rubyModes.set(ref.ordinal, ruby);
      if (ref.href && !links.has(ref.ordinal)) links.set(ref.ordinal, ref.href);
      if (isHint(ref)) assign(ref.ordinal, "hint");
      if (ref.href) assign(ref.ordinal, "source");
    }
    for (const ref of front.refs) if (ref.behindButton) assign(ref.ordinal, "hint");
    const asksWith = (ordinal: number) => roles[model.fields[ordinal]] === undefined || roles[model.fields[ordinal]] === "prompt" || roles[model.fields[ordinal]] === "answer";
    const displayed = front.refs.filter((ref) => isDisplayed(ref) && asksWith(ref.ordinal));
    const question = [...new Set(displayed.map((ref) => ref.ordinal))];
    const typeIn = front.refs.find(isTypeIn)?.ordinal ?? null;
    const answerRefs = back.refs.filter((ref) => !isHint(ref) && ttsLanguage(ref) === null && ref.href === null
      && (back.hasAnswerMarker ? ref.answerSide : !frontOrdinals.has(ref.ordinal)));
    for (const ordinal of question) assign(ordinal, "prompt");
    // Back fields shown directly answer; fields revealed on demand are supplements.
    for (const ref of answerRefs) assign(ref.ordinal, cloze || ref.behindButton || ref.hidden ? "extra" : "answer");
    const answer = [...new Set(answerRefs.map((ref) => ref.ordinal))].filter((ordinal) => !question.includes(ordinal));
    if (cloze || question.length === 0) continue;
    // A front that is entirely wrapped in `{{#Field}}` only exists when that field is filled.
    const required = [...new Set(displayed[0]?.conditions ?? [])]
      .filter((ordinal) => !question.includes(ordinal) && displayed.every((ref) => ref.conditions.includes(ordinal)));
    // Static text on the line of a question field becomes the instruction, with `…` for the field;
    // otherwise a question line directly above the first field, such as "Blickdiagnose?".
    const line = displayed.find((ref) => ref.line.before)?.line;
    const heading = /[?:]$/.test(displayed[0]?.line.previous ?? "") ? displayed[0].line.previous : "";
    prompts.push({
      key: promptKey(template.ordinal),
      name: template.name,
      instruction: line ? `${line.before} …${line.after}`.replace(/\s+/g, " ").trim() : heading,
      questionFieldIds: question.map(fieldId),
      answerFieldIds: answer.filter((ordinal) => roles[model.fields[ordinal]] === "answer" || roles[model.fields[ordinal]] === "prompt").map(fieldId),
      requires: required.length ? { mode: "all", fieldIds: required.map(fieldId) } : null,
      typeInFieldId: typeIn === null ? null : fieldId(typeIn),
    });
    if (typeIn !== null) assign(typeIn, "answer");
  }
  for (const name of model.fields) roles[name] ??= "note";
  const transform = (ordinal: number, html: string) => {
    const ruby = rubyModes.get(ordinal);
    const link = links.get(ordinal);
    return link && roles[model.fields[ordinal]] === "source" ? linkField(model.fields[ordinal], html, link) : ruby ? furigana(html, ruby) : html;
  };
  return {
    translator,
    fieldRoles: roles,
    promptKey,
    content: (values) => ({
      schemaVersion: 1,
      fields: contentFields(model, roles, values, transform),
      interaction: cloze ? { kind: "cloze" } : { kind: "reveal", prompts },
      speech: [...speech].map(([ordinal, language]): NoteSpeech => ({ fieldId: fieldId(ordinal), language })),
    }),
  };
}

/** Last resort so no note is lost: the first filled field asks, the remaining fields answer. */
function fieldListContent(model: AnkiModel, values: string[], ordinals: number[]): Omit<NoteContent, "tags"> {
  const question = values.findIndex(hasContent);
  return {
    schemaVersion: 1,
    fields: model.fields.map((name, ordinal) => ({ id: fieldId(ordinal), name, role: ordinal === question ? "prompt" : "answer", html: values[ordinal] ?? "" })),
    interaction: {
      kind: "reveal",
      prompts: ordinals.map((ordinal) => ({
        key: `anki-${ordinal}`,
        name: model.templates.find((template) => template.ordinal === ordinal)?.name ?? `Karte ${ordinal + 1}`,
        instruction: "",
        questionFieldIds: [fieldId(Math.max(0, question))],
        answerFieldIds: model.fields.map((_name, index) => index).filter((index) => index !== question).map(fieldId),
        requires: null,
        typeInFieldId: null,
      })),
    },
    speech: [],
  };
}

// --- Specialized translators (K5.2) -------------------------------------------------------

function fieldByName(model: AnkiModel, pattern: RegExp): number {
  return model.fields.findIndex((name) => pattern.test(name.trim()));
}

function templateSource(model: AnkiModel) {
  return model.templates.map((template) => `${template.front}\n${template.back}`).join("\n");
}

function multipleChoicePlan(model: AnkiModel): NotetypePlan | null {
  const question = fieldByName(model, /^question$/i);
  const answers = fieldByName(model, /^answers$/i);
  const type = fieldByName(model, /^qtype\b/i);
  const options = model.fields.map((name, ordinal) => ({ ordinal, number: Number(/^q_(\d+)$/i.exec(name.trim())?.[1] ?? NaN) }))
    .filter((option) => Number.isFinite(option.number)).sort((left, right) => left.number - right.number).map((option) => option.ordinal);
  const signature = /\bid\s*=\s*["']?(?:qtable|Q_solutions)\b/i.test(templateSource(model));
  if (question < 0 || answers < 0 || type < 0 || options.length < 2 || !signature) return null;
  const roles: Record<string, FieldRole> = {};
  model.fields.forEach((name, ordinal) => {
    roles[name] = ordinal === question ? "prompt"
      : ordinal === answers || ordinal === type || options.includes(ordinal) ? "consumed"
        : /^title$/i.test(name.trim()) ? "note"
          : /^sources?$/i.test(name.trim()) ? "source" : "extra";
  });
  return {
    translator: MULTIPLE_CHOICE,
    fieldRoles: roles,
    promptKey: () => "choice",
    content: (values) => {
      // QType: 0 = Kprim, 1 = Multiple Choice, 2 = Single Choice; Answers masks the filled options.
      const mode = ({ 0: "kprim", 1: "multiple", 2: "single" } as const)[plainText(values[type] ?? "") as "0" | "1" | "2"];
      const filled = options.filter((ordinal) => hasContent(values[ordinal] ?? ""));
      const mask = plainText(values[answers] ?? "").split(/\s+/).filter(Boolean);
      if (mode === undefined || mask.length !== filled.length || mask.some((flag) => flag !== "0" && flag !== "1")) return null;
      return {
        schemaVersion: 1,
        fields: contentFields(model, roles, values),
        interaction: {
          kind: "choice",
          mode,
          options: filled.map((ordinal, index): ChoiceOption => ({ id: `o${index + 1}`, html: values[ordinal], correct: mask[index] === "1" })),
        },
        speech: [],
      };
    },
  };
}

function imageOcclusionEnhancedPlan(model: AnkiModel): NotetypePlan | null {
  const image = fieldByName(model, /^image$/i);
  const question = fieldByName(model, /^question mask$/i);
  const answer = fieldByName(model, /^answer mask$/i);
  if (image < 0 || question < 0 || answer < 0 || fieldByName(model, /^original mask$/i) < 0) return null;
  const roles: Record<string, FieldRole> = {};
  for (const name of model.fields) {
    const key = name.trim().toLowerCase();
    roles[name] = /^(image|question mask|answer mask|original mask)$/.test(key) ? "consumed"
      : key === "header" ? "prompt"
        : key === "remarks" || key.startsWith("extra") ? "extra"
          : /^sources?$/.test(key) ? "source" : "note";
  }
  return {
    translator: IMAGE_OCCLUSION_ENHANCED,
    fieldRoles: roles,
    promptKey: () => "io:1",
    maskMedia: (values) => [firstImageSource(values[question] ?? "")].filter(Boolean),
    content: (values, maskSvgs) => {
      if (!maskSvgs) return null;
      const questionMask = firstImageSource(values[question] ?? "");
      const svg = maskSvgs.get(questionMask);
      // SVGs that CoRe masks cannot express keep the add-on's own mask images.
      const masks: OcclusionMask[] = (svg ? parseEnhancedMaskSvg(svg) : null)
        ?? [{ id: "m1", ordinal: 1, alwaysOccluded: false, shape: { kind: "overlay", question: questionMask, answer: firstImageSource(values[answer] ?? "") || null } }];
      return {
        schemaVersion: 1,
        fields: contentFields(model, roles, values),
        interaction: { kind: "image-occlusion", image: firstImageSource(values[image] ?? ""), mode: "hide-one-guess-one", masks },
        speech: [],
      };
    },
  };
}

function svgNumber(attributes: string, name: string): number {
  const match = new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attributes);
  return match ? Number(match[1]) : Number.NaN;
}

/** Clamps a pixel range divided by the image size to 0–1 and returns its start and length; null when empty. */
function unitRange(start: number, end: number): [number, number] | null {
  const [from, to] = [Math.min(1, Math.max(0, start)), Math.min(1, Math.max(0, end))];
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? [Number(from.toFixed(6)), Number((to - from).toFixed(6))] : null;
}

/**
 * Image Occlusion Enhanced draws one note's masks as pixel shapes in an SVG the size of the image: the shape (or
 * group) with `class="qshape"` is asked, every other shape stays occluded without a card of its own. Null when the
 * SVG holds anything CoRe masks cannot express, such as labels, paths or transforms.
 */
export function parseEnhancedMaskSvg(svg: string): OcclusionMask[] | null {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  const [width, height] = root ? [svgNumber(root[1], "width"), svgNumber(root[1], "height")] : [Number.NaN, Number.NaN];
  const labels = /<title>\s*Labels\s*<\/title>([\s\S]*?)<\/g>/i.exec(svg)?.[1] ?? "";
  if (!(width > 0) || !(height > 0) || /<[a-z]/i.test(labels) || /<(?:path|text|line|polyline|circle|image|use)\b|\stransform\s*=/i.test(svg)) return null;
  const masks: OcclusionMask[] = [];
  const askedGroups: boolean[] = [];
  for (const [, closing, tag, attributes] of svg.matchAll(/<(\/?)(g|rect|ellipse|polygon)\b([^>]*)>/gi)) {
    const asked = /\sclass\s*=\s*["'][^"']*\bqshape\b/i.test(attributes) || askedGroups.at(-1) === true;
    const kind = tag.toLowerCase();
    if (kind === "g") {
      if (closing) askedGroups.pop();
      else if (!attributes.trim().endsWith("/")) askedGroups.push(asked);
      continue;
    }
    let shape: OcclusionShape | null = null;
    if (kind === "polygon") {
      const numbers = (/\spoints\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1] ?? "").trim().split(/[\s,]+/).map(Number);
      const points = Array.from({ length: Math.floor(numbers.length / 2) }, (_, index): [number, number] => [
        Number(Math.min(1, Math.max(0, numbers[index * 2] / width)).toFixed(6)),
        Number(Math.min(1, Math.max(0, numbers[index * 2 + 1] / height)).toFixed(6)),
      ]);
      if (points.length >= 3 && points.flat().every(Number.isFinite)) shape = { kind: "polygon", points };
    } else {
      const ellipse = kind === "ellipse";
      const [rx, ry] = [svgNumber(attributes, "rx"), svgNumber(attributes, "ry")];
      const x = ellipse ? svgNumber(attributes, "cx") - rx : svgNumber(attributes, "x");
      const y = ellipse ? svgNumber(attributes, "cy") - ry : svgNumber(attributes, "y");
      const horizontal = unitRange(x / width, (x + (ellipse ? 2 * rx : svgNumber(attributes, "width"))) / width);
      const vertical = unitRange(y / height, (y + (ellipse ? 2 * ry : svgNumber(attributes, "height"))) / height);
      if (horizontal && vertical) shape = { kind: ellipse ? "ellipse" : "rect", left: horizontal[0], top: vertical[0], width: horizontal[1], height: vertical[1], angle: 0 };
    }
    if (!shape) return null;
    masks.push({ id: `m${masks.length + 1}`, ordinal: asked ? 1 : 0, shape, alwaysOccluded: !asked });
  }
  return masks.some((mask) => mask.ordinal === 1) ? masks : null;
}

/** AnKing/Ankizin family: cloze type with Text, Extra and button sections; roles follow their template position. */
function ankingPlan(model: AnkiModel): NotetypePlan | null {
  const hintButtons = /\{\{#([^}]+)\}\}[\s\S]*?<(?:button|a)\b[^>]*(?:onclick|class\s*=\s*["'][^"']*hint)[\s\S]*?\{\{\/\1\}\}/i.test(templateSource(model));
  if (model.kind !== 1 || fieldByName(model, /^text$/i) < 0 || fieldByName(model, /^extra$/i) < 0 || !hintButtons) return null;
  return genericPlan(model, ANKING, (ordinal) => `cloze:${ordinal + 1}`);
}

function unescapeOcclusion(value: string) {
  return value.replace(/\\(.)/g, "$1");
}

/** Native Image Occlusion stores relative shapes as clozes: `{{c1::image-occlusion:rect:left=.1:…:oi=1}}`. */
export function parseImageOcclusionField(html: string): OcclusionMask[] {
  const masks: OcclusionMask[] = [];
  for (const match of decodeHtmlEntities(html).matchAll(/\{\{c(\d+)::image-occlusion:([\s\S]*?)\}\}/g)) {
    const [kind, ...pairs] = match[2].split(/(?<!\\):/);
    const props = new Map(pairs.map((pair) => {
      const separator = pair.indexOf("=");
      return [pair.slice(0, separator).trim(), unescapeOcclusion(pair.slice(separator + 1))] as const;
    }));
    const number = (name: string, fallback = 0) => {
      const value = Number(props.get(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const angle = number("angle");
    let shape: OcclusionShape;
    if (kind === "rect" || kind === "ellipse") {
      const width = props.has("rx") ? number("rx") * 2 : number("width");
      const height = props.has("ry") ? number("ry") * 2 : number("height");
      shape = { kind, left: number("left"), top: number("top"), width, height, angle };
    } else if (kind === "polygon") {
      // Anki ignores the angle of polygons and moves their points so that their top-left corner lies at left/top.
      const points = (props.get("points") ?? "").trim().split(/\s+/).map((point) => point.split(",").map(Number) as [number, number]);
      const dx = props.has("left") ? number("left") - Math.min(...points.map(([x]) => x)) : 0;
      const dy = props.has("top") ? number("top") - Math.min(...points.map(([, y]) => y)) : 0;
      shape = { kind, points: dx || dy ? points.map(([x, y]) => [Number((x + dx).toFixed(6)), Number((y + dy).toFixed(6))]) : points };
    } else if (kind === "text") {
      shape = { kind, left: number("left"), top: number("top"), text: props.get("text") ?? "", scale: number("scale", 1), fontSize: number("fs") || null, angle };
    } else continue;
    masks.push({ id: `m${masks.length + 1}`, ordinal: Number(match[1]), shape, alwaysOccluded: props.get("oi") === "1" });
  }
  return masks;
}

function imageOcclusionPlan(model: AnkiModel): NotetypePlan {
  // Anki's stock fields by ordinal: Occlusion, Image, Header, Back Extra, Comments.
  const roles: Record<string, FieldRole> = {};
  model.fields.forEach((name, ordinal) => { roles[name] = (["consumed", "consumed", "prompt", "extra"] as const)[ordinal] ?? "note"; });
  return {
    translator: IMAGE_OCCLUSION,
    fieldRoles: roles,
    promptKey: (ordinal) => `io:${ordinal + 1}`,
    content: (values) => ({
      schemaVersion: 1,
      fields: contentFields(model, roles, values),
      interaction: { kind: "image-occlusion", image: firstImageSource(values[1] ?? ""), mode: "hide-one-guess-one", masks: parseImageOcclusionField(values[0] ?? "") },
      speech: [],
    }),
  };
}

/** Anki's stock templates for kinds 1–5, with the note type's own (possibly renamed) field names. */
function stockTemplates(kind: number, [first = "", second = "", third = ""]: string[]): Array<[string, string]> | null {
  const answer = (front: string, back: string) => `${front}<hr id=answer>{{${back}}}`;
  const forward: [string, string] = [`{{${first}}}`, answer("{{FrontSide}}", second)];
  const reverse = (front: string): [string, string] => [front, answer("{{FrontSide}}", first)];
  if (kind === 1) return [forward];
  if (kind === 2) return [forward, reverse(`{{${second}}}`)];
  if (kind === 3) return [forward, reverse(`{{#${third}}}{{${second}}}{{/${third}}}`)];
  if (kind === 4) return [[`{{${first}}}{{type:${second}}}`, `{{${first}}}<hr id=answer>{{type:${second}}}`]];
  if (kind === 5) return [[`{{cloze:${first}}}`, `{{cloze:${first}}}<br>{{${second}}}`]];
  return null;
}

/** `originalStockKind` survives cloning and is even set for new note types, so the templates must still be stock. */
function isStock(model: AnkiModel, kind: number): boolean {
  const compact = (value: string) => value.replace(/\s+/g, "");
  const expected = stockTemplates(kind, model.fields);
  return model.originalStockKind === kind && expected !== null && model.fields.length === (kind === 3 ? 3 : 2)
    && model.templates.length === expected.length
    && model.templates.every((template, index) => compact(template.front) === compact(expected[index][0]) && compact(template.back) === compact(expected[index][1]));
}

/** Registry in detection order: native Image Occlusion, add-on and community signatures, stock types, generic. */
function planNotetype(model: AnkiModel): NotetypePlan {
  if (model.originalStockKind === 6) return imageOcclusionPlan(model);
  const specialized = multipleChoicePlan(model) ?? imageOcclusionEnhancedPlan(model) ?? ankingPlan(model);
  if (specialized) return specialized;
  if ([1, 2, 3, 4].some((kind) => isStock(model, kind))) {
    return genericPlan(model, BASIC, (ordinal) => ordinal === 0 ? "forward" : ordinal === 1 ? "reverse" : `anki-${ordinal}`);
  }
  if (model.kind === 1) return genericPlan(model, isStock(model, 5) ? CLOZE : GENERIC, (ordinal) => `cloze:${ordinal + 1}`);
  return genericPlan(model, GENERIC, (ordinal) => `anki-${ordinal}`);
}

/** Current translator versions; a higher version re-translates unedited imports automatically (K5.4). */
export const TRANSLATOR_VERSIONS: Readonly<Record<string, number>> = Object.fromEntries(
  [BASIC, CLOZE, IMAGE_OCCLUSION, IMAGE_OCCLUSION_ENHANCED, MULTIPLE_CHOICE, ANKING, GENERIC, FIELD_LIST].map(({ id, version }) => [id, version]),
);

/**
 * Translates the raw fields of an imported content again with the current translator; null when the translator
 * cannot express them. The result is an unvalidated candidate like during the import.
 */
export function retranslateNoteContent(source: NoteTypeSource, fields: string[], tags: string[]) {
  const plan = planNotetype({
    name: source.name,
    kind: source.kind,
    originalStockKind: source.originalStockKind,
    css: source.css,
    fields: [...source.fields].sort((left, right) => left.ordinal - right.ordinal).map((field) => field.name),
    templates: source.templates,
    config: source.config,
  });
  const content = plan.content(fields);
  return content ? { content: { ...content, tags }, translator: plan.translator, promptKey: plan.promptKey } : null;
}

// --- Learning state (K5.5) ----------------------------------------------------------------

function readFsrsMemory(data: unknown) {
  if (typeof data !== "string" || !data.trim()) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const stability = Number(parsed.s);
    const difficulty = Number(parsed.d);
    if (!(stability > 0) || !(difficulty > 0)) return null;
    const retention = Number(parsed.dr);
    const lastReview = Number(parsed.lrt);
    return {
      stability,
      difficulty,
      desiredRetention: retention > 0 && retention < 1 ? retention : null,
      lastReviewedAt: lastReview > 0 ? new Date(lastReview * 1_000).toISOString() : null,
      raw: parsed,
    };
  } catch {
    return null;
  }
}

function ankiPhase(type: number): ReviewSchedulerState {
  return type === 1 ? "learning" : type === 2 ? "review" : type === 3 ? "relearning" : "new";
}

/**
 * Phase, due date, counters and suspension come from the Anki card. Memory follows the
 * established priority: FSRS memory state, revlog replay, classic interval, new card.
 */
function translateStudy(ankiCard: any, history: AnkiReviewHistoryEntry[], collectionCreatedAt: number | null, importedAt: string) {
  const type = Number(ankiCard.type ?? 0);
  const queue = Number(ankiCard.queue ?? type);
  const phase = ankiPhase(type);
  const reps = Math.max(0, Number(ankiCard.reps ?? 0));
  const memory = readFsrsMemory(ankiCard.data);
  const snapshot = {
    due: ankiCard.due ?? null, interval: ankiCard.ivl ?? null, factor: ankiCard.factor ?? null, reps: ankiCard.reps ?? null, lapses: ankiCard.lapses ?? null,
    type: ankiCard.type ?? null, queue: ankiCard.queue ?? null, odue: ankiCard.odue ?? null, odid: ankiCard.odid ?? null, flags: ankiCard.flags ?? null,
    data: typeof ankiCard.data === "string" ? ankiCard.data : null,
  };
  const status = queue === -1 ? "suspended" as const : "active" as const;
  const ankiFlag = Number(ankiCard.flags ?? 0) & 7;
  // A card reset to new in Anki starts fresh; its earlier revlog stays as review events.
  if (phase === "new") {
    return { status, ankiFlag, migration: "new" as const, study: cardStudyFromReviewState(createReviewState({ dueAt: importedAt })) };
  }

  const intervalDays = Math.max(0, Math.round(Number(ankiCard.ivl ?? 0)));
  const due = Number(Number(ankiCard.odid ?? 0) ? ankiCard.odue : ankiCard.due);
  const dueAt = due > 1_000_000_000 ? new Date(due * 1_000).toISOString()
    : collectionCreatedAt !== null && Number.isFinite(due) ? new Date(collectionCreatedAt * 1_000 + due * DAY_MS).toISOString()
      : new Date(Date.parse(importedAt) + intervalDays * DAY_MS).toISOString();
  let migration: StudyMigration;
  let memoryState: { stability: number; difficulty: number; lastReviewedAt: string | null; desiredRetention?: number | null };
  if (memory) {
    migration = "fsrs-memory-state";
    memoryState = memory;
  } else if (history.length > 0) {
    migration = "revlog-replay";
    let replay = createReviewState({ dueAt: history[0].answeredAt });
    for (const entry of history) replay = scheduleWithFsrs(replay, entry.rating, { now: entry.answeredAt, isVariant: false, variantId: null, variantIsOriginal: true });
    memoryState = { stability: replay.stability, difficulty: replay.difficulty, lastReviewedAt: history.at(-1)!.answeredAt };
  } else {
    migration = "classic-state";
    const ease = Number(ankiCard.factor) > 0 ? Number(ankiCard.factor) / 1000 : 2.5;
    memoryState = { stability: Math.max(intervalDays, 0.1), difficulty: Math.min(10, Math.max(1, 11 - ease * 2)), lastReviewedAt: null };
  }
  const state = createReviewState({
    state: phase,
    dueAt,
    intervalDays,
    stability: memoryState.stability,
    difficulty: Math.min(10, Math.max(1, memoryState.difficulty)),
    ...(memoryState.desiredRetention ? { desiredRetention: memoryState.desiredRetention } : {}),
    reps,
    lapses: Math.max(0, Number(ankiCard.lapses ?? 0)),
    lastReviewedAt: memoryState.lastReviewedAt,
    sourceSchedulerData: {
      source: "anki",
      migrationVersion: 2,
      migrationMethod: migration,
      rawCardState: snapshot,
      ...(memory ? { rawMemoryState: memory.raw } : {}),
      ...(history.length ? { ankiReviewIds: history.map((entry) => entry.reviewId) } : {}),
    },
  });
  return { status, ankiFlag, migration, study: cardStudyFromReviewState(state) };
}

function reviewEvent(entry: AnkiReviewHistoryEntry, cardId: string): ImportReviewEvent {
  const scheduler = (state: ReviewSchedulerState, days: number, minutes: number | null) => ({ card: { state, intervalDays: days, intervalMinutes: minutes, ease: entry.ease } });
  return {
    id: stableContentHash({ source: "anki_revlog", reviewId: entry.reviewId, cardId: entry.cardId }, "review_anki"),
    cardId,
    rating: entry.rating,
    answeredAt: entry.answeredAt,
    responseTimeMs: entry.responseTimeMs,
    schedulerBefore: scheduler(entry.beforeState, entry.beforeIntervalDays, entry.beforeIntervalMinutes),
    schedulerAfter: scheduler(entry.afterState, entry.afterIntervalDays, entry.afterIntervalMinutes),
    flags: { source: "anki_revlog", ankiReviewId: entry.reviewId, ankiCardId: entry.cardId, ankiReviewType: entry.reviewType, filteredDeckReview: entry.reviewType === 3 },
  };
}

// --- Media (K5.6) -------------------------------------------------------------------------

function mediaResolver(files: AnkiPackageMediaFile[]) {
  const canonicalBySha1 = new Map<string, AnkiPackageMediaFile>();
  const byName = new Map<string, AnkiPackageMediaFile>();
  for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
    const canonical = canonicalBySha1.get(file.sha1) ?? file;
    canonicalBySha1.set(file.sha1, canonical);
    byName.set(file.name.normalize("NFC"), canonical);
  }
  const resolve = (raw: string): string => {
    const html = decodeHtmlEntities(raw.trim());
    let url = html;
    try { url = decodeURIComponent(html); } catch { /* a literal percent sign stays */ }
    const candidates = [raw.trim(), html, url].map((name) => name.normalize("NFC"));
    return candidates.map((name) => byName.get(name)?.name).find(Boolean) ?? candidates.at(-1)!;
  };
  // Only `src`, `poster` and `[sound:…]` reference media; links (`href`) and template CSS never do.
  const rewrite = (html: string) => html
    .replace(/(\s(?:src|poster)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi, (match, prefix: string, double?: string, single?: string, bare?: string) => {
      const value = double ?? single ?? bare ?? "";
      if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value.trim())) return match;
      return `${prefix}"${escapeAttribute(resolve(value))}"`;
    })
    .replace(/\[sound:([^\]\r\n]+)\]/gi, (_match, name: string) => `[sound:${resolve(name)}]`);
  return { rewrite, byName, canonical: new Set(canonicalBySha1.values()) };
}

// --- Decks (K5.1) -------------------------------------------------------------------------

function deckGraph(pkg: AnkiPackage, homeDeckIds: Set<string>) {
  const fallbackName = pkg.file.name.replace(/\.(?:apkg|colpkg)$/i, "") || "Anki-Import";
  const ankiDecks = new Map(pkg.decks.filter((deck) => !deck.filtered).map((deck) => [deck.id, deck]));
  const pathOfAnkiDeck = (ankiDeckId: string) => ankiDecks.get(ankiDeckId)?.name.split("::") ?? [fallbackName];
  const ankiIdByPath = new Map([...ankiDecks.values()].map((deck) => [deck.name, deck.id]));
  const byPath = new Map<string, ImportDeck>();
  // Only decks that contain cards, plus their ancestors, are created; "Default" and filtered decks thus disappear when empty.
  for (const ankiDeckId of homeDeckIds) {
    const parts = pathOfAnkiDeck(ankiDeckId);
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("::");
      if (byPath.has(path)) return;
      byPath.set(path, {
        id: makeId("deck"),
        ankiDeckId: ankiIdByPath.get(path) ?? null,
        name,
        hierarchyPath: parts.slice(0, index + 1),
        parentDeckId: index === 0 ? null : byPath.get(parts.slice(0, index).join("::"))!.id,
      });
    });
  }
  const deckIdForAnkiDeck = (ankiDeckId: string) => byPath.get(pathOfAnkiDeck(ankiDeckId).join("::"))!.id;
  return { decks: [...byPath.values()].sort((left, right) => left.hierarchyPath.join("::").localeCompare(right.hierarchyPath.join("::"))), deckIdForAnkiDeck };
}

// --- Pipeline (K5.0) ----------------------------------------------------------------------

const MAX_MASK_SVG_BYTES = 1024 * 1024;

/** Translates a read package into the import graph of decks, notes, cards, media, review events and report. */
export async function translateAnkiPackage(pkg: AnkiPackage, options: { importedAt?: string } = {}): Promise<ApkgImportGraph> {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const ankiDeckIds = new Set(pkg.decks.map((deck) => deck.id));
  const filteredDeckIds = new Set(pkg.decks.filter((deck) => deck.filtered).map((deck) => deck.id));
  const defaultDeckId = pkg.decks.find((deck) => !deck.filtered)?.id ?? "";
  // Cards in a filtered deck belong to their home deck `odid`.
  const homeDeck = (card: any) => {
    const home = Number(card.odid ?? 0) ? String(card.odid) : String(card.did ?? "");
    return ankiDeckIds.has(home) && !filteredDeckIds.has(home) ? home : defaultDeckId;
  };
  const cardsByNote = new Map<string, any[]>();
  for (const card of pkg.cards) {
    const noteCards = cardsByNote.get(String(card.nid));
    if (noteCards) noteCards.push(card);
    else cardsByNote.set(String(card.nid), [card]);
  }
  const notesWithCards = pkg.notes.filter((note) => cardsByNote.has(String(note.id)));
  const { decks, deckIdForAnkiDeck } = deckGraph(pkg, new Set(notesWithCards.flatMap((note) => cardsByNote.get(String(note.id))!.map(homeDeck))));
  const historyByCard = new Map<string, AnkiReviewHistoryEntry[]>();
  for (const entry of pkg.reviewHistory.entries) {
    const entries = historyByCard.get(entry.cardId);
    if (entries) entries.push(entry);
    else historyByCard.set(entry.cardId, [entry]);
  }
  const media = mediaResolver(pkg.media.files);
  // Field text references canonical names after `media.rewrite`; each note keeps the SHA-1 of the names it uses.
  const mediaSha1ByName = Object.fromEntries([...media.canonical].map((file) => [file.name, file.sha1]));
  const plans = new Map<string, { model: AnkiModel; plan: NotetypePlan; source: NoteTypeSource; report: ApkgNotetypeReport }>();
  const planFor = (notetypeId: string) => {
    const known = plans.get(notetypeId);
    if (known) return known;
    const model = normalizeModel(pkg.models[notetypeId]);
    const plan = planNotetype(model);
    const entry = {
      model,
      plan,
      source: {
        id: makeId("note_type_source"),
        ankiNotetypeId: notetypeId,
        name: model.name,
        translator: plan.translator,
        kind: model.kind,
        originalStockKind: model.originalStockKind,
        css: model.css,
        fields: model.fields.map((name, ordinal) => ({ name, ordinal })),
        templates: model.templates,
        config: model.config,
      },
      report: {
        ankiNotetypeId: notetypeId,
        name: model.name,
        translator: plan.translator,
        notes: 0,
        cards: 0,
        fallbackNotes: 0,
        untranslatableNotes: 0,
        fieldRoles: plan.fieldRoles,
        unmappedFields: Object.entries(plan.fieldRoles).filter(([, role]) => role === "note").map(([name]) => name),
        missingMedia: [] as string[],
        study: { "fsrs-memory-state": 0, "revlog-replay": 0, "classic-state": 0, new: 0 },
      },
    };
    plans.set(notetypeId, entry);
    return entry;
  };

  // Mask SVGs are read once up front so the translation itself stays synchronous.
  const maskSvgs = new Map<string, string>();
  for (const ankiNote of notesWithCards) {
    const { plan } = planFor(String(ankiNote.mid));
    if (!plan.maskMedia) continue;
    for (const name of plan.maskMedia(String(ankiNote.flds ?? "").split("\u001f").map(media.rewrite))) {
      const file = media.byName.get(name);
      if (file && !maskSvgs.has(name) && file.size <= MAX_MASK_SVG_BYTES) maskSvgs.set(name, new TextDecoder().decode(await file.readBytes()));
    }
  }

  const notes: Note[] = [];
  const noteSources: NoteSource[] = [];
  const cards: Card[] = [];
  const reviewEvents = new Map<string, ImportReviewEvent>();
  const usedMedia = new Set<string>();
  let addedCards = 0;
  let droppedCards = 0;
  let duplicateEvents = 0;

  for (const ankiNote of notesWithCards) {
    const entry = planFor(String(ankiNote.mid));
    const ankiCards = cardsByNote.get(String(ankiNote.id))!.sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0));
    const values = String(ankiNote.flds ?? "").split("\u001f").map(media.rewrite);
    const rawTags = String(ankiNote.tags ?? "").split(/\s+/).filter(Boolean);
    const tags = rawTags.filter((tag) => tag.toLowerCase() !== "marked");
    const createdMs = Number(ankiNote.id);
    const input = {
      deckId: deckIdForAnkiDeck(homeDeck(ankiCards[0])),
      media: mediaSha1ByName,
      source: "anki-apkg" as const,
      ankiGuid: String(ankiNote.guid ?? "") || null,
      noteTypeSourceId: entry.source.id,
      createdAt: createdMs > 1_000_000_000_000 && createdMs < Date.parse(importedAt) ? new Date(createdMs).toISOString() : importedAt,
    };
    let created: ReturnType<typeof createNote>;
    let keyOf = entry.plan.promptKey;
    try {
      const content = entry.plan.content(values, maskSvgs);
      if (!content) throw new Error("Der Inhalt passt nicht zum Übersetzer.");
      created = createNote({ ...input, content: { ...content, tags }, translator: entry.plan.translator });
    } catch {
      try {
        created = createNote({ ...input, content: { ...fieldListContent(entry.model, values, ankiCards.map((card) => Number(card.ord ?? 0))), tags }, translator: FIELD_LIST });
        keyOf = (ordinal) => `anki-${ordinal}`;
        entry.report.fallbackNotes += 1;
      } catch {
        entry.report.untranslatableNotes += 1;
        continue;
      }
    }
    const note: Note = { ...created.note, marked: rawTags.length !== tags.length };
    const ankiCardByKey = new Map(ankiCards.map((card) => [keyOf(Number(card.ord ?? 0)), card]));
    droppedCards += ankiCards.filter((card) => !created.cards.some((candidate) => candidate.promptKey === keyOf(Number(card.ord ?? 0)))).length;
    for (const card of created.cards) {
      const ankiCard = ankiCardByKey.get(card.promptKey);
      if (!ankiCard) {
        addedCards += 1;
        entry.report.study.new += 1;
        cards.push(card);
        continue;
      }
      const ankiCardId = String(ankiCard.id);
      const history = historyByCard.get(ankiCardId) ?? [];
      const study = translateStudy(ankiCard, history, pkg.collectionCreatedAt, importedAt);
      entry.report.study[study.migration] += 1;
      cards.push({ ...card, deckId: deckIdForAnkiDeck(homeDeck(ankiCard)), ankiCardId, status: study.status, ankiFlag: study.ankiFlag, study: study.study });
      for (const historyEntry of history) {
        const event = reviewEvent(historyEntry, card.id);
        if (reviewEvents.has(event.id)) duplicateEvents += 1;
        else reviewEvents.set(event.id, event);
      }
    }
    for (const name of noteContentMediaRefs(note.content)) {
      if (media.byName.has(name)) usedMedia.add(media.byName.get(name)!.name);
      else if (!entry.report.missingMedia.includes(name)) entry.report.missingMedia.push(name);
    }
    entry.report.notes += 1;
    entry.report.cards += created.cards.length;
    notes.push(note);
    noteSources.push({ noteId: note.id, noteTypeSourceId: entry.source.id, fields: values });
  }

  const importedCardIds = new Set(cards.map((card) => card.ankiCardId));
  const notetypeReports = [...plans.values()].map(({ report }) => report);
  const missingMedia = [...new Set(notetypeReports.flatMap((report) => report.missingMedia))].sort();
  const mediaFiles = [...media.canonical].filter((file) => usedMedia.has(file.name));
  const warnings: string[] = [];
  if (droppedCards) warnings.push(`${droppedCards} Anki-Karten ohne passende Abfrage im übersetzten Inhalt wurden nicht übernommen.`);
  if (addedCards) warnings.push(`${addedCards} Karten wurden aus dem Inhalt neu abgeleitet, weil sie im Paket fehlten.`);
  const untranslatableNotes = notetypeReports.reduce((sum, report) => sum + report.untranslatableNotes, 0);
  if (untranslatableNotes) warnings.push(`${untranslatableNotes} Anki-Notizen enthielten keinen darstellbaren Inhalt und wurden übersprungen.`);
  if (missingMedia.length) warnings.push(missingMedia.length === 1 ? "1 referenziertes Medium fehlt im Paket." : `${missingMedia.length} referenzierte Medien fehlen im Paket.`);
  return {
    decks,
    notes,
    cards,
    mediaFiles,
    reviewEvents: [...reviewEvents.values()].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt)),
    noteTypeSources: [...plans.values()].map(({ source }) => source),
    noteSources,
    report: {
      packageFormat: pkg.packageFormat,
      mediaFormat: pkg.media.format,
      detected: { decks: pkg.decks.length, notes: pkg.notes.length, cards: pkg.cards.length, reviewEvents: pkg.reviewHistory.totalRows },
      imported: { decks: decks.length, notes: notes.length, cards: cards.length, mediaFiles: mediaFiles.length, reviewEvents: reviewEvents.size },
      notetypes: notetypeReports,
      addedCards,
      droppedCards,
      reviewHistory: {
        skipped: pkg.reviewHistory.skippedRows,
        unmapped: pkg.reviewHistory.entries.filter((entry) => !importedCardIds.has(entry.cardId)).length,
        duplicates: duplicateEvents,
      },
      missingMedia,
      warnings,
      errors: notes.length ? [] : ["Keine importierbaren Anki-Inhalte mit Karten erkannt."],
    },
  };
}

// --- Commit stream (K5.8) -----------------------------------------------------------------

const NOTE_CHUNK_SIZE = 250;
const REVIEW_CHUNK_SIZE = 500;

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Preview of a translated package: report, five sample cards and the counts the commit will stream. */
export function describeImportGraph(graph: ApkgImportGraph) {
  const notesById = new Map(graph.notes.map((note) => [note.id, note]));
  const notetypeNames = new Map(graph.noteTypeSources.map((source) => [source.id, source.name]));
  const samples: Array<{ note: Note; card: Card; notetypeName: string }> = [];
  for (const card of graph.cards) {
    const note = notesById.get(card.noteId);
    if (note && !samples.some((sample) => sample.note.id === note.id)) samples.push({ note, card, notetypeName: notetypeNames.get(note.noteTypeSourceId ?? "") ?? "Anki-Notiztyp" });
    if (samples.length >= 5) break;
  }
  return {
    rootDeckName: graph.decks.find((deck) => deck.parentDeckId === null)?.name ?? "Anki-Import",
    report: graph.report,
    samples,
    counts: {
      deckCount: graph.decks.length,
      noteCount: graph.notes.length,
      cardCount: graph.cards.length,
      reviewEventCount: graph.reviewEvents.length,
      mediaCount: graph.mediaFiles.length,
      ankiGuids: graph.notes.flatMap((note) => note.ankiGuid ? [note.ankiGuid] : []),
    },
  };
}

const SAMPLE_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

/** Media of the preview samples, checked like the commit and capped so the preview stays light. */
export async function readSampleMedia(graph: ApkgImportGraph, samples: ReadonlyArray<{ note: Note }>) {
  const filesBySha1 = new Map(graph.mediaFiles.map((file) => [file.sha1, file]));
  const result: Array<{ name: string; sha1: string; size: number; mimeType: string; bytes: Uint8Array }> = [];
  let total = 0;
  for (const sha1 of new Set(samples.flatMap(({ note }) => Object.values(note.media)))) {
    const file = filesBySha1.get(sha1);
    if (!file || total + file.size > SAMPLE_MEDIA_MAX_BYTES) continue;
    const bytes = await file.readBytes();
    if (await sha1Hex(bytes) !== sha1) continue;
    total += bytes.length;
    result.push({ name: file.name, sha1, size: bytes.length, mimeType: file.mimeType, bytes });
  }
  return result;
}

/**
 * Streams the graph in bounded chunks: decks, templates, notes with their sources and cards, review events and
 * finally each media file, read only now from the archive and checked against its SHA-1.
 */
export async function* createImportGraphChunks(graph: ApkgImportGraph) {
  yield { kind: "decks" as const, decks: graph.decks };
  yield { kind: "note-type-sources" as const, values: graph.noteTypeSources };
  const cardsByNote = new Map<string, Card[]>();
  for (const card of graph.cards) cardsByNote.set(card.noteId, [...(cardsByNote.get(card.noteId) ?? []), card]);
  const sourcesByNote = new Map(graph.noteSources.map((source) => [source.noteId, source]));
  for (let offset = 0; offset < graph.notes.length; offset += NOTE_CHUNK_SIZE) {
    const notes = graph.notes.slice(offset, offset + NOTE_CHUNK_SIZE);
    yield {
      kind: "notes" as const,
      notes,
      noteSources: notes.flatMap((note) => sourcesByNote.has(note.id) ? [sourcesByNote.get(note.id)!] : []),
      cards: notes.flatMap((note) => cardsByNote.get(note.id) ?? []),
    };
  }
  for (let offset = 0; offset < graph.reviewEvents.length; offset += REVIEW_CHUNK_SIZE) {
    yield { kind: "reviews" as const, values: graph.reviewEvents.slice(offset, offset + REVIEW_CHUNK_SIZE) };
  }
  for (const file of graph.mediaFiles) {
    const bytes = await file.readBytes();
    if (bytes.length !== file.size && file.size > 0 || await sha1Hex(bytes) !== file.sha1) {
      throw new Error(`Die Mediendatei „${file.name}“ ist beschädigt.`);
    }
    yield { kind: "media" as const, file: { name: file.name, sha1: file.sha1, size: bytes.length, mimeType: file.mimeType, bytes } };
  }
}
