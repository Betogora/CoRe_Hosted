import { createCloudProfile, saveCloudProfile } from "./cloudAuth.ts";
import { createCoreDeck } from "./coreModel.ts";
import type { CardVariant, ImportVerificationRepairScope, ImportVerificationScope } from "./coreTypes.ts";
import {
  validateAccountRows,
  validateAccountStatistics,
  validateCardCatalogRows,
  validateDeckStudySummary,
  validateDeckStudySummaryRows,
  validateAccountStudyOverview,
  validateIdRows,
  validateMediaAssetRows,
  validateOfflineManifestRows,
  validateProfileRows,
  type AccountTable,
  type MediaAssetRow,
} from "./cloudRepositoryValidation.ts";
import { requireCompleteProfile } from "./profileIntegrity.ts";
import type {
  AccountStatisticsSnapshot,
  CardCatalogEntry,
  CatalogPage,
  CatalogPageRequest,
  DeckStudySummary,
  AccountStudyOverview,
  OfflineCardManifestEntry,
  OfflineMediaManifestEntry,
} from "./workspaceReplica.ts";

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

const ACCOUNT_TABLES = ["decks", "note_type_definitions", "cards", "card_variants", "review_events"];
const REVISIONED_TABLES = ["decks", "note_type_definitions", "cards", "card_variants"];
const REVISIONED_TABLE_SET = new Set(REVISIONED_TABLES);
const TABLES_WITH_UPDATED_AT = new Set(["decks", "note_type_definitions", "cards", "card_variants"]);
const CARD_MODEL_META_KEY = "__coreModel";
const ROW_IDENTITY_FIELDS = new Set(["id", "user_id", "created_at", "updated_at", "sync_change_id", "revision", "updated_by_device_id"]);
const COMPARABLE_TIMESTAMP_FIELDS = new Set(["answered_at", "deleted_at"]);
const TECHNICAL_CONTENT_FIELDS = new Set(["local_owner_id", "content_hash"]);
const TECHNICAL_CONTENT_FIELDS_BY_TABLE: Record<string, Set<string>> = {
  decks: new Set(["card_count", "hierarchy_path", "import_meta"]),
  cards: new Set(["content_revision", "review_state", "core_state"]),
  card_variants: new Set(["performance"]),
};
const CLOUD_PAGE_SIZE = 500;
const CLOUD_WRITE_ROW_LIMIT = 250;
const CLOUD_WRITE_BYTE_LIMIT = 1024 * 1024;
const CLOUD_WRITE_CONCURRENCY = 4;
const EMPTY_DELTA_CURSOR_VALUE = "0";
const CONFLICT_PROTECTED_FIELDS = new Set([
  ...ROW_IDENTITY_FIELDS,
  ...TECHNICAL_CONTENT_FIELDS,
  "deck_id",
  "card_id",
  "note_type_definition_id",
  "source_card_id",
  "local_owner_id",
  "parent_deck_id",
  "original_deck_id",
  "model_run_id",
  "card_count",
  "hierarchy_path",
  "import_meta",
  "content_revision",
  "review_state",
  "core_state",
  "performance",
]);

