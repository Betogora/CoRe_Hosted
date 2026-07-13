const textDecoder = new TextDecoder("utf-8");

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

function findEndOfCentralDirectory(bytes: Uint8Array) {
  if (bytes.length < 22) throw new Error("Die APKG-Datei ist als ZIP-Datei abgeschnitten.");
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }

  throw new Error("Die APKG-Datei enthält kein gültiges ZIP-Verzeichnis.");
}

function getName(bytes: Uint8Array, start: number, length: number) {
  assertRange(bytes.length, start, length, "ZIP-Dateiname");
  return textDecoder.decode(bytes.slice(start, start + length));
}

async function inflateRaw(deflatedBytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Dieses Browser-Umfeld kann komprimierte ZIP-Einträge nicht entpacken.");
  }

  const compressedBuffer = new ArrayBuffer(deflatedBytes.byteLength);
  new Uint8Array(compressedBuffer).set(deflatedBytes);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntryDescriptor {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntryDescriptor) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = entry.localHeaderOffset;
  assertRange(bytes.length, localOffset, 30, `Lokaler Header von "${entry.name}"`);

  if (readUint32(view, localOffset) !== 0x04034b50) {
    throw new Error(`ZIP-Eintrag "${entry.name}" hat einen ungültigen lokalen Header.`);
  }

  const fileNameLength = readUint16(view, localOffset + 26);
  const extraLength = readUint16(view, localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  assertRange(bytes.length, dataStart, entry.compressedSize, `Daten von "${entry.name}"`);
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    if (compressed.length !== entry.uncompressedSize) throw new Error(`ZIP-Eintrag "${entry.name}" hat eine ungültige Größe.`);
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    const inflated = await inflateRaw(compressed);
    if (inflated.length !== entry.uncompressedSize) throw new Error(`ZIP-Eintrag "${entry.name}" wurde mit unerwarteter Größe entpackt.`);
    return inflated;
  }

  throw new Error(`ZIP-Kompression ${entry.compressionMethod} wird im MVP noch nicht unterstützt.`);
}

export async function readZipArchive(file: { arrayBuffer(): Promise<ArrayBuffer> }) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  assertRange(bytes.length, centralDirectoryOffset, centralDirectorySize, "Zentrales ZIP-Verzeichnis");
  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) throw new Error("Das ZIP-Verzeichnis überlappt sein Endverzeichnis.");
  const entries = new Map<string, ZipEntryDescriptor & { readBytes(): Promise<Uint8Array> }>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(bytes.length, offset, 46, "ZIP-Verzeichniseintrag");
    if (readUint32(view, offset) !== 0x02014b50) {
      throw new Error("Das ZIP-Verzeichnis der APKG-Datei ist beschädigt.");
    }

    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const entryLength = 46 + fileNameLength + extraLength + commentLength;
    assertRange(bytes.length, offset, entryLength, "ZIP-Verzeichniseintrag");
    if ([compressedSize, uncompressedSize, localHeaderOffset].includes(0xffffffff)) {
      throw new Error("ZIP64-APKG-Dateien werden nicht unterstützt.");
    }
    const name = getName(bytes, offset + 46, fileNameLength);
    if (!name || entries.has(name)) throw new Error("Das ZIP-Verzeichnis enthält ungültige oder doppelte Dateinamen.");

    const descriptor: ZipEntryDescriptor = {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    };
    entries.set(name, { ...descriptor, readBytes: () => readEntry(bytes, descriptor) });

    offset += entryLength;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) throw new Error("Das ZIP-Verzeichnis hat eine inkonsistente Größe.");

  return {
    entries,
    listEntries() {
      return [...entries.values()].map(({ name, compressedSize, uncompressedSize }: any) => ({
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
