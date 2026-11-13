import { createCloudProfile } from "./cloudAuth.ts";
import { parseCardSearchQuery } from "./cardSearchQuery.ts";
import type { CardVariant, Deck, Note, ReviewEvent } from "./coreTypes.ts";
import {
  cardFromRow,
  deckFromRow,
  noteFromRow,
  noteSourceFromRow,
  noteTypeSourceFromRow,
  replicatedNoteTypeSourceFromRow,
  reviewEventFromRow,
  validateAccountRows,
  validateAccountTagRows,
  validateAccountStatistics,
  validateAccountStudyOverview,
  validateCardCatalogRows,
  validateCardStudyStateRows,
  validateDeckStudySummary,
  validateDeckStudySummaryRows,
  validateDueForecast,
  validateNoteSearchRows,
  validateOfflineManifestRows,
  requireJsonRecord,
  validateProfileRows,
  validateSimilarNoteRows,
  variantFromRow,
  type CardStudySnapshot,
  type ReplicatedNoteTypeSource,
} from "./cloudRepositoryValidation.ts";
import type {
  AccountStatisticsSnapshot,
  AccountStudyOverview,
  CardCatalogEntry,
  CatalogPage,
  CatalogPageRequest,
  DeckStudySummary,
  NoteSearchEntry,
  OfflineCardManifestEntry,
  OfflineMediaManifestEntry,
} from "./workspaceReplica.ts";
import {
  type CloudRow,
  type CloudClient,
  cloudTable,
  CLOUD_PAGE_SIZE,
  CLOUD_WRITE_BYTE_LIMIT,
  requireNonEmptyString,
} from "./cloudQueries.ts";
export type { CloudClient } from "./cloudQueries.ts";
export { deckToCloudRow, reviewEventToCloudRow, createCloudStateRows } from "./cloudRows.ts";
export { markConflict, listAccountSyncConflicts } from "./cloudConflicts.ts";
export {
  deleteAccountDeckTree,
  registerAccountSyncDevice,
  applyEntityMutation,
  applyEntityMutationBatch,
  recordAtomicReview, undoAtomicReview,
  upsertAccountCloudProfile,
  resolveAccountSyncConflict,
} from "./cloudRevisionedWrites.ts";
export type { CloudEntityPage, EntityMutationPayload, AtomicReviewPayload } from "./cloudRevisionedWrites.ts";
export { ImportGraphVerificationError, verifyAccountImportGraph } from "./cloudImportVerification.ts";

interface AccountBootstrapPage {
  profile: ReturnType<typeof createCloudProfile>;
  decks: Array<{ deck: Deck; summary: DeckStudySummary }>;
  nextCursor: string;
  hasMore: boolean;
  confirmedEmpty: boolean;
  conflictCount: number;
  serverCatalogCursor: number;
  studyOverview?: AccountStudyOverview;
}

export async function loadAccountCloudBootstrap(
  client: CloudClient,
  user: { id: string; email?: string | null },
  { cursor = "", limit = 200, maxBytes = 200 * 1024 }: { cursor?: string; limit?: number; maxBytes?: number } = {},
): Promise<AccountBootstrapPage> {
  const userId = requireNonEmptyString(user?.id, "Nutzer-ID fehlt.");
  const { data, error } = await client.rpc("get_account_bootstrap", {
    p_cursor: cursor,
    p_limit: Math.min(500, Math.max(1, Math.floor(limit))),
    p_max_bytes: Math.min(200 * 1024, Math.max(64 * 1024, Math.floor(maxBytes))),
  });
  if (error) throw error;
  const candidate = requireJsonRecord(data, "Account-Bootstrap-Antwort ist ungültig.");
  if (!Array.isArray(candidate.decks) || typeof candidate.nextCursor !== "string" || typeof candidate.hasMore !== "boolean" || typeof candidate.confirmedEmpty !== "boolean") {
    throw new Error("Account-Bootstrap-Antwort ist unvollständig.");
  }
  const conflictCount = Number(candidate.conflictCount ?? 0);
  const serverCatalogCursor = Number(candidate.serverCatalogCursor ?? 0);
  if (!Number.isSafeInteger(conflictCount) || conflictCount < 0 || !Number.isSafeInteger(serverCatalogCursor) || serverCatalogCursor < 0) {
    throw new Error("Account-Bootstrap enthält ungültige Zähler.");
  }
  const profileRows = candidate.profile == null ? [] : validateProfileRows([candidate.profile]);
  const decks = candidate.decks.map((value) => {
    const entry = requireJsonRecord(value, "Account-Bootstrap enthält einen ungültigen Stapel.");
    const [deck] = validateAccountRows("decks", [entry.deck]);
    return { deck: deckFromRow(deck), summary: validateDeckStudySummary(entry.summary) };
  });
  return {
    profile: createCloudProfile(profileRows[0] ?? null, { id: userId, email: user.email ?? null }),
    decks,
    nextCursor: candidate.nextCursor,
    hasMore: candidate.hasMore,
    confirmedEmpty: candidate.confirmedEmpty,
    conflictCount,
    serverCatalogCursor,
    studyOverview: candidate.studyOverview == null ? undefined : validateAccountStudyOverview(candidate.studyOverview),
  };
}

