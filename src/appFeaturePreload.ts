import type { AppViewId } from "./appNavigation.ts";

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}

interface PreloadEnvironment {
  documentTarget?: { visibilityState?: string; addEventListener?: Function; removeEventListener?: Function } | null;
  network?: NetworkInformationLike | null;
}

function allowsBasePreloading({ documentTarget, network }: PreloadEnvironment = {}): boolean {
  if (documentTarget?.visibilityState === "hidden") return false;
  if (network?.saveData) return false;
  return network?.effectiveType !== "slow-2g" && network?.effectiveType !== "2g";
}

export function allowsAutomaticPreloading(environment: PreloadEnvironment = {}): boolean {
  if (!allowsBasePreloading(environment)) return false;
  const effectiveType = environment.network?.effectiveType;
  return effectiveType === undefined || effectiveType === "4g";
}

export function allowsIntentPreloading(environment: PreloadEnvironment = {}): boolean {
  return allowsBasePreloading(environment);
}

interface AdaptivePreloadOptions extends PreloadEnvironment {
  preload: (viewId: AppViewId) => Promise<unknown>;
  delayMs?: number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  requestIdle?: (callback: () => void) => unknown;
  cancelIdle?: (handle: unknown) => void;
  interactionTarget?: { addEventListener?: Function; removeEventListener?: Function } | null;
}

function browserNetwork(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null;
}

export function allowsBrowserSpeculativePreloading(): boolean {
  return allowsIntentPreloading({
    documentTarget: typeof document === "undefined" ? null : document,
    network: browserNetwork(),
  });
}

export function allowsBrowserAutomaticPreloading(): boolean {
  return allowsAutomaticPreloading({
    documentTarget: typeof document === "undefined" ? null : document,
    network: browserNetwork(),
  });
}

/** Element in `index.html` where the build lists each feature chunk's files (`vite.config.ts`). */
export const FEATURE_CHUNKS_ELEMENT_ID = "core-feature-chunks";

/** `files`: the feature's own chunks beyond the start graph; `parts`: the chunks of its lazily loaded sub-areas. */
export interface FeatureChunks {
  files: string[];
  parts: string[];
}

const isFileList = (value: unknown): value is string[] => Array.isArray(value) && value.every((file) => typeof file === "string");

export function parseFeatureChunks(text: string | null | undefined): Record<string, FeatureChunks> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, FeatureChunks] => {
    const chunks = entry[1] as Partial<FeatureChunks> | null;
    return Boolean(chunks) && isFileList(chunks?.files) && isFileList(chunks?.parts);
  }));
}

/**
 * Downloads chunks into the HTTP and service worker caches without executing them: the download leaves the main
 * thread free, and the later `import()` only evaluates. Each file is fetched once; a failed file may be retried.
 */
export function createChunkPrefetcher(fetchFile: (url: string) => Promise<unknown>) {
  const started = new Map<string, Promise<void>>();
  return (urls: readonly string[]): Promise<void> => Promise.all(urls.map((url) => {
    let pending = started.get(url);
    if (!pending) {
      pending = fetchFile(url).then(() => undefined, () => { started.delete(url); });
      started.set(url, pending);
    }
    return pending;
  })).then(() => undefined);
}

export function startAdaptiveFeaturePreloading({
  preload,
  delayMs = 1_000,
  documentTarget = typeof document === "undefined" ? null : document,
  network = browserNetwork(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestIdle = (callback) => typeof requestIdleCallback === "function"
    ? requestIdleCallback(callback, { timeout: 2_000 })
    : setTimeout(callback, 0),
  cancelIdle = (handle) => typeof cancelIdleCallback === "function"
    ? cancelIdleCallback(handle as number)
    : clearTimeout(handle as ReturnType<typeof setTimeout>),
  interactionTarget = typeof window === "undefined" ? null : window,
}: AdaptivePreloadOptions): () => void {
  let cancelled = false;
  let idleHandle: unknown = null;
  const queue: AppViewId[] = ["lernen", "kartenstapel"];
  const stopForInteraction = () => {
    cancelled = true;
    if (idleHandle !== null) cancelIdle(idleHandle);
  };
  const interactionEvents = ["pointerdown", "keydown", "touchstart"];
  interactionEvents.forEach((event) => interactionTarget?.addEventListener?.(event, stopForInteraction, { once: true, passive: true }));

  const timer = setTimer(() => {
    if (cancelled || !allowsAutomaticPreloading({ documentTarget, network })) return;
    const runNext = () => {
      if (cancelled || !allowsAutomaticPreloading({ documentTarget, network })) return;
      const viewId = queue.shift();
      if (!viewId) return;
      void preload(viewId).then(() => {
        if (!cancelled && queue.length > 0) idleHandle = requestIdle(runNext);
      }).catch(() => {});
    };
    idleHandle = requestIdle(runNext);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimer(timer);
    if (idleHandle !== null) cancelIdle(idleHandle);
    interactionEvents.forEach((event) => interactionTarget?.removeEventListener?.(event, stopForInteraction));
  };
}
