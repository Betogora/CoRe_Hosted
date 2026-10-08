import * as v from "valibot";
import { cardStudyFromReviewState, createCardVariant, createCoreDeck, createReviewState, parseNoteContent } from "./coreModel.ts";
import type { Card, CardVariant, Deck, MediaFileReference, Note, ReviewEvent } from "./coreTypes.ts";
import type { Json } from "./database.types.ts";
import type { NoteSource, NoteTypeSource } from "./apkgNoteTranslation.ts";
import type {
  AccountStatisticsSnapshot,
  AccountStudyOverview,
  CardCatalogEntry,
  DeckStudySummary,
  OfflineCardManifestEntry,
  OfflineMediaManifestEntry,
} from "./workspaceReplica.ts";

export type AccountTable = "decks" | "note_type_sources" | "notes" | "note_sources" | "cards" | "card_variants" | "review_events";
export type CloudJson = Json;
export type AccountRow = Record<string, unknown>;

/** Anki template of an imported note type as stored in `note_type_sources.definition`. */
export interface StoredNoteTypeSource {
  id: string;
  ankiNotetypeId: string;
  name: string;
  definition: Record<string, unknown>;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StoredNoteSource {
  id: string;
  noteTypeSourceId: string;
  fields: string[];
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

const jsonObjectSchema = v.pipe(v.unknown(), v.check((value) => value !== null && typeof value === "object" && !Array.isArray(value)), v.record(v.string(), v.unknown()));
const nonNegativeIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const positiveIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const sha1Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/));
const syncRowSchema = {
  id: v.string(),
  user_id: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  revision: positiveIntegerSchema,
  deleted_at: v.nullable(v.string()),
  updated_by_device_id: v.nullable(v.string()),
};

const accountRowSchemas = {
  decks: v.looseObject({
    ...syncRowSchema,
    parent_deck_id: v.nullable(v.string()),
    name: v.string(),
    description: v.string(),
    source: v.picklist(["manual", "anki-apkg"]),
    anki_deck_id: v.nullable(v.string()),
    hierarchy_path: v.array(v.string()),
    deck_settings: jsonObjectSchema,
    sync_change_id: positiveIntegerSchema,
  }),
  note_type_sources: v.looseObject({
    ...syncRowSchema,
    anki_notetype_id: v.string(),
    name: v.string(),
    definition: jsonObjectSchema,
  }),
  notes: v.looseObject({
    ...syncRowSchema,
    content: jsonObjectSchema,
    media: v.record(v.string(), sha1Schema),
    source: v.picklist(["manual", "anki-apkg"]),
    anki_guid: v.nullable(v.string()),
    note_type_source_id: v.nullable(v.string()),
    translator_id: v.nullable(v.string()),
    translator_version: v.nullable(positiveIntegerSchema),
    marked: v.boolean(),
    content_revision: positiveIntegerSchema,
    imported_content_revision: v.nullable(positiveIntegerSchema),
  }),
  note_sources: v.looseObject({
    ...syncRowSchema,
    note_type_source_id: v.string(),
    fields: v.array(v.string()),
  }),
  cards: v.looseObject({
    ...syncRowSchema,
    note_id: v.string(),
    deck_id: v.string(),
    prompt_key: v.string(),
    anki_card_id: v.nullable(v.string()),
    status: v.picklist(["active", "suspended"]),
    anki_flag: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(7)),
    state: v.picklist(["new", "learning", "review", "relearning"]),
    due_at: v.string(),
    stability: v.pipe(v.number(), v.minValue(0)),
    difficulty: v.pipe(v.number(), v.minValue(0)),
    reps: nonNegativeIntegerSchema,
    lapses: nonNegativeIntegerSchema,
    interval_days: v.pipe(v.number(), v.minValue(0)),
    learning_step_index: nonNegativeIntegerSchema,
    last_reviewed_at: v.nullable(v.string()),
    last_rating: v.nullable(v.picklist(["again", "hard", "good", "easy"])),
    study_extra: jsonObjectSchema,
    source_scheduler: v.optional(v.unknown()),
    study_revision: nonNegativeIntegerSchema,
  }),
  card_variants: v.looseObject({
    ...syncRowSchema,
    card_id: v.string(),
    transform_profile: jsonObjectSchema,
    changed_recognition_cues: v.array(v.string()),
    performance: jsonObjectSchema,
    feedback: v.array(v.unknown()),
    meta: jsonObjectSchema,
  }),
  review_events: v.looseObject({
    id: v.string(),
    user_id: v.string(),
    card_id: v.string(),
    deck_id: v.string(),
    variant_id: v.nullable(v.string()),
    rating: v.picklist(["again", "hard", "good", "easy", "manual"]),
    answered_at: v.string(),
    response_time_ms: v.nullable(nonNegativeIntegerSchema),
    scheduler_before: v.nullable(v.unknown()),
    scheduler_after: v.nullable(v.unknown()),
    flags: jsonObjectSchema,
    created_at: v.string(),
    created_by_device_id: v.nullable(v.string()),
  }),
} satisfies Record<AccountTable, v.GenericSchema>;

