export const appPerformanceMarks = {
  appStart: "core:app_start",
  sessionChecked: "core:session_checked",
  workspaceLocalReady: "core:workspace_local_ready",
  cloudBootstrapReady: "core:cloud_bootstrap_ready",
  cloudSyncReady: "core:cloud_sync_ready",
  indexedDbOpenStart: "core:indexeddb_open_start",
  indexedDbOpenReady: "core:indexeddb_open_ready",
  indexedDbShellStart: "core:indexeddb_shell_start",
  indexedDbShellReady: "core:indexeddb_shell_ready",
  indexedDbStartupMetadataStart: "core:indexeddb_startup_metadata_start",
  indexedDbStartupMetadataReady: "core:indexeddb_startup_metadata_ready",
  firstDeckSummariesStart: "core:first_deck_summaries_start",
  firstDeckSummariesReady: "core:first_deck_summaries_ready",
  serviceWorkerContext: "core:service_worker_context",
} as const;

export const appPerformanceMeasures = {
  sessionCheck: "core:session_check",
  localWorkspaceStart: "core:local_workspace_start",
  cloudBootstrapAfterStart: "core:cloud_bootstrap_after_start",
  cloudSyncAfterStart: "core:cloud_sync_after_start",
  indexedDbOpen: "core:indexeddb_open",
  indexedDbShell: "core:indexeddb_shell",
  indexedDbStartupMetadata: "core:indexeddb_startup_metadata",
  firstDeckSummaries: "core:first_deck_summaries",
} as const;

const startupPerformancePhases = {
  indexedDbOpen: {
    start: appPerformanceMarks.indexedDbOpenStart,
    ready: appPerformanceMarks.indexedDbOpenReady,
    measure: appPerformanceMeasures.indexedDbOpen,
  },
  indexedDbShell: {
    start: appPerformanceMarks.indexedDbShellStart,
    ready: appPerformanceMarks.indexedDbShellReady,
    measure: appPerformanceMeasures.indexedDbShell,
  },
  indexedDbStartupMetadata: {
    start: appPerformanceMarks.indexedDbStartupMetadataStart,
    ready: appPerformanceMarks.indexedDbStartupMetadataReady,
    measure: appPerformanceMeasures.indexedDbStartupMetadata,
  },
  firstDeckSummaries: {
    start: appPerformanceMarks.firstDeckSummariesStart,
    ready: appPerformanceMarks.firstDeckSummariesReady,
    measure: appPerformanceMeasures.firstDeckSummaries,
  },
} as const;

export type StartupPerformancePhase = keyof typeof startupPerformancePhases;

interface PerformanceRecorder {
  mark(name: string, options?: { startTime?: number; detail?: unknown }): void;
  measure(name: string, startMark?: string, endMark?: string): void;
}

function browserPerformance(): PerformanceRecorder | null {
  if (typeof performance === "undefined") return null;
  return performance;
}

export function markAppPerformance(name: string, recorder: PerformanceRecorder | null = browserPerformance()): void {
  recorder?.mark(name);
}

export function markAppStarted(recorder: PerformanceRecorder | null = browserPerformance()): void {
  recorder?.mark(appPerformanceMarks.appStart, { startTime: 0 });
}

export function measureAppPerformance(
  name: string,
  startMark: string,
  endMark: string,
  recorder: PerformanceRecorder | null = browserPerformance(),
): void {
  if (!recorder) return;
  try {
    recorder.measure(name, startMark, endMark);
  } catch {
    // Ein fehlender Messpunkt darf den Produktstart nie blockieren.
  }
}

export function markSessionChecked(recorder?: PerformanceRecorder | null): void {
  markAppPerformance(appPerformanceMarks.sessionChecked, recorder);
  measureAppPerformance(
    appPerformanceMeasures.sessionCheck,
    appPerformanceMarks.appStart,
    appPerformanceMarks.sessionChecked,
    recorder,
  );
}

export function markWorkspaceLocalReady(recorder?: PerformanceRecorder | null): void {
  markAppPerformance(appPerformanceMarks.workspaceLocalReady, recorder);
  measureAppPerformance(
    appPerformanceMeasures.localWorkspaceStart,
    appPerformanceMarks.appStart,
    appPerformanceMarks.workspaceLocalReady,
    recorder,
  );
}

export function markCloudSyncReady(recorder?: PerformanceRecorder | null): void {
  markAppPerformance(appPerformanceMarks.cloudSyncReady, recorder);
  measureAppPerformance(
    appPerformanceMeasures.cloudSyncAfterStart,
    appPerformanceMarks.workspaceLocalReady,
    appPerformanceMarks.cloudSyncReady,
    recorder,
  );
}

export function markCloudBootstrapReady(recorder?: PerformanceRecorder | null): void {
  markAppPerformance(appPerformanceMarks.cloudBootstrapReady, recorder);
  measureAppPerformance(
    appPerformanceMeasures.cloudBootstrapAfterStart,
    appPerformanceMarks.workspaceLocalReady,
    appPerformanceMarks.cloudBootstrapReady,
    recorder,
  );
}

export function markStartupPhaseStarted(
  phase: StartupPerformancePhase,
  recorder: PerformanceRecorder | null = browserPerformance(),
): void {
  recorder?.mark(startupPerformancePhases[phase].start);
}

export function markStartupPhaseReady(
  phase: StartupPerformancePhase,
  detail: Record<string, number> = {},
  recorder: PerformanceRecorder | null = browserPerformance(),
): void {
  const marks = startupPerformancePhases[phase];
  recorder?.mark(marks.ready, { detail });
  measureAppPerformance(marks.measure, marks.start, marks.ready, recorder);
}

export function markServiceWorkerContext(
  status: "controlled" | "uncontrolled" | "unsupported",
  recorder: PerformanceRecorder | null = browserPerformance(),
): void {
  recorder?.mark(appPerformanceMarks.serviceWorkerContext, { detail: { status } });
}
