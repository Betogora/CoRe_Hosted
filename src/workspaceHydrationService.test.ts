import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { addCardVariant, createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createCloudStateRows } from "./cloudRepository.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";
import { createWorkspaceHydrationService } from "./workspaceHydrationService.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-08-17T07:00:00.000Z";

function graph(deckId: string, key: string, front: string, dueAt: string, { reverseDeckId = null as string | null } = {}) {
  const created = createBasicNote(deckId, front, `Antwort ${front}`, { reverse: reverseDeckId !== null, createdAt: CREATED_AT });
  const note: Note = { ...created.note, id: `note-${key}` };
  const cards: Card[] = created.cards.map((card) => ({
    ...card,
    id: card.promptKey === "forward" ? `card-${key}` : `card-${key}-reverse`,
    noteId: note.id,
    deckId: card.promptKey === "forward" ? deckId : reverseDeckId!,
    study: { ...card.study, dueAt },
  }));
  return { note, cards };
}

function workspace(userId: string, decks: WorkspaceState["decks"], notes: Note[]): WorkspaceState {
  return {
    version: 6,
    profile: { userId, email: "hydration@example.test", displayName: "Hydration", timezone: "UTC", onboardingComplete: true, schedulerPreferences: {}, uiPreferences: {} } as unknown as WorkspaceState["profile"],
    decks,
    notes,
    updatedAt: "2026-08-17T10:00:00.000Z",
  };
}

function catalogRow(entry: CardCatalogEntry, syncChangeId = 1) {
  return {
    id: entry.id,
    deck_id: entry.deckId,
    note_id: entry.noteId,
    front_preview: entry.frontPreview,
    sort_text: entry.sortText,
    due_at: entry.dueAt,
    schedule_state: entry.scheduleState,
    maturity_band: entry.maturityBand,
    reviewable: entry.reviewable,
    marked: entry.marked,
    has_active_variants: entry.hasActiveVariants,
    active_variant_count: entry.activeVariantCount,
    active_variant_id: entry.activeVariantId,
    body_revision: entry.bodyRevision,
    study_revision: entry.studyRevision,
    dependency_revision: entry.dependencyRevision,
    sync_change_id: syncChangeId,
    deleted_at: entry.deletedAt,
    updated_at: entry.updatedAt,
  };
}

/** Answers `hydrate_account_cards` from full cloud rows: requested cards plus all cards of requested contents. */
function hydrateFrom(cloudRows: ReturnType<typeof createCloudStateRows>, payload: { p_card_ids: string[]; p_note_ids: string[] }) {
  const cardIds = new Set(payload.p_card_ids);
  const requestedNoteIds = new Set(payload.p_note_ids);
  const cards = cloudRows.cards.filter((row) => cardIds.has(row.id) || requestedNoteIds.has(row.note_id));
  const noteIds = new Set([...requestedNoteIds, ...cards.map((row) => row.note_id)]);
  return {
    cards,
    variants: cloudRows.card_variants.filter((row) => cards.some((card) => card.id === row.card_id)),
    notes: cloudRows.notes.filter((row) => noteIds.has(row.id)),
  };
}

