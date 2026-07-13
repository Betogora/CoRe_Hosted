import assert from "node:assert/strict";
import test from "node:test";
import { createProfileRow } from "./cloudAuth.ts";
import { createBasicLearningItem, createCoreDeck, createSourceDocument, getOriginalVariant } from "./coreModel.ts";
import {
  ACCOUNT_UPSERT_CONFLICT,
  applyCardMutation,
  applyDeckMutation,
  appendReviewEvent,
  cardToCloudRow,
  CloudRevisionConflictError,
  createCloudStateRows,
  deckToCloudRow,
  loadAccountCloudState,
  listAccountSyncConflicts,
  mergeCloudSyncMetadata,
  registerAccountSyncDevice,
  replaceAccountCloudState,
  resolveAccountSyncConflict,
  reviewEventToCloudRow,
  softDeleteEntity,
  SyncConflictChangedError,
  upsertAccountCloudState,
  variantToCloudRow,
} from "./cloudRepository.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemorySupabaseClient(initialTables = {}, user = { id: "user-1", email: "user@example.test" }, { fail } = {}) {
  const tables = Object.fromEntries(
    ["profiles", "decks", "cards", "card_variants", "review_events", "source_documents", "ai_jobs", "sync_devices", "sync_conflicts"].map(
      (table) => [table, clone(initialTables[table] ?? [])],
    ),
  );
  const calls = [];

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = null;
      this.filters = [];
      this.columns = "*";
      this.payload = null;
      this.options = {};
      this.maxRows = null;
      this.returning = false;
    }

    select(columns = "*") {
      if (["insert", "upsert", "update", "delete"].includes(this.operation)) {
        this.returning = true;
        this.columns = columns;
      } else {
        this.operation = "select";
        this.columns = columns;
      }
      return this;
    }

    insert(payload) {
      this.operation = "insert";
      this.payload = clone(Array.isArray(payload) ? payload : [payload]);
      return this;
    }

    upsert(payload, options = {}) {
      this.operation = "upsert";
      this.payload = clone(Array.isArray(payload) ? payload : [payload]);
      this.options = options;
      return this;
    }

    update(payload) {
      this.operation = "update";
      this.payload = clone(payload);
      return this;
    }

    delete() {
      this.operation = "delete";
      return this;
    }

    eq(field, value) {
      this.filters.push({ type: "eq", field, value });
      return this;
    }

    in(field, values) {
      this.filters.push({ type: "in", field, values });
      return this;
    }

    limit(value) {
      this.maxRows = value;
      return this;
    }

    async maybeSingle() {
      const result = await this.execute();
      return { ...result, data: result.data?.[0] ?? null };
    }

    async single() {
      const result = await this.execute();
      return { ...result, data: result.data?.[0] ?? null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    matches(row) {
      return this.filters.every((filter) =>
        filter.type === "eq" ? row[filter.field] === filter.value : filter.values.includes(row[filter.field]),
      );
    }

    project(rows) {
      const limited = this.maxRows == null ? rows : rows.slice(0, this.maxRows);
      if (this.columns === "*") return clone(limited);
      const columns = this.columns.split(",").map((column) => column.trim());
      return clone(limited.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))));
    }

    async execute() {
      const rows = tables[this.table] ?? (tables[this.table] = []);
      const call = {
        table: this.table,
        operation: this.operation,
        filters: clone(this.filters),
        payload: clone(this.payload),
        options: clone(this.options),
      };
      calls.push(call);
      const injectedError = fail?.(call, calls);
      if (injectedError) return { data: null, error: injectedError };

      if (this.operation === "select") return { data: this.project(rows.filter((row) => this.matches(row))), error: null };

      if (this.operation === "insert") {
        const affected = [];
        for (const candidate of this.payload) {
          if (rows.some((row) => row.user_id === candidate.user_id && row.id === candidate.id)) {
            return { data: null, error: new Error(`duplicate ${this.table}`) };
          }
          const stored =
            this.table === "sync_devices"
              ? {
                  label: "Browser",
                  last_seen_at: "2026-07-10T08:00:00.000Z",
                  user_agent: "",
                  created_at: "2026-07-10T08:00:00.000Z",
                  ...candidate,
                }
              : candidate;
          rows.push(stored);
          affected.push(stored);
        }
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

      if (this.operation === "upsert") {
        const keys = String(this.options.onConflict ?? "id").split(",");
        const affected = [];
        for (const candidate of this.payload) {
          const index = rows.findIndex((row) => keys.every((key) => row[key] === candidate[key]));
          if (index >= 0) {
            if (this.options.ignoreDuplicates) continue;
            rows[index] = { ...rows[index], ...candidate };
            affected.push(rows[index]);
          } else {
            const stored =
              this.table === "sync_devices"
                ? {
                    label: "Browser",
                    last_seen_at: "2026-07-10T08:00:00.000Z",
                    user_agent: "",
                    created_at: "2026-07-10T08:00:00.000Z",
                    ...candidate,
                  }
                : candidate;
            rows.push(stored);
            affected.push(stored);
          }
        }
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

      if (this.operation === "update") {
        const affected = [];
        for (let index = 0; index < rows.length; index += 1) {
          if (!this.matches(rows[index])) continue;
          rows[index] = { ...rows[index], ...this.payload };
          affected.push(rows[index]);
        }
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

      if (this.operation === "delete") {
        const removed = rows.filter((row) => this.matches(row));
        tables[this.table] = rows.filter((row) => !this.matches(row));
        return { data: this.returning ? this.project(removed) : null, error: null };
      }

      return { data: null, error: new Error(`unsupported query on ${this.table}`) };
    }
  }

  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    from(table) {
      return new Query(table);
    },
    calls,
    tables,
    user,
  };
}