// Anki templates travel with the catalog so the original layout (ADR-047) works on every device, also offline.
// note_search comes last in each page; its search texts reach the catalog rows of the same page before they are written.
const CATALOG_TABLES = ["decks", "card_catalog", "deck_study_summaries", "note_type_sources", "note_search"] as const;
type CatalogCloudTable = typeof CATALOG_TABLES[number];

export interface CloudCatalogPage {
  table: CatalogCloudTable;
  entities: Deck[] | CardCatalogEntry[] | DeckStudySummary[] | ReplicatedNoteTypeSource[] | NoteSearchEntry[];
  reset: boolean;
  cursor: number;
}

function validateCatalogDeltaResponse(value: unknown) {
  const candidate = requireJsonRecord(value, "Katalog-Delta-Antwort ist ungültig.");
  const nextCursor = Number(candidate.nextCursor);
  if (!Number.isSafeInteger(nextCursor) || nextCursor < 0 || !Array.isArray(candidate.changes) || typeof candidate.hasMore !== "boolean") {
    throw new Error("Katalog-Delta-Antwort ist unvollständig.");
  }
  const changes = candidate.changes.map((value) => {
    const entry = requireJsonRecord(value, "Katalog-Delta-Eintrag ist ungültig.");
    const table = String(entry.table) as CatalogCloudTable;
    if (!CATALOG_TABLES.includes(table) || !entry.row || typeof entry.row !== "object" || Array.isArray(entry.row)) {
      throw new Error("Katalog-Delta-Eintrag ist unvollständig.");
    }
    return { table, row: entry.row };
  });
  return { changes, nextCursor, hasMore: candidate.hasMore };
}

/** Applies every delta page with all its tables in one call; the next page loads while the previous one is applied. */
export async function streamAccountCatalogChanges(
  client: CloudClient,
  cursor: number,
  onPage: (pages: CloudCatalogPage[]) => Promise<void>,
): Promise<number> {
  const pull = async (from: number) => {
    const { data, error } = await client.rpc("pull_account_catalog_delta", {
      p_cursor: from,
      p_limit: CLOUD_PAGE_SIZE,
      p_max_bytes: CLOUD_WRITE_BYTE_LIMIT,
    });
    if (error) throw error;
    return validateCatalogDeltaResponse(data);
  };
  let next = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
  let pending = pull(next);
  while (true) {
    const delta = await pending;
    if (delta.hasMore && delta.nextCursor <= next) throw new Error("Katalog-Delta-Cursor konnte nicht fortgesetzt werden.");
    if (delta.hasMore) {
      pending = pull(delta.nextCursor);
      // A failed apply ends the stream; the page loaded ahead is then dropped without an unhandled rejection.
      pending.catch(() => undefined);
    }
    await onPage(CATALOG_TABLES.map((table) => {
      const rows = delta.changes.filter((change) => change.table === table).map((change) => change.row);
      const entities = table === "decks"
        ? validateAccountRows("decks", rows).map(deckFromRow)
        : table === "card_catalog"
          ? validateCardCatalogRows(rows)
          : table === "deck_study_summaries"
            ? validateDeckStudySummaryRows(rows)
            : table === "note_search"
              ? validateNoteSearchRows(rows)
              : validateAccountRows("note_type_sources", rows).flatMap((row) => replicatedNoteTypeSourceFromRow(row) ?? []);
      return { table, entities, reset: false, cursor: delta.nextCursor };
    }));
    next = delta.nextCursor;
    if (!delta.hasMore) return next;
  }
}

