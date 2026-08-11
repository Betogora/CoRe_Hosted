import * as v from "valibot";
import { stableContentHash } from "./coreModel.ts";
import { normalizeDayStartHour } from "./learningDay.ts";

const EXPORT_SCHEMA_VERSION = 2;
export const PORTABLE_EXPORT_FILE_NAME = "core-portable-export.json";
const portableEntitySchema = v.looseObject({ id: v.string() });
const portableExportV2Schema = v.looseObject({
  schema: v.literal("core-portable-export"),
  schemaVersion: v.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: v.string(),
  profile: v.nullable(v.record(v.string(), v.unknown())),
  decks: v.array(portableEntitySchema),
  documents: v.array(portableEntitySchema),
  contentHash: v.optional(v.string()),
});
const portableExportV1Schema = v.looseObject({
  schema: v.literal("core-portable-export"),
  schemaVersion: v.literal(1),
  exportedAt: v.string(),
  profile: v.nullable(v.record(v.string(), v.unknown())),
  decks: v.array(portableEntitySchema),
  documents: v.optional(v.array(portableEntitySchema), []),
  contentHash: v.optional(v.string()),
});
const CORE_DECK_SOURCES = new Set(["anki-apkg", "manual", "text-import", "csv-import", "json-import", "spreadsheet-import"]);

function redactProfile(profile: any) {
  const { account, privacy: _privacy, ...publicProfile } = profile ?? {};
  return {
    ...publicProfile,
    account: account
      ? {
          status: account.status,
          authProvider: account.authProvider,
          createdAt: account.createdAt,
          lastSignedInAt: account.lastSignedInAt,
        }
      : null,
  };
}

function stripSyncMetadata(entity: any = {}) {
  const { revision: _revision, deletedAt: _deletedAt, updatedByDeviceId: _updatedByDeviceId, createdByDeviceId: _createdByDeviceId, ...content } = entity;
  return content;
}

function portableDocument(document: any) {
  return stripSyncMetadata(document);
}

function portableDeck(deck: any) {
  const { visibility: _visibility, aiJobs: _aiJobs, graph: _graph, communityRefs: _communityRefs, ...coreDeck } = stripSyncMetadata(deck);
  return {
    ...coreDeck,
    cards: (deck.cards ?? []).map((card: any) => ({
      ...stripSyncMetadata(card),
      variants: (card.variants ?? []).map(stripSyncMetadata),
    })),
    reviewEvents: (deck.reviewEvents ?? []).map(stripSyncMetadata),
    sourceDocuments: (deck.sourceDocuments ?? []).map(portableDocument),
  };
}

function coreDecks(decks: any) {
  return (Array.isArray(decks) ? decks : [])
    .filter((deck: any) => CORE_DECK_SOURCES.has(deck?.source))
    .map((deck: any) => portableDeck({
      ...deck,
      cards: (Array.isArray(deck?.cards) ? deck.cards : []).filter(
        (card: any) => CORE_DECK_SOURCES.has(card?.source) && card?.sourceType !== "ai_generated",
      ),
    }));
}

export function createPortableExport(state: any, now: any = new Date().toISOString()) {
  const payload = {
    schema: "core-portable-export",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now,
    profile: redactProfile(state.profile),
    decks: coreDecks(state.decks),
    documents: (state.documents ?? []).map(portableDocument),
  };

  return {
    ...payload,
    contentHash: stableContentHash(payload, "export"),
  };
}

export function stringifyPortableExport(state: any, now: any = new Date().toISOString()) {
  return JSON.stringify(createPortableExport(state, now), null, 2);
}

export function validatePortableExport(value: any) {
  let payload: unknown = value;
  const errors: any[] = [];

  if (typeof value === "string") {
    try {
      payload = JSON.parse(value);
    } catch {
      return {
        valid: false,
        errors: ["Export-JSON konnte nicht gelesen werden."],
        payload: null,
      };
    }
  }

  const rawPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (rawPayload?.schema !== "core-portable-export") errors.push("Unbekanntes Export-Schema.");
  const parsed = rawPayload?.schemaVersion === 1
    ? v.safeParse(portableExportV1Schema, payload)
    : v.safeParse(portableExportV2Schema, payload);
  if (rawPayload?.schemaVersion !== 1 && rawPayload?.schemaVersion !== EXPORT_SCHEMA_VERSION) errors.push("Nicht unterstützte Export-Version.");
  if (!parsed.success) {
    if (errors.length === 0) errors.push("Export entspricht nicht dem unterstützten Schema oder der Version.");
  }
  const validatedPayload = parsed.success
    ? {
        schema: "core-portable-export" as const,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: parsed.output.exportedAt,
        profile: redactProfile(parsed.output.profile),
        decks: coreDecks(parsed.output.decks),
        documents: parsed.output.documents ?? [],
        ...(parsed.output.contentHash ? { contentHash: parsed.output.contentHash } : {}),
      }
    : null;
  const profile = validatedPayload?.profile as Record<string, any> | undefined;
  if (profile?.account?.passwordVerifier) {
    errors.push("Export darf keinen lokalen Passwort-Verifier enthalten.");
  }

  return {
    valid: errors.length === 0,
    errors,
    payload: validatedPayload,
  };
}

export function mergePortableExportIntoState(state: any, exportPayload: any) {
  const validation = validatePortableExport(exportPayload);
  if (!validation.valid || !validation.payload) {
    throw new Error(validation.errors.join(" "));
  }

  const payload = validation.payload;
  const existingDeckIds = new Set((state.decks ?? []).map((deck: any) => deck.id));
  const incomingDecks = payload.decks.filter((deck: any) => !existingDeckIds.has(deck.id));
  const importedSchedulerPreferences = payload.profile?.schedulerPreferences;
  const importsDayStartHour = importedSchedulerPreferences
    && typeof importedSchedulerPreferences === "object"
    && Object.prototype.hasOwnProperty.call(importedSchedulerPreferences, "dayStartHour");

  return {
    ...state,
    profile: importsDayStartHour
      ? {
          ...state.profile,
          schedulerPreferences: {
            ...(state.profile?.schedulerPreferences ?? {}),
            dayStartHour: normalizeDayStartHour(importedSchedulerPreferences.dayStartHour),
          },
        }
      : state.profile,
    decks: [...incomingDecks, ...(state.decks ?? [])],
    documents: [...(payload.documents ?? []), ...(state.documents ?? [])],
    updatedAt: new Date().toISOString(),
  };
}
