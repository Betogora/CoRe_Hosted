import * as v from "valibot";
import { stableContentHash } from "./coreModel.ts";
import { createLearningProfileTemplate, getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "./deckSettings.ts";

const EXPORT_SCHEMA_VERSION = 3;
export const PORTABLE_EXPORT_FILE_NAME = "core-portable-export.json";
const portableEntitySchema = v.looseObject({ id: v.string() });
const portableExportV3Schema = v.looseObject({
  schema: v.literal("core-portable-export"),
  schemaVersion: v.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: v.string(),
  profile: v.nullable(v.record(v.string(), v.unknown())),
  decks: v.array(portableEntitySchema),
  documents: v.array(portableEntitySchema),
  noteTypeDefinitions: v.array(portableEntitySchema),
  learningItemSourceSnapshots: v.array(portableEntitySchema),
  contentHash: v.optional(v.string()),
});
const portableExportV2Schema = v.looseObject({
  schema: v.literal("core-portable-export"),
  schemaVersion: v.literal(2),
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
  const {
    account,
    privacy: _privacy,
    university: _university,
    fieldOfStudy: _fieldOfStudy,
    preferredLanguage: _preferredLanguage,
    ...publicProfile
  } = profile ?? {};
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
    noteTypeDefinitions: (state.noteTypeDefinitions ?? []).map(stripSyncMetadata),
    learningItemSourceSnapshots: (state.learningItemSourceSnapshots ?? []).map(stripSyncMetadata),
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
    : rawPayload?.schemaVersion === 2
      ? v.safeParse(portableExportV2Schema, payload)
      : v.safeParse(portableExportV3Schema, payload);
  if (![1, 2, EXPORT_SCHEMA_VERSION].includes(Number(rawPayload?.schemaVersion))) errors.push("Nicht unterstützte Export-Version.");
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
        noteTypeDefinitions: "noteTypeDefinitions" in parsed.output && Array.isArray(parsed.output.noteTypeDefinitions)
          ? parsed.output.noteTypeDefinitions
          : [],
        learningItemSourceSnapshots: "learningItemSourceSnapshots" in parsed.output && Array.isArray(parsed.output.learningItemSourceSnapshots)
          ? parsed.output.learningItemSourceSnapshots
          : [],
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
  const existingDocumentIds = new Set((state.documents ?? []).map((document: any) => document.id));
  const incomingDocuments = (payload.documents ?? []).filter((document: any) => !existingDocumentIds.has(document.id));
  const existingDefinitionIds = new Set((state.noteTypeDefinitions ?? []).map((definition: any) => definition.id));
  const payloadDefinitions = Array.isArray(payload.noteTypeDefinitions) ? payload.noteTypeDefinitions : [];
  const incomingDefinitions = payloadDefinitions.filter((definition: any) => !existingDefinitionIds.has(definition.id));
  const existingSnapshotIds = new Set((state.learningItemSourceSnapshots ?? []).map((snapshot: any) => snapshot.id));
  const payloadSnapshots = Array.isArray(payload.learningItemSourceSnapshots) ? payload.learningItemSourceSnapshots : [];
  const incomingSnapshots = payloadSnapshots.filter((snapshot: any) => !existingSnapshotIds.has(snapshot.id));
  const importedSchedulerPreferences = payload.profile?.schedulerPreferences;
  const importsSchedulerPreferences = importedSchedulerPreferences && typeof importedSchedulerPreferences === "object";
  const importedPreferenceRecord = importsSchedulerPreferences
    ? importedSchedulerPreferences as Record<string, unknown>
    : {};
  const localPreferences = getGlobalSchedulerPreferences(state.profile);
  const importedPreferences = getGlobalSchedulerPreferences({ schedulerPreferences: importedSchedulerPreferences });
  let mergedLearningProfiles = localPreferences.learningProfiles;
  const remappedProfileIds = new Map<string, { id: string; contentVersion: number }>();
  for (const importedProfile of importedPreferences.learningProfiles) {
    const localProfile = mergedLearningProfiles.find((profile) => profile.id === importedProfile.id);
    if (!localProfile) {
      mergedLearningProfiles = [...mergedLearningProfiles, importedProfile];
    } else if (JSON.stringify(localProfile) !== JSON.stringify(importedProfile)) {
      const forked = createLearningProfileTemplate(mergedLearningProfiles, {
        name: importedProfile.name,
        settings: importedProfile.settings,
      });
      mergedLearningProfiles = forked.profiles;
      remappedProfileIds.set(importedProfile.id, {
        id: forked.template.id,
        contentVersion: forked.template.contentVersion,
      });
    }
  }

  const remappedIncomingDecks = incomingDecks.map((deck: any) => {
    const source = deck.deckSettings?.learningProfileSource;
    const remappedSource = source && typeof source.id === "string" ? remappedProfileIds.get(source.id) : null;
    if (!remappedSource) return deck;
    return {
      ...deck,
      deckSettings: { ...deck.deckSettings, learningProfileSource: remappedSource },
    };
  });

  const importedGlobalPatch = {
    learningProfiles: mergedLearningProfiles,
    ...(Object.hasOwn(importedPreferenceRecord, "dayStartHour")
      ? { dayStartHour: importedPreferences.dayStartHour }
      : {}),
    ...(Object.hasOwn(importedPreferenceRecord, "learnAheadMinutes")
      ? { learnAheadMinutes: importedPreferences.learnAheadMinutes }
      : {}),
    ...(Object.hasOwn(importedPreferenceRecord, "easyDays")
      ? { easyDays: importedPreferences.easyDays }
      : {}),
  };

  return {
    ...state,
    profile: importsSchedulerPreferences
      ? withGlobalSchedulerPreferences(state.profile, importedGlobalPatch)
      : state.profile,
    decks: [...remappedIncomingDecks, ...(state.decks ?? [])],
    documents: [...incomingDocuments, ...(state.documents ?? [])],
    noteTypeDefinitions: [...incomingDefinitions, ...(state.noteTypeDefinitions ?? [])],
    learningItemSourceSnapshots: [...incomingSnapshots, ...(state.learningItemSourceSnapshots ?? [])],
    updatedAt: new Date().toISOString(),
  };
}
