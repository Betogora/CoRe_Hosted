const sqliteTextDecoder = new TextDecoder("utf-8");

function readUint16(buffer, offset) {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readUint32(buffer, offset) {
  return (
    buffer[offset] * 0x1000000 +
    ((buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3])
  );
}

function readInt64(buffer, offset) {
  const high = readUint32(buffer, offset);
  const low = readUint32(buffer, offset + 4);
  const value = BigInt(high) << 32n | BigInt(low);
  const signed = value & (1n << 63n) ? value - (1n << 64n) : value;

  if (signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(signed);
  }

  return signed.toString();
}

function readVarint(buffer, offset) {
  let value = 0n;

  for (let index = 0; index < 9; index += 1) {
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

function readSignedInteger(buffer, offset, length) {
  let value = 0;

  for (let index = 0; index < length; index += 1) {
    value = value * 256 + buffer[offset + index];
  }

  const signBit = 2 ** (length * 8 - 1);
  return value >= signBit ? value - 2 ** (length * 8) : value;
}

function readSerialValue(buffer, offset, serialType) {
  if (serialType === 0) return { value: null, length: 0 };
  if (serialType === 1) return { value: readSignedInteger(buffer, offset, 1), length: 1 };
  if (serialType === 2) return { value: readSignedInteger(buffer, offset, 2), length: 2 };
  if (serialType === 3) return { value: readSignedInteger(buffer, offset, 3), length: 3 };
  if (serialType === 4) return { value: readSignedInteger(buffer, offset, 4), length: 4 };
  if (serialType === 5) return { value: readSignedInteger(buffer, offset, 6), length: 6 };
  if (serialType === 6) return { value: readInt64(buffer, offset), length: 8 };
  if (serialType === 7) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    return { value: view.getFloat64(0, false), length: 8 };
  }
  if (serialType === 8) return { value: 0, length: 0 };
  if (serialType === 9) return { value: 1, length: 0 };

  if (serialType >= 12) {
    const length = Math.floor((serialType - 12) / 2);
    const raw = buffer.slice(offset, offset + length);

    if (serialType % 2 === 1) {
      return { value: sqliteTextDecoder.decode(raw), length };
    }

    return { value: raw, length };
  }

  return { value: null, length: 0 };
}

function parseRecord(buffer, offset) {
  const headerSize = readVarint(buffer, offset);
  let headerOffset = offset + headerSize.length;
  const headerEnd = offset + headerSize.value;
  const serialTypes = [];

  while (headerOffset < headerEnd) {
    const serialType = readVarint(buffer, headerOffset);
    serialTypes.push(serialType.value);
    headerOffset += serialType.length;
  }

  let bodyOffset = headerEnd;
  return serialTypes.map((serialType) => {
    const parsed = readSerialValue(buffer, bodyOffset, serialType);
    bodyOffset += parsed.length;
    return parsed.value;
  });
}

function getPageBounds(database, pageNumber) {
  const pageStart = (pageNumber - 1) * database.pageSize;
  const pageHeaderOffset = pageNumber === 1 ? 100 : 0;

  return { pageStart, pageHeaderOffset };
}

function getLocalPayloadSize(database, payloadLength) {
  const usableSize = database.pageSize - database.reservedSpace;
  const maxLocal = usableSize - 35;

  if (payloadLength <= maxLocal) {
    return payloadLength;
  }

  const minLocal = Math.floor(((usableSize - 12) * 32) / 255) - 23;
  const candidate = minLocal + ((payloadLength - minLocal) % (usableSize - 4));

  return candidate <= maxLocal ? candidate : minLocal;
}

function readPayload(database, startOffset, payloadLength) {
  const { buffer, pageSize, reservedSpace } = database;
  const usableSize = pageSize - reservedSpace;
  const localPayloadSize = getLocalPayloadSize(database, payloadLength);
  const chunks = [buffer.slice(startOffset, startOffset + localPayloadSize)];
  let bytesRead = localPayloadSize;

  if (bytesRead >= payloadLength) {
    return chunks[0];
  }

  let overflowPage = readUint32(buffer, startOffset + localPayloadSize);

  while (overflowPage > 0 && bytesRead < payloadLength) {
    const overflowOffset = (overflowPage - 1) * pageSize;
    const nextOverflowPage = readUint32(buffer, overflowOffset);
    const chunkSize = Math.min(usableSize - 4, payloadLength - bytesRead);
    chunks.push(buffer.slice(overflowOffset + 4, overflowOffset + 4 + chunkSize));
    bytesRead += chunkSize;
    overflowPage = nextOverflowPage;
  }

  const payload = new Uint8Array(payloadLength);
  let writeOffset = 0;

  for (const chunk of chunks) {
    payload.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return payload;
}

function readTableLeafRows(database, pageNumber) {
  const { buffer, pageSize } = database;
  const { pageStart, pageHeaderOffset } = getPageBounds(database, pageNumber);
  const pageType = buffer[pageStart + pageHeaderOffset];
  const cellCount = readUint16(buffer, pageStart + pageHeaderOffset + 3);
  const rows = [];

  if (pageType === 0x0d) {
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 8 + index * 2);
      let cursor = pageStart + cellOffset;
      const payloadLength = readVarint(buffer, cursor);
      cursor += payloadLength.length;
      const rowId = readVarint(buffer, cursor);
      cursor += rowId.length;

      const payload = readPayload(database, cursor, payloadLength.value);
      rows.push({ rowid: rowId.value, values: parseRecord(payload, 0) });
    }

    return rows;
  }

  if (pageType === 0x05) {
    for (let index = 0; index < cellCount; index += 1) {
      const cellOffset = readUint16(buffer, pageStart + pageHeaderOffset + 12 + index * 2);
      const childPage = readUint32(buffer, pageStart + cellOffset);
      rows.push(...readTableLeafRows(database, childPage));
    }

    const rightMostPage = readUint32(buffer, pageStart + pageHeaderOffset + 8);
    if (rightMostPage > 0 && rightMostPage <= Math.ceil(buffer.length / pageSize)) {
      rows.push(...readTableLeafRows(database, rightMostPage));
    }

    return rows;
  }

  throw new Error(`SQLite-Seitentyp ${pageType} wird im MVP noch nicht gelesen.`);
}

function parseColumnNames(createSql) {
  const start = createSql.indexOf("(");
  const end = createSql.lastIndexOf(")");

  if (start === -1 || end === -1) return [];

  return createSql
    .slice(start + 1, end)
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0].replace(/["'`[\]]/g, ""))
    .filter((name) => name && !["primary", "foreign", "unique", "constraint", "check"].includes(name.toLowerCase()));
}

function rowsToObjects(rows, columnNames) {
  return rows.map(({ rowid, values }) => {
    const row = { rowid };

    columnNames.forEach((columnName, index) => {
      row[columnName] = values[index];
    });

    return row;
  });
}

export function readSqliteDatabase(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const signature = sqliteTextDecoder.decode(bytes.slice(0, 16));

  if (signature !== "SQLite format 3\0") {
    throw new Error("Die Anki-Collection ist keine gueltige SQLite-Datenbank.");
  }

  const rawPageSize = readUint16(bytes, 16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const database = { buffer: bytes, pageSize, reservedSpace: bytes[20] ?? 0 };
  const masterRows = readTableLeafRows(database, 1);
  const masterObjects = rowsToObjects(masterRows, ["type", "name", "tbl_name", "rootpage", "sql"]);
  const tables = new Map();

  for (const table of masterObjects.filter((row) => row.type === "table" && row.rootpage)) {
    tables.set(table.name, {
      ...table,
      columns: parseColumnNames(table.sql ?? ""),
    });
  }

  return {
    listTables() {
      return [...tables.keys()];
    },
    readTable(tableName) {
      const table = tables.get(tableName);

      if (!table) {
        return [];
      }

      return rowsToObjects(readTableLeafRows(database, table.rootpage), table.columns);
    },
  };
}
