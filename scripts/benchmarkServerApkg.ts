import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { APKG_LIMITS, openValidatedApkg } from "../trigger/apkgArchive.ts";

const fixturePath = resolve(process.argv[2] ?? "test-results/apkg/m3-large-media.apkg");
const fixtureStats = await stat(fixturePath);
const startedAt = performance.now();
const archive = await openValidatedApkg(fixturePath);

try {
  const collectionName = ["collection.anki21b", "collection.anki21", "collection.anki2"]
    .find((name) => archive.entries.has(name));
  if (!collectionName) throw new Error("Server-Benchmark enthält keine lesbare Anki-Collection.");
  await archive.readBytes(collectionName, APKG_LIMITS.collectionBytes);
  if (archive.entries.has("media")) await archive.readBytes("media", APKG_LIMITS.manifestBytes);

  const mediaEntries = [...archive.entries.keys()].filter((name) => /^\d+$/.test(name));
  let mediaBytes = 0;
  for (const name of mediaEntries) mediaBytes += (await archive.hash(name)).size;

  process.stdout.write(`${JSON.stringify({
    fixture: fixturePath,
    inputBytes: fixtureStats.size,
    entries: archive.entries.size,
    collection: collectionName,
    mediaFiles: mediaEntries.length,
    mediaBytes,
    totalMs: Number((performance.now() - startedAt).toFixed(2)),
  }, null, 2)}\n`);
} finally {
  archive.close();
}
