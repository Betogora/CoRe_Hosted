import * as v from "valibot";
import { mapClozes } from "./clozeSyntax.js";
import { stripHtml } from "./htmlSafety.js";

export const AI_CARD_VARIANT_ENDPOINT = "/api/ai/card-variant";
export const AI_CARD_VARIANT_PROMPT_VERSION = "card-variant-v6";
export const MAX_AI_CARD_VARIANT_FIELD_CHARS = 1_200;
const MAX_AI_CARD_VARIANT_SOURCE_CHARS = 2_400;
const MAX_AI_CARD_VARIANT_AVOID_ITEMS = 5;
const MAX_AI_CARD_VARIANT_AVOID_CHARS = 3_000;
export const MAX_AI_CARD_VARIANT_REQUEST_BYTES = 8 * 1_024;
export const MAX_AI_CARD_VARIANT_OUTPUT_TOKENS = 1_024;
export const AI_CARD_VARIANT_DEADLINE_MS = 25_000;

const MAX_AI_CARD_VARIANT_OPTIONS = 10;
const MAX_AI_CARD_VARIANT_OPTION_CHARS = 400;

const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_AI_CARD_VARIANT_FIELD_CHARS));
/** A choice card's `back` lists every option (`choiceAnswerText`), so it may outgrow one field; the request bounds its options. */
const backSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_AI_CARD_VARIANT_OPTIONS * (MAX_AI_CARD_VARIANT_OPTION_CHARS + 5)));
const sourceSchema = v.strictObject({ front: textSchema, back: backSchema });
const optionIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const optionTextSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_AI_CARD_VARIANT_OPTION_CHARS));
const uniqueIds = <Option extends { id: string }>(options: Option[]) => new Set(options.map((option) => option.id)).size === options.length;
const choiceSchema = v.strictObject({
  mode: v.picklist(["single", "multiple", "kprim"]),
  options: v.pipe(v.array(v.strictObject({ id: optionIdSchema, text: optionTextSchema, correct: v.boolean() })), v.minLength(2), v.maxLength(MAX_AI_CARD_VARIANT_OPTIONS), v.check(uniqueIds)),
});
/**
 * `type-in`: the learner types the answer; the variant only rephrases the question and keeps the card's own answer.
 * `cloze`: `front` is the text with only the card's own gap group in Anki syntax, `back` its solutions (`clozeVariantGaps`).
 * `choice`: `front` is the question stem and `back` the correct options; `choice` holds every option with its
 * correctness, which a variant never changes.
 */
const kindSchema = v.picklist(["basic", "type-in", "cloze", "choice"]);
const requestSchema = v.pipe(
  v.strictObject({
    kind: kindSchema,
    source: sourceSchema,
    choice: v.optional(choiceSchema),
    avoid: v.optional(v.pipe(v.array(textSchema), v.maxLength(MAX_AI_CARD_VARIANT_AVOID_ITEMS))),
  }),
  v.check((request) => request.kind !== "cloze" || clozeVariantGaps(request.source.front) !== null),
  v.check((request) => (request.kind === "choice") === (request.choice !== undefined)),
  v.check((request) => request.kind === "choice" || request.source.back.length <= MAX_AI_CARD_VARIANT_FIELD_CHARS),
);
const usageSchema = v.nullable(v.strictObject({
  promptTokens: v.nullable(v.number()),
  completionTokens: v.nullable(v.number()),
  totalTokens: v.nullable(v.number()),
}));
const successSchema = v.strictObject({
  variant: v.strictObject({
    front: textSchema,
    back: backSchema,
    options: v.optional(v.pipe(v.array(v.strictObject({ id: optionIdSchema, text: optionTextSchema })), v.minLength(2), v.maxLength(MAX_AI_CARD_VARIANT_OPTIONS), v.check(uniqueIds))),
  }),
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  privacyMode: v.literal("zdr"),
  usage: usageSchema,
});

