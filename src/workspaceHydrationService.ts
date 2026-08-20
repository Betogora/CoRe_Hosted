import { createBasicLearningItem } from "./coreModel.ts";
import type { LearningItem } from "./coreTypes.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import { requestPersistentWorkspaceStorage } from "./workspaceStorage.ts";
import type { CardCatalogEntry, OfflineDeckRecord } from "./workspaceReplica.ts";
import { markReplicaStartupGate } from "./appPerformance.ts";
import { getLearningDayKey } from "./learningDay.ts";

interface CardPageRequest {
  deckId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: CardTableSort;
  selectedCardId?: string | null;
}

interface StudyWindowOptions {
  now?: string;
  dayStartHour?: number;
  timeZone?: string;
  cursorByDeck?: Record<string, { dueAt: string; id: string }>;
}

function studyCatalogOrder(entry: CardCatalogEntry, now: string) {
  const dueAt = entry.dueAt ? Date.parse(entry.dueAt) : Number.POSITIVE_INFINITY;
  const current = Date.parse(now);
  if (entry.scheduleState !== "new" && Number.isFinite(dueAt) && dueAt <= current) return [0, dueAt, entry.id] as const;
  if (entry.scheduleState === "new") return [1, Number.POSITIVE_INFINITY, entry.id] as const;
  return [2, dueAt, entry.id] as const;
}

function isCatalogEntryAvailable(entry: CardCatalogEntry, currentDayKey: string | null, options: Pick<StudyWindowOptions, "dayStartHour" | "timeZone">) {
  const dueKey = getLearningDayKey(entry.dueAt ?? Number.NaN, options);
  return Boolean(entry.reviewable && dueKey && currentDayKey && dueKey <= currentDayKey);
}

