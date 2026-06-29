const textDecoder = new TextDecoder("utf-8");

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
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

  throw new Error("Die APKG-Datei enthaelt kein gueltiges ZIP-Verzeichnis.");
}

function getName(bytes, start, length) {
  return textDecoder.decode(bytes.slice(start, start + length));
}

async function inflateRaw(deflatedBytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Dieses Browser-Umfeld kann komprimierte ZIP-Eintraege nicht entpacken.");
  }

  const stream = new Blob([deflatedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = entry.localHeaderOffset;

  if (readUint32(view, localOffset) !== 0x04034b50) {
    throw new Error(`ZIP-Eintrag "${entry.name}" hat einen ungueltigen lokalen Header.`);
  }

  const fileNameLength = readUint16(view, localOffset + 26);
  const extraLength = readUint16(view, localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    return inflateRaw(compressed);
  }

  throw new Error(`ZIP-Kompression ${entry.compressionMethod} wird im MVP noch nicht unterstuetzt.`);
}

export async function readZipArchive(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) {
      throw new Error("Das ZIP-Verzeichnis der APKG-Datei ist beschaedigt.");
    }

    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const name = getName(bytes, offset + 46, fileNameLength);

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      readBytes: () =>
        readEntry(bytes, {
          name,
          compressionMethod,
          compressedSize,
          localHeaderOffset,
        }),
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return {
    entries,
    listEntries() {
      return [...entries.values()].map(({ name, compressedSize, uncompressedSize }) => ({
        name,
        compressedSize,
        uncompressedSize,
      }));
    },
    getEntry(name) {
      return entries.get(name);
    },
  };
}
