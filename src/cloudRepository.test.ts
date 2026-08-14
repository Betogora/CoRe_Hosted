import assert from "node:assert/strict";
import test from "node:test";
import { createProfileRow } from "./cloudAuth.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import { createBasicLearningItem, createCoreDeck, createCoreNoteTypeDefinition, createLearningItemFromEditorValue, createSourceDocument, getCardEditorValue, getOriginalVariant, saveCardEditorValue } from "./coreModel.ts";
import {
  applyEntityMutation,
  applyEntityMutationBatch,
  createCloudStateRows,
  deckToCloudRow,
  ImportGraphVerificationError,
  listAccountSyncConflicts,
  registerAccountSyncDevice,
  recordAtomicReview,
  replaceAccountCloudState,
  resolveAccountSyncConflict,
  reviewEventToCloudRow,
  softDeleteEntity,
  streamAccountCloudChanges,
  SyncConflictChangedError,
  upsertAccountCloudProfile,
  verifyAccountImportGraph,
} from "./cloudRepository.ts";

function clone(value: any): any {
  return JSON.parse(JSON.stringify(value));
}

function createMemorySupabaseClient(initialTables = {}, user = { id: "user-1", email: "user@example.test" }, { fail }: any = {}) {
  const syncTables = new Set(["decks", "note_type_definitions", "cards", "card_variants", "learning_item_source_snapshots", "review_events", "source_documents"]);
  const tables = Object.fromEntries(
    ["profiles", "decks", "note_type_definitions", "cards", "card_variants", "learning_item_source_snapshots", "review_events", "source_documents", "media_assets", "sync_devices", "sync_conflicts"].map(
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      (table) => [table, clone(initialTables[table] ?? [])],
    ),
  );
  let nextSyncChangeId = 1;
  for (const table of syncTables) {
    for (const row of tables[table]) {
      row.sync_change_id = nextSyncChangeId;
      nextSyncChangeId += 1;
    }
  }
  const stampSyncChange = (table: string, row: any) => syncTables.has(table)
    ? { ...row, sync_change_id: nextSyncChangeId++ }
    : row;
  const calls: { table: any; operation: any; filters: any; payload: any; options: any; }[] = [];

  class Query {
    table: string;
    maxRows: number | null;
    orderings: Array<{ field: string; ascending: boolean }>;

    constructor(table: any) {
      this.table = table;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.operation = null;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.filters = [];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.columns = "*";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.payload = null;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.options = {};
      this.maxRows = null;
      this.orderings = [];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.returning = false;
    }

    select(columns = "*") {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (["insert", "upsert", "update", "delete"].includes(this.operation)) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        this.returning = true;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        this.columns = columns;
      } else {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        this.operation = "select";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        this.columns = columns;
      }
      return this;
    }

    insert(payload: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.operation = "insert";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.payload = clone(Array.isArray(payload) ? payload : [payload]);
      return this;
    }

    upsert(payload: any, options = {}) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.operation = "upsert";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.payload = clone(Array.isArray(payload) ? payload : [payload]);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.options = options;
      return this;
    }

    update(payload: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.operation = "update";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.payload = clone(payload);
      return this;
    }

    delete() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.operation = "delete";
      return this;
    }

    eq(field: any, value: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.filters.push({ type: "eq", field, value });
      return this;
    }

    in(field: any, values: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.filters.push({ type: "in", field, values });
      return this;
    }

    gt(field: any, value: any) {
// @ts-expect-error -- Die Fixture bildet den Supabase-Querybuilder minimal nach.
      this.filters.push({ type: "gt", field, value });
      return this;
    }

    or(expression: string) {
      const [greater, equalAndId] = expression.split(",and(");
      const [field, value] = greater.split(".gt.");
      const equalParts = equalAndId?.replace(/\)$/, "").split(",id.gt.");
      const equalValue = equalParts?.[0]?.split(".eq.")[1];
