import * as v from "valibot";

const fileMetadataSchema = v.object({
  name: v.string(),
  size: v.number(),
  type: v.string(),
  lastModified: v.number(),
});

const parseRequestSchema = v.object({
  type: v.literal("parse"),
  requestId: v.string(),
  file: fileMetadataSchema,
  buffer: v.instance(ArrayBuffer),
});

const progressResponseSchema = v.object({
  type: v.literal("progress"),
  requestId: v.string(),
  step: v.string(),
});

const resultPayloadSchema = v.looseObject({
  normalizedDeck: v.unknown(),
  warnings: v.array(v.string()),
  errors: v.array(v.string()),
  mediaFiles: v.array(v.unknown()),
  parsedPackage: v.nullable(v.unknown()),
});

const resultResponseSchema = v.object({
  type: v.literal("result"),
  requestId: v.string(),
  result: resultPayloadSchema,
});

const errorResponseSchema = v.object({
  type: v.literal("error"),
  requestId: v.string(),
  message: v.string(),
});

const workerResponseSchema = v.union([progressResponseSchema, resultResponseSchema, errorResponseSchema]);

export type ApkgWorkerRequest = v.InferOutput<typeof parseRequestSchema>;
export type ApkgWorkerResponse = v.InferOutput<typeof workerResponseSchema>;
export type ApkgWorkerResult = v.InferOutput<typeof resultPayloadSchema>;

export function parseApkgWorkerRequest(input: unknown) {
  return v.safeParse(parseRequestSchema, input);
}

export function parseApkgWorkerResponse(input: unknown) {
  return v.safeParse(workerResponseSchema, input);
}
