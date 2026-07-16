import { createCoreCard, createCoreDeck, createReviewState, makeId, stableContentHash } from "./coreModel.ts";
import { stripHtml } from "./htmlSafety.ts";
import { finalizeImportReport, findDuplicateLearningItem, importNormalizedDeck } from "./importService.ts";
import { readSqliteDatabase } from "./sqliteReader.ts";
import { readZipArchive } from "./zipReader.ts";
import { parseApkgWorkerResponse, type ApkgWorkerResult } from "./apkgImportWorkerProtocol.ts";
import { decompress as decompressZstd } from "fzstd";

const MAX_APKG_SIZE = 250 * 1024 * 1024;
const COLLECTION_NAMES = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const FIELD_SEPARATOR = "\u001f";
const SQLITE_SIGNATURE = "SQLite format 3\0";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const textDecoder = new TextDecoder("utf-8");

export interface AnkiImportIdentityV1 {
  version: 1;
  kind: "note" | "card";
  guid: string | null;
  noteId: string | null;
  cardId: string | null;
  notetypeId: string | null;
  templateOrdinal: number | null;
  templateName: string | null;
  deckId: string | null;
  deckPath: string | null;
  importGroupId: string | null;
}

export interface ApkgImportReportV1 {
  contractVersion: 1;
  packageFormat: string;
  mediaFormat: string;
  decks: Array<{ id: string; path: string; noteCount: number; cardCount: number }>;
  notetypes: Array<{
    id: string;
    name: string;
    classification: "basic" | "reverse" | "optional_reverse" | "cloze" | "custom";
    templates: Array<{ ordinal: number; name: string }>;
    mappedFields: string[];
    unmappedFields: string[];
  }>;
  media: {
    detected: number;
    referenced: string[];
    missing: string[];
    assets: Array<{ name: string; size: number; sha1: string }>;
  };
  reimport: { newItems: number; matchedItems: number; skippedItems: number; protectedLocalEdits: number };
  detectedDecks: Array<{ id: string; name: string }>;
  detectedNotes: number;
  detectedCards: number;
  detectedVariants: number;
  hasAnkiScheduling: boolean;
  mediaCount: number;
  hasMedia: boolean;
  missingMediaCount: number;
  mediaManifest: { format: string; assets: unknown[]; missingAssets: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
}

function parseJson(value: any, fallback: any) {
  if (!value || typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(rawTags: any) {
  return String(rawTags ?? "")
    .split(/\s+/)
    .map((tag: any) => tag.trim())
    .filter(Boolean);
}

function unique(values: any) {
  return [...new Set(values.filter(Boolean))];
}

function bytesToHex(bytes: any) {
  return [...bytes].map((byte: any) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeMediaFileName(value: any) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1);
}

function readVarint(bytes: any, startOffset: any = 0) {
  let result = 0;
  let shift = 0;
  let offset = startOffset;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    result += (byte & 0x7f) * 2 ** shift;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return { value: result, offset };
    }

    shift += 7;
  }

  throw new Error("Ungültiges MediaEntries-Varint.");
}

function readLengthDelimited(bytes: any, offset: any) {
  const length = readVarint(bytes, offset);
  return {
    bytes: bytes.slice(length.offset, length.offset + length.value),
    offset: length.offset + length.value,
  };
}

function skipProtoField(bytes: any, wireType: any, offset: any) {
  if (wireType === 0) return readVarint(bytes, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) return readLengthDelimited(bytes, offset).offset;
  if (wireType === 5) return offset + 4;
  throw new Error(`Nicht unterstützter MediaEntries-Wire-Type: ${wireType}`);
}

function maybeDecompressZstdBytes(bytes: any) {
  if (!hasZstdSignature(bytes)) return bytes;

  try {
    return decompressZstd(bytes);
  } catch {
    return bytes;
  }
}

function rotateLeft(value: any, bits: any) {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1HexSync(bytes: any) {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let chunkOffset = 0; chunkOffset < paddedLength; chunkOffset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(chunkOffset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;

      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((word: any) => word.toString(16).padStart(8, "0")).join("");
}

async function sha1Hex(bytes: any) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  return sha1HexSync(bytes);
}

function inferMimeType(name: any, bytes: any = new Uint8Array()) {
  const normalized = String(name ?? "").toLowerCase();

  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".ogg")) return "audio/ogg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function getDecksFromCollection(colRows: any) {
  const first = colRows[0] ?? {};
  const deckMap = parseJson(first.decks, {});

  return Object.values(deckMap).map((deck: any) => ({
    id: String(deck.id ?? ""),
    name: deck.name ?? "Anki Deck",
  }));
}

function getModelsFromCollection(colRows: any) {
  const first = colRows[0] ?? {};
  return parseJson(first.models, {});
}

function buildDeckHierarchy(decks: any) {
  const nodeByPath = new Map();

  for (const deck of decks) {
    const parts = String(deck.name ?? "Anki Deck")
      .split("::")
      .map((part: any) => part.trim())
      .filter(Boolean);

    parts.forEach((part: any, index: any) => {
      const path = parts.slice(0, index + 1).join("::");
      const parentPath = parts.slice(0, index).join("::") || null;
      if (!nodeByPath.has(path)) {
        nodeByPath.set(path, {
          id: index === parts.length - 1 ? String(deck.id) : `virtual_${path}`,
          name: part,
          path,
          parentPath,
          depth: index,
        });
      }
    });
  }

  return [...nodeByPath.values()];
}

function splitDeckPath(value: any) {
  return String(value ?? "Anki Deck")
    .split("::")
    .map((part: any) => part.trim())
    .filter(Boolean);
}

function hierarchyExternalId(node: any) {
  return String(node.id ?? "").startsWith("virtual_") ? `anki-deck-path-${node.path}` : `anki-deck-${String(node.id)}`;
}

function hierarchyDeckId({ fileName, sourceExternalId, path }: any) {
  return stableContentHash({ fileName, sourceExternalId, path }, "deck");
}

function createImportGroupId(normalizedDeck: any = {}) {
  const metadata = normalizedDeck.metadataJson ?? {};
  return stableContentHash(
    {
      fileName: metadata.fileName ?? null,
      fileSize: metadata.fileSize ?? null,
      sourceExternalId: normalizedDeck.sourceExternalId ?? null,
      detectedDeckIds: metadata.detectedDeckIds ?? [],
    },
    "apkg_import",
  );
}

function splitNormalizedApkgDeckByHierarchy(normalizedDeck: any = {}) {
  const metadata = normalizedDeck.metadataJson ?? {};
  const hierarchy = Array.isArray(metadata.deckHierarchy) ? metadata.deckHierarchy : [];
  const importGroupId = createImportGroupId(normalizedDeck);
  const fileName = metadata.fileName ?? normalizedDeck.title ?? "Anki APKG";

  if (hierarchy.length === 0) {
    const sourceExternalId = normalizedDeck.sourceExternalId ?? `anki-deck-path-${normalizedDeck.title ?? "Anki Deck"}`;
    const id = normalizedDeck.id ?? hierarchyDeckId({ fileName, sourceExternalId, path: normalizedDeck.title });
    return {
      importGroupId,
      rootDeckIds: [id],
      normalizedDecks: [
        {
          ...normalizedDeck,
          id,
          originalDeckId: sourceExternalId,
          hierarchyPath: normalizedDeck.hierarchyPath ?? splitDeckPath(normalizedDeck.title),
          metadataJson: {
            ...metadata,
            importGroupId,
            hierarchyMode: "single_deck",
          },
        },
      ],
    };
  }

  const nodeByPath = new Map(hierarchy.map((node: any) => [node.path, node]));
  const idByPath = new Map();
  const itemsByPath = new Map();

  for (const item of normalizedDeck.items ?? []) {
    const itemMetadata = item.metadataJson ?? {};
    const ankiDeckName = itemMetadata.ankiDeckNames?.[0] ?? metadata.detectedDecks?.find((deck: any) => String(deck.id) === String(itemMetadata.ankiDeckId))?.name ?? normalizedDeck.title;
    const path = splitDeckPath(ankiDeckName).join("::") || normalizedDeck.title;
    itemsByPath.set(path, [...(itemsByPath.get(path) ?? []), item]);
  }

  for (const node of hierarchy) {
    const sourceExternalId = hierarchyExternalId(node);
    idByPath.set(node.path, hierarchyDeckId({ fileName, sourceExternalId, path: node.path }));
  }

  for (const path of itemsByPath.keys()) {
    if (nodeByPath.has(path)) continue;
    const parts = splitDeckPath(path);
    const parentPath = parts.slice(0, -1).join("::") || null;
    const node = {
      id: `virtual_${path}`,
      name: parts.at(-1) ?? path,
      path,
      parentPath,
      depth: Math.max(0, parts.length - 1),
    };
    nodeByPath.set(path, node);
    idByPath.set(path, hierarchyDeckId({ fileName, sourceExternalId: hierarchyExternalId(node), path }));
  }

  const nodes = [...nodeByPath.values()].sort((left: any, right: any) => Number(left.depth ?? 0) - Number(right.depth ?? 0) || String(left.path).localeCompare(String(right.path)));
  const normalizedDecks = nodes.map((node: any) => {
    const sourceExternalId = hierarchyExternalId(node);
    const hierarchyPath = splitDeckPath(node.path);
    const directItems = itemsByPath.get(node.path) ?? [];
    const isContainerDeck = directItems.length === 0;

    return {
      ...normalizedDeck,
      id: idByPath.get(node.path),
      title: node.name,
      sourceExternalId,
      originalDeckId: sourceExternalId,
      parentDeckId: node.parentPath ? idByPath.get(node.parentPath) ?? null : null,
      hierarchyPath,
      items: directItems,
      tags: unique(directItems.flatMap((item: any) => item.tags ?? [])),
      metadataJson: {
        ...metadata,
        importGroupId,
        hierarchyMode: "anki_subdecks",
        ankiDeckPath: node.path,
        ankiDeckDepth: node.depth ?? Math.max(0, hierarchyPath.length - 1),
        ankiParentPath: node.parentPath ?? null,
        isContainerDeck,
        detectedCards: directItems.reduce((sum: any, item: any) => sum + Math.max(1, item.variants?.length ?? 1), 0),
        importedScheduling: false,
      },
    };
  });

  return {
    importGroupId,
    rootDeckIds: normalizedDecks.filter((deck: any) => !deck.parentDeckId).map((deck: any) => deck.id),
    normalizedDecks,
  };
}

