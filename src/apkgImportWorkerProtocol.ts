import * as v from "valibot";

const parseRequestSchema = v.object({
  type: v.literal("parse"),
  requestId: v.string(),
  file: v.instance(Blob),
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
  rootDeckName: v.string(),
  report: v.looseObject({ errors: v.array(v.string()) }),
  samples: v.array(v.unknown()),
  counts: v.looseObject({ ankiGuids: v.array(v.string()) }),
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

export type ApkgWorkerResponse = v.InferOutput<typeof workerResponseSchema>;

export function parseApkgWorkerRequest(input: unknown) {
  return v.safeParse(workerRequestSchema, input);
}

export function parseApkgWorkerResponse(input: unknown) {
  return v.safeParse(workerResponseSchema, input);
}