export type AiCardVariantChoice = v.InferOutput<typeof choiceSchema>;
export type AiCardVariantSource = { kind: v.InferOutput<typeof kindSchema>; front: string; back: string; choice?: AiCardVariantChoice };
export type AiCardVariantRequest = v.InferOutput<typeof requestSchema>;
export type AiCardVariantSuccess = v.InferOutput<typeof successSchema>;

/** The result is plain text and is never read as HTML. */
export function normalizeAiCardText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function aiVariantFieldText(html: string): string {
  return normalizeAiCardText(stripHtml(html));
}

export const answerListText = (answers: string[]) => answers.join(" · ");

export const choiceAnswerText = (options: { text: string; correct: boolean }[]) =>
  answerListText(options.map((option) => `${option.correct ? "✓" : "✗"} ${option.text}`));

/**
 * The gaps of a cloze variant text: one gap group, possibly several times, without nested gaps; null otherwise.
 * `outside` is the text around the gaps.
 */
export function clozeVariantGaps(text: string): { ordinal: number; answers: string[]; hints: string[]; outside: string } | null {
  const ordinals = new Set<number>();
  const answers: string[] = [];
  const hints: string[] = [];
  let nested = false;
  const outside = mapClozes(text, (token, inner) => {
    nested ||= inner !== token.text;
    token.ordinals.forEach((ordinal) => ordinals.add(ordinal));
    answers.push(token.text.trim());
    hints.push(token.hint.trim());
    return " ";
  });
  if (outside === null || nested || ordinals.size !== 1 || answers.some((answer) => !answer)) return null;
  return { ordinal: [...ordinals][0], answers, hints, outside };
}

const mentions = (text: string, answer: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);

/**
 * Why a rephrased cloze text does not ask the source's gap: other gap groups or nesting (`invalid_gaps`), other
 * solutions (`changed_answer`), or a solution named outside its gap or in a hint where the source did not (`revealed_answer`).
 */
export function checkClozeVariant(source: string, candidate: string): Extract<AiCardVariantRejection, "invalid_gaps" | "changed_answer" | "revealed_answer"> | null {
  const original = clozeVariantGaps(source);
  const variant = clozeVariantGaps(candidate);
  if (!original || !variant || variant.ordinal !== original.ordinal) return "invalid_gaps";
  const sorted = (answers: string[]) => answers.map((answer) => answer.replace(/\s+/g, " ")).sort().join("\u0000");
  if (sorted(variant.answers) !== sorted(original.answers)) return "changed_answer";
  const revealed = (gaps: NonNullable<typeof original>, answer: string) => mentions(gaps.outside, answer) || gaps.hints.some((hint) => mentions(hint, answer));
  return variant.answers.some((answer) => revealed(variant, answer) && !revealed(original, answer)) ? "revealed_answer" : null;
}

const NEGATION = /(?<!\p{L})(?:nicht|kein\p{L}*|falsch\p{L}*|unzutreffend\p{L}*|unrichtig\p{L}*|außer|ausgenommen|ausnahme\p{L}*|not|none|false|incorrect|wrong|except)(?!\p{L})/iu;

/**
 * Why a rephrased choice card does not ask the source's options: other option ids (`changed_options`), or a question
 * or option that gained or lost a negation and so may turn correct and incorrect around (`negated_question`,
 * `negated_option`). The check is deliberately strict: a harmless rewrite such as „asymptomatisch“ to „ohne Symptome“
 * is refused too.
 */
export function checkChoiceVariant(source: { front: string; choice: AiCardVariantChoice }, front: string, options: { id: string; text: string }[]): Extract<AiCardVariantRejection, "changed_options" | "negated_question" | "negated_option"> | null {
  const ids = (list: { id: string }[]) => list.map((option) => option.id).sort().join("\u0000");
  if (options.length !== source.choice.options.length || ids(options) !== ids(source.choice.options)) return "changed_options";
  const negationChanged = (original: string, candidate: string) => NEGATION.test(original) !== NEGATION.test(candidate);
  if (negationChanged(source.front, front)) return "negated_question";
  return source.choice.options.some((option) => negationChanged(option.text, options.find((candidate) => candidate.id === option.id)!.text)) ? "negated_option" : null;
}