function extractMediaRefs(html: any) {
  const refs: any[] = [];
  const mediaPattern = /(?:src|href)=["']([^"']+)["']|\[sound:([^\]]+)\]/gi;
  let match = mediaPattern.exec(html ?? "");

  while (match) {
    refs.push(match[1] ?? match[2]);
    match = mediaPattern.exec(html ?? "");
  }

  return unique(refs);
}

function extractClozeText(value: any) {
  return String(value ?? "").replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1");
}

function fieldNamesForNote(note: any, models: any) {
  const model = models[String(note.mid)];
  const fields = Array.isArray(model?.flds) ? model.flds : [];
  return fields.map((field: any, index: any) => field.name ?? `Field ${index + 1}`);
}

function parseFields(note: any, models: any) {
  const values = String(note.flds ?? "").split(FIELD_SEPARATOR);
  const names = fieldNamesForNote(note, models);

  return values.map((value: any, index: any) => ({
    name: names[index] ?? `Field ${index + 1}`,
    value,
  }));
}

function chooseFrontBack(note: any, models: any) {
  const fields = parseFields(note, models);
  const first = fields[0]?.value ?? "";
  const second = fields[1]?.value ?? "";
  const clozeSource = fields.map((field: any) => field.value).find((value: any) => /\{\{c\d+::/i.test(value));

  if (clozeSource) {
    const clean = extractClozeText(clozeSource);
    return {
      front: clozeSource,
      back: clean,
      isCloze: true,
      fields,
    };
  }

  return {
    front: first,
    back: second || fields.slice(1).map((field: any) => field.value).join("<br>"),
    isCloze: false,
    fields,
  };
}

function getMediaAssetCount(mediaMap: any = {}, mediaManifest: any = null) {
  return mediaManifest?.assets?.length ?? Object.keys(mediaMap).length;
}

function cardHasAnkiSchedulingData(card: any = {}) {
  return ["reps", "lapses", "ivl", "type", "queue", "odue", "odid"].some((key: any) => Number(card[key] ?? 0) > 0);
}

function createAnkiSchedulingSnapshot(card: any = {}) {
  return {
    due: card.due ?? null,
    interval: card.ivl ?? null,
    factor: card.factor ?? null,
    reps: card.reps ?? null,
    lapses: card.lapses ?? null,
    type: card.type ?? null,
    queue: card.queue ?? null,
    odue: card.odue ?? null,
    odid: card.odid ?? null,
  };
}

function getModelForNote(note: any, models: any) {
  return models[String(note?.mid)] ?? {};
}

function getTemplateForCard(card: any, model: any = {}) {
  const templates = Array.isArray(model.tmpls) ? model.tmpls : [];
  const ord = Number(card?.ord ?? 0);
  return templates.find((template: any) => Number(template.ord ?? -1) === ord) ?? templates[ord] ?? null;
}

function getTemplateName(card: any, model: any = {}) {
  return getTemplateForCard(card, model)?.name ?? (Number(card?.ord ?? 0) > 0 ? `Card ${Number(card.ord) + 1}` : "Card 1");
}

function resolveAnkiCardFace({ card, note, models, warnings }: any) {
  const fields = parseFields(note, models);
  const frontBack = chooseFrontBack(note, models);
  const model = getModelForNote(note, models);
  const modelName = model.name ?? "Unknown Note Type";
  const templateName = getTemplateName(card, model);
  const ord = Number(card.ord ?? 0);

  if (frontBack.isCloze) {
    return {
      front: frontBack.front,
      back: frontBack.back,
      variantType: "cloze",
      variantLevel: ord === 0 ? 1 : 2,
      modelName,
      templateName,
      fields,
      isCloze: true,
    };
  }

  const first = fields[0]?.value ?? frontBack.front;
  const second = fields[1]?.value ?? frontBack.back;
  const canReverse = Boolean(first && second) && /reverse|reversed|umgekehrt/i.test(`${modelName} ${templateName}`);

  if (canReverse && ord > 0) {
    return {
      front: second,
      back: first,
      variantType: "reverse",
      variantLevel: 2,
      modelName,
      templateName,
      fields,
      isCloze: false,
    };
  }

  if (ord > 0 && !canReverse) {
    warnings.push(`Anki-Karte ${String(card.id ?? "")}: Template ${templateName} wurde als einfache importierte Variante gemappt.`);
  }

  return {
    front: frontBack.front,
    back: frontBack.back,
    variantType: "basic",
    variantLevel: 1,
    modelName,
    templateName,
    fields,
    isCloze: false,
  };
}

function createNormalizedMediaAssets(mediaManifest: any = null) {
  return (mediaManifest?.assets ?? []).map((asset: any) => ({
    filename: asset.name,
    mimeType: asset.mimeType,
    sourceExternalId: asset.zipEntryName ?? asset.sha1 ?? asset.name,
    originalPath: asset.zipEntryName ?? asset.name,
    metadataJson: {
      sha1: asset.sha1,
      size: asset.size,
      ankiMediaId: asset.zipEntryName ?? null,
      source: "apkg-media-manifest",
    },
  }));
}

export function validateApkgFile(file: any) {
  const errors: any[] = [];

  if (!file) {
    errors.push("Bitte wähle eine .apkg-Datei aus.");
  }

  if (file && !file.name.toLowerCase().endsWith(".apkg")) {
    errors.push("Es werden nur Anki-Decks im .apkg-Format akzeptiert.");
  }

  if (file && file.size > MAX_APKG_SIZE) {
    errors.push("Die Datei ist größer als 250 MB und wird im MVP nicht direkt im Browser importiert.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function extractApkgArchive(file: any) {
  return readZipArchive(file);
}

export function findCollectionDatabase(archive: any) {
  const collectionName = COLLECTION_NAMES.find((name: any) => archive.getEntry(name));

  if (!collectionName) {
    throw new Error("Keine Anki-Collection gefunden. Erwartet wurde collection.anki2, collection.anki21 oder collection.anki21b.");
  }

  return archive.getEntry(collectionName);
}

function hasSqliteSignature(bytes: any) {
  return textDecoder.decode(bytes.slice(0, SQLITE_SIGNATURE.length)) === SQLITE_SIGNATURE;
}

function hasZstdSignature(bytes: any) {
  return ZSTD_MAGIC.every((byte: any, index: any) => bytes[index] === byte);
}

export async function findReadableCollectionDatabase(archive: any) {
  const entries = COLLECTION_NAMES.map((name: any) => archive.getEntry(name)).filter(Boolean);

  if (entries.length === 0) {
    throw new Error("Keine Anki-Collection gefunden. Erwartet wurde collection.anki2, collection.anki21 oder collection.anki21b.");
  }

  for (const entry of entries) {
    const bytes = await entry.readBytes();

    if (hasSqliteSignature(bytes)) {
      return {
        entry,
        bytes,
      };
    }

    if (hasZstdSignature(bytes)) {
      let decompressedBytes = null;

      try {
        decompressedBytes = decompressZstd(bytes);
      } catch {
        decompressedBytes = null;
      }

      if (decompressedBytes && hasSqliteSignature(decompressedBytes)) {
        return {
          entry,
          bytes: decompressedBytes,
        };
      }
    }
  }

  throw new Error("Keine lesbare SQLite-Collection gefunden. Dieses APKG nutzt vermutlich ein neueres Collection-Format, das der lokale MVP noch nicht entpacken kann.");
}

export async function readAnkiDatabase(collectionEntry: any) {
  const bytes = maybeDecompressZstdBytes(await collectionEntry.readBytes());
  return readSqliteDatabase(bytes);
}

export function parseAnkiDecks(database: any) {
  const deckRows = database.readTable("decks");

  if (deckRows.length > 0) {
    return deckRows
      .map((deck: any) => ({
        id: String(deck.id ?? deck.rowid ?? ""),
        name: normalizeAnkiDeckPath(deck.name),
      }))
      .sort((left: any, right: any) => {
        const leftDefault = left.name === "Default" ? 1 : 0;
        const rightDefault = right.name === "Default" ? 1 : 0;
        return leftDefault - rightDefault;
      });
  }

  return getDecksFromCollection(database.readTable("col")).map((deck: any) => ({
    ...deck,
    name: normalizeAnkiDeckPath(deck.name),
  }));
}

export function parseAnkiNotes(database: any) {
  return database.readTable("notes");
}

export function parseAnkiCards(database: any) {
  return database.readTable("cards");
}

export function parsePackageMetadataBytes(bytes: any) {
  const metadata: { version: string; rawVersion?: number } = {
    version: "unknown",
  };

  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (fieldNumber === 1 && wireType === 0) {
      const version = readVarint(bytes, offset);
      metadata.version = version.value === 3 ? "latest" : `legacy-${version.value}`;
      metadata.rawVersion = version.value;
      offset = version.offset;
    } else {
      offset = skipProtoField(bytes, wireType, offset);
    }
  }

  return metadata;
}

export function parseMediaEntriesBytes(bytes: any) {
  const entries: any[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (fieldNumber !== 1 || wireType !== 2) {
      offset = skipProtoField(bytes, wireType, offset);
      continue;
    }

    const message = readLengthDelimited(bytes, offset);
    offset = message.offset;
    let entryOffset = 0;
    const entry: { name: string; size: number; sha1: string; legacyZipFileName: string | null } = {
      name: "",
      size: 0,
      sha1: "",
      legacyZipFileName: null,
    };

    while (entryOffset < message.bytes.length) {
      const entryTag = readVarint(message.bytes, entryOffset);
      entryOffset = entryTag.offset;
      const entryFieldNumber = entryTag.value >> 3;
      const entryWireType = entryTag.value & 0x07;

      if (entryFieldNumber === 1 && entryWireType === 2) {
        const value = readLengthDelimited(message.bytes, entryOffset);
        entry.name = textDecoder.decode(value.bytes);
        entryOffset = value.offset;
      } else if (entryFieldNumber === 2 && entryWireType === 0) {
        const value = readVarint(message.bytes, entryOffset);
        entry.size = value.value;
        entryOffset = value.offset;
      } else if (entryFieldNumber === 3 && entryWireType === 2) {
        const value = readLengthDelimited(message.bytes, entryOffset);
        entry.sha1 = bytesToHex(value.bytes);
        entryOffset = value.offset;
      } else if (entryFieldNumber === 255 && entryWireType === 0) {
        const value = readVarint(message.bytes, entryOffset);
        entry.legacyZipFileName = String(value.value);
        entryOffset = value.offset;
      } else {
        entryOffset = skipProtoField(message.bytes, entryWireType, entryOffset);
      }
    }

    if (entry.name && entry.sha1) {
      entries.push(entry);
    }
  }

  return entries;
}

export async function parseAnkiPackageMetadata(archive: any) {
  const metaEntry = archive.getEntry("meta");

  if (!metaEntry) {
    return { version: archive.getEntry("collection.anki21") ? "legacy-2" : "legacy-1" };
  }

  const bytes = maybeDecompressZstdBytes(await metaEntry.readBytes());
  return parsePackageMetadataBytes(bytes);
}

function createEmptyMediaBundle(format: any = "none", metadata: any = {}) {
  return {
    format,
    mediaMap: {},
    mediaFiles: [],
    manifest: {
      format,
      assets: [],
      missingAssets: [],
      ...metadata,
    },
  };
}

async function readArchiveMediaBytes(archive: any, entryName: any) {
  const entry = archive.getEntry(String(entryName));
  if (!entry) return null;
  return maybeDecompressZstdBytes(await entry.readBytes());
}

async function collectLegacyMediaBundle(archive: any, mediaMap: any, metadata: any) {
  const mediaFiles: any[] = [];

  for (const [zipEntryName, name] of Object.entries(mediaMap)) {
    const bytes = await readArchiveMediaBytes(archive, zipEntryName);
    if (!bytes) continue;

    const normalizedName = normalizeMediaFileName(name);
    const sha1 = await sha1Hex(bytes);
    mediaFiles.push({
      name: normalizedName,
      zipEntryName: String(zipEntryName),
      sha1,
      size: bytes.length,
      mimeType: inferMimeType(normalizedName, bytes),
      bytes,
    });
  }

  return {
    format: "legacy-json",
    mediaMap,
    mediaFiles,
    manifest: {
      format: "legacy-json",
      packageVersion: metadata.version,
      assets: mediaFiles.map(({ bytes, ...asset }: any) => asset),
      missingAssets: Object.entries(mediaMap)
        .filter(([zipEntryName]: any) => !mediaFiles.some((file: any) => file.zipEntryName === String(zipEntryName)))
        .map(([zipEntryName, name]: any) => ({ name: normalizeMediaFileName(name), zipEntryName: String(zipEntryName) })),
    },
  };
}

function listNumericMediaEntries(archive: any) {
  if (typeof archive.listEntries !== "function") return [];

  return archive
    .listEntries()
    .filter((entry: any) => /^\d+$/.test(entry.name))
    .sort((left: any, right: any) => Number(left.name) - Number(right.name));
}

async function collectModernMediaBundle(archive: any, mediaEntries: any, metadata: any) {
  const mediaMap: Record<string, any> = {};
  const mediaFiles: any[] = [];
  const availableFiles: any[] = [];

  for (const entry of listNumericMediaEntries(archive)) {
    const bytes = await readArchiveMediaBytes(archive, entry.name);
    if (!bytes) continue;

    const sha1 = await sha1Hex(bytes);
    availableFiles.push({
      zipEntryName: entry.name,
      sha1,
      size: bytes.length,
      bytes,
    });
  }

  for (const manifestEntry of mediaEntries) {
    const matched =
      (manifestEntry.legacyZipFileName
        ? availableFiles.find((file: any) => file.zipEntryName === manifestEntry.legacyZipFileName)
        : null) ??
      availableFiles.find((file: any) => file.sha1 === manifestEntry.sha1 && file.size === manifestEntry.size);

    if (!matched) continue;

    const normalizedName = normalizeMediaFileName(manifestEntry.name);
    mediaMap[matched.zipEntryName] = normalizedName;
    mediaFiles.push({
      name: normalizedName,
      zipEntryName: matched.zipEntryName,
      sha1: manifestEntry.sha1,
      size: manifestEntry.size,
      mimeType: inferMimeType(normalizedName, matched.bytes),
      bytes: matched.bytes,
    });
  }

  const matchedNames = new Set(mediaFiles.map((file: any) => file.name));

  return {
    format: "media-entries",
    mediaMap,
    mediaFiles,
    manifest: {
      format: "media-entries",
      packageVersion: metadata.version,
      assets: mediaEntries.map((entry: any) => {
        const normalizedName = normalizeMediaFileName(entry.name);
        const matched = mediaFiles.find((file: any) => file.name === normalizedName);
        return {
          name: normalizedName,
          zipEntryName: matched?.zipEntryName ?? entry.legacyZipFileName ?? null,
          sha1: entry.sha1,
          size: entry.size,
          mimeType: matched?.mimeType ?? inferMimeType(normalizedName),
        };
      }),
      missingAssets: mediaEntries
        .filter((entry: any) => !matchedNames.has(normalizeMediaFileName(entry.name)))
        .map((entry: any) => ({
          name: normalizeMediaFileName(entry.name),
          sha1: entry.sha1,
          size: entry.size,
        })),
    },
  };
}

export async function parseAnkiMedia(archive: any) {
  const mediaEntry = archive.getEntry("media");
  const metadata = await parseAnkiPackageMetadata(archive);

  if (!mediaEntry) {
    return createEmptyMediaBundle("none", { packageVersion: metadata.version });
  }

  const mediaBytes = maybeDecompressZstdBytes(await mediaEntry.readBytes());
  const mediaJson = textDecoder.decode(mediaBytes);
  const legacyMap = parseJson(mediaJson, null);

  if (legacyMap && typeof legacyMap === "object" && !Array.isArray(legacyMap)) {
    return collectLegacyMediaBundle(archive, legacyMap, metadata);
  }

  const mediaEntries = parseMediaEntriesBytes(mediaBytes);
  if (mediaEntries.length > 0) {
    return collectModernMediaBundle(archive, mediaEntries, metadata);
  }

  return createEmptyMediaBundle("unknown", { packageVersion: metadata.version });
}

export function mapAnkiToCoreDeck({ file, decks, notes, cards, colRows, mediaMap = {}, mediaManifest = null }: any) {
  const models = getModelsFromCollection(colRows);
  const deckById = new Map<any, any>(decks.map((deck: any) => [deck.id, deck]));
  const noteById = new Map<any, any>(notes.map((note: any) => [String(note.id), note]));
  const primaryDeck = decks[0] ?? { id: "unknown", name: file.name.replace(/\.apkg$/i, "") };
  const unsupportedNoteTypes: any[] = [];
  const createdAt = new Date().toISOString();
  let hasCloze = false;

  const coreCards = cards
    .map((card: any) => {
      const note = noteById.get(String(card.nid));
      if (!note) return null;

      const deck = deckById.get(String(card.did)) ?? primaryDeck;
      const frontBack = chooseFrontBack(note, models);
      hasCloze = hasCloze || frontBack.isCloze;
      const model = models[String(note.mid)] ?? {};
      const modelName = model.name ?? "Unknown Note Type";
      const isKnownType = frontBack.isCloze || frontBack.fields.length <= 2 || /basic|cloze/i.test(modelName);
      if (!isKnownType && !unsupportedNoteTypes.includes(modelName)) {
        unsupportedNoteTypes.push(modelName);
      }
      const originalHtml = [frontBack.front, frontBack.back].filter(Boolean).join("<hr>");
      const mediaRefs = unique([
        ...extractMediaRefs(originalHtml),
        ...Object.values(mediaMap).filter((name: any) => originalHtml.includes(String(name))),
        ...(mediaManifest?.assets ?? []).map((asset: any) => asset.name).filter((name: any) => originalHtml.includes(String(name))),
      ]).map(String);

      return createCoreCard({
        deckId: "",
        source: "anki-apkg",
        sourceCardId: String(card.id),
        sourceNoteId: String(note.id),
        originalFront: frontBack.front,
        originalBack: frontBack.back,
        originalFields: frontBack.fields,
        originalTags: normalizeTags(note.tags),
        originalHtml,
        mediaRefs,
        cardType: frontBack.isCloze ? "cloze" : Number(card.ord ?? 0) > 0 ? "basic-reversed" : "basic",
        draftStatus: "accepted",
        reviewState: createReviewState({
          reviewableType: "card",
          intervalDays: 0,
          ease: Number(card.factor ?? 2500) / 1000 || 2.5,
          repetitions: 0,
          lapses: 0,
          maturityXp: 0,
          sourceSchedulerData: {
            due: card.due ?? null,
            interval: card.ivl ?? null,
            factor: card.factor ?? null,
            reps: card.reps ?? null,
            lapses: card.lapses ?? null,
            type: card.type ?? null,
            queue: card.queue ?? null,
          },
        }),
        createdAt,
        meta: {
          sourceDeckId: String(deck.id),
          sourceDeckName: deck.name,
          ankiOrd: card.ord,
          ankiModelName: modelName,
          unsupportedNoteType: !isKnownType,
          rawAnki: {
            note,
            card,
          },
        },
      });
    })
    .filter(Boolean);

  const deckTags = unique(coreCards.flatMap((card: any) => card.originalTags));

  return createCoreDeck({
    name: primaryDeck.name,
    source: "anki-apkg",
    originalDeckId: primaryDeck.id,
    createdAt,
    tags: deckTags,
    importMeta: {
      fileName: file.name,
      fileSize: file.size,
      detectedDecks: decks,
      detectedNotes: notes.length,
      detectedCards: cards.length,
      mediaCount: getMediaAssetCount(mediaMap, mediaManifest),
      hasMedia: getMediaAssetCount(mediaMap, mediaManifest) > 0,
      mediaManifest: mediaManifest ?? {
        format: "none",
        assets: [],
        missingAssets: [],
      },
      hasCloze,
      deckHierarchy: buildDeckHierarchy(decks),
      unsupportedNoteTypes,
      learningProgressStatus: "raw-data-preserved-neutral-state",
    },
    cards: coreCards,
  });
}

export function mapAnkiApkgToNormalizedDeck({ file = {}, decks = [], notes = [], cards = [], colRows = [], models: suppliedModels = null, mediaMap = {}, mediaManifest = null }: any = {}) {
  const models = suppliedModels ?? getModelsFromCollection(colRows);
  const deckById = new Map<any, any>(decks.map((deck: any) => [String(deck.id), deck]));
  const noteById = new Map(notes.map((note: any) => [String(note.id), note]));
  const cardsByNoteId = new Map();
  const warnings: any[] = [];
  const errors: any[] = [];
  const unsupportedNoteTypes: any[] = [];
  const primaryDeck = decks[0] ?? { id: "unknown", name: String(file.name ?? "Anki Deck").replace(/\.apkg$/i, "") };
  const importGroupId = stableContentHash(
    {
      fileName: file.name ?? null,
      deckIds: decks.map((deck: any) => String(deck.id ?? "")).filter(Boolean),
    },
    "apkg_import",
  );
  let hasCloze = false;
  let hasAnkiScheduling = false;

  for (const card of cards) {
    const noteId = String(card.nid ?? "");
    if (!noteId) {
      warnings.push(`Anki-Karte ${String(card.id ?? "")}: keine Note-ID erkannt.`);
      continue;
    }
    cardsByNoteId.set(noteId, [...(cardsByNoteId.get(noteId) ?? []), card]);
  }

  const items: any[] = [];

  for (const note of notes) {
    const noteCards = (cardsByNoteId.get(String(note.id)) ?? []).sort((left: any, right: any) => {
      const byOrd = Number(left.ord ?? 0) - Number(right.ord ?? 0);
      return byOrd || String(left.id ?? "").localeCompare(String(right.id ?? ""));
    });

    if (noteCards.length === 0) continue;

    const itemWarnings: any[] = [];
    const model = getModelForNote(note, models);
    const modelName = model.name ?? "Unknown Note Type";
    const noteGuid = String(note.guid ?? "").trim() || null;
    const notetypeId = note.mid == null ? null : String(note.mid);
    const fields = parseFields(note, models);
    const tags = normalizeTags(note.tags);
    const sourceDeckIds = unique(noteCards.map((card: any) => String(card.did ?? "")));
    const sourceDeckNames = unique(sourceDeckIds.map((deckId: any) => deckById.get(deckId)?.name ?? primaryDeck.name));
    const noteHasScheduling = noteCards.some(cardHasAnkiSchedulingData);
    const variants: any[] = [];

    if (!modelName || (!/basic|cloze/i.test(modelName) && fields.length > 2)) {
      unsupportedNoteTypes.push(modelName);
    }

    hasAnkiScheduling = hasAnkiScheduling || noteHasScheduling;

    noteCards.forEach((card: any, index: any) => {
      const face = resolveAnkiCardFace({ card, note, models, warnings: itemWarnings });
      hasCloze = hasCloze || face.isCloze;
      const original = index === 0;
      const sourceDeck = deckById.get(String(card.did ?? "")) ?? primaryDeck;

      variants.push({
        front: face.front,
        back: face.back,
        variantType: face.variantType,
        variantLevel: original ? 1 : face.variantLevel,
        generationSource: original ? "original" : "imported",
        sourceExternalId: card.id == null ? null : `anki-card-${String(card.id)}`,
        isOriginal: original,
        anchorToOriginal: !original,
        metadataJson: {
          ankiImportIdentityV1: {
            version: 1,
            kind: "card",
            guid: noteGuid,
            noteId: note.id == null ? null : String(note.id),
            cardId: card.id == null ? null : String(card.id),
            notetypeId,
            templateOrdinal: Number(card.ord ?? 0),
            templateName: face.templateName,
            deckId: sourceDeck.id == null ? null : String(sourceDeck.id),
            deckPath: sourceDeck.name ?? null,
            importGroupId,
          } satisfies AnkiImportIdentityV1,
          ankiCardId: card.id == null ? null : String(card.id),
          ankiTemplateOrd: card.ord ?? null,
          ankiTemplateName: face.templateName,
          ankiModelName: face.modelName,
          ankiDeckId: sourceDeck.id == null ? null : String(sourceDeck.id),
          ankiDeckName: sourceDeck.name ?? null,
          schedulingImported: false,
          hasAnkiScheduling: cardHasAnkiSchedulingData(card),
        },
      });
    });

    const originalVariant = variants.find((variant: any) => variant.isOriginal) ?? variants[0] ?? null;
    const mediaRefs = unique([
      ...variants.flatMap((variant: any) => [...extractMediaRefs(variant.front), ...extractMediaRefs(variant.back)]),
      ...Object.values(mediaMap).filter((name: any) => variants.some((variant: any) => `${variant.front}${variant.back}`.includes(String(name)))),
      ...(mediaManifest?.assets ?? [])
        .map((asset: any) => asset.name)
        .filter((name: any) => variants.some((variant: any) => `${variant.front}${variant.back}`.includes(String(name)))),
    ]);

    warnings.push(...itemWarnings);

    items.push({
      title: stripHtml(originalVariant?.front ?? fields[0]?.value ?? `Anki Note ${String(note.id)}`).slice(0, 120),
      canonicalQuestion: originalVariant?.front ?? fields[0]?.value ?? "",
      canonicalAnswer: originalVariant?.back ?? fields[1]?.value ?? "",
      tags,
      sourceType: "anki_import",
      sourceExternalId: noteGuid ? `anki-guid-${noteGuid}` : note.id == null ? null : `anki-note-${String(note.id)}`,
      cardType: originalVariant?.variantType === "cloze" ? "cloze" : "basic",
      mediaRefs,
      originalFields: fields,
      variants,
      metadataJson: {
        ankiImportIdentityV1: {
          version: 1,
          kind: "note",
          guid: noteGuid,
          noteId: note.id == null ? null : String(note.id),
          cardId: null,
          notetypeId,
          templateOrdinal: null,
          templateName: null,
          deckId: sourceDeckIds[0] == null ? null : String(sourceDeckIds[0]),
          deckPath: sourceDeckNames[0] == null ? null : String(sourceDeckNames[0]),
          importGroupId,
        } satisfies AnkiImportIdentityV1,
        importFormat: "apkg",
        ankiNoteId: note.id == null ? null : String(note.id),
        ankiCardIds: noteCards.map((card: any) => String(card.id ?? "")),
        ankiDeckId: sourceDeckIds[0] ?? null,
        ankiDeckIds: sourceDeckIds,
        ankiDeckNames: sourceDeckNames,
        ankiModelName: modelName,
        ankiTemplateName: variants[0]?.metadataJson?.ankiTemplateName ?? null,
        ankiTags: tags,
        originalFields: fields,
        mediaRefs,
        scheduling: noteHasScheduling
          ? {
              hasAnkiScheduling: true,
              schedulingImported: false,
              sourceSchedulerData: noteCards.map(createAnkiSchedulingSnapshot),
            }
          : null,
      },
    });
  }

  const missingNoteIds = unique(cards.map((card: any) => String(card.nid ?? "")).filter((noteId: any) => noteId && !noteById.has(noteId)));
  if (missingNoteIds.length > 0) {
    warnings.push(`${missingNoteIds.length} Anki-Cards referenzieren Notes, die nicht gelesen werden konnten.`);
  }

  if (decks.length > 1) {
    warnings.push("Mehrere Anki-Decks wurden erkannt; CoRe legt daraus sichtbare Stapel und Unterstapel an.");
  }

  if (hasCloze) {
    warnings.push("Cloze-Karten wurden erkannt und als Cloze-Varianten importiert.");
  }

  if (getMediaAssetCount(mediaMap, mediaManifest) > 0) {
    warnings.push("APKG-Medien wurden erkannt; Referenzen und Manifest bleiben erhalten, produktive Medienablage bleibt ein späterer Ausbaupunkt.");
  }

  if ((mediaManifest?.missingAssets?.length ?? 0) > 0) {
    warnings.push(`${mediaManifest.missingAssets.length} APKG-Medien fehlen im Archiv und wurden nur im Report vermerkt.`);
  }

  if (hasAnkiScheduling) {
    warnings.push("Anki-Lernfortschritt erkannt, aber in diesem Schritt nicht übernommen.");
  }

  if (unsupportedNoteTypes.length > 0) {
    warnings.push(`Nicht vollständig verstandene Note Types wurden roh in metadataJson gesichert: ${unique(unsupportedNoteTypes).join(", ")}.`);
  }

  if (items.length === 0) {
    errors.push("Keine importierbaren Anki-Notes mit Cards erkannt.");
  }

  const mediaAssets = createNormalizedMediaAssets(mediaManifest);
  const detectedDeckIds = unique(cards.map((card: any) => String(card.did ?? "")).filter(Boolean));

  return {
    normalizedDeck: {
      title: primaryDeck.name ?? String(file.name ?? "Anki Deck").replace(/\.apkg$/i, ""),
      description: `Import aus ${file.name ?? "Anki APKG"}`,
      sourceType: "anki_import",
      sourceExternalId: primaryDeck.id == null ? null : `anki-deck-${String(primaryDeck.id)}`,
      tags: unique(items.flatMap((item: any) => item.tags)),
      items,
      mediaAssets,
      metadataJson: {
        importFormat: "apkg",
        parser: "mapAnkiApkgToNormalizedDeck",
        importGroupId,
        fileName: file.name ?? null,
        fileSize: file.size ?? null,
        detectedDecks: decks,
        detectedDeckIds,
        detectedNotes: notes.length,
        detectedCards: cards.length,
        detectedVariants: cards.length,
        importedScheduling: false,
        hasAnkiScheduling,
        hasCloze,
        hasMedia: getMediaAssetCount(mediaMap, mediaManifest) > 0,
        mediaCount: getMediaAssetCount(mediaMap, mediaManifest),
        mediaManifest: mediaManifest ?? {
          format: "none",
          assets: [],
          missingAssets: [],
        },
        deckHierarchy: buildDeckHierarchy(decks),
        unsupportedNoteTypes: unique(unsupportedNoteTypes),
      },
    },
    warnings: unique(warnings),
    errors,
  };
}

export function createImportPreview(coreDeck: any, warnings: any, mediaFiles: any = []) {
  return {
    deck: coreDeck,
    mediaFiles,
    sampleCards: coreDeck.cards.slice(0, 5).map((card: any) => ({
      ...card,
      plainFront: stripHtml(card.originalFront).slice(0, 240),
      plainBack: stripHtml(card.originalBack).slice(0, 240),
    })),
    warnings,
  };
}

async function readApkgPackage(file: any, onStep: any = () => {}) {
  onStep("validate");
  const archive = await extractApkgArchive(file);
  onStep("collection");
  const { bytes } = await findReadableCollectionDatabase(archive);
  const database = readSqliteDatabase(bytes);
  const colRows = database.readTable("col");
  onStep("cards");

  const decks = parseAnkiDecks(database);
  const notes = parseAnkiNotes(database);
  const cards = parseAnkiCards(database);
  const models = getModelsFromDatabase(database, colRows);
  const mediaBundle = await parseAnkiMedia(archive);

  return {
    file,
    archive,
    database,
    colRows,
    decks,
    notes,
    cards,
    models,
    mediaBundle,
  };
}

function isParsedAnkiPackage(input: any) {
  return Boolean(input && Array.isArray(input.decks) && Array.isArray(input.notes) && Array.isArray(input.cards));
}

function isApkgPreview(input: any) {
  return Boolean(input?.normalizedDeck || input?.preview?.normalizedDeck);
}

function emptyNormalizedApkgDeck(file: any = {}) {
  return {
    title: String(file.name ?? "Anki Import").replace(/\.apkg$/i, ""),
    sourceType: "anki_import",
    sourceExternalId: null,
    tags: [],
    items: [],
    mediaAssets: [],
    metadataJson: {
      importFormat: "apkg",
      fileName: file.name ?? null,
      fileSize: file.size ?? null,
      detectedDecks: [],
      detectedNotes: 0,
      detectedCards: 0,
      detectedVariants: 0,
      hasAnkiScheduling: false,
      schedulingImported: false,
      mediaManifest: {
        format: "none",
        assets: [],
        missingAssets: [],
      },
    },
  };
}

function classifyAnkiNotetype(model: any): ApkgImportReportV1["notetypes"][number]["classification"] {
  const nameAndTemplates = `${model?.name ?? ""} ${(model?.tmpls ?? []).map((template: any) => template.name).join(" ")}`;
  const fieldNames = (model?.flds ?? []).map((field: any) => String(field.name ?? ""));
  if (Number(model?.type ?? 0) === 1 || /cloze|lückentext/i.test(nameAndTemplates)) return "cloze";
  if (fieldNames.some((name: string) => /add reverse|umgekehrt hinzufügen/i.test(name))) return "optional_reverse";
  if (/reverse|reversed|umgekehrt/i.test(nameAndTemplates)) return "reverse";
  if (fieldNames.length > 2 || !/basic|einfach/i.test(nameAndTemplates)) return "custom";
  return "basic";
}

export function parseAnkiDatabasePackage(database: any, file: any, mediaBundle: any = null) {
  const colRows = database.readTable("col");
  return {
    file,
    database,
    colRows,
    decks: parseAnkiDecks(database),
    notes: parseAnkiNotes(database),
    cards: parseAnkiCards(database),
    models: getModelsFromDatabase(database, colRows),
    mediaBundle: mediaBundle ?? createEmptyMediaBundle(),
  };
}

function findExistingReportCard(item: any, existingDecks: any[]) {
  const identity = item?.metadataJson?.ankiImportIdentityV1 as AnkiImportIdentityV1 | undefined;
  const cards = existingDecks.flatMap((deck: any) => deck.cards ?? []);
  const byGuid = identity?.guid ? cards.find((card: any) => getAnkiNoteIdentity(card)?.guid === identity.guid) : null;
  if (byGuid) return byGuid;
  const sourceIds = [item?.sourceExternalId, identity?.noteId ? `anki-note-${identity.noteId}` : null].filter(Boolean).map(String);
  const bySource = cards.find((card: any) =>
    [card.sourceExternalId, card.sourceRefId, card.sourceCardId, card.meta?.normalizedImport?.sourceExternalId]
      .filter(Boolean)
      .map(String)
      .some((sourceId) => sourceIds.includes(sourceId)),
  );
  if (bySource) return bySource;
  const duplicate = findDuplicateLearningItem(existingDecks, item);
  return duplicate.duplicate ? cards.find((card: any) => card.id === duplicate.learningItemId) ?? null : null;
}

function createApkgReportDetails(parsed: any, normalizedDeck: any, existingDecks: any[] = [], baseReport: any = null): ApkgImportReportV1 {
  const metadata = normalizedDeck?.metadataJson ?? {};
  const detectedDecks = metadata.detectedDecks ?? parsed?.decks ?? [];
  const detectedNotes = metadata.detectedNotes ?? parsed?.notes?.length ?? normalizedDeck?.items?.length ?? 0;
  const detectedCards = metadata.detectedCards ?? parsed?.cards?.length ?? 0;
  const detectedVariants = metadata.detectedVariants ?? normalizedDeck?.items?.reduce((sum: any, item: any) => sum + (item.variants?.length ?? 0), 0) ?? 0;
  const hasAnkiScheduling = Boolean(metadata.hasAnkiScheduling ?? parsed?.cards?.some(cardHasAnkiSchedulingData));
  const mediaManifest = metadata.mediaManifest ?? parsed?.mediaBundle?.manifest ?? { format: "none", assets: [], missingAssets: [] };
  const parsedCards = parsed?.cards ?? [];
  const models = parsed?.models ?? getModelsFromCollection(parsed?.colRows ?? []);
  const cardsByDeckId = new Map<string, any[]>();
  for (const card of parsedCards) {
    const deckId = String(card.did ?? "");
    cardsByDeckId.set(deckId, [...(cardsByDeckId.get(deckId) ?? []), card]);
  }
  const reportDecks = detectedDecks.map((deck: any) => {
    const deckCards = cardsByDeckId.get(String(deck.id ?? "")) ?? [];
    return {
      id: String(deck.id ?? ""),
      path: normalizeAnkiDeckPath(deck.name),
      noteCount: new Set(deckCards.map((card: any) => String(card.nid ?? ""))).size,
      cardCount: deckCards.length,
    };
  });
  const usedNotetypeIds = new Set((parsed?.notes ?? []).map((note: any) => String(note.mid ?? "")));
  const notetypes = Object.entries(models)
    .filter(([id]) => usedNotetypeIds.size === 0 || usedNotetypeIds.has(id))
    .map(([id, value]: [string, any]) => {
      const fieldNames = (value?.flds ?? []).map((field: any) => String(field.name ?? ""));
      const classification = classifyAnkiNotetype(value);
      const mappedFieldCount = classification === "optional_reverse" ? fieldNames.length : Math.min(2, fieldNames.length);
      return {
        id,
        name: String(value?.name ?? "Unknown Note Type"),
        classification,
        templates: (value?.tmpls ?? []).map((template: any, index: number) => ({
          ordinal: Number(template.ord ?? index),
          name: String(template.name ?? `Card ${index + 1}`),
        })),
        mappedFields: fieldNames.slice(0, mappedFieldCount),
        unmappedFields: fieldNames.slice(mappedFieldCount),
      };
    });
  const referenced = unique((normalizedDeck?.items ?? []).flatMap((item: any) => item.mediaRefs ?? []).map(normalizeMediaFileName)) as string[];
  const assets = (mediaManifest?.assets ?? []).map((asset: any) => ({
    name: String(asset.name ?? ""),
    size: Number(asset.size ?? 0),
    sha1: String(asset.sha1 ?? ""),
  }));
  const availableNames = new Set(assets.map((asset: any) => asset.name));
  const missing = unique([
    ...(mediaManifest?.missingAssets ?? []).map((asset: any) => normalizeMediaFileName(asset.name)),
    ...referenced.filter((name: string) => !availableNames.has(name)),
  ]) as string[];
  const matches = (normalizedDeck?.items ?? []).map((item: any) => findExistingReportCard(item, existingDecks));
  const matchedItems = matches.filter(Boolean).length;

  return {
    contractVersion: 1,
    packageFormat: String(mediaManifest?.packageVersion ?? "unknown"),
    mediaFormat: String(mediaManifest?.format ?? parsed?.mediaBundle?.format ?? "none"),
    decks: reportDecks,
    notetypes,
    media: {
      detected: assets.length,
      referenced,
      missing,
      assets,
    },
    reimport: {
      newItems: Math.max(0, (normalizedDeck?.items?.length ?? 0) - matchedItems),
      matchedItems,
      skippedItems: Number(baseReport?.skipped?.length ?? 0) + Number(baseReport?.duplicates?.length ?? 0),
      protectedLocalEdits: matches.filter((card: any) => card && hasLocalContentEdit(card)).length,
    },
    detectedDecks,
    detectedNotes,
    detectedCards,
    detectedVariants,
    createdCoreItems: normalizedDeck?.items?.length ?? 0,
    variantCount: detectedVariants,
    duplicateCount: 0,
    hasAnkiScheduling,
    schedulingImported: false,
    mediaCount: metadata.mediaCount ?? getMediaAssetCount(parsed?.mediaBundle?.mediaMap, mediaManifest),
    hasMedia: Boolean(metadata.hasMedia ?? getMediaAssetCount(parsed?.mediaBundle?.mediaMap, mediaManifest) > 0),
    missingMediaCount: missing.length,
    mediaManifest,
  };
}

function attachApkgReportDetails(result: any, parsed: any, parsedWarnings: any = [], parsedErrors: any = [], options: any = {}) {
  const report = result.report;
  const details = createApkgReportDetails(parsed, result.normalizedDeck, options.existingDecks ?? [], report);
  const warnings = unique([...(parsedWarnings ?? []), ...(report.warnings ?? [])]);
  const errors = unique([...(parsedErrors ?? []), ...(report.errors ?? [])]);

  report.warnings = warnings;
  report.errors = errors;
  report.apkg = {
    ...details,
    duplicateCount: report.duplicates.length,
  };
  report.detectedNotes = details.detectedNotes;
  report.detectedCards = details.detectedCards;
  report.detectedVariants = details.detectedVariants;
  report.hasAnkiScheduling = details.hasAnkiScheduling;
  report.schedulingImported = false;
  report.mediaCount = details.mediaCount;
  report.missingMediaCount = details.missingMediaCount;
  report.summary = {
    ...report.summary,
    warnings: report.warnings.length,
    errors: report.errors.length,
    duplicates: report.duplicates.length,
  };
  return result;
}

function mergeImportReports(results: any = []) {
  const report = results[0]?.report
    ? { ...results[0].report }
    : {
        dryRun: false,
        createdDecks: 0,
        createdLearningItems: 0,
        createdCards: 0,
        createdVariants: 0,
        skipped: [],
        duplicates: [],
        warnings: [],
        errors: [],
        summary: {},
      };

  report.createdDecks = results.reduce((sum: any, result: any) => sum + Number(result.report?.createdDecks ?? 0), 0);
  report.createdLearningItems = results.reduce((sum: any, result: any) => sum + Number(result.report?.createdLearningItems ?? 0), 0);
  report.createdCards = report.createdLearningItems;
  report.createdVariants = results.reduce((sum: any, result: any) => sum + Number(result.report?.createdVariants ?? 0), 0);
  report.skipped = results.flatMap((result: any) => result.report?.skipped ?? []);
  report.duplicates = results.flatMap((result: any) => result.report?.duplicates ?? []);
  report.warnings = unique(results.flatMap((result: any) => result.report?.warnings ?? []));
  report.errors = unique(results.flatMap((result: any) => result.report?.errors ?? []));
  return finalizeImportReport(report);
}

function commitNormalizedApkgHierarchy(normalizedDeck: any, options: any = {}) {
  const hierarchy = splitNormalizedApkgDeckByHierarchy(normalizedDeck);
  const results = hierarchy.normalizedDecks.map((subDeck: any) =>
    importNormalizedDeck(subDeck, {
      ...options,
      dryRun: false,
      importScheduling: false,
    }),
  );
  const decks = results
    .map((result: any) => result.deck)
    .filter(Boolean)
    .map((createdDeck: any) => mergeImportedDeck(createdDeck, options.existingDecks ?? []));
  const rootOrder = new Map(hierarchy.normalizedDecks.map((deck: any, index: any) => [deck.id, index]));
  decks.sort((left: any, right: any) => (rootOrder.get(left.id) ?? 0) - (rootOrder.get(right.id) ?? 0));

  return {
    deck: decks[0] ?? null,
    decks,
    rootDeckIds: hierarchy.rootDeckIds,
    importGroupId: hierarchy.importGroupId,
    normalizedDeck,
    normalizedDecks: hierarchy.normalizedDecks,
    report: mergeImportReports(results),
  };
}

export async function parseApkgToNormalizedImport(fileOrParsed: any, options: any = {}) {
  if (isApkgPreview(fileOrParsed)) {
    const preview = fileOrParsed.preview ?? fileOrParsed;
    return {
      normalizedDeck: preview.normalizedDeck,
      warnings: preview.warnings ?? [],
      errors: [],
      mediaFiles: preview.mediaFiles ?? [],
      parsedPackage: null,
    };
  }

  if (isParsedAnkiPackage(fileOrParsed)) {
    const parsedPackage = {
      ...fileOrParsed,
      file: fileOrParsed.file ?? { name: "anki.apkg", size: 0 },
      colRows: fileOrParsed.colRows ?? [],
      mediaBundle: fileOrParsed.mediaBundle ?? {
        mediaMap: fileOrParsed.mediaMap ?? {},
        mediaFiles: fileOrParsed.mediaFiles ?? [],
        manifest: fileOrParsed.mediaManifest ?? {
          format: "none",
          assets: [],
          missingAssets: [],
        },
      },
    };
    const mapped = mapAnkiApkgToNormalizedDeck({
      file: parsedPackage.file,
      decks: parsedPackage.decks,
      notes: parsedPackage.notes,
      cards: parsedPackage.cards,
      colRows: parsedPackage.colRows,
      models: parsedPackage.models,
      mediaMap: parsedPackage.mediaBundle.mediaMap,
      mediaManifest: parsedPackage.mediaBundle.manifest,
    });

    return {
      ...mapped,
      mediaFiles: parsedPackage.mediaBundle.mediaFiles ?? [],
      parsedPackage,
    };
  }

  const file = fileOrParsed;
  const validation = validateApkgFile(file);
  if (!validation.valid) {
    return {
      normalizedDeck: emptyNormalizedApkgDeck(file),
      warnings: [],
      errors: validation.errors,
      mediaFiles: [],
      parsedPackage: null,
    };
  }

  try {
    const parsedPackage = await readApkgPackage(file, options.onStep ?? (() => {}));
    const mapped = mapAnkiApkgToNormalizedDeck({
      file,
      decks: parsedPackage.decks,
      notes: parsedPackage.notes,
      cards: parsedPackage.cards,
      colRows: parsedPackage.colRows,
      models: parsedPackage.models,
      mediaMap: parsedPackage.mediaBundle.mediaMap,
      mediaManifest: parsedPackage.mediaBundle.manifest,
    });
    options.onStep?.("preview");

    return {
      ...mapped,
      mediaFiles: parsedPackage.mediaBundle.mediaFiles,
      parsedPackage,
    };
  } catch (error) {
    return {
      normalizedDeck: emptyNormalizedApkgDeck(file),
      warnings: [],
      errors: [error instanceof Error ? error.message : "APKG konnte nicht gelesen werden."],
      mediaFiles: [],
      parsedPackage: null,
    };
  }
}

export async function dryRunApkgImport(fileOrParsed: any, options: any = {}) {
  const parsed = await parseApkgToNormalizedImport(fileOrParsed, options);
  if (parsed.errors.length > 0) {
    const result: any = importNormalizedDeck(parsed.normalizedDeck, {
      ...options,
      dryRun: true,
      importScheduling: false,
    });
    return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors, options);
  }

  const result: any = importNormalizedDeck(parsed.normalizedDeck, {
    ...options,
    dryRun: true,
    importScheduling: false,
  });
  result.mediaFiles = parsed.mediaFiles;
  return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors, options);
}

export async function commitApkgImport(fileOrParsed: any, options: any = {}) {
  const parsed = await parseApkgToNormalizedImport(fileOrParsed, options);
  if (parsed.errors.length > 0) {
    const result: any = importNormalizedDeck(parsed.normalizedDeck, {
      ...options,
      dryRun: true,
      importScheduling: false,
    });
    result.deck = null;
    result.decks = [];
    result.rootDeckIds = [];
    result.importGroupId = null;
    result.mediaFiles = parsed.mediaFiles;
    return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors, options);
  }

  const result: any = commitNormalizedApkgHierarchy(parsed.normalizedDeck, options);
  result.mediaFiles = parsed.mediaFiles;
  return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors, options);
}

