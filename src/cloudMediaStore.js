export const CORE_MEDIA_BUCKET = "core-media";
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function sanitizePathPart(value, fallback = "asset") {
  const safe = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.!$&'()+,;=@-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || fallback;
}

function toBlob(file) {
  if (file?.blob instanceof Blob) return file.blob;
  if (file instanceof Blob) return file;
  return new Blob([file?.bytes ?? ""], { type: file?.mimeType || "application/octet-stream" });
}

async function getAuthenticatedUser(client) {
  if (!client?.auth || !client?.storage || !client?.from) throw new Error("Supabase Storage ist noch nicht konfiguriert.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Bitte melde dich zuerst an.");
  return data.user;
}

export function normalizeCloudMediaAsset(asset = {}) {
  const sha1 = String(asset.sha1 ?? asset.contentHash ?? "").trim();
  const name = String((asset.originalName ?? asset.name ?? asset.fileName ?? sha1) || "medium").trim();
  return {
    id: asset.id ?? `media_${sha1 || sanitizePathPart(name)}`,
    sha1,
    originalName: name,
    size: Number(asset.size ?? asset.bytes?.byteLength ?? asset.bytes?.length ?? asset.blob?.size ?? 0),
    mimeType: asset.mimeType ?? asset.type ?? "application/octet-stream",
    source: asset.source ?? "apkg-media",
    bytes: asset.bytes,
    blob: asset.blob,
  };
}

export function createCloudMediaPath(userId, asset, { deckId = "unassigned", cardId = null } = {}) {
  const normalized = normalizeCloudMediaAsset(asset);
  const hashPart = sanitizePathPart(normalized.sha1 || normalized.id, "hashless");
  const namePart = sanitizePathPart(normalized.originalName, "medium");
  const deckPart = sanitizePathPart(deckId, "unassigned");
  const scopePart = cardId ? `cards/${sanitizePathPart(cardId)}` : `decks/${deckPart}`;
  return `${userId}/${scopePart}/${hashPart}/${namePart}`;
}

export function createMediaAssetRow(asset, userId, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null, storagePath = null, deletedAt = null } = {}) {
  const normalized = normalizeCloudMediaAsset(asset);
  return {
    id: normalized.id,
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
    deleted_at: deletedAt,
    created_at: asset.createdAt ?? nowIso(),
    updated_at: asset.updatedAt ?? nowIso(),
  };
}

async function upsertMediaRows(client, rows) {
  if (rows.length === 0) return;
  const { error } = await client.from("media_assets").upsert(rows, { onConflict: "user_id,id" });
  if (error) throw error;
}

function isAlreadyExistsError(error) {
  return /already exists|asset already exists|duplicate/i.test(String(error?.message ?? error?.error ?? ""));
}

export async function persistDeckMedia(client, deck, mediaFiles = [], options = {}) {
  const user = await getAuthenticatedUser(client);
  const bucket = options.bucket ?? CORE_MEDIA_BUCKET;
  const rows = [];
  const uploaded = [];
  const skippedLarge = [];
  const warnings = [];
  const storage = client.storage.from(bucket);

  for (const file of mediaFiles) {
    const asset = normalizeCloudMediaAsset(file);
    const row = createMediaAssetRow(asset, user.id, { bucket, deckId: deck?.id ?? null });
    rows.push(row);

    if (asset.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      skippedLarge.push({ ...row, uploadStrategy: "resumable-required" });
      warnings.push(`${asset.originalName} ist größer als 6 MB und braucht einen resumable Upload.`);
      continue;
    }

    const { error } = await storage.upload(row.storage_path, toBlob(asset), {
      contentType: asset.mimeType,
      upsert: false,
    });
    if (error && !isAlreadyExistsError(error)) throw error;
    uploaded.push({ ...row, uploadStatus: error ? "already-exists" : "uploaded" });
  }

  await upsertMediaRows(client, rows);
  return { bucket, rows, uploaded, skippedLarge, warnings };
}

export async function resolveDeckMediaUrls(client, deckOrAssets, options = {}) {
  const user = await getAuthenticatedUser(client);
  const expiresIn = options.expiresIn ?? 60 * 60;
  const assets = Array.isArray(deckOrAssets) ? deckOrAssets : deckOrAssets?.importMeta?.mediaManifest?.assets ?? [];
  let rows = assets.length > 0 && assets[0]?.storage_path ? assets : [];
  if (rows.length === 0 && assets.length > 0) {
    const sha1s = assets.map((asset) => asset.sha1).filter(Boolean);
    if (sha1s.length > 0) {
      const { data, error } = await client.from("media_assets").select("*").eq("user_id", user.id).in("sha1", sha1s);
      if (error) throw error;
      rows = data ?? [];
    }
  }

  const urls = {};
  const missing = [];
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
    if (row.sha1) urls[row.sha1] = data.signedUrl;
  }

  return { urls, missing, expiresIn };
}

export async function deleteUnreferencedMedia(client, rows = [], keepRefs = new Set(), options = {}) {
  const user = await getAuthenticatedUser(client);
  const bucket = options.bucket ?? CORE_MEDIA_BUCKET;
  const deletable = rows.filter((row) => row?.user_id === user.id && !keepRefs.has(row.id) && !keepRefs.has(row.sha1) && !keepRefs.has(row.original_name));
  if (deletable.length === 0) return { deleted: 0, rows: [] };

  const paths = deletable.map((row) => row.storage_path).filter(Boolean);
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
