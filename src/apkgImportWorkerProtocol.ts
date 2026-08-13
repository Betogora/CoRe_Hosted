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

const commitRequestSchema = v.object({
  type: v.literal("commit"),
  requestId: v.string(),
});

const commitNextRequestSchema = v.object({
  type: v.literal("commit-next"),
  requestId: v.string(),
});

const workerRequestSchema = v.union([parseRequestSchema, commitRequestSchema, commitNextRequestSchema]);

const progressResponseSchema = v.object({
  type: v.literal("progress"),
  requestId: v.string(),
  step: v.string(),
});

const resultPayloadSchema = v.looseObject({
  summary: v.unknown(),
  sampleCards: v.array(v.unknown()),
  report: v.unknown(),
  commitGraph: v.unknown(),
  mediaFiles: v.array(v.unknown()),
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

const commitChunkResponseSchema = v.object({
  type: v.literal("commit-chunk"),
  requestId: v.string(),
  chunk: v.unknown(),
});

const commitDoneResponseSchema = v.object({
  type: v.literal("commit-done"),
  requestId: v.string(),
});

const workerResponseSchema = v.union([progressResponseSchema, resultResponseSchema, errorResponseSchema, commitChunkResponseSchema, commitDoneResponseSchema]);

export type ApkgWorkerRequest = v.InferOutput<typeof workerRequestSchema>;
export type ApkgWorkerResponse = v.InferOutput<typeof workerResponseSchema>;
export type ApkgWorkerResult = v.InferOutput<typeof resultPayloadSchema>;

export function parseApkgWorkerRequest(input: unknown) {
  return v.safeParse(workerRequestSchema, input);
}

export function parseApkgWorkerResponse(input: unknown) {
  return v.safeParse(workerResponseSchema, input);
}