function createCloudFixture() {
  const timestamp = "2026-07-10T10:00:00.000Z";
  const document = createSourceDocument({
    id: "doc-1",
    fileName: "quelle.pdf",
    mimeType: "application/pdf",
    text: "ATP liefert Energie.",
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 2,
    updatedByDeviceId: "device-a",
  });
  const card = createBasicLearningItem("deck-1", "Was ist ATP?", "Ein Energieträger.", {
    id: "card-1",
    mediaRefs: ["media-1"],
    sourceAnchors: [{ documentId: document.id }],
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 2,
    updatedByDeviceId: "device-a",
  });
  card.variants = card.variants.map((variant) => ({ ...variant, revision: 2, updatedByDeviceId: "device-a" }));
  const reviewEvent = {
    id: "review-1",
    deckId: "deck-1",
    reviewableType: "card",
    reviewableId: card.id,
    sourceCardId: card.id,
    rating: "good",
    answeredAt: timestamp,
    createdAt: timestamp,
    createdByDeviceId: "device-a",
  };
  const aiJob = {
    id: "job-1",
    deckId: "deck-1",
    jobType: "card_generation",
    status: "succeeded",
    inputRef: {},
    policy: {},
    resultRef: {},
    createdAt: timestamp,
    finishedAt: timestamp,
    revision: 2,
    updatedByDeviceId: "device-a",
  };
  const deck = createCoreDeck({
    id: "deck-1",
    name: "Cloud Deck",
    source: "manual",
    cards: [card],
    sourceDocuments: [document],
    reviewEvents: [reviewEvent],
    aiJobs: [aiJob],
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 3,
    updatedByDeviceId: "device-a",
  });
  const profile = {
    userId: "user-1",
    email: "user@example.test",
    displayName: "Cloud User",
    university: "",
    fieldOfStudy: "",
    preferredLanguage: "de",
    timezone: "Europe/Berlin",
    onboardingComplete: true,
    privacy: {},
    schedulerPreferences: { profile: "standard" },
  };
  const state = { version: 2, profile, decks: [deck], documents: [document], aiJobs: [aiJob], cloudTombstones: [] };
  const user = { id: "user-1", email: profile.email, created_at: timestamp };
  const rows = createCloudStateRows(state, user.id, { deviceId: "device-a" });
  return {
    state,
    user,
    rows: { ...rows, profiles: [createProfileRow(profile, user, timestamp)] },
  };
}

function createDeckConflictFixture({ tombstone = false } = {}) {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks[0].revision = 4;
  rows.decks[0].name = "Remote Deck";
  rows.decks[0].description = "Remote Beschreibung";
  const localDeck = { ...fixture.state.decks[0], name: "Lokales Deck", description: "Lokale Beschreibung", revision: 3 };
  const localValue = deckToCloudRow(localDeck, fixture.user.id);
  const remoteValue = clone(rows.decks[0]);
  delete localValue.user_id;
  delete remoteValue.user_id;
  if (tombstone) localValue.deleted_at = "2026-07-12T10:00:00.000Z";
  rows.sync_conflicts = [{
    id: "conflict-deck-1",
    user_id: fixture.user.id,
    entity_table: "decks",
    entity_id: "deck-1",
    base_revision: 3,
    local_revision: 3,
    remote_revision: 4,
    local_value: localValue,
    remote_value: remoteValue,
    status: "open",
    resolution: {},
    updated_by_device_id: "device-b",
    created_at: "2026-07-12T09:00:00.000Z",
    resolved_at: null,
  }];
  return {
    ...fixture,
    rows,
    state: { ...fixture.state, decks: [localDeck] },
  };
}

test("cloud repository maps deck and card rows to production table fields", () => {
  const card = createBasicLearningItem("deck_cloud", "Was ist ATP?", "Ein Energieträger.", {
    tags: ["biochemie"],
    reviewState: {
      state: "review",
      repetitions: 2,
      dueAt: "2026-07-10T08:00:00.000Z",
    },
  });
  const deck = createCoreDeck({
    id: "deck_cloud",
    name: "Cloud Deck",
    source: "json-import",
    cards: [card],
    deckSettings: { coreMode: "manual", appearance: { iconKey: "brain", iconColor: "#047857" } },
  });

  const deckRow = deckToCloudRow(deck, "user-1");
  const cardRow = cardToCloudRow(deck.cards[0], deck, "user-1");

  assert.equal(deckRow.source, "json-import");
  assert.equal(deckRow.user_id, "user-1");
  assert.equal(deckRow.card_count, 1);
  assert.deepEqual(deckRow.deck_settings.appearance, { iconKey: "brain", iconColor: "#047857" });
  assert.equal(cardRow.deck_id, "deck_cloud");
  assert.equal(cardRow.kind, "basic");
  assert.equal(cardRow.review_state.repetitions, 2);
});

test("cloud repository stores original variants explicitly", () => {
  const card = createBasicLearningItem("deck_cloud", "Front", "Back");
  const original = getOriginalVariant(card);
  const row = variantToCloudRow(original, card, "user-1");

  assert.equal(row.card_id, card.id);
  assert.equal(row.transform_type, "original");
  assert.equal(row.generation_source, "original");
  assert.equal(row.is_original, true);
  assert.equal(row.is_active, true);
  assert.equal(row.variant_level, 1);
});

test("cloud repository maps review events without leaking local owner ids", () => {
  const deck = createCoreDeck({ id: "deck_cloud", name: "Cloud Deck", source: "manual", cards: [] });
  const row = reviewEventToCloudRow(
    {
      id: "review_1",
      userId: "local-user",
      deckId: deck.id,
      reviewableType: "card",
      reviewableId: "card_1",
      rating: "good",
      answeredAt: "2026-07-09T08:00:00.000Z",
    },
    deck,
    "user-1",
  );

  assert.equal(row.user_id, "user-1");
  assert.equal(row.deck_id, deck.id);
  assert.equal(row.reviewable_id, "card_1");
  assert.equal(row.rating, "good");
});

