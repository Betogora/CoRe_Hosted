import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoots = ["src", "api", "tests", "scripts"] as const;
const rootConfigStems = new Set(["vite.config", "playwright.config", "postcss.config", "tailwind.config"]);
const forbiddenDirectivePattern = /@ts-(?:ignore|nocheck)\b/;
const forbiddenJavaScriptPattern = /\.(?:[cm]?js|jsx)$/i;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

const files = (
  await Promise.all(sourceRoots.map((root) => listFiles(path.join(projectRoot, root))))
).flat();
const rootFiles = (await readdir(projectRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && rootConfigStems.has(entry.name.replace(/\.(?:[cm]?js|jsx|tsx?)$/i, "")))
  .map((entry) => path.join(projectRoot, entry.name));
files.push(...rootFiles);
const violations: string[] = [];

for (const file of files) {
  const relativeFile = path.relative(projectRoot, file);
  if (forbiddenJavaScriptPattern.test(file)) {
    violations.push(`${relativeFile}: JavaScript-Datei im verpflichtenden TypeScript-Pfad`);
    continue;
  }
  if (!/\.tsx?$/.test(file)) continue;

  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbiddenDirectivePattern.test(line)) {
      violations.push(`${relativeFile}:${index + 1}: dauerhafte TypeScript-Prüfausnahme`);
    }
  });
}

if (violations.length > 0) {
  console.error("Die verbindliche TypeScript-Policy wurde verletzt:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
}