// @ts-expect-error -- Die Fixture bildet genau den verwendeten zusammengesetzten Keyset-Filter nach.
      this.filters.push({ type: "delta", field, value, equalValue, id: equalParts?.[1] ?? null });
      return this;
    }

    order(field: any, options: any = {}) {
      this.orderings.push({ field, ascending: options.ascending !== false });
      return this;
    }

    limit(value: any) {
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

    then(resolve: ((value: { data: null; error: any; }|{ data: any; error: null; }) => { data: null; error: any; }|{ data: any; error: null; }|PromiseLike<{ data: null; error: any; }|{ data: any; error: null; }>)|null|undefined, reject: ((reason: any) => PromiseLike<never>)|null|undefined) {
      return this.execute().then(resolve, reject);
    }

    matches(row: { [x: string]: any; }) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      return this.filters.every((filter: any) => {
        if (filter.type === "eq") return row[filter.field] === filter.value;
        if (filter.type === "gt") return row[filter.field] > filter.value;
        if (filter.type === "delta") return row[filter.field] > filter.value
          || (row[filter.field] === filter.equalValue && row.id > filter.id);
        return filter.values.includes(row[filter.field]);
      });
    }

    project(rows: string|any[]) {
      const ordered = [...rows];
      const orderings = this.orderings;
      if (orderings.length) ordered.sort((left, right) => {
        for (const ordering of orderings) {
          const comparison = ordering.field === "sync_change_id"
            ? Number(left[ordering.field]) - Number(right[ordering.field])
            : String(left[ordering.field]).localeCompare(String(right[ordering.field]));
          if (comparison) return ordering.ascending ? comparison : -comparison;
        }
        return 0;
      });
      const limited = this.maxRows == null ? ordered : ordered.slice(0, this.maxRows);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.columns === "*") return clone(limited);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      const columns = this.columns.split(",").map((column: string) => column.trim());
      return clone(limited.map((row: { [x: string]: any; }) => Object.fromEntries(columns.map((column: string|number) => [column, row[column]]))));
    }

    async execute() {
      const rows = tables[this.table] ?? (tables[this.table] = []);
      const call = {
        table: this.table,
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        operation: this.operation,
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        filters: clone(this.filters),
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        payload: clone(this.payload),
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        options: clone(this.options),
      };
      calls.push(call);
      const injectedError = fail?.(call, calls);
      if (injectedError) return { data: null, error: injectedError };

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.operation === "select") return { data: this.project(rows.filter((row: any) => this.matches(row))), error: null };

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.operation === "insert") {
        const affected = [];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        for (const candidate of this.payload) {
          if (rows.some((row: { user_id: any; id: any; }) => row.user_id === candidate.user_id && row.id === candidate.id)) {
            return { data: null, error: new Error(`duplicate ${this.table}`) };
          }
          const stored = stampSyncChange(this.table,
            this.table === "sync_devices"
              ? {
                  label: "Browser",
                  last_seen_at: "2026-07-10T08:00:00.000Z",
                  user_agent: "",
                  created_at: "2026-07-10T08:00:00.000Z",
                  ...candidate,
                }
              : candidate);
          rows.push(stored);
          affected.push(stored);
        }
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.operation === "upsert") {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        const keys = String(this.options.onConflict ?? "id").split(",");
        const affected = [];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        for (const candidate of this.payload) {
          const index = rows.findIndex((row: { [x: string]: any; }) => keys.every((key) => row[key] === candidate[key]));
          if (index >= 0) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
            if (this.options.ignoreDuplicates) continue;
            rows[index] = stampSyncChange(this.table, { ...rows[index], ...candidate });
            affected.push(rows[index]);
          } else {
            const stored = stampSyncChange(this.table,
              this.table === "sync_devices"
                ? {
                    label: "Browser",
                    last_seen_at: "2026-07-10T08:00:00.000Z",
                    user_agent: "",
                    created_at: "2026-07-10T08:00:00.000Z",
                    ...candidate,
                  }
                : candidate);
            rows.push(stored);
            affected.push(stored);
          }
        }
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.operation === "update") {
        const affected = [];
        for (let index = 0; index < rows.length; index += 1) {
          if (!this.matches(rows[index])) continue;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
          rows[index] = stampSyncChange(this.table, { ...rows[index], ...this.payload });
          affected.push(rows[index]);
        }
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        return { data: this.returning ? this.project(affected) : null, error: null };
      }

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      if (this.operation === "delete") {
        const removed = rows.filter((row: any) => this.matches(row));
        tables[this.table] = rows.filter((row: any) => !this.matches(row));
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
    from(table: any) {
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    sourceAnchors: [{ documentId: document.id }],
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 2,
    updatedByDeviceId: "device-a",
  });
  card.variants = card.variants.map((variant) => ({ ...variant, revision: 2, updatedByDeviceId: "device-a" }));
  const definition = createCoreNoteTypeDefinition({ document: card.contentDocument, createdAt: timestamp });
  const sourceSnapshot = {
    id: "snapshot-1",
    schemaVersion: 1 as const,
    sourceKind: "legacy-projection" as const,
    importFingerprint: "snapshot-fingerprint-1",
    previousSnapshotId: null,
    definitionVersionId: definition.id,
    sourcePayload: { fields: card.originalFields },
    createdAt: timestamp,
  };
  card.latestSourceSnapshotId = sourceSnapshot.id;
  const reviewEvent: ReviewEvent = {
    id: "review-1",
    userId: "user-1",
    deckId: "deck-1",
    learningItemId: card.id,
    variantId: null,
    reviewableType: "card",
    reviewableId: card.id,
    sourceCardId: card.id,
    rating: "good",
    answeredAt: timestamp,
    responseTimeMs: null,
    schedulerBefore: {},
    schedulerAfter: {},
    flags: {},
    createdAt: timestamp,
    createdByDeviceId: "device-a",
  };
  const deck = createCoreDeck({
    id: "deck-1",
    name: "Cloud Deck",
    source: "manual",
    cards: [card],
    sourceDocuments: [document],
    reviewEvents: [reviewEvent],
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 3,
    updatedByDeviceId: "device-a",
  });
  const profile = {
    userId: "user-1",
    email: "user@example.test",
    displayName: "Cloud User",
    timezone: "Europe/Berlin",
    onboardingComplete: true,
    schedulerPreferences: { profile: "standard" },
  };
  const state = {
    version: 4,
    profile,
    decks: [deck],
    documents: [document],
    noteTypeDefinitions: [definition],
    learningItemSourceSnapshots: [sourceSnapshot],
    cloudTombstones: [],
  };
  const user = { id: "user-1", email: profile.email, created_at: timestamp };
  const rows = createCloudStateRows(state, user.id, { deviceId: "device-a" });
  const accountRows = rows as Record<string, any[]>;
  let syncChangeId = 1;
  for (const table of ["decks", "note_type_definitions", "cards", "card_variants", "learning_item_source_snapshots", "review_events", "source_documents"]) {
    for (const row of accountRows[table]) row.sync_change_id = syncChangeId++;
  }
  return {
    state,
    user,
    rows: { ...rows, profiles: [createProfileRow(profile, user, timestamp)] },
  };
}