const CONFLICT_ACTIONS = new Set(["keep-local", "keep-remote", "merge-fields", "ignore", "reopen"]);
const CONFLICT_ENTITY_LABELS = Object.freeze({
  decks: "Stapel",
  note_type_definitions: "Notiztyp",
  cards: "Karte",
  card_variants: "Variante",
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
  kind: "Kartentyp",
  note_type_definition_id: "Notiztyp",
  content_document: "Inhaltsdokument",
  content_revision: "Inhaltsrevision",
  draft_status: "Entwurfsstatus",
  status: "Status",
  original_front: "Vorderseite",
  original_back: "Rückseite",
  original_fields: "Originalfelder",
  original_tags: "Original-Tags",
  original_html: "Originalformatierung",
  media_refs: "Medien",
  content_hash: "Inhaltsprüfsumme",
  review_state: "Lernstand",
  core_state: "CoRe-Status",
  meta: "Metadaten",
  front: "Vorderseite",
  back: "Rückseite",
  variant_type: "Variantentyp",
  variant_level: "Variantenstufe",
  is_active: "Aktiv",
  transform_type: "Transformation",
  transform_profile: "Transformationsprofil",
  explanation: "Erklärung",
  confidence: "Konfidenz",
  semantic_delta: "Semantische Abweichung",
  changed_recognition_cues: "Geänderte Erkennungshinweise",
  quality_status: "Qualitätsstatus",
  projection: "Kartenprojektion",
  performance: "Leistungsdaten",
  feedback: "Feedback",
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
  return source || "manual";
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

function authenticatedUserForKnownSession(client: any, userId?: string) {
  if (!userId) return getAuthenticatedUser(client);
  if (!client?.auth || !client?.from) throw new Error("Supabase ist noch nicht konfiguriert.");
  return Promise.resolve({ id: requireNonEmptyString(userId, "Nutzer-ID fehlt.") });
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
  const [decks, definitions, cards, variants, reviews] = await Promise.all([
    selectRowsByField(client, "decks", user.id, "id", scope.deckIds),
    selectRowsByField(client, "note_type_definitions", user.id, "id", scope.noteTypeDefinitionIds),
    selectRowsByField(client, "cards", user.id, "id", scope.cardIds),
    selectRowsByField(client, "card_variants", user.id, "id", scope.variantIds),
    selectRowsByField(client, "review_events", user.id, "id", scope.reviewEventIds),
  ]);

  const repairScope: ImportVerificationRepairScope = {
    deckIds: missingVerifiedRows(scope.deckIds, decks),
    noteTypeDefinitionIds: missingVerifiedRows(scope.noteTypeDefinitionIds, definitions),
    cardIds: missingVerifiedRows(scope.cardIds, cards),
    variantIds: missingVerifiedRows(scope.variantIds, variants),
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
  for (const card of cards.filter((row) => !row.deleted_at)) {
    if (!expectedDeckIds.has(String(card.deck_id))) throw new Error(`Karte ${card.id} ist dem falschen Stapel zugeordnet.`);
    if (!expectedDefinitionIds.has(String(card.note_type_definition_id))) throw new Error(`Karte ${card.id} verweist auf einen unerwarteten Notiztyp.`);
  }

  const expectedCardIds = new Set(scope.cardIds);
  for (const variant of variants.filter((row) => !row.deleted_at)) {
    const cardId = String(variant.card_id ?? "");
    if (!expectedCardIds.has(cardId)) throw new Error(`Variante ${variant.id} verweist auf eine unerwartete Karte.`);
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
    noteTypeDefinitions: scope.noteTypeDefinitionIds.length,
    reviewEvents: scope.reviewEventIds.length,
  };
}

export interface AccountBootstrapV2Page {
  profile: ReturnType<typeof createCloudProfile>;
  decks: Array<{ deck: ReturnType<typeof deckFromRow>; summary: DeckStudySummary }>;
  nextCursor: string;
  hasMore: boolean;
  confirmedEmpty: boolean;
  conflictCount: number;
  serverCatalogCursor: number;
  studyOverview?: AccountStudyOverview;
}

export async function loadAccountCloudBootstrapV2(
  client: any,
  user: { id: string; email?: string | null },
  { cursor = "", limit = 200, maxBytes = 200 * 1024 }: { cursor?: string; limit?: number; maxBytes?: number } = {},
): Promise<AccountBootstrapV2Page> {
  const userId = requireNonEmptyString(user?.id, "Nutzer-ID fehlt.");
  const { data, error } = await client.rpc("get_account_bootstrap_v2", {
    p_cursor: cursor,
    p_limit: Math.min(500, Math.max(1, Math.floor(limit))),
    p_max_bytes: Math.min(200 * 1024, Math.max(64 * 1024, Math.floor(maxBytes))),
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Account-Bootstrap-v2-Antwort ist ungültig.");
  const candidate = data as Record<string, unknown>;
  if (!Array.isArray(candidate.decks) || typeof candidate.nextCursor !== "string" || typeof candidate.hasMore !== "boolean" || typeof candidate.confirmedEmpty !== "boolean") {
    throw new Error("Account-Bootstrap-v2-Antwort ist unvollständig.");
  }
  const conflictCount = Number(candidate.conflictCount ?? 0);
  const serverCatalogCursor = Number(candidate.serverCatalogCursor ?? 0);
  if (!Number.isSafeInteger(conflictCount) || conflictCount < 0 || !Number.isSafeInteger(serverCatalogCursor) || serverCatalogCursor < 0) {
    throw new Error("Account-Bootstrap-v2 enthält ungültige Zähler.");
  }
  const profileRows = candidate.profile == null ? [] : validateProfileRows([candidate.profile]);
  const decks = candidate.decks.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Account-Bootstrap-v2 enthält einen ungültigen Stapel.");
    const entry = value as Record<string, unknown>;
    const [deck] = validateAccountRows("decks", [entry.deck]);
    return { deck: deckFromRow(deck), summary: validateDeckStudySummary(entry.summary) };
  });
  return {
    profile: createCloudProfile(profileRows[0] ?? null, { id: userId, email: user.email ?? null }),
    decks,
    nextCursor: candidate.nextCursor,
    hasMore: candidate.hasMore,
    confirmedEmpty: candidate.confirmedEmpty,
    conflictCount,
    serverCatalogCursor,
    studyOverview: candidate.studyOverview == null ? undefined : validateAccountStudyOverview(candidate.studyOverview),
  };
}

const CATALOG_TABLES = ["decks", "card_catalog", "deck_study_summaries"] as const;
export type CatalogCloudTable = typeof CATALOG_TABLES[number];

export interface CloudCatalogPage {
  table: CatalogCloudTable;
  entities: Array<Record<string, unknown> | CardCatalogEntry | DeckStudySummary>;
  reset: boolean;
  cursor: number;
  advanceCursor?: boolean;
}

function validateCatalogDeltaResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Katalog-Delta-Antwort ist ungültig.");
  const candidate = value as Record<string, unknown>;
  const nextCursor = Number(candidate.nextCursor);
  if (!Number.isSafeInteger(nextCursor) || nextCursor < 0 || !Array.isArray(candidate.changes) || typeof candidate.hasMore !== "boolean") {
    throw new Error("Katalog-Delta-Antwort ist unvollständig.");
  }
  const changes = candidate.changes.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Katalog-Delta-Eintrag ist ungültig.");
    const entry = value as Record<string, unknown>;
    const table = String(entry.table) as CatalogCloudTable;
    if (!CATALOG_TABLES.includes(table) || !entry.row || typeof entry.row !== "object" || Array.isArray(entry.row)) {
      throw new Error("Katalog-Delta-Eintrag ist unvollständig.");
    }
    return { table, row: entry.row };
  });
  return { changes, nextCursor, hasMore: candidate.hasMore };
}

