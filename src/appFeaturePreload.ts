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