function parseCatalogPage(data: unknown, knownTotalCount?: number): CatalogPage {
  const candidate = requireJsonRecord(data, "Kartenkatalog-Seite ist ungültig.");
  const totalCount = candidate.totalCount == null ? knownTotalCount : Number(candidate.totalCount);
  if (!Array.isArray(candidate.items) || !Number.isSafeInteger(totalCount) || totalCount! < 0 || typeof candidate.hasMore !== "boolean") {
    throw new Error("Kartenkatalog-Seite ist unvollständig.");
  }
  const nextCursor = candidate.nextCursor == null ? null : candidate.nextCursor;
  if (nextCursor != null && (typeof nextCursor !== "object" || Array.isArray(nextCursor)
    || typeof (nextCursor as Record<string, unknown>).sortValue !== "string"
    || typeof (nextCursor as Record<string, unknown>).id !== "string")) {
    throw new Error("Kartenkatalog-Cursor ist ungültig.");
  }
  return {
    items: validateCardCatalogRows(candidate.items),
    totalCount: totalCount!,
    hasMore: candidate.hasMore,
    nextCursor: nextCursor as CatalogPage["nextCursor"],
  };
}

export async function listAccountCardCatalog(client: CloudClient, request: CatalogPageRequest): Promise<CatalogPage> {
  const search = parseCardSearchQuery(request.query, request.searchContext);
  const scope = request.deckId === null ? [{ kind: "deck", ids: [...(request.deckIds ?? [])], negated: false }] : [];
  const call = client.rpc("list_account_card_catalog", {
    p_deck_id: request.deckId,
    p_query: search.text,
    p_terms: [...search.terms, ...scope],
    p_sort_field: request.sort?.field ?? "sortField",
    p_sort_direction: request.sort?.direction ?? "asc",
    p_cursor: request.cursor ?? null,
    p_limit: Math.min(50, Math.max(1, Math.floor(request.limit ?? 50))),
    p_include_total: request.knownTotalCount == null,
    p_offset: request.cursor ? 0 : Math.max(0, Math.floor(request.offset ?? 0)),
  });
  const { data, error } = await (request.signal ? call.abortSignal(request.signal) : call);
  if (error) throw error;
  return parseCatalogPage(data, request.knownTotalCount);
}

/** First search page of every requested deck in one request; decks without hits are absent from the result. */
export async function searchAccountCardCatalog(
  client: CloudClient,
  request: { deckIds: string[]; query: string; searchContext?: CatalogPageRequest["searchContext"]; sort?: CatalogPageRequest["sort"]; limit?: number },
): Promise<Map<string, CatalogPage>> {
  const search = parseCardSearchQuery(request.query, request.searchContext);
  const { data, error } = await client.rpc("search_account_card_catalog", {
    p_deck_ids: request.deckIds,
    p_query: search.text,
    p_terms: search.terms,
    p_sort_field: request.sort?.field ?? "sortField",
    p_sort_direction: request.sort?.direction ?? "asc",
    p_limit: Math.min(50, Math.max(1, Math.floor(request.limit ?? 50))),
  });
  if (error) throw error;
  const groups = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).groups : null;
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) throw new Error("Kartensuche lieferte eine ungültige Antwort.");
  return new Map(Object.entries(groups).map(([deckId, page]) => [deckId, parseCatalogPage(page)]));
}

const CARD_STUDY_STATE_PAGE_SIZE = 2000;

/** Study state of every card in the given decks without card bodies (ADR-034), paged by card id. */
export async function listAccountCardStudyStates(client: CloudClient, deckIds: string[], signal?: AbortSignal): Promise<CardStudySnapshot[]> {
  const ids = [...new Set(deckIds.filter(Boolean))];
  if (ids.length > 5000) throw new Error("Höchstens 5000 Stapel können gleichzeitig geladen werden.");
  const snapshots: CardStudySnapshot[] = [];
  let afterCardId: string | null = null;
  while (ids.length > 0) {
    const call = client.rpc("list_account_card_study_states", { p_deck_ids: ids, p_after_card_id: afterCardId, p_limit: CARD_STUDY_STATE_PAGE_SIZE });
    const { data, error } = await (signal ? call.abortSignal(signal) : call);
    if (error) throw error;
    const page = validateCardStudyStateRows(data);
    snapshots.push(...page);
    if (page.length < CARD_STUDY_STATE_PAGE_SIZE) break;
    afterCardId = page[page.length - 1].cardId;
  }
  return snapshots;
}

