import { stableContentHash } from "./coreModel.js";

const EXPORT_SCHEMA_VERSION = 1;

function redactProfile(profile) {
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

export function createPortableExport(state, now = new Date().toISOString()) {
  const payload = {
    schema: "core-portable-export",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now,
    profile: redactProfile(state.profile),
    decks: state.decks ?? [],
    communities: state.communities ?? [],
    aiJobs: state.aiJobs ?? [],
    documents: state.documents ?? [],
  };

  return {
    ...payload,
    contentHash: stableContentHash(payload, "export"),
  };
}

export function stringifyPortableExport(state, now) {
  return JSON.stringify(createPortableExport(state, now), null, 2);
}

export function validatePortableExport(value) {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  const errors = [];

  if (payload?.schema !== "core-portable-export") {
    errors.push("Unbekanntes Export-Schema.");
  }
  if (payload?.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push("Nicht unterstützte Export-Version.");
  }
  if (!Array.isArray(payload?.decks)) {
    errors.push("decks muss ein Array sein.");
  }
  if (payload?.profile?.account?.passwordVerifier) {
    errors.push("Export darf keinen lokalen Passwort-Verifier enthalten.");
  }

  return {
    valid: errors.length === 0,
    errors,
    payload,
  };
}

export function mergePortableExportIntoState(state, exportPayload) {
  const validation = validatePortableExport(exportPayload);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const payload = validation.payload;
  const existingDeckIds = new Set((state.decks ?? []).map((deck) => deck.id));
  const incomingDecks = payload.decks.filter((deck) => !existingDeckIds.has(deck.id));

  return {
    ...state,
    decks: [...incomingDecks, ...(state.decks ?? [])],
    communities: [...(payload.communities ?? []), ...(state.communities ?? [])],
    aiJobs: [...(payload.aiJobs ?? []), ...(state.aiJobs ?? [])],
    documents: [...(payload.documents ?? []), ...(state.documents ?? [])],
    updatedAt: new Date().toISOString(),
  };
}

