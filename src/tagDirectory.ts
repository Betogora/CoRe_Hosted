import type { Note } from "./coreTypes.ts";

export interface TagDirectoryEntry {
  tag: string;
  noteCount: number;
  /** Contents that carry the tag from their last import; the rest added it themselves. */
  importedCount: number;
}

const key = (tag: string) => tag.toLocaleLowerCase("und");

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

/**
 * Optimistic directory until the reloaded one arrives: the tag and its subtags take the new name or go (`to` null);
 * merged counts add up and are only an upper bound.
 */
export function renameDirectoryTag(directory: readonly TagDirectoryEntry[], from: string, to: string | null): TagDirectoryEntry[] {
  const fromKey = key(from);
  const entries = new Map<string, TagDirectoryEntry>();
  const add = (entry: TagDirectoryEntry) => {
    const known = entries.get(key(entry.tag));
    entries.set(key(entry.tag), known ? { tag: known.tag, noteCount: known.noteCount + entry.noteCount, importedCount: known.importedCount + entry.importedCount } : entry);
  };
  const moved: TagDirectoryEntry[] = [];
  for (const entry of directory) {
    if (key(entry.tag) === fromKey || key(entry.tag).startsWith(`${fromKey}::`)) moved.push(entry);
    else add(entry);
  }
  if (to !== null) for (const entry of moved) add({ ...entry, tag: `${to}${entry.tag.slice(from.length)}` });
  return [...entries.values()].sort((left, right) => left.tag.localeCompare(right.tag, "de"));
}

export function canonicalTagSpelling(directory: readonly TagDirectoryEntry[], tag: string): string {
  return directory.find((entry) => key(entry.tag) === key(tag))?.tag ?? tag;
}

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
