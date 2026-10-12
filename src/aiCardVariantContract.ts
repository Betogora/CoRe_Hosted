import * as v from "valibot";
import { stripHtml } from "./htmlSafety.js";

export const AI_CARD_VARIANT_ENDPOINT = "/api/ai/card-variant";
export const AI_CARD_VARIANT_PROMPT_VERSION = "card-variant-v4";
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
const requestSchema = v.strictObject({
  source: sourceSchema,
  avoid: v.optional(v.pipe(v.array(textSchema), v.maxLength(MAX_AI_CARD_VARIANT_AVOID_ITEMS))),
});
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
const errorSchema = v.strictObject({
  error: v.strictObject({ code: v.string(), message: v.string() }),
});

export type AiCardVariantRequest = v.InferOutput<typeof requestSchema>;
export type AiCardVariantSuccess = v.InferOutput<typeof successSchema>;

export function normalizeAiCardText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function withinRequestLimits(request: AiCardVariantRequest) {
  return request.source.front.length + request.source.back.length <= MAX_AI_CARD_VARIANT_SOURCE_CHARS
    && (request.avoid ?? []).reduce((total, text) => total + text.length, 0) <= MAX_AI_CARD_VARIANT_AVOID_CHARS;
}

/**
 * Builds the request from the plain question and answer of a reveal card (`cardVariantSource`) and the
 * questions of its variants (`aiCardVariantAvoidTexts`); entries beyond the limits are left out.
 */
export function createAiCardVariantRequest(source: { front: string; back: string } | null, avoid: string[] = []): AiCardVariantRequest {
  if (!source) {
    throw new AiCardVariantContractError("unsupported_card_type", "Varianten gibt es derzeit nur für Karten mit Frage und Antwort.");
  }
  const avoidTexts: string[] = [];
  let avoidChars = 0;
  for (const text of [...new Set(avoid.map(normalizeAiCardText))]) {
    if (!text || text.length > MAX_AI_CARD_VARIANT_FIELD_CHARS || avoidTexts.length >= MAX_AI_CARD_VARIANT_AVOID_ITEMS || avoidChars + text.length > MAX_AI_CARD_VARIANT_AVOID_CHARS) continue;
    avoidTexts.push(text);
    avoidChars += text.length;
  }
  const parsed = v.safeParse(requestSchema, {
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

export function parseAiCardVariantError(value: unknown) {
  return v.safeParse(errorSchema, value);
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