export async function importApkgDeck(fileOrParsed: any, options: any = {}) {
  return commitApkgImport(fileOrParsed, options);
}

function normalizeAnkiDeckPath(value: unknown) {
  return String(value ?? "Anki Deck")
    .replaceAll(FIELD_SEPARATOR, "::")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("::");
}

function getModelsFromDatabase(database: any, colRows: any) {
  const legacyModels = getModelsFromCollection(colRows);
  if (Object.keys(legacyModels).length > 0) return legacyModels;

  const notetypes = database.readTable("notetypes");
  const fields = database.readTable("fields");
  const templates = database.readTable("templates");
  const fieldsByNotetype = new Map<string, any[]>();
  const templatesByNotetype = new Map<string, any[]>();

  for (const field of fields) {
    const id = String(field.ntid ?? "");
    fieldsByNotetype.set(id, [...(fieldsByNotetype.get(id) ?? []), field]);
  }
  for (const template of templates) {
    const id = String(template.ntid ?? "");
    templatesByNotetype.set(id, [...(templatesByNotetype.get(id) ?? []), template]);
  }

  return Object.fromEntries(
    notetypes.map((notetype: any) => {
      const id = String(notetype.id ?? notetype.rowid ?? "");
      const name = String(notetype.name ?? "Unknown Note Type");
      return [
        id,
        {
          id,
          name,
          type: /cloze|lückentext/i.test(name) ? 1 : 0,
          flds: (fieldsByNotetype.get(id) ?? [])
            .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
            .map((field) => ({ name: String(field.name ?? ""), ord: Number(field.ord ?? 0) })),
          tmpls: (templatesByNotetype.get(id) ?? [])
            .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
            .map((template) => ({ name: String(template.name ?? ""), ord: Number(template.ord ?? 0) })),
        },
      ];
    }),
  );
}

