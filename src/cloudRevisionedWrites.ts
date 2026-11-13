// Private to cloudRepository.ts: revisioned and batched entity writes, atomic reviews, device and profile writes, and the resolution of sync conflicts.
import { saveCloudProfile } from "./cloudAuth.ts";
import type { Card, CardVariant, ReviewEvent } from "./coreTypes.ts";
import {
  cardFromRow,
  deckFromRow,
  noteFromRow,
  validateAccountRows,
  requireJsonRecord,
  validateRevisionAcknowledgements,
  validateSyncConflictRows,
  variantFromRow,
  type AccountTable,
  type SyncConflictRow,
} from "./cloudRepositoryValidation.ts";
import { requireCompleteProfile } from "./profileIntegrity.ts";
import {
  type CloudRow,
  type CloudUser,
  type CloudClient,
  cloudTable,
  entityRows,
  ACCOUNT_UPSERT_CONFLICT,
  UPSERT_TABLES,
  REVISIONED_TABLE_SET,
  CLOUD_WRITE_CONCURRENCY,
  nowIso,
  toArray,
  toJson,
  normalizeRevision,
  getAuthenticatedUser,
  authenticatedUserForKnownSession,
  requireNonEmptyString,
  requireTimestamp,
  chunkRows,
  mapWithConcurrency,
  upsertRows,
  selectRowsByField,
  selectRowById,
  requireBaseRevision,
} from "./cloudQueries.ts";
import {
  deckToCloudRow,
  noteToCloudRow,
  studyToCloudColumns,
  cardToCloudRow,
  variantToCloudRow,
  reviewEventToCloudRow,
  noteTypeSourceToCloudRow,
  noteSourceToCloudRow,
} from "./cloudRows.ts";
import {
  CARD_STUDY_FIELDS,
  CONFLICT_PROTECTED_FIELDS,
  CONFLICT_ACTIONS,
  SyncConflictChangedError,
  rowsHaveSameContent,
  conflictValue,
  isTombstoneConflict,
  conflictFieldKeys,
  createConflictProjection,
  throwRevisionConflict,
} from "./cloudConflicts.ts";

export async function deleteAccountDeckTree(
  client: CloudClient,
  deckId: string | undefined,
  { deletedAt = new Date().toISOString(), deviceId = null }: { deletedAt?: string; deviceId?: string | null } = {},
) {
  const { data, error } = await client.rpc("delete_account_deck_tree", {
    p_deck_id: requireNonEmptyString(deckId, "Stapel-ID fehlt."),
    p_deleted_at: deletedAt,
    p_device_id: deviceId,
  });
  if (error) throw error;
  const candidate = requireJsonRecord(data, "Deckbaum-Löschantwort ist ungültig.");
  if (!Array.isArray(candidate.deletedDeckIds) || candidate.deletedDeckIds.some((id) => typeof id !== "string")) {
    throw new Error("Deckbaum-Löschantwort enthält ungültige Stapel-IDs.");
  }
  const deletedCardCount = Number(candidate.deletedCardCount ?? 0);
  const deletedNoteCount = Number(candidate.deletedNoteCount ?? 0);
  if (!Number.isSafeInteger(deletedCardCount) || deletedCardCount < 0 || !Number.isSafeInteger(deletedNoteCount) || deletedNoteCount < 0) {
    throw new Error("Deckbaum-Löschantwort enthält eine ungültige Anzahl.");
  }
  return { deletedDeckIds: candidate.deletedDeckIds as string[], deletedCardCount, deletedNoteCount };
}

export async function registerAccountSyncDevice(client: CloudClient, device: { id?: unknown; label?: unknown; userAgent?: unknown }, { lastSeenAt, userId }: { lastSeenAt?: string; userId?: string } = {}) {
  const id = requireNonEmptyString(device?.id, "Geräte-ID fehlt.");
  const label = requireNonEmptyString(device?.label, "Gerätebezeichnung fehlt.");
  if (typeof device?.userAgent !== "string") throw new Error("User-Agent des Geräts fehlt.");
  const seenAt = requireTimestamp(lastSeenAt, nowIso, "Zeitpunkt der Geräte-Registrierung ist ungültig.");
  const user = await authenticatedUserForKnownSession(client, userId);
  const row = {
    id,
    user_id: user.id,
    label,
    last_seen_at: seenAt,
    user_agent: device.userAgent,
  };
  const { data, error } = await cloudTable(client, "sync_devices")
    .upsert(row, { onConflict: ACCOUNT_UPSERT_CONFLICT })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Dieses Gerät konnte nicht für die Synchronisierung registriert werden.");
  return data;
}

