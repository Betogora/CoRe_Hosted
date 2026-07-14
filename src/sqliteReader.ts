const sqliteTextDecoder = new TextDecoder("utf-8");

interface SqliteDatabaseBuffer {
  buffer: Uint8Array;
  pageSize: number;
  reservedSpace: number;
}

function assertBufferRange(buffer: Uint8Array, offset: number, length: number, label: string) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`${label} liegt außerhalb der SQLite-Datei.`);
  }
}

function readUint16(buffer: Uint8Array, offset: number) {
  assertBufferRange(buffer, offset, 2, "SQLite-16-Bit-Feld");
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readUint32(buffer: Uint8Array, offset: number) {
  assertBufferRange(buffer, offset, 4, "SQLite-32-Bit-Feld");
  return (
    buffer[offset] * 0x1000000 +
    ((buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3])
  );
}

function readInt64(buffer: Uint8Array, offset: number) {
  assertBufferRange(buffer, offset, 8, "SQLite-64-Bit-Feld");
  const high = readUint32(buffer, offset);
  const low = readUint32(buffer, offset + 4);
  const value = BigInt(high) << 32n | BigInt(low);
  const signed = value & (1n << 63n) ? value - (1n << 64n) : value;

  if (signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(signed);
  }

  return signed.toString();
}

function readVarint(buffer: Uint8Array, offset: number) {
  let value = 0n;

  for (let index = 0; index < 9; index += 1) {
    assertBufferRange(buffer, offset + index, 1, "SQLite-Varint");
    const byte = buffer[offset + index];

    if (index === 8) {
      value = (value << 8n) | BigInt(byte);
      return { value: Number(value), length: 9 };
    }

    value = (value << 7n) | BigInt(byte & 0x7f);

    if ((byte & 0x80) === 0) {
      const numeric = value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
      return { value: numeric, length: index + 1 };
    }
  }

  throw new Error("SQLite-Varint konnte nicht gelesen werden.");
}

function readSignedInteger(buffer: Uint8Array, offset: number, length: number) {
  assertBufferRange(buffer, offset, length, "SQLite-Integer");
  let value = 0;

  for (let index = 0; index < length; index += 1) {
    value = value * 256 + buffer[offset + index];
  }

  const signBit = 2 ** (length * 8 - 1);
  return value >= signBit ? value - 2 ** (length * 8) : value;
}

function readSerialValue(buffer: Uint8Array, offset: number, serialType: number) {
  if (serialType === 0) return { value: null, length: 0 };
  if (serialType === 1) return { value: readSignedInteger(buffer, offset, 1), length: 1 };
  if (serialType === 2) return { value: readSignedInteger(buffer, offset, 2), length: 2 };
  if (serialType === 3) return { value: readSignedInteger(buffer, offset, 3), length: 3 };
  if (serialType === 4) return { value: readSignedInteger(buffer, offset, 4), length: 4 };
  if (serialType === 5) return { value: readSignedInteger(buffer, offset, 6), length: 6 };
  if (serialType === 6) return { value: readInt64(buffer, offset), length: 8 };
  if (serialType === 7) {
    assertBufferRange(buffer, offset, 8, "SQLite-Fließkommazahl");
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    return { value: view.getFloat64(0, false), length: 8 };
  }
  if (serialType === 8) return { value: 0, length: 0 };
  if (serialType === 9) return { value: 1, length: 0 };

  if (serialType >= 12) {
    const length = Math.floor((serialType - 12) / 2);
    assertBufferRange(buffer, offset, length, "SQLite-Recordwert");
    const raw = buffer.slice(offset, offset + length);

    if (serialType % 2 === 1) {
      return { value: sqliteTextDecoder.decode(raw), length };
    }

    return { value: raw, length };
  }

  throw new Error(`SQLite-Serialtyp ${serialType} wird nicht unterstützt.`);
}

function parseRecord(buffer: Uint8Array, offset: number) {
  const headerSize = readVarint(buffer, offset);
  if (typeof headerSize.value !== "number" || !Number.isSafeInteger(headerSize.value) || headerSize.value < headerSize.length) {
    throw new Error("SQLite-Recordheader hat eine ungültige Größe.");
  }
  let headerOffset = offset + headerSize.length;
  const headerEnd = offset + headerSize.value;
  assertBufferRange(buffer, offset, headerSize.value, "SQLite-Recordheader");
  const serialTypes: any[] = [];

  while (headerOffset < headerEnd) {
    const serialType = readVarint(buffer, headerOffset);
    if (typeof serialType.value !== "number" || !Number.isSafeInteger(serialType.value)) {
      throw new Error("SQLite-Serialtyp ist zu groß.");
    }
    serialTypes.push(serialType.value);
    headerOffset += serialType.length;
  }

  let bodyOffset = headerEnd;
  return serialTypes.map((serialType: any) => {
    const parsed = readSerialValue(buffer, bodyOffset, serialType);
    bodyOffset += parsed.length;
    return parsed.value;
  });
}

function getPageBounds(database: SqliteDatabaseBuffer, pageNumber: number) {
  const pageCount = Math.floor(database.buffer.length / database.pageSize);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(`SQLite-Seitenreferenz ${pageNumber} ist ungültig.`);
  }
  const pageStart = (pageNumber - 1) * database.pageSize;
  const pageHeaderOffset = pageNumber === 1 ? 100 : 0;

  return { pageStart, pageHeaderOffset };
}

