import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { appPerformanceMarks, appPerformanceMeasures } from "../../src/appPerformance.ts";
import { e2eAuthStatePath } from "../e2e/support/e2eEnvironment.ts";

const RUNS_PER_SCENARIO = 10;
const BACKGROUND_OBSERVATION_MS = 2_200;
interface NetworkProfile {
  latencyMs: number;
  downloadBytesPerSecond: number;
  uploadBytesPerSecond: number;
  connectionType: "cellular3g" | "cellular4g";
}

const NETWORK_3G: NetworkProfile = {
  latencyMs: 150,
  downloadBytesPerSecond: 200_000,
  uploadBytesPerSecond: 100_000,
  connectionType: "cellular3g",
};
const NETWORK_4G: NetworkProfile = {
  latencyMs: 50,
  downloadBytesPerSecond: 1_000_000,
  uploadBytesPerSecond: 500_000,
  connectionType: "cellular4g",
};

interface StartupRun {
  targetReadyMs: number;
  workspaceReadyMs: number;
  ttfbMs: number;
  indexedDbOpenMs: number;
  indexedDbShellMs: number;
  indexedDbStartupMetadataMs: number;
  firstDeckSummariesMs: number;
  dashboardFeatureLoadMs: number;
  learnPreloadMs: number;
  decksPreloadMs: number;
  deckCount: number;
  outboxCount: number;
  serviceWorkerStatus: string;
  longestBackgroundTaskMs: number;
  longestSummaryTaskMs: number;
  longestFeatureLoadTaskMs: number;
}

interface ScenarioResult {
  runs: StartupRun[];
  p75Ms: number;
  p95Ms: number;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarize(runs: StartupRun[]): ScenarioResult {
  const targetValues = runs.map((run) => run.targetReadyMs);
  return {
    runs,
    p75Ms: round(percentile(targetValues, 0.75)),
    p95Ms: round(percentile(targetValues, 0.95)),
  };
}

async function createMeasuredContext(
  browser: Browser,
  serviceWorkers: "allow" | "block" = "allow",
  effectiveType: "3g" | "4g" = "3g",
) {
  const context = await browser.newContext({ storageState: e2eAuthStatePath, serviceWorkers });
  await context.addInitScript((reportedEffectiveType) => {
    const target = globalThis as typeof globalThis & { __coreLongTasks?: Array<{ startTime: number; duration: number }> };
    target.__coreLongTasks = [];
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: reportedEffectiveType, saveData: false },
    });
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver((list) => {
        target.__coreLongTasks?.push(...list.getEntries().map((entry) => ({
          startTime: entry.startTime,
          duration: entry.duration,
        })));
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Nicht unterstützte Long-Task-Beobachtung wird als fehlender Messwert erkannt.
    }
  }, effectiveType);
  return context;
}

async function throttlePage(page: Page, offline: boolean, network = NETWORK_3G) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (!offline) {
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: network.latencyMs,
      downloadThroughput: network.downloadBytesPerSecond,
      uploadThroughput: network.uploadBytesPerSecond,
      connectionType: network.connectionType,
    });
  }
}

async function waitForMark(page: Page, name: string) {
  await page.waitForFunction((markName) => performance.getEntriesByName(markName, "mark").length > 0, name, { timeout: 60_000 });
}

async function preparePersistedContext(context: BrowserContext, expectServiceWorker: boolean) {
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForMark(page, appPerformanceMarks.cloudSyncReady);
  await waitForMark(page, appPerformanceMarks.firstDeckSummariesReady);
  if (expectServiceWorker) {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await waitForMark(page, appPerformanceMarks.cloudSyncReady);
  }
  await page.close();
}

