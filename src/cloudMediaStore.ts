import { validateMediaFileRows } from "./cloudRepositoryValidation.ts";
import type { MediaFileReference } from "./coreTypes.ts";

const CORE_MEDIA_BUCKET = "core-media";
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_RETRY_DELAYS = [0, 3_000, 5_000, 10_000, 20_000];
const MEDIA_METADATA_BATCH_SIZE = 100;
const SMALL_UPLOAD_CONCURRENCY = 4;

export type MediaFailureKind = "auth" | "network" | "expired-resume" | "integrity" | "duplicate" | "conflict" | "rate-limited" | "too-large" | "storage" | "cancelled";

export interface CloudMediaFile {
  sha1: string;
  name: string;
  size: number;
  mimeType: string;
  blob?: Blob;
}

export interface CloudMediaControl {
  isCancelled(): boolean;
  waitUntilResumed(): Promise<void>;
  setActiveUpload(upload: { abort(shouldTerminate: boolean): Promise<void>; start?(): void } | null): void;
  setCancelHandler(handler: (() => void) | null): void;
}

interface UploadOptions {
  client: any;
  supabaseUrl: string;
  userId: string;
  files: CloudMediaFile[];
  control: CloudMediaControl;
  uploadFile?(file: CloudMediaFile, path: string, onProgress: (processedBytes: number) => void): Promise<"uploaded" | "reused">;
  onProgress?(progress: { completed: number; total: number; uploaded: number; reused: number; currentName: string; processedBytes: number; totalBytes: number }): void;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, run: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await run(values[index]);
    }
  }));
  return results;
}

function requireSha1(value: unknown) {
  const sha1 = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha1)) throw mediaError("integrity", "Für das Cloud-Medium fehlt eine gültige SHA-1-Prüfsumme.");
  return sha1;
}

function mediaError(kind: MediaFailureKind, message: string, cause?: unknown) {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { kind });
}

export function classifyMediaError(error: unknown): MediaFailureKind {
  const known = error as { kind?: MediaFailureKind; status?: number; originalResponse?: { getStatus?(): number } };
  if (known?.kind) return known.kind;
  const status = Number(known?.status ?? known?.originalResponse?.getStatus?.() ?? 0);
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
  if (status === 401 || status === 403 || /jwt|unauthor|auth/.test(message)) return "auth";
  if (status === 409 || /conflict/.test(message)) return "conflict";
  if (status === 413 || /too large|maximum.*size/.test(message)) return "too-large";
  if (status === 429 || /rate.?limit/.test(message)) return "rate-limited";
  if (status === 404 || status === 410) return "expired-resume";
  if (/network|fetch|offline|timeout/.test(message)) return "network";
  if (/duplicate|already exists/.test(message)) return "duplicate";
  return "storage";
}

export function accountMediaPath(userId: string, sha1: string) { return `${userId}/${requireSha1(sha1)}`; }

async function currentToken(client: any) {
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.access_token) throw mediaError("auth", "Die Anmeldung ist für den Medien-Upload abgelaufen.", error);
  return data.session.access_token as string;
}

function resumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  return url.toString();
}

async function verifyStoredObject(client: any, path: string, expectedSize: number) {
  const storage = client.storage.from(CORE_MEDIA_BUCKET);
  if (typeof storage.info !== "function") throw mediaError("storage", "Die Größe des vorhandenen Cloud-Mediums konnte nicht geprüft werden.");
  const { data, error } = await storage.info(path);
  if (error) throw mediaError("storage", "Das vorhandene Cloud-Medium konnte nicht geprüft werden.", error);
  const actualSize = Number(data?.metadata?.size ?? data?.size);
  if (!Number.isSafeInteger(actualSize) || actualSize < 0) throw mediaError("storage", "Die Größe des vorhandenen Cloud-Mediums konnte nicht geprüft werden.");
  if (actualSize !== expectedSize) throw mediaError("integrity", "Die Cloud-Datei hat nicht die erwartete Größe.");
}

async function uploadSmall(client: any, file: CloudMediaFile, path: string) {
  if (!file.blob) throw mediaError("storage", "Für den Medien-Upload fehlen die Dateidaten.");
  const { error } = await client.storage.from(CORE_MEDIA_BUCKET).upload(path, file.blob, { contentType: file.mimeType, upsert: false });
  if (!error) return "uploaded" as const;
  if (classifyMediaError(error) !== "duplicate") throw mediaError(classifyMediaError(error), "Das Medium konnte nicht hochgeladen werden.", error);
  await verifyStoredObject(client, path, file.size);
  return "reused" as const;
}