test("bestätigt einen vollständigen Importgraphen und weist fehlende Varianten zurück", async () => {
  const fixture = createCloudFixture();
  const scope = {
    deckIds: fixture.rows.decks.map((row: any) => row.id),
    cardIds: fixture.rows.cards.map((row: any) => row.id),
    variantIds: fixture.rows.card_variants.map((row: any) => row.id),
    sourceSnapshots: fixture.rows.learning_item_source_snapshots.map((row: any) => ({
      id: row.id,
      cardId: row.card_id,
      attachToCard: true,
    })),
    noteTypeDefinitionIds: fixture.rows.note_type_definitions.map((row: any) => row.id),
    reviewEventIds: fixture.rows.review_events.map((row: any) => row.id),
  };

  const verified = await verifyAccountImportGraph(createMemorySupabaseClient(fixture.rows, fixture.user), scope);
  assert.deepEqual(verified, {
    decks: 1,
    cards: 1,
    variants: 1,
    sourceSnapshots: 1,
    noteTypeDefinitions: 1,
    reviewEvents: 1,
  });

  const incompleteRows = clone(fixture.rows);
  incompleteRows.card_variants = [];
  await assert.rejects(
    () => verifyAccountImportGraph(createMemorySupabaseClient(incompleteRows, fixture.user), scope),
    (error: unknown) => error instanceof ImportGraphVerificationError
      && error.repairScope.variantIds?.[0] === scope.variantIds[0]
      && Object.values(error.repairScope).flat().length === 1,
  );

  const mislinkedRows = clone(fixture.rows);
  mislinkedRows.review_events[0].reviewable_id = "falsche-karte";
  await assert.rejects(
    () => verifyAccountImportGraph(createMemorySupabaseClient(mislinkedRows, fixture.user), scope),
    (error: unknown) => error instanceof Error
      && !(error instanceof ImportGraphVerificationError)
      && /Review-Ereignis/.test(error.message),
  );
});

