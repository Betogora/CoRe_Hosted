import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createZstdDecompress, gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
import { task } from "@trigger.dev/sdk/v3";
import {
  commitApkgImport,
  createApkgPreviewFromNormalizedImport,
  mapAnkiApkgToNormalizedDeck,
  parseAnkiDatabasePackage,
  parseMediaEntriesBytes,
  parsePackageMetadataBytes,
} from "../src/apkgImport.ts";
import { syncReferences, type CloudMediaFile } from "../src/cloudMediaStore.ts";
import type { MediaAssetReference } from "../src/coreTypes.ts";
import { planDeckMediaSync } from "../src/mediaStore.ts";
import { APKG_ARTIFACT_VERSION, parseApkgServerArtifact } from "../src/serverApkgImportContract.ts";
import { APKG_LIMITS, openValidatedApkg, UnsafeApkgError } from "./apkgArchive.ts";

const COLLECTION_NAMES = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const SQLITE_TABLES = new Set(["col", "decks", "notes", "cards", "notetypes", "templates", "fields"]);

function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("imports_unavailable");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

async function job(client: any, jobId: string) {
  const result = await client.from("apkg_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (result.error || !result.data) throw new Error("job_not_found");
  return result.data;
}

async function update(client: any, row: any, values: Record<string, unknown>) {
  const result = await client.from("apkg_import_jobs")
    .update({ ...values, revision: Number(row.revision) + 1, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("revision", row.revision).select("*").maybeSingle();
  if (result.error || !result.data) throw new Error("stale_job");
  return result.data;
}

async function assertActive(client: any, jobId: string, statuses: string[]) {
  const row = await job(client, jobId);
  if (row.cancel_requested_at || row.status === "cancelled") throw new Error("job_cancelled");
  if (!statuses.includes(row.status)) throw new Error("stale_job");
  return row;
}

async function downloadSource(client: any, row: any, target: string) {
  const signed = await client.storage.from("core-imports").createSignedUrl(row.source_path, 900);
  if (signed.error) throw new Error("source_unavailable");
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok || !response.body) throw new Error("source_unavailable");
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > APKG_LIMITS.archiveBytes ? new UnsafeApkgError("archive_too_large") : null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body as any), limit, (await import("node:fs")).createWriteStream(target, { flags: "wx" }));
  if (bytes !== Number(row.file_size)) throw new UnsafeApkgError("archive_size_mismatch");
}

async function decompressBytes(bytes: Buffer, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  const collect = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    if (size > maxBytes) return callback(new UnsafeApkgError("manifest_too_large"));
    chunks.push(Buffer.from(chunk));
    callback();
  } });
  await pipeline(Readable.from(bytes), createZstdDecompress(), collect);
  return Buffer.concat(chunks);
}