/** Card bodies with their contents and variants; note ids additionally load all sibling cards. */
export async function hydrateAccountCards(client: CloudClient, cardIds: string[], noteIds: string[] = []) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  const noteIdList = [...new Set(noteIds.filter(Boolean))];
  if (ids.length > 50 || noteIdList.length > 50) throw new Error("Höchstens 50 Karten oder Inhalte können gleichzeitig geladen werden.");
  const { data, error } = await client.rpc("hydrate_account_cards", { p_card_ids: ids, p_note_ids: noteIdList });
  if (error) throw error;
  const candidate = requireJsonRecord(data, "Kartenkörper-Antwort ist ungültig.");
  const variants = validateAccountRows("card_variants", candidate.variants).map(variantFromRow);
  const variantsByCard = new Map<string, CardVariant[]>();
  for (const variant of variants) variantsByCard.set(variant.cardId, [...(variantsByCard.get(variant.cardId) ?? []), variant]);
  return {
    cards: validateAccountRows("cards", candidate.cards).map((row) => cardFromRow(row, variantsByCard.get(String(row.id)) ?? [])),
    notes: validateAccountRows("notes", candidate.notes).map(noteFromRow),
  };
}

interface DeckOfflineManifestPage {
  cards: OfflineCardManifestEntry[];
  media: OfflineMediaManifestEntry[];
  nextCursor: string;
  hasMore: boolean;
  /** Only on the first page; later pages do not count again. */
  totalCount: number | null;
}

export async function loadDeckOfflineManifest(
  client: CloudClient,
  deckId: string,
  cursor = "",
): Promise<DeckOfflineManifestPage> {
  const { data, error } = await client.rpc("get_deck_offline_manifest", {
    p_deck_id: deckId,
    p_cursor: cursor,
    p_limit: 50,
    p_include_total: cursor === "",
  });
  if (error) throw error;
  const candidate = requireJsonRecord(data, "Offline-Manifest-Antwort ist ungültig.");
  const totalCount = candidate.totalCount == null ? null : Number(candidate.totalCount);
  if (typeof candidate.nextCursor !== "string" || typeof candidate.hasMore !== "boolean" || (totalCount !== null && (!Number.isSafeInteger(totalCount) || totalCount < 0))) {
    throw new Error("Offline-Manifest-Antwort ist unvollständig.");
  }
  const rows = validateOfflineManifestRows({ cards: candidate.cards, media: candidate.media });
  return { ...rows, nextCursor: candidate.nextCursor, hasMore: candidate.hasMore, totalCount };
}

export async function loadAccountStatistics(
  client: CloudClient,
  { deckIds = null, from = null, to = null, timeZone = "UTC", dayStartHour = 0 }: { deckIds?: string[] | null; from?: string | null; to?: string | null; timeZone?: string; dayStartHour?: number } = {},
): Promise<AccountStatisticsSnapshot> {
  const { data, error } = await client.rpc("get_account_statistics", {
    p_deck_ids: deckIds,
    p_from: from,
    p_to: to,
    p_time_zone: timeZone,
    p_day_start_hour: Math.min(23, Math.max(0, Math.floor(dayStartHour))),
  });
  if (error) throw error;
  return validateAccountStatistics(data);
}

/** 365-day forecast of next due dates; loaded after the first dashboard render. */
export async function loadAccountDueForecast(client: CloudClient) {
  const { data, error } = await client.rpc("get_account_due_forecast");
  if (error) throw error;
  return validateDueForecast(data);
}

