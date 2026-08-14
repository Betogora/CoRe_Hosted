import { createCloudProfile, saveCloudProfile } from "./cloudAuth.ts";
import { createCoreDeck } from "./coreModel.ts";
import type { ImportVerificationRepairScope, ImportVerificationScope } from "./coreTypes.ts";
import { validateAccountRows, validateIdRows, validateMediaAssetRows, validateProfileRows, type AccountTable, type MediaAssetRow } from "./cloudRepositoryValidation.ts";

const ACCOUNT_UPSERT_CONFLICT = "user_id,id";

function mediaAssetFromRow(row: MediaAssetRow) {
  return {
    id: row.id, userId: row.user_id, deckId: row.deck_id!, cardId: row.card_id,
    sha1: row.sha1, size: row.size, mimeType: row.mime_type, originalName: row.original_name,
    storageBucket: row.storage_bucket, storagePath: row.storage_path, source: row.source,
    metadata: row.metadata as Record<string, unknown>, createdAt: row.created_at,
    updatedAt: row.updated_at, deletedAt: row.deleted_at,
  };
}

const ACCOUNT_TABLES = ["decks", "note_type_definitions", "cards", "card_variants", "learning_item_source_snapshots", "review_events", "source_documents"];
const REVISIONED_TABLES = ["source_documents", "decks", "note_type_definitions", "cards", "card_variants"];
const REVISIONED_TABLE_SET = new Set(REVISIONED_TABLES);
const TABLES_WITH_UPDATED_AT = new Set(["source_documents", "decks", "note_type_definitions", "cards", "card_variants"]);
const CARD_MODEL_META_KEY = "__coreModel";
const REVIEW_EVENT_META_KEY = "__coreReview";
const DELETE_ORDER = ["review_events", "card_variants", "learning_item_source_snapshots", "cards", "decks", "note_type_definitions", "source_documents"];
const ROW_IDENTITY_FIELDS = new Set(["id", "user_id", "created_at", "updated_at", "sync_change_id", "revision", "updated_by_device_id"]);
const COMPARABLE_TIMESTAMP_FIELDS = new Set(["answered_at", "deleted_at"]);
const TECHNICAL_CONTENT_FIELDS = new Set(["local_owner_id", "version_log", "content_hash"]);
const TECHNICAL_CONTENT_FIELDS_BY_TABLE: Record<string, Set<string>> = {
  decks: new Set(["card_count", "hierarchy_path", "import_meta"]),
  cards: new Set(["content_revision", "review_state", "core_state"]),
  card_variants: new Set(["review_state", "performance", "render_revision"]),
};
const CLOUD_DELETE_BATCH_SIZE = 100;
const CLOUD_PAGE_SIZE = 500;
const CLOUD_WRITE_ROW_LIMIT = 250;
const CLOUD_WRITE_BYTE_LIMIT = 1024 * 1024;
const CLOUD_WRITE_CONCURRENCY = 4;
const DELTA_CURSOR_COLUMN = "sync_change_id";
const EMPTY_DELTA_CURSOR_VALUE = "0";
const CONFLICT_PROTECTED_FIELDS = new Set([
  ...ROW_IDENTITY_FIELDS,
  ...TECHNICAL_CONTENT_FIELDS,
  "deck_id",
  "card_id",
  "note_type_definition_id",
  "latest_source_snapshot_id",
  "study_deck_id",
  "source_card_id",
  "local_owner_id",
  "parent_deck_id",
  "original_deck_id",
  "parent_variant_id",
  "anchor_variant_id",
  "model_run_id",
  "card_count",
  "hierarchy_path",
  "import_meta",
  "content_revision",
  "review_state",
  "core_state",
  "performance",
  "render_revision",
]);

const CONFLICT_ACTIONS = new Set(["keep-local", "keep-remote", "merge-fields", "ignore", "reopen"]);
const CONFLICT_ENTITY_LABELS = Object.freeze({
  decks: "Stapel",
  note_type_definitions: "Notiztyp",
  cards: "Karte",
  card_variants: "Variante",
  source_documents: "Dokument",
});
const CONFLICT_FIELD_LABELS = Object.freeze({
  name: "Name",
  description: "Beschreibung",
  parent_deck_id: "Übergeordneter Stapel",
  hierarchy_path: "Stapelpfad",
  tags: "Tags",
  import_meta: "Importdaten",
  deck_settings: "Stapeleinstellungen",
  definition: "Notiztypdefinition",
  version_log: "Versionsverlauf",
  kind: "Kartentyp",
  note_type_definition_id: "Notiztyp",
  content_document: "Inhaltsdokument",
  latest_source_snapshot_id: "Quell-Snapshot",
  content_revision: "Inhaltsrevision",
  draft_status: "Entwurfsstatus",
  status: "Status",
  original_front: "Vorderseite",
  original_back: "Rückseite",
  original_fields: "Originalfelder",
  original_tags: "Original-Tags",
  original_html: "Originalformatierung",
  immutable_original: "Originalanker",
  media_refs: "Medien",
  source_anchors: "Quellenanker",
  content_hash: "Inhaltsprüfsumme",
  review_state: "Lernstand",
  core_state: "CoRe-Status",
  meta: "Metadaten",
  front: "Vorderseite",
  back: "Rückseite",
  variant_type: "Variantentyp",
  variant_level: "Variantenstufe",
  generation_source: "Erstellungsquelle",
  parent_variant_id: "Ausgangsvariante",
  anchor_variant_id: "Originalanker",
  is_original: "Originalvariante",
  is_active: "Aktiv",
  transform_type: "Transformation",
  transform_profile: "Transformationsprofil",
  explanation: "Erklärung",
  hints_json: "Hinweise",
  answer_options_json: "Antwortoptionen",
  expected_answer_json: "Erwartete Antwort",
  confidence: "Konfidenz",
  semantic_delta: "Semantische Abweichung",
  changed_recognition_cues: "Geänderte Erkennungshinweise",
  quality_status: "Qualitätsstatus",
  projection: "Variantenprojektion",
  scheduling_mode: "Planungsmodus",
  study_deck_id: "Lernstapel",
  render_revision: "Darstellungsrevision",
  performance: "Leistungsdaten",
  feedback: "Feedback",
  file_name: "Dateiname",
  mime_type: "Dateityp",
  text: "Dokumenttext",
  storage_url: "Speicherreferenz",
  text_extraction_status: "Texterkennung",
  metadata: "Dokumentmetadaten",
});

function nowIso() {
  return new Date().toISOString();
}

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

  constructor({ entityTable, entityId, baseRevision = null, localRevision = null, remoteRevision = null, remoteDeleted = false, localValue = {}, remoteValue = {}, conflict = null }: any = {}) {
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

function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function toJson(value: any, fallback: any) {
  return value == null ? fallback : value;
}

function toObject(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cardMetaToCloud(card: any) {
  return {
    ...toObject(card.meta),
    [CARD_MODEL_META_KEY]: {
      schemaVersion: 1,
      title: card.title ?? "",
      canonicalQuestion: card.canonicalQuestion ?? card.originalFront ?? "",
      canonicalAnswer: card.canonicalAnswer ?? card.originalBack ?? "",
      tags: toArray(card.tags ?? card.originalTags),
      concepts: toArray(card.concepts),
      sourceType: card.sourceType ?? null,
      sourceRefId: card.sourceRefId ?? null,
    },
  };
}

function cardMetaFromCloud(value: any) {
  const storedMeta = toObject(value);
  const { [CARD_MODEL_META_KEY]: model = {}, ...meta } = storedMeta;
  return { meta, model: toObject(model) };
}

function reviewFlagsToCloud(event: any, projection: any) {
  const { [REVIEW_EVENT_META_KEY]: _reserved, ...flags } = toObject(event.flags);
  const model: Record<string, any> = {};
  const storeIfDistinct = (key: any, value: any, fallback: any = null) => {
    if (value != null && !jsonValuesEqual(value, fallback)) model[key] = value;
  };
  const schedulerParams = event.schedulerParamsJson ?? projection.schedulerAfter?.card?.schedulerParamsJson ?? null;

  storeIfDistinct("learningItemId", event.learningItemId, projection.sourceCardId);
  storeIfDistinct("cardId", event.cardId, event.learningItemId ?? projection.sourceCardId);
  storeIfDistinct("cardVariantId", event.cardVariantId, projection.reviewableId);
  storeIfDistinct("variantId", event.variantId, event.cardVariantId ?? projection.reviewableId);
  storeIfDistinct("reviewedAt", event.reviewedAt, projection.answeredAt);
  storeIfDistinct("variantLevel", event.variantLevel, schedulerParams?.variantLevel);
  storeIfDistinct("variantType", event.variantType, schedulerParams?.variantType);
  storeIfDistinct("previousLearningItemStateJson", event.previousLearningItemStateJson, projection.schedulerBefore?.card);
  storeIfDistinct("nextLearningItemStateJson", event.nextLearningItemStateJson, projection.schedulerAfter?.card);
  storeIfDistinct("schedulerVersion", event.schedulerVersion, schedulerParams?.schedulerVersion);
  storeIfDistinct("schedulerParamsJson", event.schedulerParamsJson, projection.schedulerAfter?.card?.schedulerParamsJson);
  storeIfDistinct("anchorVariantId", event.anchorVariantId);
  storeIfDistinct("anchorSnapshotJson", event.anchorSnapshotJson);
  storeIfDistinct("fallbackInfo", event.fallbackInfo);

  return Object.keys(model).length > 0
    ? { ...flags, [REVIEW_EVENT_META_KEY]: { schemaVersion: 1, ...model } }
    : flags;
}

function reviewFlagsFromCloud(value: any) {
  const storedFlags = toObject(value);
  const { [REVIEW_EVENT_META_KEY]: model = {}, ...flags } = storedFlags;
  return { flags, model: toObject(model) };
}

function normalizeRevision(value: any, fallback: any = 1) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : fallback;
}

function syncFields(entity: any = {}) {
  return {
    revision: normalizeRevision(entity.revision),
    deleted_at: entity.deletedAt ?? null,
    updated_by_device_id: entity.updatedByDeviceId ?? null,
  };
}

function syncMetadataFromRow(row: any = {}) {
  return {
    revision: normalizeRevision(row.revision),
    deletedAt: row.deleted_at ?? null,
    updatedByDeviceId: row.updated_by_device_id ?? null,
  };
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key: any) => [key, stableValue(value[key])]));
}

