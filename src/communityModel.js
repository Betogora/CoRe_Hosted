import { createCoreDeck, makeId } from "./coreModel.ts";

export const COMMUNITY_ROLES = ["owner", "admin", "member", "viewer"];
export const COMMUNITY_PERMISSIONS = ["view", "copy", "contribute", "admin"];

export function createCommunity({
  id = makeId("community"),
  name = "Neue Community",
  ownerId = "local-user",
  joinMode = "invite_link",
  maxMembers = 20,
  folders = [],
  sharedDecks = [],
  createdAt = new Date().toISOString(),
} = {}) {
  const rootFolder =
    folders[0] ??
    createCommunityFolder({
      communityId: id,
      name: "Geteilte Stapel",
      createdBy: ownerId,
      createdAt,
    });

  return {
    id,
    name: name.trim() || "Neue Community",
    ownerId,
    joinMode,
    maxMembers: Math.min(20, Math.max(2, Number(maxMembers) || 20)),
    members: [{ userId: ownerId, role: "owner", displayName: "Noemi C." }],
    folders: [rootFolder, ...folders.slice(1)],
    sharedDecks,
    createdAt,
  };
}

export function createCommunityFolder({
  id = makeId("folder"),
  communityId,
  parentFolderId = null,
  name = "Ordner",
  createdBy = "local-user",
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    communityId,
    parentFolderId,
    name: name.trim() || "Ordner",
    createdBy,
    createdAt,
  };
}

export function shareDeckToCommunity(community, deck, { folderId = null, permission = "copy", sharedBy = "local-user" } = {}) {
  if (!COMMUNITY_PERMISSIONS.includes(permission)) {
    throw new Error(`Unbekannte Community-Berechtigung: ${permission}`);
  }

  const targetFolderId = folderId ?? community.folders[0]?.id;
  const sharedRef = {
    id: makeId("share"),
    communityId: community.id,
    folderId: targetFolderId,
    deckId: deck.id,
    deckName: deck.name,
    cardCount: deck.cardCount ?? deck.cards?.length ?? 0,
    sharedBy,
    permission,
    visibility: "community",
    createdAt: new Date().toISOString(),
  };

  return {
    community: {
      ...community,
      sharedDecks: [sharedRef, ...(community.sharedDecks ?? []).filter((ref) => ref.deckId !== deck.id)],
    },
    sharedRef,
  };
}

export function copySharedDeckToLibrary(sourceDeck, { nameSuffix = "Kopie" } = {}) {
  const copiedAt = new Date().toISOString();

  return createCoreDeck({
    ...sourceDeck,
    id: makeId("deck"),
    name: `${sourceDeck.name} ${nameSuffix}`.trim(),
    source: "community",
    visibility: "private",
    originalDeckId: sourceDeck.id,
    createdAt: copiedAt,
    updatedAt: copiedAt,
    cards: (sourceDeck.cards ?? []).map((card) => ({
      ...card,
      id: makeId("card"),
      deckId: "",
      source: "community",
      reviewState: null,
      variants: (card.variants ?? []).filter((variant) => variant.qualityStatus === "active"),
    })),
    reviewEvents: [],
    aiJobs: [],
    communityRefs: [{ sourceDeckId: sourceDeck.id, copiedAt }],
    importMeta: {
      ...(sourceDeck.importMeta ?? {}),
      copiedFromCommunity: true,
      sourceDeckId: sourceDeck.id,
    },
  });
}

export function assertCommunityPrivacyPayload(community) {
  const serialized = JSON.stringify(community);
  return !/(reviewEvents|review_states|reviewState|streak|onlineStatus|ranking)/i.test(serialized);
}

