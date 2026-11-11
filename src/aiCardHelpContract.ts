import * as v from "valibot";

export const AI_CARD_HELP_ENDPOINT = "/api/ai/card-help";
export const AI_CARD_HELP_PROMPT_VERSION = "card-help-v1";
export const MAX_AI_CARD_HELP_FIELD_CHARS = 4_000;
export const MAX_AI_CARD_HELP_QUESTION_CHARS = 500;
export const MAX_AI_CARD_HELP_ANSWER_CHARS = 2_000;
/** Earlier exchanges about the same card sent along; older ones drop out first. */
export const MAX_AI_CARD_HELP_HISTORY = 6;
export const MAX_AI_CARD_HELP_REQUEST_BYTES = 48 * 1_024;
export const MAX_AI_CARD_HELP_OUTPUT_TOKENS = 1_024;
/** Total time the route may spend on an answer; the browser waits slightly longer. */
export const AI_CARD_HELP_DEADLINE_MS = 25_000;

const text = (maxLength: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(maxLength));
const cardSchema = v.strictObject({
  prompt: text(MAX_AI_CARD_HELP_FIELD_CHARS),
  answer: text(MAX_AI_CARD_HELP_FIELD_CHARS),
  extra: v.optional(text(MAX_AI_CARD_HELP_FIELD_CHARS)),
});
const exchangeSchema = v.strictObject({ question: text(MAX_AI_CARD_HELP_QUESTION_CHARS), answer: text(MAX_AI_CARD_HELP_ANSWER_CHARS) });
const requestSchema = v.pipe(
  v.strictObject({
    card: cardSchema,
    mode: v.picklist(["explain", "example", "question"]),
    question: v.optional(text(MAX_AI_CARD_HELP_QUESTION_CHARS)),
    history: v.optional(v.pipe(v.array(exchangeSchema), v.maxLength(MAX_AI_CARD_HELP_HISTORY))),
  }),
  v.check((request) => (request.mode === "question") === (request.question !== undefined)),
);
const usageSchema = v.nullable(v.strictObject({
  promptTokens: v.nullable(v.number()),
  completionTokens: v.nullable(v.number()),
  totalTokens: v.nullable(v.number()),
}));
const successSchema = v.strictObject({
  answer: text(MAX_AI_CARD_HELP_ANSWER_CHARS),
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  privacyMode: v.literal("zdr"),
  usage: usageSchema,
});

export type AiCardHelpRequest = v.InferOutput<typeof requestSchema>;
export type AiCardHelpSuccess = v.InferOutput<typeof successSchema>;

export function parseAiCardHelpRequest(value: unknown) {
  return v.safeParse(requestSchema, value);
}

export function parseAiCardHelpSuccess(value: unknown) {
  return v.safeParse(successSchema, value);
}

/** Model text as plain paragraphs: unified line breaks, at most one blank line, no surrounding space. */
export function normalizeAiCardHelpAnswer(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
