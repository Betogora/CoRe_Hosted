import { planCardBatchEdit, planCardBatchUndo, planNoteDeletion, planNoteRestore, planTextReplace, planTextReplaceUndo, type CardBatchEdit, type TextReplace, type TextReplacePreview } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { NoteGraph } from "./workspaceReplica.ts";

/** A mass action on selected cards (KV4): an edit of cards or contents, a study change, or deletion of the contents. */
export type CardBatchAction =
  | CardBatchEdit
  | { kind: "bury" }
  | { kind: "reset" }
  /** Each card gets one of these learning-day starts at random (Anki's `Fälligkeit setzen` with a range). */
  | { kind: "due"; dueAts: readonly string[] }
  | { kind: "delete" }
  /** Literal find and replace in the contents of the selected cards (KV5). */
  | ({ kind: "replace" } & TextReplace);

export interface CardBatchRepository {
  loadNoteGraphs(noteIds: string[]): Promise<Array<NoteGraph | null>>;
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
  /** Takes the action back as a new change; cards changed since keep their later state and count as skipped. */
  undo(): Promise<{ restoredCount: number; skippedCount: number }>;
}

const PREVIEW_LIMIT = 20;

async function loadGraphs(repository: CardBatchRepository, noteIds: Iterable<string>) {
  const graphs = await repository.loadNoteGraphs([...new Set(noteIds)]);
  return graphs.filter((graph): graph is NoteGraph => Boolean(graph));
}

async function openGraphs(dependencies: CardBatchDependencies, cardIds: readonly string[]) {
  const bodies = (await dependencies.openCards([...new Set(cardIds)])).filter((body): body is { card: Card; note: Note } => Boolean(body));
  return { selected: new Set(bodies.map((body) => body.card.id)), graphs: await loadGraphs(dependencies.repository, bodies.map((body) => body.note.id)) };
}

export interface TextReplaceSession {
  /** Field names of the selected contents, in the order they first appear. */
  fieldNames: string[];
  preview(edit: TextReplace): { changedCount: number; skippedCount: number; examples: TextReplacePreview[] };
}

/** Loads the selected contents once, so the replace dialog offers their fields and previews each input without saving. */
export async function prepareTextReplace(dependencies: CardBatchDependencies, cardIds: readonly string[]): Promise<TextReplaceSession> {
  const { selected, graphs } = await openGraphs(dependencies, cardIds);
  const fieldNames = [...new Set(graphs.flatMap((graph) => graph.note.content.fields.map((field) => field.name)))];
  return {
    fieldNames,
    preview(edit) {
      const plan = planTextReplace(graphs, selected, edit);
      return { changedCount: plan.changedCardIds.length, skippedCount: plan.skippedCardIds.length, examples: plan.previews.slice(0, PREVIEW_LIMIT) };
    },
  };
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
  if (action.kind === "replace") {
    const plan = planTextReplace(graphs, selected, action, occurredAt);
    await repository.saveNoteGraphs(plan.changes);
    return {
      changedCount: plan.changedCardIds.length,
      async undo() {
        const current = await loadGraphs(repository, plan.changes.map((change) => change.next.note.id));
        const undo = planTextReplaceUndo(current, plan.changes, new Set(plan.changedCardIds), dependencies.now());
        await repository.saveNoteGraphs(undo.changes);
        return { restoredCount: undo.changedCardIds.length, skippedCount: undo.skippedCardIds.length };
      },
    };
  }
  if (action.kind === "delete") {
    const plans = graphs.map((graph) => ({ graph, plan: planNoteDeletion(graph.note, graph.cards, occurredAt) }));
    await repository.saveNoteGraphs(plans.map(({ graph, plan }) => ({ previous: graph, next: { note: plan.note, cards: plan.cards } })));
    return {
      changedCount: plans.reduce((count, { graph }) => count + graph.cards.filter((card) => selected.has(card.id)).length, 0),
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
    async undo() {
      const current = await loadGraphs(repository, before.map((graph) => graph.note.id));
      const undo = planCardBatchUndo(current, before, new Set(plan.changedCardIds), action, dependencies.now());
      await repository.saveNoteGraphs(undo.changes);
      return { restoredCount: undo.changedCardIds.length, skippedCount: undo.skippedCardIds.length };
    },
  };
}
