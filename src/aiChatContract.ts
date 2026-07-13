import * as v from "valibot";

const sourceAnchorSchema = v.looseObject({
  documentName: v.optional(v.string()),
  textQuote: v.optional(v.string()),
});

export const aiChatEvidenceSchema = v.looseObject({
  deckId: v.optional(v.string()),
  deckName: v.optional(v.string()),
  cardId: v.optional(v.string()),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
  quote: v.optional(v.string()),
  source: v.optional(v.string()),
  sourceQuote: v.optional(v.string()),
  sourceAnchors: v.optional(v.array(sourceAnchorSchema)),
  score: v.optional(v.number()),
});

export const aiChatRequestSchema = v.looseObject({
  question: v.string(),
  evidence: v.optional(v.array(aiChatEvidenceSchema), []),
  sourceBound: v.optional(v.boolean(), false),
});

const usageSchema = v.looseObject({
  totalTokens: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
});

export const aiChatSuccessSchema = v.looseObject({
  answer: v.string(),
  model: v.string(),
  provider: v.string(),
  sourceBound: v.optional(v.boolean(), false),
  usage: v.optional(v.nullable(usageSchema), null),
  warnings: v.optional(v.array(v.string()), []),
});

export const aiChatErrorSchema = v.looseObject({
  error: v.looseObject({
    code: v.string(),
    message: v.optional(v.string(), ""),
  }),
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