function getLocalPayloadSize(database: SqliteDatabaseBuffer, payloadLength: number, indexPage = false) {
  const usableSize = database.pageSize - database.reservedSpace;
  const maxLocal = indexPage
    ? Math.floor(((usableSize - 12) * 64) / 255) - 23
    : usableSize - 35;

  if (payloadLength <= maxLocal) {
    return payloadLength;
  }

  const minLocal = Math.floor(((usableSize - 12) * 32) / 255) - 23;
  const candidate = minLocal + ((payloadLength - minLocal) % (usableSize - 4));

  return candidate <= maxLocal ? candidate : minLocal;
}

function readPayload(database: SqliteDatabaseBuffer, startOffset: number, payloadLength: number, indexPage = false) {
  const { buffer, pageSize, reservedSpace } = database;
  if (!Number.isSafeInteger(payloadLength) || payloadLength < 0) throw new Error("SQLite-Payloadgröße ist ungültig.");
  const usableSize = pageSize - reservedSpace;
  const localPayloadSize = getLocalPayloadSize(database, payloadLength, indexPage);
  assertBufferRange(buffer, startOffset, localPayloadSize, "Lokaler SQLite-Payload");
  const chunks = [buffer.slice(startOffset, startOffset + localPayloadSize)];
  let bytesRead = localPayloadSize;

  if (bytesRead >= payloadLength) {
    return chunks[0];
  }

  assertBufferRange(buffer, startOffset + localPayloadSize, 4, "SQLite-Overflow-Zeiger");
  let overflowPage = readUint32(buffer, startOffset + localPayloadSize);
  const visitedOverflowPages = new Set<number>();

  while (overflowPage > 0 && bytesRead < payloadLength) {
    if (visitedOverflowPages.has(overflowPage)) throw new Error("SQLite-Overflow-Kette enthält einen Zyklus.");
    visitedOverflowPages.add(overflowPage);
    getPageBounds(database, overflowPage);
    const overflowOffset = (overflowPage - 1) * pageSize;
    const nextOverflowPage = readUint32(buffer, overflowOffset);
    const chunkSize = Math.min(usableSize - 4, payloadLength - bytesRead);
    assertBufferRange(buffer, overflowOffset + 4, chunkSize, "SQLite-Overflow-Payload");
    chunks.push(buffer.slice(overflowOffset + 4, overflowOffset + 4 + chunkSize));
    bytesRead += chunkSize;
    overflowPage = nextOverflowPage;
  }

  if (bytesRead !== payloadLength) throw new Error("SQLite-Overflow-Kette endet vor dem vollständigen Payload.");

  const payload = new Uint8Array(payloadLength);
  let writeOffset = 0;

  for (const chunk of chunks) {
    payload.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return payload;
}

function readTableLeafRows(database: SqliteDatabaseBuffer, pageNumber: number, visitedPages = new Set<number>()) {
  const { buffer, pageSize } = database;
  if (visitedPages.has(pageNumber)) throw new Error("SQLite-B-Baum enthält eine zyklische Seitenreferenz.");
  visitedPages.add(pageNumber);
  const { pageStart, pageHeaderOffset } = getPageBounds(database, pageNumber);
  assertBufferRange(buffer, pageStart + pageHeaderOffset, 8, "SQLite-Seitenheader");
  const pageType = buffer[pageStart + pageHeaderOffset];
  const cellCount = readUint16(buffer, pageStart + pageHeaderOffset + 3);
  const rows: any[] = [];

  if (pageType === 0x0d) {
    assertBufferRange(buffer, pageStart + pageHeaderOffset + 8, cellCount * 2, "SQLite-Zellzeiger");
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 8 + index * 2);
      if (cellOffset < pageHeaderOffset + 8 || cellOffset >= pageSize) throw new Error("SQLite-Zelloffset ist ungültig.");
      let cursor = pageStart + cellOffset;
      const payloadLength = readVarint(buffer, cursor);
      if (typeof payloadLength.value !== "number" || !Number.isSafeInteger(payloadLength.value)) {
        throw new Error("SQLite-Payloadgröße ist zu groß.");
      }
      cursor += payloadLength.length;
      const rowId = readVarint(buffer, cursor);
      cursor += rowId.length;

      const payload = readPayload(database, cursor, payloadLength.value);
      rows.push({ rowid: rowId.value, values: parseRecord(payload, 0) });
    }

    return rows;
  }

  if (pageType === 0x05) {
    assertBufferRange(buffer, pageStart + pageHeaderOffset, 12 + cellCount * 2, "SQLite-Innenseitenheader");
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 12 + index * 2);
      if (cellOffset < pageHeaderOffset + 12 || cellOffset > pageSize - 4) throw new Error("SQLite-Innenseiten-Zelloffset ist ungültig.");
      const childPage = readUint32(buffer, pageStart + cellOffset);
      rows.push(...readTableLeafRows(database, childPage, visitedPages));
    }

    const rightMostPage = readUint32(buffer, pageStart + pageHeaderOffset + 8);
    if (rightMostPage <= 0) throw new Error("SQLite-Innenseite hat keine rechte Kindseite.");
    rows.push(...readTableLeafRows(database, rightMostPage, visitedPages));

    return rows;
  }

  if (pageType === 0x0a) {
    assertBufferRange(buffer, pageStart + pageHeaderOffset + 8, cellCount * 2, "SQLite-Index-Zellzeiger");
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 8 + index * 2);
      if (cellOffset < pageHeaderOffset + 8 || cellOffset >= pageSize) throw new Error("SQLite-Index-Zelloffset ist ungültig.");
      let cursor = pageStart + cellOffset;
      const payloadLength = readVarint(buffer, cursor);
      if (typeof payloadLength.value !== "number" || !Number.isSafeInteger(payloadLength.value)) {
        throw new Error("SQLite-Index-Payloadgröße ist zu groß.");
      }
      cursor += payloadLength.length;
      const payload = readPayload(database, cursor, payloadLength.value, true);
      rows.push({ rowid: null, values: parseRecord(payload, 0) });
    }

    return rows;
  }

  if (pageType === 0x02) {
    assertBufferRange(buffer, pageStart + pageHeaderOffset, 12 + cellCount * 2, "SQLite-Index-Innenseitenheader");
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 12 + index * 2);
      if (cellOffset < pageHeaderOffset + 12 || cellOffset > pageSize - 5) throw new Error("SQLite-Index-Innenseiten-Zelloffset ist ungültig.");
      let cursor = pageStart + cellOffset;
      const childPage = readUint32(buffer, cursor);
      cursor += 4;
      rows.push(...readTableLeafRows(database, childPage, visitedPages));

      const payloadLength = readVarint(buffer, cursor);
      if (typeof payloadLength.value !== "number" || !Number.isSafeInteger(payloadLength.value)) {
        throw new Error("SQLite-Index-Payloadgröße ist zu groß.");
      }
      cursor += payloadLength.length;
      const payload = readPayload(database, cursor, payloadLength.value, true);
      rows.push({ rowid: null, values: parseRecord(payload, 0) });
    }

    const rightMostPage = readUint32(buffer, pageStart + pageHeaderOffset + 8);
    if (rightMostPage <= 0) throw new Error("SQLite-Index-Innenseite hat keine rechte Kindseite.");
    rows.push(...readTableLeafRows(database, rightMostPage, visitedPages));

    return rows;
  }

  throw new Error(`SQLite-Seitentyp ${pageType} wird im MVP noch nicht gelesen.`);
}

