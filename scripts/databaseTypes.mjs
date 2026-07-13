import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const generatedTypesPath = path.join(projectRoot, "src", "database.types.ts");
const supabaseCliPath = path.join(projectRoot, "node_modules", "supabase", "dist", "supabase.js");

function normalizeGeneratedTypes(value) {
  return `${String(value).replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function generateDatabaseTypes() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [supabaseCliPath, "gen", "types", "--local", "--lang", "typescript", "--schema", "public"],
      {
        cwd: projectRoot,
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve(normalizeGeneratedTypes(stdout));
        return;
      }
      reject(
        new Error(
          `Supabase-Datenbanktypen konnten nicht erzeugt werden (${signal ?? `Exit ${code}`}). ` +
            "Stelle sicher, dass der lokale Supabase-Stack läuft." +
            (stderr.trim() ? `\n${stderr.trim()}` : ""),
        ),
      );
    });
  });
}

export async function synchronizeDatabaseTypes({ mode = "check" } = {}) {
  if (mode !== "check" && mode !== "write") {
    throw new Error(`Unbekannter Datenbanktypen-Modus: ${mode}`);
  }

  const generatedTypes = await generateDatabaseTypes();
  if (mode === "write") {
    await writeFile(generatedTypesPath, generatedTypes, "utf8");
    console.log(`Supabase-Datenbanktypen aktualisiert: ${path.relative(projectRoot, generatedTypesPath)}`);
    return;
  }

  let committedTypes;
  try {
    committedTypes = normalizeGeneratedTypes(await readFile(generatedTypesPath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("Die versionierte Datei src/database.types.ts fehlt. Führe npm run db:types:generate aus.");
    }
    throw error;
  }

  if (generatedTypes !== committedTypes) {
    throw new Error(
      "Die versionierten Supabase-Datenbanktypen sind veraltet. " +
        "Starte den lokalen Supabase-Stack und führe npm run db:types:generate aus.",
    );
  }

  console.log("Supabase-Datenbanktypen stimmen mit dem lokalen Schema überein.");
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  await synchronizeDatabaseTypes({ mode });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