test("cloud repository scopes identical local ids by account", () => {
  const deck = createCoreDeck({
    id: "same_local_deck_id",
    name: "Account Deck",
    source: "manual",
    cards: [createBasicLearningItem("same_local_deck_id", "Front", "Back", { id: "same_local_card_id" })],
  });

  const rowsA = createCloudStateRows({ decks: [deck], documents: [], aiJobs: [] }, "user-a");
  const rowsB = createCloudStateRows({ decks: [deck], documents: [], aiJobs: [] }, "user-b");

  assert.equal(ACCOUNT_UPSERT_CONFLICT, "user_id,id");
  assert.equal(rowsA.decks[0].id, rowsB.decks[0].id);
  assert.equal(rowsA.decks[0].user_id, "user-a");
  assert.equal(rowsB.decks[0].user_id, "user-b");
  assert.equal(rowsA.cards[0].id, rowsB.cards[0].id);
  assert.equal(rowsA.cards[0].user_id, "user-a");
  assert.equal(rowsB.cards[0].user_id, "user-b");
});

test("device registration is account-bound and preserves the database creation timestamp on refresh", async () => {
  const client = createMemorySupabaseClient({}, { id: "user-1", email: "user@example.test" });
  const first = await registerAccountSyncDevice(
    client,
    { id: "device-1", label: "Chrome auf Windows", userAgent: "first-agent" },
    { lastSeenAt: "2026-07-10T09:00:00.000Z" },
  );
  const createdAt = first.created_at;
  const second = await registerAccountSyncDevice(
    client,
    { id: "device-1", label: "Edge auf Windows", userAgent: "second-agent" },
    { lastSeenAt: "2026-07-10T10:00:00.000Z" },
  );
  const writes = client.calls.filter((call) => call.table === "sync_devices" && call.operation === "upsert");

  assert.equal(client.tables.sync_devices.length, 1);
  assert.equal(first.user_id, "user-1");
  assert.equal(second.label, "Edge auf Windows");
  assert.equal(second.user_agent, "second-agent");
  assert.equal(second.last_seen_at, "2026-07-10T10:00:00.000Z");
  assert.equal(second.created_at, createdAt);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].options.onConflict, ACCOUNT_UPSERT_CONFLICT);
  assert.equal(Object.hasOwn(writes[0].payload[0], "created_at"), false);
  assert.equal(Object.hasOwn(writes[1].payload[0], "created_at"), false);
});

test("device registration scopes the same device id to the authenticated account", async () => {
  const createdAt = "2026-07-10T08:00:00.000Z";
  const client = createMemorySupabaseClient(
    {
      sync_devices: [
        {
          id: "shared-device",
          user_id: "user-a",
          label: "Firefox auf Linux",
          last_seen_at: createdAt,
          user_agent: "agent-a",
          created_at: createdAt,
        },
      ],
    },
    { id: "user-b", email: "b@example.test" },
  );

  await registerAccountSyncDevice(
    client,
    { id: "shared-device", label: "Safari auf macOS", userAgent: "agent-b", userId: "user-a" },
    { lastSeenAt: "2026-07-10T11:00:00.000Z" },
  );

  assert.equal(client.tables.sync_devices.length, 2);
  assert.deepEqual(
    client.tables.sync_devices.map((device) => device.user_id).sort(),
    ["user-a", "user-b"],
  );
  assert.equal(client.tables.sync_devices.find((device) => device.user_id === "user-a").label, "Firefox auf Linux");
  assert.equal(client.tables.sync_devices.find((device) => device.user_id === "user-b").label, "Safari auf macOS");
});

test("device registration rejects incomplete descriptors before writing", async () => {
  const client = createMemorySupabaseClient();

  await assert.rejects(
    () => registerAccountSyncDevice(client, { id: "", label: "Browser", userAgent: "agent" }),
    /Geräte-ID fehlt/,
  );
  await assert.rejects(
    () => registerAccountSyncDevice(client, { id: "device-1", label: " ", userAgent: "agent" }),
    /Gerätebezeichnung fehlt/,
  );
  await assert.rejects(
    () => registerAccountSyncDevice(client, { id: "device-1", label: "Browser" }),
    /User-Agent des Geräts fehlt/,
  );
  await assert.rejects(
    () =>
      registerAccountSyncDevice(client, { id: "device-1", label: "Browser", userAgent: "" }, { lastSeenAt: "not-a-date" }),
    /Zeitpunkt der Geräte-Registrierung ist ungültig/,
  );
  assert.equal(client.calls.some((call) => call.table === "sync_devices"), false);
});

test("device registration exposes a missing authenticated session as a session error", async () => {
  const client = createMemorySupabaseClient({}, null);

  await assert.rejects(
    () => registerAccountSyncDevice(client, { id: "device-1", label: "Browser", userAgent: "agent" }),
    (error) => error?.code === "session_not_found" && /melde dich zuerst an/.test(error.message),
  );
});

test("cloud repository roundtrips sync metadata and media references", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  const loaded = await loadAccountCloudState(client, { profile: fixture.state.profile });
  const deck = loaded.decks[0];
  const card = deck.cards[0];
  const variant = card.variants[0];

  assert.equal(deck.revision, 3);
  assert.equal(deck.updatedByDeviceId, "device-a");
  assert.equal(card.revision, 2);
  assert.deepEqual(card.mediaRefs, ["media-1"]);
  assert.equal(variant.revision, 2);
  assert.equal(deck.reviewEvents[0].createdByDeviceId, "device-a");
  assert.equal(loaded.documents[0].revision, 2);
  assert.equal(loaded.aiJobs[0].revision, 2);
});

test("cloud repository rejects malformed JSONB before replacing local state", async () => {
  const fixture = createCloudFixture();
  fixture.rows.cards[0].review_state = "kein Objekt";
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  await assert.rejects(
    () => loadAccountCloudState(client, fixture.state),
    /Cloud-Daten für cards hatten ein ungültiges Format/,
  );
});

