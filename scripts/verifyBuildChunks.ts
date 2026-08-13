import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

export const DEFAULT_MAX_CHUNK_BYTES = 500_000;
export const DEFAULT_INITIAL_GZIP_BYTES = 300 * 1024;
export const DEFAULT_LAZY_ROUTE_GZIP_BYTES = 200 * 1024;
export const DEFAULT_WORKER_GZIP_BYTES = 525 * 1024;

interface ViteManifestEntry {
  file: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  src?: string;
}

type ViteManifest = Record<string, ViteManifestEntry>;

function manifestGraph(manifest: ViteManifest, entryKey: string, collected = new Set<string>()) {
  if (collected.has(entryKey)) return collected;
  const entry = manifest[entryKey];
  if (!entry) return collected;
  collected.add(entryKey);
  for (const importedKey of entry.imports ?? []) manifestGraph(manifest, importedKey, collected);
  return collected;
}

export function collectCompressedBudgetGroups(manifest: ViteManifest = {}) {
  const entries = Object.entries(manifest);
  const initialKeys = entries.filter(([, entry]) => entry.isEntry).map(([key]) => key);
  const initialGraphKeys = new Set(initialKeys.flatMap((key) => [...manifestGraph(manifest, key)]));
  const filesForKeys = (keys: Iterable<string>) => [...new Set([...keys].map((key) => manifest[key]?.file).filter((file): file is string => Boolean(file && /\.m?js$/i.test(file))))].sort();
  const initial = filesForKeys(initialGraphKeys);
  const lazyRoutes = Object.fromEntries(entries
    .filter(([, entry]) => entry.isDynamicEntry)
    .map(([key, entry]) => [entry.name ?? key, filesForKeys([...manifestGraph(manifest, key)].filter((dependencyKey) => !initialGraphKeys.has(dependencyKey)))]));
  const workers = [...new Set(entries
    .filter(([key, entry]) => /worker/i.test(key) || /worker/i.test(entry.file) || /worker/i.test(entry.src ?? ""))
    .map(([, entry]) => entry.file)
    .filter((file) => /\.m?js$/i.test(file)))].sort();
  return { initial, lazyRoutes, workers };
}

export function findCompressedBudgetViolations(
  manifest: ViteManifest,
  gzipSizeByFile: Record<string, number>,
  budgets = { initial: DEFAULT_INITIAL_GZIP_BYTES, lazyRoute: DEFAULT_LAZY_ROUTE_GZIP_BYTES, worker: DEFAULT_WORKER_GZIP_BYTES },
) {
  const groups = collectCompressedBudgetGroups(manifest);
  const total = (files: string[]) => files.reduce((sum, file) => sum + Number(gzipSizeByFile[file] ?? 0), 0);
  const violations: Array<{ kind: "initial" | "lazy-route" | "worker"; name: string; bytes: number; maxBytes: number }> = [];
  const initialBytes = total(groups.initial);
  if (initialBytes > budgets.initial) violations.push({ kind: "initial", name: "initialer Importgraph", bytes: initialBytes, maxBytes: budgets.initial });
  for (const [name, files] of Object.entries(groups.lazyRoutes)) {
    const bytes = total(files);
    if (bytes > budgets.lazyRoute) violations.push({ kind: "lazy-route", name, bytes, maxBytes: budgets.lazyRoute });
  }
  for (const file of groups.workers) {
    const bytes = total([file]);
    if (bytes > budgets.worker) violations.push({ kind: "worker", name: file, bytes, maxBytes: budgets.worker });
  }
  return violations.sort((left, right) => right.bytes - left.bytes);
}

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
  const compressedGroups = collectCompressedBudgetGroups(manifest);
  const compressedFiles = [...new Set([...compressedGroups.initial, ...Object.values(compressedGroups.lazyRoutes).flat(), ...compressedGroups.workers])];
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
  const gzipSizeByFile = Object.fromEntries(await Promise.all(compressedFiles.map(async (file) => [file, gzipSync(await readFile(path.join(distDirectory, file))).byteLength])));
  const compressedViolations = findCompressedBudgetViolations(manifest, gzipSizeByFile);
  if (compressedViolations.length > 0) {
    const details = compressedViolations.map((entry) => `${entry.kind} ${entry.name}: ${(entry.bytes / 1024).toFixed(1)} KiB (max. ${(entry.maxBytes / 1024).toFixed(0)} KiB)`).join("\n");
    throw new Error(`Komprimiertes Build-Budget überschritten:\n${details}`);
  }

  const largest = files.map((file) => ({ file, bytes: sizeByFile[file] })).sort((left, right) => right.bytes - left.bytes)[0];
  return { files, largest, maxBytes, compressedGroups };
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
