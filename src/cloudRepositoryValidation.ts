import * as v from "valibot";
import type { Json, Tables, TablesInsert, TablesUpdate } from "./database.types.ts";

type GeneratedAccountTable = "decks" | "cards" | "card_variants" | "review_events" | "source_documents";
export type AccountTable = GeneratedAccountTable | "note_type_definitions" | "learning_item_source_snapshots";
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
    version_log: v.optional(v.array(v.unknown())),
  }),
  cards: v.looseObject({
    ...accountRowBaseSchema,
    note_type_definition_id: v.nullable(v.string()),
    content_document: jsonObjectSchema,
    latest_source_snapshot_id: v.nullable(v.string()),
    content_revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    original_fields: v.optional(v.array(v.unknown())),
    original_tags: v.optional(v.array(v.string())),
    immutable_original: v.optional(jsonObjectSchema),
    media_refs: v.optional(v.array(v.string())),
    source_anchors: v.optional(v.array(v.unknown())),
    review_state: v.optional(jsonObjectSchema),
    core_state: v.optional(jsonObjectSchema),
    version_log: v.optional(v.array(v.unknown())),
    meta: v.optional(jsonObjectSchema),
  }),
  card_variants: v.looseObject({
    ...accountRowBaseSchema,
    projection: jsonObjectSchema,
    scheduling_mode: v.picklist(["independent-card", "adaptive-presentation"]),
    study_deck_id: v.nullable(v.string()),
    render_revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    transform_profile: v.optional(jsonObjectSchema),
    changed_recognition_cues: v.optional(v.array(v.string())),
    source_anchors: v.optional(v.array(v.unknown())),
    review_state: v.optional(v.nullable(jsonObjectSchema)),
    performance: v.optional(jsonObjectSchema),
    feedback: v.optional(v.array(v.unknown())),
    version_log: v.optional(v.array(v.unknown())),
    meta: v.optional(jsonObjectSchema),
  }),
  review_events: v.looseObject({
    ...accountRowBaseSchema,
    scheduler_before: v.optional(v.nullable(jsonObjectSchema)),
    scheduler_after: v.optional(v.nullable(jsonObjectSchema)),
    flags: v.optional(jsonObjectSchema),
  }),
  source_documents: v.looseObject({ ...accountRowBaseSchema, metadata: v.optional(jsonObjectSchema) }),
  note_type_definitions: v.looseObject({
    ...accountRowBaseSchema,
    name: v.string(),
    definition: jsonObjectSchema,
    revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    deleted_at: v.optional(v.nullable(v.string())),
  }),
  learning_item_source_snapshots: v.looseObject({
    ...accountRowBaseSchema,
    card_id: v.string(),
    schema_version: v.literal(1),
    source_kind: v.picklist(["anki-apkg", "csv", "legacy-projection"]),
    import_fingerprint: v.string(),
    previous_snapshot_id: v.nullable(v.string()),
    note_type_definition_id: v.nullable(v.string()),
    source_payload: jsonObjectSchema,
    created_at: v.string(),
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
