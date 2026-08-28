import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import type { Deck, DeckSettings, LearningItem, NoteTypeDefinitionV1, Profile } from "./coreTypes.ts";
import { MAX_INTERACTIVE_DECK_LEVELS } from "./deckHierarchy.ts";

interface CloudTombstone {
  entityTable: string;
  entityId: string;
  revision: number;
  deletedAt: string;
  updatedByDeviceId: string | null;
}

export interface WorkspaceState {
  version?: number;
  profile: Profile;
  decks: Deck[];
  noteTypeDefinitions: NoteTypeDefinitionV1[];
  cloudTombstones: CloudTombstone[];
  updatedAt: string;
  [key: string]: unknown;
}

export interface DeckMutationResult {
  ok: boolean;
  error: string | null;
  deck: Deck | null;
  updatedDecks: Deck[];
  changedDeckIds: string[];
  nextDecks?: Deck[];
  renamedTo?: string;
  movedToParentDeckId?: string | null;
}

export const DECK_DEPTH_ERROR = "Maximal acht Stapel-Ebenen sind möglich.";

interface DeckPlacementInput {
  deckId: string;
  name?: string | null;
  parentDeckId?: string | null;
  changeType: string;
  reason: string;
}

export function createDemoAnatomyDeck(): Deck {
  return createCoreDeck({
    name: "Demo / Anatomie",
    source: "manual",
    tags: ["anatomie", "demo"],
    cards: [
      createBasicLearningItem("", "Welche Aufgabe hat die Myelinscheide im Nervensystem?", "Sie isoliert Axone elektrisch und erhöht die Leitungsgeschwindigkeit saltatorischer Erregungsleitung.", {
        tags: ["anatomie", "nerven"],
        reviewState: { maturityXp: 132, maturityBand: "variant_ready", repetitions: 4 },
      }),
      createBasicLearningItem("", "Was ist ATP?", "ATP ist ein universeller Energieträger der Zelle.", {
        tags: ["biochemie"],
      }),
    ],
  });
}

export function softDeleteCard(card: LearningItem, deletedAt: string): LearningItem {
  if (card.status === "deleted") return card;

  return {
    ...card,
    status: "deleted",
    deletedAt,
    updatedAt: deletedAt,
  };
}

function collectDeckTreeIds(decks: Deck[] = [], rootDeckId: string): Set<string> {
  const childIdsByParentId = new Map<string, string[]>();
  for (const deck of decks) {
    if (!deck.parentDeckId) continue;
    const childIds = childIdsByParentId.get(deck.parentDeckId) ?? [];
    childIds.push(deck.id);
    childIdsByParentId.set(deck.parentDeckId, childIds);
  }

  const ids = new Set<string>([rootDeckId]);
  const pendingIds = [rootDeckId];
  for (let index = 0; index < pendingIds.length; index += 1) {
    for (const childId of childIdsByParentId.get(pendingIds[index]) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      pendingIds.push(childId);
    }
  }

  return ids;
}

function deckDepth(deckById: ReadonlyMap<string, Deck>, deckId: string): number {
  const visited = new Set<string>();
  let current = deckById.get(deckId) ?? null;
  let depth = 0;

  while (current?.parentDeckId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = deckById.get(current.parentDeckId) ?? null;
    if (!parent) break;
    depth += 1;
    current = parent;
  }

  return depth;
}

export function createDeckPlacementValidator(decks: Deck[], deckId: string): (parentDeckId: string | null) => string | null {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const deck = deckById.get(deckId) ?? null;
  if (!deck) return () => "Stapel nicht gefunden.";

  const movedTreeIds = collectDeckTreeIds(decks, deckId);
  const sourceDepth = deckDepth(deckById, deckId);
  const currentMaximumDepth = Math.max(...[...movedTreeIds].map((id) => deckDepth(deckById, id)));
  const subtreeHeight = Math.max(0, currentMaximumDepth - sourceDepth);
  const maximumInteractiveDepth = MAX_INTERACTIVE_DECK_LEVELS - 1;

  return (parentDeckId) => {
    const requestedParentId = parentDeckId || null;
    const parent = requestedParentId ? deckById.get(requestedParentId) ?? null : null;
    if (requestedParentId && !parent) return "Zielstapel nicht gefunden.";
    if (requestedParentId && movedTreeIds.has(requestedParentId)) {
      return "Ein Stapel kann nicht in sich selbst oder einen eigenen Unterstapel verschoben werden.";
    }
    if ((deck.parentDeckId ?? null) === requestedParentId) return null;

    const nextMaximumDepth = (parent ? deckDepth(deckById, parent.id) + 1 : 0) + subtreeHeight;
    return nextMaximumDepth > maximumInteractiveDepth
      ? DECK_DEPTH_ERROR
      : null;
  };
}

function hierarchyPathOf(deck: Deck): string[] {
  return Array.isArray(deck?.hierarchyPath) && deck.hierarchyPath.length > 0
    ? deck.hierarchyPath.map((part) => String(part).trim()).filter(Boolean)
    : [String(deck?.name ?? "Neuer Stapel").trim() || "Neuer Stapel"];
}

