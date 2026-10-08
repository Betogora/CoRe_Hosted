import { TRANSLATOR_VERSIONS, retranslateNoteContent, type NoteSource, type NoteTypeSource } from "./apkgNoteTranslation.ts";
import { planNoteContentChange, planNoteDeletion } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { IndexedDbCoreRepository, NoteGraphChange } from "./indexedDbCoreRepository.ts";

export type RetranslationPlan =
  | { status: "unchanged" | "kept" }
  | { status: "updated"; change: NoteGraphChange };

const hasStudy = (card: Card) => card.study.reps > 0 || card.study.state !== "new";

/**
 * K5.4: re-translates one unedited import with the current translator. Cards keep their study state; a new prompt
 * becomes a new card. If a card with study state would drop, the content stays unchanged and is reported as kept.
 */
export function planRetranslation(note: Note, cards: Card[], source: NoteTypeSource, noteSource: NoteSource, updatedAt = new Date().toISOString()): RetranslationPlan {
  const translated = retranslateNoteContent(source, noteSource.fields, note.content.tags);
  if (!translated) return { status: "kept" };
  // Generic and field-list cards are keyed by their Anki template ordinal; a better translator may name them.
  const rekeyed = cards.map((card) => {
    const ordinal = /^anki-(\d+)$/.exec(card.promptKey)?.[1];
    const promptKey = ordinal === undefined ? card.promptKey : translated.promptKey(Number(ordinal));
    return promptKey === card.promptKey ? card : { ...card, promptKey, revision: card.revision + 1, updatedAt };
  });
  let plan: ReturnType<typeof planNoteContentChange>;
  try {
    plan = planNoteContentChange({ note, cards: rekeyed }, translated.content, updatedAt);
  } catch {
    return { status: "kept" };
  }
  if (!plan.changed) return { status: "unchanged" };
  if (plan.removedCards.some(hasStudy)) return { status: "kept" };
  const next: Note = { ...plan.note, translator: translated.translator, importedContentRevision: plan.note.contentRevision };
  return {
    status: "updated",
    change: {
      previous: { note, cards },
      next: { note: next, cards: [...plan.keptCards, ...plan.newCards, ...planNoteDeletion(next, plan.removedCards, updatedAt).cards] },
    },
  };
}

const MARKER_KEY = "retranslatedTranslatorVersions";

/**
 * Runs once per translator release and device in the background: pages through the unedited imports of older
 * translator versions and writes only changed contents, which then sync like any edit. Returns the number of
 * updated contents.
 */
export async function runAccountRetranslation(client: unknown, repository: Pick<IndexedDbCoreRepository, "readSyncMetadata" | "writeSyncMetadata" | "saveNoteGraphs" | "loadNotes">): Promise<number> {
  const marker = JSON.stringify(TRANSLATOR_VERSIONS);
  if (await repository.readSyncMetadata(MARKER_KEY) === marker) return 0;
  const [{ listRetranslationCandidates }, { noteSourceForTranslation, noteTypeSourceForTranslation }] = await Promise.all([
    import("./cloudRepository.ts"),
    import("./cloudRepositoryValidation.ts"),
  ]);
  let cursor = "";
  let updated = 0;
  for (;;) {
    const page = await listRetranslationCandidates(client, { ...TRANSLATOR_VERSIONS }, cursor);
    const sources = new Map(page.noteTypeSources.flatMap((stored) => {
      const source = noteTypeSourceForTranslation(stored);
      return source ? [[source.id, source] as const] : [];
    }));
    const noteSources = new Map(page.noteSources.flatMap((stored) => {
      const source = noteSourceForTranslation(stored);
      return source ? [[source.noteId, source] as const] : [];
    }));
    const cardsByNote = new Map<string, Card[]>();
    for (const card of page.cards) cardsByNote.set(card.noteId, [...(cardsByNote.get(card.noteId) ?? []), card]);
    // A content with a pending local change is left alone; the next release run sees it again if still unedited.
    const localRevisions = new Map((await repository.loadNotes(page.notes.map((note) => note.id))).map((note) => [note.id, note.revision]));
    const changes: NoteGraphChange[] = [];
    for (const note of page.notes) {
      if ((localRevisions.get(note.id) ?? note.revision) !== note.revision) continue;
      const source = note.noteTypeSourceId ? sources.get(note.noteTypeSourceId) : undefined;
      const noteSource = noteSources.get(note.id);
      if (!source || !noteSource) continue;
      const plan = planRetranslation(note, cardsByNote.get(note.id) ?? [], source, noteSource);
      if (plan.status === "updated") changes.push(plan.change);
    }
    if (changes.length) await repository.saveNoteGraphs(changes);
    updated += changes.length;
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  await repository.writeSyncMetadata(MARKER_KEY, marker);
  return updated;
}
