import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const DEFAULT_MAX_CHUNK_BYTES = 500_000;

interface ViteManifestEntry {
  file: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
}

type ViteManifest = Record<string, ViteManifestEntry>;

export function collectBudgetedJavaScriptFiles(manifest: ViteManifest = {}) {
  return [
    ...new Set(
      Object.values(manifest)
        .filter((entry) => entry && (entry.isEntry || entry.isDynamicEntry || entry.name) && /\.m?js$/i.test(entry.file ?? ""))
        .map((entry) => entry.file),
    ),
  ].sort();
}

export function findOversizedBuildChunks(manifest: ViteManifest = {}, sizeByFile: Record<string, number> = {}, maxBytes = DEFAULT_MAX_CHUNK_BYTES) {
  return collectBudgetedJavaScriptFiles(manifest)
    .map((file) => ({ file, bytes: Number(sizeByFile[file] ?? 0) }))
    .filter((entry) => entry.bytes > maxBytes)
    .sort((left, right) => right.bytes - left.bytes);
}

export async function verifyBuildChunks({ distDirectory = "dist", maxBytes = DEFAULT_MAX_CHUNK_BYTES } = {}) {
  const manifestPath = path.join(distDirectory, ".vite", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ViteManifest;
  const files = collectBudgetedJavaScriptFiles(manifest);
  const sizeByFile = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => {
        const info = await stat(path.join(distDirectory, file));
        return [file, info.size];
      }),
    ),
  );
  const oversized = findOversizedBuildChunks(manifest, sizeByFile, maxBytes);
  if (oversized.length > 0) {
    const details = oversized.map((entry) => `${entry.file}: ${(entry.bytes / 1000).toFixed(1)} kB`).join("\n");
    throw new Error(`Build-Chunk-Budget von ${(maxBytes / 1000).toFixed(0)} kB überschritten:\n${details}`);
  }

  const largest = files.map((file) => ({ file, bytes: sizeByFile[file] })).sort((left, right) => right.bytes - left.bytes)[0];
  return { files, largest, maxBytes };
}

async function main() {
  const result = await verifyBuildChunks();
  const largest = result.largest ? `${result.largest.file} (${(result.largest.bytes / 1000).toFixed(1)} kB)` : "keine JavaScript-Chunks";
  console.log(`Build-Chunk-Budget eingehalten: ${result.files.length} Chunks, größter Chunk ${largest}.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPoint === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