function normalizeDeckName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function makeUniqueSiblingDeckName(
  decks: Deck[] = [],
  { name, parentDeckId = null, excludeDeckId = null }: { name?: unknown; parentDeckId?: string | null; excludeDeckId?: string | null } = {},
): string {
  const baseName = normalizeDeckName(name) || "Neuer Stapel";
  const siblingNames = new Set(
    decks
      .filter((deck) => deck.id !== excludeDeckId && (deck.parentDeckId ?? null) === (parentDeckId ?? null))
      .map((deck) => normalizeDeckName(deck.name).toLowerCase())
      .filter(Boolean),
  );
  let candidate = baseName;

  while (siblingNames.has(candidate.toLowerCase())) {
    candidate = `${candidate}+`;
  }

  return candidate;
}

function createHierarchyPathForDeck(decks: Deck[] = [], { name, parentDeckId = null }: { name?: unknown; parentDeckId?: string | null } = {}): string[] {
  const deckName = makeUniqueSiblingDeckName(decks, { name, parentDeckId });
  const parent = parentDeckId ? decks.find((deck) => deck.id === parentDeckId) ?? null : null;
  const parentPath = parent ? hierarchyPathOf(parent) : [];

  return [...parentPath, deckName];
}

function createDeckMutationError(error: string): DeckMutationResult {
  return {
    ok: false,
    error,
    deck: null,
    updatedDecks: [],
    changedDeckIds: [],
  };
}

export function restoreSoftDeletedCard(card: LearningItem, restoredAt: string, previousStatus: LearningItem["status"] = "active"): LearningItem {
  if (card.status !== "deleted") return card;
  const status = previousStatus === "suspended" ? "suspended" : "active";

  return {
    ...card,
    status,
    deletedAt: null,
    updatedAt: restoredAt,
  };
}

export function updateDeckTreePlacement(state: Pick<WorkspaceState, "decks">, { deckId, name = null, parentDeckId = undefined }: DeckPlacementInput): DeckMutationResult {
  const decks = state.decks ?? [];
  const deck = decks.find((item) => item.id === deckId);
  if (!deck) return createDeckMutationError("Stapel nicht gefunden.");

  const movedTreeIds = collectDeckTreeIds(decks, deckId);
  const wantsParentChange = parentDeckId !== undefined;
  const requestedParentId = wantsParentChange ? parentDeckId || null : deck.parentDeckId ?? null;
  const parent = requestedParentId ? decks.find((item) => item.id === requestedParentId) ?? null : null;

  if (wantsParentChange) {
    const placementError = createDeckPlacementValidator(decks, deckId)(requestedParentId);
    if (placementError) return createDeckMutationError(placementError);
  }

  const nextName = makeUniqueSiblingDeckName(decks, {
    name: name == null ? deck.name : name,
    parentDeckId: requestedParentId,
    excludeDeckId: deck.id,
  });
  if (!nextName) return createDeckMutationError("Bitte gib einen Stapelnamen ein.");

  const oldRootPath = hierarchyPathOf(deck);
  const parentPath = parent ? hierarchyPathOf(parent) : [];
  const nextRootPath = [...parentPath, nextName];
  const unchanged =
    normalizeDeckName(deck.name) === nextName &&
    (deck.parentDeckId ?? null) === requestedParentId &&
    oldRootPath.join("\u001f") === nextRootPath.join("\u001f");

  if (unchanged) {
    return {
      ok: true,
      error: null,
      deck,
      updatedDecks: [deck],
      changedDeckIds: [],
      renamedTo: nextName,
      movedToParentDeckId: requestedParentId,
    };
  }

  const updatedAt = new Date().toISOString();
  const changedDeckIds = [...movedTreeIds];
  const nextDecks = decks.map((currentDeck) => {
    if (!movedTreeIds.has(currentDeck.id)) return currentDeck;

    const currentPath = hierarchyPathOf(currentDeck);
    const suffix = currentDeck.id === deck.id ? [] : currentPath.slice(oldRootPath.length);
    const nextPath = currentDeck.id === deck.id ? nextRootPath : [...nextRootPath, ...suffix];
    const isRoot = currentDeck.id === deck.id;

    return createCoreDeck({
      ...currentDeck,
      name: isRoot ? nextName : currentDeck.name,
      parentDeckId: isRoot ? requestedParentId : currentDeck.parentDeckId ?? null,
      hierarchyPath: nextPath,
      updatedAt,
    });
  });
  return {
    ok: true,
    error: null,
    nextDecks,
    deck: nextDecks.find((item) => item.id === deck.id) ?? null,
    updatedDecks: nextDecks.filter((item) => changedDeckIds.includes(item.id)),
    changedDeckIds,
    renamedTo: nextName,
    movedToParentDeckId: requestedParentId,
  };
}

export function createWorkspaceDeck(decks: Deck[], { name = "Neuer Stapel", parentDeckId = null, description = "", deckSettings = {} }: {
  name?: string;
  parentDeckId?: string | null;
  description?: string;
  deckSettings?: Partial<DeckSettings>;
} = {}): Deck | null {
  const validParentId = parentDeckId && decks.some((deck) => deck.id === parentDeckId) ? parentDeckId : null;
  if (validParentId && deckDepth(new Map(decks.map((deck) => [deck.id, deck])), validParentId) + 1 >= MAX_INTERACTIVE_DECK_LEVELS) return null;
  const hierarchyPath = createHierarchyPathForDeck(decks, { name, parentDeckId: validParentId });
  return createCoreDeck({
    name: hierarchyPath.at(-1) || "Neuer Stapel",
    description,
    source: "manual",
    parentDeckId: validParentId,
    hierarchyPath,
    deckSettings,
    cards: [],
  });
}
