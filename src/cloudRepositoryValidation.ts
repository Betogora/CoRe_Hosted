import * as v from "valibot";
import type { Json, Tables, TablesInsert, TablesUpdate } from "./database.types.ts";
import type {
  AccountStatisticsSnapshot,
  AccountStudyOverview,
  CardCatalogEntry,
  DeckStudySummary,
  OfflineCardManifestEntry,
  OfflineMediaManifestEntry,
} from "./workspaceReplica.ts";

type GeneratedAccountTable = "decks" | "cards" | "card_variants" | "review_events";
export type AccountTable = GeneratedAccountTable | "note_type_definitions";
export type AccountRow = Tables<GeneratedAccountTable> | Record<string, unknown>;
export type AccountInsert = TablesInsert<GeneratedAccountTable> | Record<string, unknown>;
export type AccountUpdate = TablesUpdate<GeneratedAccountTable> | Record<string, unknown>;
export type CloudJson = Json;
export type MediaAssetRow = Tables<"media_assets">;

const jsonObjectSchema = v.record(v.string(), v.unknown());
const accountRowBaseSchema = {
  id: v.string(),
  user_id: v.string(),
  sync_change_id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
};
const accountRowSchemas: Record<AccountTable, v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>> = {
  decks: v.looseObject({
    ...accountRowBaseSchema,
    tags: v.optional(v.array(v.string())),
    hierarchy_path: v.optional(v.array(v.string())),
    import_meta: v.optional(jsonObjectSchema),
    deck_settings: v.optional(jsonObjectSchema),
  }),
  cards: v.looseObject({
    ...accountRowBaseSchema,
    note_type_definition_id: v.nullable(v.string()),
    content_document: jsonObjectSchema,
    content_revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    original_fields: v.optional(v.array(v.unknown())),
    original_tags: v.optional(v.array(v.string())),
    media_refs: v.optional(v.array(v.string())),
    projection: jsonObjectSchema,
    review_state: v.optional(jsonObjectSchema),
    core_state: v.optional(jsonObjectSchema),
    meta: v.optional(jsonObjectSchema),
  }),
  card_variants: v.looseObject({
    ...accountRowBaseSchema,
    transform_profile: v.optional(jsonObjectSchema),
    changed_recognition_cues: v.optional(v.array(v.string())),
    performance: v.optional(jsonObjectSchema),
    feedback: v.optional(v.array(v.unknown())),
    meta: v.optional(jsonObjectSchema),
  }),
  review_events: v.looseObject({
    ...accountRowBaseSchema,
    scheduler_before: v.optional(v.nullable(jsonObjectSchema)),
    scheduler_after: v.optional(v.nullable(jsonObjectSchema)),
    flags: v.optional(jsonObjectSchema),
  }),
  note_type_definitions: v.looseObject({
    ...accountRowBaseSchema,
    name: v.string(),
    definition: jsonObjectSchema,
    revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    deleted_at: v.optional(v.nullable(v.string())),
  }),
};
const profileRowSchema = v.looseObject({
  id: v.string(),
  scheduler_preferences: v.optional(jsonObjectSchema),
  ui_preferences: v.optional(jsonObjectSchema),
});
const mediaAssetRowSchema = v.looseObject({
  id: v.string(),
  user_id: v.string(),
  deck_id: v.string(),
  card_id: v.nullable(v.string()),
  sha1: v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/)),
  size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  mime_type: v.string(),
  original_name: v.pipe(v.string(), v.minLength(1)),
  storage_bucket: v.pipe(v.string(), v.minLength(1)),
  storage_path: v.pipe(v.string(), v.minLength(1)),
  source: v.string(),
  metadata: jsonObjectSchema,
  created_at: v.string(),
  updated_at: v.string(),
  deleted_at: v.nullable(v.string()),
});
const nonNegativeIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const positiveIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const cardCatalogRowSchema = v.looseObject({
  id: v.string(),
  deck_id: v.string(),
  front_preview: v.string(),
  normalized_search_text: v.string(),
  sort_text: v.string(),
  due_at: v.nullable(v.string()),
  schedule_state: v.string(),
  maturity_band: v.string(),
  reviewable: v.boolean(),
  has_active_variants: v.boolean(),
  active_variant_count: nonNegativeIntegerSchema,
  active_variant_id: v.nullable(v.string()),
  body_revision: positiveIntegerSchema,
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
const offlineCardManifestSchema = v.object({
  id: v.string(),
  bodyRevision: positiveIntegerSchema,
  dependencyRevision: positiveIntegerSchema,
  bodyBytes: nonNegativeIntegerSchema,
  updatedAt: v.string(),
});
const offlineMediaManifestSchema = v.object({
  id: v.string(),
  sha1: v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/)),
  size: nonNegativeIntegerSchema,
  mimeType: v.string(),
  originalName: v.string(),
  storageBucket: v.string(),
  storagePath: v.string(),
  cardId: v.nullable(v.string()),
  updatedAt: v.string(),
});