function createDeckConflictFixture({ tombstone = false }: any = {}) {
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
  assert.equal(writes[0].options.onConflict, "user_id,id");
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
    client.tables.sync_devices.map((device: { user_id: any; }) => device.user_id).sort(),
    ["user-a", "user-b"],
  );
  assert.equal(client.tables.sync_devices.find((device: { user_id: string; }) => device.user_id === "user-a").label, "Firefox auf Linux");
  assert.equal(client.tables.sync_devices.find((device: { user_id: string; }) => device.user_id === "user-b").label, "Safari auf macOS");
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const client = createMemorySupabaseClient({}, null);

  await assert.rejects(
    () => registerAccountSyncDevice(client, { id: "device-1", label: "Browser", userAgent: "agent" }),
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    (error) => error?.code === "session_not_found" && /melde dich zuerst an/.test(error.message),
  );
});

test("entity batches cap inserts at 250 rows and avoid per-entity round trips", async () => {
  const client = createMemorySupabaseClient({}, { id: "user-1", email: "user@example.test" });
  const mutations = Array.from({ length: 251 }, (_, index) => ({
    table: "decks",
    entity: createCoreDeck({ id: `batch-deck-${String(index).padStart(3, "0")}`, name: `Stapel ${index}`, source: "manual", cards: [] }),
    baseRevision: null,
  }));

  const result = await applyEntityMutationBatch(client, mutations, {
    deviceId: "device-a",
    flushedAt: "2026-08-11T12:00:00.000Z",
  });

  assert.equal(result.length, 251);
  const inserts = client.calls.filter((call) => call.table === "decks" && call.operation === "insert");
  assert.equal(inserts.length, 2);
  assert.equal(Math.max(...inserts.map((call) => call.payload.length)), 250);
  assert.equal(client.calls.filter((call) => call.table === "decks" && call.operation === "select").length, 3);
});

test("review event mutations use bounded idempotent batches instead of sequential writes", async () => {
  const fixture = createCloudFixture();
  const baseEvent = fixture.state.decks[0].reviewEvents[0];
  const mutations = Array.from({ length: 1_079 }, (_, index) => ({
    table: "review_events",
    entity: { ...baseEvent, id: `batch-review-${String(index).padStart(4, "0")}` },
    deckId: baseEvent.deckId,
    baseRevision: null,
  }));
  const client = createMemorySupabaseClient({}, fixture.user);

  const first = await applyEntityMutationBatch(client, mutations, { deviceId: "device-review", flushedAt: "2026-08-11T12:00:00.000Z" });
  const second = await applyEntityMutationBatch(client, mutations, { deviceId: "device-review", flushedAt: "2026-08-11T12:00:00.000Z" });

  assert.equal(first.length, 1_079);
  assert.equal(second.every((result) => result.idempotent), true);
  const writes = client.calls.filter((call) => call.table === "review_events" && call.operation === "upsert");
  assert.ok(writes.length > 1);
  assert.ok(writes.length < 10);
  assert.equal(Math.max(...writes.map((call) => call.payload.length)), 250);
  assert.equal(client.calls.some((call) => call.table === "review_events" && call.operation === "insert"), false);
});

test("source snapshot mutations batch immutable rows and preserve card attachments", async () => {
  const fixture = createCloudFixture();
  const baseSnapshot = fixture.state.learningItemSourceSnapshots[0];
  const snapshots = [
    { ...baseSnapshot, id: "batch-snapshot-1", previousSnapshotId: baseSnapshot.id },
    { ...baseSnapshot, id: "batch-snapshot-2", previousSnapshotId: "batch-snapshot-1" },
  ];
  const mutations = snapshots.map((entity, index) => ({
    table: "learning_item_source_snapshots",
    entity,
    cardId: "card-1",
    attachToCard: index === snapshots.length - 1,
    baseRevision: null,
  }));
  const client = createMemorySupabaseClient(clone(fixture.rows), fixture.user);

  const first = await applyEntityMutationBatch(client, mutations, { deviceId: "device-snapshot", flushedAt: "2026-08-11T12:00:00.000Z" });
  const second = await applyEntityMutationBatch(client, mutations, { deviceId: "device-snapshot", flushedAt: "2026-08-11T12:00:00.000Z" });

  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  const writes = client.calls.filter((call) => call.table === "learning_item_source_snapshots" && call.operation === "upsert");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.length, 2);
  assert.equal(client.tables.cards.find((card: any) => card.id === "card-1").latest_source_snapshot_id, "batch-snapshot-2");
});