async function withNavigator<T>(value: unknown, run: () => Promise<T>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
  try {
    return await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
}

test("Katalogseiten zeigen Previews und hydrieren nur den geöffneten Inhalt samt Geschwistern", async () => {
  const userId = randomUUID();
  const alpha = graph("deck-hydration", "alpha", "Alpha", "2026-08-17T09:00:00.000Z");
  alpha.cards[0] = {
    ...alpha.cards[0],
    study: { ...alpha.cards[0].study, state: "review", extra: { ...alpha.cards[0].study.extra, maturityBand: "young" } },
  };
  const beta = graph("deck-hydration", "beta", "Beta", "2026-08-17T08:00:00.000Z", { reverseDeckId: "deck-other" });
  const extras = Array.from({ length: 5 }, (_value, index) => graph("deck-hydration", `extra-${index + 1}`, `Zusatz ${index + 1}`, `2026-08-17T08:0${index + 1}:00.000Z`));
  const graphs = [alpha, beta, ...extras];
  const deckCards = graphs.map((entry) => entry.cards[0]);
  const deck = createCoreDeck({ id: "deck-hydration", ownerId: userId, name: "Hydration", source: "manual", cards: deckCards });
  const otherDeck = createCoreDeck({ id: "deck-other", ownerId: userId, name: "Andere", source: "manual", cards: [beta.cards[1]] });
  const state = workspace(userId, [deck, otherDeck], graphs.map((entry) => entry.note));
  const repository = await createIndexedDbCoreRepository({ userId, initialState: state, indexedDb: new IDBFactory() });
  const catalogRows = (await repository.listCatalogPage(deck.id)).items.map((entry, index) => catalogRow(entry, index + 1));
  await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
  const cloudRows = createCloudStateRows(state, userId);
  const hydratedRequests: Array<{ cards: string[]; notes: string[] }> = [];
  const client = {
    async rpc(name: string, payload: any) {
      if (name === "list_account_card_catalog") return { data: { items: catalogRows, totalCount: catalogRows.length, hasMore: false, nextCursor: null }, error: null };
      if (name === "hydrate_account_cards") {
        hydratedRequests.push({ cards: payload.p_card_ids, notes: payload.p_note_ids });
        return { data: hydrateFrom(cloudRows, payload), error: null };
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

  assert.deepEqual(hydratedRequests, [{ cards: ["card-beta"], notes: [] }, { cards: [], notes: ["note-beta"] }]);
  assert.equal(page.selected?.cardId, "card-beta");
  assert.equal(page.selected?.note.content.fields[1].html, "Antwort Beta");
  assert.deepEqual(page.selected?.cards.map((card) => `${card.id}@${card.deckId}`).sort(), ["card-beta-reverse@deck-other", "card-beta@deck-hydration"]);
  assert.equal(page.items.find((entry) => entry.id === "card-alpha")?.frontPreview, "Alpha");
  assert.deepEqual(await repository.missingCardBodyIds(["card-alpha"]), ["card-alpha"], "nicht geöffnete Karten bleiben Katalogeinträge");
  assert.equal(page.totalCount, deckCards.length);

  await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
  hydratedRequests.length = 0;
  await withNavigator({ onLine: true, connection: { saveData: true } }, async () => {
    const study = await service.prepareStudyWindow([deck.id], { now: "2026-08-17T10:00:00.000Z", timeZone: "UTC" });
    assert.equal(repository.getReplicaStatus().catalogCompleteness, "partial", "der Lernstart übernimmt die aktuelle Cloud-Katalogseite");
    assert.deepEqual(hydratedRequests, [{ cards: ["card-alpha"], notes: [] }], "der Lernstart wartet nur auf die erste jetzt lernbare Karte");
    assert.equal(study.cards.length, 1);
    assert.equal(study.cards[0]?.card.id, "card-alpha");
    assert.deepEqual(study.notes.map((note) => note.id), ["note-alpha"]);
    assert.equal(study.cursorByDeck[deck.id]?.queueRank, 0);
    assert.equal(study.bufferSize, 5);
    assert.equal(study.hasMore, true);

    const remainder = await service.prepareStudyWindow([deck.id], {
      now: "2026-08-17T10:00:00.000Z",
      timeZone: "UTC",
      cursorByDeck: study.cursorByDeck,
    });
    assert.equal(remainder.cards.length, 5, "der Datensparpuffer lädt höchstens fünf weitere Karten");
    assert.equal(remainder.cursorByDeck[deck.id]?.queueRank, 1);
    assert.equal(remainder.hasMore, true);

    const finalPage = await service.prepareStudyWindow([deck.id], {
      now: "2026-08-17T10:00:00.000Z",
      timeZone: "UTC",
      cursorByDeck: remainder.cursorByDeck,
    });
    assert.equal(finalPage.cards.length, 1);
    assert.equal(finalPage.hasMore, false);
    assert.deepEqual(
      [study, remainder, finalPage].flatMap((window) => window.cards.map(({ card }) => card.id)).sort(),
      deckCards.map((card) => card.id).sort(),
      "alle sieben Karten bleiben über den Fünferpuffer Teil derselben Sitzung",
    );
  });
  repository.close();
});

test("partielle Kataloge geben exakt die angeforderte Cloud-Keyset-Seite zurück", async () => {
  const userId = randomUUID();
  const graphs = ["Alpha", "Mitte", "Zulu"].map((front, index) => graph("deck-keyset", String(index), front, CREATED_AT));
  const deck = createCoreDeck({ id: "deck-keyset", ownerId: userId, name: "Keyset", source: "manual", cards: graphs.map((entry) => entry.cards[0]) });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspace(userId, [deck], graphs.map((entry) => entry.note)), indexedDb: new IDBFactory() });
  const all = await repository.listCatalogPage(deck.id, { limit: 50 });
  const alpha = all.items.find((entry) => entry.id === "card-0")!;
  const zulu = all.items.find((entry) => entry.id === "card-2")!;
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
          ? { data: { items: [catalogRow(alpha)], totalCount: 2, hasMore: true, nextCursor: { sortValue: alpha.sortText, id: alpha.id } }, error: null }
          : { data: { items: [catalogRow(zulu)], totalCount: 2, hasMore: false, nextCursor: null }, error: null };
      },
    },
  });
  const page = await service.queryCardPage({ deckId: deck.id, page: 1, pageSize: 1, sort: { field: "sortField", direction: "asc" } });

  assert.deepEqual(cursors, [null, { sortValue: alpha.sortText, id: alpha.id }]);
  assert.deepEqual(page.items.map((entry) => entry.id), ["card-2"]);
  assert.equal(page.totalCount, 2);
  assert.equal(page.limitedToLocalCatalog, false);
  repository.close();
});

