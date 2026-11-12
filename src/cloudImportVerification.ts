// Private to cloudRepository.ts: confirms that a committed import graph arrived completely in the cloud.
import type { ImportVerificationRepairScope, ImportVerificationScope } from "./coreTypes.ts";
import { type CloudRow, type CloudClient, getAuthenticatedUser, selectRowsByField } from "./cloudQueries.ts";

export class ImportGraphVerificationError extends Error {
  readonly code = "import_graph_incomplete";
  constructor(message: string, readonly repairScope: ImportVerificationRepairScope) {
    super(message);
    this.name = "ImportGraphVerificationError";
  }
}

function missingVerifiedRows(expectedIds: string[], rows: CloudRow[]) {
  const expected = new Set(expectedIds);
  const received = new Set(rows.filter((row) => !row.deleted_at).map((row) => String(row.id)));
  return [...expected].filter((id) => !received.has(id));
}

export async function verifyAccountImportGraph(maybeClient: CloudClient | null | undefined, scope: ImportVerificationScope) {
  const user = await getAuthenticatedUser(maybeClient);
  // getAuthenticatedUser rejects a missing client.
  const client = maybeClient as CloudClient;
  const [decks, noteTypeSources, notes, noteSources, cards, reviews] = await Promise.all([
    selectRowsByField(client, "decks", user.id, "id", scope.deckIds),
    selectRowsByField(client, "note_type_sources", user.id, "id", scope.noteTypeSourceIds),
    selectRowsByField(client, "notes", user.id, "id", scope.noteIds),
    selectRowsByField(client, "note_sources", user.id, "id", scope.noteIds),
    selectRowsByField(client, "cards", user.id, "id", scope.cardIds),
    selectRowsByField(client, "review_events", user.id, "id", scope.reviewEventIds),
  ]);
  const importedNoteIds = new Set(notes.filter((note) => note.source === "anki-apkg").map((note) => String(note.id)));
  const repairScope: ImportVerificationRepairScope = {
    deckIds: missingVerifiedRows(scope.deckIds, decks),
    noteTypeSourceIds: missingVerifiedRows(scope.noteTypeSourceIds, noteTypeSources),
    noteIds: [...new Set([
      ...missingVerifiedRows(scope.noteIds, notes),
      ...missingVerifiedRows(scope.noteIds.filter((id) => importedNoteIds.has(id)), noteSources),
    ])],
    cardIds: missingVerifiedRows(scope.cardIds, cards),
    reviewEventIds: missingVerifiedRows(scope.reviewEventIds, reviews),
  };
  const missingCount = Object.values(repairScope).reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
  if (missingCount) throw new ImportGraphVerificationError(`${missingCount} erwartete Importdatensätze fehlen in der Cloud.`, repairScope);

  const activeDecks = decks.filter((deck) => !deck.deleted_at);
  const knownDeckIds = new Set(activeDecks.map((deck) => String(deck.id)));
  const externalParentIds = [...new Set(activeDecks.map((deck) => String(deck.parent_deck_id ?? "")).filter((id) => id && !knownDeckIds.has(id)))];
  if (externalParentIds.length) {
    const parents = await selectRowsByField(client, "decks", user.id, "id", externalParentIds);
    const missingParents = missingVerifiedRows(externalParentIds, parents);
    if (missingParents.length) throw new ImportGraphVerificationError("Mindestens ein übergeordneter Stapel fehlt in der Cloud.", { deckIds: missingParents });
  }

  const expectedDeckIds = new Set(scope.deckIds);
  const expectedNoteIds = new Set(scope.noteIds);
  for (const card of cards.filter((row) => !row.deleted_at)) {
    if (!expectedDeckIds.has(String(card.deck_id))) throw new Error(`Karte ${card.id} ist dem falschen Stapel zugeordnet.`);
    if (!expectedNoteIds.has(String(card.note_id))) throw new Error(`Karte ${card.id} verweist auf einen unerwarteten Inhalt.`);
  }
  const expectedCardIds = new Set(scope.cardIds);
  for (const review of reviews) {
    if (!expectedCardIds.has(String(review.card_id))) throw new Error(`Review-Ereignis ${review.id} verweist auf eine unerwartete Karte.`);
  }

  return {
    decks: scope.deckIds.length,
    notes: scope.noteIds.length,
    cards: scope.cardIds.length,
    noteTypeSources: scope.noteTypeSourceIds.length,
    reviewEvents: scope.reviewEventIds.length,
  };
}