function canUseApkgWorker(file: unknown): file is File {
  return typeof Worker === "function" && Boolean(file && typeof (file as File).arrayBuffer === "function");
}

function parseApkgInWorker(file: File, onStep: (step: string) => void, signal?: AbortSignal): Promise<ApkgWorkerResult> {
  const requestId = makeId("apkg-worker");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./apkgImportWorker.ts", import.meta.url), { type: "module" });
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("APKG-Import wurde abgebrochen.", "AbortError"));

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = parseApkgWorkerResponse(event.data);
      if (!response.success || (response.output.requestId !== requestId && response.output.requestId !== "invalid")) {
        fail(new Error("APKG-Worker hat eine ungültige Nachricht geliefert."));
        return;
      }
      if (response.output.type === "progress") {
        onStep(response.output.step);
        return;
      }
      if (response.output.type === "error") {
        fail(new Error(response.output.message));
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response.output.result);
    };
    worker.onerror = () => fail(new Error("APKG-Import-Worker ist unerwartet abgebrochen."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    void file.arrayBuffer()
      .then((buffer) => {
        if (settled) return;
        worker.postMessage({
          type: "parse",
          requestId,
          file: {
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            lastModified: file.lastModified || 0,
          },
          buffer,
        }, [buffer]);
      })
      .catch(() => fail(new Error("APKG-Datei konnte nicht für den Import-Worker gelesen werden.")));
  });
}

