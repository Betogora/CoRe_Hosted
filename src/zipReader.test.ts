import assert from "node:assert/strict";
import test from "node:test";
import { readZipArchive } from "./zipReader.ts";

const encoder = new TextEncoder();

/**
 * A ZIP of stored entries. `zip64End` writes the end record as Anki does from 65,535 entries on; `zip64Entries` marks
 * each entry's sizes and offset and moves them into ZIP64 extra fields.
 */
function storedZip(files: Record<string, string>, { zip64End = false, zip64Entries = false } = {}) {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array<ArrayBuffer>) => { parts.push(bytes); offset += bytes.length; };
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const localOffset = offset;
    const extra = (values: number[]) => {
      const bytes = new Uint8Array(4 + values.length * 8);
      const view = new DataView(bytes.buffer);
      view.setUint16(0, 0x0001, true);
      view.setUint16(2, values.length * 8, true);
      values.forEach((value, index) => view.setBigUint64(4 + index * 8, BigInt(value), true));
      return bytes;
    };
    const localExtra = zip64Entries ? extra([data.length, data.length]) : new Uint8Array();
    const local = new Uint8Array(30 + nameBytes.length + localExtra.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint32(18, zip64Entries ? 0xffffffff : data.length, true);
    localView.setUint32(22, zip64Entries ? 0xffffffff : data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, localExtra.length, true);
    local.set(nameBytes, 30);
    local.set(localExtra, 30 + nameBytes.length);
    push(local);
    push(data);
    const centralExtra = zip64Entries ? extra([data.length, data.length, localOffset]) : new Uint8Array();
    const entry = new Uint8Array(46 + nameBytes.length + centralExtra.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint32(20, zip64Entries ? 0xffffffff : data.length, true);
    entryView.setUint32(24, zip64Entries ? 0xffffffff : data.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint16(30, centralExtra.length, true);
    entryView.setUint32(42, zip64Entries ? 0xffffffff : localOffset, true);
    entry.set(nameBytes, 46);
    entry.set(centralExtra, 46 + nameBytes.length);
    central.push(entry);
  }
  const directoryOffset = offset;
  central.forEach(push);
  const directorySize = offset - directoryOffset;
  const count = central.length;
  if (zip64End) {
    const endOffset = offset;
    const end = new Uint8Array(56);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06064b50, true);
    endView.setBigUint64(4, 44n, true);
    endView.setBigUint64(24, BigInt(count), true);
    endView.setBigUint64(32, BigInt(count), true);
    endView.setBigUint64(40, BigInt(directorySize), true);
    endView.setBigUint64(48, BigInt(directoryOffset), true);
    push(end);
    const locator = new Uint8Array(20);
    const locatorView = new DataView(locator.buffer);
    locatorView.setUint32(0, 0x07064b50, true);
    locatorView.setBigUint64(8, BigInt(endOffset), true);
    locatorView.setUint32(16, 1, true);
    push(locator);
  }
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, zip64End ? 0xffff : count, true);
  eocdView.setUint16(10, zip64End ? 0xffff : count, true);
  eocdView.setUint32(12, zip64End ? 0xffffffff : directorySize, true);
  eocdView.setUint32(16, zip64End ? 0xffffffff : directoryOffset, true);
  push(eocd);
  return new Blob(parts);
}

async function contents(blob: Blob) {
  const archive = await readZipArchive(blob);
  const decoder = new TextDecoder();
  return Object.fromEntries(await Promise.all(archive.listEntries().map(async ({ name }) => [name, decoder.decode(await archive.getEntry(name)!.readBytes())])));
}

const FILES = { "collection.anki21b": "Sammlung", "0": "Bild", media: "{}" };

test("ZIP64: Endverzeichnis und Zusatzfelder je Eintrag liefern dieselben Einträge wie ein klassisches ZIP", async () => {
  assert.deepEqual(await contents(storedZip(FILES)), FILES);
  assert.deepEqual(await contents(storedZip(FILES, { zip64End: true })), FILES);
  assert.deepEqual(await contents(storedZip(FILES, { zip64End: true, zip64Entries: true })), FILES);
});

test("Genau 65.535 Einträge ohne ZIP64-Endverzeichnis, wie Pythons zipfile sie schreibt, bleiben lesbar", async () => {
  const files = Object.fromEntries(Array.from({ length: 0xffff }, (_, index) => [String(index), ""]));
  const archive = await readZipArchive(storedZip(files));
  assert.equal(archive.listEntries().length, 0xffff);
});

test("ZIP64: ein markiertes Endverzeichnis ohne ZIP64-Verweis bleibt ein sichtbarer Fehler", async () => {
  const valid = new Uint8Array(await storedZip(FILES, { zip64End: true }).arrayBuffer());
  const withoutLocator = new Uint8Array([...valid.subarray(0, valid.length - 42), ...valid.subarray(valid.length - 22)]);
  await assert.rejects(readZipArchive(new Blob([withoutLocator])), { message: "Das ZIP64-Endverzeichnis fehlt." });
});
