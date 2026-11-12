// Private to cloudRepository.ts: row comparison, marking and listing of sync conflicts with their projection.
import { validateSyncConflictRows, type AccountTable, type SyncConflictRow } from "./cloudRepositoryValidation.ts";
import {
  type CloudRow,
  type CloudUser,
  type CloudClient,
  cloudTable,
  ACCOUNT_UPSERT_CONFLICT,
  REVISIONED_TABLE_SET,
  nowIso,
  normalizeRevision,
  getAuthenticatedUser,
  authenticatedUserForKnownSession,
  requireNonEmptyString,
  requireTimestamp,
  selectKeysetRows,
  selectRowsByField,
  selectRowById,
  requireBaseRevision,
} from "./cloudQueries.ts";

const ROW_IDENTITY_FIELDS = new Set(["id", "user_id", "created_at", "updated_at", "sync_change_id", "revision", "updated_by_device_id"]);
const COMPARABLE_TIMESTAMP_FIELDS = new Set(["answered_at", "deleted_at", "due_at", "last_reviewed_at"]);
export const CARD_STUDY_FIELDS = [
  "state", "due_at", "stability", "difficulty", "reps", "lapses", "interval_days", "learning_step_index",
  "last_reviewed_at", "last_rating", "leeched_at", "study_extra", "source_scheduler", "study_revision",
];
const TECHNICAL_CONTENT_FIELDS_BY_TABLE: Record<string, Set<string>> = {
  decks: new Set(["hierarchy_path"]),
  notes: new Set(["search_text", "search_fields", "sort_text"]),
  cards: new Set(CARD_STUDY_FIELDS),
  card_variants: new Set(["performance", "content_hash"]),
};
export const CONFLICT_PROTECTED_FIELDS = new Set([
  ...ROW_IDENTITY_FIELDS,
  ...CARD_STUDY_FIELDS,
  "deck_id",
  "card_id",
  "note_id",
  "prompt_key",
  "anki_card_id",
  "anki_guid",
  "anki_deck_id",
  "note_type_source_id",
  "translator_id",
  "translator_version",
  "content_revision",
  "imported_content_revision",
  "imported_tags",
  "parent_deck_id",
  "model_run_id",
  "hierarchy_path",
  "search_text",
  "search_fields",
  "sort_text",
  "performance",
  "content_hash",
]);

export const CONFLICT_ACTIONS = new Set(["keep-local", "keep-remote", "merge-fields", "ignore", "reopen"]);
const CONFLICT_ENTITY_LABELS = Object.freeze({
  decks: "Stapel",
  notes: "Inhalt",
  cards: "Karte",
  card_variants: "Variante",
  note_type_sources: "Anki-Vorlage",
  note_sources: "Anki-Felder",
});
const CONFLICT_FIELD_LABELS = Object.freeze({
  name: "Name",
  description: "Beschreibung",
  deck_settings: "Stapeleinstellungen",
  content: "Inhalt",
  media: "Medien",
  marked: "Markierung",
  status: "Status",
  anki_flag: "Flagge",
  source: "Quelle",
  definition: "Anki-Vorlage",
  fields: "Anki-Felder",
  front: "Vorderseite",
  back: "Rückseite",
  variant_level: "Variantenstufe",
  is_active: "Aktiv",
  transform_profile: "Transformationsprofil",
  explanation: "Erklärung",
  semantic_delta: "Semantische Abweichung",
  changed_recognition_cues: "Geänderte Erkennungshinweise",
  quality_status: "Qualitätsstatus",
  feedback: "Feedback",
  meta: "Metadaten",
});

class CloudRevisionConflictError extends Error {
  readonly code = "cloud_revision_conflict";
  readonly entityTable: string;
  readonly entityId: string;
  readonly baseRevision: number | null;
  readonly localRevision: number | null;
  readonly remoteRevision: number | null;
  readonly remoteDeleted: boolean;
  readonly localValue: Record<string, unknown>;
  readonly remoteValue: Record<string, unknown>;
  readonly conflict: unknown;

  constructor({ entityTable, entityId, baseRevision = null, localRevision = null, remoteRevision = null, remoteDeleted = false, localValue = {}, remoteValue = {}, conflict = null }: {
    entityTable?: string;
    entityId?: string;
    baseRevision?: number | null;
    localRevision?: number | null;
    remoteRevision?: number | null;
    remoteDeleted?: boolean;
    localValue?: CloudRow;
    remoteValue?: CloudRow;
    conflict?: unknown;
  } = {}) {
    super("Auf einem anderen Gerät liegt bereits eine neuere Version vor. Bitte lade die Cloud-Daten neu.");
    this.name = "CloudRevisionConflictError";
    this.entityTable = entityTable ?? "unknown";
    this.entityId = entityId ?? "unknown";
    this.baseRevision = baseRevision;
    this.localRevision = localRevision;
    this.remoteRevision = remoteRevision;
    this.remoteDeleted = Boolean(remoteDeleted);
    this.localValue = localValue;
    this.remoteValue = remoteValue;
    this.conflict = conflict;
  }
}