test("ein abgebrochener Suchauftrag übernimmt keine Cloudseite und fällt auf den lokalen Katalog zurück", async () => {
  const userId = randomUUID();
  const local = graph("deck-search", "local", "Zulu lokal", CREATED_AT);
  const deck = createCoreDeck({ id: "deck-search", ownerId: userId, name: "Suche", source: "manual", cards: local.cards });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspace(userId, [deck], [local.note]), indexedDb: new IDBFactory() });
  const [localEntry] = (await repository.listCatalogPage(deck.id)).items;
  const remoteOnly = catalogRow({ ...localEntry, id: "card-remote", noteId: "note-remote", frontPreview: "Zulu entfernt", sortText: "zulu entfernt" });
  const controller = new AbortController();
  const service = createWorkspaceHydrationService({
    repository,
    mediaStore: null,
    client: {
      rpc(name: string) {
        assert.equal(name, "list_account_card_catalog");
        return {
          abortSignal(signal: AbortSignal) {
            assert.equal(signal, controller.signal);
            controller.abort();
            return Promise.resolve({ data: { items: [remoteOnly], totalCount: 1, hasMore: false, nextCursor: null }, error: null });
          },
        };
      },
    },
  });

  const page = await service.queryCardPage({ deckId: deck.id, query: "zulu", signal: controller.signal });

  assert.deepEqual(page.items.map((entry) => entry.id), ["card-local"]);
  assert.equal(page.limitedToLocalCatalog, true);
  assert.deepEqual((await repository.listCatalogPage(deck.id)).items.map((entry) => entry.id), ["card-local"]);
  repository.close();
});