function jsonValuesEqual(left: any, right: any) {
  return JSON.stringify(stableValue(left ?? null)) === JSON.stringify(stableValue(right ?? null));
}

function normalizeComparableTimestamp(value: unknown) {
  if (typeof value !== "string") return value;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? value : new Date(milliseconds).toISOString();
}

function comparableRow(row: any = {}, entityTable = "") {
  const tableFields = TECHNICAL_CONTENT_FIELDS_BY_TABLE[entityTable] ?? new Set<string>();
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]: any) => !ROW_IDENTITY_FIELDS.has(key) && !TECHNICAL_CONTENT_FIELDS.has(key) && !tableFields.has(key))
      .map(([key, value]) => [key, COMPARABLE_TIMESTAMP_FIELDS.has(key) ? normalizeComparableTimestamp(value) : value]),
  );
}

function rowsHaveSameContent(left: any, right: any, entityTable = "") {
  return JSON.stringify(stableValue(comparableRow(left, entityTable))) === JSON.stringify(stableValue(comparableRow(right, entityTable)));
}

function conflictValue(row: any = {}) {
  return Object.fromEntries(Object.entries(row).filter(([key]: any) => key !== "user_id"));
}

function conflictValuesEqual(left: any, right: any) {
  return jsonValuesEqual(left, right);
}

function conflictFieldKeys(localValue: any = {}, remoteValue: any = {}) {
  return [...new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])]
    .filter((field: any) => !CONFLICT_PROTECTED_FIELDS.has(field) && field !== "deleted_at")
    .filter((field: any) => !conflictValuesEqual(localValue[field], remoteValue[field]))
    .sort((left: any, right: any) => ((CONFLICT_FIELD_LABELS as Record<string, string>)[left] ?? left).localeCompare((CONFLICT_FIELD_LABELS as Record<string, string>)[right] ?? right, "de"));
}

