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

function requireSha1(value) {
  const sha1 = String(value ?? "").trim().toLowerCase();
  if (!sha1) {
    const error = new Error("Für das Cloud-Medium fehlt die SHA-1-Prüfsumme.");
    error.code = "cloud_media_sha1_missing";
    throw error;
  }
  return sha1;
}

function mediaScope({ deckId = null, cardId = null } = {}) {
  if (cardId) return { kind: "cards", id: sanitizePathPart(cardId, "unassigned") };
  return { kind: "decks", id: sanitizePathPart(deckId, "unassigned") };
}

function canonicalMediaId(asset, context = {}) {
  const scope = mediaScope(context);
  return `media_${scope.kind}_${scope.id}_${requireSha1(asset?.sha1)}`;
}

function mediaDedupeKey(asset, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null } = {}) {
  return [bucket, deckId ?? "", cardId ?? "", requireSha1(asset?.sha1)].join("\u0000");
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

function isAlreadyExistsError(error) {
  return /already exists|asset already exists|duplicate/i.test(String(error?.message ?? error?.error ?? ""));
}

function assertMatchingSize(row, asset) {
  const persistedSize = Number(row?.size ?? 0);
  const incomingSize = Number(asset?.size ?? 0);
  if (persistedSize > 0 && incomingSize > 0 && persistedSize !== incomingSize) {
    const error = new Error(`Die SHA-1-Prüfsumme ${asset.sha1} verweist auf unterschiedliche Dateigrößen.`);
    error.code = "cloud_media_hash_mismatch";
    throw error;
  }
}

function addScopeFilters(query, { deckId = null, cardId = null } = {}) {
  query = deckId == null ? query.is("deck_id", null) : query.eq("deck_id", deckId);
  return cardId == null ? query.is("card_id", null) : query.eq("card_id", cardId);
}

async function selectScopedMediaRows(client, userId, sha1s, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null, includeDeleted = false } = {}) {
  if (sha1s.length === 0) return [];
  let query = client.from("media_assets").select("*").eq("user_id", userId).eq("storage_bucket", bucket).in("sha1", sha1s);
  query = addScopeFilters(query, { deckId, cardId });
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function canonicalRowsBySha1(rows = []) {
  const sorted = [...rows].sort((left, right) => {
    if (Boolean(left.deleted_at) !== Boolean(right.deleted_at)) return left.deleted_at ? 1 : -1;
    return String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const bySha1 = new Map();
  for (const row of sorted) {
    if (row?.sha1 && !bySha1.has(row.sha1)) bySha1.set(row.sha1, row);
  }
  return bySha1;
}

async function upsertMediaRow(client, row) {
  const { data, error } = await client.from("media_assets").upsert(row, { onConflict: "user_id,id" }).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Das Cloud-Medium konnte nicht bestätigt werden.");
  return data;
}

function requestedNamesFor(asset) {
  return [asset.originalName, asset.name, asset.fileName].map((value) => String(value ?? "").trim()).filter(Boolean);
}

function groupMediaFiles(mediaFiles, context) {
  const grouped = new Map();
  for (const file of mediaFiles) {
    const asset = normalizeCloudMediaAsset(file);
    asset.sha1 = requireSha1(asset.sha1);
    const key = mediaDedupeKey(asset, context);
    const current = grouped.get(key);
    if (current) {
      assertMatchingSize(current.asset, asset);
      requestedNamesFor(file).forEach((name) => current.requestedNames.add(name));
      continue;
    }
    grouped.set(key, {
      asset,
      requestedNames: new Set(requestedNamesFor(file).length > 0 ? requestedNamesFor(file) : [asset.originalName]),
    });
  }
  return [...grouped.values()];
}

export function normalizeCloudMediaAsset(asset = {}) {
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

export function createCloudMediaPath(userId, asset, { deckId = "unassigned", cardId = null } = {}) {
  const normalized = normalizeCloudMediaAsset(asset);
  const scope = mediaScope({ deckId, cardId });
  return `${userId}/${scope.kind}/${scope.id}/${sanitizePathPart(requireSha1(normalized.sha1), "hashless")}`;
}

export function createMediaAssetRow(asset, userId, { bucket = CORE_MEDIA_BUCKET, deckId = null, cardId = null, storagePath = null, deletedAt = null } = {}) {
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

export async function persistDeckMedia(client, deck, mediaFiles = [], options = {}) {
  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
    return { bucket: options.bucket ?? CORE_MEDIA_BUCKET, rows: [], uploaded: [], reused: [], skippedLarge: [], warnings: [] };
  }

  const bucket = options.bucket ?? CORE_MEDIA_BUCKET;
  const deckId = deck?.id ?? null;
  const cardId = options.cardId ?? null;
  const context = { bucket, deckId, cardId };
  const groupedFiles = groupMediaFiles(mediaFiles, context);
  const user = await getAuthenticatedUser(client);
  const existingRows = await selectScopedMediaRows(client, user.id, groupedFiles.map(({ asset }) => asset.sha1), { ...context, includeDeleted: true });
  const existingBySha1 = canonicalRowsBySha1(existingRows);
  const rows = [];
  const uploaded = [];
  const reused = [];
  const skippedLarge = [];
  const warnings = [];
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

export async function resolveDeckMediaUrls(client, deckOrAssets, options = {}) {
  const user = await getAuthenticatedUser(client);
  const expiresIn = options.expiresIn ?? 60 * 60;
  const isExplicitRowList = Array.isArray(deckOrAssets);
  const assets = isExplicitRowList ? deckOrAssets : deckOrAssets?.importMeta?.mediaManifest?.assets ?? [];
  const aliasesBySha1 = new Map();
  for (const asset of assets) {
    const sha1 = String(asset?.sha1 ?? "").trim().toLowerCase();
    if (!sha1) continue;
    const aliases = aliasesBySha1.get(sha1) ?? new Set();
    requestedNamesFor(asset).forEach((name) => aliases.add(name));
    aliasesBySha1.set(sha1, aliases);
  }

  let rows = isExplicitRowList && assets.length > 0 && assets[0]?.storage_path ? assets : [];
  if (rows.length === 0 && assets.length > 0) {
    const sha1s = [...new Set(assets.map((asset) => String(asset?.sha1 ?? "").trim().toLowerCase()).filter(Boolean))];
    rows = await selectScopedMediaRows(client, user.id, sha1s, {
      bucket: options.bucket ?? CORE_MEDIA_BUCKET,
      deckId: deckOrAssets?.id ?? options.deckId ?? null,
      cardId: options.cardId ?? null,
    });
  }

  const urls = {};
  const missing = [];
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
