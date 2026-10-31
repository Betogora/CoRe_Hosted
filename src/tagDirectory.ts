import type { Note } from "./coreTypes.ts";

/** One tag of the account, case-insensitive like Anki, with the spelling that is stored first. */
export interface TagDirectoryEntry {
  tag: string;
  noteCount: number;
  /** Contents that carry the tag from their last import; the rest added it themselves. */
  importedCount: number;
}

const key = (tag: string) => tag.toLocaleLowerCase("und");

/** Local tag directory from the contents in the replica; the cloud offers the same via `list_account_tags`. */
export function createTagDirectoryBuilder() {
  const entries = new Map<string, TagDirectoryEntry>();
  return {
    add(note: Pick<Note, "content" | "importedTags" | "deletedAt">) {
      if (note.deletedAt) return;
      const imported = new Set((note.importedTags ?? []).map(key));
      for (const tag of note.content.tags) {
        const entry = entries.get(key(tag)) ?? { tag, noteCount: 0, importedCount: 0 };
        entry.noteCount += 1;
        if (imported.has(key(tag))) entry.importedCount += 1;
        entries.set(key(tag), entry);
      }
    },
    entries: (): TagDirectoryEntry[] => [...entries.values()].sort((left, right) => left.tag.localeCompare(right.tag, "de")),
  };
}

/** The spelling a tag already has in the account wins, like in Anki. */
export function canonicalTagSpelling(directory: readonly TagDirectoryEntry[], tag: string): string {
  return directory.find((entry) => key(entry.tag) === key(tag))?.tag ?? tag;
}

/**
 * Suggestions for typed text, hierarchy-aware: whole paths starting with the text first, then paths with a `::` part
 * starting with it, then paths containing it; frequent tags first. Already chosen tags are left out.
 */
export function suggestTags(directory: readonly TagDirectoryEntry[], input: string, chosen: readonly string[] = [], limit = 8): TagDirectoryEntry[] {
  const query = key(input.trim());
  if (!query) return [];
  const taken = new Set(chosen.map(key));
  const rank = (entry: TagDirectoryEntry) => {
    const candidate = key(entry.tag);
    if (candidate.startsWith(query)) return 0;
    if (candidate.split("::").some((part) => part.startsWith(query))) return 1;
    return candidate.includes(query) ? 2 : -1;
  };
  return directory
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter(({ entry, rank }) => rank >= 0 && !taken.has(key(entry.tag)))
    .sort((left, right) => left.rank - right.rank || right.entry.noteCount - left.entry.noteCount || left.entry.tag.localeCompare(right.entry.tag, "de"))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