test("cloud repository roundtrips Learning Item fields and review compatibility aliases", async () => {
  const fixture = createCloudFixture();
  const timestamp = "2026-07-10T12:00:00.000Z";
  const baseCard = createBasicLearningItem("deck-1", "Importierte Vorderseite", "Importierte Rückseite", {
    id: "card-semantic",
    title: "ATP-Grundlagen",
    tags: ["Biochemie"],
    concepts: ["ATP", "Energie"],
    sourceType: "anki_import",
    sourceRefId: "note-42",
    meta: { custom: "bleibt erhalten" },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const card = {
    ...baseCard,
    canonicalQuestion: "Kanonische Frage",
    canonicalAnswer: "Kanonische Antwort",
  };
  const variant = getOriginalVariant(card);
  const reviewEvent = {
    id: "review-semantic",
    deckId: "deck-1",
    learningItemId: card.id,
    cardId: card.id,
    cardVariantId: variant.id,
    variantId: variant.id,
    reviewableType: "card",
    reviewableId: variant.id,
    sourceCardId: card.id,
    rating: "good",
    reviewedAt: timestamp,
    answeredAt: timestamp,
    variantLevel: 1,
    variantType: "basic",
    previousLearningItemStateJson: { state: "learning", reps: 1 },
    nextLearningItemStateJson: { state: "review", reps: 2 },
    schedulerVersion: "fsrs_v1",
    schedulerParamsJson: { desiredRetention: 0.9 },
    anchorVariantId: null,
    anchorSnapshotJson: { shouldShow: false },
    fallbackInfo: { active: false },
    schedulerBefore: { card: { state: "learning", reps: 1 } },
    schedulerAfter: { card: { state: "review", reps: 2 } },
    flags: { manual: true },
    createdAt: timestamp,
  };
  const deck = createCoreDeck({
    ...fixture.state.decks[0],
    cards: [card],
    reviewEvents: [reviewEvent],
  });
  const state = { ...fixture.state, decks: [deck] };
  const rows = createCloudStateRows(state, fixture.user.id, { deviceId: "device-a" });
  const storedReview = rows.review_events[0];
  const storedReviewModel = storedReview.flags.__coreReview;
  assert.deepEqual(storedReview.scheduler_before.card, reviewEvent.previousLearningItemStateJson);
  assert.deepEqual(storedReview.scheduler_after.card, reviewEvent.nextLearningItemStateJson);
  assert.equal(Object.hasOwn(storedReviewModel, "learningItemId"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "cardId"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "cardVariantId"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "variantId"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "reviewedAt"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "previousLearningItemStateJson"), false);
  assert.equal(Object.hasOwn(storedReviewModel, "nextLearningItemStateJson"), false);
  const client = createMemorySupabaseClient({ ...rows, profiles: fixture.rows.profiles }, fixture.user);

  const loaded = await loadAccountCloudState(client, { profile: state.profile });
  const loadedCard = loaded.decks[0].cards[0];
  const loadedEvent = loaded.decks[0].reviewEvents[0];

  assert.equal(loadedCard.title, card.title);
  assert.equal(loadedCard.canonicalQuestion, card.canonicalQuestion);
  assert.equal(loadedCard.canonicalAnswer, card.canonicalAnswer);
  assert.deepEqual(loadedCard.tags, card.tags);
  assert.deepEqual(loadedCard.concepts, card.concepts);
  assert.equal(loadedCard.sourceType, card.sourceType);
  assert.equal(loadedCard.sourceRefId, card.sourceRefId);
  assert.deepEqual(loadedCard.meta, { custom: "bleibt erhalten" });
  assert.equal(loadedEvent.learningItemId, card.id);
  assert.equal(loadedEvent.cardId, card.id);
  assert.equal(loadedEvent.cardVariantId, variant.id);
  assert.equal(loadedEvent.variantId, variant.id);
  assert.equal(loadedEvent.reviewedAt, timestamp);
  assert.deepEqual(loadedEvent.previousLearningItemStateJson, reviewEvent.previousLearningItemStateJson);
  assert.deepEqual(loadedEvent.nextLearningItemStateJson, reviewEvent.nextLearningItemStateJson);
  assert.equal(loadedEvent.variantLevel, reviewEvent.variantLevel);
  assert.equal(loadedEvent.variantType, reviewEvent.variantType);
  assert.equal(loadedEvent.schedulerVersion, "fsrs_v1");
  assert.deepEqual(loadedEvent.schedulerParamsJson, reviewEvent.schedulerParamsJson);
  assert.equal(loadedEvent.anchorVariantId, reviewEvent.anchorVariantId);
  assert.deepEqual(loadedEvent.anchorSnapshotJson, reviewEvent.anchorSnapshotJson);
  assert.deepEqual(loadedEvent.fallbackInfo, reviewEvent.fallbackInfo);
  assert.deepEqual(loadedEvent.flags, { manual: true });
});

test("cloud load hides soft-deleted rows and preserves minimal tombstones", async () => {
  const fixture = createCloudFixture();
  const deletedAt = "2026-07-10T11:00:00.000Z";
  const rows = clone(fixture.rows);
  rows.decks.push({ ...rows.decks[0], id: "deck-deleted", name: "Gelöscht", deleted_at: deletedAt, revision: 7 });
  rows.cards.push({ ...rows.cards[0], id: "card-deleted", deleted_at: deletedAt, revision: 6 });
  rows.card_variants.push({ ...rows.card_variants[0], id: "variant-deleted", deleted_at: deletedAt, revision: 5 });
  rows.source_documents.push({ ...rows.source_documents[0], id: "doc-deleted", deleted_at: deletedAt, revision: 4 });
  rows.ai_jobs.push({ ...rows.ai_jobs[0], id: "job-deleted", deleted_at: deletedAt, revision: 3 });
  rows.cards.push({ ...rows.cards[0], id: "orphan-card", deck_id: "missing-deck" });
  const client = createMemorySupabaseClient(rows, fixture.user);

  const loaded = await loadAccountCloudState(client, { profile: fixture.state.profile });

  assert.deepEqual(loaded.decks.map((deck) => deck.id), ["deck-1"]);
  assert.equal(loaded.decks[0].cards.some((card) => card.id === "card-deleted" || card.id === "orphan-card"), false);
  assert.equal(loaded.documents.some((document) => document.id === "doc-deleted"), false);
  assert.equal(loaded.aiJobs.some((job) => job.id === "job-deleted"), false);
  assert.deepEqual(
    new Set(loaded.cloudTombstones.map((tombstone) => tombstone.entityTable)),
    new Set(["decks", "cards", "card_variants", "source_documents", "ai_jobs"]),
  );
  assert.equal(loaded.cloudTombstones.find((tombstone) => tombstone.entityId === "deck-deleted").revision, 7);
});

test("unchanged cloud snapshots do not write or increment revisions and acknowledge only supplied state mutations", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  const result = await upsertAccountCloudState(client, fixture.state, {
    deviceId: "device-b",
    mutationIds: ["state-mutation-1", "state-mutation-2"],
    flushedAt: "2026-07-10T11:00:00.000Z",
  });
  const writes = client.calls.filter((call) => ["insert", "upsert", "update", "delete"].includes(call.operation));

  assert.deepEqual(writes, []);
  assert.deepEqual(result.acknowledgedMutationIds, ["state-mutation-1", "state-mutation-2"]);
  assert.equal(result.state.decks[0].revision, 3);
  assert.equal(result.state.decks[0].cards[0].revision, 2);
});

test("newer server metadata is acknowledged without creating a user-content conflict", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks[0].revision = 4;
  rows.decks[0].updated_at = "2026-07-10T11:00:00.000Z";
  rows.decks[0].updated_by_device_id = "device-b";
  const client = createMemorySupabaseClient(rows, fixture.user);

  const result = await upsertAccountCloudState(client, fixture.state, {
    deviceId: "device-a",
    mutationIds: ["state-metadata-only"],
    flushedAt: "2026-07-10T12:00:00.000Z",
  });
  const deckWrites = client.calls.filter((call) => call.table === "decks" && ["insert", "update", "delete"].includes(call.operation));

  assert.deepEqual(deckWrites, []);
  assert.deepEqual(client.tables.sync_conflicts, []);
  assert.equal(result.state.decks[0].revision, 4);
  assert.equal(result.state.decks[0].updatedByDeviceId, "device-b");
  assert.deepEqual(result.acknowledgedMutationIds, ["state-metadata-only"]);
});