export async function createApkgImportPreview(file: any, onStep: any = () => {}, options: any = {}) {
  const startedAt = new Date().toISOString();
  const parsed = canUseApkgWorker(file)
    ? await parseApkgInWorker(file, onStep, options.signal)
    : await parseApkgToNormalizedImport(file, { onStep });
  const details = createApkgReportDetails(parsed.parsedPackage, parsed.normalizedDeck, options.existingDecks ?? []);
  const job = {
    id: makeId("import"),
    fileName: file?.name ?? "",
    fileSize: file?.size ?? 0,
    status: parsed.errors.length > 0 ? "error" : "preview",
    detectedDecks: details.detectedDecks,
    detectedCards: details.detectedCards,
    detectedNotes: details.detectedNotes,
    warnings: unique(parsed.warnings),
    errors: unique(parsed.errors),
    createdAt: startedAt,
  };

  if (parsed.errors.length > 0) {
    return { job, preview: null };
  }

  const normalizedPreview = importNormalizedDeck(parsed.normalizedDeck, {
    dryRun: false,
    importScheduling: false,
    existingDecks: options.existingDecks ?? [],
    mergeStrategy: options.mergeStrategy,
  });
  normalizedPreview.mediaFiles = parsed.mediaFiles;
  attachApkgReportDetails(normalizedPreview, parsed.parsedPackage, parsed.warnings, parsed.errors, options);
  normalizedPreview.report.dryRun = true;

  if (!normalizedPreview.deck || normalizedPreview.report.errors.length > 0) {
    return {
      job: {
        ...job,
        status: "error",
        warnings: normalizedPreview.report.warnings,
        errors: normalizedPreview.report.errors,
      },
      preview: null,
    };
  }

  const metadata = parsed.normalizedDeck.metadataJson ?? {};
  const previewDeck = {
    ...normalizedPreview.deck,
    importMeta: {
      ...normalizedPreview.deck.importMeta,
      detectedDecks: details.detectedDecks,
      detectedNotes: details.detectedNotes,
      detectedCards: details.detectedCards,
      detectedVariants: details.detectedVariants,
      hasAnkiScheduling: details.hasAnkiScheduling,
      hasMedia: details.hasMedia,
      mediaCount: details.mediaCount,
      mediaManifest: details.mediaManifest,
      deckHierarchy: metadata.deckHierarchy ?? [],
    },
  };

  return {
    job: {
      ...job,
      warnings: normalizedPreview.report.warnings,
    },
    preview: {
      ...createImportPreview(previewDeck, normalizedPreview.report.warnings, parsed.mediaFiles),
      normalizedDeck: parsed.normalizedDeck,
      importReport: normalizedPreview.report,
    },
  };
}