function withinRequestLimits(request: AiCardVariantRequest) {
  const answerChars = request.choice ? request.choice.options.reduce((total, option) => total + option.text.length, 0) : request.source.back.length;
  return request.source.front.length + answerChars <= MAX_AI_CARD_VARIANT_SOURCE_CHARS
    && (request.avoid ?? []).reduce((total, text) => total + text.length, 0) <= MAX_AI_CARD_VARIANT_AVOID_CHARS;
}

/** `avoid` texts beyond the limits are left out, not rejected. */
export function createAiCardVariantRequest(source: AiCardVariantSource | null, avoid: string[] = []): AiCardVariantRequest {
  if (!source) {
    throw new AiCardVariantContractError("unsupported_card_type", "Für diese Karte gibt es keine Varianten.");
  }
  if (source.choice && (source.choice.options.length < 2 || source.choice.options.length > MAX_AI_CARD_VARIANT_OPTIONS)) {
    throw new AiCardVariantContractError("invalid_source", `Eine Variante braucht zwei bis ${MAX_AI_CARD_VARIANT_OPTIONS} Antwortoptionen.`);
  }
  const avoidTexts: string[] = [];
  let avoidChars = 0;
  for (const text of [...new Set(avoid.map(normalizeAiCardText))]) {
    if (!text || text.length > MAX_AI_CARD_VARIANT_FIELD_CHARS || avoidTexts.length >= MAX_AI_CARD_VARIANT_AVOID_ITEMS || avoidChars + text.length > MAX_AI_CARD_VARIANT_AVOID_CHARS) continue;
    avoidTexts.push(text);
    avoidChars += text.length;
  }
  const parsed = v.safeParse(requestSchema, {
    kind: source.kind,
    source: {
      front: normalizeAiCardText(source.front),
      back: normalizeAiCardText(source.back),
    },
    ...(source.choice ? { choice: { mode: source.choice.mode, options: source.choice.options.map((option) => ({ ...option, text: normalizeAiCardText(option.text) })) } } : {}),
    ...(avoidTexts.length ? { avoid: avoidTexts } : {}),
  });
  if (!parsed.success || !withinRequestLimits(parsed.output)) {
    throw new AiCardVariantContractError("invalid_source", "Die Karte ist leer oder für eine kompakte Variante zu lang.");
  }
  return parsed.output;
}

export function parseAiCardVariantRequest(value: unknown) {
  const parsed = v.safeParse(requestSchema, value);
  if (!parsed.success || !withinRequestLimits(parsed.output)) {
    return { success: false as const, output: null };
  }
  return { success: true as const, output: parsed.output };
}

export function parseAiCardVariantSuccess(value: unknown) {
  return v.safeParse(successSchema, value);
}

export function aiCardVariantSourceKey(source: AiCardVariantRequest["source"]): string {
  return `${normalizeAiCardText(source.front).toLocaleLowerCase("de-DE")}\u0000${normalizeAiCardText(source.back).toLocaleLowerCase("de-DE")}`;
}

/**
 * Results refused because they would ask something other than the card, with their message; errors of transport,
 * provider, account or a changed card say nothing about whether the card can be rephrased.
 */