export async function streamAccountCatalogChanges(
  client: any,
  cursor: number,
  onPage: (page: CloudCatalogPage) => Promise<void>,
): Promise<number> {
  let next = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
  while (true) {
    const { data, error } = await client.rpc("pull_account_catalog_delta", {
      p_cursor: next,
      p_limit: CLOUD_PAGE_SIZE,
      p_max_bytes: CLOUD_WRITE_BYTE_LIMIT,
    });
    if (error) throw error;
    const delta = validateCatalogDeltaResponse(data);
    if (delta.hasMore && delta.nextCursor <= next) throw new Error("Katalog-Delta-Cursor konnte nicht fortgesetzt werden.");
    for (const [tableIndex, table] of CATALOG_TABLES.entries()) {
      const rows = delta.changes.filter((change) => change.table === table).map((change) => change.row);
      const entities = table === "decks"
        ? projectCloudEntities("decks", validateAccountRows("decks", rows))
        : table === "card_catalog"
          ? validateCardCatalogRows(rows)
          : validateDeckStudySummaryRows(rows);
      await onPage({ table, entities, reset: false, cursor: delta.nextCursor, advanceCursor: tableIndex === CATALOG_TABLES.length - 1 });
    }
    next = delta.nextCursor;
    if (!delta.hasMore) return next;
  }
}

