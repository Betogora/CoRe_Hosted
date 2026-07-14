import type { MediaAssetReference } from "./coreTypes.ts";
import { validateMediaAssetRows } from "./cloudRepositoryValidation.ts";

const CORE_MEDIA_BUCKET = "core-media";
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_RETRY_DELAYS = [0, 3_000, 5_000, 10_000, 20_000];

export type MediaFailureKind = "auth" | "network" | "expired-resume" | "integrity" | "duplicate" | "conflict" | "rate-limited" | "too-large" | "storage" | "cancelled";

export interface CloudMediaFile {
  sha1: string;
  name: string;
  size: number;
  mimeType: string;
  blob: Blob;
  cardId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudMediaControl {
  isCancelled(): boolean;
  waitUntilResumed(): Promise<void>;
  setActiveUpload(upload: { abort(shouldTerminate: boolean): Promise<void>; start?(): void } | null): void;
  setCancelHandler(handler: (() => void) | null): void;
}

interface SyncDeckInput { deckId: string; files: CloudMediaFile[]; previousReferences: MediaAssetReference[]; retainedReferences?: MediaAssetReference[]; }
interface SyncOptions { client: any; supabaseUrl: string; userId: string; decks: SyncDeckInput[]; control: CloudMediaControl; onProgress?(progress: { completed: number; total: number; uploaded: number; reused: number; currentName: string }): void; }

function nowIso() { return new Date().toISOString(); }

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

function toReference(row: ReturnType<typeof validateMediaAssetRows>[number]): MediaAssetReference {
  return {
    id: row.id, userId: row.user_id, deckId: row.deck_id!, cardId: row.card_id,
    sha1: row.sha1, size: row.size, mimeType: row.mime_type, originalName: row.original_name,
    storageBucket: row.storage_bucket, storagePath: row.storage_path, source: row.source,
    metadata: row.metadata as Record<string, unknown>, createdAt: row.created_at,
    updatedAt: row.updated_at, deletedAt: row.deleted_at,
  };
}

function toRow(file: CloudMediaFile, userId: string, deckId: string, path: string, previous?: MediaAssetReference) {
  const timestamp = nowIso();
  const sha1 = requireSha1(file.sha1);
  return {
    id: previous?.id ?? `media_${deckId}_${file.cardId ?? "deck"}_${sha1}`,
    user_id: userId, deck_id: deckId, card_id: file.cardId ?? null, sha1,
    size: file.size, mime_type: file.mimeType || "application/octet-stream", original_name: file.name,
    storage_bucket: CORE_MEDIA_BUCKET, storage_path: path, source: file.source ?? "apkg-media",
    metadata: file.metadata ?? {}, created_at: previous?.createdAt ?? timestamp, updated_at: timestamp, deleted_at: null,
  };
}

function accountObjectPath(userId: string, sha1: string) { return `${userId}/objects/${requireSha1(sha1)}`; }

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
  const { error } = await client.storage.from(CORE_MEDIA_BUCKET).upload(path, file.blob, { contentType: file.mimeType, upsert: false });
  if (!error) return "uploaded" as const;
  if (classifyMediaError(error) !== "duplicate") throw mediaError(classifyMediaError(error), "Das Medium konnte nicht hochgeladen werden.", error);
  await verifyStoredObject(client, path, file.size);
  return "reused" as const;
}

