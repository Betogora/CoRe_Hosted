const textDecoder = new TextDecoder("utf-8");
const EOCD_SEARCH_BYTES = 0xffff + 22;
const LOCAL_HEADER_BYTES = 30;

type ZipSource = Blob | { arrayBuffer(): Promise<ArrayBuffer> };

function assertRange(length: number, offset: number, size: number, label: string) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > length) {
    throw new Error(`${label} liegt außerhalb der ZIP-Datei.`);
  }
}

function readUint16(view: DataView, offset: number) {
  assertRange(view.byteLength, offset, 2, "ZIP-Feld");
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  assertRange(view.byteLength, offset, 4, "ZIP-Feld");
  return view.getUint32(offset, true);
}

function readUint64(view: DataView, offset: number) {
  assertRange(view.byteLength, offset, 8, "ZIP-Feld");
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Ein ZIP64-Wert ist zu groß.");
  return Number(value);
}

const ZIP64_MARK_16 = 0xffff;
const ZIP64_MARK_32 = 0xffffffff;
const ZIP64_LOCATOR_BYTES = 20;
const ZIP64_END_BYTES = 56;

/** ZIP64 end record behind its locator, which sits directly before the classic end record. */
async function readZip64End(blob: Blob, eocdOffset: number) {
  const locatorOffset = eocdOffset - ZIP64_LOCATOR_BYTES;
  if (locatorOffset < 0) throw new Error("Das ZIP64-Endverzeichnis fehlt.");
  const locator = await readRange(blob, locatorOffset, ZIP64_LOCATOR_BYTES, "ZIP64-Verweis");
  const locatorView = new DataView(locator.buffer, locator.byteOffset, locator.byteLength);
  if (readUint32(locatorView, 0) !== 0x07064b50) throw new Error("Das ZIP64-Endverzeichnis fehlt.");
  const endOffset = readUint64(locatorView, 8);
  const end = await readRange(blob, endOffset, ZIP64_END_BYTES, "ZIP64-Endverzeichnis");
  const endView = new DataView(end.buffer, end.byteOffset, end.byteLength);
  if (readUint32(endView, 0) !== 0x06064b50) throw new Error("Das ZIP64-Endverzeichnis ist beschädigt.");
  return { endOffset, entryCount: readUint64(endView, 32), centralDirectorySize: readUint64(endView, 40), centralDirectoryOffset: readUint64(endView, 48) };
}

/**
 * Replaces the 32-bit fields marked 0xffffffff with the values of the ZIP64 extra field (id 0x0001), which lists only
 * the marked ones, in this order.
 */
function applyZip64Extra(view: DataView, extraStart: number, extraLength: number, sizes: { uncompressedSize: number; compressedSize: number; localHeaderOffset: number }) {
  const marked = (["uncompressedSize", "compressedSize", "localHeaderOffset"] as const).filter((key) => sizes[key] === ZIP64_MARK_32);
  if (!marked.length) return sizes;
  for (let offset = extraStart; offset + 4 <= extraStart + extraLength;) {
    const id = readUint16(view, offset);
    const size = readUint16(view, offset + 2);
    if (id === 0x0001) {
      if (size < marked.length * 8) break;
      const resolved = { ...sizes };
      marked.forEach((key, index) => { resolved[key] = readUint64(view, offset + 4 + index * 8); });
      return resolved;
    }
    offset += 4 + size;
  }
  throw new Error("Ein ZIP64-Eintrag hat kein gültiges Zusatzfeld.");
}

async function readRange(blob: Blob, offset: number, size: number, label: string) {
  assertRange(blob.size, offset, size, label);
  return new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer());
}

function findEndOfCentralDirectory(tail: Uint8Array) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail[offset] === 0x50 && tail[offset + 1] === 0x4b && tail[offset + 2] === 0x05 && tail[offset + 3] === 0x06) return offset;
  }
  throw new Error("Die APKG-Datei enthält kein gültiges ZIP-Verzeichnis.");
}

function getName(bytes: Uint8Array, start: number, length: number) {
  assertRange(bytes.length, start, length, "ZIP-Dateiname");
  return textDecoder.decode(bytes.subarray(start, start + length));
}

