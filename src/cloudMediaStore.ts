import * as v from "valibot";
import type { Tables, TablesInsert } from "./database.types.ts";

export const CORE_MEDIA_BUCKET = "core-media";
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

type MediaAssetRow = Tables<"media_assets">;
type MediaAssetInsert = TablesInsert<"media_assets">;

const mediaHashSchema = v.pipe(v.string(), v.minLength(6), v.maxLength(64), v.regex(/^[a-z0-9]+$/));
const mediaAssetRowSchema = v.looseObject({
  id: v.string(),
  user_id: v.string(),
  deck_id: v.nullable(v.string()),
  card_id: v.nullable(v.string()),
  sha1: mediaHashSchema,
  size: v.pipe(v.number(), v.minValue(0)),
  mime_type: v.string(),
  original_name: v.string(),
  storage_bucket: v.string(),
  storage_path: v.string(),
  source: v.string(),
  metadata: v.record(v.string(), v.unknown()),
  deleted_at: v.nullable(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

function validateMediaRows(input: unknown): MediaAssetRow[] {
  if (!Array.isArray(input)) throw new Error("Cloud-Mediendaten hatten ein ungültiges Zeilenformat.");
  const rows = input.map((row) => v.safeParse(mediaAssetRowSchema, row));
  if (rows.some((row) => !row.success)) throw new Error("Cloud-Mediendaten hatten ein ungültiges Format.");
  return rows.map((row) => row.output as MediaAssetRow);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizePathPart(value: any, fallback: any = "asset") {
  const safe = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.!$&'()+,;=@-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || fallback;
}

function requireSha1(value: any) {
  const sha1 = String(value ?? "").trim().toLowerCase();
  if (!v.safeParse(mediaHashSchema, sha1).success) {
    const error = new Error("Für das Cloud-Medium fehlt die SHA-1-Prüfsumme.") as Error & { code: string };
    error.code = "cloud_media_sha1_missing";
    throw error;
  }
  return sha1;
}

function mediaScope({ deckId = null, cardId = null }: any = {}) {
  if (cardId) return { kind: "cards", id: sanitizePathPart(cardId, "unassigned") };
  return { kind: "decks", id: sanitizePathPart(deckId, "unassigned") };
}

function canonicalMediaId(asset: any, context: any = {}) {
  const scope = mediaScope(context);
  return `media_${scope.kind}_${scope.id}_${requireSha1(asset?.sha1)}`;
}

function mediaDedupeKey(asset: any, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null }: any = {}) {
  return [bucket, deckId ?? "", cardId ?? "", requireSha1(asset?.sha1)].join("\u0000");
}

function toBlob(file: any) {
  if (file?.blob instanceof Blob) return file.blob;
  if (file instanceof Blob) return file;
  return new Blob([file?.bytes ?? ""], { type: file?.mimeType || "application/octet-stream" });
}

async function getAuthenticatedUser(client: any) {
  if (!client?.auth || !client?.storage || !client?.from) throw new Error("Supabase Storage ist noch nicht konfiguriert.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Bitte melde dich zuerst an.");
  return data.user;
}

function isAlreadyExistsError(error: any) {
  return /already exists|asset already exists|duplicate/i.test(String(error?.message ?? error?.error ?? ""));
}

function assertMatchingSize(row: any, asset: any) {
  const persistedSize = Number(row?.size ?? 0);
  const incomingSize = Number(asset?.size ?? 0);
  if (persistedSize > 0 && incomingSize > 0 && persistedSize !== incomingSize) {
    const error = new Error(`Die SHA-1-Prüfsumme ${asset.sha1} verweist auf unterschiedliche Dateigrößen.`) as Error & { code: string };
    error.code = "cloud_media_hash_mismatch";
    throw error;
  }
}

function addScopeFilters(query: any, { deckId = null, cardId = null }: any = {}) {
  query = deckId == null ? query.is("deck_id", null) : query.eq("deck_id", deckId);
  return cardId == null ? query.is("card_id", null) : query.eq("card_id", cardId);
}

async function selectScopedMediaRows(client: any, userId: any, sha1s: any, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null, includeDeleted = false }: any = {}) {
  if (sha1s.length === 0) return [];
  let query = client.from("media_assets").select("*").eq("user_id", userId).eq("storage_bucket", bucket).in("sha1", sha1s);
  query = addScopeFilters(query, { deckId, cardId });
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return validateMediaRows(data ?? []);
}

function canonicalRowsBySha1(rows: any = []) {
  const sorted = [...rows].sort((left: any, right: any) => {
    if (Boolean(left.deleted_at) !== Boolean(right.deleted_at)) return left.deleted_at ? 1 : -1;
    return String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const bySha1 = new Map();
  for (const row of sorted) {
    if (row?.sha1 && !bySha1.has(row.sha1)) bySha1.set(row.sha1, row);
  }
  return bySha1;
}

async function upsertMediaRow(client: any, row: any) {
  const { data, error } = await client.from("media_assets").upsert(row, { onConflict: "user_id,id" }).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Das Cloud-Medium konnte nicht bestätigt werden.");
  const validated = v.safeParse(mediaAssetRowSchema, data);
  if (!validated.success) throw new Error("Das bestätigte Cloud-Medium hatte ein ungültiges Format.");
  return validated.output as MediaAssetRow;
}

function requestedNamesFor(asset: any) {
  return [asset.originalName, asset.name, asset.fileName].map((value: any) => String(value ?? "").trim()).filter(Boolean);
}

function groupMediaFiles(mediaFiles: any, context: any) {
  const grouped = new Map();
  for (const file of mediaFiles) {
    const asset = normalizeCloudMediaAsset(file);
    asset.sha1 = requireSha1(asset.sha1);
    const key = mediaDedupeKey(asset, context);
    const current = grouped.get(key);
    if (current) {
      assertMatchingSize(current.asset, asset);
      requestedNamesFor(file).forEach((name: any) => current.requestedNames.add(name));
      continue;
    }
    grouped.set(key, {
      asset,
      requestedNames: new Set(requestedNamesFor(file).length > 0 ? requestedNamesFor(file) : [asset.originalName]),
    });
  }
  return [...grouped.values()];
}

export function normalizeCloudMediaAsset(asset: any = {}) {
  const sha1 = String(asset.sha1 ?? asset.contentHash ?? "").trim().toLowerCase();
  const name = String((asset.originalName ?? asset.name ?? asset.fileName ?? sha1) || "medium").trim();
  return {
    id: asset.id ?? null,
    sha1,
    originalName: name,
    size: Number(asset.size ?? asset.bytes?.byteLength ?? asset.bytes?.length ?? asset.blob?.size ?? 0),
    mimeType: asset.mimeType ?? asset.type ?? "application/octet-stream",
    source: asset.source ?? "apkg-media",
    metadata: asset.metadata ?? {},
    bytes: asset.bytes,
    blob: asset.blob,
  };
}

export function createCloudMediaPath(userId: any, asset: any, { deckId = "unassigned", cardId = null }: any = {}) {
  const normalized = normalizeCloudMediaAsset(asset);
  const scope = mediaScope({ deckId, cardId });
  return `${userId}/${scope.kind}/${scope.id}/${sanitizePathPart(requireSha1(normalized.sha1), "hashless")}`;
}

export function createMediaAssetRow(asset: any, userId: any, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null, storagePath = null, deletedAt = null }: any = {}): MediaAssetInsert {
  const normalized = normalizeCloudMediaAsset(asset);
  normalized.sha1 = requireSha1(normalized.sha1);
  return {
    id: canonicalMediaId(normalized, { deckId, cardId }),
    user_id: userId,
    deck_id: deckId,
    card_id: cardId,
    sha1: normalized.sha1,
    size: normalized.size,
    mime_type: normalized.mimeType,
    original_name: normalized.originalName,
    storage_bucket: bucket,
    storage_path: storagePath ?? createCloudMediaPath(userId, normalized, { deckId, cardId }),
    source: normalized.source,
    metadata: normalized.metadata,
    deleted_at: deletedAt,
    created_at: asset.createdAt ?? nowIso(),
    updated_at: asset.updatedAt ?? nowIso(),
  };
}

export async function persistDeckMedia(client: any, deck: any, mediaFiles: any = [], options: any = {}) {
  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
    return { bucket: options.bucket ?? CORE_MEDIA_BUCKET, rows: [], uploaded: [], reused: [], skippedLarge: [], warnings: [] };
  }

  const bucket = options.bucket ?? CORE_MEDIA_BUCKET;
  const deckId = deck?.id ?? null;
  const cardId = options.cardId ?? null;
  const context = { bucket, deckId, cardId };
  const groupedFiles = groupMediaFiles(mediaFiles, context);
  const user = await getAuthenticatedUser(client);
  const existingRows = await selectScopedMediaRows(client, user.id, groupedFiles.map(({ asset }: any) => asset.sha1), { ...context, includeDeleted: true });
  const existingBySha1 = canonicalRowsBySha1(existingRows);
  const rows: any[] = [];
  const uploaded: any[] = [];
  const reused: any[] = [];
  const skippedLarge: any[] = [];
  const warnings: any[] = [];
  const storage = client.storage.from(bucket);

  for (const { asset, requestedNames } of groupedFiles) {
    const existing = existingBySha1.get(asset.sha1) ?? null;
    if (existing && !existing.deleted_at) {
      assertMatchingSize(existing, asset);
      rows.push(existing);
      reused.push({ ...existing, uploadStatus: "reused", requestedNames: [...requestedNames] });
      continue;
    }

    const candidate = createMediaAssetRow(asset, user.id, {
      bucket,
      deckId,
      cardId,
      storagePath: existing?.storage_path ?? null,
      deletedAt: null,
    });

    if (asset.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      skippedLarge.push({ ...candidate, uploadStrategy: "resumable-required", requestedNames: [...requestedNames] });
      warnings.push(`${asset.originalName} ist größer als 6 MB und braucht einen resumable Upload.`);
      continue;
    }

    const { error: uploadError } = await storage.upload(candidate.storage_path, toBlob(asset), {
      contentType: asset.mimeType,
      upsert: false,
    });
    const alreadyExists = Boolean(uploadError && isAlreadyExistsError(uploadError));
    if (uploadError && !alreadyExists) throw uploadError;

    const persisted = await upsertMediaRow(client, {
      ...candidate,
      id: existing?.id ?? candidate.id,
      created_at: existing?.created_at ?? candidate.created_at,
      metadata: existing?.metadata ?? candidate.metadata,
      updated_at: nowIso(),
      deleted_at: null,
    });
    assertMatchingSize(persisted, asset);
    rows.push(persisted);
    existingBySha1.set(asset.sha1, persisted);

    const outcome = { ...persisted, uploadStatus: alreadyExists ? "already-exists" : "uploaded", requestedNames: [...requestedNames] };
    if (alreadyExists) reused.push(outcome);
    else uploaded.push(outcome);
  }

  return { bucket, rows, uploaded, reused, skippedLarge, warnings };
}

export async function resolveDeckMediaUrls(client: any, deckOrAssets: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  const expiresIn = options.expiresIn ?? 60 * 60;
  const isExplicitRowList = Array.isArray(deckOrAssets);
  const assets = isExplicitRowList ? deckOrAssets : deckOrAssets?.importMeta?.mediaManifest?.assets ?? [];
  const aliasesBySha1 = new Map();
  for (const asset of assets) {
    const sha1 = String(asset?.sha1 ?? "").trim().toLowerCase();
    if (!sha1) continue;
    const aliases = aliasesBySha1.get(sha1) ?? new Set();
    requestedNamesFor(asset).forEach((name: any) => aliases.add(name));
    aliasesBySha1.set(sha1, aliases);
  }

  let rows = isExplicitRowList && assets.length > 0 && assets[0]?.storage_path ? assets : [];
  if (rows.length === 0 && assets.length > 0) {
    const sha1s = [...new Set(assets.map((asset: any) => String(asset?.sha1 ?? "").trim().toLowerCase()).filter(Boolean))];
    rows = await selectScopedMediaRows(client, user.id, sha1s, {
      bucket: options.bucket ?? CORE_MEDIA_BUCKET,
      deckId: deckOrAssets?.id ?? options.deckId ?? null,
      cardId: options.cardId ?? null,
    });
  }

  const urls: Record<string, string> = {};
  const missing: any[] = [];
  const resolvedSha1s = new Set();
  for (const row of rows) {
    if (!row?.storage_bucket || !row?.storage_path || row.deleted_at) {
      missing.push(row);
      continue;
    }
    const { data, error } = await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, expiresIn);
    if (error || !data?.signedUrl) {
      missing.push(row);
      continue;
    }
    urls[row.original_name] = data.signedUrl;
    if (row.sha1) {
      const sha1 = String(row.sha1).toLowerCase();
      urls[sha1] = data.signedUrl;
      resolvedSha1s.add(sha1);
      for (const alias of aliasesBySha1.get(sha1) ?? []) urls[alias] = data.signedUrl;
    }
  }

  for (const asset of assets) {
    const sha1 = String(asset?.sha1 ?? "").trim().toLowerCase();
    if (sha1 && !resolvedSha1s.has(sha1) && !missing.includes(asset)) missing.push(asset);
  }

  return { urls, missing, expiresIn };
}

export async function deleteUnreferencedMedia(client: any, rows: any = [], keepRefs: any = new Set(), options: any = {}) {
  const user = await getAuthenticatedUser(client);
  const bucket = options.bucket ?? CORE_MEDIA_BUCKET;
  const deletable = rows.filter((row: any) => row?.user_id === user.id && !keepRefs.has(row.id) && !keepRefs.has(row.sha1) && !keepRefs.has(row.original_name));
  if (deletable.length === 0) return { deleted: 0, rows: [] };

  const paths = deletable.map((row: any) => row.storage_path).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) throw error;
  }

  const deletedAt = nowIso();
  for (const row of deletable) {
    const { error } = await client.from("media_assets").update({ deleted_at: deletedAt, updated_at: deletedAt }).eq("user_id", user.id).eq("id", row.id);
    if (error) throw error;
  }

  return { deleted: deletable.length, rows: deletable };
}
