import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { openValidatedApkg } from "../trigger/apkgArchive.ts";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; data: Buffer; deflate?: boolean; declaredSize?: number }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const item of entries) {
    const name = Buffer.from(item.name);
    const compressed = item.deflate ? deflateRawSync(item.data) : item.data;
    const method = item.deflate ? 8 : 0;
    const size = item.declaredSize ?? item.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(item.data), 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(item.data), 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

async function fixture(bytes: Buffer, run: (path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "core-apkg-security-"));
  try {
    const path = join(directory, "fixture.apkg");
    await writeFile(path, bytes);
    await run(path);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("server APKG reader rejects duplicate and unsafe ZIP entries", async () => {
  await fixture(zip([{ name: "media", data: Buffer.from("{}") }, { name: "media", data: Buffer.from("{}") }]), async (path) => {
    await assert.rejects(openValidatedApkg(path), /duplicate_zip_entry/);
  });
  await fixture(zip([{ name: "../collection.anki2", data: Buffer.from("sqlite") }]), async (path) => {
    await assert.rejects(openValidatedApkg(path), /unsafe_zip_entry/);
  });
});

test("server APKG reader reads stored and deflated entries through the same byte contract", async () => {
  await fixture(zip([
    { name: "stored", data: Buffer.from("stored bytes") },
    { name: "deflated", data: Buffer.from("deflated bytes"), deflate: true },
  ]), async (path) => {
    const archive = await openValidatedApkg(path);
    try {
      assert.equal((await archive.readBytes("stored", 100)).toString(), "stored bytes");
      assert.equal((await archive.readBytes("deflated", 100)).toString(), "deflated bytes");
    } finally { archive.close(); }
  });
});

test("server APKG reader enforces downscaled entry, expansion and byte-truth limits", async () => {
  await fixture(zip([{ name: "a", data: Buffer.from("a") }, { name: "b", data: Buffer.from("b") }]), async (path) => {
    await assert.rejects(openValidatedApkg(path, { entries: 1 }), /too_many_zip_entries/);
  });
  await fixture(zip([{ name: "bomb", data: Buffer.alloc(4_096, 65), deflate: true }]), async (path) => {
    await assert.rejects(openValidatedApkg(path, { compressionRatio: 2 }), /zip_compression_ratio/);
  });
  await fixture(zip([{ name: "lie", data: Buffer.from("actual bytes"), deflate: true, declaredSize: 2 }]), async (path) => {
    const archive = await openValidatedApkg(path);
    try { await assert.rejects(archive.readBytes("lie", 100)); }
    finally { archive.close(); }
  });
});