export function validateAccountRows(table: AccountTable, input: unknown): AccountRow[] {
  if (!Array.isArray(input)) throw new Error("Cloud-Daten hatten ein ungültiges Zeilenformat.");
  const schema = accountRowSchemas[table];
  const rows = input.map((row) => v.safeParse(schema, row));
  if (rows.some((row) => !row.success)) throw new Error(`Cloud-Daten für ${table} hatten ein ungültiges Format.`);
  return rows.map((row) => row.output as AccountRow);
}

export function validateProfileRows(input: unknown) {
  if (!Array.isArray(input)) throw new Error("Cloud-Profildaten hatten ein ungültiges Zeilenformat.");
  const rows = input.map((row) => v.safeParse(profileRowSchema, row));
  if (rows.some((row) => !row.success)) throw new Error("Cloud-Profildaten hatten ein ungültiges Format.");
  return rows.map((row) => row.output);
}

export function validateMediaAssetRows(input: unknown): MediaAssetRow[] {
  if (!Array.isArray(input)) throw new Error("Cloud-Mediendaten hatten ein ungültiges Zeilenformat.");
  const rows = input.map((row) => v.safeParse(mediaAssetRowSchema, row));
  if (rows.some((row) => !row.success)) throw new Error("Cloud-Mediendaten hatten ein ungültiges Format.");
  return rows.map((row) => row.output as MediaAssetRow);
}

export function validateIdRows(input: unknown, table: string) {
  const result = v.safeParse(v.array(v.looseObject({ id: v.string() })), input);
  if (!result.success) throw new Error(`Cloud-Daten für ${table} hatten ein ungültiges Format.`);
  return result.output;
}

export function validateCardCatalogRows(input: unknown): CardCatalogEntry[] {
  const result = v.safeParse(v.array(cardCatalogRowSchema), input);
  if (!result.success) throw new Error("Cloud-Kartenkatalog hatte ein ungültiges Format.");
  return result.output.map((row) => ({
    id: row.id,
    deckId: row.deck_id,
    frontPreview: row.front_preview,
    normalizedSearchText: row.normalized_search_text,
    sortText: row.sort_text,
    dueAt: row.due_at,
    scheduleState: row.schedule_state,
    maturityBand: row.maturity_band,
    reviewable: row.reviewable,
    hasActiveVariants: row.has_active_variants,
    activeVariantCount: row.active_variant_count,
    activeVariantId: row.active_variant_id,
    bodyRevision: row.body_revision,
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

export function validateDeckStudySummaryRows(input: unknown): DeckStudySummary[] {
  const result = v.safeParse(v.array(deckStudySummaryRowSchema), input);
  if (!result.success) throw new Error("Cloud-Stapelstatistiken hatten ein ungültiges Format.");
  return result.output.map((row) => ({
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