function isZstd(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

function mimeType(name: string) {
  const extension = name.toLowerCase().split(".").at(-1);
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

async function mediaBundle(archive: Awaited<ReturnType<typeof openValidatedApkg>>, checkActive?: () => Promise<void>) {
  const mediaEntry = archive.entries.get("media");
  if (!mediaEntry) return { format: "none", mediaMap: {}, mediaFiles: [], manifest: { format: "none", assets: [], missingAssets: [] } };
  let bytes = await archive.readBytes("media", APKG_LIMITS.manifestBytes);
  if (isZstd(bytes)) bytes = await decompressBytes(bytes, APKG_LIMITS.manifestBytes);
  let packageVersion = "unknown";
  if (archive.entries.has("meta")) {
    let metadata = await archive.readBytes("meta", APKG_LIMITS.manifestBytes);
    if (isZstd(metadata)) metadata = await decompressBytes(metadata, APKG_LIMITS.manifestBytes);
    packageVersion = parsePackageMetadataBytes(metadata).version;
  }
  const numeric = [...archive.entries.keys()].filter((name) => /^\d+$/.test(name));
  const hashed = new Map<string, { zipEntryName: string; sha1: string; size: number }>();
  for (let index = 0; index < numeric.length; index += 1) {
    if (index % 100 === 0) await checkActive?.();
    const zipEntryName = numeric[index];
    hashed.set(zipEntryName, { zipEntryName, ...(await archive.hash(zipEntryName)) });
  }

  if (/^\s*\{/.test(bytes.toString("utf8"))) {
    const mapping = JSON.parse(bytes.toString("utf8")) as Record<string, string>;
    const mediaMap: Record<string, string> = {};
    const assets = [];
    const missingAssets = [];
    for (const [zipEntryName, rawName] of Object.entries(mapping)) {
      const name = String(rawName).replace(/\\/g, "/").split("/").at(-1) ?? "";
      const found = hashed.get(zipEntryName);
      if (!found) { missingAssets.push({ name, zipEntryName }); continue; }
      mediaMap[zipEntryName] = name;
      assets.push({ name, zipEntryName, sha1: found.sha1, size: found.size, mimeType: mimeType(name) });
    }
    return { format: "legacy-json", mediaMap, mediaFiles: [], manifest: { format: "legacy-json", packageVersion, assets, missingAssets } };
  }

  const entries = parseMediaEntriesBytes(bytes);
  const mediaMap: Record<string, string> = {};
  const assets = entries.map((item: any) => {
    const found = item.legacyZipFileName ? hashed.get(item.legacyZipFileName) : [...hashed.values()].find((candidate) => candidate.sha1 === item.sha1 && candidate.size === item.size);
    const name = String(item.name).replace(/\\/g, "/").split("/").at(-1) ?? "";
    if (found) mediaMap[found.zipEntryName] = name;
    return { name, zipEntryName: found?.zipEntryName ?? null, sha1: item.sha1, size: item.size, mimeType: mimeType(name) };
  });
  return { format: "media-entries", mediaMap, mediaFiles: [], manifest: { format: "media-entries", packageVersion, assets, missingAssets: assets.filter((asset: any) => !asset.zipEntryName) } };
}

function databaseAdapter(path: string) {
  const database = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  return {
    readTable(name: string) {
      if (!SQLITE_TABLES.has(name)) throw new Error("unsupported_sqlite_table");
      try { return database.prepare(`select * from "${name}"`).all(); }
      catch (error) { if (/no such table/i.test(String(error))) return []; throw error; }
    },
    close: () => database.close(),
  };
}

function mediaReference(row: any): MediaAssetReference {
  return {
    id: row.id, userId: row.user_id, deckId: row.deck_id, cardId: row.card_id,
    sha1: row.sha1, size: Number(row.size), mimeType: row.mime_type, originalName: row.original_name,
    storageBucket: row.storage_bucket, storagePath: row.storage_path, source: row.source,
    metadata: row.metadata ?? {}, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
  };
}

async function analyze(client: any, row: any, temp: string, onPhase: (phase: "validate" | "parse" | "preview") => Promise<void>, checkActive: () => Promise<void>) {
  const source = join(temp, "source.apkg");
  const collection = join(temp, "collection.sqlite");
  await downloadSource(client, row, source);
  await onPhase("validate");
  const archive = await openValidatedApkg(source);
  try {
    await onPhase("parse");
    const collectionName = COLLECTION_NAMES.find((name) => archive.entries.has(name));
    if (!collectionName) throw new UnsafeApkgError("missing_collection");
    await archive.writeFile(collectionName, collection, APKG_LIMITS.collectionBytes, collectionName.endsWith("b") ? createZstdDecompress() : undefined);
    const bundle = await mediaBundle(archive, checkActive);
    const database = databaseAdapter(collection);
    try {
      const parsed = parseAnkiDatabasePackage(database, { name: row.file_name, size: row.file_size }, bundle);
      const mapped = mapAnkiApkgToNormalizedDeck({
        file: parsed.file, decks: parsed.decks, notes: parsed.notes, cards: parsed.cards, colRows: parsed.colRows,
        models: parsed.models, mediaMap: bundle.mediaMap, mediaManifest: bundle.manifest,
      });
      const warnings = (mapped.warnings as unknown[]).map(String);
      await onPhase("preview");
      const preview = await createApkgPreviewFromNormalizedImport(mapped.normalizedDeck, warnings);
      if (!preview.preview || preview.report.errors?.length) throw new Error("normalization_failed");
      return { normalizedDeck: mapped.normalizedDeck, warnings, importReport: preview.report };
    } finally { database.close(); }
  } finally { archive.close(); }
}

async function failJob(client: any, jobId: string, error: unknown) {
  const row = await job(client, jobId).catch(() => null);
  if (!row || !["queued", "analyzing", "syncing_media"].includes(row.status)) return;
  const unsafe = error instanceof UnsafeApkgError;
  await update(client, row, {
    status: "failed", phase: row.phase, retryable: !unsafe && Number(row.attempt_count) < Number(row.max_attempts),
    error_class: unsafe ? "validation" : row.phase === "media" ? "media" : "analysis", error_code: unsafe ? error.code : row.phase === "media" ? "media_failed" : "analysis_failed", finished_at: new Date().toISOString(),
  }).catch(() => undefined);
}

const retry = { maxAttempts: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 5_000, factor: 2, outOfMemory: { machine: "large-2x" as const } };

export const analyzeApkg = task({
  id: "analyze-apkg", machine: "large-1x", retry,
  onFailure: async ({ payload, error }) => {
    const client = serviceClient();
    await failJob(client, payload.jobId, error);
    await cleanupApkg.trigger({ jobId: payload.jobId }, { delay: "7d", idempotencyKey: `${payload.jobId}:cleanup:failed` }).catch(() => undefined);
  },
  run: async ({ jobId }: { jobId: string }) => {
    const client = serviceClient();
    let row = await assertActive(client, jobId, ["queued", "analyzing"]);
    row = await update(client, row, { status: "analyzing", phase: "download", attempt_count: Number(row.attempt_count) + 1, started_at: row.started_at ?? new Date().toISOString() });
    const temp = await mkdtemp(join(tmpdir(), "core-apkg-"));
    try {
      const result = await analyze(
        client,
        row,
        temp,
        async (phase) => {
          row = await assertActive(client, jobId, ["analyzing"]);
          row = await update(client, row, { phase, progress_completed: row.file_size, progress_total: row.file_size });
        },
        async () => { row = await assertActive(client, jobId, ["analyzing"]); },
      );
      row = await assertActive(client, jobId, ["analyzing"]);
      const json = Buffer.from(JSON.stringify({ schema: "core-apkg-normalized", version: APKG_ARTIFACT_VERSION, ...result }));
      if (json.byteLength > APKG_LIMITS.artifactBytes) throw new UnsafeApkgError("artifact_too_large");
      const resultPath = `${row.user_id}/${row.id}/normalized-v1.json.gz`;
      const uploaded = await client.storage.from("core-imports").upload(resultPath, gzipSync(json), { contentType: "application/gzip", upsert: true });
      if (uploaded.error) throw new Error("artifact_upload_failed");
      row = await update(client, row, { status: "ready", phase: "preview", result_path: resultPath, report: result.importReport, progress_completed: row.file_size, progress_total: row.file_size, retryable: false });
      await cleanupApkg.trigger({ jobId }, { delay: "7d", idempotencyKey: `${jobId}:cleanup:${row.revision}` }).catch(() => undefined);
      return { jobId, phase: "preview", status: "ready" };
    } finally { await rm(temp, { recursive: true, force: true }); }
  },
});

async function readArtifact(client: any, row: any) {
  const downloaded = await client.storage.from("core-imports").download(row.result_path);
  if (downloaded.error) throw new Error("artifact_unavailable");
  const compressed = Buffer.from(await downloaded.data.arrayBuffer());
  const chunks: Buffer[] = [];
  let size = 0;
  await pipeline(Readable.from(compressed), (await import("node:zlib")).createGunzip(), new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    if (size > APKG_LIMITS.artifactBytes) return callback(new UnsafeApkgError("artifact_too_large"));
    chunks.push(Buffer.from(chunk));
    callback();
  } }));
  const bytes = Buffer.concat(chunks);
  if (bytes.length > APKG_LIMITS.artifactBytes) throw new UnsafeApkgError("artifact_too_large");
  return parseApkgServerArtifact(JSON.parse(bytes.toString("utf8")));
}

