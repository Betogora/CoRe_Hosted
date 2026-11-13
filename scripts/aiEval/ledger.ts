import { readFileSync } from "node:fs";
import * as v from "valibot";
import { AI_CARD_HELP_PROMPT_VERSION } from "../../src/aiCardHelpContract.ts";
import { AI_CARD_VARIANT_PROMPT_VERSION } from "../../src/aiCardVariantContract.ts";
import { AI_LEARNING_SUMMARY_PROMPT_VERSION } from "../../src/aiLearningSummaryContract.ts";

export const LEDGER_FILE = "fixtures/ai-eval/ledger.json";

/** Ein Eintrag je KI-Prompt im Code; `target` ist der Zielwert des Hauptwerts, `critical` nennt die Kriterien, die nie schlechter werden dürfen. */
export const REQUEST_TYPES = [
  { id: "card-variant-basic", label: "Variante Frage/Antwort", route: "/api/ai/card-variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, target: 0.95, critical: ["M2"] },
  { id: "card-variant-cloze", label: "Variante Lückentext", route: "/api/ai/card-variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, target: 0.95, critical: ["M2"] },
  { id: "card-help", label: "Lernhilfe zur Karte", route: "/api/ai/card-help", promptVersion: AI_CARD_HELP_PROMPT_VERSION, target: 0.9, critical: ["H2", "H6"] },
  { id: "learning-summary", label: "Zusammenfassung", route: "/api/ai/summary", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, target: null, critical: [] },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const date = v.pipe(v.string(), v.isoDate());
const requestType = v.picklist(REQUEST_TYPES.map((type) => type.id));

const runSchema = v.strictObject({
  requestType,
  run: v.pipe(v.string(), v.regex(/^[a-z0-9.-]+$/)),
  date,
  promptVersion: v.string(),
  model: v.string(),
  reasoning: v.string(),
  change: v.pipe(v.string(), v.minLength(1)),
  decision: v.picklist(["baseline", "accepted", "rejected"]),
  cases: count,
  repetitions: count,
  main: share,
  low: share,
  high: share,
  criteria: v.record(v.string(), share),
  costUsd: v.pipe(v.number(), v.minValue(0)),
  latencyP90Ms: v.pipe(v.number(), v.minValue(0)),
  comparison: v.optional(v.strictObject({ noise: share, gained: count, lost: count })),
});

const calibrationSchema = v.strictObject({
  requestType,
  date,
  judge: v.string(),
  entries: count,
  agreement: share,
  falsePasses: count,
});

const ledgerSchema = v.strictObject({ runs: v.array(runSchema), calibrations: v.array(calibrationSchema) });

export type EvalRun = v.InferOutput<typeof runSchema>;
export type EvalCalibration = v.InferOutput<typeof calibrationSchema>;
export type EvalLedger = v.InferOutput<typeof ledgerSchema>;
/** Ein Lauf mit seiner Nummer im Anfragetyp und dem Bestand, gegen den er gemessen wurde. */
export type EvalSeriesEntry = { number: number; run: EvalRun; reference: EvalRun | null };

/** Prüft einen unbekannten Wert gegen ein Schema; die Meldung nennt Quelle und Pfad des ersten Fehlers. */
export function parseStrict<const Schema extends v.GenericSchema>(schema: Schema, value: unknown, source: string): v.InferOutput<Schema> {
  const parsed = v.safeParse(schema, value);
  if (parsed.success) return parsed.output;
  const issue = parsed.issues[0];
  throw new Error(`${source}: ${issue.path?.map((item) => item.key).join(".") ?? "Wurzel"}: ${issue.message}`);
}

/** Prüft Form und Reihenfolge: Jede Reihe beginnt mit einer Baseline, nur Runden tragen einen Vergleich. */
export function parseLedger(value: unknown): EvalLedger {
  const ledger = parseStrict(ledgerSchema, value, LEDGER_FILE);
  for (const type of REQUEST_TYPES) {
    for (const { number, run, reference } of seriesFor(ledger, type.id)) {
      const place = `${LEDGER_FILE}: ${type.id}, Lauf ${number}`;
      if (run.low > run.main || run.high < run.main) throw new Error(`${place}: Der Hauptwert liegt außerhalb seines Intervalls.`);
      const missing = type.critical.find((id) => !(id in run.criteria));
      if (missing) throw new Error(`${place}: Das kritische Kriterium ${missing} fehlt.`);
      if (run.decision === "baseline" ? run.comparison : !run.comparison) throw new Error(`${place}: Nur Runden tragen einen Vergleich, eine Baseline nie.`);
      if (run.decision !== "baseline" && !reference) throw new Error(`${place}: Vor der ersten Runde fehlt eine Baseline.`);
    }
  }
  return ledger;
}

export function readLedger(file = LEDGER_FILE) {
  return parseLedger(JSON.parse(readFileSync(file, "utf8")));
}

/** Läufe eines Anfragetyps in Ledger-Reihenfolge; `reference` ist der zuletzt gültige Bestand davor. */
export function seriesFor(ledger: EvalLedger, id: RequestType["id"]): EvalSeriesEntry[] {
  let best: EvalRun | null = null;
  return ledger.runs.filter((run) => run.requestType === id).map((run, index) => {
    const entry = { number: index + 1, run, reference: best };
    if (run.decision !== "rejected") best = run;
    return entry;
  });
}

/** Der gültige Bestand: die letzte Baseline oder übernommene Runde. */
export function bestRun(ledger: EvalLedger, id: RequestType["id"]) {
  return seriesFor(ledger, id).filter(({ run }) => run.decision !== "rejected").at(-1)?.run ?? null;
}

export function latestCalibration(ledger: EvalLedger, id: RequestType["id"]) {
  return ledger.calibrations.filter((calibration) => calibration.requestType === id).at(-1) ?? null;
}