/** Unedited imports whose translator is older than `currentVersions` (K5.4), with sources and cards. */
export async function listRetranslationCandidates(client: CloudClient, currentVersions: Record<string, number>, cursor = "") {
  const { data, error } = await client.rpc("list_retranslation_candidates", {
    p_current_versions: currentVersions,
    p_cursor: cursor,
    p_limit: 100,
  });
  if (error) throw error;
  const candidate = requireJsonRecord(data, "Neuübersetzungs-Antwort ist ungültig.");
  if (typeof candidate.nextCursor !== "string" || typeof candidate.hasMore !== "boolean") throw new Error("Neuübersetzungs-Antwort ist unvollständig.");
  return {
    notes: validateAccountRows("notes", candidate.notes).map(noteFromRow),
    noteSources: validateAccountRows("note_sources", candidate.noteSources).map(noteSourceFromRow),
    noteTypeSources: validateAccountRows("note_type_sources", candidate.noteTypeSources).map(noteTypeSourceFromRow),
    cards: validateAccountRows("cards", candidate.cards).map((row) => cardFromRow(row)),
    nextCursor: candidate.nextCursor,
    hasMore: candidate.hasMore,
  };
}

/** Media files no active (or recently deleted) content references any more. */
export async function listReleasableMedia(client: CloudClient, limit = 100): Promise<Array<{ sha1: string; storagePath: string }>> {
  const { data, error } = await client.rpc("list_releasable_media", { p_limit: limit });
  if (error) throw error;
  if (!Array.isArray(data) || data.some((entry) => !entry || typeof entry.sha1 !== "string" || typeof entry.storagePath !== "string")) {
    throw new Error("Medienfreigabe-Antwort ist ungültig.");
  }
  return data;
}

/** All answers of one card, oldest first, including manual events (`review_events_user_card_answered_idx`). */
export async function listCardReviewEvents(client: CloudClient, cardId: string, signal?: AbortSignal): Promise<ReviewEvent[]> {
  const call = cloudTable(client, "review_events").select("*").eq("card_id", cardId).order("answered_at").order("id").limit(2000);
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
  return validateAccountRows("review_events", data ?? []).map(reviewEventFromRow);
}

/** Up to three contents with similar text, each with a card to open. */
export async function listSimilarNotes(client: CloudClient, noteId: string, signal?: AbortSignal) {
  const call = client.rpc("list_similar_notes", { p_note_id: noteId, p_limit: 3 });
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
  return validateSimilarNoteRows(data ?? []);
}

/** Account-wide tags with the number of contents and how many of them carry the tag from an import. */
export async function listAccountTags(client: CloudClient, signal?: AbortSignal) {
  const call = client.rpc("list_account_tags");
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
  return validateAccountTagRows(data ?? []);
}

/** Existing imported contents per Anki GUID (K5.7), with the identity of their cards and templates. */
export async function loadReimportTargets(client: CloudClient, ankiGuids: string[]) {
  const notes: Note[] = [];
  const cards: Array<{ id: string; noteId: string; deckId: string; promptKey: string; ankiCardId: string | null }> = [];
  const noteTypeSources: Array<{ id: string; ankiNotetypeId: string }> = [];
  const guids = [...new Set(ankiGuids.filter(Boolean))];
  for (let offset = 0; offset < guids.length; offset += 2_000) {
    const { data, error } = await client.rpc("load_reimport_targets", { p_guids: guids.slice(offset, offset + 2_000) });
    if (error) throw error;
    const candidate = requireJsonRecord(data, "Reimport-Antwort ist ungültig.");
    if (!Array.isArray(candidate.cards) || !Array.isArray(candidate.noteTypeSources)) throw new Error("Reimport-Antwort ist unvollständig.");
    notes.push(...validateAccountRows("notes", candidate.notes).map(noteFromRow));
    for (const card of candidate.cards as Array<CloudRow | null>) {
      if (typeof card?.id !== "string" || typeof card.noteId !== "string" || typeof card.deckId !== "string" || typeof card.promptKey !== "string") {
        throw new Error("Reimport-Antwort enthält eine ungültige Karte.");
      }
      cards.push({ id: card.id, noteId: card.noteId, deckId: card.deckId, promptKey: card.promptKey, ankiCardId: typeof card.ankiCardId === "string" ? card.ankiCardId : null });
    }
    for (const source of candidate.noteTypeSources as Array<CloudRow | null>) {
      if (typeof source?.id !== "string" || typeof source.ankiNotetypeId !== "string") throw new Error("Reimport-Antwort enthält eine ungültige Vorlage.");
      noteTypeSources.push({ id: source.id, ankiNotetypeId: source.ankiNotetypeId });
    }
  }
  return { notes, cards, noteTypeSources };
}
