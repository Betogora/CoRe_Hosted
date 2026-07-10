import { createCloudProfile, createProfileRow, saveCloudProfile } from "./cloudAuth.js";
import { createCoreDeck } from "./coreModel.js";

export const ACCOUNT_UPSERT_CONFLICT = "user_id,id";

const ACCOUNT_TABLES = ["decks", "cards", "card_variants", "review_events", "source_documents", "ai_jobs"];
const REVISIONED_TABLES = ["source_documents", "decks", "cards", "card_variants", "ai_jobs"];
const DELETE_ORDER = ["ai_jobs", "review_events", "card_variants", "cards", "decks", "source_documents"];
const ROW_IDENTITY_FIELDS = new Set(["id", "user_id", "created_at", "revision", "updated_by_device_id"]);

function nowIso() {
  return new Date().toISOString();
}

export class CloudRevisionConflictError extends Error {
  constructor({ entityTable, entityId, localRevision = null, remoteRevision = null, remoteDeleted = false } = {}) {
    super("Auf einem anderen Gerät liegt bereits eine neuere Version vor. Bitte lade die Cloud-Daten neu.");
    this.name = "CloudRevisionConflictError";
    this.code = "cloud_revision_conflict";
    this.entityTable = entityTable ?? "unknown";
    this.entityId = entityId ?? "unknown";
    this.localRevision = localRevision;
    this.remoteRevision = remoteRevision;
    this.remoteDeleted = Boolean(remoteDeleted);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toJson(value, fallback) {
  return value == null ? fallback : value;
}

function normalizeRevision(value, fallback = 1) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : fallback;
}

function syncFields(entity = {}) {
  return {
    revision: normalizeRevision(entity.revision),
    deleted_at: entity.deletedAt ?? null,
    updated_by_device_id: entity.updatedByDeviceId ?? null,
  };
}

function syncMetadataFromRow(row = {}) {
  return {
    revision: normalizeRevision(row.revision),
    deletedAt: row.deleted_at ?? null,
    updatedByDeviceId: row.updated_by_device_id ?? null,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function comparableRow(row = {}) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !ROW_IDENTITY_FIELDS.has(key)));
}

function rowsHaveSameContent(left, right) {
  return JSON.stringify(stableValue(comparableRow(left))) === JSON.stringify(stableValue(comparableRow(right)));
}

function profileHasSameContent(profile, user, remoteRow) {
  if (!remoteRow) return false;
  const candidate = createProfileRow(profile, user, remoteRow.updated_at);
  const keys = Object.keys(candidate).filter((key) => key !== "updated_at");
  const left = Object.fromEntries(keys.map((key) => [key, candidate[key]]));
  const right = Object.fromEntries(keys.map((key) => [key, remoteRow[key]]));
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function replaceRow(rows, nextRow) {
  return [nextRow, ...rows.filter((row) => row.id !== nextRow.id)];
}

function uniqueRowsById(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function normalizeSource(source) {
  return source === "json_import" ? "json-import" : source || "manual";
}

function normalizeTransformType(transformType, isOriginal) {
  if (isOriginal) return "original";
  return transformType || "rephrase";
}

async function getAuthenticatedUser(client) {
  if (!client?.auth || !client?.from) throw new Error("Supabase ist noch nicht konfiguriert.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Bitte melde dich zuerst an.");
  return data.user;
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: ACCOUNT_UPSERT_CONFLICT });
  if (error) throw error;
}

async function selectRows(client, table, userId, columns = "*") {
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

async function selectProfileRows(client, userId) {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId);
  if (error) throw error;
  return data ?? [];
}

async function selectOptionalRows(client, table, userId, columns = "*") {
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId);
  if (error) {
    if (String(error?.code ?? "") === "42P01" || /does not exist|not exist/i.test(error?.message ?? "")) return [];
    throw error;
  }
  return data ?? [];
}

async function deleteRowsById(client, table, userId, ids) {
  if (!ids.length) return;
  const { error } = await client.from(table).delete().eq("user_id", userId).in("id", ids);
  if (error) throw error;
}

async function deleteRowsMissingFromState(client, table, userId, keepRows) {
  const keepIds = new Set(keepRows.map((row) => row.id));
  const existingRows = await selectRows(client, table, userId, "id");
  const missingIds = existingRows.map((row) => row.id).filter((id) => !keepIds.has(id));
  await deleteRowsById(client, table, userId, missingIds);
}

