export interface PerformanceSnapshot {
  suite?: "full" | "startup";
  ttfbMs?: number;
  lcpMs?: number;
  inpMs?: number;
  cls?: number;
  recurringWorkspaceP75Ms?: number;
  recurringWorkspaceP95Ms?: number;
  offlineColdStartP75Ms?: number;
  offlineColdStartP95Ms?: number;
  newDeviceDashboardP75Ms?: number;
  persistedSummaryReadP75Ms?: number;
  tabReactionMs?: number;
  preloadedTabP75Ms?: number;
  preloadedTabP95Ms?: number;
  lazyTabP75Ms?: number;
  lazyTabP95Ms?: number;
  largeDeckFirstPageP75Ms?: number;
  largeDeckFirstPageP95Ms?: number;
  studyStartP75Ms?: number;
  studyStartP95Ms?: number;
  reviewReactionMs?: number;
  reviewPersistP95Ms?: number;
  deltaSyncP75Ms?: number;
  deltaSyncP95Ms?: number;
  blockingRepeatStartRequests?: number;
  initialJavaScriptGzipBytes?: number;
  largestFeatureGzipBytes?: number;
  bootstrapCompressedBytes?: number;
  longestBackgroundTaskMs?: number;
  automaticPreloadLongestTaskMs?: number;
  automatic3gPreloadCount?: number;
  devColdStartMs?: number;
  devWarmReloadMs?: number;
}

export const PERFORMANCE_GATES: ReadonlyArray<{ key: keyof PerformanceSnapshot; maximum: number; label: string }> = [
  { key: "ttfbMs", maximum: 800, label: "TTFB" },
  { key: "lcpMs", maximum: 2_500, label: "LCP" },
  { key: "inpMs", maximum: 200, label: "INP" },
  { key: "cls", maximum: 0.1, label: "CLS" },
  { key: "recurringWorkspaceP75Ms", maximum: 1_500, label: "Wiederholungsstart p75" },
  { key: "recurringWorkspaceP95Ms", maximum: 3_000, label: "Wiederholungsstart p95" },
  { key: "offlineColdStartP75Ms", maximum: 1_500, label: "Offline-Kaltstart p75" },
  { key: "offlineColdStartP95Ms", maximum: 3_000, label: "Offline-Kaltstart p95" },
  { key: "newDeviceDashboardP75Ms", maximum: 3_000, label: "Neues Gerät bis Dashboard p75" },
  { key: "persistedSummaryReadP75Ms", maximum: 50, label: "Persistierte Stapelzusammenfassung p75" },
  { key: "tabReactionMs", maximum: 100, label: "Tab-Reaktion" },
  { key: "preloadedTabP75Ms", maximum: 300, label: "Vorgeladener Tab p75" },
  { key: "preloadedTabP95Ms", maximum: 750, label: "Vorgeladener Tab p95" },
  { key: "lazyTabP75Ms", maximum: 1_000, label: "Lazy-Tab p75" },
  { key: "lazyTabP95Ms", maximum: 2_000, label: "Lazy-Tab p95" },
  { key: "largeDeckFirstPageP75Ms", maximum: 1_000, label: "100k-Stapel erste Seite p75" },
  { key: "largeDeckFirstPageP95Ms", maximum: 2_000, label: "100k-Stapel erste Seite p95" },
  { key: "studyStartP75Ms", maximum: 1_000, label: "Lernstart p75" },
  { key: "studyStartP95Ms", maximum: 2_000, label: "Lernstart p95" },
  { key: "reviewReactionMs", maximum: 100, label: "Review-Reaktion" },
  { key: "reviewPersistP95Ms", maximum: 250, label: "Review lokal gespeichert p95" },
  { key: "deltaSyncP75Ms", maximum: 2_000, label: "Delta-Sync p75" },
  { key: "deltaSyncP95Ms", maximum: 5_000, label: "Delta-Sync p95" },
  { key: "blockingRepeatStartRequests", maximum: 1, label: "Blockierende Requests beim Wiederholungsstart" },
  { key: "initialJavaScriptGzipBytes", maximum: 300 * 1024, label: "Initiales JavaScript gzip" },
  { key: "largestFeatureGzipBytes", maximum: 200 * 1024, label: "Feature-Tab gzip" },
  { key: "bootstrapCompressedBytes", maximum: 200 * 1024, label: "Bootstrap komprimiert" },
  { key: "longestBackgroundTaskMs", maximum: 50, label: "Hintergrundtask" },
  { key: "automaticPreloadLongestTaskMs", maximum: 50, label: "Automatischer Preload-Task" },
  { key: "automatic3gPreloadCount", maximum: 0, label: "Automatische 3G-Preloads" },
  { key: "devColdStartMs", maximum: 3_000, label: "Dev-Cold-Start" },
  { key: "devWarmReloadMs", maximum: 500, label: "Warmer Dev-Reload" },
];

const STARTUP_PERFORMANCE_GATE_KEYS = new Set<keyof PerformanceSnapshot>([
  "recurringWorkspaceP75Ms",
  "recurringWorkspaceP95Ms",
  "offlineColdStartP75Ms",
  "offlineColdStartP95Ms",
  "newDeviceDashboardP75Ms",
  "persistedSummaryReadP75Ms",
  "longestBackgroundTaskMs",
  "automaticPreloadLongestTaskMs",
  "automatic3gPreloadCount",
]);

function selectedPerformanceGates(snapshot: PerformanceSnapshot) {
  return snapshot.suite === "startup"
    ? PERFORMANCE_GATES.filter((gate) => STARTUP_PERFORMANCE_GATE_KEYS.has(gate.key))
    : PERFORMANCE_GATES;
}

export function evaluatePerformanceSnapshot(snapshot: PerformanceSnapshot) {
  return selectedPerformanceGates(snapshot).flatMap((gate) => {
    const value = snapshot[gate.key];
    return typeof value === "number" && value > gate.maximum
      ? [{ ...gate, actual: value }]
      : [];
  });
}

export function findMissingPerformanceGates(snapshot: PerformanceSnapshot) {
  return selectedPerformanceGates(snapshot).filter((gate) => {
    const value = snapshot[gate.key];
    return typeof value !== "number" || !Number.isFinite(value);
  });
}