async function uploadLarge(client: any, supabaseUrl: string, userId: string, file: CloudMediaFile, path: string, control: CloudMediaControl) {
  const { Upload } = await import("tus-js-client");
  let restarted = false;
  const run = async (): Promise<"uploaded" | "reused"> => new Promise((resolve, reject) => {
    const upload = new Upload(file.blob, {
      endpoint: resumableEndpoint(supabaseUrl),
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      retryDelays: TUS_RETRY_DELAYS,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () => ["core-media", userId, CORE_MEDIA_BUCKET, file.sha1, file.size].join("/"),
      metadata: { bucketName: CORE_MEDIA_BUCKET, objectName: path, contentType: file.mimeType, cacheControl: "3600" },
      onBeforeRequest: async (request) => { request.setHeader("Authorization", `Bearer ${await currentToken(client)}`); },
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

async function selectAccountHashRows(client: any, userId: string, sha1: string) {
  const { data, error } = await client.from("media_assets").select("*").eq("user_id", userId).eq("storage_bucket", CORE_MEDIA_BUCKET).eq("sha1", sha1).is("deleted_at", null);
  if (error) throw error;
  return validateMediaAssetRows(data ?? []);
}

async function persistReference(client: any, row: ReturnType<typeof toRow>) {
  const { data, error } = await client.from("media_assets").upsert(row, { onConflict: "user_id,id" }).select("*").single();
  if (error) throw error;
  return toReference(validateMediaAssetRows([data])[0]);
}

async function retireStaleReferences(client: any, userId: string, previous: MediaAssetReference[], activeIds: Set<string>) {
  const stale = previous.filter((reference) => !activeIds.has(reference.id) && !reference.deletedAt);
  for (const reference of stale) {
    const deletedAt = nowIso();
    const { error } = await client.from("media_assets").update({ deleted_at: deletedAt, updated_at: deletedAt }).eq("user_id", userId).eq("id", reference.id);
    if (error) throw error;
    const { data, error: countError } = await client.from("media_assets").select("id").eq("user_id", userId).eq("storage_bucket", reference.storageBucket).eq("storage_path", reference.storagePath).is("deleted_at", null);
    if (countError) throw countError;
    if ((data ?? []).length === 0) {
      const { error: removeError } = await client.storage.from(reference.storageBucket).remove([reference.storagePath]);
      if (removeError) throw removeError;
    }
  }
}

export async function syncReferences({ client, supabaseUrl, userId, decks, control, onProgress }: SyncOptions) {
  const total = decks.reduce((sum, deck) => sum + deck.files.length, 0);
  let completed = 0, uploaded = 0, reused = 0;
  const referencesByDeck = new Map<string, MediaAssetReference[]>();
  for (const deck of decks) {
    const references = new Map((deck.retainedReferences ?? []).map((reference) => [reference.id, reference]));
    for (const file of deck.files) {
      await control.waitUntilResumed();
      if (control.isCancelled()) throw mediaError("cancelled", "Der Medien-Upload wurde abgebrochen.");
      const sha1 = requireSha1(file.sha1);
      const path = accountObjectPath(userId, sha1);
      const sameHashRows = await selectAccountHashRows(client, userId, sha1);
      const matchingObject = sameHashRows[0];
      if (matchingObject && Number(matchingObject.size) !== file.size) throw mediaError("integrity", "Dieselbe SHA-1-Prüfsumme verweist auf unterschiedliche Dateigrößen.");
      let outcome: "uploaded" | "reused";
      if (matchingObject) {
        await verifyStoredObject(client, matchingObject.storage_path, file.size);
        outcome = "reused";
      } else {
        outcome = file.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES
          ? await uploadSmall(client, file, path)
          : await uploadLarge(client, supabaseUrl, userId, file, path, control);
      }
      if (control.isCancelled()) {
        if (outcome === "uploaded") {
          await client.storage.from(CORE_MEDIA_BUCKET).remove([path]);
        }
        throw mediaError("cancelled", "Der Medien-Upload wurde abgebrochen.");
      }
      const oldReference = deck.previousReferences.find((reference) => reference.sha1 === sha1 && reference.cardId === (file.cardId ?? null))
        ?? deck.previousReferences.find((reference) => reference.sha1 === sha1 && reference.cardId == null);
      const persisted = await persistReference(client, toRow(file, userId, deck.deckId, matchingObject?.storage_path ?? path, oldReference));
      references.set(persisted.id, persisted);
      completed += 1; outcome === "uploaded" ? uploaded += 1 : reused += 1;
      onProgress?.({ completed, total, uploaded, reused, currentName: file.name });
    }
    await retireStaleReferences(client, userId, deck.previousReferences, new Set(references.keys()));
    referencesByDeck.set(deck.deckId, [...references.values()]);
  }
  return { referencesByDeck, completed, total, uploaded, reused };
}

export async function resolveReferences(client: any, references: MediaAssetReference[], expiresIn = 3_600) {
  const urls: Record<string, string> = {};
  const missing: MediaAssetReference[] = [];
  const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();
  const byBucket = new Map<string, MediaAssetReference[]>();
  for (const reference of references.filter((item) => !item.deletedAt)) byBucket.set(reference.storageBucket, [...(byBucket.get(reference.storageBucket) ?? []), reference]);
  for (const [bucket, items] of byBucket) {
    const paths = [...new Set(items.map((item) => item.storagePath))];
    const storage = client.storage.from(bucket);
    if (typeof storage.createSignedUrls === "function") {
      const { data, error } = await storage.createSignedUrls(paths, expiresIn);
      if (error) { missing.push(...items); continue; }
      const urlByPath = new Map<string, string>((data ?? []).filter((item: any) => item.signedUrl).map((item: any) => [String(item.path), String(item.signedUrl)]));
      for (const item of items) {
        const url = urlByPath.get(item.storagePath);
        if (!url) missing.push(item); else { urls[item.sha1] = url; urls[item.originalName] = url; }
      }
    } else {
      for (const item of items) {
        const { data, error } = await storage.createSignedUrl(item.storagePath, expiresIn);
        if (error || !data?.signedUrl) missing.push(item); else { urls[item.sha1] = data.signedUrl; urls[item.originalName] = data.signedUrl; }
      }
    }
  }
  return { urls, missing, expiresAt };
}