test("stale user metadata is never auto-merged and creates one deterministic conflict", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks[0].revision = 4;
  rows.decks[0].tags = ["remote-tag"];
  const client = createMemorySupabaseClient(rows, fixture.user);
  const localState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], tags: ["local-tag"] }],
  };

  await assert.rejects(
    () => upsertAccountCloudState(client, localState, { deviceId: "device-b", flushedAt: "2026-07-10T12:00:00.000Z" }),
    (error) => error instanceof CloudRevisionConflictError && error.entityTable === "decks" && error.remoteRevision === 4,
  );

  assert.deepEqual(client.tables.decks[0].tags, ["remote-tag"]);
  assert.equal(client.tables.sync_conflicts.length, 1);
  assert.deepEqual(client.tables.sync_conflicts[0].local_value.tags, ["local-tag"]);
  assert.deepEqual(client.tables.sync_conflicts[0].remote_value.tags, ["remote-tag"]);
});

test("matching revisions update only changed rows and acknowledge the next revision", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const nextState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], name: "Cloud Deck Neu", updatedAt: "2026-07-10T12:00:00.000Z" }],
  };

  const result = await upsertAccountCloudState(client, nextState, {
    deviceId: "device-b",
    mutationIds: ["state-mutation-1"],
    flushedAt: "2026-07-10T12:00:00.000Z",
  });
  const entityWrites = client.calls.filter((call) => ["decks", "cards", "card_variants", "source_documents", "ai_jobs"].includes(call.table) && call.operation === "update");

  assert.equal(entityWrites.length, 1);
  assert.equal(entityWrites[0].table, "decks");
  assert.deepEqual(entityWrites[0].filters, [
    { type: "eq", field: "user_id", value: "user-1" },
    { type: "eq", field: "id", value: "deck-1" },
    { type: "eq", field: "revision", value: 3 },
  ]);
  assert.equal(client.tables.decks[0].revision, 4);
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-b");
  assert.equal(result.state.decks[0].revision, 4);
  assert.equal(result.state.decks[0].updatedByDeviceId, "device-b");
  assert.deepEqual(result.acknowledgedMutationIds, ["state-mutation-1"]);
});

test("concrete deck and card mutations insert, compare-and-set and replay idempotently", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks = [];
  rows.cards = [];
  rows.card_variants = [];
  rows.review_events = [];
  rows.ai_jobs = [];
  const client = createMemorySupabaseClient(rows, fixture.user);
  const deck = { ...fixture.state.decks[0], revision: 1, cards: [] };

  const insertedDeck = await applyDeckMutation(client, deck, {
    deviceId: "device-b",
    baseRevision: null,
    flushedAt: "2026-07-10T11:00:00.000Z",
  });
  const updatedDeck = { ...deck, name: "Konkretes Deck", updatedAt: "2026-07-10T12:00:00.000Z", revision: 1 };
  const firstDeckUpdate = await applyDeckMutation(client, updatedDeck, {
    deviceId: "device-b",
    baseRevision: 1,
    flushedAt: "2026-07-10T12:00:00.000Z",
  });
  const replayedDeckUpdate = await applyDeckMutation(client, updatedDeck, {
    deviceId: "device-b",
    baseRevision: 1,
    flushedAt: "2026-07-10T12:00:00.000Z",
  });

  const card = { ...fixture.state.decks[0].cards[0], deckId: deck.id, revision: 1 };
  const insertedCard = await applyCardMutation(client, card, {
    deckId: deck.id,
    deviceId: "device-b",
    baseRevision: null,
    flushedAt: "2026-07-10T12:00:00.000Z",
  });

  assert.equal(insertedDeck.revision, 1);
  assert.equal(firstDeckUpdate.revision, 2);
  assert.equal(firstDeckUpdate.applied, true);
  assert.equal(replayedDeckUpdate.revision, 2);
  assert.equal(replayedDeckUpdate.idempotent, true);
  assert.equal(client.tables.decks[0].name, "Konkretes Deck");
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-b");
  assert.equal(insertedCard.revision, 1);
  assert.equal(client.tables.cards[0].deck_id, deck.id);
});

