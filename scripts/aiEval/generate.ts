import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { HttpError, readBilling, requestOpenRouter, type ProviderTexts } from "../../server/aiRoute.ts";
import { outputRoot, readJson, writeJson, type EvalCase, type Split } from "./cases.ts";
import type { EvalDefinition } from "./definitions.ts";
import { REQUEST_TYPES } from "./ledger.ts";

export const runDirectory = (id: string, run: string) => `${outputRoot()}/${id}/${run}`;

export type RunMeta = { requestType: string; promptVersion: string; model: string; reasoning: string; fingerprint: string; repetitions: number; split: Split | "all"; dry: boolean; date: string };

/**
 * `answer`: die Route nimmt die Antwort an. `refused`: das Modell meldet den Fall mit dem Ablehnungscode der Definition
 * als ungeeignet. `rejected`: die Antwortprüfung der Route verwirft die Antwort (`error` nennt den Code). `timeout`: die
 * Frist der Route ist abgelaufen.
 */
export type Outcome = "answer" | "refused" | "rejected" | "timeout";

export type AnswerRow = {
  caseId: string;
  repetition: number;
  outcome: Outcome;
  error: string | null;
  /** `null` außer bei `answer`. */
  output: unknown;
  model: string | null;
  totalTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  transcript: { request: unknown; response: unknown };
};

const RETRYABLE = new Set(["rate_limited", "provider_unavailable", "provider_error"]);
const FATAL = new Set(["provider_budget_exhausted", "openrouter_auth_failed", "no_provider_endpoint", "provider_request_rejected"]);
const ATTEMPTS = 5;
const TEXTS: ProviderTexts = { rateLimited: "Ratenlimit erreicht.", unavailable: "Schlüssel oder Limit prüfen.", rejected: "OpenRouter hat die Anfrage abgelehnt.", failed: "Anbieterfehler.", invalid: "Ungültige Antwort.", tool: "Werkzeug falsch verwendet.", fields: "Ungültige Felder." };

export function readAnswers(directory: string): AnswerRow[] {
  const file = path.join(directory, "answers.jsonl");
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as AnswerRow) : [];
}

export function readMeta(directory: string): RunMeta {
  const file = path.join(directory, "run.json");
  if (!existsSync(file)) throw new Error(`${file} fehlt. Der Lauf wurde noch nicht erzeugt.`);
  return readJson(file) as RunMeta;
}

export function mockCompletion(tool: string, toolArguments: unknown) {
  return { model: "mock", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: tool, arguments: JSON.stringify(toolArguments) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0 } };
}

/** Hash über alle verschiedenen Payloads der Fälle ohne Nutzernachricht: Prompt, Werkzeugschema, Grenzen, Modell, Reasoning. */
export function payloadFingerprint(definition: EvalDefinition, cases: readonly EvalCase[]) {
  const shapes = new Set(cases.map((entry) => {
    const payload = definition.buildPayload(entry.request) as { messages?: { role: string }[] };
    return JSON.stringify({ ...payload, messages: payload.messages?.filter((message) => message.role !== "user") });
  }));
  return createHash("sha256").update([...shapes].sort().join("\n")).digest("hex").slice(0, 16);
}

const errorCode = (error: unknown) => error !== null && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null;

/**
 * Vorhandene Zeilen bleiben; ein abgebrochener Lauf setzt dort fort. Ratenlimit und Anbieterfehler werden mit wachsender
 * Wartezeit wiederholt; was danach scheitert, bleibt offen. Gibt die Zahl der offenen Antworten zurück.
 */