export const AI_CARD_VARIANT_REJECTION_MESSAGES = {
  invalid_gaps: "Das Modell hat die Lücken des Lückentexts verändert.",
  changed_answer: "Das Modell hat die Lösung der Lücke verändert.",
  revealed_answer: "Die Variante verrät die Lösung der Lücke.",
  changed_options: "Das Modell hat die Antwortoptionen verändert.",
  negated_question: "Die Variante hat eine Verneinung der Frage verändert; richtig und falsch könnten vertauscht sein.",
  negated_option: "Die Variante hat eine Verneinung in einer Antwortoption verändert; richtig und falsch könnten vertauscht sein.",
  invalid_variant: "Das Modell hat keine gültige neue Umformulierung geliefert.",
  unchanged_front: "Das Modell hat die Kartenfrage nicht erkennbar umformuliert.",
  duplicate_variant: "Diese Variante gibt es schon. Bitte erneut generieren.",
} as const;
type AiCardVariantRejection = keyof typeof AI_CARD_VARIANT_REJECTION_MESSAGES;
export const AI_CARD_VARIANT_REJECTIONS: ReadonlySet<string> = new Set(Object.keys(AI_CARD_VARIANT_REJECTION_MESSAGES));

type GeneratedAiCardVariant =
  | { kind: "variant"; variant: AiCardVariantSuccess["variant"] }
  | { kind: "not_rephrasable" }
  | { kind: "invalid_fields" }
  | { kind: "rejected"; code: AiCardVariantRejection };

function readGeneratedOptions(value: unknown): { id: string; text: string }[] | null {
  const valid = Array.isArray(value) && value.every((option) => option !== null && typeof option === "object"
    && Object.keys(option).sort().join(",") === "id,text" && typeof option.id === "string" && typeof option.text === "string");
  return valid ? (value as { id: string; text: string }[]).map((option) => ({ id: option.id, text: normalizeAiCardText(option.text) })) : null;
}

export function parseGeneratedVariant(toolArguments: unknown, input: AiCardVariantRequest): GeneratedAiCardVariant {
  const rawArguments = toolArguments !== null && typeof toolArguments === "object" ? toolArguments as Record<string, unknown> : {};
  const keys = input.choice ? "front,options,rephrasable" : "back,front,rephrasable";
  if (Object.keys(rawArguments).sort().join(",") !== keys || typeof rawArguments.rephrasable !== "boolean") return { kind: "invalid_fields" };
  if (!rawArguments.rephrasable) return { kind: "not_rephrasable" };
  const front = normalizeAiCardText(rawArguments.front);
  const options = input.choice ? readGeneratedOptions(rawArguments.options) : undefined;
  if (options === null) return { kind: "invalid_fields" };
  const choice = input.choice && options ? {
    mode: input.choice.mode,
    options: input.choice.options.map((option) => ({ ...option, text: options.find((candidate) => candidate.id === option.id)?.text ?? "" })),
  } : undefined;
  const back = input.kind === "cloze" || input.kind === "type-in" ? input.source.back : choice ? choiceAnswerText(choice.options) : normalizeAiCardText(rawArguments.back);
  const problem = (input.kind === "cloze" ? checkClozeVariant(input.source.front, front) : null)
    ?? (input.choice && options ? checkChoiceVariant({ front: input.source.front, choice: input.choice }, front, options) : null);
  if (problem) return { kind: "rejected", code: problem };
  const variantRequest = parseAiCardVariantRequest({ kind: input.kind, source: { front, back }, ...(choice ? { choice } : {}) });
  if (!variantRequest.success || aiCardVariantSourceKey(variantRequest.output.source) === aiCardVariantSourceKey(input.source)) {
    return { kind: "rejected", code: "invalid_variant" };
  }
  if (normalizeAiCardText(variantRequest.output.source.front).toLocaleLowerCase("de-DE") === normalizeAiCardText(input.source.front).toLocaleLowerCase("de-DE")) {
    return { kind: "rejected", code: "unchanged_front" };
  }
  return { kind: "variant", variant: { ...variantRequest.output.source, ...(choice ? { options: choice.options.map(({ id, text }) => ({ id, text })) } : {}) } };
}

export class AiCardVariantContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiCardVariantContractError";
    this.code = code;
  }
}