test("soft deletes are revision-checked, idempotent and restricted to revisioned tables", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const input = {
    entityTable: "cards",
    entityId: "card-1",
    baseRevision: 2,
    deletedAt: "2026-07-10T13:00:00.000Z",
  };

  const first = await softDeleteEntity(client, input, { deviceId: "device-b" });
  const replay = await softDeleteEntity(client, input, { deviceId: "device-b" });

  assert.equal(first.applied, true);
  assert.equal(first.revision, 3);
  assert.equal(replay.idempotent, true);
  assert.equal(client.tables.cards[0].deleted_at, input.deletedAt);
  assert.equal(client.calls.filter((call) => call.table === "cards" && call.operation === "update").length, 1);
  await assert.rejects(
    () => softDeleteEntity(client, { ...input, entityTable: "review_events" }, { deviceId: "device-b" }),
    /nicht erlaubt/,
  );
});

test("state mutations are not acknowledged when the persisted-state reload fails", async () => {
  const fixture = createCloudFixture();
  let deckSelectCount = 0;
  const client = createMemorySupabaseClient(fixture.rows, fixture.user, {
    fail(call) {
      if (call.table !== "decks" || call.operation !== "select") return null;
      deckSelectCount += 1;
      return deckSelectCount === 2 ? new Error("persisted reload failed") : null;
    },
  });
  const nextState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], name: "Cloud Deck Neu" }],
  };
  let result;

  await assert.rejects(
    async () => {
      result = await upsertAccountCloudState(client, nextState, {
        deviceId: "device-b",
        mutationIds: ["state-mutation-1"],
        flushedAt: "2026-07-10T12:00:00.000Z",
      });
    },
    /persisted reload failed/,
  );
  assert.equal(result, undefined);
});

test("newer remote revisions and remote tombstones reject stale writes before mutation", async () => {
  const fixture = createCloudFixture();
  const staleRows = clone(fixture.rows);
  staleRows.decks[0].revision = 4;
  staleRows.decks[0].name = "Remote Neu";
  const staleClient = createMemorySupabaseClient(staleRows, fixture.user);
  const localState = { ...fixture.state, decks: [{ ...fixture.state.decks[0], name: "Lokal Neu" }] };

  await assert.rejects(
    () => upsertAccountCloudState(staleClient, localState, { deviceId: "device-b" }),
    (error) => error instanceof CloudRevisionConflictError && error.remoteRevision === 4 && error.remoteDeleted === false && error.conflict?.status === "open",
  );
  assert.equal(staleClient.calls.some((call) => call.table === "decks" && ["insert", "update", "delete"].includes(call.operation)), false);
  assert.equal(staleClient.tables.sync_conflicts.length, 1);
  const conflictId = staleClient.tables.sync_conflicts[0].id;
  staleClient.tables.sync_conflicts[0].status = "resolved";
  await assert.rejects(() => upsertAccountCloudState(staleClient, localState, { deviceId: "device-b" }), CloudRevisionConflictError);
  assert.equal(staleClient.tables.sync_conflicts.length, 1);
  assert.equal(staleClient.tables.sync_conflicts[0].id, conflictId);
  assert.equal(staleClient.tables.sync_conflicts[0].status, "resolved");

  const deletedRows = clone(fixture.rows);
  deletedRows.cards[0].deleted_at = "2026-07-10T12:00:00.000Z";
  deletedRows.cards[0].revision = 3;
  const deletedClient = createMemorySupabaseClient(deletedRows, fixture.user);
  await assert.rejects(
    () => upsertAccountCloudState(deletedClient, fixture.state, { deviceId: "device-b" }),
    (error) => error instanceof CloudRevisionConflictError && error.entityTable === "cards" && error.remoteDeleted === true && error.conflict?.entityId === "card-1",
  );
  assert.equal(deletedClient.calls.some((call) => call.table === "cards" && ["insert", "update", "delete"].includes(call.operation)), false);
});

test("review events are append-only, idempotent and receive the creating device", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const existingChangedLocally = { ...fixture.state.decks[0].reviewEvents[0], rating: "easy" };
  const newEvent = {
    ...fixture.state.decks[0].reviewEvents[0],
    id: "review-2",
    rating: "hard",
    createdByDeviceId: null,
  };
  const nextState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], reviewEvents: [existingChangedLocally, newEvent] }],
  };

  const result = await upsertAccountCloudState(client, nextState, { deviceId: "device-b" });
  const reviewWrite = client.calls.find((call) => call.table === "review_events" && call.operation === "upsert");

  assert.equal(reviewWrite.payload.length, 1);
  assert.equal(reviewWrite.payload[0].id, "review-2");
  assert.equal(reviewWrite.payload[0].created_by_device_id, "device-b");
  assert.equal(client.tables.review_events.find((event) => event.id === "review-1").rating, "good");
  assert.equal(result.state.decks[0].reviewEvents.find((event) => event.id === "review-1").rating, "good");
  assert.equal(result.state.decks[0].reviewEvents.find((event) => event.id === "review-2").createdByDeviceId, "device-b");
});

test("single review event append is idempotent and stores the device id", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.review_events = [];
  const client = createMemorySupabaseClient(rows, fixture.user);
  const event = { ...fixture.state.decks[0].reviewEvents[0], createdByDeviceId: null };

  const first = await appendReviewEvent(client, event, { deviceId: "device-b", mutationId: "mutation-1" });
  const second = await appendReviewEvent(client, event, { deviceId: "device-b", mutationId: "mutation-1" });

  assert.equal(client.tables.review_events.length, 1);
  assert.equal(client.tables.review_events[0].created_by_device_id, "device-b");
  assert.equal(client.calls.filter((call) => call.table === "review_events" && call.operation === "upsert").length, 2);
  assert.deepEqual(first, { eventId: event.id, acknowledgedMutationId: "mutation-1" });
  assert.deepEqual(second, { eventId: event.id, acknowledgedMutationId: "mutation-1" });
});

