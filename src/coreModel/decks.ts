import type { Deck, DeckSource, MediaAssetReference, ReviewEvent } from "../coreTypes.ts";
import { CORE_DECK_SOURCES, createDefaultDeckSettings, makeId, normalizeTags, unique } from "./coreValues.ts";
import { createCoreLearningItem, type CoreCardInput } from "./learningItems.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];
interface CoreDeckInput { id?: string; name?: string; description?: string; source?: DeckSource; ownerId?: string; parentDeckId?: string | null; hierarchyPath?: string[] | null; originalDeckId?: string | null; cards?: CoreCardInput[]; tags?: unknown; importMeta?: Record<string, unknown>; mediaAssets?: MediaAssetReference[]; deckSettings?: DeckSettingsInput; reviewEvents?: ReviewEvent[]; createdAt?: string; updatedAt?: string; revision?: number; deletedAt?: string | null; updatedByDeviceId?: string | null; }
function objectRecord(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" ? value as Record<string, unknown> : {}; }
function splitDeckPath(name: unknown, hierarchyPath: unknown): string[] {
  if (Array.isArray(hierarchyPath) && hierarchyPath.length > 0) {
    return hierarchyPath.map((part) => String(part).trim()).filter(Boolean);
  }

  return String(name ?? "Neuer Kartenstapel")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function createCoreDeck({
  id = makeId("deck"),
  name,
  description = "",
  source = "manual",
  ownerId = "local-user",
  parentDeckId = null,
  hierarchyPath = null,
  originalDeckId = null,
  cards = [],
  tags = [],
  importMeta = {},
  mediaAssets = [],
  deckSettings = {},
  reviewEvents = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
}: CoreDeckInput): Deck {
  if (!source || !CORE_DECK_SOURCES.includes(source)) {
    throw new Error(`Unbekannte Kartenstapel-Quelle: ${source}`);
  }

  const path = splitDeckPath(name, hierarchyPath);
  const deckName = name?.trim() || path.at(-1) || "Neuer Kartenstapel";
  const normalizedCards = cards.map((card) =>
    createCoreLearningItem({
      ...card,
      id: card.id,
      deckId: id,
      cardType: card.cardType ?? card.kind,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }),
  );
  const deckTags = unique([...normalizeTags(tags), ...normalizedCards.flatMap((card) => card.originalTags ?? [])]);
  return {
    id,
    ownerId,
    parentDeckId,
    name: deckName,
    description,
    source,
    originalDeckId,
    hierarchyPath: path.length > 0 ? path : [deckName],
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    cardCount: normalizedCards.length,
    tags: deckTags,
    importMeta,
    mediaAssets: mediaAssets.filter((asset) => !asset.deletedAt),
    deckSettings: createDefaultDeckSettings(deckSettings),
    cards: normalizedCards,
    reviewEvents,
  };
}

export function normalizeCoreDeck(deck: unknown): Deck {
  const input = objectRecord(deck) as unknown as CoreDeckInput;
  return createCoreDeck({
    ...input,
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    source: input.source && CORE_DECK_SOURCES.includes(input.source) ? input.source : "manual",
  });
}