export function deckToCloudRow(deck, userId) {
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

export function cardToCloudRow(card, deck, userId) {
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
    meta: toJson(card.meta, {}),
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    ...syncFields(card),
  };
}

export function variantToCloudRow(variant, card, userId) {
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

export function reviewEventToCloudRow(event, deck, userId, { deviceId = null } = {}) {
  return {
    id: event.id,
    user_id: userId,
    deck_id: event.deckId ?? deck.id,
    reviewable_type: event.reviewableType ?? "card",
    reviewable_id: event.reviewableId ?? event.cardId ?? event.variantId ?? "",
    source_card_id: event.sourceCardId ?? event.learningItemId ?? null,
    rating: event.rating,
    answered_at: event.answeredAt ?? event.createdAt,
    response_time_ms: event.responseTimeMs ?? null,
    scheduler_before: event.schedulerBefore ?? null,
    scheduler_after: event.schedulerAfter ?? null,
    flags: toJson(event.flags, {}),
    created_at: event.createdAt ?? event.answeredAt,
    created_by_device_id: event.createdByDeviceId ?? deviceId,
  };
}

export function sourceDocumentToCloudRow(document, userId) {
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

export function aiJobToCloudRow(job, userId, deckIds = new Set()) {
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

export function createCloudStateRows(state, userId, { deviceId = null } = {}) {
  const decks = toArray(state.decks);
  const deckIds = new Set(decks.map((deck) => deck.id));

  return {
    decks: uniqueRowsById(decks.map((deck) => deckToCloudRow(deck, userId))),
    cards: uniqueRowsById(decks.flatMap((deck) => toArray(deck.cards).map((card) => cardToCloudRow(card, deck, userId)))),
    card_variants: uniqueRowsById(decks.flatMap((deck) => toArray(deck.cards).flatMap((card) => toArray(card.variants).map((variant) => variantToCloudRow(variant, card, userId))))),
    review_events: uniqueRowsById(
      decks.flatMap((deck) => toArray(deck.reviewEvents).map((event) => reviewEventToCloudRow(event, deck, userId, { deviceId })).filter((row) => row.id && row.rating)),
    ),
    source_documents: uniqueRowsById(toArray(state.documents).map((document) => sourceDocumentToCloudRow(document, userId))),
    ai_jobs: uniqueRowsById([...decks.flatMap((deck) => toArray(deck.aiJobs)), ...toArray(state.aiJobs)].map((job) => aiJobToCloudRow(job, userId, deckIds))),
  };
}

function variantFromRow(row) {
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

function cardFromRow(row, variants) {
  return {
    id: row.id,
    noteId: row.note_id,
    deckId: row.deck_id,
    source: row.source,
    sourceCardId: row.source_card_id,
    sourceNoteId: row.source_note_id,
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
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...syncMetadataFromRow(row),
  };
}

function reviewEventFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    reviewableType: row.reviewable_type,
    reviewableId: row.reviewable_id,
    sourceCardId: row.source_card_id,
    rating: row.rating,
    answeredAt: row.answered_at,
    responseTimeMs: row.response_time_ms,
    schedulerBefore: row.scheduler_before,
    schedulerAfter: row.scheduler_after,
    flags: row.flags,
    createdAt: row.created_at,
    createdByDeviceId: row.created_by_device_id ?? null,
  };
}

function sourceDocumentFromRow(row) {
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

function aiJobFromRow(row) {
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

function documentsForDeck(deckCards, documents) {
  const documentIds = new Set(deckCards.flatMap((card) => toArray(card.sourceAnchors).map((anchor) => anchor.documentId)).filter(Boolean));
  return documents.filter((document) => documentIds.has(document.id));
}

function rowMaps(rowsByTable = {}) {
  return Object.fromEntries(ACCOUNT_TABLES.map((table) => [table, new Map(toArray(rowsByTable[table]).map((row) => [row.id, row]))]));
}

function createCloudTombstones(rowsByTable = {}) {
  return REVISIONED_TABLES.flatMap((entityTable) =>
    toArray(rowsByTable[entityTable])
      .filter((row) => row.deleted_at)
      .map((row) => ({
        entityTable,
        entityId: row.id,
        revision: normalizeRevision(row.revision),
        deletedAt: row.deleted_at,
        updatedByDeviceId: row.updated_by_device_id ?? null,
      })),
  );
}

function metadataById(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function tombstoneKeys(tombstones = []) {
  return new Set(tombstones.map((tombstone) => `${tombstone.entityTable}:${tombstone.entityId}`));
}

export function reconcileCloudStateMetadata(state, rowsByTable = {}) {
  const maps = rowMaps(rowsByTable);
  const cloudTombstones = createCloudTombstones(rowsByTable);
  const deletedKeys = tombstoneKeys(cloudTombstones);
  const documents = toArray(state.documents)
    .filter((document) => !deletedKeys.has(`source_documents:${document.id}`))
    .map((document) => {
      const row = maps.source_documents.get(document.id);
      return row ? { ...document, ...syncMetadataFromRow(row), updatedAt: row.updated_at ?? document.updatedAt } : document;
    });
  const aiJobs = toArray(state.aiJobs)
    .filter((job) => !deletedKeys.has(`ai_jobs:${job.id}`))
    .map((job) => {
      const row = maps.ai_jobs.get(job.id);
      return row ? { ...job, ...syncMetadataFromRow(row) } : job;
    });
  const documentMap = metadataById(documents);
  const aiJobMap = metadataById(aiJobs);

  const decks = toArray(state.decks)
    .filter((deck) => !deletedKeys.has(`decks:${deck.id}`))
    .map((deck) => {
      const deckRow = maps.decks.get(deck.id);
      const cards = toArray(deck.cards)
        .filter((card) => !deletedKeys.has(`cards:${card.id}`))
        .map((card) => {
          const cardRow = maps.cards.get(card.id);
          const variants = toArray(card.variants)
            .filter((variant) => !deletedKeys.has(`card_variants:${variant.id}`))
            .map((variant) => {
              const variantRow = maps.card_variants.get(variant.id);
              return variantRow ? { ...variant, ...syncMetadataFromRow(variantRow) } : variant;
            });
          return cardRow ? { ...card, ...syncMetadataFromRow(cardRow), variants } : { ...card, variants };
        });
      const reviewEvents = toArray(deck.reviewEvents).map((event) => {
        const row = maps.review_events.get(event.id);
        return row ? reviewEventFromRow(row) : event;
      });
      const sourceDocuments = toArray(deck.sourceDocuments)
        .filter((document) => !deletedKeys.has(`source_documents:${document.id}`))
        .map((document) => documentMap.get(document.id) ?? document);
      const deckAiJobs = toArray(deck.aiJobs)
        .filter((job) => !deletedKeys.has(`ai_jobs:${job.id}`))
        .map((job) => aiJobMap.get(job.id) ?? job);

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

export function mergeCloudSyncMetadata(state, acknowledgedState) {
  if (!acknowledgedState) return state;
  const acknowledgedDecks = metadataById(acknowledgedState.decks);
  const acknowledgedDocuments = metadataById(acknowledgedState.documents);
  const acknowledgedAiJobs = metadataById(acknowledgedState.aiJobs);
  const cloudTombstones = toArray(acknowledgedState.cloudTombstones);
  const deletedKeys = tombstoneKeys(cloudTombstones);

  const decks = toArray(state.decks)
    .filter((deck) => !deletedKeys.has(`decks:${deck.id}`))
    .map((deck) => {
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
          .filter((card) => !deletedKeys.has(`cards:${card.id}`))
          .map((card) => {
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
                .filter((variant) => !deletedKeys.has(`card_variants:${variant.id}`))
                .map((variant) => {
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
        reviewEvents: toArray(deck.reviewEvents).map((event) => acknowledgedEvents.get(event.id) ?? event),
        sourceDocuments: toArray(deck.sourceDocuments)
          .filter((document) => !deletedKeys.has(`source_documents:${document.id}`))
          .map((document) => acknowledgedDeckDocuments.get(document.id) ?? acknowledgedDocuments.get(document.id) ?? document),
        aiJobs: toArray(deck.aiJobs)
          .filter((job) => !deletedKeys.has(`ai_jobs:${job.id}`))
          .map((job) => acknowledgedDeckJobs.get(job.id) ?? acknowledgedAiJobs.get(job.id) ?? job),
      };
    });

  return {
    ...state,
    decks,
    documents: toArray(state.documents)
      .filter((document) => !deletedKeys.has(`source_documents:${document.id}`))
      .map((document) => acknowledgedDocuments.get(document.id) ?? document),
    aiJobs: toArray(state.aiJobs)
      .filter((job) => !deletedKeys.has(`ai_jobs:${job.id}`))
      .map((job) => acknowledgedAiJobs.get(job.id) ?? job),
    cloudTombstones,
  };
}

export async function hasAccountCloudData(client) {
  const user = await getAuthenticatedUser(client);

  for (const table of ACCOUNT_TABLES) {
    const { data, error } = await client.from(table).select("id").eq("user_id", user.id).limit(1);
    if (error) throw error;
    if (data?.length) return true;
  }

  return false;
}

function summarizeCloudRows(rows) {
  return {
    decks: rows.decks.length,
    cards: rows.cards.length,
    variants: rows.card_variants.length,
    reviewEvents: rows.review_events.length,
    documents: rows.source_documents.length,
    aiJobs: rows.ai_jobs.length,
  };
}

async function loadAccountRows(client, userId) {
  const values = await Promise.all(ACCOUNT_TABLES.map((table) => selectRows(client, table, userId)));
  return Object.fromEntries(ACCOUNT_TABLES.map((table, index) => [table, values[index]]));
}

function createRevisionWritePlans(desiredRows, remoteRows) {
  const plans = {};

  for (const table of REVISIONED_TABLES) {
    const remoteById = new Map(toArray(remoteRows[table]).map((row) => [row.id, row]));
    plans[table] = toArray(desiredRows[table]).map((row) => {
      const remoteRow = remoteById.get(row.id);
      if (!remoteRow) return { type: "insert", row: { ...row, revision: 1 } };

      if (remoteRow.deleted_at && !row.deleted_at) {
        throw new CloudRevisionConflictError({
          entityTable: table,
          entityId: row.id,
          localRevision: normalizeRevision(row.revision),
          remoteRevision: normalizeRevision(remoteRow.revision),
          remoteDeleted: true,
        });
      }

      if (rowsHaveSameContent(row, remoteRow)) return { type: "unchanged", row: remoteRow };

      const localRevision = normalizeRevision(row.revision);
      const remoteRevision = normalizeRevision(remoteRow.revision);
      if (localRevision !== remoteRevision) {
        throw new CloudRevisionConflictError({ entityTable: table, entityId: row.id, localRevision, remoteRevision });
      }

      return { type: "update", row, baseRevision: localRevision };
    });
  }

  return plans;
}

function updatePayload(row, { revision, deviceId, now }) {
  const payload = Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "user_id", "created_at"].includes(key)));
  payload.revision = revision;
  payload.updated_by_device_id = deviceId ?? row.updated_by_device_id ?? null;
  if (Object.hasOwn(payload, "updated_at") && !payload.updated_at) payload.updated_at = now();
  return payload;
}

async function insertRowsReturning(client, table, rows) {
  if (!rows.length) return [];
  const { data, error } = await client.from(table).insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

async function updateRevisionedRow(client, table, userId, plan, { deviceId, now }) {
  const nextRevision = plan.baseRevision + 1;
  const payload = updatePayload(plan.row, { revision: nextRevision, deviceId, now });
  const { data, error } = await client
    .from(table)
    .update(payload)
    .eq("user_id", userId)
    .eq("id", plan.row.id)
    .eq("revision", plan.baseRevision)
    .select("*");
  if (error) throw error;
  if (data?.[0]) return data[0];

  const latestRows = await selectRows(client, table, userId, "id,revision,deleted_at");
  const remoteRow = latestRows.find((row) => row.id === plan.row.id);
  throw new CloudRevisionConflictError({
    entityTable: table,
    entityId: plan.row.id,
    localRevision: plan.baseRevision,
    remoteRevision: remoteRow?.revision ?? null,
    remoteDeleted: Boolean(remoteRow?.deleted_at),
  });
}

async function applyRevisionWritePlans(client, userId, plans, { deviceId, now }) {
  for (const table of REVISIONED_TABLES) {
    const inserts = plans[table]
      .filter((plan) => plan.type === "insert")
      .map((plan) => ({
        ...plan.row,
        revision: 1,
        updated_by_device_id: deviceId ?? plan.row.updated_by_device_id ?? null,
      }));
    await insertRowsReturning(client, table, inserts);

    for (const plan of plans[table].filter((item) => item.type === "update")) {
      await updateRevisionedRow(client, table, userId, plan, { deviceId, now });
    }
  }
}

async function appendMissingReviewEvents(client, desiredRows, remoteRows, { deviceId }) {
  const remoteIds = new Set(toArray(remoteRows).map((row) => row.id));
  const inserts = toArray(desiredRows)
    .filter((row) => !remoteIds.has(row.id))
    .map((row) => ({ ...row, created_by_device_id: row.created_by_device_id ?? deviceId ?? null }));
  if (!inserts.length) return;
  const { error } = await client.from("review_events").upsert(inserts, { onConflict: ACCOUNT_UPSERT_CONFLICT, ignoreDuplicates: true });
  if (error) throw error;
}

export async function replaceAccountCloudState(client, state, { deviceId = "browser-device" } = {}) {
  const user = await getAuthenticatedUser(client);
  const remoteRows = await loadAccountRows(client, user.id);
  const rows = createCloudStateRows(state, user.id, { deviceId });

  for (const table of REVISIONED_TABLES) {
    const remoteById = new Map(toArray(remoteRows[table]).map((row) => [row.id, row]));
    rows[table] = rows[table].map((row) => ({
      ...row,
      revision: remoteById.has(row.id) ? normalizeRevision(remoteById.get(row.id).revision) + 1 : 1,
      updated_by_device_id: deviceId ?? row.updated_by_device_id ?? null,
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

export async function upsertAccountCloudState(client, state, { deviceId = "browser-device", now = nowIso } = {}) {
  const user = await getAuthenticatedUser(client);
  const desiredRows = createCloudStateRows(state, user.id, { deviceId });
  const [remoteRows, profileRows] = await Promise.all([loadAccountRows(client, user.id), selectProfileRows(client, user.id)]);
  const plans = createRevisionWritePlans(desiredRows, remoteRows);

  await applyRevisionWritePlans(client, user.id, plans, { deviceId, now });
  await appendMissingReviewEvents(client, desiredRows.review_events, remoteRows.review_events, { deviceId });
  if (!profileHasSameContent(state.profile ?? {}, user, profileRows[0] ?? null)) {
    await saveCloudProfile(client, state.profile ?? {});
  }

  const persistedRows = await loadAccountRows(client, user.id);
  return {
    state: reconcileCloudStateMetadata(state, persistedRows),
    summary: summarizeCloudRows(desiredRows),
  };
}

export async function loadAccountCloudState(client, fallbackState = {}) {
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
  const activeDeckIds = new Set(deckRows.filter((row) => !row.deleted_at).map((row) => row.id));
  const activeCardRows = cardRows.filter((row) => !row.deleted_at && activeDeckIds.has(row.deck_id));
  const activeCardIds = new Set(activeCardRows.map((row) => row.id));
  const activeVariantRows = variantRows.filter((row) => !row.deleted_at && activeCardIds.has(row.card_id));
  const documents = documentRows.filter((row) => !row.deleted_at).map(sourceDocumentFromRow);
  const aiJobs = aiJobRows.filter((row) => !row.deleted_at).map(aiJobFromRow);
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
  for (const job of aiJobs.filter((item) => item.deckId)) {
    aiJobsByDeckId.set(job.deckId, [...(aiJobsByDeckId.get(job.deckId) ?? []), job]);
  }

  const decks = deckRows.filter((row) => !row.deleted_at).map((row) => {
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

export async function saveCloudState(client, state) {
  return replaceAccountCloudState(client, state);
}

export async function loadCloudState(client, fallbackState = {}) {
  return loadAccountCloudState(client, fallbackState);
}

export function syncConflictFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    baseRevision: row.base_revision,
    localRevision: row.local_revision,
    remoteRevision: row.remote_revision,
    localValue: row.local_value,
    remoteValue: row.remote_value,
    status: row.status,
    resolution: row.resolution,
    updatedByDeviceId: row.updated_by_device_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function listAccountSyncConflicts(client) {
  const user = await getAuthenticatedUser(client);
  const rows = await selectOptionalRows(client, "sync_conflicts", user.id);
  return rows.map(syncConflictFromRow);
}

export async function resolveAccountSyncConflict(client, conflictId, resolution) {
  const user = await getAuthenticatedUser(client);
  const row = {
    status: "resolved",
    resolution: toJson(resolution, {}),
    resolved_at: new Date().toISOString(),
  };
  const { data, error } = await client.from("sync_conflicts").update(row).eq("user_id", user.id).eq("id", conflictId).select("*").maybeSingle();
  if (error) throw error;
  return data ? syncConflictFromRow(data) : null;
}