function updatePayload(row: CloudRow, { revision, deviceId, now }: { revision: number; deviceId: string; now: () => string }) {
  const payload = Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "user_id", "created_at"].includes(key)));
  payload.revision = revision;
  payload.updated_by_device_id = deviceId ?? row.updated_by_device_id ?? null;
  if (Object.hasOwn(payload, "updated_at")) payload.updated_at = now();
  return payload;
}

function revisionMutationResult(entityTable: string, row: CloudRow | null | undefined, { applied = false, idempotent = false }: { applied?: boolean; idempotent?: boolean } = {}) {
  return {
    entityTable,
    entityId: row?.id ?? null,
    revision: row?.revision == null ? null : normalizeRevision(row.revision),
    deletedAt: row?.deleted_at ?? null,
    updatedByDeviceId: row?.updated_by_device_id ?? null,
    persistedRow: row?.id ? row : null,
    applied,
    idempotent,
  };
}

/** Card edits never overwrite the remote study state; reviews own it via `record_review_atomic`. */
function preserveRemoteLearningProjection(entityTable: string, desiredRow: CloudRow, remoteRow: CloudRow | null) {
  if (!remoteRow) return desiredRow;
  if (entityTable === "cards") {
    return { ...desiredRow, ...Object.fromEntries(CARD_STUDY_FIELDS.map((field) => [field, remoteRow[field]])) };
  }
  if (entityTable === "card_variants") {
    return { ...desiredRow, performance: remoteRow.performance };
  }
  return desiredRow;
}

interface RevisionedWriteOptions {
  deviceId?: string;
  flushedAt?: string;
  baseRevision?: unknown;
  /** Remote row already loaded by a batch; `null` means it does not exist. */
  remoteRow?: CloudRow | null;
  forceWrite?: boolean;
}

