import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createCoreDeck } from "../src/coreModel.ts";
import { mergeAccountStatisticsSnapshot, projectStatistics, type StatisticsPeriod } from "../src/statisticsModel.ts";
import type { AccountStatisticsSnapshot } from "../src/workspaceReplica.ts";

const cardCount = 100_000;
const reviewCount = 1_000_000;
const runs = 5;
const now = "2026-08-17T12:00:00.000Z";
const deck = createCoreDeck({ id: "statistics-benchmark-deck", name: "Statistik-Benchmark", source: "manual" });
const dayKeys = Array.from({ length: 365 }, (_, index) => new Date(Date.parse(now) - (364 - index) * 86_400_000).toISOString().slice(0, 10));
const forecastDayKeys = Array.from({ length: 365 }, (_, index) => new Date(Date.parse(now) + index * 86_400_000).toISOString().slice(0, 10));
const dailyReviews = Math.floor(reviewCount / dayKeys.length);
const dailyCards = Math.floor(cardCount / dayKeys.length);
const distribution = Array.from({ length: 20 }, (_, index) => ({
  key: String(index), label: String(index), count: Math.floor(cardCount / 20), cumulativePercent: (index + 1) * 5,
}));
const snapshot: AccountStatisticsSnapshot = {
  cards: { total: cardCount, new: 20_000, learning: 10_000, mature: 50_000, suspended: 2_000 },
  reviewsByDay: Object.fromEntries(dayKeys.map((key, index) => [key, {
    total: dailyReviews + Number(index < reviewCount % dayKeys.length),
    learning: Math.floor(dailyReviews * 0.1), relearning: Math.floor(dailyReviews * 0.1),
    young: Math.floor(dailyReviews * 0.4), mature: Math.floor(dailyReviews * 0.4),
    successful: Math.floor(dailyReviews * 0.86), timedCount: dailyReviews,
    durationMs: dailyReviews * 2_000, durationLearningMs: dailyReviews * 200,
    durationRelearningMs: dailyReviews * 200, durationYoungMs: dailyReviews * 800, durationMatureMs: dailyReviews * 800,
  }])),
  heatmapByDay: Object.fromEntries(dayKeys.map((key) => [key, dailyReviews])),
  addedCardsByDay: Object.fromEntries(dayKeys.map((key) => [key, dailyCards])),
  forecastByDay: Object.fromEntries(forecastDayKeys.map((key) => [key, { learning: 20, relearning: 20, young: 100, mature: 140, total: 280 }])),
  overdue: 1_000, dueTomorrow: 280, dailyWorkload: 340,
  status: { activeVariants: 25_000, deletedItems: 500 },
  intervals: { points: distribution, averageDays: 28, medianDays: 21, percentile95Days: 90 },
  fsrs: { difficulty: distribution, stability: distribution, retrievability: distribution },
  retention: ["selected", "previous", "all"].map((key) => ({
    key: key as "selected" | "previous" | "all", youngRemembered: 400_000, youngTotal: 450_000, matureRemembered: 475_000, matureTotal: 550_000,
  })),
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: Math.floor(reviewCount / 24), successful: Math.floor(reviewCount * 0.86 / 24) })),
  ratings: ["learning", "relearning", "young", "mature"].flatMap((category) => ["again", "hard", "good", "easy"].map((rating) => ({
    category: category as "learning" | "relearning" | "young" | "mature",
    rating: rating as "again" | "hard" | "good" | "easy",
    count: Math.floor(reviewCount / 16),
  }))),
  deckReviews: { [deck.id]: { reviews: reviewCount, successful: 860_000, again: 140_000, remembered: 860_000, retentionTotal: reviewCount, intervalTotal: 28_000_000, intervalCount: reviewCount, nextDueAt: now } },
  generatedAt: now,
};

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

function measure(period: StatisticsPeriod) {
  const values: number[] = [];
  let projectedReviews = 0;
  for (let run = 0; run < runs; run += 1) {
    const shell = projectStatistics([deck], { period, deckIds: "all", now, timeZone: "Europe/Berlin" });
    const startedAt = performance.now();
    projectedReviews = mergeAccountStatisticsSnapshot(shell, snapshot).summary.reviewCount;
    values.push(performance.now() - startedAt);
  }
  return { period, p75Ms: Number(percentile(values, 0.75).toFixed(2)), p95Ms: Number(percentile(values, 0.95).toFixed(2)), projectedReviews };
}

function measureDatabase() {
  const docker = process.platform === "win32" ? "docker.exe" : "docker";
  const expectedContainer = `supabase_db_${basename(process.cwd())}`;
  const containerLookup = spawnSync(docker, ["ps", "--filter", `name=^/${expectedContainer}$`, "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  if (containerLookup.status !== 0 || containerLookup.stdout.trim() !== expectedContainer) {
    throw new Error(`Die lokale Supabase-Datenbank ${expectedContainer} läuft nicht.`);
  }

  const fixture = readFileSync(resolve("supabase/benchmark_replica_v2.sql"), "utf8");
  const execution = spawnSync(docker, ["exec", "-i", expectedContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: fixture,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${execution.stdout}\n${execution.stderr}`;
  if (execution.status !== 0) throw new Error(`Die Datenbank-Fixture ist fehlgeschlagen.\n${output}`);

  const parseRuns = (name: string) => {
    const match = output.match(new RegExp(`${name}=(\\[[^\\r\\n]+\\])`));
    if (!match) throw new Error(`Die Datenbank-Fixture lieferte ${name} nicht.`);
    return JSON.parse(match[1]) as number[];
  };
  const statisticsRpcMs = parseRuns("CORE_STATISTICS_RPC_MS");
  const catalogSearchMs = parseRuns("CORE_CATALOG_SEARCH_MS");
  return {
    statisticsRpcMs,
    statisticsRpcP75Ms: percentile(statisticsRpcMs, 0.75),
    statisticsRpcP95Ms: percentile(statisticsRpcMs, 0.95),
    catalogSearchMs,
    catalogSearchP75Ms: percentile(catalogSearchMs, 0.75),
    catalogSearchP95Ms: percentile(catalogSearchMs, 0.95),
  };
}

const database = measureDatabase();
const periods = (["30d", "90d", "365d", "all"] satisfies StatisticsPeriod[]).map(measure);
console.log(JSON.stringify({
  fixture: { cards: cardCount, reviews: reviewCount, aggregateDays: dayKeys.length, runs },
  database,
  periods,
}, null, 2));
if (database.statisticsRpcP95Ms > 2_000) throw new Error("Der lokale Statistik-RPC überschreitet 2.000 ms p95.");
if (database.catalogSearchP95Ms > 2_000) throw new Error("Die lokale 100k-Kartensuche überschreitet 2.000 ms p95.");
if (periods.some((result) => result.p95Ms > 50)) throw new Error("Die Clientprojektion des serverseitigen Statistik-Snapshots überschreitet 50 ms p95.");
