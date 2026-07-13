import * as v from "valibot";
import { stableContentHash } from "./coreModel.ts";

const EXPORT_SCHEMA_VERSION = 1;
const portableEntitySchema = v.looseObject({ id: v.string() });
const portableExportSchema = v.looseObject({
  schema: v.literal("core-portable-export"),
  schemaVersion: v.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: v.string(),
  profile: v.nullable(v.record(v.string(), v.unknown())),
  decks: v.array(portableEntitySchema),
  communities: v.array(v.unknown()),
  aiJobs: v.array(portableEntitySchema),
  documents: v.array(portableEntitySchema),
  contentHash: v.optional(v.string()),
});

function redactProfile(profile: any) {
  const { account, ...publicProfile } = profile ?? {};
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

function portableAiJob(job: any) {
  return stripSyncMetadata(job);
}

function portableDeck(deck: any) {
  return {
    ...stripSyncMetadata(deck),
    cards: (deck.cards ?? []).map((card: any) => ({
      ...stripSyncMetadata(card),
      variants: (card.variants ?? []).map(stripSyncMetadata),
    })),
    reviewEvents: (deck.reviewEvents ?? []).map(stripSyncMetadata),
    sourceDocuments: (deck.sourceDocuments ?? []).map(portableDocument),
    aiJobs: (deck.aiJobs ?? []).map(portableAiJob),
  };
}

export function createPortableExport(state: any, now: any = new Date().toISOString()) {
  const payload = {
    schema: "core-portable-export",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now,
    profile: redactProfile(state.profile),
    decks: (state.decks ?? []).map(portableDeck),
    communities: state.communities ?? [],
    aiJobs: (state.aiJobs ?? []).map(portableAiJob),
    documents: (state.documents ?? []).map(portableDocument),
  };

  return {
    ...payload,
    contentHash: stableContentHash(payload, "export"),
  };
}

export function stringifyPortableExport(state: any, now: any) {
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

  const parsed = v.safeParse(portableExportSchema, payload);
  const rawPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (rawPayload?.schema !== "core-portable-export") errors.push("Unbekanntes Export-Schema.");
  if (rawPayload?.schemaVersion !== EXPORT_SCHEMA_VERSION) errors.push("Nicht unterstützte Export-Version.");
  if (!parsed.success) {
    if (errors.length === 0) errors.push("Export entspricht nicht dem unterstützten Schema oder der Version.");
  }
  const validatedPayload = parsed.success ? parsed.output : null;
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

  return {
    ...state,
    decks: [...incomingDecks, ...(state.decks ?? [])],
    communities: [...(payload.communities ?? []), ...(state.communities ?? [])],
    aiJobs: [...(payload.aiJobs ?? []), ...(state.aiJobs ?? [])],
    documents: [...(payload.documents ?? []), ...(state.documents ?? [])],
    updatedAt: new Date().toISOString(),
  };
}
