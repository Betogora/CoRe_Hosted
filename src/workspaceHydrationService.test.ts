import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { createCloudStateRows } from "./cloudRepository.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createWorkspaceHydrationService } from "./workspaceHydrationService.ts";

Object.assign(globalThis, { IDBKeyRange });

test("Katalogseiten zeigen Previews und hydrieren nur die geöffnete Karte", async () => {
  const indexedDb = new IDBFactory();
  const userId = randomUUID();
  const alpha = createBasicLearningItem("deck-hydration", "Alpha", "Antwort Alpha", { id: "card-alpha" });
  const dueReviewState = { ...alpha.learningItemState, state: "review" as const, dueAt: "2026-08-17T09:00:00.000Z", maturityBand: "young" as const };
  const cards = [
    { ...alpha, reviewState: dueReviewState, learningItemState: dueReviewState },
    createBasicLearningItem("deck-hydration", "Beta", "Antwort Beta", { id: "card-beta" }),
  ];
  const deck = createCoreDeck({ id: "deck-hydration", ownerId: userId, name: "Hydration", source: "manual", cards });
  const state = {
    version: 4,
    profile: { userId, email: "hydration@example.test", displayName: "Hydration", timezone: "UTC", onboardingComplete: true, schedulerPreferences: {}, uiPreferences: {} },
    decks: [deck],
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: [],
    updatedAt: "2026-08-17T10:00:00.000Z",
  } as any;
  const repository = await createIndexedDbCoreRepository({ userId, initialState: state, indexedDb });
  await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
  const cloudRows = createCloudStateRows(state, userId);
  const catalogRows = cards.map((card, index) => ({
    id: card.id,
    user_id: userId,
    deck_id: deck.id,
    front_preview: card.originalFront,
    normalized_search_text: card.originalFront.toLowerCase(),
    sort_text: card.originalFront.toLowerCase(),
    due_at: index === 0 ? "2026-08-17T09:00:00.000Z" : null,
    schedule_state: index === 0 ? "review" : "new",
    maturity_band: index === 0 ? "young" : "new",
    reviewable: true,
    has_active_variants: false,
    active_variant_count: 0,
    active_variant_id: null,
    body_revision: 1,
    dependency_revision: 1,
    sync_change_id: index + 1,
    deleted_at: null,
    updated_at: card.updatedAt,
  }));
  const hydratedRequests: string[][] = [];
  const client = {
    async rpc(name: string, payload: any) {
      if (name === "list_account_card_catalog") return { data: { items: catalogRows, totalCount: 2, hasMore: false, nextCursor: null }, error: null };
      if (name === "hydrate_account_cards") {
        hydratedRequests.push(payload.p_card_ids);
        const ids = new Set(payload.p_card_ids);
        return { data: {
          cards: cloudRows.cards.filter((row: any) => ids.has(row.id)).map((row: any) => ({ ...row, sync_change_id: 10 })),
          variants: cloudRows.card_variants.filter((row: any) => ids.has(row.card_id)).map((row: any) => ({ ...row, sync_change_id: 11 })),
          noteTypeDefinitions: [],
          sourceSnapshots: [],
        }, error: null };
      }
      throw new Error(`Unerwartete RPC ${name}`);
    },
  };
  const service = createWorkspaceHydrationService({ client, repository, mediaStore: null });
  const page = await service.queryCardPage({
    deckId: deck.id,
    page: 0,
    pageSize: 50,
    query: "",
    sort: { field: "sortField", direction: "asc" },
    selectedCardId: "card-beta",
  });

  assert.deepEqual(hydratedRequests, [["card-beta"]]);
  assert.equal(page.selectedCard?.originalBack, "Antwort Beta");
  assert.equal(page.items.find((card) => card.id === "card-alpha")?.meta.catalogOnly, true);
  assert.equal(page.totalCount, 2);

  await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
  hydratedRequests.length = 0;
  const study = await service.prepareStudyWindow([deck.id], { now: "2026-08-17T10:00:00.000Z", timeZone: "UTC" });
  assert.deepEqual(hydratedRequests, [["card-alpha"]], "der Lernstart wartet nur auf die erste jetzt lernbare Karte");
  assert.equal(study.cards.length, 1);
  assert.equal(study.cards[0]?.item.id, "card-alpha");
  assert.equal(study.hasMore, true);

  const remainder = await service.prepareStudyWindow([deck.id], {
    now: "2026-08-17T10:00:00.000Z",
    timeZone: "UTC",
    cursorByDeck: study.cursorByDeck,
  });
  assert.deepEqual(hydratedRequests, [["card-alpha"], ["card-beta"]], "der Sitzungscursor lädt die restlichen Karten nach");
  assert.deepEqual(remainder.cards.map(({ item }) => item.id), ["card-beta"]);
  assert.equal(remainder.hasMore, false);
  repository.close();
});

