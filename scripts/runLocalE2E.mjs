import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createLocalE2ERuntimeEnvironment,
  parseSupabaseStatusEnvironment,
} from "./localE2EEnvironment.mjs";

const SUPABASE_CLI_PATH = path.join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
const PLAYWRIGHT_CLI_PATH = path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
const RLS_TEST_PATH = path.join(process.cwd(), "tests", "rls", "ownership-smoke.test.js");

function runSupabase(args, options) {
  return runCommand(process.execPath, [SUPABASE_CLI_PATH, ...args], options);
}

function runCommand(command, args, { capture = false, env = process.env, timeoutMs = 0 } = {}) {
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
    console.error(`Lokaler Supabase-Stack konnte nicht automatisch gestoppt werden: ${error.message}`);
  }
}

export async function runLocalE2E(playwrightArguments = []) {
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
      "edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,studio,supavisor,vector",
    ], { capture: true });
    console.log("Ausstehende lokale Migrationen anwenden …");
    await runSupabase(["migration", "up", "--local"]);

    const { stdout } = await runSupabase(["status", "--output-format", "json"], {
      capture: true,
    });
    const statusEnvironment = parseSupabaseStatusEnvironment(stdout);
    const testEnvironment = createLocalE2ERuntimeEnvironment(statusEnvironment, process.env);

    console.log("Supabase-Schema, RLS-Policies und Foreign Keys prüfen …");
    await runSupabase(["db", "query", "--local", "--file", "supabase/verify_schema_v1.sql"], {
      capture: true,
    });

    console.log("Nutzer-A/Nutzer-B/anon-Smoke gegen die lokale Data API ausführen …");
    await runCommand(process.execPath, ["--test", RLS_TEST_PATH], {
      env: testEnvironment,
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
