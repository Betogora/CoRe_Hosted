import { APP_RUNTIME_INFO } from "./appRuntime.ts";
import { FIELD_TIMING_METRICS, type FieldTimingMetric, type FieldTimingSamples } from "./fieldTimings.ts";

/** German names in the copied text; the stored keys stay technical. */
const FIELD_TIMING_LABELS: Readonly<Record<FieldTimingMetric, string>> = {
  "core:answer_shown": "Antwort anzeigen",
  "core:rating_to_next_card": "Bewertung bis nächste Karte",
  "core:card_search_results": "Suche in der Kartenverwaltung",
  "core:session_check": "Sitzung prüfen",
  "core:local_workspace_start": "Lokalen Arbeitsbereich starten",
  "core:cloud_bootstrap_after_start": "Cloud-Stand nach Start laden",
  "core:cloud_sync_after_start": "Synchronisation nach Start",
  "core:indexeddb_open": "Lokale Datenbank öffnen",
  "core:indexeddb_shell": "Lokale Stapel lesen",
  "core:indexeddb_startup_metadata": "Lokale Startdaten lesen",
  "core:first_deck_summaries": "Erste Stapelzahlen",
  "core:bootstrap_rpc": "Cloud-Stand abrufen",
  "core:bootstrap_apply": "Cloud-Stand übernehmen",
};

/** Coarse device and catalog facts copied below the values; nothing that names a person, a card or a moment. */
export interface FieldTimingContext {
  version: string;
  cores?: number;
  memoryGb?: number;
  pointer?: "coarse" | "fine" | "none";
  cardCount?: number;
}

/** Count, median and p95 (nearest rank) in whole milliseconds. */
export function summarizeDurations(durations: readonly number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return null;
  const middle = Math.floor(count / 2);
  const median = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count, median: Math.round(median), p95: sorted[Math.ceil(0.95 * count) - 1] };
}

const bucket = (value: number | undefined, steps: ReadonlyArray<readonly [number, string]>, last: string) =>
  value === undefined || !Number.isFinite(value) ? "unbekannt" : steps.find(([limit]) => value < limit)?.[1] ?? last;

const isoDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** The text the learner pastes into a message: one line per measured metric, then the context. */
export function formatFieldTimingsReport(samples: FieldTimingSamples, context: FieldTimingContext): string {
  const lines = ["CoRe-Leistungsdaten"];
  const days: number[] = [];
  for (const metric of FIELD_TIMING_METRICS) {
    const values = samples[metric] ?? [];
    const summary = summarizeDurations(values.map(([durationMs]) => durationMs));
    if (!summary) continue;
    days.push(...values.map(([, day]) => day));
    lines.push(`${FIELD_TIMING_LABELS[metric]}: ${summary.count} ${summary.count === 1 ? "Wert" : "Werte"}, Median ${summary.median} ms, p95 ${summary.p95} ms`);
  }
  const first = days.length ? isoDay(Math.min(...days)) : "";
  const last = days.length ? isoDay(Math.max(...days)) : "";
  lines.push(
    "",
    `Version: ${context.version}`,
    `Zeitraum: ${first === last ? first || "keiner" : `${first} bis ${last}`}`,
    `Prozessorkerne: ${bucket(context.cores, [[3, "1–2"], [5, "3–4"], [9, "5–8"]], "9 oder mehr")}`,
    `Arbeitsspeicher: ${bucket(context.memoryGb, [[2, "unter 2 GB"], [4, "2 GB"], [8, "4 GB"]], "8 GB oder mehr")}`,
    `Zeiger: ${context.pointer === "coarse" ? "Touch" : context.pointer === "fine" ? "Maus" : context.pointer === "none" ? "keiner" : "unbekannt"}`,
    `Katalog: ${bucket(context.cardCount, [[1_000, "unter 1.000 Karten"], [10_000, "1.000–9.999 Karten"], [50_000, "10.000–49.999 Karten"]], "50.000 Karten oder mehr")}`,
  );
  return lines.join("\n");
}

/** Reads the device facts in the browser; the card count comes from the account's deck summaries. */
export function readFieldTimingContext(deckSummaries: ReadonlyMap<string, { inventory: { totalCards: number } }> | undefined): FieldTimingContext {
  const media = (query: string) => typeof matchMedia === "function" && matchMedia(query).matches;
  const device = typeof navigator === "undefined" ? undefined : navigator as Navigator & { deviceMemory?: number };
  return {
    version: APP_RUNTIME_INFO.version,
    cores: device?.hardwareConcurrency,
    memoryGb: device?.deviceMemory,
    pointer: media("(pointer: coarse)") ? "coarse" : media("(pointer: fine)") ? "fine" : media("(pointer: none)") ? "none" : undefined,
    cardCount: deckSummaries ? [...deckSummaries.values()].reduce((total, summary) => total + summary.inventory.totalCards, 0) : undefined,
  };
}