test("partielle Kataloge geben exakt die angeforderte Cloud-Keyset-Seite zurück", async () => {
  const indexedDb = new IDBFactory();
  const userId = randomUUID();
  const cards = ["Alpha", "Mitte", "Zulu"].map((front, index) => createBasicLearningItem("deck-keyset", front, "Antwort", { id: `card-${index}` }));
  const deck = createCoreDeck({ id: "deck-keyset", ownerId: userId, name: "Keyset", source: "manual", cards });
  const state = {
    version: 4,
    profile: { userId, email: "keyset@example.test", displayName: "Keyset", timezone: "UTC", onboardingComplete: true, schedulerPreferences: {}, uiPreferences: {} },
    decks: [deck], documents: [], noteTypeDefinitions: [], learningItemSourceSnapshots: [], cloudTombstones: [], updatedAt: "2026-08-17T10:00:00.000Z",
  } as any;
  const repository = await createIndexedDbCoreRepository({ userId, initialState: state, indexedDb });
  const all = await repository.listCatalogPage(deck.id, { pageSize: 50 });
  const alpha = all.items.find((entry) => entry.id === "card-0")!;
  const zulu = all.items.find((entry) => entry.id === "card-2")!;
  const rpcRow = (entry: typeof alpha) => ({
    id: entry.id,
    deck_id: entry.deckId,
    front_preview: entry.frontPreview,
    normalized_search_text: entry.normalizedSearchText,
    sort_text: entry.sortText,
    due_at: entry.dueAt,
    schedule_state: entry.scheduleState,
    maturity_band: entry.maturityBand,
    reviewable: entry.reviewable,
    has_active_variants: entry.hasActiveVariants,
    active_variant_count: entry.activeVariantCount,
    active_variant_id: entry.activeVariantId,
    body_revision: entry.bodyRevision,
    dependency_revision: entry.dependencyRevision,
    sync_change_id: Math.max(1, entry.syncChangeId),
    deleted_at: entry.deletedAt,
    updated_at: entry.updatedAt,
  });
  await repository.applyCloudCatalogPage({ table: "card_catalog", entities: [], reset: false, cursor: 1 });

  const cursors: Array<unknown> = [];
  const service = createWorkspaceHydrationService({
    repository,
    mediaStore: null,
    client: {
      async rpc(name: string, payload: any) {
        assert.equal(name, "list_account_card_catalog");
        cursors.push(payload.p_cursor);
        return payload.p_cursor == null
          ? { data: { items: [rpcRow(alpha)], totalCount: 2, hasMore: true, nextCursor: { sortValue: alpha.sortText, id: alpha.id } }, error: null }
          : { data: { items: [rpcRow(zulu)], totalCount: 2, hasMore: false, nextCursor: null }, error: null };
      },
    },
  });
  const page = await service.queryCardPage({ deckId: deck.id, page: 1, pageSize: 1, sort: { field: "sortField", direction: "asc" } });

  assert.deepEqual(cursors, [null, { sortValue: alpha.sortText, id: alpha.id }]);
  assert.deepEqual(page.items.map((card) => card.id), ["card-2"]);
  assert.equal(page.totalCount, 2);
  repository.close();
});

test("ein nach Reload fortgesetzter Deck-Download zählt bereits geprüfte Karten nicht doppelt", async () => {
  const indexedDb = new IDBFactory();
  const userId = randomUUID();
  const card = createBasicLearningItem("deck-resume", "Fortsetzen", "Antwort", { id: "card-resume" });
  const missingCard = createBasicLearningItem("deck-resume", "Nachladen", "Antwort", { id: "card-missing" });
  const deck = createCoreDeck({ id: "deck-resume", ownerId: userId, name: "Fortsetzen", source: "manual", cards: [card, missingCard] });
  const state = {
    version: 4,
    profile: { userId, email: "resume@example.test", displayName: "Resume", timezone: "UTC", onboardingComplete: true, schedulerPreferences: {}, uiPreferences: {} },
    decks: [deck],
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: [],
    updatedAt: "2026-08-17T10:00:00.000Z",
  } as any;
  const repository = await createIndexedDbCoreRepository({
    userId,
    indexedDb,
    initialState: state,
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await repository.touchCardBodies([card.id]);
  await repository.evictCachedCardBodies(1);
  assert.deepEqual(await repository.missingCardBodyIds([card.id, missingCard.id]), [missingCard.id]);
  await repository.appendOfflineManifest(deck.id, [card, missingCard].map((entry) => ({
    id: entry.id,
    bodyRevision: 1,
    dependencyRevision: 1,
    bodyBytes: 100,
    updatedAt: entry.updatedAt,
  })), [], { reset: true });
  await repository.saveOfflineDeck({
    id: deck.id,
    deckId: deck.id,
    state: "error",
    expectedCardCount: 2,
    verifiedCardCount: 1,
    expectedMediaCount: 0,
    verifiedMediaCount: 0,
    expectedBytes: 200,
    downloadedBytes: 100,
    manifestCursor: missingCard.id,
    failureMessage: "Verbindung unterbrochen",
    updatedAt: "2026-08-17T10:00:00.000Z",
  });
  const cloudRows = createCloudStateRows(state, userId);
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      onLine: true,
      storage: {
        async persisted() { return true; },
        async estimate() { return { usage: 1_000, quota: 1_000_000 }; },
      },
    },
  });
  try {
    const service = createWorkspaceHydrationService({
      repository,
      mediaStore: null,
      client: {
        async rpc(name: string, payload: any) {
          if (name === "get_deck_offline_manifest") {
            return { data: { cards: [], media: [], nextCursor: missingCard.id, hasMore: false, totalCount: 2 }, error: null };
          }
          if (name === "hydrate_account_cards") {
            const ids = new Set(payload.p_card_ids);
            return { data: {
              cards: cloudRows.cards.filter((row: any) => ids.has(row.id)).map((row: any) => ({ ...row, sync_change_id: 10 })),
              variants: cloudRows.card_variants.filter((row: any) => ids.has(row.card_id)).map((row: any) => ({ ...row, sync_change_id: 11 })),
              noteTypeDefinitions: [],
              sourceSnapshots: [],
            }, error: null };
          }
          throw new Error(`Unerwartete RPC ${name}`);
        },
      },
    });

    const result = await service.downloadDeck(deck.id);

    assert.equal(result.state, "available");
    assert.equal(result.verifiedCardCount, 2);
    await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
    assert.deepEqual(await repository.missingCardBodyIds([card.id, missingCard.id]), []);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
    repository.close();
  }
});