test("review event append refuses to acknowledge a different persisted event with the same id", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const changedEvent = { ...fixture.state.decks[0].reviewEvents[0], rating: "easy" };

  await assert.rejects(
    () => appendReviewEvent(client, changedEvent, { deviceId: "device-b", mutationId: "mutation-conflict" }),
    (error) => error?.code === "review_event_confirmation_failed",
  );
  assert.equal(client.tables.review_events[0].rating, "good");
});

test("state tombstones soft-delete removed deck trees before acknowledging the snapshot", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const deletedAt = "2026-07-10T14:00:00.000Z";
  const state = {
    ...fixture.state,
    decks: [],
    cloudTombstones: [
      { entityTable: "decks", entityId: "deck-1", revision: 3, deletedAt },
      { entityTable: "cards", entityId: "card-1", revision: 2, deletedAt },
      { entityTable: "card_variants", entityId: fixture.rows.card_variants[0].id, revision: 2, deletedAt },
    ],
  };

  const result = await upsertAccountCloudState(client, state, {
    deviceId: "device-b",
    mutationIds: ["delete-tree-1"],
    flushedAt: deletedAt,
  });

  assert.equal(client.tables.decks[0].deleted_at, deletedAt);
  assert.equal(client.tables.cards[0].deleted_at, deletedAt);
  assert.equal(client.tables.card_variants[0].deleted_at, deletedAt);
  assert.deepEqual(result.acknowledgedMutationIds, ["delete-tree-1"]);
  assert.equal(result.state.decks.length, 0);
  assert.equal(result.state.cloudTombstones.length >= 3, true);
});

test("cloud mutation writes require explicit device and mutation identifiers", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const event = fixture.state.decks[0].reviewEvents[0];

  await assert.rejects(() => appendReviewEvent(client, event, { mutationId: "mutation-1" }), /Geräte-ID fehlt/);
  await assert.rejects(() => appendReviewEvent(client, event, { deviceId: "device-b" }), /Mutation-ID fehlt/);
  await assert.rejects(() => upsertAccountCloudState(client, fixture.state, { mutationIds: [] }), /Geräte-ID fehlt/);
  await assert.rejects(
    () => upsertAccountCloudState(client, fixture.state, { deviceId: "device-b", mutationIds: [""] }),
    /Mutation-ID fehlt/,
  );
  await assert.rejects(() => replaceAccountCloudState(client, fixture.state), /Geräte-ID fehlt/);
  assert.equal(client.calls.some((call) => ["insert", "upsert", "update", "delete"].includes(call.operation)), false);
});

test("explicit full replace deletes missing rows and advances existing revisions", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks[0].revision = 5;
  rows.decks.push({ ...rows.decks[0], id: "deck-extra", name: "Alt" });
  const client = createMemorySupabaseClient(rows, fixture.user);

  const result = await replaceAccountCloudState(client, fixture.state, { deviceId: "device-reset" });

  assert.deepEqual(client.tables.decks.map((deck) => deck.id), ["deck-1"]);
  assert.equal(client.tables.decks[0].revision, 6);
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-reset");
  assert.equal(result.state.decks[0].revision, 6);
  assert.equal(result.summary.decks, 1);
});

test("cloud acknowledgements update metadata without overwriting newer local content", () => {
  const fixture = createCloudFixture();
  const currentState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], name: "Noch neuere lokale Änderung", revision: 3 }],
  };
  const acknowledgedState = {
    ...fixture.state,
    decks: [{ ...fixture.state.decks[0], name: "Bestätigter Snapshot", revision: 4, updatedByDeviceId: "device-b" }],
  };

  const merged = mergeCloudSyncMetadata(currentState, acknowledgedState);

  assert.equal(merged.decks[0].name, "Noch neuere lokale Änderung");
  assert.equal(merged.decks[0].revision, 4);
  assert.equal(merged.decks[0].updatedByDeviceId, "device-b");
});

test("sync conflicts are account-bound, sorted and projected without raw cloud rows", async () => {
  const fixture = createDeckConflictFixture();
  fixture.rows.sync_conflicts.push({
    ...clone(fixture.rows.sync_conflicts[0]),
    id: "ignored-conflict",
    status: "ignored",
    created_at: "2026-07-12T10:00:00.000Z",
  }, {
    ...clone(fixture.rows.sync_conflicts[0]),
    id: "resolved-conflict",
    status: "resolved",
  }, {
    ...clone(fixture.rows.sync_conflicts[0]),
    id: "foreign-conflict",
    user_id: "user-2",
  });
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  const conflicts = await listAccountSyncConflicts(client);

  assert.deepEqual(conflicts.map((conflict) => conflict.id), ["conflict-deck-1", "ignored-conflict"]);
  assert.equal(conflicts[0].entityLabel, "Stapel");
  assert.equal(conflicts[0].title, "Lokales Deck");
  assert.deepEqual(conflicts[0].fields.map((field) => field.key), ["description", "name"]);
  assert.equal(Object.hasOwn(conflicts[0], "localValue"), false);
  assert.equal(conflicts[0].allowedActions.includes("merge-fields"), true);
});

test("keeping the local conflict version advances the remote revision and projects it into state", async () => {
  const fixture = createDeckConflictFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  const result = await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
    currentState: fixture.state,
  });

  assert.equal(client.tables.decks[0].name, "Lokales Deck");
  assert.equal(client.tables.decks[0].revision, 5);
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-c");
  assert.equal(client.tables.sync_conflicts[0].status, "resolved");
  assert.equal(client.tables.sync_conflicts[0].resolution.action, "keep-local");
  assert.equal(result.nextState.decks[0].name, "Lokales Deck");
  assert.equal(result.nextState.decks[0].revision, 5);
  assert.equal(result.resolved, true);

  await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:01:00.000Z",
    currentState: result.nextState,
  });
  assert.equal(client.tables.decks[0].revision, 5);
});