async function inflateRaw(deflated: Blob) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Dieses Browser-Umfeld kann komprimierte ZIP-Einträge nicht entpacken.");
  }
  const stream = deflated.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntryDescriptor {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

// Entries are read one at a time from the file so large packages are never held in memory as a whole.
async function readEntry(blob: Blob, entry: ZipEntryDescriptor) {
  const localOffset = entry.localHeaderOffset;
  const header = await readRange(blob, localOffset, LOCAL_HEADER_BYTES, `Lokaler Header von "${entry.name}"`);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

  if (readUint32(view, 0) !== 0x04034b50) {
    throw new Error(`ZIP-Eintrag "${entry.name}" hat einen ungültigen lokalen Header.`);
  }

  const flags = readUint16(view, 6);
  if ((flags & 0x0001) !== 0) throw new Error(`ZIP-Eintrag "${entry.name}" ist verschlüsselt und wird nicht unterstützt.`);
  if (readUint16(view, 8) !== entry.compressionMethod) throw new Error(`ZIP-Eintrag "${entry.name}" widerspricht dem zentralen Kompressionsverfahren.`);
  const fileNameLength = readUint16(view, 26);
  const extraLength = readUint16(view, 28);
  const localName = getName(await readRange(blob, localOffset + LOCAL_HEADER_BYTES, fileNameLength, `Lokaler Name von "${entry.name}"`), 0, fileNameLength);
  if (localName !== entry.name) throw new Error(`ZIP-Eintrag "${entry.name}" widerspricht dem lokalen Dateinamen.`);
  // A ZIP64 entry marks its local sizes and keeps the real ones in the local extra field; the central values count.
  if ((flags & 0x0008) === 0 && readUint32(view, 18) !== ZIP64_MARK_32) {
    if (readUint32(view, 18) !== entry.compressedSize || readUint32(view, 22) !== entry.uncompressedSize) {
      throw new Error(`ZIP-Eintrag "${entry.name}" enthält widersprüchliche Größenangaben.`);
    }
  }
  if (entry.compressedSize === 0 && entry.uncompressedSize > 0) throw new Error(`ZIP-Eintrag "${entry.name}" enthält eine ungültige deklarierte Größe.`);
  const dataStart = localOffset + LOCAL_HEADER_BYTES + fileNameLength + extraLength;
  assertRange(blob.size, dataStart, entry.compressedSize, `Daten von "${entry.name}"`);
  const compressed = blob.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    const stored = new Uint8Array(await compressed.arrayBuffer());
    if (stored.length !== entry.uncompressedSize) throw new Error(`ZIP-Eintrag "${entry.name}" hat eine ungültige Größe.`);
    return stored;
  }

  if (entry.compressionMethod === 8) {
    const inflated = await inflateRaw(compressed);
    if (inflated.length !== entry.uncompressedSize) throw new Error(`ZIP-Eintrag "${entry.name}" wurde mit unerwarteter Größe entpackt.`);
    return inflated;
  }

  throw new Error(`ZIP-Kompression ${entry.compressionMethod} wird im MVP noch nicht unterstützt.`);
}

export async function readZipArchive(file: ZipSource) {
  const blob = file instanceof Blob ? file : new Blob([await file.arrayBuffer()]);
  if (blob.size < 22) throw new Error("Die APKG-Datei ist als ZIP-Datei abgeschnitten.");
  const tailOffset = Math.max(0, blob.size - EOCD_SEARCH_BYTES);
  const tail = await readRange(blob, tailOffset, blob.size - tailOffset, "ZIP-Endverzeichnis");
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const eocdInTail = findEndOfCentralDirectory(tail);
  const eocdOffset = tailOffset + eocdInTail;
  const classic = {
    entryCount: readUint16(tailView, eocdInTail + 10),
    centralDirectorySize: readUint32(tailView, eocdInTail + 12),
    centralDirectoryOffset: readUint32(tailView, eocdInTail + 16),
  };
  // Anki writes a ZIP64 end record once a package has 65,535 entries or more.
  const zip64 = classic.entryCount === ZIP64_MARK_16 || classic.centralDirectorySize === ZIP64_MARK_32 || classic.centralDirectoryOffset === ZIP64_MARK_32
    ? await readZip64End(blob, eocdOffset)
    : null;
  const { entryCount, centralDirectorySize, centralDirectoryOffset } = zip64 ?? classic;
  assertRange(blob.size, centralDirectoryOffset, centralDirectorySize, "Zentrales ZIP-Verzeichnis");
  if (centralDirectoryOffset + centralDirectorySize > (zip64?.endOffset ?? eocdOffset)) throw new Error("Das ZIP-Verzeichnis überlappt sein Endverzeichnis.");
  const directory = await readRange(blob, centralDirectoryOffset, centralDirectorySize, "Zentrales ZIP-Verzeichnis");
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries = new Map<string, ZipEntryDescriptor & { readBytes(): Promise<Uint8Array> }>();
  let offset = 0;

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(directory.length, offset, 46, "ZIP-Verzeichniseintrag");
    if (readUint32(view, offset) !== 0x02014b50) {
      throw new Error("Das ZIP-Verzeichnis der APKG-Datei ist beschädigt.");
    }

    const compressionMethod = readUint16(view, offset + 10);
    const flags = readUint16(view, offset + 8);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const entryLength = 46 + fileNameLength + extraLength + commentLength;
    assertRange(directory.length, offset, entryLength, "ZIP-Verzeichniseintrag");
    const { compressedSize, uncompressedSize, localHeaderOffset } = applyZip64Extra(view, offset + 46 + fileNameLength, extraLength, {
      uncompressedSize: readUint32(view, offset + 24),
      compressedSize: readUint32(view, offset + 20),
      localHeaderOffset: readUint32(view, offset + 42),
    });
    if ((flags & 0x0001) !== 0) throw new Error("Verschlüsselte ZIP-Einträge werden nicht unterstützt.");
    if (compressionMethod !== 0 && compressionMethod !== 8) throw new Error(`ZIP-Kompression ${compressionMethod} wird im MVP noch nicht unterstützt.`);
    const name = getName(directory, offset + 46, fileNameLength);
    if (!name || entries.has(name)) throw new Error("Das ZIP-Verzeichnis enthält ungültige oder doppelte Dateinamen.");

    const descriptor: ZipEntryDescriptor = {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    };
    entries.set(name, { ...descriptor, readBytes: () => readEntry(blob, descriptor) });

    offset += entryLength;
  }

  if (offset !== centralDirectorySize) throw new Error("Das ZIP-Verzeichnis hat eine inkonsistente Größe.");

  return {
    entries,
    listEntries() {
      return [...entries.values()].map(({ name, compressedSize, uncompressedSize }) => ({
        name,
        compressedSize,
        uncompressedSize,
      }));
    },
    getEntry(name: string) {
      return entries.get(name);
    },
  };
}
