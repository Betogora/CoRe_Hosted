import * as v from "valibot";
import { mapClozes } from "./clozeSyntax.js";
import { stripHtml } from "./htmlSafety.js";

export const AI_CARD_VARIANT_ENDPOINT = "/api/ai/card-variant";
export const AI_CARD_VARIANT_PROMPT_VERSION = "card-variant-v5";
export const MAX_AI_CARD_VARIANT_FIELD_CHARS = 1_200;
const MAX_AI_CARD_VARIANT_SOURCE_CHARS = 2_400;
/** Existing rephrasings sent along so a new one differs from them; newest first, bounded to keep the request small. */
const MAX_AI_CARD_VARIANT_AVOID_ITEMS = 5;
const MAX_AI_CARD_VARIANT_AVOID_CHARS = 3_000;
export const MAX_AI_CARD_VARIANT_REQUEST_BYTES = 8 * 1_024;
export const MAX_AI_CARD_VARIANT_OUTPUT_TOKENS = 1_024;
/** Total time the route may spend on generation; the browser waits slightly longer. */
export const AI_CARD_VARIANT_DEADLINE_MS = 25_000;

const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_AI_CARD_VARIANT_FIELD_CHARS));
const sourceSchema = v.strictObject({ front: textSchema, back: textSchema });
/**
 * `type-in`: the learner types the answer; the variant only rephrases the question and keeps the card's own answer.
 * `cloze`: `front` is the text with only the card's own gap group in Anki syntax, `back` its solutions (`clozeVariantGaps`).
 */
const kindSchema = v.picklist(["basic", "type-in", "cloze"]);
const requestSchema = v.pipe(
  v.strictObject({
    kind: kindSchema,
    source: sourceSchema,
    avoid: v.optional(v.pipe(v.array(textSchema), v.maxLength(MAX_AI_CARD_VARIANT_AVOID_ITEMS))),
  }),
  v.check((request) => request.kind !== "cloze" || clozeVariantGaps(request.source.front) !== null),
);
const usageSchema = v.nullable(v.strictObject({
  promptTokens: v.nullable(v.number()),
  completionTokens: v.nullable(v.number()),
  totalTokens: v.nullable(v.number()),
}));
const successSchema = v.strictObject({
  variant: sourceSchema,
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  privacyMode: v.literal("zdr"),
  usage: usageSchema,
});

export type AiCardVariantSource = { kind: v.InferOutput<typeof kindSchema>; front: string; back: string };
export type AiCardVariantRequest = v.InferOutput<typeof requestSchema>;
export type AiCardVariantSuccess = v.InferOutput<typeof successSchema>;

/** Plain text of a card or model answer; a `<` that opens no tag, as in "K < 1", is text and not markup. */
export function normalizeAiCardText(value: unknown): string {
  return stripHtml(String(value ?? "").replace(/<(?![a-z/!])/gi, "&lt;")).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** Shown for the solutions of a gap group in `back`, e.g. "Insulin · Blutzucker". */
export const clozeAnswerText = (answers: string[]) => answers.join(" · ");

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

/** Whether `text` names `answer` as a whole word or phrase, ignoring case. */
const mentions = (text: string, answer: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);

/**
 * Why a rephrased cloze text does not ask the source's gap: other gap groups or nesting (`invalid_gaps`), other
 * solutions (`changed_answer`), or a solution named outside its gap or in a hint where the source did not (`revealed_answer`).
 */
export function checkClozeVariant(source: string, candidate: string): "invalid_gaps" | "changed_answer" | "revealed_answer" | null {
  const original = clozeVariantGaps(source);
  const variant = clozeVariantGaps(candidate);
  if (!original || !variant || variant.ordinal !== original.ordinal) return "invalid_gaps";
  const sorted = (answers: string[]) => answers.map((answer) => answer.replace(/\s+/g, " ")).sort().join("\u0000");
  if (sorted(variant.answers) !== sorted(original.answers)) return "changed_answer";
  const revealed = (gaps: NonNullable<typeof original>, answer: string) => mentions(gaps.outside, answer) || gaps.hints.some((hint) => mentions(hint, answer));
  return variant.answers.some((answer) => revealed(variant, answer) && !revealed(original, answer)) ? "revealed_answer" : null;
}

function withinRequestLimits(request: AiCardVariantRequest) {
  return request.source.front.length + request.source.back.length <= MAX_AI_CARD_VARIANT_SOURCE_CHARS
    && (request.avoid ?? []).reduce((total, text) => total + text.length, 0) <= MAX_AI_CARD_VARIANT_AVOID_CHARS;
}

/**
 * Builds the request from the plain question and answer or cloze text of a card (`cardVariantSource`) and the
 * questions of its variants (`aiCardVariantAvoidTexts`); entries beyond the limits are left out.
 */
export function createAiCardVariantRequest(source: AiCardVariantSource | null, avoid: string[] = []): AiCardVariantRequest {
  if (!source) {
    throw new AiCardVariantContractError("unsupported_card_type", "Varianten gibt es derzeit nur für Frage–Antwort- und Lückentextkarten.");
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

export class AiCardVariantContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiCardVariantContractError";
    this.code = code;
  }
}
