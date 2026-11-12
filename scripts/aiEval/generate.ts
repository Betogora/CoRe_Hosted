import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { HttpError, requestOpenRouter, type ProviderTexts } from "../../server/aiRoute.ts";
import { OUTPUT_ROOT, readJson, writeJson, type EvalCase } from "./cases.ts";
import type { EvalDefinition } from "./definitions.ts";
import { REQUEST_TYPES } from "./ledger.ts";

export const runDirectory = (id: string, run: string) => `${OUTPUT_ROOT}/${id}/${run}`;

export type RunMeta = { requestType: string; promptVersion: string; model: string; reasoning: string; repetitions: number; split: "train" | "test" | "all"; dry: boolean; date: string };

/** Eine Antwort des Modells auf einen Fall; `ok` ist falsch, wenn die Antwortprüfung der Route sie ablehnt. */
export type AnswerRow = {
  caseId: string;
  repetition: number;
  ok: boolean;
  error: string | null;
  output: unknown;
  model: string | null;
  totalTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  transcript: { request: unknown; response: unknown };
};

/** Ablehnungen durch die Antwortprüfung zählen als Antwort des Modells; alles andere ist Infrastruktur und wird wiederholt. */
const CONTRACT_FAILURES = new Set(["invalid_provider_response", "invalid_tool_call", "invalid_variant", "unchanged_front"]);
const FATAL = new Set(["provider_budget_exhausted", "openrouter_auth_failed", "no_provider_endpoint", "provider_request_rejected"]);
const TEXTS: ProviderTexts = { rateLimited: "Ratenlimit erreicht.", unavailable: "Schlüssel oder Limit des Eval-Schlüssels prüfen.", rejected: "OpenRouter hat die Anfrage abgelehnt.", failed: "Anbieterfehler.", invalid: "Ungültige Antwort.", tool: "Werkzeug falsch verwendet.", fields: "Ungültige Felder." };

export function readAnswers(directory: string): AnswerRow[] {
  const file = path.join(directory, "answers.jsonl");
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as AnswerRow) : [];
}

export function readMeta(directory: string): RunMeta {
  const file = path.join(directory, "run.json");
  if (!existsSync(file)) throw new Error(`${file} fehlt. Der Lauf wurde noch nicht erzeugt.`);
  return readJson(file) as RunMeta;
}

/** Antwort im Format von OpenRouter mit genau einem Werkzeugaufruf; für Trockenlauf und Tests. */
export function mockCompletion(tool: string, toolArguments: unknown) {
  return { model: "mock", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: tool, arguments: JSON.stringify(toolArguments) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0 } };
}

/**
 * Erzeugt je Fall und Wiederholung eine Antwort über Payload-Builder und Antwortprüfung der Route.
 * Vorhandene Zeilen bleiben; ein abgebrochener Lauf setzt dort fort. Gibt die Zahl der offenen Antworten zurück.
 */
export async function generate({ definition, cases, repetitions, split, directory, apiKey, fetchImpl = globalThis.fetch, dry = false, concurrency = 4, log = console.log }: {
  definition: EvalDefinition;
  cases: readonly EvalCase[];
  repetitions: number;
  split: RunMeta["split"];
  directory: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  dry?: boolean;
  concurrency?: number;
  log?: (line: string) => void;
}) {
  if (!cases.length) throw new Error("Keine Fälle für diesen Lauf.");
  const sample = definition.buildPayload(cases[0].request);
  const meta: RunMeta = {
    requestType: definition.id, promptVersion: REQUEST_TYPES.find((type) => type.id === definition.id)!.promptVersion,
    model: sample.model, reasoning: sample.reasoning.effort, repetitions, split, dry, date: new Date().toISOString().slice(0, 10),
  };
  mkdirSync(directory, { recursive: true });
  if (existsSync(path.join(directory, "run.json"))) {
    const existing = readMeta(directory);
    for (const key of ["promptVersion", "model", "reasoning", "repetitions", "split", "dry"] as const) {
      if (existing[key] !== meta[key]) throw new Error(`Der Lauf in ${directory} wurde mit ${key} = ${existing[key]} begonnen, jetzt gilt ${meta[key]}. Einen neuen Laufnamen wählen.`);
    }
  } else writeJson(path.join(directory, "run.json"), meta);

  const done = new Set(readAnswers(directory).map((row) => `${row.caseId}#${row.repetition}`));
  const open = cases.flatMap((entry) => Array.from({ length: repetitions }, (_, repetition) => ({ entry, repetition }))).filter(({ entry, repetition }) => !done.has(`${entry.id}#${repetition}`));
  let failed = 0;
  const stop: { error: HttpError | null } = { error: null };
  let next = 0;
  async function worker() {
    while (next < open.length && !stop.error) {
      const { entry, repetition } = open[next++];
      const request = definition.buildPayload(entry.request);
      const startedAt = Date.now();
      let response: unknown = null;
      let row: Omit<AnswerRow, "caseId" | "repetition" | "latencyMs" | "transcript">;
      try {
        const mock = dry ? definition.mock(entry.request) : null;
        response = mock ? mockCompletion(mock.tool, mock.arguments) : await requestOpenRouter(fetchImpl, apiKey, request, AbortSignal.timeout(definition.deadlineMs), TEXTS);
        const generated = definition.extract(response, entry.request);
        row = { ok: true, error: null, ...generated };
      } catch (error) {
        const code = error instanceof HttpError ? error.code : null;
        if (!code || !CONTRACT_FAILURES.has(code)) {
          failed++;
          if (error instanceof HttpError && FATAL.has(error.code)) stop.error = error;
          log(`${entry.id}#${repetition}: ${code ?? (error instanceof Error ? error.message : String(error))}`);
          continue;
        }
        row = { ok: false, error: code, output: null, model: null, totalTokens: null, costUsd: null };
      }
      const answer: AnswerRow = { caseId: entry.id, repetition, ...row, latencyMs: Date.now() - startedAt, transcript: { request, response } };
      appendFileSync(path.join(directory, "answers.jsonl"), `${JSON.stringify(answer)}\n`, "utf8");
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, open.length) }, worker));
  if (stop.error) throw new Error(`Abgebrochen: ${stop.error.code}. ${stop.error.message}`);
  log(`${open.length - failed} Antworten erzeugt, ${done.size} waren vorhanden, ${failed} offen.`);
  return failed;
}
