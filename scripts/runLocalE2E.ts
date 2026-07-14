import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createLocalE2ERuntimeEnvironment,
  createLocalPrivilegedTestEnvironment,
  parseSupabaseStatusEnvironment,
  provisionLocalE2EAccounts,
} from "./localE2EEnvironment.ts";
import { synchronizeDatabaseTypes } from "./databaseTypes.ts";

const SUPABASE_CLI_PATH = path.join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
const PLAYWRIGHT_CLI_PATH = path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
const TSX_CLI_PATH = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const AI_JOB_RLS_TEST_NAME = "ai-job-ledger-smoke.test.ts";
const ALL_RLS_TEST_PATHS = readdirSync(path.join(process.cwd(), "tests", "rls"))
  .filter((fileName) => fileName.endsWith(".test.ts"))
  .sort()
  .map((fileName) => path.join(process.cwd(), "tests", "rls", fileName));
const AI_JOB_RLS_TEST_PATH = ALL_RLS_TEST_PATHS.find((filePath) => path.basename(filePath) === AI_JOB_RLS_TEST_NAME);
const RLS_TEST_PATHS = ALL_RLS_TEST_PATHS.filter((filePath) => path.basename(filePath) !== AI_JOB_RLS_TEST_NAME);

interface CommandOptions {
  capture?: boolean;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function runSupabase(args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return runCommand(process.execPath, [SUPABASE_CLI_PATH, ...args], options);
}

function runCommand(command: string, args: readonly string[], { capture = false, env = process.env, timeoutMs = 0 }: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs)
      : null;

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} hat nach ${timeoutMs} ms nicht geantwortet.`));
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = capture ? `\n${stderr || stdout}`.trimEnd() : "";
      reject(new Error(`${command} ${args.join(" ")} ist fehlgeschlagen (${signal ?? `Exit ${code}`}).${detail}`));
    });
  });
}

async function stopLocalSupabase() {
  try {
    await runSupabase(["stop"], { timeoutMs: 60_000 });
  } catch (error) {
    console.error(`Lokaler Supabase-Stack konnte nicht automatisch gestoppt werden: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runLocalE2E(playwrightArguments: string[] = []) {
  const rlsOnly = playwrightArguments.includes("--rls-only");
  const forwardedPlaywrightArguments = playwrightArguments.filter((argument) => argument !== "--rls-only");

  try {
    await runCommand("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true, timeoutMs: 5_000 });
  } catch {
    throw new Error("Docker Desktop läuft nicht. Starte Docker Desktop und führe den Befehl danach erneut aus.");
  }

  let supabaseStartAttempted = false;
  try {
    console.log("Lokalen Supabase-Stack starten …");
    supabaseStartAttempted = true;
    await runSupabase([
      "start",
      "--exclude",
      "edge-runtime,imgproxy,logflare,postgres-meta,realtime,studio,supavisor,vector",
    ], { capture: true });
    console.log("Ausstehende lokale Migrationen anwenden …");
    await runSupabase(["migration", "up", "--local"]);

    console.log("Versionierte Supabase-Datenbanktypen prüfen …");
    await synchronizeDatabaseTypes({ mode: "check" });

    const { stdout } = await runSupabase(["status", "--output-format", "json"], {
      capture: true,
    });
    const statusEnvironment = parseSupabaseStatusEnvironment(stdout);
    const testEnvironment = createLocalE2ERuntimeEnvironment(statusEnvironment, process.env);
    const privilegedTestEnvironment = createLocalPrivilegedTestEnvironment(statusEnvironment, process.env);

    console.log("Bestätigte lokale Auth-/RLS-Testaccounts provisionieren …");
    await provisionLocalE2EAccounts(privilegedTestEnvironment);

    console.log("Supabase-Schema, RLS-Policies und Foreign Keys prüfen …");
    await runSupabase(["db", "query", "--local", "--file", "supabase/verify_schema_v1.sql"], {
      capture: true,
    });

    console.log("Nutzer-A/Nutzer-B/anon-Smoke gegen die lokale Data API ausführen …");
    await runCommand(process.execPath, [TSX_CLI_PATH, "--test", "--test-concurrency=1", ...RLS_TEST_PATHS], {
      env: testEnvironment,
    });

    if (!AI_JOB_RLS_TEST_PATH) throw new Error(`Der RLS-Smoke ${AI_JOB_RLS_TEST_NAME} fehlt.`);
    console.log("Serverautoritativen KI-Job-Ledger separat mit lokalem Secret prüfen …");
    await runCommand(process.execPath, [TSX_CLI_PATH, "--test", "--test-concurrency=1", AI_JOB_RLS_TEST_PATH], {
      env: createLocalPrivilegedTestEnvironment(statusEnvironment, process.env),
    });

    if (!rlsOnly) {
      console.log("Playwright gegen lokales Supabase ausführen …");
      await runCommand(process.execPath, [PLAYWRIGHT_CLI_PATH, "test", ...forwardedPlaywrightArguments], {
        env: testEnvironment,
      });
    }
  } finally {
    if (supabaseStartAttempted) {
      console.log("Lokalen Supabase-Stack stoppen …");
      await stopLocalSupabase();
    }
  }
}

async function main() {
  try {
    await runLocalE2E(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
