import type { Deck, DeckSource, DeckVisibility, VersionEntry } from "../coreTypes.ts";
import { CORE_DECK_SOURCES, DECK_VISIBILITIES, createDefaultDeckSettings, makeId, normalizeTags, unique } from "./coreValues.ts";
import { createVersionEntry, normalizeVersionLog } from "./reviewState.ts";
import { createCoreLearningItem, type CoreCardInput } from "./learningItems.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];
interface CoreDeckInput { id?: string; name?: string; description?: string; source?: DeckSource; ownerId?: string; parentDeckId?: string | null; hierarchyPath?: string[] | null; visibility?: DeckVisibility; originalDeckId?: string | null; cards?: CoreCardInput[]; tags?: unknown; importMeta?: unknown; deckSettings?: DeckSettingsInput; sourceDocuments?: unknown[]; reviewEvents?: unknown[]; aiJobs?: unknown[]; graph?: unknown; communityRefs?: unknown[]; createdAt?: string; updatedAt?: string; revision?: number; deletedAt?: string | null; updatedByDeviceId?: string | null; versionLog?: VersionEntry[]; }
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

function normalizeVisibility(visibility: unknown): DeckVisibility {
  return typeof visibility === "string" && DECK_VISIBILITIES.includes(visibility as DeckVisibility)
    ? visibility as DeckVisibility
    : "private";
}

export function createCoreDeck({
  id = makeId("deck"),
  name,
  description = "",
  source,
  ownerId = "local-user",
  parentDeckId = null,
  hierarchyPath = null,
  visibility = "private",
  originalDeckId = null,
  cards = [],
  tags = [],
  importMeta = {},
  deckSettings = {},
  sourceDocuments = [],
  reviewEvents = [],
  aiJobs = [],
  graph = null,
  communityRefs = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
  versionLog = [],
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
  const createdEntry = createVersionEntry({
    objectType: "deck",
    objectId: id,
    changeType: "created",
    after: { name: deckName, source },
    createdAt,
  });

  return {
    id,
    ownerId,
    parentDeckId,
    name: deckName,
    description,
    source,
    originalDeckId,
    visibility: normalizeVisibility(visibility),
    hierarchyPath: path.length > 0 ? path : [deckName],
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    cardCount: normalizedCards.length,
    tags: deckTags,
    importMeta,
    deckSettings: createDefaultDeckSettings(deckSettings),
    sourceDocuments,
    cards: normalizedCards,
    reviewEvents,
    aiJobs,
    graph,
    communityRefs,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
  };
}

export function normalizeCoreDeck(deck: unknown): Deck {
  const input = objectRecord(deck) as CoreDeckInput;
  return createCoreDeck({
    ...input,
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    source: input.source && CORE_DECK_SOURCES.includes(input.source) ? input.source : "manual",
  });
}