export async function listAccountCardCatalog(client: any, request: CatalogPageRequest): Promise<CatalogPage> {
  const { data, error } = await client.rpc("list_account_card_catalog", {
    p_deck_id: request.deckId,
    p_query: request.query ?? "",
    p_sort_field: request.sort?.field ?? "sortField",
    p_sort_direction: request.sort?.direction ?? "asc",
    p_cursor: request.cursor ?? null,
    p_limit: Math.min(50, Math.max(1, Math.floor(request.limit ?? 50))),
    p_include_total: request.knownTotalCount == null,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Kartenkatalog-Seite ist ungültig.");
  const candidate = data as Record<string, unknown>;
  const totalCount = candidate.totalCount == null ? request.knownTotalCount : Number(candidate.totalCount);
  if (!Array.isArray(candidate.items) || !Number.isSafeInteger(totalCount) || totalCount! < 0 || typeof candidate.hasMore !== "boolean") {
    throw new Error("Kartenkatalog-Seite ist unvollständig.");
  }
  const nextCursor = candidate.nextCursor == null ? null : candidate.nextCursor;
  if (nextCursor != null && (typeof nextCursor !== "object" || Array.isArray(nextCursor)
    || typeof (nextCursor as Record<string, unknown>).sortValue !== "string"
    || typeof (nextCursor as Record<string, unknown>).id !== "string")) {
    throw new Error("Kartenkatalog-Cursor ist ungültig.");
  }
  return {
    items: validateCardCatalogRows(candidate.items),
    totalCount: totalCount!,
    hasMore: candidate.hasMore,
    nextCursor: nextCursor as CatalogPage["nextCursor"],
  };
}

export async function hydrateAccountCards(client: any, cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (ids.length > 50) throw new Error("Höchstens 50 Karten können gleichzeitig geladen werden.");
  const { data, error } = await client.rpc("hydrate_account_cards", { p_card_ids: ids });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Kartenkörper-Antwort ist ungültig.");
  const candidate = data as Record<string, unknown>;
  const cards = validateAccountRows("cards", candidate.cards);
  const variants = validateAccountRows("card_variants", candidate.variants);
  const definitions = validateAccountRows("note_type_definitions", candidate.noteTypeDefinitions);
  return {
    cards: projectCloudEntities("cards", cards),
    variants: projectCloudEntities("card_variants", variants),
    noteTypeDefinitions: projectCloudEntities("note_type_definitions", definitions),
  };
}

export interface DeckOfflineManifestPage {
  cards: OfflineCardManifestEntry[];
  media: OfflineMediaManifestEntry[];
  nextCursor: string;
  hasMore: boolean;
  totalCount: number;
}

export async function loadDeckOfflineManifest(
  client: any,
  deckId: string,
  cursor = "",
): Promise<DeckOfflineManifestPage> {
  const { data, error } = await client.rpc("get_deck_offline_manifest", {
    p_deck_id: deckId,
    p_cursor: cursor,
    p_limit: 50,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Offline-Manifest-Antwort ist ungültig.");
  const candidate = data as Record<string, unknown>;
  const totalCount = Number(candidate.totalCount);
  if (typeof candidate.nextCursor !== "string" || typeof candidate.hasMore !== "boolean" || !Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new Error("Offline-Manifest-Antwort ist unvollständig.");
  }
  const rows = validateOfflineManifestRows({ cards: candidate.cards, media: candidate.media });
  return { ...rows, nextCursor: candidate.nextCursor, hasMore: candidate.hasMore, totalCount };
}

export async function loadAccountStatistics(
  client: any,
  { deckIds = null, from = null, to = null, timeZone = "UTC", dayStartHour = 0 }: { deckIds?: string[] | null; from?: string | null; to?: string | null; timeZone?: string; dayStartHour?: number } = {},
): Promise<AccountStatisticsSnapshot> {
  const { data, error } = await client.rpc("get_account_statistics", {
    p_deck_ids: deckIds,
    p_from: from,
    p_to: to,
    p_time_zone: timeZone,
    p_day_start_hour: Math.min(23, Math.max(0, Math.floor(dayStartHour))),
  });
  if (error) throw error;
  return validateAccountStatistics(data);
}

export async function deleteAccountDeckTree(
  client: any,
  deckId: string,
  { deletedAt = new Date().toISOString(), deviceId = null }: { deletedAt?: string; deviceId?: string | null } = {},
) {
  const { data, error } = await client.rpc("delete_account_deck_tree", {
    p_deck_id: requireNonEmptyString(deckId, "Stapel-ID fehlt."),
    p_deleted_at: deletedAt,
    p_device_id: deviceId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Deckbaum-Löschantwort ist ungültig.");
  const candidate = data as Record<string, unknown>;
  if (!Array.isArray(candidate.deletedDeckIds) || candidate.deletedDeckIds.some((id) => typeof id !== "string")) {
    throw new Error("Deckbaum-Löschantwort enthält ungültige Stapel-IDs.");
  }
  const deletedCardCount = Number(candidate.deletedCardCount ?? 0);
  if (!Number.isSafeInteger(deletedCardCount) || deletedCardCount < 0) throw new Error("Deckbaum-Löschantwort enthält eine ungültige Kartenzahl.");
  return { deletedDeckIds: candidate.deletedDeckIds as string[], deletedCardCount };
}

export async function loadAccountCardVariants(client: any, { userId, cardIds }: { userId?: string; cardIds: string[] }): Promise<CardVariant[]> {
  const user = await authenticatedUserForKnownSession(client, userId);
  const rows = await selectRowsByField(client, "card_variants", user.id, "card_id", cardIds);
  return projectCloudEntities("card_variants", rows) as CardVariant[];
}

async function selectProfileRows(client: any, userId: any) {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId);
  if (error) throw error;
  return validateProfileRows(data ?? []);
}

async function selectOptionalRows(client: any, table: any, userId: any, columns: any = "*") {
  return selectKeysetRows(client, table, userId, columns, { optional: true });
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
    source: normalizeSource(card.source ?? deck.source),
    source_card_id: card.sourceCardId ?? null,
    kind: card.kind ?? card.cardType ?? "basic",
    note_type_definition_id: card.noteTypeDefinitionId ?? null,
    content_document: toJson(card.contentDocument, {}),
    projection: toJson(card.projection, {}),
    content_revision: normalizeRevision(card.contentRevision),
    draft_status: card.draftStatus ?? "accepted",
    status: card.status ?? "active",
    original_front: card.originalFront ?? card.canonicalQuestion ?? "",
    original_back: card.originalBack ?? card.canonicalAnswer ?? "",
    original_fields: toJson(card.originalFields, []),
    original_tags: toArray(card.originalTags ?? card.tags),
    original_html: card.originalHtml ?? "",
    media_refs: toArray(card.mediaRefs),
    content_hash: card.contentHash ?? null,
    review_state: toJson(card.reviewState, {}),
    core_state: toJson(card.coreState, {}),
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
    front: variant.front ?? "",
    back: variant.back ?? "",
    variant_type: variant.variantType ?? "basic",
    variant_level: variant.variantLevel ?? 1,
    is_active: variant.isActive !== false,
    transform_type: "rephrase",
    transform_profile: toJson(variant.transformProfile, {}),
    model_run_id: variant.modelRunId ?? null,
    explanation: variant.explanation ?? "",
    confidence: variant.confidence ?? null,
    semantic_delta: variant.semanticDelta ?? null,
    changed_recognition_cues: toArray(variant.changedRecognitionCues),
    quality_status: variant.qualityStatus ?? "active",
    content_hash: variant.contentHash ?? null,
    performance: toJson(variant.performance, {}),
    feedback: toJson(variant.feedback, []),
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
  const schedulerBefore = event.schedulerBefore ?? null;
  const schedulerAfter = event.schedulerAfter ?? null;
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
    flags: toJson(event.flags, {}),
    created_at: event.createdAt ?? event.answeredAt,
    created_by_device_id: event.createdByDeviceId ?? deviceId,
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

export function createCloudStateRows(state: any, userId: any, { deviceId = null }: any = {}) {
  const decks = toArray(state.decks);

  return {
    decks: uniqueRowsById(decks.map((deck: any) => deckToCloudRow(deck, userId))),
    note_type_definitions: uniqueRowsById(toArray(state.noteTypeDefinitions).map((definition: any) => noteTypeDefinitionToCloudRow(definition, userId))),
    cards: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).map((card: any) => cardToCloudRow(card, deck, userId)))),
    card_variants: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).flatMap((card: any) => toArray(card.variants).map((variant: any) => variantToCloudRow(variant, card, userId))))),
    review_events: uniqueRowsById(
      decks.flatMap((deck: any) => toArray(deck.reviewEvents).map((event: any) => reviewEventToCloudRow(event, deck, userId, { deviceId })).filter((row: any) => row.id && row.rating)),
    ),
  };
}