test("initial cloud download reconstructs 2,500 rows with stable 500-row keyset pages", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks = Array.from({ length: 2_500 }, (_, index) => ({
    ...rows.decks[0],
    id: `deck-${String(index).padStart(4, "0")}`,
    sync_change_id: index + 1,
  }));
  const client = createMemorySupabaseClient(rows, fixture.user);
  const received: any[] = [];

  await streamAccountCloudChanges(client, {}, async (page) => {
    if (page.table === "decks") received.push(...page.entities);
  });

  assert.equal(received.length, 2_500);
  assert.equal(new Set(received.map((deck) => deck.id)).size, 2_500);
  const deckReads = client.calls.filter((call) => call.table === "decks" && call.operation === "select");
  assert.equal(deckReads.length, 6);
  assert.equal(deckReads.every((call) => call.options != null), true);
  assert.deepEqual(received.slice(0, 2).map((deck) => deck.id), ["deck-0000", "deck-0001"]);
  assert.equal(received.at(-1)?.id, "deck-2499");
});

test("an acknowledged tombstone can be restored with its exact revision", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const deletedAt = "2026-07-10T13:00:00.000Z";
  const restoredAt = "2026-07-10T14:00:00.000Z";
  const deleted = await softDeleteEntity(client, {
    entityTable: "cards",
    entityId: "card-1",
    baseRevision: 2,
    deletedAt,
  }, { deviceId: "device-b" });
  assert.ok(deleted);

  const restored = await applyEntityMutation(client, {
    table: "cards",
    entity: {
      ...fixture.state.decks[0].cards[0],
      revision: deleted.revision,
      deletedAt: null,
      updatedAt: restoredAt,
    },
    deckId: "deck-1",
    baseRevision: deleted.revision,
  }, { deviceId: "device-b", flushedAt: restoredAt });
  assert.ok(restored);

  assert.equal(restored.applied, true);
  assert.equal(restored.revision, 4);
  assert.equal(restored.deletedAt, null);
  assert.equal(client.tables.cards[0].deleted_at, null);
  assert.equal(client.tables.cards[0].revision, 4);
});

test("profile patch updates only the account profile", async () => {
  const fixture = createCloudFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);
  const profile = {
    ...fixture.state.profile,
    uiPreferences: {
      dashboardCollapsedDeckIds: ["deck-1"],
      learnCollapsedDeckIds: [],
      deckManagerExpandedDeckIds: [],
    },
  };

  const result = await upsertAccountCloudProfile(client, profile, {
    mutationId: "profile-1",
    flushedAt: "2026-08-06T12:00:00.000Z",
  });

  assert.deepEqual(result, { acknowledgedMutationId: "profile-1" });
  assert.deepEqual(client.tables.profiles[0].ui_preferences, profile.uiPreferences);
  assert.equal(client.calls.filter((call) => call.operation === "upsert").every((call) => call.table === "profiles"), true);
});

test("explicit full replace deletes missing rows and advances existing revisions", async () => {
  const fixture = createCloudFixture();
  const rows = clone(fixture.rows);
  rows.decks[0].revision = 5;
  rows.decks.push({ ...rows.decks[0], id: "deck-extra", name: "Alt" });
  const client = createMemorySupabaseClient(rows, fixture.user);

  const result = await replaceAccountCloudState(client, fixture.state, { deviceId: "device-reset" });

  assert.deepEqual(client.tables.decks.map((deck: { id: any; }) => deck.id), ["deck-1"]);
  assert.equal(client.tables.decks[0].revision, 6);
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-reset");
  assert.equal(result.state.decks[0].revision, 6);
  assert.equal(result.summary.decks, 1);
});

