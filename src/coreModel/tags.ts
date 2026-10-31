/** Anki's system tags; CoRe maps them to the mark and the leech state instead of keeping them as tags. */
const MARKED_TAG = "marked";
const LEECH_TAG = "leech";

/** Like Anki: whitespace and control characters are invalid inside a tag; an empty `::` component becomes `blank`. */
function normalizeTag(tag: string): string {
  return tag
    .normalize("NFC")
    .split("::")
    .map((component) => component.replace(/[\s\p{Cc}]/gu, "") || "blank")
    .join("::");
}

/** Case-insensitive identity of a tag, as Anki's `unicase`. */
function tagKey(tag: string): string {
  return tag.toLocaleLowerCase("und");
}

/**
 * Stores tags exactly like Anki (`#`, `,`, `;` and `::` stay part of a tag) and drops case-insensitive duplicates,
 * keeping the first spelling. A string splits only at whitespace.
 */
export function normalizeTags(tags: unknown): string[] {
  const values = Array.isArray(tags) ? tags.map(String) : String(tags ?? "").split(/\s+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value.trim()) continue;
    const tag = normalizeTag(value);
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Search keys of a note's tags: each tag and all its `::` parents, lower case (`private.tag_search_keys`). */
export function tagSearchKeys(tags: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const tag of tags) {
    const parts = tagKey(tag).split("::");
    for (let depth = 1; depth <= parts.length; depth += 1) keys.add(parts.slice(0, depth).join("::"));
  }
  return [...keys].sort();
}

/** Splits Anki tags into CoRe tags and the system tags `marked` and `leech`. */
export function splitAnkiSystemTags(tags: readonly string[]): { tags: string[]; marked: boolean; leech: boolean } {
  const keys = tags.map(tagKey);
  return {
    tags: tags.filter((_, index) => keys[index] !== MARKED_TAG && keys[index] !== LEECH_TAG),
    marked: keys.includes(MARKED_TAG),
    leech: keys.includes(LEECH_TAG),
  };
}

/**
 * Three-way merge on reimport: local tags keep their order, tags new in the package are added and tags the package
 * dropped since the last import are removed (`local ∪ (incoming − base) − (base − incoming)`).
 */
export function mergeImportedTags(local: readonly string[], base: readonly string[] | null, incoming: readonly string[]): string[] {
  const baseKeys = new Set((base ?? []).map(tagKey));
  const incomingKeys = new Set(incoming.map(tagKey));
  const kept = local.filter((tag) => incomingKeys.has(tagKey(tag)) || !baseKeys.has(tagKey(tag)));
  return normalizeTags([...kept, ...incoming.filter((tag) => !baseKeys.has(tagKey(tag)))]);
}