function findExistingImportedDeck(importedDeck: any, existingDecks: any = []) {
  return (
    existingDecks.find((deck: any) => deck.source === "anki-apkg" && deck.originalDeckId === importedDeck.originalDeckId) ??
    existingDecks.find((deck: any) => deck.source === "anki-apkg" && deck.importMeta?.sourceExternalId && deck.importMeta.sourceExternalId === importedDeck.importMeta?.sourceExternalId) ??
    existingDecks.find(
      (deck: any) =>
        deck.source === "anki-apkg" &&
        deck.importMeta?.fileName === importedDeck.importMeta?.fileName &&
        deck.importMeta?.detectedNotes === importedDeck.importMeta?.detectedNotes &&
        deck.importMeta?.detectedCards === importedDeck.importMeta?.detectedCards,
    ) ??
    null
  );
}

function hasLocalContentEdit(card: any) {
  return (card.versionLog ?? []).some((entry: any) => entry.changeType === "content_updated");
}

function synchronizeOriginalVariant(variants: any = [], card: any = {}) {
  const originalVariant = variants.find((variant: any) => variant.isOriginal) ?? null;
  if (!originalVariant) return variants;

  return variants.map((variant: any) =>
    variant === originalVariant
      ? {
          ...variant,
          front: card.originalFront ?? card.canonicalQuestion ?? variant.front,
          back: card.originalBack ?? card.canonicalAnswer ?? variant.back,
          updatedAt: card.updatedAt ?? variant.updatedAt,
          meta: {
            ...(variant.meta ?? {}),
            cardType: card.cardType ?? card.kind ?? variant.meta?.cardType,
          },
        }
      : variant,
  );
}

