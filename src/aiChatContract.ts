import * as v from "valibot";
import type { AiChatConsent } from "./coreTypes.ts";

export const AI_CHAT_MODEL = "gemma-4-31b-it";
export const AI_CHAT_CONSENT_VERSION = "google-gemma-chat-v1";
export const MAX_CHAT_REQUEST_BYTES = 48 * 1024;
export const MAX_CHAT_QUESTION_CHARS = 600;
export const MAX_CHAT_EVIDENCE_ITEMS = 5;
export const MAX_CHAT_EVIDENCE_TEXT_CHARS = 900;
export const MAX_CHAT_EVIDENCE_TOTAL_CHARS = 13_500;
export const MAX_CHAT_PROMPT_CHARS = 16_000;
export const MAX_CHAT_OUTPUT_TOKENS = 2_048;

const boundedString = (maxLength: number) => v.pipe(v.string(), v.maxLength(maxLength));

export const aiChatEvidenceSchema = v.strictObject({
  deckId: v.optional(boundedString(120)),
  deckName: v.optional(boundedString(160)),
  cardId: v.optional(boundedString(120)),
  front: v.optional(boundedString(MAX_CHAT_EVIDENCE_TEXT_CHARS)),
  back: v.optional(boundedString(MAX_CHAT_EVIDENCE_TEXT_CHARS)),
  source: v.optional(boundedString(160)),
  sourceQuote: v.optional(boundedString(MAX_CHAT_EVIDENCE_TEXT_CHARS)),
});

export const aiChatRequestSchema = v.pipe(
  v.strictObject({
    question: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_CHAT_QUESTION_CHARS)),
    evidence: v.optional(v.pipe(v.array(aiChatEvidenceSchema), v.maxLength(MAX_CHAT_EVIDENCE_ITEMS)), []),
    sourceBound: v.optional(v.boolean(), false),
  }),
  v.check(
    (request) => request.evidence.reduce(
      (total, item) => total + (item.front?.length ?? 0) + (item.back?.length ?? 0) + (item.sourceQuote?.length ?? 0),
      0,
    ) <= MAX_CHAT_EVIDENCE_TOTAL_CHARS,
    "Die Kartenquellen sind insgesamt zu lang.",
  ),
);

const usageSchema = v.strictObject({
  totalTokens: v.nullable(v.number()),
  inputTokens: v.nullable(v.number()),
  outputTokens: v.nullable(v.number()),
});

export const aiChatSuccessSchema = v.strictObject({
  answer: v.string(),
  model: v.literal(AI_CHAT_MODEL),
  provider: v.literal("google"),
  sourceBound: v.optional(v.boolean(), false),
  usage: v.optional(v.nullable(usageSchema), null),
  warnings: v.optional(v.array(v.string()), []),
});

export const aiChatErrorSchema = v.strictObject({
  error: v.strictObject({
    code: v.string(),
    message: v.optional(v.string(), ""),
  }),
});

export const aiChatConsentSchema = v.strictObject({
  version: v.literal(AI_CHAT_CONSENT_VERSION),
  acceptedAt: v.pipe(v.string(), v.isoTimestamp()),
  adultConfirmed: v.literal(true),
});

export type AiChatEvidence = v.InferOutput<typeof aiChatEvidenceSchema>;
export type AiChatRequest = v.InferOutput<typeof aiChatRequestSchema>;
export type AiChatSuccess = v.InferOutput<typeof aiChatSuccessSchema>;
export type AiChatError = v.InferOutput<typeof aiChatErrorSchema>;
export type AiChatResponse = AiChatSuccess | AiChatError;

export function parseAiChatRequest(input: unknown) {
  return v.safeParse(aiChatRequestSchema, input);
}

export function parseAiChatSuccess(input: unknown) {
  return v.safeParse(aiChatSuccessSchema, input);
}

export function parseAiChatError(input: unknown) {
  return v.safeParse(aiChatErrorSchema, input);
}

export function parseAiChatConsent(input: unknown) {
  return v.safeParse(aiChatConsentSchema, input);
}

export function hasCurrentAiChatConsent(input: unknown): input is AiChatConsent {
  return parseAiChatConsent(input).success;
}
