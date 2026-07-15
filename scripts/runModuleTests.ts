import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TSX_CLI_PATH = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const MODULE_TEST_ROOTS = ["src", "api"] as const;
const CATEGORIES = ["unit", "contract", "integration"] as const;
type TestCategory = (typeof CATEGORIES)[number];

const CONTRACT_TESTS = new Set([
  "src/aiChatContract.test.ts",
  "src/aiChatRoute.test.ts",
  "src/apkgArchiveSecurity.test.ts",
  "src/apkgImport.test.ts",
  "src/appNavigation.test.ts",
  "src/appRuntime.test.ts",
  "src/buildChunkBudget.test.ts",
  "src/cloudAuth.test.ts",
  "src/cloudMediaStore.test.ts",
  "src/coreTypes.test.ts",
  "src/creationWorkflow.test.ts",
  "src/dataPortability.test.ts",
  "src/localE2EEnvironment.test.ts",
  "src/normalizedImport.test.ts",
  "src/productSurfaces.test.ts",
]);

const INTEGRATION_TESTS = new Set([
  "src/cloudRepository.test.ts",
  "src/coreWorkspace.test.ts",
  "src/fsrsVariantFlow.test.ts",
  "src/mediaStore.test.ts",
  "src/syncEngine.test.ts",
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
  if (filePath.startsWith("api/") || filePath.startsWith("src/screens/") || CONTRACT_TESTS.has(filePath)) return "contract";
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

export async function runModuleTests(categories: readonly TestCategory[]) {
  if (categories.length === 0 || categories.some((category) => !CATEGORIES.includes(category))) {
    throw new Error(`Testkategorie fehlt oder ist ungültig. Erlaubt: ${CATEGORIES.join(", ")}.`);
  }
  const files = moduleTestsFor(categories);
  console.log(`Geschützte Testkategorien: ${categories.join(", ")} (${files.length} Dateien)`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI_PATH, "--test", ...files], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Modultests sind fehlgeschlagen (${signal ?? `Exit ${code}`}).`));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runModuleTests(process.argv.slice(2) as TestCategory[]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