async function applyRevisionedRowMutation(client: CloudClient, user: CloudUser, entityTable: string, desiredRow: CloudRow, options: RevisionedWriteOptions = {}) {
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Nicht revisionierbare Cloud-Tabelle: ${entityTable}`);
  const entityId = requireNonEmptyString(desiredRow?.id, "Entitäts-ID fehlt.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  if (!Object.hasOwn(options, "baseRevision")) throw new Error("Basisrevision fehlt.");
  const baseRevision = requireBaseRevision(options.baseRevision);
  const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  const writeNow = () => flushedAt;
  let row: CloudRow = { ...desiredRow, id: entityId, user_id: user.id };
  let remoteRow = Object.hasOwn(options, "remoteRow") ? options.remoteRow : await selectRowById(client, entityTable, user.id, entityId, entityRows(entityTable));

  if (remoteRow && rowsHaveSameContent(row, remoteRow, entityTable) && options.forceWrite !== true) {
    return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
  }

  if (!remoteRow) {
    if (baseRevision !== null) {
      return throwRevisionConflict(client, user, {
        entityTable,
        entityId,
        baseRevision,
        localValue: row,
        remoteValue: {},
        deviceId,
        createdAt: flushedAt,
      });
    }
    const candidate = {
      ...row,
      revision: 1,
      updated_by_device_id: deviceId,
      updated_at: flushedAt,
    };
    const { data, error } = await cloudTable(client, entityTable).insert(candidate).select("*");
    const inserted = error ? null : validateRevisionAcknowledgements(data ?? [])[0];
    if (inserted) return revisionMutationResult(entityTable, inserted, { applied: true });
    if (error && String(error.code ?? "") !== "23505" && !/duplicate/i.test(error.message ?? "")) throw error;
    remoteRow = await selectRowById(client, entityTable, user.id, entityId, entityRows(entityTable));
    if (remoteRow && rowsHaveSameContent(candidate, remoteRow, entityTable)) {
      return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
    }
    if (!remoteRow) {
      return throwRevisionConflict(client, user, {
        entityTable,
        entityId,
        baseRevision,
        localValue: candidate,
        remoteValue: {},
        deviceId,
        createdAt: flushedAt,
      });
    }
  }

  row = preserveRemoteLearningProjection(entityTable, row, remoteRow);
  const restoresTombstone = Boolean(remoteRow.deleted_at) && row.deleted_at == null;
  // Schrieb zuletzt dieses Gerät, war die Antwort auf seinen Insert verloren; die ausstehende Änderung baut darauf auf.
  const effectiveBaseRevision = baseRevision ?? (remoteRow.updated_by_device_id === deviceId && !remoteRow.deleted_at ? normalizeRevision(remoteRow.revision) : null);
  if (effectiveBaseRevision === null || normalizeRevision(remoteRow.revision) !== effectiveBaseRevision || (remoteRow.deleted_at && !restoresTombstone)) {
    return throwRevisionConflict(client, user, {
      entityTable,
      entityId,
      baseRevision,
      localValue: row,
      remoteValue: remoteRow,
      deviceId,
      createdAt: flushedAt,
    });
  }

  const nextRevision = effectiveBaseRevision + 1;
  const payload = updatePayload(row, { revision: nextRevision, deviceId, now: writeNow });
  const { data, error } = await cloudTable(client, entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", entityId)
    .eq("revision", effectiveBaseRevision)
    .select("*");
  if (error) throw error;
  const [updated] = validateRevisionAcknowledgements(data ?? []);
  if (updated) return revisionMutationResult(entityTable, updated, { applied: true });

  remoteRow = await selectRowById(client, entityTable, user.id, entityId, entityRows(entityTable));
  if (remoteRow && rowsHaveSameContent({ ...row, revision: nextRevision, updated_by_device_id: deviceId }, remoteRow, entityTable)) {
    return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
  }
  return throwRevisionConflict(client, user, {
    entityTable,
    entityId,
    baseRevision,
    localValue: row,
    remoteValue: remoteRow ?? {},
    deviceId,
    createdAt: flushedAt,
  });
}

async function softDeleteEntityForUser(client: CloudClient, user: CloudUser, input: { entityTable?: unknown; entityId?: unknown; baseRevision?: unknown; deletedAt?: unknown } = {}, options: RevisionedWriteOptions = {}) {
  const entityTable = requireNonEmptyString(input.entityTable, "Tabelle für Soft-Delete fehlt.");
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Soft-Delete ist für diese Tabelle nicht erlaubt: ${entityTable}`);
  const entityId = requireNonEmptyString(input.entityId, "Entitäts-ID für Soft-Delete fehlt.");
  const baseRevision = requireBaseRevision(input.baseRevision);
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  const deletedAt = requireTimestamp(input.deletedAt ?? options.flushedAt, nowIso, "Löschzeitpunkt ist ungültig.");
  const remoteRow = Object.hasOwn(options, "remoteRow") ? options.remoteRow : await selectRowById(client, entityTable, user.id, entityId, entityRows(entityTable));

  if (!remoteRow) return revisionMutationResult(entityTable, { id: entityId }, { idempotent: true });
  if (remoteRow.deleted_at) return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
  if (normalizeRevision(remoteRow.revision) !== baseRevision) {
    return throwRevisionConflict(client, user, {
      entityTable,
      entityId,
      baseRevision,
      localValue: { id: entityId, revision: baseRevision, deleted_at: deletedAt },
      remoteValue: remoteRow,
      deviceId,
      createdAt: deletedAt,
    });
  }

  const payload = {
    deleted_at: deletedAt,
    revision: normalizeRevision(baseRevision) + 1,
    updated_by_device_id: deviceId,
    updated_at: deletedAt,
  };
  const { data, error } = await cloudTable(client, entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", entityId)
    .eq("revision", baseRevision)
    .select("*");
  if (error) throw error;
  const [deleted] = validateRevisionAcknowledgements(data ?? []);
  if (deleted) return revisionMutationResult(entityTable, deleted, { applied: true });

  const latest = await selectRowById(client, entityTable, user.id, entityId, entityRows(entityTable));
  if (!latest || latest.deleted_at) return revisionMutationResult(entityTable, latest ?? { id: entityId }, { idempotent: true });
  return throwRevisionConflict(client, user, {
    entityTable,
    entityId,
    baseRevision,
    localValue: { id: entityId, revision: baseRevision, deleted_at: deletedAt },
    remoteValue: latest,
    deviceId,
    createdAt: deletedAt,
  });
}

