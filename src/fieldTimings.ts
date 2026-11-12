import { createAccountStorage } from "./accountStorage.ts";
import { appPerformanceMeasures } from "./appPerformance.ts";
import { APP_RUNTIME_INFO } from "./appRuntime.ts";

/** Interactions timed on the device, each with the point where its result is drawn. */
const interactionEnds = {
  "core:answer_shown": "card-frame",
  "core:rating_to_next_card": "card-frame",
  "core:card_search_results": "card-list",
} as const;

type InteractionMetric = keyof typeof interactionEnds;
type FieldTimingEnd = (typeof interactionEnds)[InteractionMetric];
type StartupMetric = (typeof appPerformanceMeasures)[keyof typeof appPerformanceMeasures];
export type FieldTimingMetric = InteractionMetric | StartupMetric;

/** The interactions, then the start phases that `appPerformance.ts` measures. */
export const FIELD_TIMING_METRICS: readonly FieldTimingMetric[] = [
  ...(Object.keys(interactionEnds) as InteractionMetric[]),
  ...Object.values(appPerformanceMeasures),
];
const startupMetrics = new Set<string>(Object.values(appPerformanceMeasures));

/** Whole milliseconds and the UTC day (days since 1970-01-01) of the measurement. */
export type FieldTimingSample = readonly [durationMs: number, day: number];
export type FieldTimingSamples = Partial<Record<FieldTimingMetric, FieldTimingSample[]>>;

/** Values kept per metric; older ones drop out. */
export const FIELD_TIMING_LIMIT = 200;
const MAX_DURATION_MS = 600_000;
/** Unsaved values that make a write worthwhile while the browser is idle. */
const SAVE_BATCH = 20;
const STORAGE_KEY = "core.fieldTimings.v1";
const DAY_MS = 86_400_000;

interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface FieldTimingsOptions {
  storage?: TextStorage;
  version?: string;
  now?: () => number;
  today?: () => number;
  /** Runs when the drawn result of an interaction is on screen: in the next frame. */
  afterFrame?: (run: () => void) => void;
  /** Runs the storage write while the browser is idle. */
  whenIdle?: (run: () => void) => void;
  /** Passes on the start phases measured so far and those still to come; called with the first account. */
  observeStartup?: (record: (name: string, durationMs: number) => void) => void;
}

const isSample = (value: unknown): value is FieldTimingSample => Array.isArray(value) && value.length === 2
  && Number.isInteger(value[0]) && value[0] >= 0 && value[0] <= MAX_DURATION_MS
  && Number.isInteger(value[1]) && value[1] >= 0;

/** Stored values of the current app version; anything else or malformed counts as empty. */
function parseStoredTimings(raw: string | null, version: string): FieldTimingSamples {
  let value: unknown;
  try { value = JSON.parse(raw ?? "null"); } catch { return {}; }
  if (!value || typeof value !== "object") return {};
  const { version: storedVersion, metrics } = value as Record<string, unknown>;
  if (storedVersion !== version || !metrics || typeof metrics !== "object") return {};
  const samples: FieldTimingSamples = {};
  for (const metric of FIELD_TIMING_METRICS) {
    const list = (metrics as Record<string, unknown>)[metric];
    const valid = Array.isArray(list) ? list.filter(isSample).slice(-FIELD_TIMING_LIMIT) : [];
    if (valid.length) samples[metric] = valid;
  }
  return samples;
}

/**
 * Durations of the start phases and of three interactions, kept per account in the browser and never sent anywhere
 * (ADR-050). Recording is constant work; values reach the storage in batches while the browser is idle or the page is
 * hidden.
 */
export function createFieldTimings({
  storage,
  version = APP_RUNTIME_INFO.version,
  now = () => performance.now(),
  today = () => Math.floor(Date.now() / DAY_MS),
  afterFrame = (run) => run(),
  whenIdle = (run) => run(),
  observeStartup,
}: FieldTimingsOptions = {}) {
  let account: string | null = null;
  let unsaved: Array<[FieldTimingMetric, number, number]> = [];
  let saveScheduled = false;
  let observing = false;
  const startupSeen = new Set<string>();
  const started = new Map<FieldTimingEnd, { metric: InteractionMetric; at: number }>();

  function read(): FieldTimingSamples {
    if (!account) return {};
    let samples: FieldTimingSamples = {};
    try { samples = parseStoredTimings(createAccountStorage(account, storage).getItem(STORAGE_KEY), version); } catch { /* Kein Speicher: nur ungesicherte Werte. */ }
    for (const [metric, durationMs, day] of unsaved) (samples[metric] ??= []).push([durationMs, day]);
    for (const metric of Object.keys(samples) as FieldTimingMetric[]) samples[metric] = samples[metric]!.slice(-FIELD_TIMING_LIMIT);
    return samples;
  }

  function save() {
    saveScheduled = false;
    if (!account || unsaved.length === 0) return;
    const metrics = read();
    unsaved = [];
    try { createAccountStorage(account, storage).setItem(STORAGE_KEY, JSON.stringify({ version, metrics })); } catch { /* Ein voller Speicher verwirft die Werte. */ }
  }

  function record(metric: FieldTimingMetric, durationMs: number) {
    if (!account || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) return;
    unsaved.push([metric, Math.round(durationMs), today()]);
    if (unsaved.length < SAVE_BATCH || saveScheduled) return;
    saveScheduled = true;
    whenIdle(save);
  }

  // A reload or second sign-in measures the start again only partly, so each phase counts once per page load.
  function recordStartup(name: string, durationMs: number) {
    if (!startupMetrics.has(name) || startupSeen.has(name)) return;
    startupSeen.add(name);
    record(name as StartupMetric, durationMs);
  }

  return {
    /** Values belong to the account bound when they are saved; the previous account's are saved first. */
    bind(userId: string | null) {
      if (userId === account) return;
      save();
      account = userId;
      if (account && !observing && observeStartup) {
        observing = true;
        observeStartup(recordStartup);
      }
    },
    start(metric: InteractionMetric) {
      started.set(interactionEnds[metric], { metric, at: now() });
    },
    /** Ends the interaction waiting for this point; the value includes the frame that draws it. */
    finish(end: FieldTimingEnd) {
      const interaction = started.get(end);
      if (!interaction) return;
      started.delete(end);
      afterFrame(() => record(interaction.metric, now() - interaction.at));
    },
    cancel(end: FieldTimingEnd) {
      started.delete(end);
    },
    read,
    /** The page is hidden or left: open interactions would count the time away, the rest is saved. */
    hide() {
      started.clear();
      save();
    },
  };
}

function observeStartupMeasures(record: (name: string, durationMs: number) => void) {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) record(entry.name, entry.duration);
    }).observe({ type: "measure", buffered: true });
  } catch { /* Ohne Beobachter bleiben die Startphasen ungezählt. */ }
}

const fieldTimings = createFieldTimings({
  afterFrame: (run) => { if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => run()); else run(); },
  whenIdle: (run) => { if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 10_000 }); else setTimeout(run, 0); },
  observeStartup: observeStartupMeasures,
});

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") fieldTimings.hide(); });
  window.addEventListener("pagehide", fieldTimings.hide);
}

export const {
  bind: bindFieldTimingsAccount,
  start: startFieldTiming,
  finish: finishFieldTiming,
  cancel: cancelFieldTiming,
  read: readFieldTimings,
} = fieldTimings;
