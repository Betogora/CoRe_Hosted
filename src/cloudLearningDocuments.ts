import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLearningDocumentRows, type LearningDocumentRow } from "./cloudRepositoryValidation.ts";

/** Account-bound tables of versioned learning documents; the database stamps revision and time on every write. */
export type LearningDocumentTable = "learning_summaries" | "learning_mind_maps";
const COLUMNS = "id, deck_id, document, revision, deleted_at";
const IMAGE_BUCKET = "learning-mind-map-images";

async function rows(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<LearningDocumentRow[]> {
  const { data, error } = await request;
  if (error) throw error;
  return validateLearningDocumentRows(data);
}

/** Documents of a deck, or of the whole account without `deckId`; deleted ones included so other devices can drop their copies. */
export function listLearningDocuments(client: SupabaseClient, table: LearningDocumentTable, deckId?: string) {
  const query = client.from(table).select(COLUMNS);
  return rows(deckId === undefined ? query : query.eq("deck_id", deckId));
}

/**
 * Inserts a new document, or updates one only while the cloud still holds `baseRevision`.
 * Resolves the stored revision, or the newer cloud row (null when it no longer exists) after another device saved in between.
 */
export async function writeLearningDocument(client: SupabaseClient, table: LearningDocumentTable, { userId, id, deckId, document, baseRevision }: {
  userId: string; id: string; deckId: string; document: object; baseRevision: number | null;
}): Promise<{ revision: number } | { conflict: LearningDocumentRow | null }> {
  const { data, error } = await (baseRevision === null
    ? client.from(table).insert({ user_id: userId, id, deck_id: deckId, document }).select(COLUMNS)
    : client.from(table).update({ document, deleted_at: null }).eq("id", id).eq("revision", baseRevision).select(COLUMNS));
  // 23505: another device created the same document first.
  if (error && (error as { code?: string }).code !== "23505") throw error;
  const [stored] = error ? [] : validateLearningDocumentRows(data);
  if (stored) return { revision: stored.revision };
  const [remote] = await rows(client.from(table).select(COLUMNS).eq("id", id));
  return { conflict: remote ?? null };
}

/** Marks a document deleted for every device; a deletion wins over concurrent edits. */
export async function deleteLearningDocument(client: SupabaseClient, table: LearningDocumentTable, id: string) {
  await rows(client.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id).select(COLUMNS));
}

const imagePath = (userId: string, sha1: string) => `${userId}/${sha1}`;

/** Uploads a mind map image under its SHA-1; an existing object with the same name already holds the same bytes. */
export async function uploadMindMapImage(client: SupabaseClient, userId: string, sha1: string, blob: Blob) {
  const { error } = await client.storage.from(IMAGE_BUCKET).upload(imagePath(userId, sha1), blob, { contentType: blob.type || "application/octet-stream" });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}

export async function downloadMindMapImage(client: SupabaseClient, userId: string, sha1: string): Promise<Blob | null> {
  const { data, error } = await client.storage.from(IMAGE_BUCKET).download(imagePath(userId, sha1));
  return error ? null : data;
}

export async function removeMindMapImages(client: SupabaseClient, userId: string, sha1s: string[]) {
  if (!sha1s.length) return;
  const { error } = await client.storage.from(IMAGE_BUCKET).remove(sha1s.map((sha1) => imagePath(userId, sha1)));
  if (error) throw error;
}