/** The inserted rows as the cloud answers, for the caller's validator. */
async function insertRowsReturning(client: CloudClient, table: string, rows: object[]) {
  const inserted: unknown[] = [];
  for (const chunk of chunkRows(rows)) {
    const { data, error } = await cloudTable(client, table).insert(chunk).select("*");
    if (error) throw error;
    inserted.push(...toArray(data));
  }
  return inserted;
}

export interface CloudEntityPage {
  table: AccountTable;
  entities: any[];
  reset: boolean;
}

function projectCloudEntities(table: AccountTable, rows: CloudRow[]) {
  if (table === "decks") return rows.map(deckFromRow);
  if (table === "notes") return rows.map(noteFromRow);
  if (table === "cards") return rows.map((row) => cardFromRow(row));
  return rows.map(variantFromRow);
}

/** Entity mutation as the outbox stores it; `entity` has the domain shape of `table` (a deck, note, card, ...). */
export interface EntityMutationPayload {
  table?: unknown;
  tombstone?: boolean;
  entityId?: unknown;
  baseRevision?: unknown;
  deletedAt?: unknown;
  entity?: any;
}

export async function applyEntityMutation(client: CloudClient, mutation: EntityMutationPayload, options: RevisionedWriteOptions = {}) {
  const user = await getAuthenticatedUser(client);
  const entityTable = requireNonEmptyString(mutation?.table, "Tabelle der Entity-Mutation fehlt.");
  if (mutation?.tombstone) {
    return softDeleteEntityForUser(client, user, {
      entityTable,
      entityId: mutation.entityId,
      baseRevision: mutation.baseRevision,
      deletedAt: mutation.deletedAt,
    }, options);
  }
  const entity = mutation?.entity;
  if (UPSERT_TABLES.has(entityTable)) return (await upsertImportSourceRows(client, user, entityTable, [mutation], options))[0];
  if (entityTable === "review_events") {
    const desired = reviewEventToCloudRow(entity, user.id, options);
    const remote = await selectRowsByField(client, "review_events", user.id, "id", [desired.id]);
    if (remote.length) return { persistedRow: remote[0], idempotent: true };
    const [persisted] = await insertRowsReturning(client, "review_events", [desired]);
    return { persistedRow: validateAccountRows("review_events", [persisted])[0] };
  }
  const row = entityMutationRow(entityTable, mutation, user.id);
  if (!row) throw new Error(`Entity-Mutation wird für ${entityTable} nicht unterstützt.`);
  return applyRevisionedRowMutation(client, user, entityTable, row, {
    ...options,
    baseRevision: mutation.baseRevision,
  });
}

function entityMutationRow(entityTable: string, mutation: EntityMutationPayload, userId: string) {
  const entity = mutation?.entity;
  if (entityTable === "decks") return deckToCloudRow(entity, userId);
  if (entityTable === "notes") return noteToCloudRow(entity, userId);
  if (entityTable === "cards") return cardToCloudRow(entity, userId);
  if (entityTable === "card_variants") return variantToCloudRow(entity, userId);
  if (entityTable === "note_type_sources") return noteTypeSourceToCloudRow(entity, userId);
  if (entityTable === "note_sources") return noteSourceToCloudRow(entity, userId);
  return null;
}

async function upsertImportSourceRows(client: CloudClient, user: CloudUser, entityTable: string, mutations: EntityMutationPayload[], options: RevisionedWriteOptions = {}) {
  const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  const rows: CloudRow[] = mutations.map((mutation) => ({
    ...entityMutationRow(entityTable, mutation, user.id),
    updated_at: flushedAt,
    updated_by_device_id: deviceId,
  }));
  const persisted: CloudRow[] = [];
  for (const chunk of chunkRows(rows)) {
    const { data, error } = await cloudTable(client, entityTable).upsert(chunk, { onConflict: ACCOUNT_UPSERT_CONFLICT }).select("id, revision, updated_at, deleted_at, updated_by_device_id");
    if (error) throw error;
    persisted.push(...validateRevisionAcknowledgements(data ?? []));
  }
  const persistedById = new Map(persisted.map((row) => [row.id, row]));
  return rows.map((row) => revisionMutationResult(entityTable, persistedById.get(row.id) ?? row, { applied: true }));
}