export async function generate({ definition, cases, repetitions, split, directory, apiKey, fetchImpl = globalThis.fetch, dry = false, concurrency = 4, budgetUsd = 1, retryDelayMs = 2000, log = console.log }: {
  definition: EvalDefinition;
  cases: readonly EvalCase[];
  repetitions: number;
  split: RunMeta["split"];
  directory: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  dry?: boolean;
  concurrency?: number;
  budgetUsd?: number;
  retryDelayMs?: number;
  log?: (line: string) => void;
}) {
  if (!cases.length) throw new Error("Keine Fälle für diesen Lauf.");
  const sample = definition.buildPayload(cases[0].request);
  const meta: RunMeta = {
    requestType: definition.id, promptVersion: REQUEST_TYPES.find((type) => type.id === definition.id)!.promptVersion,
    model: sample.model, reasoning: sample.reasoning.effort, fingerprint: payloadFingerprint(definition, cases), repetitions, split, dry, date: new Date().toISOString().slice(0, 10),
  };
  mkdirSync(directory, { recursive: true });
  if (existsSync(path.join(directory, "run.json"))) {
    const existing = readMeta(directory);
    for (const key of ["fingerprint", "repetitions", "split", "dry"] as const) {
      if (existing[key] !== meta[key]) throw new Error(`Der Lauf in ${directory} wurde mit ${key} = ${existing[key]} begonnen, jetzt gilt ${meta[key]}. Einen neuen Laufnamen wählen.`);
    }
  } else writeJson(path.join(directory, "run.json"), meta);

  const existing = readAnswers(directory);
  const done = new Set(existing.map((row) => `${row.caseId}#${row.repetition}`));
  let spent = existing.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const open = cases.flatMap((entry) => Array.from({ length: repetitions }, (_, repetition) => ({ entry, repetition }))).filter(({ entry, repetition }) => !done.has(`${entry.id}#${repetition}`));
  let written = 0;
  const stop: { reason: string | null } = { reason: null };
  let next = 0;

  /** `timing.startedAt` gilt für den letzten Versuch, damit Wartezeiten nicht in die Latenz eingehen. */
  async function request(payload: unknown, entry: EvalCase, timing: { startedAt: number }) {
    for (let attempt = 1; ; attempt++) {
      timing.startedAt = Date.now();
      try {
        const mock = dry ? definition.mock(entry.request) : null;
        return mock ? mockCompletion(mock.tool, mock.arguments) : await requestOpenRouter(fetchImpl, apiKey, payload, AbortSignal.timeout(definition.deadlineMs), TEXTS);
      } catch (error) {
        if (!(error instanceof HttpError && RETRYABLE.has(error.code)) || attempt === ATTEMPTS) throw error;
        await sleep(retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  async function worker() {
    while (next < open.length && !stop.reason) {
      if (spent >= budgetUsd) { stop.reason = `Budget von ${budgetUsd} USD erreicht (${spent.toFixed(4)} USD im Lauf). Mit höherem --budget fortsetzen.`; break; }
      const { entry, repetition } = open[next++];
      const payload = definition.buildPayload(entry.request);
      const timing = { startedAt: Date.now() };
      let response: unknown = null;
      let delivered = false;
      let row: Omit<AnswerRow, "caseId" | "repetition" | "latencyMs" | "transcript">;
      try {
        response = await request(payload, entry, timing);
        delivered = true;
        row = { outcome: "answer", error: null, ...definition.extract(response, entry.request) };
      } catch (error) {
        const code = errorCode(error);
        if (code === "provider_timeout") row = { outcome: "timeout", error: code, output: null, model: null, totalTokens: null, costUsd: null };
        else if (!delivered) {
          if (code && FATAL.has(code)) stop.reason = `${code}. ${(error as Error).message}`;
          log(`${entry.id}#${repetition}: ${code ?? (error instanceof Error ? error.message : String(error))}`);
          continue;
        } else if (!code) throw error;
        else row = { outcome: code === definition.refusal?.code ? "refused" : "rejected", error: code, output: null, ...readBilling(response) };
      }
      spent += row.costUsd ?? 0;
      const answer: AnswerRow = { caseId: entry.id, repetition, ...row, latencyMs: Date.now() - timing.startedAt, transcript: { request: payload, response } };
      appendFileSync(path.join(directory, "answers.jsonl"), `${JSON.stringify(answer)}\n`, "utf8");
      written++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, open.length) }, worker));
  log(`${written} Antworten erzeugt, ${done.size} waren vorhanden, ${open.length - written} offen; ${spent.toFixed(4)} USD im Lauf.`);
  if (stop.reason) throw new Error(`Angehalten: ${stop.reason}`);
  return open.length - written;
}
