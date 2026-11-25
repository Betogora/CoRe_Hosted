import { readFileSync } from "node:fs";
import * as v from "valibot";
import { AI_CARD_HELP_PROMPT_VERSION } from "../../src/aiCardHelpContract.ts";
import { AI_CARD_VARIANT_PROMPT_VERSION } from "../../src/aiCardVariantContract.ts";
import { AI_LEARNING_SUMMARY_PROMPT_VERSION } from "../../src/aiLearningSummaryContract.ts";
import { AI_SOURCE_CARDS_PROMPT_VERSION } from "../../src/aiSourceCardsContract.ts";

export const LEDGER_FILE = "fixtures/ai-eval/ledger.json";
/** Ergebnisse eines eingetragenen Laufs ohne Inhalte; der gepaarte Vergleich liest den Bestand von hier. */
export const resultsFile = (id: string, run: string) => `fixtures/ai-eval/results/${id}/${run}.json`;

/** `target` ist der Zielwert des Hauptwerts; `critical` nennt die Kriterien, die nie schlechter werden dürfen. */
export const REQUEST_TYPES = [
  { id: "card-variant-basic", label: "Variante Frage/Antwort", route: "/api/ai/card-variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, target: 0.95, critical: ["M2"] },
  { id: "card-variant-cloze", label: "Variante Lückentext", route: "/api/ai/card-variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, target: 0.95, critical: ["M2"] },
  { id: "card-variant-choice", label: "Variante Auswahl", route: "/api/ai/card-variant", promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, target: 0.95, critical: ["M2"] },
  { id: "card-help", label: "Lernhilfe zur Karte", route: "/api/ai/card-help", promptVersion: AI_CARD_HELP_PROMPT_VERSION, target: 0.9, critical: ["H2", "H6"] },
  { id: "source-cards", label: "Karten aus einer Quelle", route: "/api/ai/source-cards", promptVersion: AI_SOURCE_CARDS_PROMPT_VERSION, target: 0.9, critical: ["Q2"] },
  { id: "learning-summary", label: "Zusammenfassung", route: "/api/ai/summary", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, target: 0.9, critical: ["Z6"] },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const date = v.pipe(v.string(), v.isoDate());
const fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{16}$/));
const requestType = v.picklist(REQUEST_TYPES.map((type) => type.id));

const runSchema = v.strictObject({
  requestType,
  run: v.pipe(v.string(), v.regex(/^[a-z0-9.-]+$/)),
  date,
  split: v.picklist(["dev", "holdout"]),
  promptVersion: v.string(),
  candidate: v.nullable(v.string()),
  fingerprint,
  model: v.string(),
  reasoning: v.string(),
  change: v.pipe(v.string(), v.minLength(1)),
  decision: v.picklist(["baseline", "accepted", "provisional", "rejected", "holdout"]),
  cases: count,
  repetitions: count,
  main: share,
  low: share,
  high: share,
  criteria: v.record(v.string(), share),
  outcomes: v.strictObject({ answer: count, refused: count, rejected: count, timeout: count }),
  traps: v.strictObject({ answers: count, errors: count }),
  costUsd: v.pipe(v.number(), v.minValue(0)),
  costTotalUsd: v.pipe(v.number(), v.minValue(0)),
  latencyP90Ms: v.pipe(v.number(), v.minValue(0)),
  judge: v.strictObject({ model: v.pipe(v.string(), v.minLength(1)), fingerprint, entries: count, cached: count, noise: v.record(v.string(), share) }),
  /** Messgrößen je Antwort, über den Lauf gemittelt (etwa Karten je 1.000 Zeichen). */
  metrics: v.optional(v.record(v.string(), v.number())),
  /** `target` nennt das Fehlerbild (Kriterien oder Kategorien), an dem eine vorläufige Übernahme gemessen wurde. */
  comparison: v.optional(v.strictObject({ noise: share, gained: count, lost: count, target: v.optional(v.array(v.string())) })),
  /** Zwei Sätze aus den geänderten Trainingsantworten: Fehlerbild behoben, nichts Neues kaputt. */
  reason: v.optional(v.pipe(v.string(), v.minLength(1))),
  /** Sammelprüfung der vorläufigen Schritte gegen den letzten bestätigten Stand. */
  confirmation: v.optional(v.literal(true)),
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
/**
 * Die Reihe eines Anfragetyps sind seine Läufe auf dem Entscheidungsteil. `number` zählt innerhalb der Reihe; `reference`
 * ist der zuletzt gültige Bestand davor, gegen den der Lauf gemessen wurde; `confirmed` der letzte bestätigte (Baseline
 * oder übernommen ohne offene vorläufige Schritte) und `pending` die Zahl vorläufiger Schritte seitdem, beide nach dem Lauf.
 */
export type EvalSeriesEntry = { number: number; run: EvalRun; reference: EvalRun | null; confirmed: EvalRun | null; pending: number };

export function parseStrict<const Schema extends v.GenericSchema>(schema: Schema, value: unknown, source: string): v.InferOutput<Schema> {
  const parsed = v.safeParse(schema, value);
  if (parsed.success) return parsed.output;
  const issue = parsed.issues[0];
  throw new Error(`${source}: ${issue.path?.map((item) => item.key).join(".") ?? "Wurzel"}: ${issue.message}`);
}

export function parseLedger(value: unknown): EvalLedger {
  const ledger = parseStrict(ledgerSchema, value, LEDGER_FILE);
  for (const [index, run] of ledger.runs.entries()) {
    const place = `${LEDGER_FILE}: Lauf ${index + 1} (${run.requestType}, ${run.run})`;
    if (run.low > run.main || run.high < run.main) throw new Error(`${place}: Der Hauptwert liegt außerhalb seines Intervalls.`);
    const missing = REQUEST_TYPES.find((type) => type.id === run.requestType)!.critical.find((id) => !(id in run.criteria));
    if (missing) throw new Error(`${place}: Das kritische Kriterium ${missing} fehlt.`);
    if ((run.decision === "holdout") !== (run.split === "holdout")) throw new Error(`${place}: Eine Messung am Rückhalt trägt die Entscheidung holdout, und nur sie.`);
    if (run.decision === "baseline" || run.decision === "holdout" ? run.comparison : !run.comparison) throw new Error(`${place}: Nur Runden tragen einen Vergleich, eine Baseline oder Messung am Rückhalt nie.`);
  }
  for (const type of REQUEST_TYPES) {
    for (const { number, run, reference } of seriesFor(ledger, type.id)) {
      if (run.decision !== "baseline" && !reference) throw new Error(`${LEDGER_FILE}: ${type.id}, Lauf ${number}: Vor der ersten Runde fehlt eine Baseline.`);
    }
  }
  return ledger;
}

export function readLedger(file = LEDGER_FILE) {
  return parseLedger(JSON.parse(readFileSync(file, "utf8")));
}

export function seriesFor(ledger: EvalLedger, id: RequestType["id"]): EvalSeriesEntry[] {
  let best: EvalRun | null = null;
  let confirmed: EvalRun | null = null;
  let pending = 0;
  return ledger.runs.filter((run) => run.requestType === id && run.split === "dev").map((run, index) => {
    const reference = run.confirmation ? confirmed : best;
    if (run.decision === "provisional") { best = run; pending++; }
    else if (run.decision === "baseline" || run.decision === "accepted") { best = confirmed = run; pending = 0; }
    else if (run.confirmation) { best = confirmed; pending = 0; }
    return { number: index + 1, run, reference, confirmed, pending };
  });
}

export function bestRun(ledger: EvalLedger, id: RequestType["id"]) {
  const last = seriesFor(ledger, id).at(-1);
  if (!last) return null;
  if (last.run.decision !== "rejected") return last.run;
  return last.run.confirmation ? last.confirmed : last.reference;
}

/** Letzter bestätigter Stand und offene vorläufige Schritte seitdem. */
export function confirmationState(ledger: EvalLedger, id: RequestType["id"]) {
  const last = seriesFor(ledger, id).at(-1);
  return { confirmed: last?.confirmed ?? null, pending: last?.pending ?? 0 };
}

/** Die letzte Messung am Rückhalt mit Promptversion, Modell und Reasoning des Laufs; der Fingerabdruck hängt an den Fällen des Teils. */
export function holdoutFor(ledger: EvalLedger, run: EvalRun) {
  return ledger.runs.filter((other) => other.requestType === run.requestType && other.decision === "holdout"
    && other.promptVersion === run.promptVersion && other.model === run.model && other.reasoning === run.reasoning).at(-1) ?? null;
}

export function latestCalibration(ledger: EvalLedger, id: RequestType["id"]) {
  return ledger.calibrations.filter((calibration) => calibration.requestType === id).at(-1) ?? null;
}
