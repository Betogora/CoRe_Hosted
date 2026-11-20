import { fieldSearchKey } from "./coreModel.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

/** One field, matched by name as `Feld:` searches do, or the sort field. */
export type DuplicateKey = { field: string } | "sortField";

export interface DuplicateContent {
  noteId: string;
  cardIds: string[];
  deckId: string;
  preview: string;
}

export interface DuplicateGroup {
  text: string;
  contents: DuplicateContent[];
}

const comparable = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("de");

export function findDuplicateGroups(entries: Iterable<CardCatalogEntry>, key: DuplicateKey): DuplicateGroup[] {
  const fieldKey = key === "sortField" ? null : fieldSearchKey(key.field);
  const contents = new Map<string, DuplicateContent & { text: string }>();
  for (const entry of entries) {
    const known = contents.get(entry.noteId);
    if (known) {
      known.cardIds.push(entry.id);
      continue;
    }
    const text = fieldKey === null ? entry.sortText : entry.searchFields?.find((field) => fieldSearchKey(field.name) === fieldKey)?.text;
    const preview = entry.frontPreview || entry.sortText;
    if (text?.trim()) contents.set(entry.noteId, { noteId: entry.noteId, cardIds: [entry.id], deckId: entry.deckId, preview, text: fieldKey === null ? preview : text });
  }
  const groups = new Map<string, DuplicateGroup>();
  for (const { text, ...content } of contents.values()) {
    const value = comparable(text);
    const group = groups.get(value);
    if (group) group.contents.push(content);
    else groups.set(value, { text: text.trim(), contents: [content] });
  }
  return [...groups.values()]
    .filter((group) => group.contents.length > 1)
    .sort((left, right) => right.contents.length - left.contents.length || left.text.localeCompare(right.text, "de"));
}

/**
 * Replicated search texts name fields by their search key (`rückseite`); `fieldSearchKey` turns either form back into
 * the same key.
 */
export function duplicateFieldNames(entries: Iterable<CardCatalogEntry>): string[] {
  const names = new Map<string, string>();
  for (const entry of entries) {
    for (const field of entry.searchFields ?? []) {
      const key = fieldSearchKey(field.name);
      if (!names.has(key)) names.set(key, field.name.replace(/_/g, " ").replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("de")));
    }
  }
  return [...names.values()];
}
