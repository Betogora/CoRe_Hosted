import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLearningDocumentRows, type LearningDocumentRow } from "./cloudRepositoryValidation.ts";

/** Account-bound tables of versioned learning documents; the database stamps revision and time on every write. */
export type LearningDocumentTable = "learning_summaries";
const COLUMNS = "id, deck_id, document, revision, deleted_at";

async function rows(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<LearningDocumentRow[]> {
  const { data, error } = await request;
  if (error) throw error;
  return validateLearningDocumentRows(data);
}

/** All documents of a deck, deleted ones included so other devices can drop their copies. */
export function listLearningDocuments(client: SupabaseClient, table: LearningDocumentTable, deckId: string) {
  return rows(client.from(table).select(COLUMNS).eq("deck_id", deckId));
}

/**
 * Inserts a new document, or updates one only while the cloud still holds `baseRevision`.
 * Resolves the stored revision, or the newer cloud row (null when it no longer exists) after another device saved in between.
 */
export async function writeLearningDocument(client: SupabaseClient, table: LearningDocumentTable, { userId, id, deckId, document, baseRevision }: {
  userId: string; id: string; deckId: string; document: object; baseRevision: number | null;
}): Promise<{ revision: number } | { conflict: LearningDocumentRow | null }> {
  const [stored] = await rows(baseRevision === null
    ? client.from(table).insert({ user_id: userId, id, deck_id: deckId, document }).select(COLUMNS)
    : client.from(table).update({ document }).eq("id", id).eq("revision", baseRevision).select(COLUMNS));
  if (stored) return { revision: stored.revision };
  const [remote] = await rows(client.from(table).select(COLUMNS).eq("id", id));
  return { conflict: remote ?? null };
}

/** Marks a document deleted for every device; a deletion wins over concurrent edits. */
export async function deleteLearningDocument(client: SupabaseClient, table: LearningDocumentTable, id: string) {
  await rows(client.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id).select(COLUMNS));
}