export async function applyEntityMutationBatch(client: CloudClient, mutations: EntityMutationPayload[], options: RevisionedWriteOptions = {}) {
  if (!mutations.length) return [];
  const user = await getAuthenticatedUser(client);
  const entityTable = requireNonEmptyString(mutations[0]?.table, "Tabelle der Entity-Mutation fehlt.");
  if (mutations.some((mutation) => mutation.table !== entityTable || mutation.tombstone)) {
    return mapWithConcurrency(mutations, (mutation) => applyEntityMutation(client, mutation, options));
  }
  if (UPSERT_TABLES.has(entityTable)) return upsertImportSourceRows(client, user, entityTable, mutations, options);
  if (entityTable === "review_events") {
    const desiredRows = mutations.map((mutation) => reviewEventToCloudRow(mutation.entity, user.id, options));
    const remoteRows = await selectRowsByField(client, "review_events", user.id, "id", desiredRows.map((row) => row.id));
    const remoteById = new Map(remoteRows.map((row) => [row.id, row]));
    const missingRows = desiredRows.filter((row) => !remoteById.has(row.id));
    const missingIds = new Set(missingRows.map((row) => row.id));
    if (missingRows.length) {
      await upsertRows(client, "review_events", missingRows, { ignoreDuplicates: true, concurrency: CLOUD_WRITE_CONCURRENCY });
      const confirmedRows = await selectRowsByField(client, "review_events", user.id, "id", missingRows.map((row) => row.id));
      for (const row of confirmedRows) remoteById.set(row.id, row);
    }
    return desiredRows.map((row) => {
      const persistedRow = remoteById.get(row.id);
      if (!persistedRow) throw new Error(`Review-Ereignis ${row.id} wurde nicht bestätigt.`);
      return { persistedRow, idempotent: !missingIds.has(row.id) };
    });
  }
  const rows = mutations.map((mutation) => entityMutationRow(entityTable, mutation, user.id));
  if (rows.some((row) => !row)) throw new Error(`Entity-Mutation wird für ${entityTable} nicht unterstützt.`);
  // Only revisioned tables reach this point; their rows carry a string id.
  const validRows = rows as Array<CloudRow & { id: string }>;
  const remoteRows = await selectRowsByField(client, entityTable as AccountTable, user.id, "id", validRows.map((row) => row.id));
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]));
  const results = new Array(mutations.length);
  const inserts = mutations.flatMap((mutation, index) => mutation.baseRevision == null && !remoteById.has(validRows[index].id) ? [{ mutation, index }] : []);
  if (inserts.length) {
    const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
    const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
    const candidates = inserts.map(({ index }) => ({
      ...validRows[index],
      revision: 1,
      updated_by_device_id: deviceId,
      updated_at: flushedAt,
    }));
    try {
      const persisted = validateRevisionAcknowledgements(await insertRowsReturning(client, entityTable, candidates));
      const persistedById = new Map(persisted.map((row) => [row.id, row]));
      for (const { index } of inserts) results[index] = revisionMutationResult(entityTable, persistedById.get(validRows[index].id), { applied: true });
    } catch {
      await mapWithConcurrency(inserts, async ({ mutation, index }) => {
        results[index] = await applyRevisionedRowMutation(client, user, entityTable, validRows[index], { ...options, baseRevision: mutation.baseRevision });
      });
    }
  }
  const remaining = mutations.flatMap((mutation, index) => results[index] ? [] : [{ mutation, index }]);
  await mapWithConcurrency(remaining, async ({ mutation, index }) => {
    results[index] = await applyRevisionedRowMutation(client, user, entityTable, validRows[index], {
      ...options,
      baseRevision: mutation.baseRevision,
      remoteRow: remoteById.get(validRows[index].id) ?? null,
    });
  });
  return results;
}

/** Review as the outbox stores it for `record_review_atomic`. */
export interface AtomicReviewPayload {
  card?: Pick<Card, "id" | "study" | "updatedAt">;
  variant?: Pick<CardVariant, "id" | "performance" | "updatedAt"> | null;
  event?: ReviewEvent;
}