const profileRowSchema = v.looseObject({
  id: v.string(),
  scheduler_preferences: v.optional(jsonObjectSchema),
  ui_preferences: v.optional(jsonObjectSchema),
});
const mediaFileRowSchema = v.looseObject({
  sha1: sha1Schema,
  size: nonNegativeIntegerSchema,
  mime_type: v.string(),
  original_name: v.pipe(v.string(), v.minLength(1)),
  storage_path: v.pipe(v.string(), v.minLength(1)),
  created_at: v.string(),
});
const cardCatalogRowSchema = v.looseObject({
  id: v.string(),
  deck_id: v.string(),
  note_id: v.string(),
  front_preview: v.string(),
  sort_text: v.string(),
  due_at: v.nullable(v.string()),
  schedule_state: v.string(),
  maturity_band: v.string(),
  reviewable: v.boolean(),
  has_active_variants: v.boolean(),
  active_variant_count: nonNegativeIntegerSchema,
  active_variant_id: v.nullable(v.string()),
  body_revision: positiveIntegerSchema,
  study_revision: nonNegativeIntegerSchema,
  dependency_revision: positiveIntegerSchema,
  sync_change_id: positiveIntegerSchema,
  deleted_at: v.nullable(v.string()),
  updated_at: v.string(),
});
const deckStudySummarySchema = v.looseObject({
  deckId: v.string(),
  totalCount: nonNegativeIntegerSchema,
  newCount: nonNegativeIntegerSchema,
  learningCount: nonNegativeIntegerSchema,
  matureCount: nonNegativeIntegerSchema,
  suspendedCount: nonNegativeIntegerSchema,
  activeVariantCount: nonNegativeIntegerSchema,
  updatedAt: v.nullable(v.string()),
});
const deckStudySummaryRowSchema = v.looseObject({
  deck_id: v.string(),
  total_count: nonNegativeIntegerSchema,
  new_count: nonNegativeIntegerSchema,
  learning_count: nonNegativeIntegerSchema,
  mature_count: nonNegativeIntegerSchema,
  suspended_count: nonNegativeIntegerSchema,
  active_variant_count: nonNegativeIntegerSchema,
  sync_change_id: positiveIntegerSchema,
  updated_at: v.string(),
});
const accountStudyOverviewSchema = v.object({
  contextKey: v.string(),
  dayKey: v.string(),
  introducedTodayByDeck: v.record(v.string(), nonNegativeIntegerSchema),
  reviewedTodayByDeck: v.record(v.string(), nonNegativeIntegerSchema),
  availableNewByDeck: v.record(v.string(), nonNegativeIntegerSchema),
  availableLearningByDeck: v.record(v.string(), nonNegativeIntegerSchema),
  dueByDeck: v.record(v.string(), nonNegativeIntegerSchema),
  forecastByDay: v.record(v.string(), nonNegativeIntegerSchema),
  generatedAt: v.string(),
});
const dueForecastSchema = v.object({
  contextKey: v.string(),
  forecastByDay: v.record(v.string(), nonNegativeIntegerSchema),
  generatedAt: v.string(),
});
const offlineCardManifestSchema = v.object({
  id: v.string(),
  bodyRevision: positiveIntegerSchema,
  studyRevision: nonNegativeIntegerSchema,
  dependencyRevision: positiveIntegerSchema,
  bodyBytes: nonNegativeIntegerSchema,
  updatedAt: v.string(),
});
const offlineMediaManifestSchema = v.object({
  sha1: sha1Schema,
  size: nonNegativeIntegerSchema,
  mimeType: v.string(),
  originalName: v.string(),
  storagePath: v.string(),
  createdAt: v.string(),
});

function parseRows<T>(schema: v.GenericSchema<unknown, T>, input: unknown, message: string): T[] {
  const result = v.safeParse(v.array(schema), input);
  if (!result.success) throw new Error(message);
  return result.output;
}

