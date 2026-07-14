import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export const APKG_LIMITS = {
  archiveBytes: 1024 * 1024 * 1024,
  entries: 100_000,
  uncompressedBytes: 6 * 1024 * 1024 * 1024,
  compressionRatio: 200,
  collectionBytes: 512 * 1024 * 1024,
  manifestBytes: 32 * 1024 * 1024,
  mediaBytes: 500 * 1024 * 1024,
  artifactBytes: 64 * 1024 * 1024,
} as const;

export class UnsafeApkgError extends Error {
  constructor(readonly code: string) { super(code); }
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true }, (error, zip) => error || !zip ? reject(error ?? new Error("zip_open_failed")) : resolve(zip)));
}

function openEntry(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, { decompress: true }, (error, stream) => error || !stream ? reject(error ?? new Error("zip_entry_failed")) : resolve(stream)));
}

function validateName(name: string) {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized !== name || normalized.endsWith("/") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..") || normalized.includes("\0")) {
    throw new UnsafeApkgError("unsafe_zip_entry");
  }
}

function limiter(maxBytes: number, expectedBytes?: number) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) return callback(new UnsafeApkgError("zip_entry_too_large"));
      callback(null, chunk);
    },
    flush(callback) {
      if (expectedBytes != null && bytes !== expectedBytes) return callback(new UnsafeApkgError("zip_size_mismatch"));
      callback();
    },
  });
}

export async function openValidatedApkg(path: string, overrides: Partial<Record<keyof typeof APKG_LIMITS, number>> = {}) {
  const limits = { ...APKG_LIMITS, ...overrides };
  const zip = await openZip(path);
  const entries = new Map<string, Entry>();
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    zip.on("error", (error) => reject(/invalid relative path/i.test(String(error)) ? new UnsafeApkgError("unsafe_zip_entry") : error));
    zip.on("end", resolve);
    zip.on("entry", (entry: Entry) => {
      try {
        validateName(entry.fileName);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new UnsafeApkgError("encrypted_zip_entry");
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (unixType !== 0 && unixType !== 0x8000) throw new UnsafeApkgError("unsupported_zip_entry");
        if (entries.has(entry.fileName)) throw new UnsafeApkgError("duplicate_zip_entry");
        if (entries.size >= limits.entries) throw new UnsafeApkgError("too_many_zip_entries");
        const ratio = entry.compressedSize === 0 ? (entry.uncompressedSize === 0 ? 1 : Infinity) : entry.uncompressedSize / entry.compressedSize;
        if (ratio > limits.compressionRatio) throw new UnsafeApkgError("zip_compression_ratio");
        total += entry.uncompressedSize;
        if (total > limits.uncompressedBytes) throw new UnsafeApkgError("zip_uncompressed_limit");
        entries.set(entry.fileName, entry);
        zip.readEntry();
      } catch (error) { zip.close(); reject(error); }
    });
    zip.readEntry();
  });

  async function readBytes(name: string, maxBytes: number): Promise<Buffer> {
    const entry = entries.get(name);
    if (!entry) throw new UnsafeApkgError("missing_zip_entry");
    if (entry.uncompressedSize > maxBytes) throw new UnsafeApkgError("zip_entry_too_large");
    const chunks: Buffer[] = [];
    const limit = limiter(maxBytes, entry.uncompressedSize);
    limit.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    await pipeline(await openEntry(zip, entry), limit);
    return Buffer.concat(chunks);
  }

  async function writeFile(name: string, target: string, maxBytes: number, transform?: NodeJS.ReadWriteStream) {
    const entry = entries.get(name);
    if (!entry) throw new UnsafeApkgError("missing_zip_entry");
    if (entry.uncompressedSize > maxBytes && !transform) throw new UnsafeApkgError("zip_entry_too_large");
    const source = await openEntry(zip, entry);
    if (transform) await pipeline(source, transform, limiter(maxBytes), createWriteStream(target, { flags: "wx" }));
    else await pipeline(source, limiter(maxBytes, entry.uncompressedSize), createWriteStream(target, { flags: "wx" }));
  }

  async function hash(name: string, maxBytes = limits.mediaBytes) {
    const entry = entries.get(name);
    if (!entry || entry.uncompressedSize > maxBytes) throw new UnsafeApkgError("media_too_large");
    const digest = createHash("sha1");
    let actual = 0;
    for await (const chunk of await openEntry(zip, entry)) {
      actual += Buffer.byteLength(chunk);
      if (actual > maxBytes) throw new UnsafeApkgError("media_too_large");
      digest.update(chunk);
    }
    if (actual !== entry.uncompressedSize) throw new UnsafeApkgError("zip_size_mismatch");
    return { sha1: digest.digest("hex"), size: actual };
  }

  return { entries, readBytes, writeFile, hash, close: () => zip.close() };
}
