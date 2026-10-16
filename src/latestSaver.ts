/** Single-flight autosave: concurrent calls share one run, which saves again until the newest value is stored. `pending` work
 * (an image import) finishes first; failed pending work or a missing value resolve `stopped`, nothing newer resolves `current`. */
export function createLatestSaver<T>({ latest, stored, pending, save }: {
  latest: () => T | null; stored: () => T | null; pending: () => Promise<boolean> | null; save: (value: T) => Promise<void>;
}): () => Promise<"saved" | "current" | "stopped"> {
  let running: Promise<"saved" | "current" | "stopped"> | null = null;
  async function run() {
    for (let wrote = false; ;) {
      const preparation = pending(); if (preparation && !(await preparation)) return "stopped";
      const value = latest(); if (value === null) return "stopped";
      if (value === stored()) return wrote ? "saved" : "current";
      await save(value); wrote = true;
    }
  }
  return () => running ??= run().finally(() => { running = null; });
}
