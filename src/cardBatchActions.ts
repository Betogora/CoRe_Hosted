import { planCardBatchEdit, planCardBatchUndo, planNoteDeletion, planNoteRestore, type CardBatchEdit } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { NoteGraph } from "./workspaceReplica.ts";

/** A mass action on selected cards (KV4): an edit of cards or contents, a study change, or deletion of the contents. */
export type CardBatchAction =
  | CardBatchEdit
  | { kind: "bury" }
  | { kind: "reset" }
  /** Each card gets one of these learning-day starts at random (Anki's `Fälligkeit setzen` with a range). */
  | { kind: "due"; dueAts: readonly string[] }
  | { kind: "delete" };

export interface CardBatchRepository {
  loadNoteGraph(noteId: string): Promise<NoteGraph | null>;
  saveNoteGraphs(changes: Array<{ previous: NoteGraph | null; next: NoteGraph }>): Promise<void>;
  buryCards(cardIds: string[], buried: boolean, occurredAt?: string): Promise<Card[]>;
  resetCards(cardIds: string[], occurredAt?: string): Promise<Card[]>;
  rescheduleCards(cardIds: string[], dueAt: ReadonlyMap<string, string>, occurredAt?: string): Promise<Card[]>;
  restoreCardStudies(studies: ReadonlyMap<string, Card["study"]>, occurredAt?: string): Promise<Card[]>;
}

export interface CardBatchDependencies {
  repository: CardBatchRepository;
  /** Brings the card bodies onto the device (hydration); offline it fails for cards not stored here. */
  openCards(cardIds: string[]): Promise<Array<{ card: Card; note: Note } | null>>;
  /** Learning time of the action; manual study events carry it. */
  now(): string;
  random?: () => number;
}

export interface CardBatchResult {
  /** Selected cards the action changed. */
  changedCount: number;
  /** Contents the action touched (deletion and content edits). */
  noteCount: number;
  /** Takes the action back as a new change; cards changed since keep their later state and count as skipped. */
  undo(): Promise<{ restoredCount: number; skippedCount: number }>;
}

async function loadGraphs(repository: CardBatchRepository, noteIds: Iterable<string>) {
  const graphs = await Promise.all([...new Set(noteIds)].map((noteId) => repository.loadNoteGraph(noteId)));
  return graphs.filter((graph): graph is NoteGraph => Boolean(graph));
}

/**
 * Runs one mass action as one local write; the outbox carries it to the cloud in batches. Cards are hydrated first, so
 * offline the action needs every selected card on this device.
 */
export async function runCardBatch(dependencies: CardBatchDependencies, cardIds: readonly string[], action: CardBatchAction): Promise<CardBatchResult> {
  const { repository } = dependencies;
  const ids = [...new Set(cardIds)];
  const bodies = (await dependencies.openCards(ids)).filter((body): body is { card: Card; note: Note } => Boolean(body));
  const selected = new Set(bodies.map((body) => body.card.id));
  const occurredAt = dependencies.now();

  if (action.kind === "bury" || action.kind === "reset" || action.kind === "due") {
    const before = new Map(bodies.map((body) => [body.card.id, body.card.study]));
    const random = dependencies.random ?? Math.random;
    const changed = action.kind === "bury" ? await repository.buryCards([...selected], true, occurredAt)
      : action.kind === "reset" ? await repository.resetCards([...selected], occurredAt)
        : await repository.rescheduleCards([...selected], new Map([...selected].map((id) => [id, action.dueAts[Math.floor(random() * action.dueAts.length)]])), occurredAt);
    const revisionAfter = new Map(changed.map((card) => [card.id, card.studyRevision]));
    return {
      changedCount: changed.length,
      noteCount: new Set(changed.map((card) => card.noteId)).size,
      async undo() {
        const current = (await dependencies.openCards([...revisionAfter.keys()])).filter((body): body is { card: Card; note: Note } => Boolean(body));
        const unchanged = current.filter((body) => body.card.studyRevision === revisionAfter.get(body.card.id)).map((body) => body.card.id);
        const restored = action.kind === "bury" ? await repository.buryCards(unchanged, false, dependencies.now())
          : await repository.restoreCardStudies(new Map(unchanged.map((id) => [id, before.get(id)!])), dependencies.now());
        return { restoredCount: restored.length, skippedCount: revisionAfter.size - unchanged.length };
      },
    };
  }

  const graphs = await loadGraphs(repository, bodies.map((body) => body.note.id));
  if (action.kind === "delete") {
    const plans = graphs.map((graph) => ({ graph, plan: planNoteDeletion(graph.note, graph.cards, occurredAt) }));
    await repository.saveNoteGraphs(plans.map(({ graph, plan }) => ({ previous: graph, next: { note: plan.note, cards: plan.cards } })));
    return {
      changedCount: plans.reduce((count, { graph }) => count + graph.cards.filter((card) => selected.has(card.id)).length, 0),
      noteCount: plans.length,
      async undo() {
        const restoredAt = dependencies.now();
        await repository.saveNoteGraphs(plans.map(({ plan }) => {
          const deleted = { note: plan.note, cards: plan.cards };
          return { previous: deleted, next: planNoteRestore(plan.undo, deleted, restoredAt) };
        }));
        return { restoredCount: plans.reduce((count, { plan }) => count + plan.cards.length, 0), skippedCount: 0 };
      },
    };
  }

  const plan = planCardBatchEdit(graphs, selected, action, occurredAt);
  await repository.saveNoteGraphs(plan.changes);
  const before = plan.changes.map((change) => change.previous);
  return {
    changedCount: plan.changedCardIds.length,
    noteCount: plan.changes.length,
    async undo() {
      const current = await loadGraphs(repository, before.map((graph) => graph.note.id));
      const undo = planCardBatchUndo(current, before, new Set(plan.changedCardIds), action, dependencies.now());
      await repository.saveNoteGraphs(undo.changes);
      return { restoredCount: undo.changedCardIds.length, skippedCount: undo.skippedCardIds.length };
    },
  };
}
