// Private to cloudRepository.ts: domain entities as cloud rows for writes and the first upload.
import { noteTextIndex } from "./coreModel.ts";
import type { Card, CardVariant, Deck, Note, ReviewEvent } from "./coreTypes.ts";
import { nowIso, toArray, toJson, toObject, normalizeRevision, uniqueRowsById } from "./cloudQueries.ts";

function syncFields(entity: { revision?: unknown; deletedAt?: string | null; updatedByDeviceId?: string | null } = {}) {
  return {
    revision: normalizeRevision(entity.revision),
    deleted_at: entity.deletedAt ?? null,
    updated_by_device_id: entity.updatedByDeviceId ?? null,
  };
}

export function deckToCloudRow(deck: Omit<Deck, "cards" | "reviewEvents">, userId: string) {
  return {
    id: deck.id,
    user_id: userId,
    parent_deck_id: deck.parentDeckId ?? null,
    name: deck.name,
    description: deck.description ?? "",
    source: deck.source === "anki-apkg" ? "anki-apkg" : "manual",
    anki_deck_id: deck.ankiDeckId ?? null,
    hierarchy_path: toArray(deck.hierarchyPath),
    deck_settings: toJson(deck.deckSettings, {}),
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    ...syncFields(deck),
  };
}

export function noteToCloudRow(note: Note, userId: string) {
  const text = noteTextIndex(note.content);
  return {
    id: note.id,
    user_id: userId,
    content: note.content,
    media: note.media ?? {},
    search_text: text.searchText,
    search_fields: text.searchFields.map((field) => ({ n: field.name, t: field.text })),
    sort_text: text.sortText,
    source: note.source,
    anki_guid: note.ankiGuid,
    note_type_source_id: note.noteTypeSourceId,
    translator_id: note.translator?.id ?? null,
    translator_version: note.translator?.version ?? null,
    marked: note.marked,
    content_revision: normalizeRevision(note.contentRevision),
    imported_content_revision: note.importedContentRevision,
    imported_tags: note.importedTags,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    ...syncFields(note),
  };
}

export function studyToCloudColumns(study: Card["study"]) {
  const { sourceSchedulerData: _source, ...extra } = study.extra;
  return {
    state: study.state,
    due_at: study.dueAt,
    stability: study.stability,
    difficulty: study.difficulty,
    reps: study.reps,
    lapses: study.lapses,
    interval_days: study.intervalDays,
    learning_step_index: study.learningStepIndex,
    last_reviewed_at: study.lastReviewedAt,
    last_rating: study.lastRating,
    leeched_at: study.leechedAt,
    study_extra: extra,
  };
}

export function cardToCloudRow(card: Card, userId: string) {
  return {
    id: card.id,
    user_id: userId,
    note_id: card.noteId,
    deck_id: card.deckId,
    prompt_key: card.promptKey,
    anki_card_id: card.ankiCardId,
    status: card.status,
    anki_flag: card.ankiFlag,
    ...studyToCloudColumns(card.study),
    source_scheduler: card.study.extra.sourceSchedulerData ?? null,
    study_revision: card.studyRevision,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    ...syncFields(card),
  };
}

export function variantToCloudRow(variant: CardVariant, userId: string) {
  return {
    id: variant.id,
    user_id: userId,
    card_id: variant.cardId,
    front: variant.front ?? "",
    back: variant.back ?? "",
    variant_level: variant.variantLevel ?? 2,
    is_active: variant.isActive !== false,
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

export function reviewEventToCloudRow(event: ReviewEvent, userId: string, { deviceId = null }: { deviceId?: string | null } = {}) {
  return {
    id: event.id,
    user_id: userId,
    card_id: event.cardId,
    deck_id: event.deckId,
    variant_id: event.variantId ?? null,
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

export function noteTypeSourceToCloudRow(source: unknown, userId: string) {
  const { id, ankiNotetypeId, name, revision, createdAt, updatedAt, deletedAt, updatedByDeviceId, ...definition } = toObject(source);
  const timestamp = updatedAt ?? createdAt ?? nowIso();
  return {
    id,
    user_id: userId,
    anki_notetype_id: String(ankiNotetypeId),
    name: String(name ?? "Notiztyp"),
    definition,
    created_at: createdAt ?? timestamp,
    updated_at: timestamp,
    revision: normalizeRevision(revision),
    deleted_at: deletedAt ?? null,
    updated_by_device_id: updatedByDeviceId ?? null,
  };
}

interface NoteSourceEntity {
  id?: string;
  noteId?: string;
  noteTypeSourceId?: string;
  fields?: unknown;
  createdAt?: string;
  updatedAt?: string;
  revision?: unknown;
  deletedAt?: string | null;
  updatedByDeviceId?: string | null;
}

export function noteSourceToCloudRow(source: NoteSourceEntity, userId: string) {
  const timestamp = source.updatedAt ?? source.createdAt ?? nowIso();
  return {
    id: source.noteId ?? source.id,
    user_id: userId,
    note_type_source_id: source.noteTypeSourceId,
    fields: toArray(source.fields),
    created_at: source.createdAt ?? timestamp,
    updated_at: timestamp,
    revision: normalizeRevision(source.revision),
    deleted_at: source.deletedAt ?? null,
    updated_by_device_id: source.updatedByDeviceId ?? null,
  };
}

/** Full cloud rows of a state, used for seeding and the content footprint measurement. */
export function createCloudStateRows(
  state: { decks?: Deck[]; notes?: Note[]; noteTypeSources?: unknown[]; noteSources?: NoteSourceEntity[] },
  userId: string,
  { deviceId = null }: { deviceId?: string | null } = {},
) {
  const decks = toArray(state.decks) as Deck[];
  const cards = decks.flatMap((deck) => deck.cards);
  return {
    decks: uniqueRowsById(decks.map((deck) => deckToCloudRow(deck, userId))),
    note_type_sources: uniqueRowsById(toArray(state.noteTypeSources).map((source) => noteTypeSourceToCloudRow(source, userId))),
    notes: uniqueRowsById(toArray<Note>(state.notes).map((note) => noteToCloudRow(note, userId))),
    note_sources: uniqueRowsById(toArray<NoteSourceEntity>(state.noteSources).map((source) => noteSourceToCloudRow(source, userId))),
    cards: uniqueRowsById(cards.map((card) => cardToCloudRow(card, userId))),
    card_variants: uniqueRowsById(cards.flatMap((card) => card.variants.map((variant) => variantToCloudRow(variant, userId)))),
    review_events: uniqueRowsById(decks.flatMap((deck) => deck.reviewEvents.map((event) => reviewEventToCloudRow(event, userId, { deviceId })))),
  };
}
