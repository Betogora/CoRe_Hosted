import { createSyncIdleStatus } from "./accountSession.ts";
import type { DecksCardPage } from "./appScreenProps.ts";
import type { SyncStatus } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import type { StudyHeatmapModel } from "./studyHeatmapModel.ts";
import type { OfflineDeckRecord } from "./workspaceReplica.ts";
import type { WorkspaceStorageStatus } from "./workspaceStorage.ts";

/** Everything the open account shows; one immutable snapshot per change. */
export interface WorkspaceSnapshot {
  state: WorkspaceState | null;
  /** Counts every applied shell state (each local write and sync), also when its content stays the same. */
  revision: number;
  /** Absent until the first load; screens then count from the decks they were given. */
  deckSummaries: ReadonlyMap<string, DeckLibrarySummary> | undefined;
  studyHeatmap: StudyHeatmapModel | undefined;
  syncStatus: SyncStatus;
  /** The last successful sync; it stays while later changes are pending or offline. */
  lastSyncedAt: string | null;
  syncConflictCardIds: ReadonlySet<string>;
  cardPages: Readonly<Record<string, DecksCardPage | undefined>>;
  offlineDecks: Readonly<Record<string, OfflineDeckRecord>>;
  storageStatus: WorkspaceStorageStatus | null;
}

type WorkspaceUpdate = Partial<Omit<WorkspaceSnapshot, "revision" | "lastSyncedAt">>;

export interface WorkspaceStore {
  get: () => WorkspaceSnapshot;
  /** Merges the changed parts; a new shell state counts up the revision, a saved sync status sets `lastSyncedAt`. */
  set: (update: WorkspaceUpdate | ((current: WorkspaceSnapshot) => WorkspaceUpdate)) => void;
  subscribe: (listener: () => void) => () => void;
  /** Empties the store when the account's workspace is discarded, so nothing of it shows in the next one. */
  clear: () => void;
}

function emptySnapshot(revision: number): WorkspaceSnapshot {
  return {
    state: null,
    revision,
    deckSummaries: undefined,
    studyHeatmap: undefined,
    syncStatus: createSyncIdleStatus(),
    lastSyncedAt: null,
    syncConflictCardIds: new Set(),
    cardPages: {},
    offlineDecks: {},
    storageStatus: null,
  };
}

export function createWorkspaceStore(): WorkspaceStore {
  let snapshot = emptySnapshot(0);
  const listeners = new Set<() => void>();
  const publish = (next: WorkspaceSnapshot) => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    get: () => snapshot,
    set(update) {
      const patch = typeof update === "function" ? update(snapshot) : update;
      const changed = (Object.keys(patch) as (keyof WorkspaceUpdate)[]).filter((key) => !Object.is(patch[key], snapshot[key]));
      if (changed.length === 0) return;
      const { syncStatus } = patch;
      publish({
        ...snapshot,
        ...patch,
        revision: "state" in patch ? snapshot.revision + 1 : snapshot.revision,
        lastSyncedAt: syncStatus?.status === "saved" ? syncStatus.savedAt : snapshot.lastSyncedAt,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // The revision keeps counting, so a summary loaded for the previous account never counts as current.
    clear: () => publish(emptySnapshot(snapshot.revision + 1)),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Structural equality of plain objects, arrays, maps and sets; anything else compares by identity. */
function isSameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => isSameContent(item, b[index]));
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) if (!b.has(key) || !isSameContent(value, b.get(key))) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((item) => b.has(item));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && isSameContent(a[key], b[key]));
}

/**
 * Reads a selected part of a store. While the selection keeps its content, the reader returns the value it returned
 * before, also for a new but equal set, map or object, so a subscriber comparing by identity does not render again.
 */
export function createSelectionReader<T>() {
  let cached: { snapshot: WorkspaceSnapshot; select: (snapshot: WorkspaceSnapshot) => T; value: T } | null = null;
  return (store: WorkspaceStore, select: (snapshot: WorkspaceSnapshot) => T): T => {
    const snapshot = store.get();
    if (cached?.snapshot === snapshot && cached.select === select) return cached.value;
    const selected = select(snapshot);
    const value = cached && isSameContent(cached.value, selected) ? cached.value : selected;
    cached = { snapshot, select, value };
    return value;
  };
}