export async function createApkgPreviewFromNormalizedImport(normalizedDeck: any, warnings: string[] = [], options: any = {}) {
  const parsed = await parseApkgToNormalizedImport({ normalizedDeck, warnings, mediaFiles: [] }, options);
  const normalizedPreview: any = importNormalizedDeck(parsed.normalizedDeck, {
    dryRun: false,
    importScheduling: false,
    existingDecks: options.existingDecks ?? [],
    mergeStrategy: options.mergeStrategy,
  });
  normalizedPreview.mediaFiles = [];
  attachApkgReportDetails(normalizedPreview, null, warnings, [], options);
  normalizedPreview.report.dryRun = true;
  if (!normalizedPreview.deck || normalizedPreview.report.errors.length > 0) return { preview: null, report: normalizedPreview.report };
  return {
    report: normalizedPreview.report,
    preview: {
      ...createImportPreview(normalizedPreview.deck, normalizedPreview.report.warnings, []),
      normalizedDeck,
      importReport: normalizedPreview.report,
    },
  };
}

function getAnkiNoteIdentity(card: any): AnkiImportIdentityV1 | null {
  const candidate = card?.meta?.ankiImportIdentityV1 ?? card?.meta?.normalizedImport?.metadataJson?.ankiImportIdentityV1;
  return candidate?.version === 1 && candidate?.kind === "note" ? candidate : null;
}