test("keeping remote and field-wise merging never accept protected or incomplete choices", async () => {
  const remoteFixture = createDeckConflictFixture();
  const remoteClient = createMemorySupabaseClient(remoteFixture.rows, remoteFixture.user);
  const remoteResult = await resolveAccountSyncConflict(remoteClient, "conflict-deck-1", { action: "keep-remote" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
    currentState: remoteFixture.state,
  });
  assert.equal(remoteClient.tables.decks[0].revision, 4);
  assert.equal(remoteResult.nextState.decks[0].name, "Remote Deck");

  const mergeFixture = createDeckConflictFixture();
  const mergeClient = createMemorySupabaseClient(mergeFixture.rows, mergeFixture.user);
  await assert.rejects(
    () => resolveAccountSyncConflict(mergeClient, "conflict-deck-1", { action: "merge-fields", fieldChoices: { id: "local", name: "local", description: "remote" } }, { deviceId: "device-c", currentState: mergeFixture.state }),
    /nicht auswählbar/,
  );
  await assert.rejects(
    () => resolveAccountSyncConflict(mergeClient, "conflict-deck-1", { action: "merge-fields", fieldChoices: { name: "local" } }, { deviceId: "device-c", currentState: mergeFixture.state }),
    /jedes geänderte Feld/,
  );
  const merged = await resolveAccountSyncConflict(mergeClient, "conflict-deck-1", {
    action: "merge-fields",
    fieldChoices: { name: "local", description: "remote" },
  }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
    currentState: mergeFixture.state,
  });
  assert.equal(mergeClient.tables.decks[0].name, "Lokales Deck");
  assert.equal(mergeClient.tables.decks[0].description, "Remote Beschreibung");
  assert.equal(merged.nextState.decks[0].revision, 5);
});

test("ignored conflicts can be reopened while tombstones reject field merges", async () => {
  const fixture = createDeckConflictFixture({ tombstone: true });
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  await assert.rejects(
    () => resolveAccountSyncConflict(client, "conflict-deck-1", { action: "merge-fields", fieldChoices: {} }, { deviceId: "device-c", currentState: fixture.state }),
    /nicht feldweise/,
  );
  const ignored = await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "ignore" }, { deviceId: "device-c", currentState: fixture.state });
  assert.equal(ignored.resolved, false);
  assert.equal(client.tables.sync_conflicts[0].status, "ignored");
  assert.equal(client.tables.decks[0].name, "Remote Deck");

  await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "reopen" }, { deviceId: "device-c", currentState: fixture.state });
  assert.equal(client.tables.sync_conflicts[0].status, "open");
  assert.deepEqual(client.tables.sync_conflicts[0].resolution, {});
});

test("tombstone decisions restore the full remote deck subtree or keep the local deletion", async () => {
  const remoteFixture = createDeckConflictFixture({ tombstone: true });
  remoteFixture.state = {
    ...remoteFixture.state,
    decks: [],
    cloudTombstones: [{ entityTable: "decks", entityId: "deck-1", revision: 3, deletedAt: "2026-07-12T10:00:00.000Z" }],
  };
  const remoteClient = createMemorySupabaseClient(remoteFixture.rows, remoteFixture.user);
  const restored = await resolveAccountSyncConflict(remoteClient, "conflict-deck-1", { action: "keep-remote" }, {
    deviceId: "device-c",
    currentState: remoteFixture.state,
  });
  assert.equal(restored.nextState.decks[0].name, "Remote Deck");
  assert.equal(restored.nextState.decks[0].cards.length, 1);
  assert.equal(restored.nextState.cloudTombstones.some((item) => item.entityTable === "decks" && item.entityId === "deck-1"), false);

  const localFixture = createDeckConflictFixture({ tombstone: true });
  const localClient = createMemorySupabaseClient(localFixture.rows, localFixture.user);
  const deleted = await resolveAccountSyncConflict(localClient, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
    currentState: localFixture.state,
  });
  assert.equal(deleted.nextState.decks.length, 0);
  assert.equal(deleted.nextState.cloudTombstones.some((item) => item.entityTable === "decks" && item.entityId === "deck-1"), true);
});

test("resolution fails safely when the remote revision changed again", async () => {
  const fixture = createDeckConflictFixture();
  fixture.rows.decks[0].revision = 5;
  fixture.rows.decks[0].name = "Noch neuer remote";
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  await assert.rejects(
    () => resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, { deviceId: "device-c", currentState: fixture.state }),
    SyncConflictChangedError,
  );
  assert.equal(client.tables.decks[0].name, "Noch neuer remote");
  assert.equal(client.tables.sync_conflicts[0].status, "open");
});

test("remote conflict choices project canonical cards, variants, documents and jobs into local state", async () => {
  const scenarios = [
    {
      table: "cards",
      field: "original_front",
      value: "Remote Kartenfrage",
      read: (state) => state.decks[0].cards[0].originalFront,
    },
    {
      table: "card_variants",
      field: "front",
      value: "Remote Variantenfrage",
      read: (state) => state.decks[0].cards[0].variants[0].front,
    },
    {
      table: "source_documents",
      field: "text",
      value: "Remote Dokumenttext",
      read: (state) => state.documents[0].text,
    },
    {
      table: "ai_jobs",
      field: "status",
      value: "failed",
      read: (state) => state.aiJobs[0].status,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = createCloudFixture();
    const rows = clone(fixture.rows);
    const remote = rows[scenario.table][0];
    const local = clone(remote);
    remote.revision += 1;
    remote[scenario.field] = scenario.value;
    delete local.user_id;
    const remoteValue = clone(remote);
    delete remoteValue.user_id;
    rows.sync_conflicts = [{
      id: `conflict-${scenario.table}`,
      user_id: fixture.user.id,
      entity_table: scenario.table,
      entity_id: remote.id,
      base_revision: local.revision,
      local_revision: local.revision,
      remote_revision: remote.revision,
      local_value: local,
      remote_value: remoteValue,
      status: "open",
      resolution: {},
      updated_by_device_id: "device-b",
      created_at: "2026-07-12T09:00:00.000Z",
      resolved_at: null,
    }];
    const client = createMemorySupabaseClient(rows, fixture.user);
    const result = await resolveAccountSyncConflict(client, `conflict-${scenario.table}`, { action: "keep-remote" }, {
      deviceId: "device-c",
      currentState: fixture.state,
    });
    assert.equal(scenario.read(result.nextState), scenario.value, scenario.table);
  }
});