test("source snapshot confirmation accepts server timestamp formatting but rejects changed content", async () => {
  const fixture = createCloudFixture();
  const equivalentRows = clone(fixture.rows);
  equivalentRows.learning_item_source_snapshots[0].created_at = "2026-07-10T10:00:00+00:00";

  await assert.doesNotReject(() => replaceAccountCloudState(
    createMemorySupabaseClient(equivalentRows, fixture.user),
    fixture.state,
    { deviceId: "device-reset" },
  ));

  const conflictingRows = clone(equivalentRows);
  conflictingRows.learning_item_source_snapshots[0].source_payload = { fields: ["anderer Inhalt"] };
  await assert.rejects(
    () => replaceAccountCloudState(
      createMemorySupabaseClient(conflictingRows, fixture.user),
      fixture.state,
      { deviceId: "device-reset" },
    ),
    (error: any) => error?.code === "source_snapshot_immutable_conflict",
  );
});

test("explicit full replace tombstones media parents without deleting their references", async () => {
  const fixture = createCloudFixture();
  const mediaRow = {
    id: "media-row-1", user_id: fixture.user.id, deck_id: fixture.rows.decks[0].id,
    card_id: fixture.rows.cards[0].id, sha1: "0123456789abcdef0123456789abcdef01234567", size: 4,
    mime_type: "image/png", original_name: "bild.png", storage_bucket: "core-media",
    storage_path: `${fixture.user.id}/objects/0123456789abcdef0123456789abcdef01234567`,
    source: "apkg-media", metadata: {}, created_at: "2026-07-14T08:00:00.000Z",
    updated_at: "2026-07-14T08:00:00.000Z", deleted_at: null,
  };
  const rows: any = JSON.parse(JSON.stringify(fixture.rows));
  rows.media_assets = [mediaRow];
  const client = createMemorySupabaseClient(rows, fixture.user, {
    fail: (call: any) => call.table === "note_type_definitions" && call.operation === "delete"
      ? { code: "23503", message: "violates foreign key constraint cards_note_type_definition_owner_fk" }
      : null,
  });
  const emptyState = { ...fixture.state, decks: [], documents: [], noteTypeDefinitions: [], learningItemSourceSnapshots: [] };

  await replaceAccountCloudState(client, emptyState, { deviceId: "device-reset" });

  assert.equal(client.tables.decks[0].deleted_at != null, true);
  assert.equal(client.tables.cards[0].deleted_at != null, true);
  assert.equal(client.tables.note_type_definitions[0].deleted_at != null, true);
  assert.deepEqual(client.tables.media_assets, [mediaRow]);
  assert.equal(client.calls.some((call: any) => call.operation === "delete" && call.table === "decks"), false);
  assert.equal(client.calls.some((call: any) => call.operation === "delete" && call.table === "cards"), false);
  assert.equal(client.calls.some((call: any) => call.operation === "delete" && call.table === "note_type_definitions"), false);
});

test("explicit full replace batches large sets of obsolete append-only rows", async () => {
  const fixture = createCloudFixture();
  const rows: any = JSON.parse(JSON.stringify(fixture.rows));
  rows.review_events = [
    rows.review_events[0],
    ...Array.from({ length: 205 }, (_, index) => ({
      ...rows.review_events[0],
      id: `obsolete-review-${index}`,
    })),
  ];
  const client = createMemorySupabaseClient(rows, fixture.user);

  await replaceAccountCloudState(client, fixture.state, { deviceId: "device-reset" });

  const deleteCalls = client.calls.filter((call: any) => call.table === "review_events" && call.operation === "delete");
  assert.equal(deleteCalls.length, 3);
  assert.equal(deleteCalls.every((call: any) => call.filters.find((filter: any) => filter.type === "in")?.values.length <= 100), true);
  assert.deepEqual(client.tables.review_events.map((event: any) => event.id), ["review-1"]);
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

  assert.deepEqual(conflicts.map((conflict: { id: any; }) => conflict.id), ["conflict-deck-1", "ignored-conflict"]);
  assert.equal(conflicts[0].entityLabel, "Stapel");
  assert.equal(conflicts[0].title, "Lokales Deck");
  assert.deepEqual(conflicts[0].fields.map((field: { key: any; }) => field.key), ["description", "name"]);
  assert.equal(Object.hasOwn(conflicts[0], "localValue"), false);
  assert.equal(conflicts[0].allowedActions.includes("merge-fields"), true);
});

