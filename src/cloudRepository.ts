import { createCloudProfile, createProfileRow, saveCloudProfile } from "./cloudAuth.ts";
import { createCoreDeck } from "./coreModel.ts";
import type { Tables } from "./database.types.ts";
import { validateAccountRows, validateIdRows, validateProfileRows, type AccountTable } from "./cloudRepositoryValidation.ts";

export const ACCOUNT_UPSERT_CONFLICT = "user_id,id";

const ACCOUNT_TABLES = ["decks", "cards", "card_variants", "review_events", "source_documents", "ai_jobs"];
const REVISIONED_TABLES = ["source_documents", "decks", "cards", "card_variants", "ai_jobs"];
const REVISIONED_TABLE_SET = new Set(REVISIONED_TABLES);
const TABLES_WITH_UPDATED_AT = new Set(["source_documents", "decks", "cards", "card_variants"]);
const CARD_MODEL_META_KEY = "__coreModel";
const REVIEW_EVENT_META_KEY = "__coreReview";
const DELETE_ORDER = ["ai_jobs", "review_events", "card_variants", "cards", "decks", "source_documents"];
const ROW_IDENTITY_FIELDS = new Set(["id", "user_id", "created_at", "updated_at", "revision", "updated_by_device_id"]);
const CONFLICT_PROTECTED_FIELDS = new Set([
  ...ROW_IDENTITY_FIELDS,
  "deck_id",
  "card_id",
  "source_card_id",
  "local_owner_id",
  "parent_deck_id",
  "original_deck_id",
  "parent_variant_id",
  "anchor_variant_id",
  "model_run_id",
]);

const CONFLICT_ACTIONS = new Set(["keep-local", "keep-remote", "merge-fields", "ignore", "reopen"]);
const CONFLICT_ENTITY_LABELS = Object.freeze({
  decks: "Stapel",
  cards: "Karte",
  card_variants: "Variante",
  source_documents: "Dokument",
  ai_jobs: "KI-Aufgabe",
});
const CONFLICT_FIELD_LABELS = Object.freeze({
  name: "Name",
  description: "Beschreibung",
  parent_deck_id: "Übergeordneter Stapel",
  visibility: "Sichtbarkeit",
  hierarchy_path: "Stapelpfad",
  tags: "Tags",
  import_meta: "Importdaten",
  deck_settings: "Stapeleinstellungen",
  graph: "Graph",
  community_refs: "Community-Verknüpfungen",
  version_log: "Versionsverlauf",
  kind: "Kartentyp",
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
  performance: "Leistungsdaten",
  feedback: "Feedback",
  file_name: "Dateiname",
  mime_type: "Dateityp",
  text: "Dokumenttext",
  storage_url: "Speicherreferenz",
  text_extraction_status: "Texterkennung",
  metadata: "Dokumentmetadaten",
  job_type: "Aufgabentyp",
  input_ref: "Eingabe",
  policy: "Regeln",
  result_ref: "Ergebnisreferenz",
  error: "Fehler",
  started_at: "Gestartet",
  finished_at: "Beendet",
});

function nowIso() {
  return new Date().toISOString();
}

export class CloudRevisionConflictError extends Error {
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

function comparableRow(row: any = {}) {
  return Object.fromEntries(Object.entries(row).filter(([key]: any) => !ROW_IDENTITY_FIELDS.has(key)));
}

function rowsHaveSameContent(left: any, right: any) {
  return JSON.stringify(stableValue(comparableRow(left))) === JSON.stringify(stableValue(comparableRow(right)));
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
  return local.name ?? remote.name ?? local.file_name ?? remote.file_name ?? local.original_front ?? remote.original_front ?? local.front ?? remote.front ?? local.job_type ?? remote.job_type ?? row.entity_id;
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
    entityLabel: (CONFLICT_ENTITY_LABELS as Record<string, string>)[row.entity_table] ?? "Inhalt",
    title: String(conflictEntityTitle(row)),
    baseRevision: row.base_revision,
    localRevision: row.local_revision,
    remoteRevision: row.remote_revision,
    status: row.status,
    fields,
    tombstone,
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

function profileHasSameContent(profile: any, user: any, remoteRow: any) {
  if (!remoteRow) return false;
  const candidate = createProfileRow(profile, user, remoteRow.updated_at);
  const keys = Object.keys(candidate).filter((key: any) => key !== "updated_at");
  const left = Object.fromEntries(keys.map((key: any) => [key, (candidate as Record<string, unknown>)[key]]));
  const right = Object.fromEntries(keys.map((key: any) => [key, remoteRow[key]]));
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
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

function requireMutationIds(mutationIds: any) {
  if (!Array.isArray(mutationIds)) throw new Error("Mutation-IDs müssen als Liste übergeben werden.");
  return mutationIds.map((mutationId: any) => requireNonEmptyString(mutationId, "Mutation-ID fehlt."));
}

async function upsertRows(client: any, table: any, rows: any) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: ACCOUNT_UPSERT_CONFLICT });
  if (error) throw error;
}