export const finalizeApkgMedia = task({
  id: "finalize-apkg-media", machine: "large-1x", retry,
  onFailure: async ({ payload, error }) => {
    await failJob(serviceClient(), payload.jobId, error);
  },
  run: async ({ jobId }: { jobId: string }) => {
    const client = serviceClient();
    let row = await assertActive(client, jobId, ["syncing_media"]);
    row = await update(client, row, { attempt_count: Number(row.attempt_count) + 1, started_at: row.started_at ?? new Date().toISOString() });
    const temp = await mkdtemp(join(tmpdir(), "core-apkg-media-"));
    try {
      const artifact = await readArtifact(client, row);
      const committed: any = await commitApkgImport({ normalizedDeck: artifact.normalizedDeck, warnings: artifact.warnings, mediaFiles: [] });
      const decks: any[] = committed.decks ?? (committed.deck ? [committed.deck] : []);
      const source = join(temp, "source.apkg");
      await downloadSource(client, row, source);
      const archive = await openValidatedApkg(source);
      try {
        const deckIds = decks.map((deck) => deck.id);
        const previousResult = deckIds.length
          ? await client.from("media_assets").select("*").eq("user_id", row.user_id).in("deck_id", deckIds).is("deleted_at", null)
          : { data: [], error: null };
        if (previousResult.error) throw new Error("media_references_unavailable");
        const previousByDeck = new Map<string, MediaAssetReference[]>();
        for (const item of previousResult.data ?? []) {
          const reference = mediaReference(item);
          previousByDeck.set(reference.deckId, [...(previousByDeck.get(reference.deckId) ?? []), reference]);
        }
        const inputs = decks.map((deck) => ({ deckId: deck.id, ...planDeckMediaSync(deck, previousByDeck.get(deck.id) ?? []) }));
        await syncReferences({
          client,
          supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
          userId: row.user_id,
          decks: inputs,
          control: {
            isCancelled: () => false,
            async waitUntilResumed() { row = await assertActive(client, jobId, ["syncing_media"]); },
            setActiveUpload() {},
            setCancelHandler() {},
          },
          async uploadFile(file: CloudMediaFile, path: string) {
            const zipEntryName = String(file.metadata?.zipEntryName ?? "");
            if (!zipEntryName || !archive.entries.has(zipEntryName)) throw new UnsafeApkgError("missing_media_entry");
            const bytes = await archive.readBytes(zipEntryName, APKG_LIMITS.mediaBytes);
            if (bytes.length !== file.size || createHash("sha1").update(bytes).digest("hex") !== file.sha1) throw new UnsafeApkgError("media_integrity_mismatch");
            const uploaded = await client.storage.from("core-media").upload(path, bytes, { contentType: file.mimeType, upsert: false });
            if (!uploaded.error) return "uploaded";
            if (!/duplicate|exist|409/i.test(`${uploaded.error.message} ${(uploaded.error as any).statusCode ?? ""}`)) throw new Error("media_upload_failed");
            const info = await client.storage.from("core-media").info(path);
            if (info.error || Number(info.data?.metadata?.size ?? info.data?.size) !== file.size) throw new UnsafeApkgError("media_integrity_mismatch");
            return "reused";
          },
          async onProgress(progress) {
            row = await update(client, row, { phase: "media", progress_completed: progress.completed, progress_total: progress.total });
          },
        });
      } finally { archive.close(); }
      await client.storage.from("core-imports").remove([row.source_path, row.result_path].filter(Boolean));
      row = await update(client, row, { status: "succeeded", phase: "done", progress_completed: row.progress_total, retryable: false, finished_at: new Date().toISOString() });
      return { jobId, phase: "done", status: "succeeded" };
    } finally { await rm(temp, { recursive: true, force: true }); }
  },
});

export const cleanupApkg = task({
  id: "cleanup-apkg", machine: "large-1x", retry,
  run: async ({ jobId }: { jobId: string }) => {
    const client = serviceClient();
    const row = await job(client, jobId);
    if (row.status !== "succeeded" && row.status !== "cancelled" && new Date(row.expires_at).getTime() > Date.now()) {
      await cleanupApkg.trigger({ jobId }, { delay: new Date(new Date(row.expires_at).getTime() + 60_000), idempotencyKey: `${jobId}:cleanup:deferred:${row.revision}` });
      return { jobId, phase: "cleanup", status: "deferred" };
    }
    await client.storage.from("core-imports").remove([row.source_path, row.result_path].filter(Boolean));
    return { jobId, phase: "cleanup", status: "cleaned" };
  },
});
