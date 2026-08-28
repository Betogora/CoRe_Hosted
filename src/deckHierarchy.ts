import type { Deck } from "./coreTypes.ts";

export const MAX_INTERACTIVE_DECK_LEVELS = 8;

export interface ImportedDeckHierarchyProjection {
  sourcePath: string[];
  visiblePath: string[];
  visibleParentSourcePath: string | null;
  overflowPath: string[];
  wasFlattened: boolean;
}

function normalizePath(parts: readonly unknown[]): string[] {
  return parts.map((part) => String(part).trim()).filter(Boolean);
}

export function projectImportedDeckHierarchy(sourcePath: readonly unknown[]): ImportedDeckHierarchyProjection {
  const normalizedSourcePath = normalizePath(sourcePath);
  const wasFlattened = normalizedSourcePath.length > MAX_INTERACTIVE_DECK_LEVELS;
  const visiblePath = wasFlattened
    ? [...normalizedSourcePath.slice(0, MAX_INTERACTIVE_DECK_LEVELS - 1), normalizedSourcePath.at(-1)!]
    : normalizedSourcePath;
  const visibleParentSourcePath = wasFlattened
    ? normalizedSourcePath.slice(0, MAX_INTERACTIVE_DECK_LEVELS - 1).join("::")
    : normalizedSourcePath.slice(0, -1).join("::");

  return {
    sourcePath: normalizedSourcePath,
    visiblePath,
    visibleParentSourcePath: visibleParentSourcePath || null,
    overflowPath: wasFlattened ? normalizedSourcePath.slice(MAX_INTERACTIVE_DECK_LEVELS - 1) : [],
    wasFlattened,
  };
}

export function getImportedDeckHierarchyOverflow(deck: Pick<Deck, "source" | "importMeta">): ImportedDeckHierarchyProjection | null {
  if (deck.source !== "anki-apkg") return null;
  const sourceMetadata = deck.importMeta?.sourceMetadata;
  if (!sourceMetadata || typeof sourceMetadata !== "object" || Array.isArray(sourceMetadata)) return null;
  const sourcePath = (sourceMetadata as Record<string, unknown>).ankiDeckPath;
  if (typeof sourcePath !== "string") return null;
  const projection = projectImportedDeckHierarchy(sourcePath.split("::"));
  return projection.wasFlattened ? projection : null;
}
