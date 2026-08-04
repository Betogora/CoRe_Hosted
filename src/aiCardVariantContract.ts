import * as v from "valibot";
import type { CardContentPayload } from "./coreTypes";
import { stripHtml } from "./htmlSafety";

export const AI_CARD_VARIANT_ENDPOINT = "/api/ai/card-variant";
export const AI_CARD_VARIANT_PROMPT_VERSION = "card-variant-v1";
export const MAX_AI_CARD_VARIANT_FIELD_CHARS = 1_200;
export const MAX_AI_CARD_VARIANT_SOURCE_CHARS = 2_400;
export const MAX_AI_CARD_VARIANT_REQUEST_BYTES = 8 * 1_024;
export const MAX_AI_CARD_VARIANT_OUTPUT_TOKENS = 256;

const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_AI_CARD_VARIANT_FIELD_CHARS));
const sourceSchema = v.strictObject({ front: textSchema, back: textSchema });
const requestSchema = v.strictObject({ source: sourceSchema });
const usageSchema = v.nullable(v.strictObject({
  promptTokens: v.nullable(v.number()),
  completionTokens: v.nullable(v.number()),
  totalTokens: v.nullable(v.number()),
}));
const successSchema = v.strictObject({
  variant: sourceSchema,
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  privacyMode: v.picklist(["zdr", "non_zdr"]),
  usage: usageSchema,
});
const errorSchema = v.strictObject({
  error: v.strictObject({ code: v.string(), message: v.string() }),
});

export type AiCardVariantRequest = v.InferOutput<typeof requestSchema>;
export type AiCardVariantSuccess = v.InferOutput<typeof successSchema>;
export type AiCardVariantErrorPayload = v.InferOutput<typeof errorSchema>;

export function normalizeAiCardText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

export function createAiCardVariantRequest(payload: CardContentPayload): AiCardVariantRequest {
  if (payload.editorValue.cardType !== "basic") {
    throw new AiCardVariantContractError("unsupported_card_type", "KI-Varianten sind derzeit nur für Basic-Karten verfügbar.");
  }
  const parsed = v.safeParse(requestSchema, {
    source: {
      front: normalizeAiCardText(payload.editorValue.front),
      back: normalizeAiCardText(payload.editorValue.back),
    },
  });
  if (!parsed.success || parsed.output.source.front.length + parsed.output.source.back.length > MAX_AI_CARD_VARIANT_SOURCE_CHARS) {
    throw new AiCardVariantContractError("invalid_source", "Die Basic-Karte ist leer oder für eine kompakte KI-Variante zu lang.");
  }
  return parsed.output;
}

export function parseAiCardVariantRequest(value: unknown) {
  const parsed = v.safeParse(requestSchema, value);
  if (!parsed.success || parsed.output.source.front.length + parsed.output.source.back.length > MAX_AI_CARD_VARIANT_SOURCE_CHARS) {
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