async function uploadLarge(client: any, supabaseUrl: string, userId: string, file: CloudMediaFile, path: string, control: CloudMediaControl, onProgress: (processedBytes: number) => void) {
  if (!file.blob) throw mediaError("storage", "Für den Medien-Upload fehlen die Dateidaten.");
  const blob = file.blob;
  const { Upload } = await import("tus-js-client");
  let restarted = false;
  const run = async (): Promise<"uploaded" | "reused"> => new Promise((resolve, reject) => {
    const upload = new Upload(blob, {
      endpoint: resumableEndpoint(supabaseUrl),
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      retryDelays: TUS_RETRY_DELAYS,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () => ["core-media", userId, CORE_MEDIA_BUCKET, file.sha1, file.size].join("/"),
      metadata: { bucketName: CORE_MEDIA_BUCKET, objectName: path, contentType: file.mimeType, cacheControl: "3600" },
      onBeforeRequest: async (request) => { request.setHeader("Authorization", `Bearer ${await currentToken(client)}`); },
      onProgress,
      onSuccess: () => { control.setActiveUpload(null); control.setCancelHandler(null); resolve("uploaded"); },
      onError: async (error) => {
        control.setActiveUpload(null); control.setCancelHandler(null);
        const kind = classifyMediaError(error);
        if (kind === "duplicate") {
          try { await verifyStoredObject(client, path, file.size); resolve("reused"); } catch (verificationError) { reject(verificationError); }
          return;
        }
        if (kind === "expired-resume" && !restarted) {
          restarted = true;
          try { resolve(await run()); } catch (restartError) { reject(restartError); }
          return;
        }
        reject(mediaError(kind, "Der fortsetzbare Medien-Upload ist fehlgeschlagen.", error));
      },
    });
    control.setActiveUpload(upload);
    control.setCancelHandler(() => reject(mediaError("cancelled", "Der Medien-Upload wurde abgebrochen.")));
    void upload.findPreviousUploads().then((previous) => {
      if (previous[0] && !restarted) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
  return run();
}

async function selectMediaFiles(client: any, userId: string, hashes: string[]): Promise<MediaFileReference[]> {
  const rows: MediaFileReference[] = [];
  for (const batch of chunks([...new Set(hashes)], MEDIA_METADATA_BATCH_SIZE)) {
    const { data, error } = await client.from("media_files").select("*").eq("user_id", userId).in("sha1", batch);
    if (error) throw error;
    rows.push(...validateMediaFileRows(data ?? []));
  }
  return rows;
}

/**
 * Uploads each file once per account and SHA-1, verifies the stored size and then records it in `media_files`.
 * Contents reference files by SHA-1 (`notes.media`); the link rows follow from the contents on the server.
 */
export async function uploadMediaFiles({ client, supabaseUrl, userId, files, control, uploadFile, onProgress }: UploadOptions) {
  const unique = [...new Map(files.map((file) => [requireSha1(file.sha1), file])).values()];
  const total = unique.length;
  const totalBytes = unique.reduce((sum, file) => sum + file.size, 0);
  let completed = 0, uploaded = 0, reused = 0;
  let completedBytes = 0, activeBytes = 0;
  const inFlightBytes = new Map<CloudMediaFile, number>();
  const notifyProgress = (file: CloudMediaFile) => onProgress?.({
    completed,
    total,
    uploaded,
    reused,
    currentName: file.name,
    processedBytes: Math.min(totalBytes, completedBytes + activeBytes),
    totalBytes,
  });
  const reportProgress = (file: CloudMediaFile, processedBytes: number) => {
    const previousBytes = inFlightBytes.get(file) ?? 0;
    const nextBytes = Math.min(Math.max(0, file.size - 1), Math.max(previousBytes, processedBytes));
    activeBytes += nextBytes - previousBytes;
    inFlightBytes.set(file, nextBytes);
    notifyProgress(file);
  };
  const existingBySha1 = new Map((await selectMediaFiles(client, userId, unique.map((file) => file.sha1))).map((row) => [row.sha1, row]));
  const processFile = async (file: CloudMediaFile) => {
    await control.waitUntilResumed();
    if (control.isCancelled()) throw mediaError("cancelled", "Der Medien-Upload wurde abgebrochen.");
    const sha1 = requireSha1(file.sha1);
    const path = accountMediaPath(userId, sha1);
    const existing = existingBySha1.get(sha1);
    if (existing && Number(existing.size) !== file.size) throw mediaError("integrity", "Dieselbe SHA-1-Prüfsumme verweist auf unterschiedliche Dateigrößen.");
    let outcome: "uploaded" | "reused";
    if (existing) {
      await verifyStoredObject(client, existing.storagePath, file.size);
      outcome = "reused";
    } else {
      outcome = uploadFile
        ? await uploadFile(file, path, (processedBytes) => reportProgress(file, processedBytes))
        : file.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES
          ? await uploadSmall(client, file, path)
          : await uploadLarge(client, supabaseUrl, userId, file, path, control, (processedBytes) => reportProgress(file, processedBytes));
      if (outcome === "uploaded" && !uploadFile) await verifyStoredObject(client, path, file.size);
      const { error } = await client.from("media_files").upsert({
        user_id: userId,
        sha1,
        size: file.size,
        mime_type: file.mimeType || "application/octet-stream",
        original_name: file.name,
        storage_path: path,
      }, { onConflict: "user_id,sha1", ignoreDuplicates: true });
      if (error) throw mediaError(classifyMediaError(error), "Die Mediendatei konnte nicht gespeichert werden.", error);
    }
    if (control.isCancelled()) throw mediaError("cancelled", "Der Medien-Upload wurde abgebrochen.");
    activeBytes -= inFlightBytes.get(file) ?? 0;
    inFlightBytes.delete(file);
    completedBytes += file.size;
    completed += 1;
    if (outcome === "uploaded") uploaded += 1;
    else reused += 1;
    notifyProgress(file);
    return sha1;
  };
  const smallFiles = unique.filter((file) => uploadFile || file.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES);
  const largeFiles = unique.filter((file) => !uploadFile && file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES);
  const syncedSha1s = await mapWithConcurrency(smallFiles, SMALL_UPLOAD_CONCURRENCY, processFile);
  for (const file of largeFiles) syncedSha1s.push(await processFile(file));
  return { syncedSha1s, completed, total, uploaded, reused, processedBytes: completedBytes, totalBytes };
}

/** Signed URLs by SHA-1; the storage path follows from account and SHA-1. */
export async function signMediaUrls(client: any, userId: string, sha1s: string[], expiresIn = 3_600) {
  const urls: Record<string, string> = {};
  const missing: string[] = [];
  const unique = [...new Set(sha1s.map((sha1) => sha1.toLowerCase()).filter((sha1) => /^[a-f0-9]{40}$/.test(sha1)))];
  const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();
  if (!unique.length) return { urls, missing, expiresAt };
  const storage = client.storage.from(CORE_MEDIA_BUCKET);
  const paths = unique.map((sha1) => accountMediaPath(userId, sha1));
  const { data, error } = await storage.createSignedUrls(paths, expiresIn);
  if (error) return { urls, missing: unique, expiresAt };
  const urlByPath = new Map<string, string>((data ?? []).filter((item: any) => item.signedUrl).map((item: any) => [String(item.path), String(item.signedUrl)]));
  unique.forEach((sha1, index) => {
    const url = urlByPath.get(paths[index]);
    if (url) urls[sha1] = url;
    else missing.push(sha1);
  });
  return { urls, missing, expiresAt };
}

/** Releases files no content references any more (K4.7): storage object first, then the `media_files` row. */
export async function releaseUnreferencedMedia(client: any, userId: string) {
  const { listReleasableMedia } = await import("./cloudRepository.ts");
  const releasable = await listReleasableMedia(client);
  const own = releasable.filter((entry) => entry.storagePath.startsWith(`${userId}/`));
  if (!own.length) return 0;
  const { error: removeError } = await client.storage.from(CORE_MEDIA_BUCKET).remove(own.map((entry) => entry.storagePath));
  if (removeError) throw mediaError(classifyMediaError(removeError), "Freigegebene Medien konnten nicht entfernt werden.", removeError);
  const { error } = await client.from("media_files").delete().eq("user_id", userId).in("sha1", own.map((entry) => entry.sha1));
  if (error) throw error;
  return own.length;
}