export function validateAccountRows(table: AccountTable, input: unknown): AccountRow[] {
  return parseRows(accountRowSchemas[table] as v.GenericSchema<unknown, AccountRow>, input, `Cloud-Daten für ${table} hatten ein ungültiges Format.`);
}

function syncMetadata(row: AccountRow) {
  return {
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    revision: Number(row.revision),
    deletedAt: (row.deleted_at as string | null) ?? null,
    updatedByDeviceId: (row.updated_by_device_id as string | null) ?? null,
  };
}

export function deckFromRow(row: AccountRow): Deck {
  return createCoreDeck({
    id: String(row.id),
    ownerId: String(row.user_id),
    parentDeckId: (row.parent_deck_id as string | null) ?? null,
    name: String(row.name),
    description: String(row.description ?? ""),
    source: row.source as Deck["source"],
    ankiDeckId: (row.anki_deck_id as string | null) ?? null,
    hierarchyPath: row.hierarchy_path as string[],
    deckSettings: row.deck_settings as Record<string, never>,
    ...syncMetadata(row),
  });
}

/** Note content is untrusted JSONB until the content parser validates and sanitizes it. */
export function noteFromRow(row: AccountRow): Note {
  const parsed = parseNoteContent(row.content);
  if (!parsed.ok) throw new Error(`Inhalt ${String(row.id)} aus der Cloud ist ungültig: ${parsed.errors[0]}`);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    content: parsed.value,
    media: row.media as Record<string, string>,
    source: row.source as Note["source"],
    ankiGuid: (row.anki_guid as string | null) ?? null,
    noteTypeSourceId: (row.note_type_source_id as string | null) ?? null,
    translator: row.translator_id ? { id: String(row.translator_id), version: Number(row.translator_version) } : null,
    marked: row.marked === true,
    contentRevision: Number(row.content_revision),
    importedContentRevision: row.imported_content_revision == null ? null : Number(row.imported_content_revision),
    ...syncMetadata(row),
  };
}

export function cardFromRow(row: AccountRow, variants: CardVariant[] = []): Card {
  const study = cardStudyFromReviewState(createReviewState({
    ...(row.study_extra as Record<string, unknown>),
    state: row.state,
    dueAt: row.due_at,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    intervalDays: row.interval_days,
    learningStepIndex: row.learning_step_index,
    lastReviewedAt: row.last_reviewed_at,
    lastRating: row.last_rating,
    sourceSchedulerData: row.source_scheduler ?? null,
  }));
  return {
    id: String(row.id),
    noteId: String(row.note_id),
    deckId: String(row.deck_id),
    promptKey: String(row.prompt_key),
    ankiCardId: (row.anki_card_id as string | null) ?? null,
    status: row.status as Card["status"],
    ankiFlag: Number(row.anki_flag),
    study,
    studyRevision: Number(row.study_revision),
    variants,
    ...syncMetadata(row),
  };
}

export function variantFromRow(row: AccountRow): CardVariant {
  return {
    ...createCardVariant({
      id: String(row.id),
      cardId: String(row.card_id),
      front: String(row.front ?? ""),
      back: String(row.back ?? ""),
      variantLevel: Number(row.variant_level ?? 2),
      isActive: row.is_active !== false,
      transformProfile: row.transform_profile as Record<string, unknown>,
      modelRunId: (row.model_run_id as string | null) ?? null,
      explanation: String(row.explanation ?? ""),
      confidence: Number(row.confidence ?? 0),
      semanticDelta: String(row.semantic_delta ?? ""),
      changedRecognitionCues: row.changed_recognition_cues as string[],
      qualityStatus: row.quality_status as CardVariant["qualityStatus"],
      performance: row.performance as Record<string, never>,
      feedback: row.feedback as CardVariant["feedback"],
      meta: row.meta as Record<string, unknown>,
      ...syncMetadata(row),
    }),
    contentHash: String(row.content_hash ?? ""),
  };
}

export function reviewEventFromRow(row: AccountRow): ReviewEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deckId: String(row.deck_id),
    cardId: String(row.card_id),
    variantId: (row.variant_id as string | null) ?? null,
    rating: row.rating as ReviewEvent["rating"],
    answeredAt: String(row.answered_at),
    responseTimeMs: (row.response_time_ms as number | null) ?? null,
    schedulerBefore: row.scheduler_before ?? null,
    schedulerAfter: row.scheduler_after ?? null,
    flags: row.flags as Record<string, unknown>,
    createdAt: String(row.created_at),
    createdByDeviceId: (row.created_by_device_id as string | null) ?? null,
  };
}