export async function recordAtomicReview(client: CloudClient, input: AtomicReviewPayload, { deviceId, mutationId }: { deviceId?: string; mutationId?: string } = {}) {
  const user = await getAuthenticatedUser(client);
  const card = input?.card;
  const variant = input?.variant;
  const event = input?.event as ReviewEvent;
  const eventRow = reviewEventToCloudRow(event, user.id, { deviceId });
  const { data, error } = await client.rpc("record_review_atomic", {
    p_card_id: card?.id,
    p_study: card ? studyToCloudColumns(card.study) : {},
    p_card_updated_at: card?.updatedAt ?? event?.answeredAt,
    p_variant_id: variant?.id ?? null,
    p_variant_performance: variant ? toJson(variant.performance, {}) : null,
    p_variant_updated_at: variant?.updatedAt ?? event?.answeredAt ?? null,
    p_event: eventRow,
    p_device_id: deviceId,
  });
  if (error) {
    const code = String(error.code ?? "");
    if (code === "PGRST202" || code === "42883" || /record_review_atomic|function.*does not exist/i.test(String(error.message ?? ""))) {
      const unavailable = new Error("Die atomare Review-Synchronisierung ist auf dem Server noch nicht verfügbar. Die lokale Änderung bleibt vorgemerkt.") as Error & { code: string };
      unavailable.code = "review_rpc_unavailable";
      throw unavailable;
    }
    throw error;
  }
  const response = requireJsonRecord(data, "Die atomare Review-Antwort hatte ein ungültiges Format.");
  const rows = {
    card: validateAccountRows("cards", [response.card])[0],
    variant: response.variant == null ? null : validateAccountRows("card_variants", [response.variant])[0],
    event: validateAccountRows("review_events", [response.event])[0],
  };
  return {
    acknowledgedMutationId: mutationId,
    rows,
    entities: {
      card: cardFromRow(rows.card),
      variant: rows.variant ? variantFromRow(rows.variant) : null,
    },
  };
}

