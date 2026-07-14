import * as v from "valibot";

export const LOCAL_APKG_MAX_BYTES = 250 * 1024 * 1024;
export const SERVER_APKG_MAX_BYTES = 1024 * 1024 * 1024;
export const APKG_IMPORT_REQUEST_MAX_BYTES = 16 * 1024;
export const APKG_ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
export const APKG_ARTIFACT_VERSION = 1 as const;

export const apkgImportStatusSchema = v.picklist([
  "uploading",
  "queued",
  "analyzing",
  "ready",
  "committing",
  "syncing_media",
  "succeeded",
  "failed",
  "cancelled",
]);

export const apkgImportPhaseSchema = v.picklist([
  "upload",
  "download",
  "validate",
  "parse",
  "preview",
  "commit",
  "media",
  "cleanup",
  "done",
]);

export const apkgImportProgressSchema = v.strictObject({
  jobId: v.pipe(v.string(), v.uuid()),
  status: apkgImportStatusSchema,
  phase: apkgImportPhaseSchema,
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  completed: v.pipe(v.number(), v.integer(), v.minValue(0)),
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
  retryable: v.boolean(),
  errorCode: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9_]{1,80}$/))),
  report: v.optional(v.record(v.string(), v.unknown())),
});

const createActionSchema = v.strictObject({
  action: v.literal("create"),
  fileName: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  fileSize: v.pipe(v.number(), v.integer(), v.minValue(LOCAL_APKG_MAX_BYTES + 1), v.maxValue(SERVER_APKG_MAX_BYTES)),
});

const revisionAction = <T extends string>(action: T) => v.strictObject({
  action: v.literal(action),
  jobId: v.pipe(v.string(), v.uuid()),
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const apkgImportActionSchema = v.variant("action", [
  createActionSchema,
  revisionAction("enqueue-analysis"),
  revisionAction("prepare-commit"),
  revisionAction("finalize"),
  revisionAction("retry"),
  revisionAction("cancel"),
]);

export const apkgServerArtifactSchema = v.strictObject({
  schema: v.literal("core-apkg-normalized"),
  version: v.literal(APKG_ARTIFACT_VERSION),
  normalizedDeck: v.record(v.string(), v.unknown()),
  warnings: v.array(v.string()),
  importReport: v.record(v.string(), v.unknown()),
});

export type ApkgImportProgress = v.InferOutput<typeof apkgImportProgressSchema>;
export type ApkgImportAction = v.InferOutput<typeof apkgImportActionSchema>;
export type ApkgServerArtifact = v.InferOutput<typeof apkgServerArtifactSchema>;

export function parseApkgImportAction(input: unknown) {
  return v.safeParse(apkgImportActionSchema, input);
}

export function parseApkgImportProgress(input: unknown): ApkgImportProgress {
  return v.parse(apkgImportProgressSchema, input);
}

export function parseApkgServerArtifact(input: unknown): ApkgServerArtifact {
  return v.parse(apkgServerArtifactSchema, input);
}