async function measureRun(
  context: BrowserContext,
  targetMark: string,
  offline: boolean,
  network = NETWORK_3G,
  waitForAutomaticPreloads = false,
): Promise<StartupRun> {
  const page = await context.newPage();
  await throttlePage(page, offline, network);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForMark(page, targetMark);
  await waitForMark(page, appPerformanceMarks.firstDeckSummariesReady);
  if (waitForAutomaticPreloads) {
    await waitForMark(page, "core:feature:learn:ready");
    await waitForMark(page, "core:feature:decks:ready");
  }
  await page.waitForTimeout(BACKGROUND_OBSERVATION_MS);
  const result = await page.evaluate(({ marks, measures, selectedTarget }) => {
    const mark = (name: string) => performance.getEntriesByName(name, "mark").at(-1) as PerformanceMark | undefined;
    const measure = (name: string) => performance.getEntriesByName(name, "measure").at(-1)?.duration ?? Number.NaN;
    const detail = (name: string) => mark(name)?.detail as Record<string, unknown> | undefined;
    const workspaceReadyMs = mark(marks.workspaceLocalReady)?.startTime ?? Number.NaN;
    const navigation = performance.getEntriesByType("navigation").at(-1) as PerformanceNavigationTiming | undefined;
    const observedLongTasks = (globalThis as typeof globalThis & { __coreLongTasks?: Array<{ startTime: number; duration: number }> }).__coreLongTasks ?? [];
    const longTasks = observedLongTasks
      .filter((entry) => entry.startTime >= workspaceReadyMs);
    const interval = (startName: string, readyName: string) => ({
      start: mark(startName)?.startTime ?? Number.NaN,
      end: mark(readyName)?.startTime ?? Number.NaN,
    });
    const longestOverlappingTask = ({ start, end }: { start: number; end: number }) => Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, ...observedLongTasks.filter((task) => task.startTime < end && task.startTime + task.duration > start).map((task) => task.duration))
      : 0;
    const summaryInterval = interval(marks.firstDeckSummariesStart, marks.firstDeckSummariesReady);
    const featureIntervals = ["dashboard", "learn", "decks"].map((feature) => interval(
      `core:feature:${feature}:start`,
      `core:feature:${feature}:ready`,
    ));
    return {
      targetReadyMs: mark(selectedTarget)?.startTime ?? Number.NaN,
      workspaceReadyMs,
      ttfbMs: navigation?.responseStart ?? Number.NaN,
      indexedDbOpenMs: measure(measures.indexedDbOpen),
      indexedDbShellMs: measure(measures.indexedDbShell),
      indexedDbStartupMetadataMs: measure(measures.indexedDbStartupMetadata),
      firstDeckSummariesMs: measure(measures.firstDeckSummaries),
      dashboardFeatureLoadMs: measure("core:feature:dashboard:load"),
      learnPreloadMs: measure("core:feature:learn:load"),
      decksPreloadMs: measure("core:feature:decks:load"),
      deckCount: Number(detail(marks.firstDeckSummariesReady)?.deckCount ?? detail(marks.indexedDbShellReady)?.deckCount ?? 0),
      outboxCount: Number(detail(marks.indexedDbStartupMetadataReady)?.outboxCount ?? 0),
      serviceWorkerStatus: String(detail(marks.serviceWorkerContext)?.status ?? "missing"),
      longestBackgroundTaskMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
      longestSummaryTaskMs: longestOverlappingTask(summaryInterval),
      longestFeatureLoadTaskMs: Math.max(0, ...featureIntervals.map(longestOverlappingTask)),
    };
  }, { marks: appPerformanceMarks, measures: appPerformanceMeasures, selectedTarget: targetMark });
  await page.close();
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])) as unknown as StartupRun;
}

async function measurePersistentScenario(context: BrowserContext, targetMark: string, offline: boolean) {
  const runs: StartupRun[] = [];
  for (let index = 0; index < RUNS_PER_SCENARIO; index += 1) runs.push(await measureRun(context, targetMark, offline));
  return summarize(runs);
}