test("ein nach Reload fortgesetzter Deck-Download zählt bereits geprüfte Karten nicht doppelt", async () => {
  const userId = randomUUID();
  const resumed = graph("deck-resume", "resume", "Fortsetzen", CREATED_AT);
  const missing = graph("deck-resume", "missing", "Nachladen", CREATED_AT);
  const card = resumed.cards[0];
  const missingCard = missing.cards[0];
  const deck = createCoreDeck({ id: "deck-resume", ownerId: userId, name: "Fortsetzen", source: "manual", cards: [card, missingCard] });
  const state = workspace(userId, [deck], [resumed.note, missing.note]);
  const repository = await createIndexedDbCoreRepository({ userId, indexedDb: new IDBFactory(), initialState: state });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await repository.touchCardBodies([card.id]);
  await repository.evictCachedCardBodies(1);
  assert.deepEqual(await repository.missingCardBodyIds([card.id, missingCard.id]), [missingCard.id]);
  await repository.appendOfflineManifest(deck.id, [card, missingCard].map((entry) => ({
    id: entry.id,
    bodyRevision: 1,
    studyRevision: 0,
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
  const manifestCursors: string[] = [];
  try {
    await withNavigator({
      onLine: true,
      storage: {
        async persisted() { return true; },
        async estimate() { return { usage: 1_000, quota: 1_000_000 }; },
      },
    }, async () => {
      const service = createWorkspaceHydrationService({
        repository,
        mediaStore: null,
        client: {
          async rpc(name: string, payload: any) {
            if (name === "get_deck_offline_manifest") {
              manifestCursors.push(payload.p_cursor);
              return { data: { cards: [], media: [], nextCursor: missingCard.id, hasMore: false, totalCount: 2 }, error: null };
            }
            if (name === "hydrate_account_cards") return { data: hydrateFrom(cloudRows, payload), error: null };
            throw new Error(`Unerwartete RPC ${name}`);
          },
        },
      });

      const result = await service.downloadDeck(deck.id);

      assert.deepEqual(manifestCursors, [missingCard.id], "der Download setzt am gespeicherten Manifest-Cursor fort");
      assert.equal(result.state, "available");
      assert.equal(result.verifiedCardCount, 2);
      await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER);
      assert.deepEqual(await repository.missingCardBodyIds([card.id, missingCard.id]), []);
    });
  } finally {
    repository.close();
  }
});

test("Reimport-Ziele werden nur online und nur für vorhandene GUIDs geladen", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspace(userId, [], []), indexedDb: new IDBFactory() });
  const requested: string[][] = [];
  const service = createWorkspaceHydrationService({
    repository,
    mediaStore: null,
    client: {
      async rpc(name: string, payload: any) {
        assert.equal(name, "load_reimport_targets");
        requested.push(payload.p_guids);
        return { data: { notes: [], cards: [{ id: "card", noteId: "note", deckId: "deck", promptKey: "forward", ankiCardId: "17" }], noteTypeSources: [] }, error: null };
      },
    },
  });

  assert.deepEqual(await service.prepareReimport([]), { notes: [], cards: [], noteTypeSources: [] });
  assert.deepEqual((await service.prepareReimport(["guid-1"])).cards.map((card) => card.ankiCardId), ["17"]);
  await withNavigator({ onLine: false }, async () => {
    assert.deepEqual(await service.prepareReimport(["guid-2"]), { notes: [], cards: [], noteTypeSources: [] });
  });
  assert.deepEqual(requested, [["guid-1"]]);
  repository.close();
});

test("ein lokal erstellter, noch nicht hochgeladener Inhalt öffnet sich aus der Replica", async () => {
  const userId = randomUUID();
  const local = graph("deck-local", "local", "Lokal", "2026-08-17T09:00:00.000Z");
  const deck = createCoreDeck({ id: "deck-local", ownerId: userId, name: "Lokal", source: "manual", cards: local.cards });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspace(userId, [deck], [local.note]), indexedDb: new IDBFactory() });
  const client = {
    async rpc(name: string) {
      if (name === "hydrate_account_cards") return { data: { cards: [], variants: [], notes: [] }, error: null };
      throw new Error(`Unerwartete RPC ${name}`);
    },
  };
  const service = createWorkspaceHydrationService({ client, repository, mediaStore: null });

  await withNavigator({ onLine: true }, async () => {
    const loaded = await service.loadNoteGraph("note-local");
    assert.equal(loaded.note.id, "note-local");
    assert.deepEqual(loaded.cards.map((card) => card.id), ["card-local"]);
    await assert.rejects(service.loadNoteGraph("note-unbekannt"), /in der Cloud nicht mehr verfügbar/);
  });
});