function parseColumnNames(createSql: any) {
  const start = createSql.indexOf("(");
  const end = createSql.lastIndexOf(")");

  if (start === -1 || end === -1) return [];

  return createSql
    .slice(start + 1, end)
    .split(",")
    .map((part: any) => part.trim().split(/\s+/)[0].replace(/["'`[\]]/g, ""))
    .filter((name: any) => name && !["primary", "foreign", "unique", "constraint", "check"].includes(name.toLowerCase()));
}

function rowsToObjects(rows: any, columnNames: any) {
  return rows.map(({ rowid, values }: any) => {
    const row: Record<string, any> = { rowid };

    columnNames.forEach((columnName: any, index: any) => {
      row[columnName] = values[index];
    });

    if (row.id == null && columnNames[0]?.toLowerCase() === "id") {
      row.id = rowid;
    }

    return row;
  });
}

export function readSqliteDatabase(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 100) throw new Error("Die SQLite-Datenbank ist abgeschnitten.");
  const signature = sqliteTextDecoder.decode(bytes.slice(0, 16));

  if (signature !== "SQLite format 3\0") {
    throw new Error("Die Anki-Collection ist keine gültige SQLite-Datenbank.");
  }

  const rawPageSize = readUint16(bytes, 16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
    throw new Error("Die SQLite-Seitengröße ist ungültig.");
  }
  if (bytes.length < pageSize || bytes.length % pageSize !== 0) throw new Error("Die SQLite-Dateigröße passt nicht zur Seitengröße.");
  if ((bytes[20] ?? 0) >= pageSize) throw new Error("Der reservierte SQLite-Seitenbereich ist ungültig.");
  const database = { buffer: bytes, pageSize, reservedSpace: bytes[20] ?? 0 };
  const masterRows = readTableLeafRows(database, 1);
  const masterObjects = rowsToObjects(masterRows, ["type", "name", "tbl_name", "rootpage", "sql"]);
  const tables = new Map();

  for (const table of masterObjects.filter((row: any) => row.type === "table" && row.rootpage)) {
    tables.set(table.name, {
      ...table,
      columns: parseColumnNames(table.sql ?? ""),
    });
  }

  return {
    listTables() {
      return [...tables.keys()];
    },
    readTable(tableName: any) {
      const table = tables.get(tableName);

      if (!table) {
        return [];
      }

      return rowsToObjects(readTableLeafRows(database, table.rootpage), table.columns);
    },
  };
}
