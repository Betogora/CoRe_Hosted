import { createCloudProfile, saveCloudProfile } from "./cloudAuth.js";
import { createCoreDeck } from "./coreModel.js";

export const ACCOUNT_UPSERT_CONFLICT = "user_id,id";

const ACCOUNT_TABLES = ["decks", "cards", "card_variants", "review_events", "source_documents", "ai_jobs"];
const DELETE_ORDER = ["ai_jobs", "review_events", "card_variants", "cards", "decks", "source_documents"];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toJson(value, fallback) {
  return value == null ? fallback : value;
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
  };
}

export function reviewEventToCloudRow(event, deck, userId) {
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
  };
}

export function createCloudStateRows(state, userId) {
  const decks = toArray(state.decks);
  const deckIds = new Set(decks.map((deck) => deck.id));

  return {
    decks: uniqueRowsById(decks.map((deck) => deckToCloudRow(deck, userId))),
    cards: uniqueRowsById(decks.flatMap((deck) => toArray(deck.cards).map((card) => cardToCloudRow(card, deck, userId)))),
    card_variants: uniqueRowsById(decks.flatMap((deck) => toArray(deck.cards).flatMap((card) => toArray(card.variants).map((variant) => variantToCloudRow(variant, card, userId))))),
    review_events: uniqueRowsById(decks.flatMap((deck) => toArray(deck.reviewEvents).map((event) => reviewEventToCloudRow(event, deck, userId)).filter((row) => row.id && row.rating))),
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
    reviewState: row.review_state,
    learningItemState: row.review_state,
    variants,
    versionLog: row.version_log,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  };
}

function documentsForDeck(deckCards, documents) {
  const documentIds = new Set(deckCards.flatMap((card) => toArray(card.sourceAnchors).map((anchor) => anchor.documentId)).filter(Boolean));
  return documents.filter((document) => documentIds.has(document.id));
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

export async function replaceAccountCloudState(client, state) {
  const user = await getAuthenticatedUser(client);
  const rows = createCloudStateRows(state, user.id);

  await upsertAccountRows(client, state, rows);

  for (const table of DELETE_ORDER) {
    await deleteRowsMissingFromState(client, table, user.id, rows[table]);
  }

  return summarizeCloudRows(rows);
}

async function upsertAccountRows(client, state, rows) {
  await saveCloudProfile(client, state.profile ?? {});
  await upsertRows(client, "source_documents", rows.source_documents);
  await upsertRows(client, "decks", rows.decks);
  await upsertRows(client, "cards", rows.cards);
  await upsertRows(client, "card_variants", rows.card_variants);
  await upsertRows(client, "review_events", rows.review_events);
  await upsertRows(client, "ai_jobs", rows.ai_jobs);
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

export async function upsertAccountCloudState(client, state) {
  const user = await getAuthenticatedUser(client);
  const rows = createCloudStateRows(state, user.id);
  await upsertAccountRows(client, state, rows);
  return summarizeCloudRows(rows);
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
  const documents = documentRows.map(sourceDocumentFromRow);
  const aiJobs = aiJobRows.map(aiJobFromRow);
  const variantsByCardId = new Map();
  for (const variant of variantRows.map(variantFromRow)) {
    variantsByCardId.set(variant.cardId, [...(variantsByCardId.get(variant.cardId) ?? []), variant]);
  }

  const cardsByDeckId = new Map();
  for (const row of cardRows) {
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

  const decks = deckRows.map((row) => {
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
    });
  });

  return {
    ...fallbackState,
    profile: createCloudProfile(profileRows[0] ?? null, user, fallbackState.profile),
    decks,
    documents,
    aiJobs,
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