export async function upsertAccountCloudProfile(client: CloudClient, profile: unknown, { mutationId, flushedAt }: { mutationId?: string; flushedAt?: string } = {}) {
  const resolvedMutationId = requireNonEmptyString(mutationId, "Mutation-ID fehlt.");
  const writeTimestamp = requireTimestamp(flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  await saveCloudProfile(client, requireCompleteProfile(profile), writeTimestamp);
  return { acknowledgedMutationId: resolvedMutationId };
}

interface ConflictDecision {
  action: string;
  fieldChoices: Record<string, unknown>;
  localValue: CloudRow;
  remoteValue: CloudRow;
  fields: string[];
  tombstone: boolean;
}

function normalizeConflictDecision(decision: { action?: unknown; fieldChoices?: unknown } = {}, conflictRow: Pick<SyncConflictRow, "local_value" | "remote_value">): ConflictDecision {
  const action = requireNonEmptyString(decision.action, "Konfliktentscheidung fehlt.");
  if (!CONFLICT_ACTIONS.has(action)) throw new Error("Konfliktentscheidung ist ungültig.");
  const localValue = conflictValue(conflictRow.local_value);
  const remoteValue = conflictValue(conflictRow.remote_value);
  const fields = conflictFieldKeys(localValue, remoteValue);
  const tombstone = isTombstoneConflict(localValue, remoteValue);

  if (action !== "merge-fields") return { action, fieldChoices: {}, localValue, remoteValue, fields, tombstone };
  if (tombstone) throw new Error("Gelöschte Inhalte können nicht feldweise zusammengeführt werden.");
  const fieldChoices = (decision.fieldChoices && typeof decision.fieldChoices === "object" ? decision.fieldChoices : {}) as Record<string, unknown>;
  for (const field of Object.keys(fieldChoices)) {
    if (!fields.includes(field) || CONFLICT_PROTECTED_FIELDS.has(field)) throw new Error(`Konfliktfeld ist nicht auswählbar: ${field}`);
    if (fieldChoices[field] !== "local" && fieldChoices[field] !== "remote") throw new Error(`Auswahl für ${field} ist ungültig.`);
  }
  const missing = fields.filter((field) => fieldChoices[field] !== "local" && fieldChoices[field] !== "remote");
  if (missing.length) throw new Error("Bitte entscheide jedes geänderte Feld.");
  return { action, fieldChoices: Object.fromEntries(fields.map((field) => [field, fieldChoices[field]])), localValue, remoteValue, fields, tombstone };
}

function chosenConflictRow(normalized: ConflictDecision) {
  if (normalized.action === "keep-local") return { ...normalized.localValue };
  if (normalized.action === "keep-remote") return { ...normalized.remoteValue };
  if (normalized.action !== "merge-fields") return null;
  const chosen = { ...normalized.remoteValue };
  for (const field of normalized.fields) chosen[field] = normalized.fieldChoices[field] === "local" ? normalized.localValue[field] : normalized.remoteValue[field];
  return chosen;
}

async function persistConflictChoice(client: CloudClient, user: CloudUser, conflictRow: SyncConflictRow, normalized: ConflictDecision, { deviceId, resolvedAt }: { deviceId: string; resolvedAt: string }) {
  const entityTable = conflictRow.entity_table;
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Konfliktauflösung ist für ${entityTable} nicht unterstützt.`);
  const currentRemote = await selectRowById(client, entityTable, user.id, conflictRow.entity_id, entityRows(entityTable));
  let chosen = chosenConflictRow(normalized);
  const chosenMissing = Boolean(chosen && Object.keys(chosen).length === 0);
  if (chosen && !chosenMissing && !chosen.deleted_at) chosen = preserveRemoteLearningProjection(entityTable, chosen, currentRemote);
  const expectedRemoteRevision = conflictRow.remote_revision == null ? null : normalizeRevision(conflictRow.remote_revision);
  const currentRemoteRevision = currentRemote?.revision == null ? null : normalizeRevision(currentRemote.revision);
  const alreadyApplied = Boolean(currentRemote && chosen && rowsHaveSameContent(chosen, currentRemote, conflictRow.entity_table));
  if (currentRemoteRevision !== expectedRemoteRevision && !alreadyApplied) throw new SyncConflictChangedError();

  if (normalized.action === "keep-remote") return currentRemote;
  if (alreadyApplied) return currentRemote;
  if (chosenMissing || chosen?.deleted_at) {
    if (!currentRemote || currentRemote.deleted_at) return currentRemote;
    await softDeleteEntityForUser(client, user, {
      entityTable,
      entityId: conflictRow.entity_id,
      baseRevision: currentRemoteRevision,
      deletedAt: chosen?.deleted_at ?? resolvedAt,
    }, { deviceId, flushedAt: resolvedAt });
    return selectRowById(client, entityTable, user.id, conflictRow.entity_id, entityRows(entityTable));
  }

  const candidate = {
    ...chosen,
    id: conflictRow.entity_id,
    user_id: user.id,
    created_at: chosen?.created_at ?? currentRemote?.created_at ?? resolvedAt,
    revision: currentRemoteRevision == null ? 1 : currentRemoteRevision + 1,
    updated_by_device_id: deviceId,
    updated_at: resolvedAt,
  };
  if (!currentRemote) {
    const { data, error } = await cloudTable(client, entityTable).insert(candidate).select("*");
    if (error) throw error;
    return entityRows(entityTable)(data ?? [])[0] ?? null;
  }
  const payload = updatePayload(candidate, { revision: candidate.revision, deviceId, now: () => resolvedAt });
  const { data, error } = await cloudTable(client, entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", conflictRow.entity_id)
    .eq("revision", currentRemoteRevision)
    .select("*");
  if (error) throw error;
  const [updated] = entityRows(entityTable)(data ?? []);
  if (!updated) throw new SyncConflictChangedError();
  return updated;
}

async function updateConflictResolution(client: CloudClient, user: CloudUser, conflictRow: SyncConflictRow, normalized: ConflictDecision, { deviceId, resolvedAt }: { deviceId: string; resolvedAt: string }) {
  const ignored = normalized.action === "ignore";
  const reopened = normalized.action === "reopen";
  const payload = {
    status: ignored ? "ignored" : reopened ? "open" : "resolved",
    resolution: reopened ? {} : { action: normalized.action, fieldChoices: normalized.fieldChoices },
    resolved_at: ignored || reopened ? null : resolvedAt,
    updated_by_device_id: deviceId,
  };
  const { data, error } = await cloudTable(client, "sync_conflicts")
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", conflictRow.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Der Synchronisierungskonflikt wurde nicht gefunden.");
  return validateSyncConflictRows([data])[0];
}

export async function resolveAccountSyncConflict(
  client: CloudClient,
  conflictId: unknown,
  decision: { action?: unknown; fieldChoices?: unknown },
  options: { userId?: string; deviceId?: string; resolvedAt?: string } = {},
) {
  const user = await authenticatedUserForKnownSession(client, options.userId);
  const id = requireNonEmptyString(conflictId, "Konflikt-ID fehlt.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  const resolvedAt = requireTimestamp(options.resolvedAt, nowIso, "Konfliktzeitpunkt ist ungültig.");
  const conflictRow = await selectRowById(client, "sync_conflicts", user.id, id, validateSyncConflictRows);
  if (!conflictRow) throw new Error("Der Synchronisierungskonflikt wurde nicht gefunden.");
  const normalized = normalizeConflictDecision(decision, conflictRow);

  if (conflictRow.status === "resolved") {
    return {
      conflict: createConflictProjection(conflictRow),
      resolvedPage: null,
      resolutionTarget: { table: conflictRow.entity_table, entityId: conflictRow.entity_id, action: normalized.action },
      resolved: true,
    };
  }
  if (normalized.action === "reopen" && conflictRow.status !== "ignored") throw new Error("Nur zurückgestellte Konflikte können wieder aufgenommen werden.");

  const persisted = !["ignore", "reopen"].includes(normalized.action)
    ? await persistConflictChoice(client, user, conflictRow, normalized, { deviceId, resolvedAt })
    : null;
  const updatedConflict = await updateConflictResolution(client, user, conflictRow, normalized, { deviceId, resolvedAt });
  return {
    conflict: createConflictProjection(updatedConflict),
    resolvedPage: persisted ? {
      table: conflictRow.entity_table,
      entities: projectCloudEntities(conflictRow.entity_table as AccountTable, [persisted]),
      reset: false,
    } : null,
    resolutionTarget: { table: conflictRow.entity_table, entityId: conflictRow.entity_id, action: normalized.action },
    resolved: !["ignore", "reopen"].includes(normalized.action),
  };
}

/** Takes back a review (`undo_review_atomic`): the payload carries the event and the study state from before it. */
export async function undoAtomicReview(client: CloudClient, input: AtomicReviewPayload, { deviceId, mutationId }: { deviceId?: string; mutationId?: string } = {}) {
  const card = input?.card;
  const variant = input?.variant;
  const event = input?.event as ReviewEvent;
  const { data, error } = await client.rpc("undo_review_atomic", {
    p_event_id: event?.id,
    p_card_id: card?.id ?? event?.cardId,
    p_study: card ? studyToCloudColumns(card.study) : {},
    p_card_updated_at: card?.updatedAt ?? null,
    p_variant_id: variant?.id ?? null,
    p_variant_performance: variant ? toJson(variant.performance, {}) : null,
    p_variant_updated_at: variant?.updatedAt ?? null,
    p_device_id: deviceId,
  });
  if (error) {
    const code = String(error.code ?? "");
    if (code === "PGRST202" || code === "42883" || /undo_review_atomic|function.*does not exist/i.test(String(error.message ?? ""))) {
      const unavailable = new Error("Das Zurücknehmen von Bewertungen ist auf dem Server noch nicht verfügbar. Die lokale Änderung bleibt vorgemerkt.") as Error & { code: string };
      unavailable.code = "review_rpc_unavailable";
      throw unavailable;
    }
    throw error;
  }
  const response = requireJsonRecord(data, "Die Antwort auf das Zurücknehmen hatte ein ungültiges Format.");
  const rows = {
    card: validateAccountRows("cards", [response.card])[0],
    variant: response.variant == null ? null : validateAccountRows("card_variants", [response.variant])[0],
  };
  return {
    acknowledgedMutationId: mutationId,
    rows,
    entities: {
      card: cardFromRow(rows.card),
      variant: rows.variant ? variantFromRow(rows.variant) : null,
    },
  };
}