export class SyncConflictChangedError extends Error {
  readonly code = "sync_conflict_changed";

  constructor() {
    super("Der Remote-Stand hat sich erneut geändert. Bitte lade die Konflikte neu.");
    this.name = "SyncConflictChangedError";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue((value as CloudRow)[key])]));
}

function jsonValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left ?? null)) === JSON.stringify(stableValue(right ?? null));
}

function normalizeComparableTimestamp(value: unknown) {
  if (typeof value !== "string") return value;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? value : new Date(milliseconds).toISOString();
}

function comparableRow(row: CloudRow = {}, entityTable = "") {
  const tableFields = TECHNICAL_CONTENT_FIELDS_BY_TABLE[entityTable] ?? new Set<string>();
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !ROW_IDENTITY_FIELDS.has(key) && !tableFields.has(key))
      .map(([key, value]) => [key, COMPARABLE_TIMESTAMP_FIELDS.has(key) ? normalizeComparableTimestamp(value) : value]),
  );
}

export function rowsHaveSameContent(left: CloudRow, right: CloudRow, entityTable = "") {
  return JSON.stringify(stableValue(comparableRow(left, entityTable))) === JSON.stringify(stableValue(comparableRow(right, entityTable)));
}

export function conflictValue(row: object = {}): CloudRow {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "user_id"));
}

export function isTombstoneConflict(localValue: CloudRow, remoteValue: CloudRow) {
  return Boolean(localValue.deleted_at || remoteValue.deleted_at || Object.keys(localValue).length === 0 || Object.keys(remoteValue).length === 0);
}

export function conflictFieldKeys(localValue: CloudRow = {}, remoteValue: CloudRow = {}) {
  return [...new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])]
    .filter((field) => !CONFLICT_PROTECTED_FIELDS.has(field) && field !== "deleted_at")
    .filter((field) => !jsonValuesEqual(localValue[field], remoteValue[field]))
    .sort((left, right) => ((CONFLICT_FIELD_LABELS as Record<string, string>)[left] ?? left).localeCompare((CONFLICT_FIELD_LABELS as Record<string, string>)[right] ?? right, "de"));
}

