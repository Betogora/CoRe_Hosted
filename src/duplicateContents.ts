import type { CardCatalogEntry } from "./workspaceReplica.ts";

type DuplicateEntry = Pick<CardCatalogEntry, "id" | "noteId" | "frontPreview" | "sortText">;

/** The front compared by `is:duplicate`, ignoring case and spacing; empty for a content without front. */
function duplicateKey(entry: DuplicateEntry): string {
  return (entry.frontPreview || entry.sortText).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Contents whose front another content repeats, with the compared front of their group; a content counts once however
 * many cards it has.
 */
export function duplicateContents(entries: Iterable<DuplicateEntry>): Map<string, string> {
  const firstNoteByKey = new Map<string, string>();
  const duplicates = new Map<string, string>();
  const seen = new Set<string>();
  for (const entry of entries) {
    // Cards of a content share its front.
    if (seen.has(entry.noteId)) continue;
    seen.add(entry.noteId);
    const key = duplicateKey(entry);
    if (!key) continue;
    const first = firstNoteByKey.get(key);
    if (first === undefined) firstNoteByKey.set(key, entry.noteId);
    else {
      duplicates.set(first, key);
      duplicates.set(entry.noteId, key);
    }
  }
  return duplicates;
}

/** The entries with each group of `duplicates` together, groups in the order of their first entry. */
export function groupDuplicates<Entry extends Pick<CardCatalogEntry, "id" | "noteId">>(entries: readonly Entry[], duplicates: ReadonlyMap<string, string>): Entry[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    // A card outside the duplicates (`-is:duplicate`, `is:duplicate or …`) keeps its place in the sort order.
    const key = duplicates.get(entry.noteId) ?? `\u0000${entry.id}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()].flat();
}

/**
 * Cards of the surplus contents among `entries`: per group of equal fronts every content but the one with the most
 * reviews (then the oldest). A content alone among the entries stays.
 */
export function surplusDuplicateCardIds(entries: Iterable<DuplicateEntry & Pick<CardCatalogEntry, "reps" | "createdAt">>): string[] {
  const contents = new Map<string, { key: string; cardIds: string[]; reps: number; createdAt: string }>();
  for (const entry of entries) {
    const content = contents.get(entry.noteId);
    const reps = entry.reps ?? 0;
    // Without a creation date a content counts as the newest.
    const createdAt = entry.createdAt ?? "￿";
    if (content) {
      content.cardIds.push(entry.id);
      content.reps += reps;
      if (createdAt < content.createdAt) content.createdAt = createdAt;
    } else contents.set(entry.noteId, { key: duplicateKey(entry), cardIds: [entry.id], reps, createdAt });
  }
  const kept = new Map<string, string>();
  for (const [noteId, content] of contents) {
    if (!content.key) continue;
    const best = kept.get(content.key);
    const other = best === undefined ? null : contents.get(best)!;
    if (!other || content.reps > other.reps || (content.reps === other.reps && (content.createdAt < other.createdAt || (content.createdAt === other.createdAt && noteId < best!)))) {
      kept.set(content.key, noteId);
    }
  }
  return [...contents].flatMap(([noteId, content]) => content.key && kept.get(content.key) !== noteId ? content.cardIds : []);
}