function formatConflictDisplayValue(value: any) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}…` : value;
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 700 ? `${serialized.slice(0, 697)}…` : serialized;
}

function conflictEntityTitle(row: any = {}) {
  const local = row.local_value ?? {};
  const remote = row.remote_value ?? {};
  return local.name ?? remote.name ?? local.file_name ?? remote.file_name ?? local.original_front ?? remote.original_front ?? local.front ?? remote.front ?? row.entity_id;
}

function createConflictProjection(row: any = {}) {
  const localValue = conflictValue(row.local_value ?? {});
  const remoteValue = conflictValue(row.remote_value ?? {});
  const tombstone = Boolean(localValue.deleted_at || remoteValue.deleted_at || Object.keys(localValue).length === 0 || Object.keys(remoteValue).length === 0);
  const fields = conflictFieldKeys(localValue, remoteValue).map((field: any) => ({
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

function conflictIdFor({ entityTable, entityId, baseRevision, remoteRevision }: any) {
  return ["sync-conflict", entityTable, entityId, baseRevision ?? "new", remoteRevision ?? "missing"].map((value: any) => encodeURIComponent(String(value))).join(":");
}

function uniqueRowsById(rows: any) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function normalizeSource(source: any) {
  return source === "json_import" ? "json-import" : source || "manual";
}

function normalizeTransformType(transformType: any, isOriginal: any) {
  if (isOriginal) return "original";
  return transformType || "rephrase";
}

async function getAuthenticatedUser(client: any) {
  if (!client?.auth || !client?.from) throw new Error("Supabase ist noch nicht konfiguriert.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) {
    const missingSessionError = new Error("Bitte melde dich zuerst an.") as Error & { code: string };
    missingSessionError.code = "session_not_found";
    throw missingSessionError;
  }
  return data.user;
}

function requireNonEmptyString(value: any, message: any) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function requireTimestamp(value: any, fallback: any, message: any) {
  const timestamp = value ?? fallback();
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) throw new Error(message);
  return timestamp;
}

function serializedBytes(value: unknown) {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
}

function chunkRows(rows: any[] = []) {
  const chunks: any[][] = [];
  let chunk: any[] = [];
  let chunkBytes = 2;
  for (const row of rows) {
    const rowBytes = serializedBytes(row) + (chunk.length > 0 ? 1 : 0);
    if (rowBytes + 2 > CLOUD_WRITE_BYTE_LIMIT) {
      throw new Error("Eine einzelne Cloud-Zeile überschreitet das maximale Schreib-Payload von 1 MiB.");
    }
    if (chunk.length > 0 && (chunk.length >= CLOUD_WRITE_ROW_LIMIT || chunkBytes + rowBytes > CLOUD_WRITE_BYTE_LIMIT)) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 2;
    }
    chunk.push(row);
    chunkBytes += rowBytes;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency = CLOUD_WRITE_CONCURRENCY) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function upsertRows(client: any, table: any, rows: any[], options: any = {}) {
  const { concurrency = 1, ...upsertOptions } = options;
  await mapWithConcurrency(chunkRows(rows), async (chunk) => {
    const { error } = await client.from(table).upsert(chunk, { onConflict: ACCOUNT_UPSERT_CONFLICT, ...upsertOptions });
    if (error) throw error;
  }, concurrency);
}

async function selectKeysetRows(client: any, table: string, userId: string, columns = "*", { optional = false }: any = {}) {
  const rows: any[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = client.from(table).select(columns).eq("user_id", userId).order("id", { ascending: true }).limit(CLOUD_PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) {
      if (optional && (String(error?.code ?? "") === "42P01" || /does not exist|not exist/i.test(error?.message ?? ""))) return [];
      throw error;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < CLOUD_PAGE_SIZE) break;
    const nextCursor = String(page.at(-1)?.id ?? "");
    if (!nextCursor || nextCursor === cursor) throw new Error(`Cloud-Pagination für ${table} konnte nicht fortgesetzt werden.`);
    cursor = nextCursor;
  }
  return rows;
}

async function selectRows(client: any, table: AccountTable, userId: string, columns: string = "*"): Promise<any[]> {
  const data = await selectKeysetRows(client, table, userId, columns);
  if (columns !== "*") {
    return validateIdRows(data, table);
  }
  return validateAccountRows(table as AccountTable, data);
}

async function selectRowsByField(client: any, table: AccountTable, userId: string, field: string, values: string[]) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const rows: any[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += 100) {
    const batch = uniqueValues.slice(offset, offset + 100);
    let cursor: string | null = null;
    while (true) {
      let query = client
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .in(field, batch)
        .order("id", { ascending: true })
        .limit(CLOUD_PAGE_SIZE);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      const page = validateAccountRows(table, data ?? []);
      rows.push(...page);
      if (page.length < CLOUD_PAGE_SIZE) break;
      const nextCursor = String(page.at(-1)?.id ?? "");
      if (!nextCursor || nextCursor === cursor) throw new Error(`Cloud-Pagination für ${table} konnte nicht fortgesetzt werden.`);
      cursor = nextCursor;
    }
  }
  return uniqueRowsById(rows);
}

export class ImportGraphVerificationError extends Error {
  readonly code = "import_graph_incomplete";
  constructor(message: string, readonly repairScope: ImportVerificationRepairScope) {
    super(message);
    this.name = "ImportGraphVerificationError";
  }
}

function missingVerifiedRows(expectedIds: string[], rows: any[]) {
  const expected = new Set(expectedIds);
  const received = new Set(rows.filter((row) => !row.deleted_at).map((row) => String(row.id)));
  return [...expected].filter((id) => !received.has(id));
}

export async function verifyAccountImportGraph(client: any, scope: ImportVerificationScope) {
  const user = await getAuthenticatedUser(client);
  const snapshotIds = scope.sourceSnapshots.map((snapshot) => snapshot.id);
  const [decks, definitions, cards, variants, snapshots, reviews] = await Promise.all([
    selectRowsByField(client, "decks", user.id, "id", scope.deckIds),
    selectRowsByField(client, "note_type_definitions", user.id, "id", scope.noteTypeDefinitionIds),
    selectRowsByField(client, "cards", user.id, "id", scope.cardIds),
    selectRowsByField(client, "card_variants", user.id, "id", scope.variantIds),
    selectRowsByField(client, "learning_item_source_snapshots", user.id, "id", snapshotIds),
    selectRowsByField(client, "review_events", user.id, "id", scope.reviewEventIds),
  ]);

  const repairScope: ImportVerificationRepairScope = {
    deckIds: missingVerifiedRows(scope.deckIds, decks),
    noteTypeDefinitionIds: missingVerifiedRows(scope.noteTypeDefinitionIds, definitions),
    cardIds: missingVerifiedRows(scope.cardIds, cards),
    variantIds: missingVerifiedRows(scope.variantIds, variants),
    sourceSnapshotIds: missingVerifiedRows(snapshotIds, snapshots),
    reviewEventIds: missingVerifiedRows(scope.reviewEventIds, reviews),
  };
  const missingCount = Object.values(repairScope).reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
  if (missingCount) throw new ImportGraphVerificationError(`${missingCount} erwartete Importdatensätze fehlen in der Cloud.`, repairScope);

  const activeDecks = decks.filter((deck) => !deck.deleted_at);
  const knownDeckIds = new Set(activeDecks.map((deck) => String(deck.id)));
  const externalParentIds = [...new Set(activeDecks.map((deck) => String(deck.parent_deck_id ?? "")).filter((id) => id && !knownDeckIds.has(id)))];
  if (externalParentIds.length) {
    const parents = await selectRowsByField(client, "decks", user.id, "id", externalParentIds);
    const missingParents = missingVerifiedRows(externalParentIds, parents);
    if (missingParents.length) throw new ImportGraphVerificationError("Mindestens ein übergeordneter Stapel fehlt in der Cloud.", { deckIds: missingParents });
    for (const parent of parents.filter((row) => !row.deleted_at)) knownDeckIds.add(String(parent.id));
  }

  const expectedDeckIds = new Set(scope.deckIds);
  const expectedDefinitionIds = new Set(scope.noteTypeDefinitionIds);
  const snapshotByCardId = new Map(scope.sourceSnapshots.map((snapshot) => [snapshot.cardId, snapshot.id]));
  for (const card of cards.filter((row) => !row.deleted_at)) {
    if (!expectedDeckIds.has(String(card.deck_id))) throw new Error(`Karte ${card.id} ist dem falschen Stapel zugeordnet.`);
    if (!expectedDefinitionIds.has(String(card.note_type_definition_id))) throw new Error(`Karte ${card.id} verweist auf einen unerwarteten Notiztyp.`);
    if (String(card.latest_source_snapshot_id ?? "") !== snapshotByCardId.get(String(card.id))) {
      throw new Error(`Karte ${card.id} ist nicht mit ihrem aktuellen Quell-Snapshot verknüpft.`);
    }
  }

  const expectedCardIds = new Set(scope.cardIds);
  const originalsByCardId = new Map<string, number>();
  for (const variant of variants.filter((row) => !row.deleted_at)) {
    const cardId = String(variant.card_id ?? "");
    if (!expectedCardIds.has(cardId)) throw new Error(`Variante ${variant.id} verweist auf eine unerwartete Karte.`);
    if (variant.is_original) originalsByCardId.set(cardId, (originalsByCardId.get(cardId) ?? 0) + 1);
  }
  for (const cardId of scope.cardIds) {
    if (originalsByCardId.get(cardId) !== 1) throw new Error(`Karte ${cardId} besitzt in der Cloud nicht genau eine Originalvariante.`);
  }

  const expectedSnapshotLinks = new Map(scope.sourceSnapshots.map((snapshot) => [snapshot.id, snapshot.cardId]));
  for (const snapshot of snapshots) {
    if (String(snapshot.card_id ?? "") !== expectedSnapshotLinks.get(String(snapshot.id))) {
      throw new Error(`Quell-Snapshot ${snapshot.id} ist mit der falschen Karte verknüpft.`);
    }
  }
  if (reviews.some((review) => !expectedDeckIds.has(String(review.deck_id)))) {
    throw new Error("Mindestens ein Review-Ereignis ist dem falschen Stapel zugeordnet.");
  }
  const expectedVariantIds = new Set(scope.variantIds);
  for (const review of reviews) {
    const reviewableId = String(review.reviewable_id ?? "");
    if (review.reviewable_type === "variant" && !expectedVariantIds.has(reviewableId)) {
      throw new Error(`Review-Ereignis ${review.id} verweist auf eine unerwartete Variante.`);
    }
    if (review.reviewable_type === "card" && !expectedCardIds.has(reviewableId)) {
      throw new Error(`Review-Ereignis ${review.id} verweist auf eine unerwartete Karte.`);
    }
  }

  return {
    decks: scope.deckIds.length,
    cards: scope.cardIds.length,
    variants: scope.variantIds.length,
    sourceSnapshots: snapshotIds.length,
    noteTypeDefinitions: scope.noteTypeDefinitionIds.length,
    reviewEvents: scope.reviewEventIds.length,
  };
}

export interface CloudDeltaCursor {
  value: string;
  id: string;
}

export type CloudDeltaCursors = Record<string, CloudDeltaCursor>;

function normalizeDeltaCursor(value: unknown): CloudDeltaCursor | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const cursorValue = typeof candidate.value === "string" ? candidate.value : "";
  const id = typeof candidate.id === "string" ? candidate.id : "";
  const sequence = Number(cursorValue);
  if (!/^\d+$/.test(cursorValue) || /[,()]/.test(id) || !Number.isSafeInteger(sequence) || sequence < 0) return null;
  return { value: String(sequence), id };
}

function lastDeltaCursor(rows: any[], column: string, fallback: CloudDeltaCursor | null): CloudDeltaCursor {
  const row = rows.at(-1);
  return row
    ? { value: String(row[column] ?? EMPTY_DELTA_CURSOR_VALUE), id: String(row.id ?? "") }
    : fallback ?? { value: EMPTY_DELTA_CURSOR_VALUE, id: "" };
}

async function streamAccountTable(client: any, table: AccountTable, userId: string, cursorValue: unknown, onPage: (page: CloudEntityPage) => Promise<void>) {
  const cursor = normalizeDeltaCursor(cursorValue);
  if (!cursor) {
    let idCursor = "";
    let maximum: CloudDeltaCursor = { value: EMPTY_DELTA_CURSOR_VALUE, id: "" };
    let first = true;
    while (true) {
      let query = client.from(table).select("*").eq("user_id", userId).order("id", { ascending: true }).limit(CLOUD_PAGE_SIZE);
      if (idCursor) query = query.gt("id", idCursor);
      const { data, error } = await query;
      if (error) throw error;
      const rows = validateAccountRows(table, data ?? []);
      for (const row of rows) {
        const value = String((row as any)[DELTA_CURSOR_COLUMN] ?? EMPTY_DELTA_CURSOR_VALUE);
        if (Number(value) > Number(maximum.value) || value === maximum.value && String((row as any).id) > maximum.id) {
          maximum = { value, id: String((row as any).id) };
        }
      }
      await onPage({ table, entities: projectCloudEntities(table, rows), reset: first });
      first = false;
      if (rows.length < CLOUD_PAGE_SIZE) break;
      const next = String((rows.at(-1) as any)?.id ?? "");
      if (!next || next === idCursor) throw new Error(`Cloud-Pagination für ${table} konnte nicht fortgesetzt werden.`);
      idCursor = next;
    }
    await onPage({ table, entities: [], reset: first, cursor: maximum });
    return maximum;
  }

  let pageCursor = cursor;
  while (true) {
    let query = client.from(table).select("*").eq("user_id", userId)
      .order(DELTA_CURSOR_COLUMN, { ascending: true }).order("id", { ascending: true }).limit(CLOUD_PAGE_SIZE);
    query = query.or(pageCursor.id
      ? `${DELTA_CURSOR_COLUMN}.gt.${pageCursor.value},and(${DELTA_CURSOR_COLUMN}.eq.${pageCursor.value},id.gt.${pageCursor.id})`
      : `${DELTA_CURSOR_COLUMN}.gt.${pageCursor.value}`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = validateAccountRows(table, data ?? []);
    const next = lastDeltaCursor(rows, DELTA_CURSOR_COLUMN, pageCursor);
    await onPage({ table, entities: projectCloudEntities(table, rows), reset: false, cursor: next });
    pageCursor = next;
    if (rows.length < CLOUD_PAGE_SIZE) break;
  }
  return pageCursor;
}

export async function streamAccountCloudChanges(client: any, cursors: CloudDeltaCursors, onPage: (page: CloudEntityPage) => Promise<void>) {
  const user = await getAuthenticatedUser(client);
  const profileRows = await selectProfileRows(client, user.id);
  const nextCursors: CloudDeltaCursors = {};
  for (const table of ACCOUNT_TABLES as AccountTable[]) {
    nextCursors[table] = await streamAccountTable(client, table, user.id, cursors[table], onPage);
  }
  let mediaCursor = "";
  let first = true;
  while (true) {
    let query = client.from("media_assets").select("*").eq("user_id", user.id).order("id", { ascending: true }).limit(100);
    if (mediaCursor) query = query.gt("id", mediaCursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = validateMediaAssetRows(data ?? []);
    await onPage({ table: "media_assets", entities: projectCloudEntities("media_assets", rows), reset: first });
    first = false;
    if (rows.length < 100) break;
    const next = String(rows.at(-1)?.id ?? "");
    if (!next || next === mediaCursor) throw new Error("Cloud-Pagination für Medien konnte nicht fortgesetzt werden.");
    mediaCursor = next;
  }
  return { profile: createCloudProfile(profileRows[0] ?? null, user), cursors: nextCursors };
}

export async function listAccountOriginalVariantManifest(client: any) {
  const user = await getAuthenticatedUser(client);
  const [cards, variants] = await Promise.all([
    selectKeysetRows(client, "cards", user.id, "id,deleted_at"),
    selectKeysetRows(client, "card_variants", user.id, "id,card_id,is_original,deleted_at"),
  ]);
  return {
    cardIds: cards.filter((row) => !row.deleted_at).map((row) => String(row.id)),
    originalVariantIds: variants.filter((row) => row.is_original && !row.deleted_at).map((row) => String(row.id)),
  };
}

async function selectProfileRows(client: any, userId: any) {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId);
  if (error) throw error;
  return validateProfileRows(data ?? []);
}

async function selectOptionalRows(client: any, table: any, userId: any, columns: any = "*") {
  return selectKeysetRows(client, table, userId, columns, { optional: true });
}

async function selectMediaRows(client: any, userId: string) {
  return validateMediaAssetRows(await selectKeysetRows(client, "media_assets", userId));
}

async function selectRowById(client: any, table: any, userId: any, entityId: any, columns: any = "*") {
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId).eq("id", entityId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function requireBaseRevision(value: any) {
  if (value === null) return null;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Basisrevision ist ungültig.");
  return revision;
}

async function markConflictForUser(client: any, user: any, input: any = {}, { deviceId, createdAt }: any = {}) {
  const entityTable = requireNonEmptyString(input.entityTable, "Konflikttabelle fehlt.");
  const entityId = requireNonEmptyString(input.entityId, "Konfliktentität fehlt.");
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const resolvedCreatedAt = requireTimestamp(createdAt, nowIso, "Konfliktzeitpunkt ist ungültig.");
  const baseRevision = input.baseRevision == null ? null : requireBaseRevision(input.baseRevision);
  const localRevision = input.localRevision == null ? null : normalizeRevision(input.localRevision);
  const remoteRevision = input.remoteRevision == null ? null : normalizeRevision(input.remoteRevision);
  const { data: existingRows, error: existingError } = await client.from("sync_conflicts")
    .select("*")
    .eq("user_id", user.id)
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);
  if (existingError) throw existingError;
  const existing = toArray(existingRows)
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
  const { error } = await client.from("sync_conflicts").upsert(row, {
    onConflict: ACCOUNT_UPSERT_CONFLICT,
  });
  let persistedId = id;
  if (error && String(error.code ?? "") === "23505") {
    const { data: racedRows, error: racedError } = await client.from("sync_conflicts")
      .select("*")
      .eq("user_id", user.id)
      .eq("entity_table", entityTable)
      .eq("entity_id", entityId);
    if (racedError) throw racedError;
    const raced = toArray(racedRows).find((candidate) => candidate.status === "open" || candidate.status === "ignored");
    if (!raced) throw error;
    persistedId = raced.id;
    const { error: updateError } = await client.from("sync_conflicts").upsert({ ...row, id: persistedId }, { onConflict: ACCOUNT_UPSERT_CONFLICT });
    if (updateError) throw updateError;
  } else if (error) {
    throw error;
  }
  const persisted = await selectRowById(client, "sync_conflicts", user.id, persistedId);
  if (!persisted) throw new Error("Der Synchronisierungskonflikt konnte nicht bestätigt werden.");
  return syncConflictFromRow(persisted);
}

async function throwRevisionConflict(client: any, user: any, { entityTable, entityId, baseRevision, localValue, remoteValue, deviceId, createdAt }: any) {
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

async function deleteRowsById(client: any, table: any, userId: any, ids: any) {
  for (let offset = 0; offset < ids.length; offset += CLOUD_DELETE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + CLOUD_DELETE_BATCH_SIZE);
    const { error } = await client.from(table).delete().eq("user_id", userId).in("id", batch);
    if (error) throw error;
  }
}

function sourceSnapshotDeletionOrder(rows: any[]) {
  const missingIds = new Set(rows.map((row: any) => row.id));
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.previous_snapshot_id || !missingIds.has(row.previous_snapshot_id)) continue;
    const children = childrenByParent.get(row.previous_snapshot_id) ?? [];
    children.push(row.id);
    childrenByParent.set(row.previous_snapshot_id, children);
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const childId of childrenByParent.get(id) ?? []) visit(childId);
    ordered.push(id);
  }
  for (const row of rows) visit(row.id);
  return ordered;
}

async function deleteRowsMissingFromState(client: any, table: any, userId: any, keepRows: any, { protectedIds = new Set(), deletedAt, deviceId }: any = {}) {
  const keepIds = new Set(keepRows.map((row: any) => row.id));
  const columns = table === "learning_item_source_snapshots"
    ? "id, previous_snapshot_id"
    : protectedIds.size > 0
      ? "id, revision, deleted_at"
      : "id";
  const existingRows = await selectRows(client, table, userId, columns);
  const missingRows = existingRows.filter((row: any) => !keepIds.has(row.id));
  const protectedRows = missingRows.filter((row: any) => protectedIds.has(row.id));
  for (const row of protectedRows) {
    if (row.deleted_at) continue;
    const timestamp = deletedAt ?? nowIso();
    const { error } = await client.from(table).update({
      deleted_at: timestamp,
      updated_at: timestamp,
      revision: normalizeRevision(row.revision) + 1,
      updated_by_device_id: deviceId ?? null,
    }).eq("user_id", userId).eq("id", row.id);
    if (error) throw error;
  }
  const removableRows = missingRows.filter((row: any) => !protectedIds.has(row.id));
  const removableIds = table === "learning_item_source_snapshots"
    ? sourceSnapshotDeletionOrder(removableRows)
    : removableRows.map((row: any) => row.id);
  await deleteRowsById(client, table, userId, removableIds);
}

export function deckToCloudRow(deck: any, userId: any) {
  return {
    id: deck.id,
    user_id: userId,
    local_owner_id: userId,
    parent_deck_id: deck.parentDeckId ?? null,
    name: deck.name,
    description: deck.description ?? "",
    source: normalizeSource(deck.source),
    original_deck_id: deck.originalDeckId ?? null,
    hierarchy_path: toArray(deck.hierarchyPath),
    card_count: deck.cards?.length ?? deck.cardCount ?? 0,
    tags: toArray(deck.tags),
    import_meta: toJson(deck.importMeta, {}),
    deck_settings: toJson(deck.deckSettings, {}),
    version_log: toJson(deck.versionLog, []),
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    ...syncFields(deck),
  };
}

function cardToCloudRow(card: any, deck: any, userId: any) {
  return {
    id: card.id,
    user_id: userId,
    deck_id: deck.id,
    note_id: card.noteId ?? null,
    source: normalizeSource(card.source ?? deck.source),
    source_card_id: card.sourceCardId ?? null,
    source_note_id: card.sourceNoteId ?? null,
    kind: card.kind ?? card.cardType ?? "basic",
    note_type_definition_id: card.noteTypeDefinitionId ?? null,
    content_document: toJson(card.contentDocument, {}),
    latest_source_snapshot_id: card.latestSourceSnapshotId ?? null,
    content_revision: normalizeRevision(card.contentRevision),
    draft_status: card.draftStatus ?? "accepted",
    status: card.status ?? "active",
    original_front: card.originalFront ?? card.canonicalQuestion ?? "",
    original_back: card.originalBack ?? card.canonicalAnswer ?? "",
    original_fields: toJson(card.originalFields, []),
    original_tags: toArray(card.originalTags ?? card.tags),
    original_html: card.originalHtml ?? "",
    immutable_original: toJson(card.immutableOriginal, {}),
    media_refs: toArray(card.mediaRefs),
    source_anchors: toJson(card.sourceAnchors, []),
    content_hash: card.contentHash ?? null,
    review_state: toJson(card.learningItemState ?? card.reviewState, {}),
    core_state: toJson(card.coreState, {}),
    version_log: toJson(card.versionLog, []),
    meta: cardMetaToCloud(card),
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    ...syncFields(card),
  };
}

function variantToCloudRow(variant: any, card: any, userId: any) {
  return {
    id: variant.id,
    user_id: userId,
    card_id: card.id,
    source_card_id: variant.sourceCardId ?? card.id,
    front: variant.front ?? "",
    back: variant.back ?? "",
    variant_type: variant.variantType ?? "basic",
    variant_level: variant.variantLevel ?? 1,
    generation_source: variant.generationSource ?? (variant.isOriginal ? "original" : "user_edited"),
    parent_variant_id: variant.parentVariantId ?? null,
    anchor_variant_id: variant.anchorVariantId ?? null,
    is_original: Boolean(variant.isOriginal),
    is_active: variant.isActive !== false,
    transform_type: normalizeTransformType(variant.transformType, variant.isOriginal),
    transform_profile: toJson(variant.transformProfile, {}),
    model_run_id: variant.modelRunId ?? null,
    explanation: variant.explanation ?? "",
    hints_json: variant.hintsJson ?? null,
    answer_options_json: variant.answerOptionsJson ?? null,
    expected_answer_json: variant.expectedAnswerJson ?? null,
    confidence: variant.confidence ?? null,
    semantic_delta: variant.semanticDelta ?? null,
    changed_recognition_cues: toArray(variant.changedRecognitionCues),
    quality_status: variant.qualityStatus ?? "active",
    content_hash: variant.contentHash ?? null,
    source_anchors: toJson(variant.sourceAnchors, []),
    review_state: toJson(variant.reviewState, {}),
    performance: toJson(variant.performance, {}),
    feedback: toJson(variant.feedback, []),
    version_log: toJson(variant.versionLog, []),
    projection: toJson(variant.projection, {}),
    scheduling_mode: variant.schedulingMode === "adaptive-presentation" ? "adaptive-presentation" : "independent-card",
    study_deck_id: variant.studyDeckId ?? null,
    render_revision: normalizeRevision(variant.renderRevision),
    meta: toJson(variant.meta, {}),
    created_at: variant.createdAt,
    updated_at: variant.updatedAt,
    ...syncFields(variant),
  };
}

export function reviewEventToCloudRow(event: any, deck: any, userId: any, { deviceId = null }: any = {}) {
  const reviewableId = event.reviewableId ?? event.cardId ?? event.variantId ?? "";
  const sourceCardId = event.sourceCardId ?? event.learningItemId ?? null;
  const answeredAt = event.answeredAt ?? event.createdAt;
  const schedulerBefore = event.schedulerBefore ?? (event.previousLearningItemStateJson ? { card: event.previousLearningItemStateJson } : null);
  const schedulerAfter = event.schedulerAfter ?? (event.nextLearningItemStateJson ? { card: event.nextLearningItemStateJson } : null);
  return {
    id: event.id,
    user_id: userId,
    deck_id: event.deckId ?? deck.id,
    reviewable_type: event.reviewableType ?? "card",
    reviewable_id: reviewableId,
    source_card_id: sourceCardId,
    rating: event.rating,
    answered_at: answeredAt,
    response_time_ms: event.responseTimeMs ?? null,
    scheduler_before: schedulerBefore,
    scheduler_after: schedulerAfter,
    flags: reviewFlagsToCloud(event, { reviewableId, sourceCardId, answeredAt, schedulerBefore, schedulerAfter }),
    created_at: event.createdAt ?? event.answeredAt,
    created_by_device_id: event.createdByDeviceId ?? deviceId,
  };
}

function sourceDocumentToCloudRow(document: any, userId: any) {
  return {
    id: document.id,
    user_id: userId,
    local_owner_id: document.ownerId ?? null,
    file_name: document.fileName ?? "Dokument",
    mime_type: document.mimeType ?? "application/octet-stream",
    text: document.text ?? "",
    storage_url: document.storageUrl ?? "",
    text_extraction_status: document.textExtractionStatus ?? "pending",
    metadata: toJson(document.metadata, {}),
    created_at: document.createdAt,
    updated_at: document.updatedAt ?? document.createdAt,
    ...syncFields(document),
  };
}

function noteTypeDefinitionToCloudRow(definition: any, userId: any) {
  const {
    id,
    name,
    revision,
    createdAt,
    updatedAt,
    deletedAt,
    updatedByDeviceId,
    ...content
  } = toObject(definition);
  return {
    id,
    user_id: userId,
    name: String(name ?? "Notiztyp"),
    definition: content,
    created_at: createdAt,
    updated_at: updatedAt ?? createdAt,
    revision: normalizeRevision(revision),
    deleted_at: deletedAt ?? null,
    updated_by_device_id: updatedByDeviceId ?? null,
  };
}

function learningItemSourceSnapshotToCloudRow(snapshot: any, cardId: any, userId: any) {
  return {
    id: snapshot.id,
    user_id: userId,
    card_id: cardId,
    schema_version: 1,
    source_kind: snapshot.sourceKind,
    import_fingerprint: snapshot.importFingerprint ?? "",
    previous_snapshot_id: snapshot.previousSnapshotId ?? null,
    note_type_definition_id: snapshot.definitionVersionId ?? null,
    source_payload: toJson(snapshot.sourcePayload, {}),
    created_at: snapshot.createdAt,
  };
}

function snapshotCardIds(decks: any[], snapshots: any[]) {
  const snapshotsById = new Map(snapshots.map((snapshot: any) => [snapshot.id, snapshot]));
  const cardIdsBySnapshotId = new Map<string, string>();
  for (const deck of decks) {
    for (const card of toArray(deck.cards)) {
      let snapshotId = typeof card.latestSourceSnapshotId === "string" ? card.latestSourceSnapshotId : null;
      const chain = new Set<string>();
      while (snapshotId) {
        if (chain.has(snapshotId)) throw new Error(`Quell-Snapshot-Kette für Learning Item ${card.id} ist zyklisch.`);
        chain.add(snapshotId);
        const snapshot = snapshotsById.get(snapshotId);
        if (!snapshot) throw new Error(`Quell-Snapshot ${snapshotId} für Learning Item ${card.id} fehlt.`);
        const assignedCardId = cardIdsBySnapshotId.get(snapshotId);
        if (assignedCardId && assignedCardId !== card.id) {
          throw new Error(`Quell-Snapshot ${snapshotId} ist mehreren Learning Items zugeordnet.`);
        }
        cardIdsBySnapshotId.set(snapshotId, card.id);
        snapshotId = typeof snapshot.previousSnapshotId === "string" ? snapshot.previousSnapshotId : null;
      }
    }
  }
  const orphan = snapshots.find((snapshot: any) => !cardIdsBySnapshotId.has(snapshot.id));
  if (orphan) throw new Error(`Quell-Snapshot ${orphan.id} ist keinem Learning Item zugeordnet.`);
  return cardIdsBySnapshotId;
}

export function createCloudStateRows(state: any, userId: any, { deviceId = null }: any = {}) {
  const decks = toArray(state.decks);
  const snapshots = toArray(state.learningItemSourceSnapshots);
  const cardIdsBySnapshotId = snapshotCardIds(decks, snapshots);

  return {
    decks: uniqueRowsById(decks.map((deck: any) => deckToCloudRow(deck, userId))),
    note_type_definitions: uniqueRowsById(toArray(state.noteTypeDefinitions).map((definition: any) => noteTypeDefinitionToCloudRow(definition, userId))),
    cards: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).map((card: any) => cardToCloudRow(card, deck, userId)))),
    card_variants: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).flatMap((card: any) => toArray(card.variants).map((variant: any) => variantToCloudRow(variant, card, userId))))),
    learning_item_source_snapshots: uniqueRowsById(snapshots.map((snapshot: any) => learningItemSourceSnapshotToCloudRow(snapshot, cardIdsBySnapshotId.get(snapshot.id), userId))),
    review_events: uniqueRowsById(
      decks.flatMap((deck: any) => toArray(deck.reviewEvents).map((event: any) => reviewEventToCloudRow(event, deck, userId, { deviceId })).filter((row: any) => row.id && row.rating)),
    ),
    source_documents: uniqueRowsById(toArray(state.documents).map((document: any) => sourceDocumentToCloudRow(document, userId))),
  };
}

function variantFromRow(row: any) {
  return {
    id: row.id,
    learningItemId: row.card_id,
    cardId: row.card_id,
    sourceCardId: row.source_card_id,
    front: row.front,
    back: row.back,
    variantType: row.variant_type,
    variantLevel: row.variant_level,
    generationSource: row.generation_source,
    parentVariantId: row.parent_variant_id,
    anchorVariantId: row.anchor_variant_id,
    isOriginal: row.is_original,
    isActive: row.is_active,
    transformType: row.transform_type,
    transformProfile: row.transform_profile,
    modelRunId: row.model_run_id,
    explanation: row.explanation,
    hintsJson: row.hints_json,
    answerOptionsJson: row.answer_options_json,
    expectedAnswerJson: row.expected_answer_json,
    confidence: row.confidence,
    semanticDelta: row.semantic_delta,
    changedRecognitionCues: row.changed_recognition_cues,
    qualityStatus: row.quality_status,
    contentHash: row.content_hash,
    sourceAnchors: row.source_anchors,
    reviewState: row.review_state,
    performance: row.performance,
    feedback: row.feedback,
    versionLog: row.version_log,
    projection: row.projection,
    schedulingMode: row.scheduling_mode,
    studyDeckId: row.study_deck_id,
    renderRevision: row.render_revision,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...syncMetadataFromRow(row),
  };
}

function cardFromRow(row: any, variants: any) {
  const { meta, model } = cardMetaFromCloud(row.meta);

  return {
    id: row.id,
    noteId: row.note_id,
    deckId: row.deck_id,
    source: row.source,
    sourceCardId: row.source_card_id,
    sourceNoteId: row.source_note_id,
    title: model.title ?? "",
    canonicalQuestion: model.canonicalQuestion ?? row.original_front,
    canonicalAnswer: model.canonicalAnswer ?? row.original_back,
    tags: model.tags ?? row.original_tags,
    concepts: model.concepts ?? [],
    sourceType: model.sourceType ?? null,
    sourceRefId: model.sourceRefId ?? row.source_card_id ?? row.source_note_id ?? null,
    cardType: row.kind,
    kind: row.kind,
    noteTypeDefinitionId: row.note_type_definition_id,
    contentDocument: row.content_document,
    latestSourceSnapshotId: row.latest_source_snapshot_id,
    contentRevision: row.content_revision,
    draftStatus: row.draft_status,
    status: row.status,
    originalFront: row.original_front,
    originalBack: row.original_back,
    originalFields: row.original_fields,
    originalTags: row.original_tags,
    originalHtml: row.original_html,
    immutableOriginal: row.immutable_original,
    mediaRefs: row.media_refs,
    sourceAnchors: row.source_anchors,
    contentHash: row.content_hash,
    reviewState: row.review_state,
    learningItemState: row.review_state,
    coreState: row.core_state,
    variants,
    versionLog: row.version_log,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...syncMetadataFromRow(row),
  };
}

function deckFromRow(row: any) {
  return {
    ...createCoreDeck({
      id: row.id,
      ownerId: row.user_id,
      parentDeckId: row.parent_deck_id,
      name: row.name,
      description: row.description,
      source: row.source,
      originalDeckId: row.original_deck_id,
      hierarchyPath: row.hierarchy_path,
      cards: [],
      tags: row.tags,
      importMeta: row.import_meta,
      mediaAssets: [],
      deckSettings: row.deck_settings,
      sourceDocuments: [],
      reviewEvents: [],
      versionLog: row.version_log,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...syncMetadataFromRow(row),
    }),
    cardCount: Number(row.card_count ?? 0),
  };
}

function noteTypeDefinitionFromRow(row: any) {
  return {
    ...toObject(row.definition),
    id: row.id,
    name: row.name,
    revision: normalizeRevision(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

function learningItemSourceSnapshotFromRow(row: any) {
  return {
    id: row.id,
    schemaVersion: 1,
    sourceKind: row.source_kind,
    importFingerprint: row.import_fingerprint,
    previousSnapshotId: row.previous_snapshot_id,
    definitionVersionId: row.note_type_definition_id,
    sourcePayload: row.source_payload,
    createdAt: row.created_at,
  };
}

function reviewEventFromRow(row: any) {
  const { flags, model } = reviewFlagsFromCloud(row.flags);
  const learningItemId = model.learningItemId ?? row.source_card_id ?? row.reviewable_id;
  const variantId = model.variantId ?? model.cardVariantId ?? row.reviewable_id;
  const schedulerParamsJson = model.schedulerParamsJson ?? row.scheduler_after?.card?.schedulerParamsJson ?? null;

  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    reviewableType: row.reviewable_type,
    reviewableId: row.reviewable_id,
    sourceCardId: row.source_card_id,
    learningItemId,
    cardId: model.cardId ?? learningItemId,
    cardVariantId: model.cardVariantId ?? variantId,
    variantId,
    rating: row.rating,
    answeredAt: row.answered_at,
    reviewedAt: model.reviewedAt ?? row.answered_at ?? row.created_at,
    responseTimeMs: row.response_time_ms,
    variantLevel: model.variantLevel ?? schedulerParamsJson?.variantLevel ?? null,
    variantType: model.variantType ?? schedulerParamsJson?.variantType ?? null,
    previousLearningItemStateJson: model.previousLearningItemStateJson ?? row.scheduler_before?.card ?? null,
    nextLearningItemStateJson: model.nextLearningItemStateJson ?? row.scheduler_after?.card ?? null,
    schedulerVersion: model.schedulerVersion ?? schedulerParamsJson?.schedulerVersion ?? null,
    schedulerParamsJson,
    anchorVariantId: model.anchorVariantId ?? null,
    anchorSnapshotJson: model.anchorSnapshotJson ?? null,
    fallbackInfo: model.fallbackInfo ?? null,
    schedulerBefore: row.scheduler_before,
    schedulerAfter: row.scheduler_after,
    flags,
    createdAt: row.created_at,
    createdByDeviceId: row.created_by_device_id ?? null,
  };
}

function sourceDocumentFromRow(row: any) {
  return {
    id: row.id,
    ownerId: row.local_owner_id ?? row.user_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    text: row.text,
    storageUrl: row.storage_url,
    textExtractionStatus: row.text_extraction_status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...syncMetadataFromRow(row),
  };
}

export async function registerAccountSyncDevice(client: any, device: any, { lastSeenAt }: any = {}) {
  const id = requireNonEmptyString(device?.id, "Geräte-ID fehlt.");
  const label = requireNonEmptyString(device?.label, "Gerätebezeichnung fehlt.");
  if (typeof device?.userAgent !== "string") throw new Error("User-Agent des Geräts fehlt.");
  const seenAt = requireTimestamp(lastSeenAt, nowIso, "Zeitpunkt der Geräte-Registrierung ist ungültig.");
  const user = await getAuthenticatedUser(client);
  const row = {
    id,
    user_id: user.id,
    label,
    last_seen_at: seenAt,
    user_agent: device.userAgent,
  };
  const { data, error } = await client
    .from("sync_devices")
    .upsert(row, { onConflict: ACCOUNT_UPSERT_CONFLICT })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Dieses Gerät konnte nicht für die Synchronisierung registriert werden.");
  return data;
}

function summarizeCloudRows(rows: any) {
  return {
    decks: rows.decks.length,
    noteTypeDefinitions: rows.note_type_definitions.length,
    cards: rows.cards.length,
    variants: rows.card_variants.length,
    learningItemSourceSnapshots: rows.learning_item_source_snapshots.length,
    reviewEvents: rows.review_events.length,
    documents: rows.source_documents.length,
  };
}

async function loadAccountRows(client: any, userId: any) {
  const values = await Promise.all(ACCOUNT_TABLES.map((table: any) => selectRows(client, table, userId)));
  return Object.fromEntries(ACCOUNT_TABLES.map((table: any, index: any) => [table, values[index]]));
}

function updatePayload(row: any, { revision, deviceId, now }: any) {
  const payload = Object.fromEntries(Object.entries(row).filter(([key]: any) => !["id", "user_id", "created_at"].includes(key)));
  payload.revision = revision;
  payload.updated_by_device_id = deviceId ?? row.updated_by_device_id ?? null;
  if (Object.hasOwn(payload, "updated_at")) payload.updated_at = now();
  return payload;
}

function revisionMutationResult(entityTable: any, row: any, { applied = false, idempotent = false }: any = {}) {
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

function preserveRemoteLearningProjection(entityTable: string, desiredRow: any, remoteRow: any) {
  if (!remoteRow) return desiredRow;
  if (entityTable === "cards") {
    return { ...desiredRow, review_state: remoteRow.review_state, core_state: remoteRow.core_state };
  }
  if (entityTable === "card_variants") {
    return { ...desiredRow, review_state: remoteRow.review_state, performance: remoteRow.performance };
  }
  return desiredRow;
}

async function applyRevisionedRowMutation(client: any, user: any, entityTable: any, desiredRow: any, options: any = {}) {
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Nicht revisionierbare Cloud-Tabelle: ${entityTable}`);
  const entityId = requireNonEmptyString(desiredRow?.id, "Entitäts-ID fehlt.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  if (!Object.hasOwn(options, "baseRevision")) throw new Error("Basisrevision fehlt.");
  const baseRevision = requireBaseRevision(options.baseRevision);
  const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  const writeNow = () => flushedAt;
  let row = { ...desiredRow, id: entityId, user_id: user.id };
  let remoteRow = Object.hasOwn(options, "remoteRow") ? options.remoteRow : await selectRowById(client, entityTable, user.id, entityId);

  if (remoteRow && rowsHaveSameContent(row, remoteRow, entityTable) && options.forceWrite !== true) {
    return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
  }

  if (!remoteRow) {
    const derivedOriginalInsert = entityTable === "card_variants" && row.is_original === true
      ? await selectRowById(client, "cards", user.id, row.card_id)
      : null;
    if (baseRevision !== null && (!derivedOriginalInsert || derivedOriginalInsert.deleted_at)) {
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
      ...(TABLES_WITH_UPDATED_AT.has(entityTable) ? { updated_at: flushedAt } : {}),
    };
    const { data, error } = await client.from(entityTable).insert(candidate).select("*");
    if (!error && data?.[0]) return revisionMutationResult(entityTable, data[0], { applied: true });
    if (error && String(error.code ?? "") !== "23505" && !/duplicate/i.test(error.message ?? "")) throw error;
    remoteRow = await selectRowById(client, entityTable, user.id, entityId);
    if (remoteRow && rowsHaveSameContent(candidate, remoteRow, entityTable)) {
      return revisionMutationResult(entityTable, remoteRow, { idempotent: true });
    }
    return throwRevisionConflict(client, user, {
      entityTable,
      entityId,
      baseRevision,
      localValue: candidate,
      remoteValue: remoteRow ?? {},
      deviceId,
      createdAt: flushedAt,
    });
  }

  row = preserveRemoteLearningProjection(entityTable, row, remoteRow);
  const restoresTombstone = Boolean(remoteRow.deleted_at) && row.deleted_at == null;
  if (baseRevision === null || normalizeRevision(remoteRow.revision) !== baseRevision || (remoteRow.deleted_at && !restoresTombstone)) {
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

  const nextRevision = baseRevision + 1;
  const payload = updatePayload(row, { revision: nextRevision, deviceId, now: writeNow });
  const { data, error } = await client
    .from(entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", entityId)
    .eq("revision", baseRevision)
    .select("*");
  if (error) throw error;
  if (data?.[0]) return revisionMutationResult(entityTable, data[0], { applied: true });

  remoteRow = await selectRowById(client, entityTable, user.id, entityId);
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

async function softDeleteEntityForUser(client: any, user: any, input: any = {}, options: any = {}) {
  const entityTable = requireNonEmptyString(input.entityTable, "Tabelle für Soft-Delete fehlt.");
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Soft-Delete ist für diese Tabelle nicht erlaubt: ${entityTable}`);
  const entityId = requireNonEmptyString(input.entityId, "Entitäts-ID für Soft-Delete fehlt.");
  const baseRevision = requireBaseRevision(input.baseRevision);
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  const deletedAt = requireTimestamp(input.deletedAt ?? options.flushedAt, nowIso, "Löschzeitpunkt ist ungültig.");
  const remoteRow = Object.hasOwn(options, "remoteRow") ? options.remoteRow : await selectRowById(client, entityTable, user.id, entityId);

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
    ...(TABLES_WITH_UPDATED_AT.has(entityTable) ? { updated_at: deletedAt } : {}),
  };
  const { data, error } = await client
    .from(entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", entityId)
    .eq("revision", baseRevision)
    .select("*");
  if (error) throw error;
  if (data?.[0]) return revisionMutationResult(entityTable, data[0], { applied: true });

  const latest = await selectRowById(client, entityTable, user.id, entityId);
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

export async function markConflict(client: any, input: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  return markConflictForUser(client, user, input, options);
}

async function insertRowsReturning(client: any, table: any, rows: any) {
  const inserted = [];
  for (const chunk of chunkRows(rows)) {
    const { data, error } = await client.from(table).insert(chunk).select("*");
    if (error) throw error;
    inserted.push(...(data ?? []));
  }
  return inserted;
}

export async function softDeleteEntity(client: any, input: any, options: any = {}) {
  return softDeleteEntityForUser(client, await getAuthenticatedUser(client), input, options);
}

export interface CloudEntityPage {
  table: AccountTable | "media_assets";
  entities: any[];
  reset: boolean;
  cursor?: CloudDeltaCursor;
}

function projectCloudEntities(table: AccountTable | "media_assets", rows: any[]) {
  if (table === "decks") return rows.map(deckFromRow);
  if (table === "cards") return rows.map((row) => cardFromRow(row, []));
  if (table === "card_variants") return rows.map(variantFromRow);
  if (table === "review_events") return rows.map(reviewEventFromRow);
  if (table === "source_documents") return rows.map(sourceDocumentFromRow);
  if (table === "note_type_definitions") return rows.map(noteTypeDefinitionFromRow);
  if (table === "learning_item_source_snapshots") return rows.map(learningItemSourceSnapshotFromRow);
  return rows.map(mediaAssetFromRow);
}

export async function applyEntityMutation(client: any, mutation: any, options: any = {}): Promise<any> {
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
  if (entityTable === "learning_item_source_snapshots") {
    const cardId = requireNonEmptyString(mutation?.cardId, "Karten-ID des Quell-Snapshots fehlt.");
    const desired = learningItemSourceSnapshotToCloudRow(entity, cardId, user.id);
    const remote = await selectSourceSnapshotsById(client, user.id, [desired.id, desired.previous_snapshot_id].filter(Boolean));
    const persisted = (await appendMissingSourceSnapshots(client, user.id, [desired], remote)).find((row: any) => row.id === desired.id);
    if (mutation.attachToCard) {
      const { error } = await client.from("cards").update({ latest_source_snapshot_id: desired.id }).eq("user_id", user.id).eq("id", cardId);
      if (error) throw error;
    }
    return { persistedRow: persisted };
  }
  if (entityTable === "review_events") {
    const desired = reviewEventToCloudRow(entity, { id: mutation.deckId ?? entity?.deckId }, user.id, options);
    const remote = await selectRowsByField(client, "review_events", user.id, "id", [desired.id]);
    if (remote.length) return { persistedRow: remote[0], idempotent: true };
    const [persisted] = await insertRowsReturning(client, "review_events", [desired]);
    return { persistedRow: validateAccountRows("review_events", [persisted])[0] };
  }
  const row = entityTable === "decks"
    ? deckToCloudRow(entity, user.id)
    : entityTable === "cards"
      ? cardToCloudRow(entity, { id: mutation.deckId ?? entity?.deckId, source: entity?.source }, user.id)
      : entityTable === "card_variants"
        ? variantToCloudRow(entity, { id: mutation.cardId ?? entity?.learningItemId }, user.id)
        : entityTable === "source_documents"
          ? sourceDocumentToCloudRow(entity, user.id)
          : entityTable === "note_type_definitions"
            ? noteTypeDefinitionToCloudRow(entity, user.id)
            : null;
  if (!row) throw new Error(`Entity-Mutation wird für ${entityTable} nicht unterstützt.`);
  return applyRevisionedRowMutation(client, user, entityTable, row, {
    ...options,
    baseRevision: mutation.baseRevision,
  });
}

function entityMutationRow(entityTable: string, mutation: any, userId: string) {
  const entity = mutation?.entity;
  return entityTable === "decks"
    ? deckToCloudRow(entity, userId)
    : entityTable === "cards"
      ? cardToCloudRow(entity, { id: mutation.deckId ?? entity?.deckId, source: entity?.source }, userId)
      : entityTable === "card_variants"
        ? variantToCloudRow(entity, { id: mutation.cardId ?? entity?.learningItemId }, userId)
        : entityTable === "source_documents"
          ? sourceDocumentToCloudRow(entity, userId)
          : entityTable === "note_type_definitions"
            ? noteTypeDefinitionToCloudRow(entity, userId)
            : null;
}

export async function applyEntityMutationBatch(client: any, mutations: any[], options: any = {}) {
  if (!mutations.length) return [];
  const user = await getAuthenticatedUser(client);
  const entityTable = requireNonEmptyString(mutations[0]?.table, "Tabelle der Entity-Mutation fehlt.");
  if (mutations.some((mutation) => mutation.table !== entityTable || mutation.tombstone)) {
    return mapWithConcurrency(mutations, (mutation) => applyEntityMutation(client, mutation, options));
  }
  if (entityTable === "learning_item_source_snapshots") {
    const desiredRows = mutations.map((mutation) => learningItemSourceSnapshotToCloudRow(
      mutation.entity,
      requireNonEmptyString(mutation.cardId, "Karten-ID des Quell-Snapshots fehlt."),
      user.id,
    ));
    const remoteRows = await selectSourceSnapshotsById(client, user.id, desiredRows.flatMap((row) => [row.id, row.previous_snapshot_id].filter(Boolean)));
    const persistedRows = await appendMissingSourceSnapshots(client, user.id, desiredRows, remoteRows);
    const persistedById = new Map(persistedRows.map((row: any) => [row.id, row]));
    await mapWithConcurrency(
      mutations.filter((mutation) => mutation.attachToCard),
      async (mutation) => {
        const { error } = await client
          .from("cards")
          .update({ latest_source_snapshot_id: mutation.entity.id })
          .eq("user_id", user.id)
          .eq("id", mutation.cardId);
        if (error) throw error;
      },
    );
    return desiredRows.map((row) => {
      const persistedRow = persistedById.get(row.id);
      if (!persistedRow) throw new Error(`Quell-Snapshot ${row.id} wurde nicht bestätigt.`);
      return { persistedRow };
    });
  }
  if (entityTable === "review_events") {
    const desiredRows = mutations.map((mutation) => reviewEventToCloudRow(
      mutation.entity,
      { id: mutation.deckId ?? mutation.entity?.deckId },
      user.id,
      options,
    ));
    const remoteRows = await selectRowsByField(client, "review_events", user.id, "id", desiredRows.map((row) => row.id));
    const remoteById = new Map(remoteRows.map((row: any) => [row.id, row]));
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
  const validRows = rows as any[];
  const remoteRows = await selectRowsByField(client, entityTable as AccountTable, user.id, "id", validRows.map((row) => row.id));
  const remoteById = new Map(remoteRows.map((row: any) => [row.id, row]));
  const results = new Array(mutations.length);
  const inserts = mutations.flatMap((mutation, index) => mutation.baseRevision == null && !remoteById.has(validRows[index].id) ? [{ mutation, index }] : []);
  if (inserts.length) {
    const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
    const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
    const candidates = inserts.map(({ index }) => ({
      ...validRows[index],
      revision: 1,
      updated_by_device_id: deviceId,
      ...(TABLES_WITH_UPDATED_AT.has(entityTable) ? { updated_at: flushedAt } : {}),
    }));
    try {
      const persisted = await insertRowsReturning(client, entityTable, candidates);
      const persistedById = new Map(persisted.map((row: any) => [row.id, row]));
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

export async function recordAtomicReview(client: any, input: any, { deviceId, mutationId }: any = {}) {
  const user = await getAuthenticatedUser(client);
  const deck = input?.deck;
  const card = input?.card;
  const variant = input?.variant;
  const event = input?.event;
  const eventRow = reviewEventToCloudRow(event, deck, user.id, { deviceId });
  const { data, error } = await client.rpc("record_review_atomic", {
    p_deck_id: deck?.id,
    p_deck_base_revision: Number(input?.baseRevisions?.deck ?? deck?.revision ?? 1),
    p_card_id: card?.id,
    p_card_base_revision: Number(input?.baseRevisions?.card ?? card?.revision ?? 1),
    p_card_review_state: toJson(card?.learningItemState ?? card?.reviewState, {}),
    p_card_core_state: toJson(card?.coreState, {}),
    p_card_updated_at: card?.updatedAt ?? event?.answeredAt,
    p_variant_id: variant?.id ?? null,
    p_variant_base_revision: variant ? Number(input?.baseRevisions?.variant ?? variant.revision ?? 1) : null,
    p_variant_review_state: variant ? toJson(variant.reviewState, {}) : null,
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
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Die atomare Review-Antwort hatte ein ungültiges Format.");
  }
  const response = data as Record<string, unknown>;
  const rows = {
    deck: validateAccountRows("decks", [response.deck])[0],
    card: validateAccountRows("cards", [response.card])[0],
    variant: response.variant == null ? null : validateAccountRows("card_variants", [response.variant])[0],
    event: validateAccountRows("review_events", [response.event])[0],
  };
  return {
    acknowledgedMutationId: mutationId,
    rows,
    entities: {
      deck: deckFromRow(rows.deck),
      card: cardFromRow(rows.card, []),
      variant: rows.variant ? variantFromRow(rows.variant) : null,
    },
  };
}

function sourceSnapshotRowsEqual(left: any, right: any) {
  return rowsHaveSameContent(left, right);
}

function orderMissingSourceSnapshots(rows: any[], remoteRows: any[]) {
  const remoteIds = new Set(toArray(remoteRows).map((row: any) => row.id));
  const missingById = new Map(rows.map((row: any) => [row.id, row]));
  const ordered: any[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(row: any) {
    if (visited.has(row.id)) return;
    if (visiting.has(row.id)) throw new Error(`Quell-Snapshot-Kette bei ${row.id} ist zyklisch.`);
    visiting.add(row.id);
    const previousId = row.previous_snapshot_id;
    if (previousId && !remoteIds.has(previousId)) {
      const previous = missingById.get(previousId);
      if (!previous) throw new Error(`Vorgänger-Snapshot ${previousId} für ${row.id} fehlt.`);
      visit(previous);
    }
    visiting.delete(row.id);
    visited.add(row.id);
    ordered.push(row);
  }

  for (const row of rows) visit(row);
  return ordered;
}

async function selectSourceSnapshotsById(client: any, userId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: any[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += CLOUD_WRITE_ROW_LIMIT) {
    const batch = uniqueIds.slice(offset, offset + CLOUD_WRITE_ROW_LIMIT);
    const { data, error } = await client
      .from("learning_item_source_snapshots")
      .select("*")
      .eq("user_id", userId)
      .in("id", batch);
    if (error) throw error;
    rows.push(...validateAccountRows("learning_item_source_snapshots", data ?? []));
  }
  return rows;
}

async function appendMissingSourceSnapshots(client: any, userId: string, desiredRows: any[], remoteRows: any[]) {
  const remoteById = new Map(toArray(remoteRows).map((row: any) => [row.id, row]));
  for (const desired of desiredRows) {
    const remote = remoteById.get(desired.id);
    if (remote && !sourceSnapshotRowsEqual(desired, remote)) {
      const conflict = new Error(`Quell-Snapshot ${desired.id} ist in der Cloud bereits mit anderem Inhalt vorhanden.`) as Error & { code: string };
      conflict.code = "source_snapshot_immutable_conflict";
      throw conflict;
    }
  }

  const missing = orderMissingSourceSnapshots(
    desiredRows.filter((row: any) => !remoteById.has(row.id)),
    remoteRows,
  );
  if (!missing.length) return validateAccountRows("learning_item_source_snapshots", remoteRows);
  await upsertRows(client, "learning_item_source_snapshots", missing, { ignoreDuplicates: true });

  const confirmed = await selectSourceSnapshotsById(client, userId, missing.map((row: any) => row.id));
  const confirmedById = new Map(confirmed.map((row: any) => [row.id, row]));
  for (const desired of missing) {
    const persisted = confirmedById.get(desired.id);
    if (!persisted || !sourceSnapshotRowsEqual(desired, persisted)) {
      const mismatch = new Error(`Quell-Snapshot ${desired.id} konnte nicht unverändert in der Cloud bestätigt werden.`) as Error & { code: string };
      mismatch.code = "source_snapshot_confirmation_failed";
      throw mismatch;
    }
  }
  return validateAccountRows("learning_item_source_snapshots", uniqueRowsById([...remoteRows, ...confirmed]));
}

export async function upsertAccountCloudProfile(client: any, profile: any, { mutationId, flushedAt }: any = {}) {
  const resolvedMutationId = requireNonEmptyString(mutationId, "Mutation-ID fehlt.");
  const writeTimestamp = requireTimestamp(flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  await saveCloudProfile(client, profile, writeTimestamp);
  return { acknowledgedMutationId: resolvedMutationId };
}

function acknowledgeRestoreState(state: any, rows: Record<string, any[]>) {
  const byId = (table: string) => new Map(rows[table].map((row: any) => [row.id, row]));
  const decks = byId("decks");
  const cards = byId("cards");
  const variants = byId("card_variants");
  const documents = byId("source_documents");
  const definitions = byId("note_type_definitions");
  return {
    ...state,
    decks: toArray(state.decks).map((deck: any) => ({
      ...deck,
      ...syncMetadataFromRow(decks.get(deck.id)),
      cards: toArray(deck.cards).map((card: any) => ({
        ...card,
        ...syncMetadataFromRow(cards.get(card.id)),
        variants: toArray(card.variants).map((variant: any) => ({ ...variant, ...syncMetadataFromRow(variants.get(variant.id)) })),
      })),
      sourceDocuments: toArray(deck.sourceDocuments).map((document: any) => ({ ...document, ...syncMetadataFromRow(documents.get(document.id)) })),
    })),
    documents: toArray(state.documents).map((document: any) => ({ ...document, ...syncMetadataFromRow(documents.get(document.id)) })),
    noteTypeDefinitions: toArray(state.noteTypeDefinitions).map((definition: any) => ({ ...definition, ...syncMetadataFromRow(definitions.get(definition.id)) })),
    cloudTombstones: [],
  };
}

export async function replaceAccountCloudState(client: any, state: any, { deviceId }: any = {}) {
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const user = await getAuthenticatedUser(client);
  const [remoteRows, mediaResult] = await Promise.all([
    loadAccountRows(client, user.id),
    selectMediaRows(client, user.id),
  ]);
  const mediaRows = mediaResult;
  const mediaParentIds = {
    decks: new Set(mediaRows.map((row) => row.deck_id).filter(Boolean)),
    cards: new Set(mediaRows.map((row) => row.card_id).filter(Boolean)),
  };
  const rows: Record<string, any[]> = createCloudStateRows(state, user.id, { deviceId: resolvedDeviceId });
  const desiredCardIds = new Set(rows.cards.map((row: any) => row.id));
  const mediaReferencedNoteTypeDefinitionIds = new Set(
    toArray(remoteRows.cards)
      .filter((row: any) => mediaParentIds.cards.has(row.id) && !desiredCardIds.has(row.id))
      .map((row: any) => row.note_type_definition_id)
      .filter(Boolean),
  );

  for (const table of REVISIONED_TABLES) {
    const remoteById = new Map(toArray(remoteRows[table]).map((row: any) => [row.id, row]));
    rows[table] = rows[table].map((row: any) => ({
      ...row,
      revision: remoteById.has(row.id) ? normalizeRevision(remoteById.get(row.id).revision) + 1 : 1,
      updated_by_device_id: resolvedDeviceId,
    }));
  }

  await saveCloudProfile(client, state.profile ?? {});
  await upsertRows(client, "source_documents", rows.source_documents);
  await upsertRows(client, "decks", rows.decks);
  await upsertRows(client, "note_type_definitions", rows.note_type_definitions);
  const remoteCardsById = new Map(toArray(remoteRows.cards).map((row: any) => [row.id, row]));
  const initialCardRows = rows.cards.map((row: any) => ({
    ...row,
    latest_source_snapshot_id: remoteCardsById.get(row.id)?.latest_source_snapshot_id ?? null,
  }));
  await upsertRows(client, "cards", initialCardRows);
  await appendMissingSourceSnapshots(client, user.id, rows.learning_item_source_snapshots, remoteRows.learning_item_source_snapshots);
  await upsertRows(client, "cards", rows.cards);
  await upsertRows(client, "card_variants", rows.card_variants);
  await upsertRows(client, "review_events", rows.review_events);

  const deletedAt = nowIso();
  for (const table of DELETE_ORDER) {
    await deleteRowsMissingFromState(client, table, user.id, rows[table], {
      protectedIds: table === "decks"
        ? mediaParentIds.decks
        : table === "cards"
          ? mediaParentIds.cards
          : table === "note_type_definitions"
            ? mediaReferencedNoteTypeDefinitionIds
            : new Set(),
      deletedAt,
      deviceId: resolvedDeviceId,
    });
  }

  return {
    state: acknowledgeRestoreState(state, rows),
    summary: summarizeCloudRows(rows),
  };
}

function syncConflictFromRow(row: any) {
  return createConflictProjection(row);
}

function conflictTargetKey(row: any) {
  return `${row.entity_table}\u0000${row.entity_id}`;
}

async function selectCurrentConflictRows(client: any, userId: string, rows: any[]) {
  const idsByTable = new Map<AccountTable, string[]>();
  for (const row of rows) {
    const table = row.entity_table as AccountTable;
    idsByTable.set(table, [...(idsByTable.get(table) ?? []), row.entity_id]);
  }
  const selections = await Promise.all([...idsByTable].map(async ([table, ids]) => [
    table,
    await selectRowsByField(client, table, userId, "id", ids),
  ] as const));
  return new Map(selections.flatMap(([table, currentRows]) => currentRows.map((row: any) => [`${table}\u0000${row.id}`, row])));
}

async function refreshConflictRemote(client: any, userId: string, row: any, currentRemote: any) {
  const currentRevision = currentRemote?.revision == null ? null : normalizeRevision(currentRemote.revision);
  const savedRevision = row.remote_revision == null ? null : normalizeRevision(row.remote_revision);
  if (currentRevision === savedRevision) return { row, checked: true, currentRemote };
  const { data, error } = await client.from("sync_conflicts")
    .update({ remote_value: conflictValue(currentRemote ?? {}), remote_revision: currentRevision })
    .eq("user_id", userId)
    .eq("id", row.id)
    .select("*");
  if (error) throw error;
  return {
    row: data?.[0] ?? { ...row, remote_value: conflictValue(currentRemote ?? {}), remote_revision: currentRevision },
    checked: true,
    currentRemote,
  };
}

async function closeObsoleteConflict(client: any, userId: string, row: any, remoteSnapshot: { checked: boolean; currentRemote: any } = { checked: false, currentRemote: null }) {
  const localValue = conflictValue(row.local_value ?? {});
  const remoteValue = conflictValue(row.remote_value ?? {});
  let obsolete = rowsHaveSameContent(localValue, remoteValue, row.entity_table);
  if (!obsolete && remoteSnapshot.checked) obsolete = Boolean(remoteSnapshot.currentRemote && rowsHaveSameContent(localValue, remoteSnapshot.currentRemote, row.entity_table));
  if (!obsolete) return row;
  const resolvedAt = nowIso();
  const { data, error } = await client.from("sync_conflicts")
    .update({ status: "resolved", resolution: { action: "automatic-repair" }, resolved_at: resolvedAt })
    .eq("user_id", userId)
    .eq("id", row.id)
    .select("*");
  if (error) throw error;
  return data?.[0] ?? { ...row, status: "resolved", resolved_at: resolvedAt };
}

export async function listAccountSyncConflicts(client: any, { refreshRemote = false }: { refreshRemote?: boolean } = {}) {
  const user = await getAuthenticatedUser(client);
  const activeRows = (await selectOptionalRows(client, "sync_conflicts", user.id))
    .filter((row: any) => row.status === "open" || row.status === "ignored");
  const rowsToCheck = activeRows.filter((row: any) => REVISIONED_TABLE_SET.has(row.entity_table) && (
    refreshRemote || !rowsHaveSameContent(conflictValue(row.local_value ?? {}), conflictValue(row.remote_value ?? {}), row.entity_table)
  ));
  const checkedTargets = new Set(rowsToCheck.map(conflictTargetKey));
  const currentRows = await selectCurrentConflictRows(client, user.id, rowsToCheck);
  const snapshots = await Promise.all(activeRows.map(async (row: any) => {
    const checked = checkedTargets.has(conflictTargetKey(row));
    const currentRemote = currentRows.get(conflictTargetKey(row)) ?? null;
    return refreshRemote && checked
      ? refreshConflictRemote(client, user.id, row, currentRemote)
      : { row, checked, currentRemote };
  }));
  const rows = await Promise.all(snapshots.map(({ row, ...snapshot }: any) => closeObsoleteConflict(client, user.id, row, snapshot)));
  const statusOrder: Record<string, number> = { open: 0, ignored: 1 };
  return rows
    .filter((row: any) => row.status === "open" || row.status === "ignored")
    .sort((left: any, right: any) => (statusOrder[left.status] - statusOrder[right.status]) || String(right.created_at).localeCompare(String(left.created_at)))
    .map(syncConflictFromRow);
}

function normalizeConflictDecision(decision: any = {}, conflictRow: any = {}) {
  const action = requireNonEmptyString(decision.action, "Konfliktentscheidung fehlt.");
  if (!CONFLICT_ACTIONS.has(action)) throw new Error("Konfliktentscheidung ist ungültig.");
  const localValue = conflictValue(conflictRow.local_value ?? {});
  const remoteValue = conflictValue(conflictRow.remote_value ?? {});
  const fields = conflictFieldKeys(localValue, remoteValue);
  const tombstone = Boolean(localValue.deleted_at || remoteValue.deleted_at || Object.keys(localValue).length === 0 || Object.keys(remoteValue).length === 0);

  if (action !== "merge-fields") return { action, fieldChoices: {}, localValue, remoteValue, fields, tombstone };
  if (tombstone) throw new Error("Gelöschte Inhalte können nicht feldweise zusammengeführt werden.");
  const fieldChoices = decision.fieldChoices && typeof decision.fieldChoices === "object" ? decision.fieldChoices : {};
  for (const field of Object.keys(fieldChoices)) {
    if (!fields.includes(field) || CONFLICT_PROTECTED_FIELDS.has(field)) throw new Error(`Konfliktfeld ist nicht auswählbar: ${field}`);
    if (fieldChoices[field] !== "local" && fieldChoices[field] !== "remote") throw new Error(`Auswahl für ${field} ist ungültig.`);
  }
  const missing = fields.filter((field: any) => fieldChoices[field] !== "local" && fieldChoices[field] !== "remote");
  if (missing.length) throw new Error("Bitte entscheide jedes geänderte Feld.");
  return { action, fieldChoices: Object.fromEntries(fields.map((field: any) => [field, fieldChoices[field]])), localValue, remoteValue, fields, tombstone };
}

function chosenConflictRow(normalized: any) {
  if (normalized.action === "keep-local") return { ...normalized.localValue };
  if (normalized.action === "keep-remote") return { ...normalized.remoteValue };
  if (normalized.action !== "merge-fields") return null;
  const chosen = { ...normalized.remoteValue };
  for (const field of normalized.fields) chosen[field] = normalized.fieldChoices[field] === "local" ? normalized.localValue[field] : normalized.remoteValue[field];
  return chosen;
}

async function persistConflictChoice(client: any, user: any, conflictRow: any, normalized: any, { deviceId, resolvedAt }: any) {
  const entityTable = conflictRow.entity_table;
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Konfliktauflösung ist für ${entityTable} nicht unterstützt.`);
  const currentRemote = await selectRowById(client, entityTable, user.id, conflictRow.entity_id);
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
    return selectRowById(client, entityTable, user.id, conflictRow.entity_id);
  }

  const candidate = {
    ...chosen,
    id: conflictRow.entity_id,
    user_id: user.id,
    created_at: chosen?.created_at ?? currentRemote?.created_at ?? resolvedAt,
    revision: currentRemoteRevision == null ? 1 : currentRemoteRevision + 1,
    updated_by_device_id: deviceId,
    ...(TABLES_WITH_UPDATED_AT.has(entityTable) ? { updated_at: resolvedAt } : {}),
  };
  if (!currentRemote) {
    const { data, error } = await client.from(entityTable).insert(candidate).select("*");
    if (error) throw error;
    return data?.[0] ?? null;
  }
  const payload = updatePayload(candidate, { revision: candidate.revision, deviceId, now: () => resolvedAt });
  const { data, error } = await client
    .from(entityTable)
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", conflictRow.entity_id)
    .eq("revision", currentRemoteRevision)
    .select("*");
  if (error) throw error;
  if (!data?.[0]) throw new SyncConflictChangedError();
  return data[0];
}

async function updateConflictResolution(client: any, user: any, conflictRow: any, normalized: any, { deviceId, resolvedAt }: any) {
  const ignored = normalized.action === "ignore";
  const reopened = normalized.action === "reopen";
  const payload = {
    status: ignored ? "ignored" : reopened ? "open" : "resolved",
    resolution: reopened ? {} : { action: normalized.action, fieldChoices: normalized.fieldChoices },
    resolved_at: ignored || reopened ? null : resolvedAt,
    updated_by_device_id: deviceId,
  };
  const { data, error } = await client
    .from("sync_conflicts")
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", conflictRow.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Der Synchronisierungskonflikt wurde nicht gefunden.");
  return data;
}

export async function resolveAccountSyncConflict(client: any, conflictId: any, decision: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  const id = requireNonEmptyString(conflictId, "Konflikt-ID fehlt.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  const resolvedAt = requireTimestamp(options.resolvedAt, nowIso, "Konfliktzeitpunkt ist ungültig.");
  const conflictRow = await selectRowById(client, "sync_conflicts", user.id, id);
  if (!conflictRow) throw new Error("Der Synchronisierungskonflikt wurde nicht gefunden.");
  const normalized = normalizeConflictDecision(decision, conflictRow);

  if (conflictRow.status === "resolved") {
    return {
      conflict: syncConflictFromRow(conflictRow),
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
    conflict: syncConflictFromRow(updatedConflict),
    resolvedPage: persisted ? {
      table: conflictRow.entity_table,
      entities: projectCloudEntities(conflictRow.entity_table, [persisted]),
      reset: false,
    } : null,
    resolutionTarget: { table: conflictRow.entity_table, entityId: conflictRow.entity_id, action: normalized.action },
    resolved: !["ignore", "reopen"].includes(normalized.action),
  };
}