function formatConflictDisplayValue(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}…` : value;
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 700 ? `${serialized.slice(0, 697)}…` : serialized;
}

function conflictEntityTitle(row: SyncConflictRow) {
  const local = row.local_value;
  const remote = row.remote_value;
  return local.name ?? remote.name ?? (local.sort_text || null) ?? (remote.sort_text || null) ?? local.front ?? remote.front ?? row.entity_id;
}

export function createConflictProjection(row: SyncConflictRow) {
  const localValue = conflictValue(row.local_value);
  const remoteValue = conflictValue(row.remote_value);
  const tombstone = isTombstoneConflict(localValue, remoteValue);
  const fields = conflictFieldKeys(localValue, remoteValue).map((field) => ({
    key: field,
    label: (CONFLICT_FIELD_LABELS as Record<string, string>)[field] ?? field,
    localText: formatConflictDisplayValue(localValue[field]),
    remoteText: formatConflictDisplayValue(remoteValue[field]),
  }));
  return {
    id: row.id,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    cardId: row.entity_table === "cards"
      ? row.entity_id
      : row.entity_table === "card_variants"
        ? localValue.card_id ?? remoteValue.card_id ?? null
        : null,
    noteId: row.entity_table === "notes" ? row.entity_id : null,
    entityLabel: (CONFLICT_ENTITY_LABELS as Record<string, string>)[row.entity_table] ?? "Inhalt",
    title: String(conflictEntityTitle(row)),
    baseRevision: row.base_revision,
    localRevision: row.local_revision,
    remoteRevision: row.remote_revision,
    status: row.status,
    fields,
    tombstone,
    localPresent: Object.keys(localValue).length > 0 && !localValue.deleted_at,
    remotePresent: Object.keys(remoteValue).length > 0 && !remoteValue.deleted_at,
    allowedActions: tombstone
      ? ["keep-local", "keep-remote", "ignore"]
      : ["keep-local", "keep-remote", "merge-fields", "ignore"],
    resolution: row.resolution ?? {},
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function conflictIdFor({ entityTable, entityId, baseRevision, remoteRevision }: { entityTable: string; entityId: string; baseRevision: number | null; remoteRevision: number | null }) {
  return ["sync-conflict", entityTable, entityId, baseRevision ?? "new", remoteRevision ?? "missing"].map((value) => encodeURIComponent(String(value))).join(":");
}

interface ConflictMarkInput {
  entityTable?: unknown;
  entityId?: unknown;
  baseRevision?: unknown;
  localRevision?: unknown;
  remoteRevision?: unknown;
  localValue?: CloudRow;
  remoteValue?: CloudRow;
}

async function markConflictForUser(client: CloudClient, user: CloudUser, input: ConflictMarkInput = {}, { deviceId, createdAt }: { deviceId?: string; createdAt?: string } = {}) {
  const entityTable = requireNonEmptyString(input.entityTable, "Konflikttabelle fehlt.");
  const entityId = requireNonEmptyString(input.entityId, "Konfliktentität fehlt.");
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const resolvedCreatedAt = requireTimestamp(createdAt, nowIso, "Konfliktzeitpunkt ist ungültig.");
  const baseRevision = input.baseRevision == null ? null : requireBaseRevision(input.baseRevision);
  const localRevision = input.localRevision == null ? null : normalizeRevision(input.localRevision);
  const remoteRevision = input.remoteRevision == null ? null : normalizeRevision(input.remoteRevision);
  const { data: existingRows, error: existingError } = await cloudTable(client, "sync_conflicts")
    .select("*")
    .eq("user_id", user.id)
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);
  if (existingError) throw existingError;
  const existing = validateSyncConflictRows(existingRows ?? [])
    .filter((candidate) => candidate.status === "open" || candidate.status === "ignored")
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0];
  const id = existing?.id ?? conflictIdFor({ entityTable, entityId, baseRevision, remoteRevision });
  const row = {
    id,
    user_id: user.id,
    entity_table: entityTable,
    entity_id: entityId,
    base_revision: baseRevision,
    local_revision: localRevision,
    remote_revision: remoteRevision,
    local_value: conflictValue(input.localValue),
    remote_value: conflictValue(input.remoteValue),
    status: "open",
    resolution: {},
    updated_by_device_id: resolvedDeviceId,
    created_at: resolvedCreatedAt,
  };
  const { error } = await cloudTable(client, "sync_conflicts").upsert(row, {
    onConflict: ACCOUNT_UPSERT_CONFLICT,
  });
  let persistedId = id;
  if (error && String(error.code ?? "") === "23505") {
    const { data: racedRows, error: racedError } = await cloudTable(client, "sync_conflicts")
      .select("*")
      .eq("user_id", user.id)
      .eq("entity_table", entityTable)
      .eq("entity_id", entityId);
    if (racedError) throw racedError;
    const raced = validateSyncConflictRows(racedRows ?? []).find((candidate) => candidate.status === "open" || candidate.status === "ignored");
    if (!raced) throw error;
    persistedId = raced.id;
    const { error: updateError } = await cloudTable(client, "sync_conflicts").upsert({ ...row, id: persistedId }, { onConflict: ACCOUNT_UPSERT_CONFLICT });
    if (updateError) throw updateError;
  } else if (error) {
    throw error;
  }
  const persisted = await selectRowById(client, "sync_conflicts", user.id, persistedId, validateSyncConflictRows);
  if (!persisted) throw new Error("Der Synchronisierungskonflikt konnte nicht bestätigt werden.");
  return createConflictProjection(persisted);
}

export async function throwRevisionConflict(client: CloudClient, user: CloudUser, { entityTable, entityId, baseRevision, localValue, remoteValue, deviceId, createdAt }: {
  entityTable: string;
  entityId: string;
  baseRevision: number | null;
  localValue: CloudRow;
  remoteValue: CloudRow;
  deviceId: string;
  createdAt: string;
}): Promise<never> {
  const remoteRevision = remoteValue?.revision == null ? null : normalizeRevision(remoteValue.revision);
  const localRevision = localValue?.revision == null ? baseRevision : normalizeRevision(localValue.revision);
  const conflict = await markConflictForUser(client, user, {
    entityTable,
    entityId,
    baseRevision,
    localRevision,
    remoteRevision,
    localValue,
    remoteValue,
  }, { deviceId, createdAt });
  throw new CloudRevisionConflictError({
    entityTable,
    entityId,
    baseRevision,
    localRevision,
    remoteRevision,
    remoteDeleted: Boolean(remoteValue?.deleted_at),
    localValue: conflictValue(localValue),
    remoteValue: conflictValue(remoteValue),
    conflict,
  });
}

export async function markConflict(client: CloudClient, input: ConflictMarkInput, options: { deviceId?: string; createdAt?: string } = {}) {
  const user = await getAuthenticatedUser(client);
  return markConflictForUser(client, user, input, options);
}

function conflictTargetKey(row: SyncConflictRow) {
  return `${row.entity_table}\u0000${row.entity_id}`;
}

async function selectCurrentConflictRows(client: CloudClient, userId: string, rows: SyncConflictRow[]) {
  const idsByTable = new Map<AccountTable, string[]>();
  for (const row of rows) {
    const table = row.entity_table as AccountTable;
    idsByTable.set(table, [...(idsByTable.get(table) ?? []), row.entity_id]);
  }
  const selections = await Promise.all([...idsByTable].map(async ([table, ids]) => [
    table,
    await selectRowsByField(client, table, userId, "id", ids),
  ] as const));
  return new Map<string, CloudRow>(selections.flatMap(([table, currentRows]) => currentRows.map((row) => [`${table}\u0000${row.id}`, row])));
}

async function refreshConflictRemote(client: CloudClient, userId: string, row: SyncConflictRow, currentRemote: CloudRow | null) {
  const currentRevision = currentRemote?.revision == null ? null : normalizeRevision(currentRemote.revision);
  const savedRevision = row.remote_revision == null ? null : normalizeRevision(row.remote_revision);
  if (currentRevision === savedRevision) return { row, checked: true, currentRemote };
  const { data, error } = await cloudTable(client, "sync_conflicts")
    .update({ remote_value: conflictValue(currentRemote ?? {}), remote_revision: currentRevision })
    .eq("user_id", userId)
    .eq("id", row.id)
    .select("*");
  if (error) throw error;
  return {
    row: validateSyncConflictRows(data ?? [])[0] ?? { ...row, remote_value: conflictValue(currentRemote ?? {}), remote_revision: currentRevision },
    checked: true,
    currentRemote,
  };
}

async function closeObsoleteConflict(client: CloudClient, userId: string, row: SyncConflictRow, remoteSnapshot: { checked: boolean; currentRemote: CloudRow | null } = { checked: false, currentRemote: null }) {
  const localValue = conflictValue(row.local_value);
  const remoteValue = conflictValue(row.remote_value);
  let obsolete = rowsHaveSameContent(localValue, remoteValue, row.entity_table);
  if (!obsolete && remoteSnapshot.checked) obsolete = Boolean(remoteSnapshot.currentRemote && rowsHaveSameContent(localValue, remoteSnapshot.currentRemote, row.entity_table));
  if (!obsolete) return row;
  const resolvedAt = nowIso();
  const { data, error } = await cloudTable(client, "sync_conflicts")
    .update({ status: "resolved", resolution: { action: "automatic-repair" }, resolved_at: resolvedAt })
    .eq("user_id", userId)
    .eq("id", row.id)
    .select("*");
  if (error) throw error;
  return validateSyncConflictRows(data ?? [])[0] ?? { ...row, status: "resolved" as const, resolved_at: resolvedAt };
}

export async function listAccountSyncConflicts(client: CloudClient, { refreshRemote = false, userId }: { refreshRemote?: boolean; userId?: string } = {}) {
  const user = await authenticatedUserForKnownSession(client, userId);
  const activeRows = (await selectKeysetRows(client, "sync_conflicts", user.id, validateSyncConflictRows, { optional: true }))
    .filter((row) => row.status === "open" || row.status === "ignored");
  const rowsToCheck = activeRows.filter((row) => REVISIONED_TABLE_SET.has(row.entity_table) && (
    refreshRemote || !rowsHaveSameContent(conflictValue(row.local_value), conflictValue(row.remote_value), row.entity_table)
  ));
  const checkedTargets = new Set(rowsToCheck.map(conflictTargetKey));
  const currentRows = await selectCurrentConflictRows(client, user.id, rowsToCheck);
  const snapshots = await Promise.all(activeRows.map(async (row) => {
    const checked = checkedTargets.has(conflictTargetKey(row));
    const currentRemote = currentRows.get(conflictTargetKey(row)) ?? null;
    return refreshRemote && checked
      ? refreshConflictRemote(client, user.id, row, currentRemote)
      : { row, checked, currentRemote };
  }));
  const rows = await Promise.all(snapshots.map(({ row, ...snapshot }) => closeObsoleteConflict(client, user.id, row, snapshot)));
  const statusOrder: Record<string, number> = { open: 0, ignored: 1 };
  return rows
    .filter((row) => row.status === "open" || row.status === "ignored")
    .sort((left, right) => (statusOrder[left.status] - statusOrder[right.status]) || String(right.created_at).localeCompare(String(left.created_at)))
    .map(createConflictProjection);
}