test("keeping the local conflict version advances the remote revision and returns one entity page", async () => {
  const fixture = createDeckConflictFixture();
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  const result = await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
  });

  assert.equal(client.tables.decks[0].name, "Lokales Deck");
  assert.equal(client.tables.decks[0].revision, 5);
  assert.equal(client.tables.decks[0].updated_by_device_id, "device-c");
  assert.equal(client.tables.sync_conflicts[0].status, "resolved");
  assert.equal(client.tables.sync_conflicts[0].resolution.action, "keep-local");
  const resolvedDeck = result.resolvedPage?.entities[0] as any;
  assert.equal(resolvedDeck.name, "Lokales Deck");
  assert.equal(resolvedDeck.revision, 5);
  assert.equal(result.resolved, true);

  await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:01:00.000Z",
  });
  assert.equal(client.tables.decks[0].revision, 5);
});

test("keeping remote and field-wise merging never accept protected or incomplete choices", async () => {
  const remoteFixture = createDeckConflictFixture();
  const remoteClient = createMemorySupabaseClient(remoteFixture.rows, remoteFixture.user);
  const remoteResult = await resolveAccountSyncConflict(remoteClient, "conflict-deck-1", { action: "keep-remote" }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
  });
  assert.equal(remoteClient.tables.decks[0].revision, 4);
  assert.equal((remoteResult.resolvedPage?.entities[0] as any).name, "Remote Deck");

  const mergeFixture = createDeckConflictFixture();
  const mergeClient = createMemorySupabaseClient(mergeFixture.rows, mergeFixture.user);
  await assert.rejects(
    () => resolveAccountSyncConflict(mergeClient, "conflict-deck-1", { action: "merge-fields", fieldChoices: { id: "local", name: "local", description: "remote" } }, { deviceId: "device-c" }),
    /nicht auswählbar/,
  );
  await assert.rejects(
    () => resolveAccountSyncConflict(mergeClient, "conflict-deck-1", { action: "merge-fields", fieldChoices: { name: "local" } }, { deviceId: "device-c" }),
    /jedes geänderte Feld/,
  );
  const merged = await resolveAccountSyncConflict(mergeClient, "conflict-deck-1", {
    action: "merge-fields",
    fieldChoices: { name: "local", description: "remote" },
  }, {
    deviceId: "device-c",
    resolvedAt: "2026-07-12T11:00:00.000Z",
  });
  assert.equal(mergeClient.tables.decks[0].name, "Lokales Deck");
  assert.equal(mergeClient.tables.decks[0].description, "Remote Beschreibung");
  assert.equal((merged.resolvedPage?.entities[0] as any).revision, 5);
});

test("ignored conflicts can be reopened while tombstones reject field merges", async () => {
  const fixture = createDeckConflictFixture({ tombstone: true });
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  await assert.rejects(
    () => resolveAccountSyncConflict(client, "conflict-deck-1", { action: "merge-fields", fieldChoices: {} }, { deviceId: "device-c" }),
    /nicht feldweise/,
  );
  const ignored = await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "ignore" }, { deviceId: "device-c" });
  assert.equal(ignored.resolved, false);
  assert.equal(client.tables.sync_conflicts[0].status, "ignored");
  assert.equal(client.tables.decks[0].name, "Remote Deck");

  await resolveAccountSyncConflict(client, "conflict-deck-1", { action: "reopen" }, { deviceId: "device-c" });
  assert.equal(client.tables.sync_conflicts[0].status, "open");
  assert.deepEqual(client.tables.sync_conflicts[0].resolution, {});
});

test("tombstone decisions return only the chosen deck entity", async () => {
  const remoteFixture = createDeckConflictFixture({ tombstone: true });
  remoteFixture.state = {
    ...remoteFixture.state,
    decks: [],
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    cloudTombstones: [{ entityTable: "decks", entityId: "deck-1", revision: 3, deletedAt: "2026-07-12T10:00:00.000Z" }],
  };
  const remoteClient = createMemorySupabaseClient(remoteFixture.rows, remoteFixture.user);
  const restored = await resolveAccountSyncConflict(remoteClient, "conflict-deck-1", { action: "keep-remote" }, {
    deviceId: "device-c",
  });
  assert.equal((restored.resolvedPage?.entities[0] as any).name, "Remote Deck");
  assert.equal((restored.resolvedPage?.entities[0] as any).deletedAt, null);

  const localFixture = createDeckConflictFixture({ tombstone: true });
  const localClient = createMemorySupabaseClient(localFixture.rows, localFixture.user);
  const deleted = await resolveAccountSyncConflict(localClient, "conflict-deck-1", { action: "keep-local" }, {
    deviceId: "device-c",
  });
  assert.equal((deleted.resolvedPage?.entities[0] as any).id, "deck-1");
  assert.ok((deleted.resolvedPage?.entities[0] as any).deletedAt);
});

