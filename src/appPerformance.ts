export const appPerformanceMarks = {
  appStart: "core:app_start",
  sessionChecked: "core:session_checked",
  workspaceLocalReady: "core:workspace_local_ready",
  cloudBootstrapReady: "core:cloud_bootstrap_ready",
  cloudSyncReady: "core:cloud_sync_ready",
} as const;

export const appPerformanceMeasures = {
  sessionCheck: "core:session_check",
  localWorkspaceStart: "core:local_workspace_start",
  cloudBootstrapAfterStart: "core:cloud_bootstrap_after_start",
  cloudSyncAfterStart: "core:cloud_sync_after_start",
} as const;

interface PerformanceRecorder {
  mark(name: string, options?: { startTime?: number }): void;
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