interface DownloadProgress {
  state: OfflineDeckRecord["state"];
  completedCards: number;
  totalCards: number;
  completedMedia: number;
  totalMedia: number;
  downloadedBytes: number;
  expectedBytes: number;
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function constrainedConnection() {
  const connection = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connection?.saveData === true || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

function catalogPlaceholder(entry: CardCatalogEntry): LearningItem {
  return createBasicLearningItem(entry.deckId, entry.frontPreview, "", {
    id: entry.id,
    title: entry.frontPreview,
    createdAt: entry.updatedAt,
    updatedAt: entry.updatedAt,
    revision: entry.bodyRevision,
    status: entry.reviewable ? "active" : "suspended",
    reviewState: {
      state: entry.scheduleState as LearningItem["reviewState"]["state"],
      maturityBand: entry.maturityBand as LearningItem["reviewState"]["maturityBand"],
      dueAt: entry.dueAt ?? "9999-12-31T23:59:59.999Z",
    },
    meta: {
      catalogOnly: true,
      catalogHasActiveVariants: entry.hasActiveVariants,
      bodyRevision: entry.bodyRevision,
      dependencyRevision: entry.dependencyRevision,
    },
  });
}

function chunk<T>(values: T[], size = 50): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

export function createWorkspaceHydrationService({
  client,
  repository,
  mediaStore,
}: {
  client: any;
  repository: IndexedDbCoreRepository;
  mediaStore: AccountMediaStore | null;
}) {
  const pageCursors = new Map<string, Map<number, { sortValue: string; id: string } | null>>();
  let activePageKey = "";
  let activeTotalCount: number | null = null;
  const pageKey = (request: CardPageRequest) => JSON.stringify([
    request.deckId,
    request.query ?? "",
    request.sort?.field ?? "sortField",
    request.sort?.direction ?? "asc",
  ]);

  const hydrateCards = async (cardIds: string[], residency: "cached" | "downloaded" = "cached") => {
    const ids = [...new Set(cardIds.filter(Boolean))];
    if (!ids.length) return [];
    if (!isOnline()) throw new Error("Diese Karten sind noch nicht offline verfügbar.");
    const missing = await repository.missingCardBodyIds(ids);
    if (missing.length > 0) {
      const { hydrateAccountCards } = await import("./cloudRepository.ts");
      for (const batch of chunk(missing)) {
        const result = await hydrateAccountCards(client, batch);
        const returnedIds = new Set(result.cards.map((card: any) => card.id));
        const absent = batch.filter((id) => !returnedIds.has(id));
        if (absent.length > 0) throw new Error("Mindestens eine Karte ist in der Cloud nicht mehr verfügbar.");
        await repository.applyCloudPage({ table: "note_type_definitions", entities: result.noteTypeDefinitions, reset: false });
        await repository.applyCloudPage({ table: "cards", entities: result.cards, reset: false });
        await repository.applyCloudPage({ table: "card_variants", entities: result.variants, reset: false });
      }
    }
    const idsToMark = residency === "downloaded" ? ids : missing;
    if (idsToMark.length > 0) await repository.markCardBodiesResident(idsToMark, residency);
    await repository.touchCardBodies(ids);
    return Promise.all(ids.map((id) => repository.loadCard(id)));
  };

  const fetchCatalogPage = async (request: CardPageRequest) => {
    const key = pageKey(request);
    if (key !== activePageKey) {
      pageCursors.clear();
      activePageKey = key;
      activeTotalCount = null;
    }
    const requestedPage = Math.max(0, Math.floor(request.page ?? 0));
    const cursors = pageCursors.get(key) ?? new Map([[0, null]]);
    pageCursors.set(key, cursors);
    const { listAccountCardCatalog } = await import("./cloudRepository.ts");
    for (let page = 0; page <= requestedPage; page += 1) {
      if (page > 0 && !cursors.has(page)) break;
      if (page < requestedPage && cursors.has(page + 1)) continue;
      const cloudPage = await listAccountCardCatalog(client, {
        deckId: request.deckId,
        query: request.query,
        sort: request.sort,
        cursor: cursors.get(page) ?? null,
        limit: Math.min(50, Math.max(1, request.pageSize ?? 50)),
        knownTotalCount: activeTotalCount ?? undefined,
      });
      activeTotalCount = cloudPage.totalCount;
      await repository.applyCloudCatalogPage({
        table: "card_catalog",
        entities: cloudPage.items,
        reset: false,
        cursor: repository.getReplicaStatus().catalogCursor,
      });
      if (cloudPage.hasMore && cloudPage.nextCursor) cursors.set(page + 1, cloudPage.nextCursor);
      if (page === requestedPage) {
        for (const storedPage of [...cursors.keys()].sort((a, b) => a - b).slice(0, -32)) {
          if (storedPage !== 0 && storedPage !== requestedPage) cursors.delete(storedPage);
        }
        return cloudPage;
      }
    }
    return null;
  };

  const queryCardPage = async (request: CardPageRequest) => {
    const status = repository.getReplicaStatus();
    if (status.catalogCompleteness === "complete") {
      pageCursors.clear();
      activePageKey = "";
      activeTotalCount = null;
    }
    let cloudPage = null;
    let cloudError: unknown = null;
    if (isOnline() && (status.catalogCompleteness !== "complete" || Boolean(request.query?.trim()))) {
      try {
        cloudPage = await fetchCatalogPage(request);
      } catch (error) {
        cloudError = error;
      }
    }
    const local = cloudPage ? null : await repository.listCatalogPage(request.deckId, request);
    const entries = cloudPage?.items ?? local!.items;
    markReplicaStartupGate("catalogUsable", { itemCount: entries.length });
    if (entries.length === 0 && cloudError) throw cloudError;
    const requestedIds = entries.map((entry) => entry.id);
    const selectedId = request.selectedCardId ?? null;
    if (selectedId) await hydrateCards([selectedId]);
    const loaded = await Promise.all(requestedIds.map((id) => repository.loadCard(id)));
    const loadedById = new Map(loaded.filter(Boolean).map((card) => [card!.id, card!]));
    const selectedCard = selectedId ? await repository.loadCard(selectedId) : null;
    return {
      items: entries.map((entry) => loadedById.get(entry.id) ?? catalogPlaceholder(entry)),
      page: Math.max(0, Math.floor(request.page ?? 0)),
      pageSize: Math.min(50, Math.max(1, request.pageSize ?? 50)),
      totalCount: cloudPage?.totalCount ?? local!.totalCount,
      hasMore: cloudPage?.hasMore ?? local!.hasMore,
      selectedCard,
      limitedToLocalCatalog: Boolean(cloudError) || (!isOnline() && status.catalogCompleteness !== "complete"),
    };
  };

  const openCard = async (cardId: string) => {
    const [card] = await hydrateCards([cardId]);
    if (!card) throw new Error("Die Karte konnte nicht geladen werden.");
    return card;
  };

  const prepareStudyWindow = async (deckIds: string[], options: StudyWindowOptions = {}) => {
    const bufferSize = constrainedConnection() ? 5 : 50;
    const now = options.now ?? new Date().toISOString();
    const catalogEntries: CardCatalogEntry[] = [];
    let catalogHasMore = false;
    for (const deckId of deckIds) {
      if (isOnline()) {
        try {
          await fetchCatalogPage({ deckId, page: 0, pageSize: bufferSize, sort: { field: "nextStudyDate", direction: "asc" } });
        } catch {
          // A locally available study window remains usable while catalog refresh waits for retry.
        }
      }
      const cursor = options.cursorByDeck?.[deckId];
      for (let page = 0; catalogEntries.filter((entry) => entry.deckId === deckId).length < bufferSize; page += 1) {
        const local = await repository.listCatalogPage(deckId, { page, pageSize: bufferSize, sort: { field: "nextStudyDate", direction: "asc" } });
        catalogEntries.push(...local.items.filter((entry) => {
          if (!cursor) return true;
          const dueAt = entry.dueAt ?? "9999-12-31T23:59:59.999Z";
          return dueAt > cursor.dueAt || (dueAt === cursor.dueAt && entry.id > cursor.id);
        }));
        catalogHasMore ||= local.hasMore;
        if (!local.hasMore) break;
      }
    }
    const currentDayKey = getLearningDayKey(now, options);
    const nextIds = catalogEntries
      .filter((entry) => isCatalogEntryAvailable(entry, currentDayKey, options))
      .sort((left, right) => {
        const leftOrder = studyCatalogOrder(left, now);
        const rightOrder = studyCatalogOrder(right, now);
        return leftOrder[0] - rightOrder[0] || leftOrder[1] - rightOrder[1] || leftOrder[2].localeCompare(rightOrder[2]);
      })
      .slice(0, bufferSize)
      .map((entry) => entry.id);
    const initialWindow = Object.keys(options.cursorByDeck ?? {}).length === 0;
    const hydrationIds = initialWindow ? nextIds.slice(0, 1) : nextIds;
    if (hydrationIds.length > 0) {
      try {
        await hydrateCards(hydrationIds);
      } catch (error) {
        if ((await repository.missingCardBodyIds(hydrationIds)).length > 0) throw error;
      }
    }
    let session = await repository.loadReviewSession(deckIds, { ...options, limit: bufferSize, cardIds: hydrationIds });
    if (hydrationIds.length > 0 && session.cards.length === 0) {
      const loaded = (await Promise.all(hydrationIds.map((id) => repository.loadCard(id)))).filter((card): card is LearningItem => Boolean(card));
      if (loaded.length === 0) throw new Error("Fällige Karten konnten nicht geladen werden; sie wurden nicht übersprungen.");
      const cursorByDeck = { ...(options.cursorByDeck ?? {}) };
      for (const card of loaded) cursorByDeck[card.deckId] = { dueAt: card.reviewState.dueAt ?? "9999-12-31T23:59:59.999Z", id: card.id };
      session = {
        ...session,
        cards: loaded.map((item) => ({ deckId: item.deckId, item })),
        cursorByDeck,
      };
    }
    await repository.touchCardBodies(session.cards.map(({ item }) => item.id), new Date(Date.now() + 60 * 60 * 1000).toISOString());
    markReplicaStartupGate("workingSetReady", { cardCount: session.cards.length, bufferSize });
    return { ...session, hasMore: session.hasMore || catalogHasMore || nextIds.length > hydrationIds.length, bufferSize };
  };

  const downloadDeck = async (deckId: string, onProgress?: (progress: DownloadProgress) => void) => {
    if (!isOnline()) throw new Error("Der Stapel-Download benötigt eine Internetverbindung.");
    const storage = await requestPersistentWorkspaceStorage();
    if (!storage.supported) throw new Error("Dieser Browser bietet keinen verlässlichen Offline-Speicher.");
    const previous = await repository.getOfflineDeck(deckId);
    const resetManifest = !previous || previous.state === "available" || previous.state === "outdated";
    let cursor = resetManifest ? "" : previous.manifestCursor;
    if (resetManifest) await repository.clearOfflineManifest(deckId);
    let record: OfflineDeckRecord = {
      id: deckId,
      deckId,
      state: "downloading",
      expectedCardCount: resetManifest ? 0 : previous?.expectedCardCount ?? 0,
      verifiedCardCount: resetManifest ? 0 : previous?.verifiedCardCount ?? 0,
      expectedMediaCount: resetManifest ? 0 : previous?.expectedMediaCount ?? 0,
      verifiedMediaCount: resetManifest ? 0 : previous?.verifiedMediaCount ?? 0,
      expectedBytes: resetManifest ? 0 : previous?.expectedBytes ?? 0,
      downloadedBytes: resetManifest ? 0 : previous?.downloadedBytes ?? 0,
      manifestCursor: cursor,
      failureMessage: null,
      updatedAt: new Date().toISOString(),
    };
    await repository.saveOfflineDeck(record);
    const notify = () => onProgress?.({
      state: record.state,
      completedCards: record.verifiedCardCount,
      totalCards: record.expectedCardCount,
      completedMedia: record.verifiedMediaCount,
      totalMedia: record.expectedMediaCount,
      downloadedBytes: record.downloadedBytes,
      expectedBytes: record.expectedBytes,
    });
    notify();
    try {
      const { loadDeckOfflineManifest } = await import("./cloudRepository.ts");
      let firstPage = resetManifest;
      while (true) {
        const page = await loadDeckOfflineManifest(client, deckId, cursor);
        await repository.appendOfflineManifest(deckId, page.cards, page.media, { reset: firstPage });
        firstPage = false;
        cursor = page.nextCursor;
        record = {
          ...record,
          expectedCardCount: page.totalCount,
          expectedMediaCount: record.expectedMediaCount + page.media.length,
          expectedBytes: record.expectedBytes
            + page.cards.reduce((sum, card) => sum + card.bodyBytes, 0)
            + page.media.reduce((sum, entry) => sum + entry.size, 0),
          manifestCursor: cursor,
          updatedAt: new Date().toISOString(),
        };
        await repository.saveOfflineDeck(record);
        notify();
        if (!page.hasMore) break;
      }
      const manifest = await repository.readOfflineManifest(deckId);
      record = {
        ...record,
        expectedMediaCount: manifest.media.length,
        expectedBytes: manifest.cards.reduce((sum, card) => sum + card.bodyBytes, 0)
          + manifest.media.reduce((sum, entry) => sum + entry.size, 0),
        updatedAt: new Date().toISOString(),
      };
      await repository.saveOfflineDeck(record);
      notify();
      const bodyBytesById = new Map(manifest.cards.map((card) => [card.id, card.bodyBytes]));
      let verifiedBodyBytes = 0;
      record = { ...record, verifiedCardCount: 0, verifiedMediaCount: 0, downloadedBytes: 0 };
      if (storage.quota != null && storage.usage != null && storage.usage + record.expectedBytes > storage.quota * 0.95) {
        throw new Error("Für diesen Stapel ist nicht genügend Browserspeicher frei.");
      }
      for (const batch of chunk(manifest.cards.map((card) => card.id))) {
        await hydrateCards(batch, "downloaded");
        verifiedBodyBytes += batch.reduce((sum, id) => sum + (bodyBytesById.get(id) ?? 0), 0);
        record = {
          ...record,
          verifiedCardCount: Math.min(record.expectedCardCount, record.verifiedCardCount + batch.length),
          downloadedBytes: verifiedBodyBytes,
          updatedAt: new Date().toISOString(),
        };
        await repository.saveOfflineDeck(record);
        notify();
      }
      if (mediaStore && manifest.media.length > 0) {
        const mediaResult = await mediaStore.cacheCloudManifestMedia(deckId, manifest.media, (progress) => {
          record = { ...record, verifiedMediaCount: progress.completed, downloadedBytes: verifiedBodyBytes + progress.downloadedBytes };
          notify();
        });
        record = { ...record, verifiedMediaCount: mediaResult.completed, downloadedBytes: verifiedBodyBytes + mediaResult.downloadedBytes };
      } else if (manifest.media.length > 0) {
        throw new Error("Der lokale Medienspeicher ist nicht bereit.");
      }
      const missing = await repository.missingCardBodyIds(manifest.cards.map((card) => card.id));
      if (missing.length > 0 || record.verifiedCardCount !== record.expectedCardCount || record.verifiedMediaCount !== record.expectedMediaCount) {
        throw new Error("Der Offline-Download konnte nicht vollständig verifiziert werden.");
      }
      record = { ...record, state: "available", failureMessage: null, updatedAt: new Date().toISOString() };
      await repository.saveOfflineDeck(record);
      notify();
      return record;
    } catch (error) {
      record = { ...record, state: "error", failureMessage: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
      await repository.saveOfflineDeck(record);
      notify();
      throw error;
    }
  };

  const removeDeckDownload = async (deckId: string) => {
    await repository.removeOfflineDeck(deckId);
    await mediaStore?.removeCachedDeckMedia(deckId);
  };

  const enforceQuota = async (protectedCardIds: string[] = [], activeDeckIds: string[] = []) => {
    const storage = typeof navigator === "undefined" ? null : navigator.storage;
    if (!storage) return { evictedCount: 0, freedBytes: 0 };
    const estimate = await storage?.estimate?.();
    if (!estimate?.usage || !estimate.quota || estimate.usage / estimate.quota < 0.8) return { evictedCount: 0, freedBytes: 0 };
    const target = Math.max(0, estimate.usage - estimate.quota * 0.7);
    const result = await repository.evictCachedCardBodies(target, protectedCardIds);
    let current = await storage.estimate();
    if (mediaStore && current.usage && current.quota && current.usage / current.quota >= 0.8) {
      const pinned = new Set((await repository.listOfflineDecks()).filter((deck) => ["available", "downloading", "outdated"].includes(deck.state)).map((deck) => deck.deckId));
      for (const deck of repository.getShellState().decks) {
        if (pinned.has(deck.id) || activeDeckIds.includes(deck.id)) continue;
        await mediaStore.removeCachedDeckMedia(deck.id);
        current = await storage.estimate();
        if (!current.usage || !current.quota || current.usage / current.quota <= 0.7) break;
      }
    }
    return result;
  };

  const refreshStatistics = async (deckIds: string[] | null = null, from: string | null = null, to: string | null = null, timeZone = "UTC", dayStartHour = 0) => {
    const key = JSON.stringify([deckIds, from, to, timeZone, dayStartHour]);
    if (!isOnline()) return repository.readStatisticsSnapshot(key);
    const { loadAccountStatistics } = await import("./cloudRepository.ts");
    const snapshot = await loadAccountStatistics(client, { deckIds, from, to, timeZone, dayStartHour });
    await repository.cacheStatisticsSnapshot(key, snapshot);
    return snapshot;
  };

  const hydrateDeckStructure = async (deckId: string) => {
    if (!isOnline()) {
      const offlineDeck = await repository.getOfflineDeck(deckId);
      if (!offlineDeck || !["available", "outdated"].includes(offlineDeck.state)) {
        throw new Error("Für den Reimport muss dieser Stapel online oder vollständig offline verfügbar sein.");
      }
      const manifest = await repository.readOfflineManifest(deckId);
      const missing = await repository.missingCardBodyIds(manifest.cards.map((card) => card.id));
      if (missing.length > 0 || manifest.cards.length !== offlineDeck.expectedCardCount) {
        throw new Error("Der vollständige lokale Stapel konnte nicht verifiziert werden.");
      }
      await repository.touchCardBodies(manifest.cards.map((card) => card.id));
      return { cardCount: manifest.cards.length, source: "local" as const };
    }

    const { listAccountCardCatalog } = await import("./cloudRepository.ts");
    let cursor: { sortValue: string; id: string } | null = null;
    let totalCount: number | undefined;
    let cardCount = 0;
    do {
      const page = await listAccountCardCatalog(client, {
        deckId,
        query: "",
        sort: { field: "sortField", direction: "asc" },
        cursor,
        limit: 50,
        knownTotalCount: totalCount,
      });
      totalCount = page.totalCount;
      await repository.applyCloudCatalogPage({
        table: "card_catalog",
        entities: page.items,
        reset: false,
        cursor: repository.getReplicaStatus().catalogCursor,
      });
      await hydrateCards(page.items.map((entry) => entry.id));
      cardCount += page.items.length;
      cursor = page.hasMore ? page.nextCursor : null;
      if (page.hasMore && !cursor) throw new Error("Der Kartenkatalog konnte nicht vollständig fortgesetzt werden.");
    } while (cursor);
    return { cardCount, source: "cloud" as const };
  };

  return {
    queryCardPage,
    openCard,
    prepareStudyWindow,
    downloadDeck,
    removeDeckDownload,
    enforceQuota,
    refreshStatistics,
    hydrateDeckStructure,
  };
}

export type WorkspaceHydrationService = ReturnType<typeof createWorkspaceHydrationService>;