function getAnkiVariantIdentity(variant: any): AnkiImportIdentityV1 | null {
  const candidate = variant?.meta?.ankiImportIdentityV1 ?? variant?.meta?.metadataJson?.ankiImportIdentityV1;
  return candidate?.version === 1 && candidate?.kind === "card" ? candidate : null;
}

function noteTemplateKey(identity: AnkiImportIdentityV1 | null) {
  return identity?.guid && identity.templateOrdinal != null ? `${identity.guid}:${identity.templateOrdinal}` : null;
}

function mergeImportedVariants(incomingCard: any, existingCard: any, preserveContent: any) {
  const existingVariants = existingCard.variants ?? [];
  const existingById = new Map(existingVariants.map((variant: any) => [variant.id, variant]));
  const existingByCardId = new Map(
    existingVariants
      .map((variant: any) => [getAnkiVariantIdentity(variant)?.cardId, variant])
      .filter(([cardId]: any) => cardId),
  );
  const existingByTemplate = new Map(
    existingVariants
      .map((variant: any) => [noteTemplateKey(getAnkiVariantIdentity(variant)), variant])
      .filter(([key]: any) => key),
  );
  const existingBySourceId = new Map(
    existingVariants
      .map((variant: any) => [String(variant.meta?.sourceVariantExternalId ?? "").trim(), variant])
      .filter(([sourceId]: any) => sourceId),
  );
  const existingOriginal = existingVariants.find((variant: any) => variant.isOriginal) ?? null;
  const retainedIds = new Set();
  const merged = (incomingCard.variants ?? []).map((incomingVariant: any) => {
    const sourceId = String(incomingVariant.meta?.sourceVariantExternalId ?? "").trim();
    const identity = getAnkiVariantIdentity(incomingVariant);
    const templateKey = noteTemplateKey(identity);
    const existingVariant =
      (identity?.cardId ? existingByCardId.get(identity.cardId) : null) ??
      (templateKey ? existingByTemplate.get(templateKey) : null) ??
      (sourceId ? existingBySourceId.get(sourceId) : null) ??
      (incomingVariant.isOriginal ? existingOriginal : null) ??
      existingById.get(incomingVariant.id);
    if (!existingVariant) return incomingVariant;

    retainedIds.add(existingVariant.id);
    const mergedVariant = {
      ...existingVariant,
      ...incomingVariant,
      id: existingVariant.id,
      createdAt: existingVariant.createdAt ?? incomingVariant.createdAt,
      reviewState: existingVariant.reviewState ?? incomingVariant.reviewState,
      performance: existingVariant.performance ?? incomingVariant.performance,
      feedback: existingVariant.feedback?.length ? existingVariant.feedback : incomingVariant.feedback,
      versionLog: existingVariant.versionLog?.length ? existingVariant.versionLog : incomingVariant.versionLog,
      qualityStatus: incomingVariant.isOriginal ? incomingVariant.qualityStatus : existingVariant.qualityStatus ?? incomingVariant.qualityStatus,
      isActive: incomingVariant.isOriginal ? true : existingVariant.isActive ?? incomingVariant.isActive,
    };
    return preserveContent
      ? {
          ...mergedVariant,
          front: existingVariant.front,
          back: existingVariant.back,
          explanation: existingVariant.explanation,
          hintsJson: existingVariant.hintsJson,
          answerOptionsJson: existingVariant.answerOptionsJson,
          expectedAnswerJson: existingVariant.expectedAnswerJson,
        }
      : mergedVariant;
  });

  const result = [
    ...merged,
    ...existingVariants.filter((variant: any) => !variant.isOriginal && !retainedIds.has(variant.id)),
  ];
  return preserveContent ? synchronizeOriginalVariant(result, existingCard) : result;
}

function mergeImportedCardMeta(incomingMeta: any, existingMeta: any, preserveContent: boolean) {
  if (!preserveContent) return { ...(incomingMeta ?? {}), preservedLocalContent: false };
  const editorMetaKeys = ["answerOptions", "correctAnswer", "expectedAnswer", "explanation", "clozeGroupCount"];
  const preservedEditorMeta = Object.fromEntries(
    editorMetaKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(existingMeta ?? {}, key))
      .map((key) => [key, existingMeta[key]]),
  );
  return {
    ...(incomingMeta ?? {}),
    ...preservedEditorMeta,
    preservedLocalContent: true,
  };
}

function mergeImportedCard(incomingCard: any, existingCard: any) {
  if (!existingCard) return incomingCard;

  const preserveContent = hasLocalContentEdit(existingCard);
  const localFront = existingCard.originalFront ?? existingCard.canonicalQuestion;
  const localBack = existingCard.originalBack ?? existingCard.canonicalAnswer;
  const preservedContent = preserveContent
    ? {
        title: existingCard.title,
        canonicalQuestion: localFront,
        canonicalAnswer: localBack,
        tags: existingCard.tags,
        concepts: existingCard.concepts,
        cardType: existingCard.cardType,
        kind: existingCard.kind,
        originalFront: localFront,
        originalBack: localBack,
        originalFields: existingCard.originalFields,
        originalTags: existingCard.originalTags,
        originalHtml: existingCard.originalHtml,
        immutableOriginal: existingCard.immutableOriginal,
      }
    : {};

  return {
    ...incomingCard,
    ...preservedContent,
    id: existingCard.id,
    noteId: existingCard.noteId ?? incomingCard.noteId,
    createdAt: existingCard.createdAt ?? incomingCard.createdAt,
    updatedAt: new Date().toISOString(),
    reviewState: existingCard.reviewState ?? incomingCard.reviewState,
    learningItemState: existingCard.learningItemState ?? incomingCard.learningItemState,
    variants: mergeImportedVariants(incomingCard, existingCard, preserveContent),
    immutableOriginal: existingCard.immutableOriginal ?? incomingCard.immutableOriginal,
    versionLog: existingCard.versionLog?.length ? existingCard.versionLog : incomingCard.versionLog,
    sourceAnchors: existingCard.sourceAnchors?.length ? existingCard.sourceAnchors : incomingCard.sourceAnchors,
    mediaRefs: preserveContent ? unique([...(existingCard.mediaRefs ?? []), ...(incomingCard.mediaRefs ?? [])]) : incomingCard.mediaRefs,
    meta: mergeImportedCardMeta(incomingCard.meta, existingCard.meta, preserveContent),
  };
}

export function mergeImportedDeck(importedDeck: any, existingDecks: any = []) {
  const existingDeck = findExistingImportedDeck(importedDeck, existingDecks);
  if (!existingDeck) return importedDeck;

  const existingCardsBySourceId = new Map(
    existingDeck.cards.map((card: any) => [String(card.sourceCardId ?? card.sourceRefId ?? card.id), card]),
  );
  const existingCardsByGuid = new Map(
    existingDeck.cards
      .map((card: any) => [getAnkiNoteIdentity(card)?.guid, card])
      .filter(([guid]: any) => guid),
  );
  const existingCardsByNoteId = new Map(
    existingDeck.cards
      .map((card: any) => [getAnkiNoteIdentity(card)?.noteId, card])
      .filter(([noteId]: any) => noteId),
  );
  const now = new Date().toISOString();

  return createCoreDeck({
    ...importedDeck,
    id: existingDeck.id,
    name: existingDeck.name || importedDeck.name,
    description: existingDeck.description ?? importedDeck.description,
    ownerId: existingDeck.ownerId ?? importedDeck.ownerId,
    visibility: existingDeck.visibility ?? importedDeck.visibility,
    hierarchyPath: existingDeck.hierarchyPath ?? importedDeck.hierarchyPath,
    createdAt: existingDeck.createdAt ?? importedDeck.createdAt,
    updatedAt: now,
    deckSettings: existingDeck.deckSettings,
    reviewEvents: existingDeck.reviewEvents ?? [],
    aiJobs: existingDeck.aiJobs ?? importedDeck.aiJobs,
    graph: existingDeck.graph ?? importedDeck.graph,
    communityRefs: existingDeck.communityRefs ?? [],
    versionLog: existingDeck.versionLog ?? importedDeck.versionLog,
    importMeta: {
      ...(existingDeck.importMeta ?? {}),
      ...importedDeck.importMeta,
      reimportedAt: now,
      replacedDeckId: existingDeck.id,
    },
    mediaAssets: existingDeck.mediaAssets ?? [],
    cards: importedDeck.cards.map((card: any) => {
      const identity = getAnkiNoteIdentity(card);
      const existingCard =
        (identity?.guid ? existingCardsByGuid.get(identity.guid) : null) ??
        existingCardsBySourceId.get(String(card.sourceCardId ?? card.sourceRefId ?? card.id)) ??
        (identity?.noteId ? existingCardsByNoteId.get(identity.noteId) : null);
      return mergeImportedCard(card, existingCard);
    }),
  });
}

export async function commitImport(preview: any, options: any = {}) {
  if (!preview?.deck) {
    throw new Error("Es gibt keine Importvorschau, die gespeichert werden kann.");
  }

  return mergeImportedDeck(preview.deck, options.existingDecks ?? []);
}