export function noteTypeSourceFromRow(row: AccountRow): StoredNoteTypeSource {
  return {
    id: String(row.id),
    ankiNotetypeId: String(row.anki_notetype_id),
    name: String(row.name),
    definition: row.definition as Record<string, unknown>,
    revision: Number(row.revision),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

const noteTypeDefinitionSchema = v.object({
  translator: v.object({ id: v.string(), version: positiveIntegerSchema }),
  kind: v.number(),
  originalStockKind: v.number(),
  css: v.string(),
  fields: v.array(v.object({ name: v.string(), ordinal: nonNegativeIntegerSchema })),
  templates: v.array(v.object({ name: v.string(), ordinal: nonNegativeIntegerSchema, front: v.string(), back: v.string(), targetDeckId: v.nullable(v.string()) })),
  config: v.unknown(),
});

/** The stored Anki template as translator input; null when the cloud definition does not have the expected shape. */
export function noteTypeSourceForTranslation(source: StoredNoteTypeSource): NoteTypeSource | null {
  const parsed = v.safeParse(noteTypeDefinitionSchema, source.definition);
  return parsed.success ? { id: source.id, ankiNotetypeId: source.ankiNotetypeId, name: source.name, ...parsed.output } : null;
}

export function noteSourceForTranslation(source: StoredNoteSource): NoteSource | null {
  return Array.isArray(source.fields) && source.fields.every((field) => typeof field === "string")
    ? { noteId: source.id, noteTypeSourceId: source.noteTypeSourceId, fields: source.fields }
    : null;
}

export function noteSourceFromRow(row: AccountRow): StoredNoteSource {
  return {
    id: String(row.id),
    noteTypeSourceId: String(row.note_type_source_id),
    fields: row.fields as string[],
    revision: Number(row.revision),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

export function validateProfileRows(input: unknown) {
  return parseRows(profileRowSchema, input, "Cloud-Profildaten hatten ein ungültiges Format.");
}

export function validateMediaFileRows(input: unknown): MediaFileReference[] {
  return parseRows(mediaFileRowSchema, input, "Cloud-Mediendaten hatten ein ungültiges Format.").map((row) => ({
    sha1: row.sha1,
    size: row.size,
    mimeType: row.mime_type,
    originalName: row.original_name,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  }));
}

export function validateIdRows(input: unknown, table: string) {
  return parseRows(v.looseObject({ id: v.string() }), input, `Cloud-Daten für ${table} hatten ein ungültiges Format.`);
}

/** Cloud catalog rows carry no full text; their search text is the preview. */
export function validateCardCatalogRows(input: unknown): CardCatalogEntry[] {
  return parseRows(cardCatalogRowSchema, input, "Cloud-Kartenkatalog hatte ein ungültiges Format.").map((row) => ({
    id: row.id,
    deckId: row.deck_id,
    noteId: row.note_id,
    frontPreview: row.front_preview,
    normalizedSearchText: row.front_preview.toLocaleLowerCase("de"),
    sortText: row.sort_text,
    dueAt: row.due_at,
    scheduleState: row.schedule_state,
    maturityBand: row.maturity_band,
    reviewable: row.reviewable,
    hasActiveVariants: row.has_active_variants,
    activeVariantCount: row.active_variant_count,
    activeVariantId: row.active_variant_id,
    bodyRevision: row.body_revision,
    studyRevision: row.study_revision,
    dependencyRevision: row.dependency_revision,
    syncChangeId: row.sync_change_id,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
  }));
}

export function validateDeckStudySummary(input: unknown): DeckStudySummary {
  const result = v.safeParse(deckStudySummarySchema, input);
  if (!result.success) throw new Error("Cloud-Stapelstatistik hatte ein ungültiges Format.");
  return result.output;
}

export function validateAccountStudyOverview(input: unknown): AccountStudyOverview {
  const result = v.safeParse(accountStudyOverviewSchema, input);
  if (!result.success) throw new Error("Cloud-Lernübersicht hatte ein ungültiges Format.");
  return result.output;
}

export function validateDueForecast(input: unknown) {
  const result = v.safeParse(dueForecastSchema, input);
  if (!result.success) throw new Error("Cloud-Fälligkeitsprognose hatte ein ungültiges Format.");
  return result.output;
}

export function validateDeckStudySummaryRows(input: unknown): DeckStudySummary[] {
  return parseRows(deckStudySummaryRowSchema, input, "Cloud-Stapelstatistiken hatten ein ungültiges Format.").map((row) => ({
    deckId: row.deck_id,
    totalCount: row.total_count,
    newCount: row.new_count,
    learningCount: row.learning_count,
    matureCount: row.mature_count,
    suspendedCount: row.suspended_count,
    activeVariantCount: row.active_variant_count,
    syncChangeId: row.sync_change_id,
    updatedAt: row.updated_at,
  }));
}

export function validateOfflineManifestRows(input: unknown): {
  cards: OfflineCardManifestEntry[];
  media: OfflineMediaManifestEntry[];
} {
  const result = v.safeParse(v.object({
    cards: v.array(offlineCardManifestSchema),
    media: v.array(offlineMediaManifestSchema),
  }), input);
  if (!result.success) throw new Error("Offline-Manifest hatte ein ungültiges Format.");
  return result.output;
}

export function validateAccountStatistics(input: unknown): AccountStatisticsSnapshot {
  const nonNegativeNumberSchema = v.pipe(v.number(), v.minValue(0));
  const dailySchema = v.object({
    total: nonNegativeIntegerSchema,
    learning: nonNegativeIntegerSchema,
    relearning: nonNegativeIntegerSchema,
    young: nonNegativeIntegerSchema,
    mature: nonNegativeIntegerSchema,
    successful: nonNegativeIntegerSchema,
    timedCount: nonNegativeIntegerSchema,
    durationMs: nonNegativeIntegerSchema,
    durationLearningMs: nonNegativeIntegerSchema,
    durationRelearningMs: nonNegativeIntegerSchema,
    durationYoungMs: nonNegativeIntegerSchema,
    durationMatureMs: nonNegativeIntegerSchema,
  });
  const distributionSchema = v.array(v.object({
    key: v.string(),
    label: v.string(),
    count: nonNegativeIntegerSchema,
    cumulativePercent: nonNegativeNumberSchema,
  }));
  const result = v.safeParse(v.object({
    cards: v.object({
      total: nonNegativeIntegerSchema,
      new: nonNegativeIntegerSchema,
      learning: nonNegativeIntegerSchema,
      mature: nonNegativeIntegerSchema,
      suspended: nonNegativeIntegerSchema,
    }),
    reviewsByDay: v.record(v.string(), dailySchema),
    heatmapByDay: v.record(v.string(), nonNegativeIntegerSchema),
    addedCardsByDay: v.record(v.string(), nonNegativeIntegerSchema),
    forecastByDay: v.record(v.string(), v.object({
      learning: nonNegativeIntegerSchema,
      relearning: nonNegativeIntegerSchema,
      young: nonNegativeIntegerSchema,
      mature: nonNegativeIntegerSchema,
      total: nonNegativeIntegerSchema,
    })),
    overdue: nonNegativeIntegerSchema,
    dueTomorrow: nonNegativeIntegerSchema,
    dailyWorkload: nonNegativeNumberSchema,
    status: v.object({ activeVariants: nonNegativeIntegerSchema, deletedItems: nonNegativeIntegerSchema }),
    intervals: v.object({ points: distributionSchema, averageDays: nonNegativeNumberSchema, medianDays: nonNegativeNumberSchema, percentile95Days: nonNegativeNumberSchema }),
    fsrs: v.object({ difficulty: distributionSchema, stability: distributionSchema, retrievability: distributionSchema }),
    retention: v.array(v.object({
      key: v.picklist(["selected", "previous", "all"]),
      youngRemembered: nonNegativeIntegerSchema,
      youngTotal: nonNegativeIntegerSchema,
      matureRemembered: nonNegativeIntegerSchema,
      matureTotal: nonNegativeIntegerSchema,
    })),
    hourly: v.array(v.object({ hour: nonNegativeIntegerSchema, reviews: nonNegativeIntegerSchema, successful: nonNegativeIntegerSchema })),
    ratings: v.array(v.object({
      category: v.picklist(["learning", "relearning", "young", "mature"]),
      rating: v.picklist(["again", "hard", "good", "easy"]),
      count: nonNegativeIntegerSchema,
    })),
    deckReviews: v.record(v.string(), v.object({
      reviews: nonNegativeIntegerSchema,
      successful: nonNegativeIntegerSchema,
      again: nonNegativeIntegerSchema,
      remembered: nonNegativeIntegerSchema,
      retentionTotal: nonNegativeIntegerSchema,
      intervalTotal: nonNegativeNumberSchema,
      intervalCount: nonNegativeIntegerSchema,
      nextDueAt: v.nullable(v.string()),
    })),
    generatedAt: v.string(),
  }), input);
  if (!result.success) throw new Error("Cloud-Statistik hatte ein ungültiges Format.");
  return result.output;
}

export type DueForecast = ReturnType<typeof validateDueForecast>;