test("resolution fails safely when the remote revision changed again", async () => {
  const fixture = createDeckConflictFixture();
  fixture.rows.decks[0].revision = 5;
  fixture.rows.decks[0].name = "Noch neuer remote";
  const client = createMemorySupabaseClient(fixture.rows, fixture.user);

  await assert.rejects(
    () => resolveAccountSyncConflict(client, "conflict-deck-1", { action: "keep-local" }, { deviceId: "device-c" }),
    SyncConflictChangedError,
  );
  assert.equal(client.tables.decks[0].name, "Noch neuer remote");
  assert.equal(client.tables.sync_conflicts[0].status, "open");
});

test("remote conflict choices project canonical card, variant and document pages", async () => {
  const scenarios = [
    {
      table: "cards",
      field: "original_front",
      value: "Remote Kartenfrage",
      read: (entity: { originalFront: any }) => entity.originalFront,
    },
    {
      table: "card_variants",
      field: "front",
      value: "Remote Variantenfrage",
      read: (entity: { front: any }) => entity.front,
    },
    {
      table: "source_documents",
      field: "text",
      value: "Remote Dokumenttext",
      read: (entity: { text: any }) => entity.text,
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
    });
    assert.equal((scenario.read as (entity: any) => any)(result.resolvedPage?.entities[0]), scenario.value, scenario.table);
  }
});

test("atomic review RPC sends compact revisioned state and validates every returned row", async () => {
  const fixture = createCloudFixture();
  const deck = fixture.state.decks[0];
  const card = deck.cards[0];
  const variant = card.variants[0];
  const event = { ...deck.reviewEvents[0], variantId: variant.id, reviewableType: "variant" as const, reviewableId: variant.id };
  const eventRow = reviewEventToCloudRow(event, deck, fixture.user.id, { deviceId: "device-review" });
  const calls: any[] = [];
  const client = {
    auth: { async getUser() { return { data: { user: fixture.user }, error: null }; } },
    from() { throw new Error("Der atomare Review-Pfad darf keine Tabellenabfrage ausführen."); },
    async rpc(name: string, payload: unknown) {
      calls.push({ name, payload });
      return {
        data: {
          deck: fixture.rows.decks[0],
          card: fixture.rows.cards[0],
          variant: fixture.rows.card_variants[0],
          event: { ...eventRow, sync_change_id: 100 },
        },
        error: null,
      };
    },
  };

  const result = await recordAtomicReview(client, {
    deck,
    card,
    variant,
    event,
    baseRevisions: { deck: 3, card: 2, variant: 2 },
  }, { deviceId: "device-review", mutationId: "mutation-review" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "record_review_atomic");
  assert.equal(calls[0].payload.p_deck_base_revision, 3);
  assert.equal(calls[0].payload.p_card_base_revision, 2);
  assert.equal(calls[0].payload.p_variant_base_revision, 2);
  assert.equal(calls[0].payload.p_event.id, event.id);
  assert.equal(result.acknowledgedMutationId, "mutation-review");
  assert.equal(result.rows.deck.id, deck.id);
  assert.equal(result.rows.card.id, card.id);
  assert.equal(result.rows.variant?.id, variant.id);
  assert.equal(result.rows.event.id, event.id);
});

test("atomic review RPC stays queued when the database function is unavailable", async () => {
  const fixture = createCloudFixture();
  const deck = fixture.state.decks[0];
  const client = {
    auth: { async getUser() { return { data: { user: fixture.user }, error: null }; } },
    from() { throw new Error("Der atomare Review-Pfad darf keine Tabellenabfrage ausführen."); },
    async rpc() { return { data: null, error: { code: "PGRST202", message: "function record_review_atomic does not exist" } }; },
  };

  await assert.rejects(
    () => recordAtomicReview(client, { deck, card: deck.cards[0], variant: null, event: deck.reviewEvents[0] }, { deviceId: "device-review", mutationId: "mutation-review" }),
    (error: any) => error?.code === "review_rpc_unavailable" && /lokale Änderung bleibt vorgemerkt/.test(error.message),
  );
});
