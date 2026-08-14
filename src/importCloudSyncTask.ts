export type ImportCloudSyncStatus = "syncing" | "cloud-ready" | "local-pending" | "blocked";
export interface ImportCloudSyncResult { status: ImportCloudSyncStatus; message: string; }
export interface ImportCloudSyncTask {
  readonly status: ImportCloudSyncStatus;
  readonly ready: Promise<void>;
  retry(): Promise<ImportCloudSyncResult>;
  subscribe(listener: (result: ImportCloudSyncResult) => void): () => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Die Cloud-Synchronisierung ist fehlgeschlagen.";
}

export function createImportCloudSyncTask(run: () => Promise<ImportCloudSyncResult>): ImportCloudSyncTask {
  let status: ImportCloudSyncStatus = "syncing";
  let result: ImportCloudSyncResult = { status, message: "Cloud-Daten werden synchronisiert." };
  let active: Promise<ImportCloudSyncResult> | null = null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const listeners = new Set<(next: ImportCloudSyncResult) => void>();
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => undefined);

  const notify = (next: ImportCloudSyncResult) => {
    result = next;
    status = next.status;
    listeners.forEach((listener) => listener(next));
    if (next.status === "cloud-ready") resolveReady();
    if (next.status === "blocked") rejectReady(new Error(next.message));
  };

  return {
    get status() { return status; },
    ready,
    retry() {
      if (status === "cloud-ready" || status === "blocked") return Promise.resolve(result);
      if (active) return active;
      notify({ status: "syncing", message: "Cloud-Daten werden synchronisiert." });
      active = run()
        .then((next) => { notify(next); return next; })
        .catch((error) => {
          const next = { status: "blocked" as const, message: describeError(error) };
          notify(next);
          return next;
        })
        .finally(() => { active = null; });
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(result);
      return () => listeners.delete(listener);
    },
  };
}
