import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TSX_CLI_PATH = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const MODULE_TEST_ROOTS = ["src"] as const;
const CATEGORIES = ["unit", "contract", "integration"] as const;
type TestCategory = (typeof CATEGORIES)[number];

const CONTRACT_TESTS = new Set([
  "src/aiCardVariantRoute.test.ts",
  "src/apkgFormatMatrix.test.ts",
  "src/apkgImport.test.ts",
  "src/apkgNoteTranslation.test.ts",
  "src/appNavigation.test.ts",
  "src/appRuntime.test.ts",
  "src/buildChunkBudget.test.ts",
  "src/cloudAuth.test.ts",
  "src/cloudMediaStore.test.ts",
  "src/creationWorkflow.test.ts",
  "src/localE2EEnvironment.test.ts",
]);

const INTEGRATION_TESTS = new Set([
  "src/cloudRepository.test.ts",
  "src/coreWorkspace.test.ts",
  "src/indexedDbCoreRepository.test.ts",
  "src/mediaStore.test.ts",
  "src/syncEngine.test.ts",
  "src/workspaceHydrationService.test.ts",
]);

function collectTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(entryPath);
    return /\.test\.(?:ts|tsx)$/.test(entry.name) ? [entryPath.replaceAll("\\", "/")] : [];
  });
}

function categoryFor(filePath: string): TestCategory {
  if (INTEGRATION_TESTS.has(filePath)) return "integration";
  if (filePath.startsWith("src/screens/") || CONTRACT_TESTS.has(filePath)) return "contract";
  return "unit";
}

export function moduleTestsFor(categories: readonly TestCategory[]) {
  const requested = new Set(categories);
  const files = MODULE_TEST_ROOTS.flatMap(collectTests).sort();
  for (const configured of [...CONTRACT_TESTS, ...INTEGRATION_TESTS]) {
    if (!files.includes(configured)) throw new Error(`Konfigurierter Test fehlt: ${configured}`);
  }
  return files.filter((filePath) => requested.has(categoryFor(filePath)));
}

/** Verteilt die Dateien reihum auf Shards; jeder Shard lädt tsx nur einmal statt einmal je Datei. */
function shardTests(files: readonly string[], shardCount: number) {
  const shards = Array.from({ length: Math.min(shardCount, files.length) }, () => [] as string[]);
  files.forEach((file, index) => shards[index % shards.length].push(file));
  return shards;
}

function runShard(files: readonly string[], compact: boolean) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [
      TSX_CLI_PATH,
      "--test",
      "--test-isolation=none",
      ...(compact ? ["--test-reporter=dot"] : []),
      ...files,
    ], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

export async function runModuleTests(categories: readonly TestCategory[], { compact = false } = {}) {
  if (categories.length === 0 || categories.some((category) => !CATEGORIES.includes(category))) {
    throw new Error(`Testkategorie fehlt oder ist ungültig. Erlaubt: ${CATEGORIES.join(", ")}.`);
  }
  const files = moduleTestsFor(categories);
  const shards = shardTests(files, availableParallelism());
  console.log(`Geschützte Testkategorien: ${categories.join(", ")} (${files.length} Dateien in ${shards.length} Prozessen)`);
  const failures: string[] = [];
  await Promise.all(shards.map(async (shard, index) => {
    const { code, signal, output } = await runShard(shard, compact);
    process.stdout.write(output);
    if (code !== 0) failures.push(`Prozess ${index + 1}/${shards.length} (${signal ?? `Exit ${code}`})`);
  }));
  if (failures.length) throw new Error(`Modultests sind fehlgeschlagen: ${failures.join(", ")}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const arguments_ = process.argv.slice(2);
    await runModuleTests(
      arguments_.filter((argument) => argument !== "--compact") as TestCategory[],
      { compact: arguments_.includes("--compact") },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