function variantFromRow(row: any) {
  return {
    id: row.id,
    cardId: row.card_id,
    front: row.front,
    back: row.back,
    variantType: row.variant_type,
    variantLevel: row.variant_level,
    isActive: row.is_active,
    transformType: row.transform_type,
    transformProfile: row.transform_profile,
    modelRunId: row.model_run_id,
    explanation: row.explanation,
    confidence: row.confidence,
    semanticDelta: row.semantic_delta,
    changedRecognitionCues: row.changed_recognition_cues,
    qualityStatus: row.quality_status,
    contentHash: row.content_hash,
    performance: row.performance,
    feedback: row.feedback,
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
    deckId: row.deck_id,
    source: row.source,
    sourceCardId: row.source_card_id,
    title: model.title ?? "",
    canonicalQuestion: model.canonicalQuestion ?? row.original_front,
    canonicalAnswer: model.canonicalAnswer ?? row.original_back,
    tags: model.tags ?? row.original_tags,
    concepts: model.concepts ?? [],
    sourceType: model.sourceType ?? null,
    sourceRefId: model.sourceRefId ?? row.source_card_id ?? null,
    cardType: row.kind,
    kind: row.kind,
    noteTypeDefinitionId: row.note_type_definition_id,
    contentDocument: row.content_document,
    projection: row.projection,
    contentRevision: row.content_revision,
    draftStatus: row.draft_status,
    status: row.status,
    originalFront: row.original_front,
    originalBack: row.original_back,
    originalFields: row.original_fields,
    originalTags: row.original_tags,
    originalHtml: row.original_html,
    mediaRefs: row.media_refs,
    contentHash: row.content_hash,
    reviewState: row.review_state,
    coreState: row.core_state,
    variants,
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
      reviewEvents: [],
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

function reviewEventFromRow(row: any) {
  const learningItemId = row.source_card_id ?? row.reviewable_id;

  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    reviewableType: row.reviewable_type,
    reviewableId: row.reviewable_id,
    sourceCardId: row.source_card_id,
    learningItemId,
    variantId: row.reviewable_type === "variant" ? row.reviewable_id : null,
    rating: row.rating,
    answeredAt: row.answered_at,
    responseTimeMs: row.response_time_ms,
    schedulerBefore: row.scheduler_before,
    schedulerAfter: row.scheduler_after,
    flags: toObject(row.flags),
    createdAt: row.created_at,
    createdByDeviceId: row.created_by_device_id ?? null,
  };
}

export async function registerAccountSyncDevice(client: any, device: any, { lastSeenAt, userId }: any = {}) {
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
  const { data, error } = await client
    .from("sync_devices")
    .upsert(row, { onConflict: ACCOUNT_UPSERT_CONFLICT })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Dieses Gerät konnte nicht für die Synchronisierung registriert werden.");
  return data;
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
    return { ...desiredRow, performance: remoteRow.performance };
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
}

function projectCloudEntities(table: AccountTable | "media_assets", rows: any[]) {
  if (table === "decks") return rows.map(deckFromRow);
  if (table === "cards") return rows.map((row) => cardFromRow(row, []));
  if (table === "card_variants") return rows.map(variantFromRow);
  if (table === "review_events") return rows.map(reviewEventFromRow);
  if (table === "note_type_definitions") return rows.map(noteTypeDefinitionFromRow);
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
    p_card_id: card?.id,
    p_card_review_state: toJson(card?.reviewState, {}),
    p_card_core_state: toJson(card?.coreState, {}),
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

export async function upsertAccountCloudProfile(client: any, profile: unknown, { mutationId, flushedAt }: any = {}) {
  const resolvedMutationId = requireNonEmptyString(mutationId, "Mutation-ID fehlt.");
  const writeTimestamp = requireTimestamp(flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  await saveCloudProfile(client, requireCompleteProfile(profile), writeTimestamp);
  return { acknowledgedMutationId: resolvedMutationId };
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

export async function listAccountSyncConflicts(client: any, { refreshRemote = false, userId }: { refreshRemote?: boolean; userId?: string } = {}) {
  const user = await authenticatedUserForKnownSession(client, userId);
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
  const user = await authenticatedUserForKnownSession(client, options.userId);
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