async function selectRows<T extends AccountTable>(client: any, table: T, userId: string): Promise<Tables<T>[]>;
async function selectRows(client: any, table: AccountTable, userId: string, columns: string): Promise<Array<Record<string, unknown>>>;
async function selectRows(client: any, table: AccountTable, userId: string, columns: string = "*"): Promise<any[]> {
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId);
  if (error) throw error;
  if (columns !== "*") {
    return validateIdRows(data ?? [], table);
  }
  return validateAccountRows(table as AccountTable, data ?? []);
}

async function selectProfileRows(client: any, userId: any) {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId);
  if (error) throw error;
  return validateProfileRows(data ?? []);
}

async function selectOptionalRows(client: any, table: any, userId: any, columns: any = "*") {
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId);
  if (error) {
    if (String(error?.code ?? "") === "42P01" || /does not exist|not exist/i.test(error?.message ?? "")) return [];
    throw error;
  }
  return data ?? [];
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
  const id = conflictIdFor({ entityTable, entityId, baseRevision, remoteRevision });
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
    ignoreDuplicates: true,
  });
  if (error) throw error;
  const persisted = await selectRowById(client, "sync_conflicts", user.id, id);
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
  if (!ids.length) return;
  const { error } = await client.from(table).delete().eq("user_id", userId).in("id", ids);
  if (error) throw error;
}

async function deleteRowsMissingFromState(client: any, table: any, userId: any, keepRows: any) {
  const keepIds = new Set(keepRows.map((row: any) => row.id));
  const existingRows = await selectRows(client, table, userId, "id");
  const missingIds = existingRows.map((row: any) => row.id).filter((id: any) => !keepIds.has(id));
  await deleteRowsById(client, table, userId, missingIds);
}

export function deckToCloudRow(deck: any, userId: any) {
  return {
    id: deck.id,
    user_id: userId,
    local_owner_id: deck.ownerId ?? null,
    parent_deck_id: deck.parentDeckId ?? null,
    name: deck.name,
    description: deck.description ?? "",
    source: normalizeSource(deck.source),
    original_deck_id: deck.originalDeckId ?? null,
    visibility: deck.visibility ?? "private",
    hierarchy_path: toArray(deck.hierarchyPath),
    card_count: deck.cards?.length ?? deck.cardCount ?? 0,
    tags: toArray(deck.tags),
    import_meta: toJson(deck.importMeta, {}),
    deck_settings: toJson(deck.deckSettings, {}),
    graph: deck.graph ?? null,
    community_refs: toJson(deck.communityRefs, []),
    version_log: toJson(deck.versionLog, []),
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    ...syncFields(deck),
  };
}

