export interface WorkspaceStorageStatus {
  supported: boolean;
  persisted: boolean;
  usage: number | null;
  quota: number | null;
}

interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export async function requestPersistentWorkspaceStorage(storage: StorageManagerLike | null = typeof navigator === "undefined" ? null : navigator.storage): Promise<WorkspaceStorageStatus> {
  if (!storage) return { supported: false, persisted: false, usage: null, quota: null };
  let persisted = await storage.persisted?.().catch(() => false) ?? false;
  if (!persisted) persisted = await storage.persist?.().catch(() => false) ?? false;
  const estimate: { usage?: number; quota?: number } = await storage.estimate?.().catch(() => ({})) ?? {};
  return {
    supported: true,
    persisted,
    usage: Number.isFinite(estimate.usage) ? Number(estimate.usage) : null,
    quota: Number.isFinite(estimate.quota) ? Number(estimate.quota) : null,
  };
}

export function formatStorageBytes(value: number | null): string {
  if (value == null) return "unbekannt";
  const units = ["Byte", "KiB", "MiB", "GiB", "TiB"];
  let amount = Math.max(0, value);
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toLocaleString("de-DE", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