test("misst normale, isolierte, Service-Worker-freie und offline Starts", async ({ browser }) => {
  const persistedContext = await createMeasuredContext(browser);
  await preparePersistedContext(persistedContext, true);
  const recurringPersisted = await measurePersistentScenario(persistedContext, appPerformanceMarks.workspaceLocalReady, false);
  expect(recurringPersisted.runs.every((run) => run.serviceWorkerStatus === "controlled")).toBe(true);

  const freshRuns: StartupRun[] = [];
  for (let index = 0; index < RUNS_PER_SCENARIO; index += 1) {
    const context = await createMeasuredContext(browser);
    freshRuns.push(await measureRun(context, appPerformanceMarks.cloudBootstrapReady, false));
    await context.close();
  }
  const freshIsolated = summarize(freshRuns);
  expect(freshIsolated.runs.every((run) => run.serviceWorkerStatus === "uncontrolled")).toBe(true);

  const withoutServiceWorkerContext = await createMeasuredContext(browser, "block");
  await preparePersistedContext(withoutServiceWorkerContext, false);
  const persistedWithoutServiceWorker = await measurePersistentScenario(
    withoutServiceWorkerContext,
    appPerformanceMarks.workspaceLocalReady,
    false,
  );
  expect(persistedWithoutServiceWorker.runs.every((run) => run.serviceWorkerStatus === "uncontrolled")).toBe(true);
  await withoutServiceWorkerContext.close();

  await persistedContext.setOffline(true);
  const persistedOffline = await measurePersistentScenario(persistedContext, appPerformanceMarks.workspaceLocalReady, true);
  expect(persistedOffline.runs.every((run) => run.serviceWorkerStatus === "controlled")).toBe(true);
  await persistedContext.close();

  const automatic4gRuns: StartupRun[] = [];
  for (let index = 0; index < RUNS_PER_SCENARIO; index += 1) {
    const context = await createMeasuredContext(browser, "block", "4g");
    automatic4gRuns.push(await measureRun(context, appPerformanceMarks.cloudBootstrapReady, false, NETWORK_4G, true));
    await context.close();
  }
  const automatic4gPreload = summarize(automatic4gRuns);
  expect(automatic4gRuns.every((run) => Number.isFinite(run.learnPreloadMs) && Number.isFinite(run.decksPreloadMs))).toBe(true);

  const allRuns = [
    ...recurringPersisted.runs,
    ...freshIsolated.runs,
    ...persistedWithoutServiceWorker.runs,
    ...persistedOffline.runs,
  ];
  const artifact = {
    suite: "startup",
    generatedAt: new Date().toISOString(),
    environment: {
      browser: "Chromium",
      runsPerScenario: RUNS_PER_SCENARIO,
      cpuSlowdown: 4,
      network3g: NETWORK_3G,
      network4g: NETWORK_4G,
      backgroundObservationMs: BACKGROUND_OBSERVATION_MS,
    },
    scenarios: {
      recurringPersisted,
      freshIsolated,
      persistedWithoutServiceWorker,
      persistedOffline,
      automatic4gPreload,
    },
    comparisons: {
      serviceWorkerP75CostMs: round(recurringPersisted.p75Ms - persistedWithoutServiceWorker.p75Ms),
      firstDeckSummariesMaxMs: Math.max(...allRuns.map((run) => run.firstDeckSummariesMs)),
      longestSummaryTaskMs: Math.max(...allRuns.map((run) => run.longestSummaryTaskMs)),
      longestFeatureLoadTaskMs: Math.max(...allRuns.map((run) => run.longestFeatureLoadTaskMs)),
    },
    recurringWorkspaceP75Ms: recurringPersisted.p75Ms,
    recurringWorkspaceP95Ms: recurringPersisted.p95Ms,
    offlineColdStartP75Ms: persistedOffline.p75Ms,
    offlineColdStartP95Ms: persistedOffline.p95Ms,
    newDeviceDashboardP75Ms: freshIsolated.p75Ms,
    longestBackgroundTaskMs: Math.max(...allRuns.map((run) => run.longestBackgroundTaskMs)),
    automaticPreloadLongestTaskMs: Math.max(...automatic4gRuns.map((run) => run.longestFeatureLoadTaskMs)),
    automatic3gPreloadCount: allRuns.filter((run) => Number.isFinite(run.learnPreloadMs) || Number.isFinite(run.decksPreloadMs)).length,
  };
  const artifactPath = path.join(process.cwd(), "test-results", "performance.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
});