test("eine noch nicht synchronisierte Variante übersteht das Nachladen des Inhalts aus der Cloud", async () => {
  const userId = randomUUID();
  const basic = graph("deck-variant", "variant", "Variante", "2026-08-17T09:00:00.000Z");
  const deck = createCoreDeck({ id: "deck-variant", ownerId: userId, name: "Varianten", source: "manual", cards: basic.cards });
  const state = workspace(userId, [deck], [basic.note]);
  const cloudRows = createCloudStateRows(state, userId);
  const repository = await createIndexedDbCoreRepository({ userId, initialState: state, indexedDb: new IDBFactory() });
  await repository.updateCard("card-variant", (card) => addCardVariant(card, { id: "variant-lokal", front: "Lokale Umformulierung", back: "Antwort" }));
  // The card row reaches the cloud first; its answer row carries no variants and must not drop the pending one.
  repository.outbox.markFlushed(repository.outbox.listPending().filter((mutation) => mutation.table !== "card_variants").map((mutation) => mutation.id));
  await repository.applyCloudPage({ table: "cards", entities: [{ ...basic.cards[0], variants: [] }], reset: false });
  assert.deepEqual((await repository.loadCardBody("card-variant"))?.card.variants.map((variant) => variant.id), ["variant-lokal"]);
  const client = {
    async rpc(name: string, payload: any) {
      if (name === "hydrate_account_cards") return { data: hydrateFrom(cloudRows, payload), error: null };
      throw new Error(`Unerwartete RPC ${name}`);
    },
  };
  const service = createWorkspaceHydrationService({ client, repository, mediaStore: null });

  await withNavigator({ onLine: true }, async () => {
    const loaded = await service.loadNoteGraph("note-variant");
    assert.deepEqual(loaded.cards[0].variants.map((variant) => variant.id), ["variant-lokal"]);
  });
  assert.deepEqual((await repository.loadCardBody("card-variant"))?.card.variants.map((variant) => variant.id), ["variant-lokal"]);
  assert.equal((await repository.listCatalogPage("deck-variant")).items[0].hasActiveVariants, true);
});

test("Parallele Stapelsuchen gehen in einer Anfrage und blättern je Stapel mit eigenem Cursor", async () => {
  const userId = randomUUID();
  const first = graph("deck-search-a", "search-a", "Gesucht A", "2026-08-17T09:00:00.000Z");
  const second = graph("deck-search-b", "search-b", "Gesucht B", "2026-08-17T09:00:00.000Z");
  const deckA = createCoreDeck({ id: "deck-search-a", ownerId: userId, name: "A", source: "manual", cards: first.cards });
  const deckB = createCoreDeck({ id: "deck-search-b", ownerId: userId, name: "B", source: "manual", cards: second.cards });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspace(userId, [deckA, deckB], [first.note, second.note]), indexedDb: new IDBFactory() });
  const rowA = catalogRow((await repository.listCatalogPage(deckA.id)).items[0]);
  const rowB = catalogRow((await repository.listCatalogPage(deckB.id)).items[0]);
  const calls: Array<{ name: string; payload: any }> = [];
  const client = {
    async rpc(name: string, payload: any) {
      calls.push({ name, payload });
      if (name === "search_account_card_catalog") return { data: { groups: {
        [deckA.id]: { items: [rowA], totalCount: 51, hasMore: true, nextCursor: { sortValue: "a", id: rowA.id } },
        [deckB.id]: { items: [rowB], totalCount: 1, hasMore: false, nextCursor: null },
      } }, error: null };
      if (name === "list_account_card_catalog") return { data: { items: [], totalCount: null, hasMore: false, nextCursor: null }, error: null };
      throw new Error(`Unerwartete RPC ${name}`);
    },
  };
  const service = createWorkspaceHydrationService({ client, repository, mediaStore: null });
  const request = { page: 0, pageSize: 50, query: "gesucht", sort: { field: "sortField", direction: "asc" } as const };
  const [pageA, pageB] = await withNavigator({ onLine: true }, () => Promise.all([
    service.queryCardPage({ ...request, deckId: deckA.id }),
    service.queryCardPage({ ...request, deckId: deckB.id }),
  ]));

  assert.deepEqual(calls.map((call) => call.name), ["search_account_card_catalog"]);
  assert.deepEqual(calls[0].payload.p_deck_ids, [deckA.id, deckB.id]);
  assert.deepEqual([pageA.totalCount, pageB.totalCount], [51, 1]);

  await withNavigator({ onLine: true }, () => service.queryCardPage({ ...request, deckId: deckA.id, page: 1 }));
  assert.equal(calls[1].name, "list_account_card_catalog");
  assert.deepEqual(calls[1].payload.p_cursor, { sortValue: "a", id: rowA.id }, "Stapel A blättert mit seinem eigenen Cursor weiter");
  assert.equal(calls[1].payload.p_include_total, false, "die bekannte Gesamtzahl wird nicht erneut gezählt");
});