export function cardToCloudRow(card: any, deck: any, userId: any) {
  return {
    id: card.id,
    user_id: userId,
    deck_id: deck.id,
    note_id: card.noteId ?? null,
    source: normalizeSource(card.source ?? deck.source),
    source_card_id: card.sourceCardId ?? null,
    source_note_id: card.sourceNoteId ?? null,
    kind: card.kind ?? card.cardType ?? "basic",
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

export function variantToCloudRow(variant: any, card: any, userId: any) {
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

export function sourceDocumentToCloudRow(document: any, userId: any) {
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

export function aiJobToCloudRow(job: any, userId: any, deckIds: any = new Set()) {
  const deckId = job.deckId && deckIds.has(job.deckId) ? job.deckId : null;

  return {
    id: job.id,
    user_id: userId,
    deck_id: deckId,
    job_type: job.jobType ?? "unknown",
    status: job.status ?? "queued",
    input_ref: toJson(job.inputRef, {}),
    policy: toJson(job.policy, {}),
    result_ref: job.resultRef ?? null,
    error: job.error ?? null,
    created_at: job.createdAt,
    started_at: job.startedAt ?? null,
    finished_at: job.finishedAt ?? null,
    ...syncFields(job),
  };
}

export function createCloudStateRows(state: any, userId: any, { deviceId = null }: any = {}) {
  const decks = toArray(state.decks);
  const deckIds = new Set(decks.map((deck: any) => deck.id));

  return {
    decks: uniqueRowsById(decks.map((deck: any) => deckToCloudRow(deck, userId))),
    cards: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).map((card: any) => cardToCloudRow(card, deck, userId)))),
    card_variants: uniqueRowsById(decks.flatMap((deck: any) => toArray(deck.cards).flatMap((card: any) => toArray(card.variants).map((variant: any) => variantToCloudRow(variant, card, userId))))),
    review_events: uniqueRowsById(
      decks.flatMap((deck: any) => toArray(deck.reviewEvents).map((event: any) => reviewEventToCloudRow(event, deck, userId, { deviceId })).filter((row: any) => row.id && row.rating)),
    ),
    source_documents: uniqueRowsById(toArray(state.documents).map((document: any) => sourceDocumentToCloudRow(document, userId))),
    ai_jobs: uniqueRowsById([...decks.flatMap((deck: any) => toArray(deck.aiJobs)), ...toArray(state.aiJobs)].map((job: any) => aiJobToCloudRow(job, userId, deckIds))),
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

function aiJobFromRow(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    jobType: row.job_type,
    status: row.status,
    inputRef: row.input_ref,
    policy: row.policy,
    resultRef: row.result_ref,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ...syncMetadataFromRow(row),
  };
}

function withoutConflictTombstone(state: any, entityTable: any, entityId: any) {
  return toArray(state.cloudTombstones).filter((item: any) => item.entityTable !== entityTable || item.entityId !== entityId);
}

function replaceOrAppendById(items: any, nextItem: any) {
  if (!nextItem) return items;
  return items.some((item: any) => item.id === nextItem.id)
    ? items.map((item: any) => item.id === nextItem.id ? nextItem : item)
    : [...items, nextItem];
}

function projectResolvedCloudEntity(state: any, cloudState: any, entityTable: any, entityId: any) {
  if (!state) return state;
  const remoteTombstone = toArray(cloudState.cloudTombstones).find((item: any) => item.entityTable === entityTable && item.entityId === entityId);
  const cloudTombstones = remoteTombstone
    ? [...withoutConflictTombstone(state, entityTable, entityId), remoteTombstone]
    : withoutConflictTombstone(state, entityTable, entityId);

  if (entityTable === "decks") {
    const remoteDeck = toArray(cloudState.decks).find((deck: any) => deck.id === entityId);
    return {
      ...state,
      decks: remoteDeck ? replaceOrAppendById(toArray(state.decks), remoteDeck) : toArray(state.decks).filter((deck: any) => deck.id !== entityId),
      cloudTombstones,
    };
  }

  if (entityTable === "cards") {
    const remoteDeck = toArray(cloudState.decks).find((deck: any) => toArray(deck.cards).some((card: any) => card.id === entityId));
    const remoteCard = remoteDeck?.cards.find((card: any) => card.id === entityId) ?? null;
    return {
      ...state,
      decks: toArray(state.decks).map((deck: any) => ({
        ...deck,
        cards: remoteCard && deck.id === remoteDeck.id
          ? replaceOrAppendById(toArray(deck.cards), remoteCard)
          : toArray(deck.cards).filter((card: any) => card.id !== entityId),
      })),
      cloudTombstones,
    };
  }

  if (entityTable === "card_variants") {
    let remoteVariant = null;
    let remoteCardId = null;
    for (const deck of toArray(cloudState.decks)) {
      for (const card of toArray(deck.cards)) {
        const candidate = toArray(card.variants).find((variant: any) => variant.id === entityId);
        if (candidate) {
          remoteVariant = candidate;
          remoteCardId = card.id;
          break;
        }
      }
      if (remoteVariant) break;
    }
    return {
      ...state,
      decks: toArray(state.decks).map((deck: any) => ({
        ...deck,
        cards: toArray(deck.cards).map((card: any) => ({
          ...card,
          variants: remoteVariant && card.id === remoteCardId
            ? replaceOrAppendById(toArray(card.variants), remoteVariant)
            : toArray(card.variants).filter((variant: any) => variant.id !== entityId),
        })),
      })),
      cloudTombstones,
    };
  }

  if (entityTable === "source_documents") {
    const remoteDocument = toArray(cloudState.documents).find((document: any) => document.id === entityId) ?? null;
    const remoteDecks = new Map(toArray(cloudState.decks).map((deck: any) => [deck.id, deck]));
    return {
      ...state,
      documents: remoteDocument
        ? replaceOrAppendById(toArray(state.documents), remoteDocument)
        : toArray(state.documents).filter((document: any) => document.id !== entityId),
      decks: toArray(state.decks).map((deck: any) => {
        const remoteDeckDocument = toArray(remoteDecks.get(deck.id)?.sourceDocuments).find((document: any) => document.id === entityId) ?? null;
        return {
          ...deck,
          sourceDocuments: remoteDeckDocument
            ? replaceOrAppendById(toArray(deck.sourceDocuments), remoteDeckDocument)
            : toArray(deck.sourceDocuments).filter((document: any) => document.id !== entityId),
        };
      }),
      cloudTombstones,
    };
  }

  if (entityTable === "ai_jobs") {
    const remoteJob = toArray(cloudState.aiJobs).find((job: any) => job.id === entityId) ?? null;
    const remoteDecks = new Map(toArray(cloudState.decks).map((deck: any) => [deck.id, deck]));
    return {
      ...state,
      aiJobs: remoteJob ? replaceOrAppendById(toArray(state.aiJobs), remoteJob) : toArray(state.aiJobs).filter((job: any) => job.id !== entityId),
      decks: toArray(state.decks).map((deck: any) => {
        const remoteDeckJob = toArray(remoteDecks.get(deck.id)?.aiJobs).find((job: any) => job.id === entityId) ?? null;
        return {
          ...deck,
          aiJobs: remoteDeckJob ? replaceOrAppendById(toArray(deck.aiJobs), remoteDeckJob) : toArray(deck.aiJobs).filter((job: any) => job.id !== entityId),
        };
      }),
      cloudTombstones,
    };
  }

  throw new Error(`Konfliktauflösung ist für ${entityTable} nicht unterstützt.`);
}

function documentsForDeck(deckCards: any, documents: any) {
  const documentIds = new Set(deckCards.flatMap((card: any) => toArray(card.sourceAnchors).map((anchor: any) => anchor.documentId)).filter(Boolean));
  return documents.filter((document: any) => documentIds.has(document.id));
}

function rowMaps(rowsByTable: any = {}) {
  return Object.fromEntries(ACCOUNT_TABLES.map((table: any) => [table, new Map(toArray(rowsByTable[table]).map((row: any) => [row.id, row]))]));
}

function createCloudTombstones(rowsByTable: any = {}) {
  return REVISIONED_TABLES.flatMap((entityTable: any) =>
    toArray(rowsByTable[entityTable])
      .filter((row: any) => row.deleted_at)
      .map((row: any) => ({
        entityTable,
        entityId: row.id,
        revision: normalizeRevision(row.revision),
        deletedAt: row.deleted_at,
        updatedByDeviceId: row.updated_by_device_id ?? null,
      })),
  );
}

function metadataById(items: any = []): Map<any, any> {
  return new Map<any, any>(toArray(items).map((item: any) => [item.id, item]));
}

function tombstoneKeys(tombstones: any = []) {
  return new Set(tombstones.map((tombstone: any) => `${tombstone.entityTable}:${tombstone.entityId}`));
}

export function reconcileCloudStateMetadata(state: any, rowsByTable: any = {}) {
  const maps = rowMaps(rowsByTable);
  const cloudTombstones = createCloudTombstones(rowsByTable);
  const deletedKeys = tombstoneKeys(cloudTombstones);
  const documents = toArray(state.documents)
    .filter((document: any) => !deletedKeys.has(`source_documents:${document.id}`))
    .map((document: any) => {
      const row = maps.source_documents.get(document.id);
      return row ? { ...document, ...syncMetadataFromRow(row), updatedAt: row.updated_at ?? document.updatedAt } : document;
    });
  const aiJobs = toArray(state.aiJobs)
    .filter((job: any) => !deletedKeys.has(`ai_jobs:${job.id}`))
    .map((job: any) => {
      const row = maps.ai_jobs.get(job.id);
      return row ? { ...job, ...syncMetadataFromRow(row) } : job;
    });
  const documentMap = metadataById(documents);
  const aiJobMap = metadataById(aiJobs);

  const decks = toArray(state.decks)
    .filter((deck: any) => !deletedKeys.has(`decks:${deck.id}`))
    .map((deck: any) => {
      const deckRow = maps.decks.get(deck.id);
      const cards = toArray(deck.cards)
        .filter((card: any) => !deletedKeys.has(`cards:${card.id}`))
        .map((card: any) => {
          const cardRow = maps.cards.get(card.id);
          const variants = toArray(card.variants)
            .filter((variant: any) => !deletedKeys.has(`card_variants:${variant.id}`))
            .map((variant: any) => {
              const variantRow = maps.card_variants.get(variant.id);
              return variantRow ? { ...variant, ...syncMetadataFromRow(variantRow) } : variant;
            });
          return cardRow ? { ...card, ...syncMetadataFromRow(cardRow), variants } : { ...card, variants };
        });
      const reviewEvents = toArray(deck.reviewEvents).map((event: any) => {
        const row = maps.review_events.get(event.id);
        return row ? reviewEventFromRow(row) : event;
      });
      const sourceDocuments = toArray(deck.sourceDocuments)
        .filter((document: any) => !deletedKeys.has(`source_documents:${document.id}`))
        .map((document: any) => documentMap.get(document.id) ?? document);
      const deckAiJobs = toArray(deck.aiJobs)
        .filter((job: any) => !deletedKeys.has(`ai_jobs:${job.id}`))
        .map((job: any) => aiJobMap.get(job.id) ?? job);

      return {
        ...deck,
        ...(deckRow ? syncMetadataFromRow(deckRow) : {}),
        cards,
        reviewEvents,
        sourceDocuments,
        aiJobs: deckAiJobs,
      };
    });

  return {
    ...state,
    decks,
    documents,
    aiJobs,
    cloudTombstones,
  };
}

export function mergeCloudSyncMetadata(state: any, acknowledgedState: any) {
  if (!acknowledgedState) return state;
  const acknowledgedDecks = metadataById(acknowledgedState.decks);
  const acknowledgedDocuments = metadataById(acknowledgedState.documents);
  const acknowledgedAiJobs = metadataById(acknowledgedState.aiJobs);
  const cloudTombstones = toArray(acknowledgedState.cloudTombstones);
  const deletedKeys = tombstoneKeys(cloudTombstones);

  const decks = toArray(state.decks)
    .filter((deck: any) => !deletedKeys.has(`decks:${deck.id}`))
    .map((deck: any) => {
      const acknowledgedDeck = acknowledgedDecks.get(deck.id);
      const acknowledgedCards = metadataById(acknowledgedDeck?.cards);
      const acknowledgedEvents = metadataById(acknowledgedDeck?.reviewEvents);
      const acknowledgedDeckDocuments = metadataById(acknowledgedDeck?.sourceDocuments);
      const acknowledgedDeckJobs = metadataById(acknowledgedDeck?.aiJobs);
      return {
        ...deck,
        ...(acknowledgedDeck
          ? {
              revision: acknowledgedDeck.revision,
              deletedAt: acknowledgedDeck.deletedAt,
              updatedByDeviceId: acknowledgedDeck.updatedByDeviceId,
            }
          : {}),
        cards: toArray(deck.cards)
          .filter((card: any) => !deletedKeys.has(`cards:${card.id}`))
          .map((card: any) => {
            const acknowledgedCard = acknowledgedCards.get(card.id);
            const acknowledgedVariants = metadataById(acknowledgedCard?.variants);
            return {
              ...card,
              ...(acknowledgedCard
                ? {
                    revision: acknowledgedCard.revision,
                    deletedAt: acknowledgedCard.deletedAt,
                    updatedByDeviceId: acknowledgedCard.updatedByDeviceId,
                  }
                : {}),
              variants: toArray(card.variants)
                .filter((variant: any) => !deletedKeys.has(`card_variants:${variant.id}`))
                .map((variant: any) => {
                  const acknowledgedVariant = acknowledgedVariants.get(variant.id);
                  return acknowledgedVariant
                    ? {
                        ...variant,
                        revision: acknowledgedVariant.revision,
                        deletedAt: acknowledgedVariant.deletedAt,
                        updatedByDeviceId: acknowledgedVariant.updatedByDeviceId,
                      }
                    : variant;
                }),
            };
          }),
        reviewEvents: toArray(deck.reviewEvents).map((event: any) => acknowledgedEvents.get(event.id) ?? event),
        sourceDocuments: toArray(deck.sourceDocuments)
          .filter((document: any) => !deletedKeys.has(`source_documents:${document.id}`))
          .map((document: any) => acknowledgedDeckDocuments.get(document.id) ?? acknowledgedDocuments.get(document.id) ?? document),
        aiJobs: toArray(deck.aiJobs)
          .filter((job: any) => !deletedKeys.has(`ai_jobs:${job.id}`))
          .map((job: any) => acknowledgedDeckJobs.get(job.id) ?? acknowledgedAiJobs.get(job.id) ?? job),
      };
    });

  return {
    ...state,
    decks,
    documents: toArray(state.documents)
      .filter((document: any) => !deletedKeys.has(`source_documents:${document.id}`))
      .map((document: any) => acknowledgedDocuments.get(document.id) ?? document),
    aiJobs: toArray(state.aiJobs)
      .filter((job: any) => !deletedKeys.has(`ai_jobs:${job.id}`))
      .map((job: any) => acknowledgedAiJobs.get(job.id) ?? job),
    cloudTombstones,
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
    cards: rows.cards.length,
    variants: rows.card_variants.length,
    reviewEvents: rows.review_events.length,
    documents: rows.source_documents.length,
    aiJobs: rows.ai_jobs.length,
  };
}

async function loadAccountRows(client: any, userId: any) {
  const values = await Promise.all(ACCOUNT_TABLES.map((table: any) => selectRows(client, table, userId)));
  return Object.fromEntries(ACCOUNT_TABLES.map((table: any, index: any) => [table, values[index]]));
}

function createRevisionWritePlans(desiredRows: any, remoteRows: any, tombstones: any = []) {
  const plans: Record<string, any> = {};

  for (const table of REVISIONED_TABLES) {
    const remoteById = new Map(toArray(remoteRows[table]).map((row: any) => [row.id, row]));
    plans[table] = toArray(desiredRows[table]).map((row: any) => {
      const remoteRow = remoteById.get(row.id);
      if (!remoteRow) return row.deleted_at ? { type: "unchanged", row } : { type: "insert", row: { ...row, revision: 1 }, baseRevision: null, remoteRow: null };
      if (row.deleted_at && remoteRow.deleted_at) return { type: "unchanged", row: remoteRow };
      if (rowsHaveSameContent(row, remoteRow)) return { type: "unchanged", row: remoteRow };
      const localRevision = normalizeRevision(row.revision);
      if (row.deleted_at) {
        return { type: "delete", row, baseRevision: localRevision, deletedAt: row.deleted_at, remoteRow };
      }
      return { type: "update", row, baseRevision: localRevision, remoteRow };
    });

    const plannedIds = new Set(plans[table].map((plan: any) => plan.row?.id).filter(Boolean));
    for (const tombstone of toArray(tombstones).filter((item: any) => item?.entityTable === table && item?.entityId && !plannedIds.has(item.entityId))) {
      const remoteRow = remoteById.get(tombstone.entityId) ?? null;
      if (!remoteRow || remoteRow.deleted_at) {
        plans[table].push({ type: "unchanged", row: remoteRow ?? { id: tombstone.entityId } });
        continue;
      }
      plans[table].push({
        type: "delete",
        row: { id: tombstone.entityId },
        baseRevision: normalizeRevision(tombstone.revision),
        deletedAt: tombstone.deletedAt,
        remoteRow,
      });
    }
  }

  return plans;
}

function updatePayload(row: any, { revision, deviceId, now }: any) {
  const payload = Object.fromEntries(Object.entries(row).filter(([key]: any) => !["id", "user_id", "created_at"].includes(key)));
  payload.revision = revision;
  payload.updated_by_device_id = deviceId ?? row.updated_by_device_id ?? null;
  if (Object.hasOwn(payload, "updated_at") && !payload.updated_at) payload.updated_at = now();
  return payload;
}

function revisionMutationResult(entityTable: any, row: any, { applied = false, idempotent = false }: any = {}) {
  return {
    entityTable,
    entityId: row?.id ?? null,
    revision: row?.revision == null ? null : normalizeRevision(row.revision),
    deletedAt: row?.deleted_at ?? null,
    updatedByDeviceId: row?.updated_by_device_id ?? null,
    applied,
    idempotent,
  };
}

async function applyRevisionedRowMutation(client: any, user: any, entityTable: any, desiredRow: any, options: any = {}) {
  if (!REVISIONED_TABLE_SET.has(entityTable)) throw new Error(`Nicht revisionierbare Cloud-Tabelle: ${entityTable}`);
  const entityId = requireNonEmptyString(desiredRow?.id, "Entitäts-ID fehlt.");
  const deviceId = requireNonEmptyString(options.deviceId, "Geräte-ID fehlt.");
  if (!Object.hasOwn(options, "baseRevision")) throw new Error("Basisrevision fehlt.");
  const baseRevision = requireBaseRevision(options.baseRevision);
  const flushedAt = requireTimestamp(options.flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  const writeNow = () => flushedAt;
  const row = { ...desiredRow, id: entityId, user_id: user.id };
  let remoteRow = Object.hasOwn(options, "remoteRow") ? options.remoteRow : await selectRowById(client, entityTable, user.id, entityId);

  if (remoteRow && rowsHaveSameContent(row, remoteRow)) {
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
    };
    const { data, error } = await client.from(entityTable).insert(candidate).select("*");
    if (!error && data?.[0]) return revisionMutationResult(entityTable, data[0], { applied: true });
    if (error && String(error.code ?? "") !== "23505" && !/duplicate/i.test(error.message ?? "")) throw error;
    remoteRow = await selectRowById(client, entityTable, user.id, entityId);
    if (remoteRow && rowsHaveSameContent(candidate, remoteRow)) {
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

  if (baseRevision === null || remoteRow.deleted_at || normalizeRevision(remoteRow.revision) !== baseRevision) {
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
  if (remoteRow && rowsHaveSameContent({ ...row, revision: nextRevision, updated_by_device_id: deviceId }, remoteRow)) {
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

export async function applyDeckMutation(client: any, deck: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  return applyRevisionedRowMutation(client, user, "decks", deckToCloudRow(deck, user.id), options);
}

export async function applyCardMutation(client: any, card: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  const deckId = requireNonEmptyString(options.deckId ?? card?.deckId, "Deck-ID der Karte fehlt.");
  return applyRevisionedRowMutation(client, user, "cards", cardToCloudRow(card, { id: deckId, source: card?.source }, user.id), options);
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

export async function softDeleteEntity(client: any, input: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  return softDeleteEntityForUser(client, user, input, options);
}

export async function markConflict(client: any, input: any, options: any = {}) {
  const user = await getAuthenticatedUser(client);
  return markConflictForUser(client, user, input, options);
}

async function insertRowsReturning(client: any, table: any, rows: any) {
  if (!rows.length) return [];
  const { data, error } = await client.from(table).insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

async function applyRevisionWritePlans(client: any, user: any, plans: any, { deviceId, flushedAt }: any) {
  for (const table of REVISIONED_TABLES) {
    const inserts = plans[table]
      .filter((plan: any) => plan.type === "insert")
      .map((plan: any) => ({
        ...plan.row,
        revision: 1,
        updated_by_device_id: deviceId ?? plan.row.updated_by_device_id ?? null,
      }));
    if (inserts.length) {
      try {
        await insertRowsReturning(client, table, inserts);
      } catch (error) {
        const databaseError = error as { code?: unknown; message?: unknown };
        if (String(databaseError.code ?? "") !== "23505" && !/duplicate/i.test(String(databaseError.message ?? ""))) throw error;
        for (const plan of plans[table].filter((item: any) => item.type === "insert")) {
          await applyRevisionedRowMutation(client, user, table, plan.row, {
            deviceId,
            baseRevision: null,
            flushedAt,
          });
        }
      }
    }

    for (const plan of plans[table].filter((item: any) => item.type === "update")) {
      await applyRevisionedRowMutation(client, user, table, plan.row, {
        deviceId,
        baseRevision: plan.baseRevision,
        flushedAt,
        remoteRow: plan.remoteRow,
      });
    }

    for (const plan of plans[table].filter((item: any) => item.type === "delete")) {
      await softDeleteEntityForUser(client, user, {
        entityTable: table,
        entityId: plan.row.id,
        baseRevision: plan.baseRevision,
        deletedAt: plan.deletedAt,
      }, {
        deviceId,
        flushedAt,
        remoteRow: plan.remoteRow,
      });
    }
  }
}

async function appendMissingReviewEvents(client: any, desiredRows: any, remoteRows: any, { deviceId }: any) {
  const remoteIds = new Set(toArray(remoteRows).map((row: any) => row.id));
  const inserts = toArray(desiredRows)
    .filter((row: any) => !remoteIds.has(row.id))
    .map((row: any) => ({ ...row, created_by_device_id: row.created_by_device_id ?? deviceId ?? null }));
  if (!inserts.length) return;
  const { error } = await client.from("review_events").upsert(inserts, { onConflict: ACCOUNT_UPSERT_CONFLICT, ignoreDuplicates: true });
  if (error) throw error;
}

export async function appendReviewEvent(client: any, event: any, { deviceId, mutationId }: any = {}) {
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const resolvedMutationId = requireNonEmptyString(mutationId, "Mutation-ID fehlt.");
  const deckId = event?.deckId;
  if (!event?.id || !deckId || !event?.rating) throw new Error("Review-Event ist unvollständig.");
  const user = await getAuthenticatedUser(client);
  const row = reviewEventToCloudRow(event, { id: deckId }, user.id, { deviceId: resolvedDeviceId });
  const { error } = await client.from("review_events").upsert([row], {
    onConflict: ACCOUNT_UPSERT_CONFLICT,
    ignoreDuplicates: true,
  });
  if (error) throw error;
  const persisted = await selectRowById(client, "review_events", user.id, row.id);
  if (!persisted || !rowsHaveSameContent(row, persisted)) {
    const mismatch = new Error("Das Review-Event konnte nicht unverändert in der Cloud bestätigt werden.") as Error & { code: string };
    mismatch.code = "review_event_confirmation_failed";
    throw mismatch;
  }
  return { eventId: row.id, acknowledgedMutationId: resolvedMutationId };
}

export async function replaceAccountCloudState(client: any, state: any, { deviceId }: any = {}) {
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const user = await getAuthenticatedUser(client);
  const remoteRows = await loadAccountRows(client, user.id);
  const rows: Record<string, any[]> = createCloudStateRows(state, user.id, { deviceId: resolvedDeviceId });

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
  await upsertRows(client, "cards", rows.cards);
  await upsertRows(client, "card_variants", rows.card_variants);
  await upsertRows(client, "review_events", rows.review_events);
  await upsertRows(client, "ai_jobs", rows.ai_jobs);

  for (const table of DELETE_ORDER) {
    await deleteRowsMissingFromState(client, table, user.id, rows[table]);
  }

  const persistedRows = await loadAccountRows(client, user.id);
  return {
    state: reconcileCloudStateMetadata(state, persistedRows),
    summary: summarizeCloudRows(rows),
  };
}

export async function upsertAccountCloudState(client: any, state: any, { deviceId, mutationIds = [], flushedAt }: any = {}) {
  const resolvedDeviceId = requireNonEmptyString(deviceId, "Geräte-ID fehlt.");
  const acknowledgedMutationIds = requireMutationIds(mutationIds);
  const writeTimestamp = requireTimestamp(flushedAt, nowIso, "Flush-Zeitpunkt ist ungültig.");
  const user = await getAuthenticatedUser(client);
  const desiredRows = createCloudStateRows(state, user.id, { deviceId: resolvedDeviceId });
  const [remoteRows, profileRows] = await Promise.all([loadAccountRows(client, user.id), selectProfileRows(client, user.id)]);
  const plans = createRevisionWritePlans(desiredRows, remoteRows, state.cloudTombstones);

  await applyRevisionWritePlans(client, user, plans, { deviceId: resolvedDeviceId, flushedAt: writeTimestamp });
  await appendMissingReviewEvents(client, desiredRows.review_events, remoteRows.review_events, { deviceId: resolvedDeviceId });
  if (!profileHasSameContent(state.profile ?? {}, user, profileRows[0] ?? null)) {
    await saveCloudProfile(client, state.profile ?? {});
  }

  const persistedRows = await loadAccountRows(client, user.id);
  return {
    state: reconcileCloudStateMetadata(state, persistedRows),
    summary: summarizeCloudRows(desiredRows),
    acknowledgedMutationIds,
  };
}

export async function loadAccountCloudState(client: any, fallbackState: any = {}) {
  const user = await getAuthenticatedUser(client);
  const [profileRows, deckRows, cardRows, variantRows, reviewRows, documentRows, aiJobRows] = await Promise.all([
    selectProfileRows(client, user.id),
    selectRows(client, "decks", user.id),
    selectRows(client, "cards", user.id),
    selectRows(client, "card_variants", user.id),
    selectRows(client, "review_events", user.id),
    selectRows(client, "source_documents", user.id),
    selectRows(client, "ai_jobs", user.id),
  ]);
  const rowsByTable = {
    decks: deckRows,
    cards: cardRows,
    card_variants: variantRows,
    review_events: reviewRows,
    source_documents: documentRows,
    ai_jobs: aiJobRows,
  };
  const activeDeckIds = new Set(deckRows.filter((row: any) => !row.deleted_at).map((row: any) => row.id));
  const activeCardRows = cardRows.filter((row: any) => !row.deleted_at && activeDeckIds.has(row.deck_id));
  const activeCardIds = new Set(activeCardRows.map((row: any) => row.id));
  const activeVariantRows = variantRows.filter((row: any) => !row.deleted_at && activeCardIds.has(row.card_id));
  const documents = documentRows.filter((row: any) => !row.deleted_at).map(sourceDocumentFromRow);
  const aiJobs = aiJobRows.filter((row: any) => !row.deleted_at).map(aiJobFromRow);
  const variantsByCardId = new Map();
  for (const variant of activeVariantRows.map(variantFromRow)) {
    variantsByCardId.set(variant.cardId, [...(variantsByCardId.get(variant.cardId) ?? []), variant]);
  }

  const cardsByDeckId = new Map();
  for (const row of activeCardRows) {
    const card = cardFromRow(row, variantsByCardId.get(row.id) ?? []);
    cardsByDeckId.set(row.deck_id, [...(cardsByDeckId.get(row.deck_id) ?? []), card]);
  }

  const reviewEventsByDeckId = new Map();
  for (const event of reviewRows.map(reviewEventFromRow)) {
    reviewEventsByDeckId.set(event.deckId, [...(reviewEventsByDeckId.get(event.deckId) ?? []), event]);
  }

  const aiJobsByDeckId = new Map();
  for (const job of aiJobs.filter((item: any) => item.deckId)) {
    aiJobsByDeckId.set(job.deckId, [...(aiJobsByDeckId.get(job.deckId) ?? []), job]);
  }

  const decks = deckRows.filter((row: any) => !row.deleted_at).map((row: any) => {
    const cards = cardsByDeckId.get(row.id) ?? [];
    return createCoreDeck({
      id: row.id,
      ownerId: row.user_id,
      parentDeckId: row.parent_deck_id,
      name: row.name,
      description: row.description,
      source: row.source,
      originalDeckId: row.original_deck_id,
      visibility: row.visibility,
      hierarchyPath: row.hierarchy_path,
      cards,
      tags: row.tags,
      importMeta: row.import_meta,
      deckSettings: row.deck_settings,
      graph: row.graph,
      communityRefs: row.community_refs,
      sourceDocuments: documentsForDeck(cards, documents),
      reviewEvents: reviewEventsByDeckId.get(row.id) ?? [],
      aiJobs: aiJobsByDeckId.get(row.id) ?? [],
      versionLog: row.version_log,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...syncMetadataFromRow(row),
    });
  });

  return {
    ...fallbackState,
    profile: createCloudProfile(profileRows[0] ?? null, user, fallbackState.profile),
    decks,
    documents,
    aiJobs,
    cloudTombstones: createCloudTombstones(rowsByTable),
    updatedAt: new Date().toISOString(),
  };
}

export function syncConflictFromRow(row: any) {
  return createConflictProjection(row);
}

export async function listAccountSyncConflicts(client: any) {
  const user = await getAuthenticatedUser(client);
  const rows = await selectOptionalRows(client, "sync_conflicts", user.id);
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
  const chosen = chosenConflictRow(normalized);
  const expectedRemoteRevision = conflictRow.remote_revision == null ? null : normalizeRevision(conflictRow.remote_revision);
  const currentRemoteRevision = currentRemote?.revision == null ? null : normalizeRevision(currentRemote.revision);
  const alreadyApplied = Boolean(currentRemote && chosen && rowsHaveSameContent(chosen, currentRemote));
  if (currentRemoteRevision !== expectedRemoteRevision && !alreadyApplied) throw new SyncConflictChangedError();

  if (normalized.action === "keep-remote") return currentRemote;
  if (alreadyApplied) return currentRemote;
  if (chosen?.deleted_at) {
    if (!currentRemote || currentRemote.deleted_at) return currentRemote;
    await softDeleteEntityForUser(client, user, {
      entityTable,
      entityId: conflictRow.entity_id,
      baseRevision: currentRemoteRevision,
      deletedAt: chosen.deleted_at,
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
    const cloudState = await loadAccountCloudState(client, options.currentState ?? {});
    return {
      conflict: syncConflictFromRow(conflictRow),
      nextState: projectResolvedCloudEntity(options.currentState, cloudState, conflictRow.entity_table, conflictRow.entity_id),
      resolved: true,
    };
  }
  if (normalized.action === "reopen" && conflictRow.status !== "ignored") throw new Error("Nur zurückgestellte Konflikte können wieder aufgenommen werden.");

  if (!["ignore", "reopen"].includes(normalized.action)) {
    await persistConflictChoice(client, user, conflictRow, normalized, { deviceId, resolvedAt });
  }
  const updatedConflict = await updateConflictResolution(client, user, conflictRow, normalized, { deviceId, resolvedAt });
  const cloudState = ["ignore", "reopen"].includes(normalized.action)
    ? null
    : await loadAccountCloudState(client, options.currentState ?? {});
  return {
    conflict: syncConflictFromRow(updatedConflict),
    nextState: ["ignore", "reopen"].includes(normalized.action)
      ? options.currentState
      : projectResolvedCloudEntity(options.currentState, cloudState, conflictRow.entity_table, conflictRow.entity_id),
    resolved: !["ignore", "reopen"].includes(normalized.action),
  };
}
