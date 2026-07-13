import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoots = ["src", "api", "tests"];
const forbiddenDirectivePattern = /@ts-(?:ignore|nocheck)\b/;

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
      return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

const files = (
  await Promise.all(sourceRoots.map((root) => listTypeScriptFiles(path.join(projectRoot, root))))
).flat();
const violations = [];

for (const file of files) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbiddenDirectivePattern.test(line)) {
      violations.push(`${path.relative(projectRoot, file)}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error("Dauerhafte TypeScript-Prüfausnahmen sind nicht erlaubt:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
}
