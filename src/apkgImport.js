import { createCoreCard, createCoreDeck, createReviewState, stableContentHash } from "./coreModel.js";
import { stripHtml } from "./htmlSafety.js";
import { importNormalizedDeck } from "./importService.js";
import { readSqliteDatabase } from "./sqliteReader.js";
import { readZipArchive } from "./zipReader.js";
import { decompress as decompressZstd } from "fzstd";

const MAX_APKG_SIZE = 250 * 1024 * 1024;
const COLLECTION_NAMES = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const FIELD_SEPARATOR = "\u001f";
const SQLITE_SIGNATURE = "SQLite format 3\0";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const textDecoder = new TextDecoder("utf-8");

function makeId(prefix) {
  const cryptoPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${cryptoPart}`;
}

function parseJson(value, fallback) {
  if (!value || typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(rawTags) {
  return String(rawTags ?? "")
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeMediaFileName(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1);
}

function readVarint(bytes, startOffset = 0) {
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

function readLengthDelimited(bytes, offset) {
  const length = readVarint(bytes, offset);
  return {
    bytes: bytes.slice(length.offset, length.offset + length.value),
    offset: length.offset + length.value,
  };
}

function skipProtoField(bytes, wireType, offset) {
  if (wireType === 0) return readVarint(bytes, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) return readLengthDelimited(bytes, offset).offset;
  if (wireType === 5) return offset + 4;
  throw new Error(`Nicht unterstützter MediaEntries-Wire-Type: ${wireType}`);
}

function maybeDecompressZstdBytes(bytes) {
  if (!hasZstdSignature(bytes)) return bytes;

  try {
    return decompressZstd(bytes);
  } catch {
    return bytes;
  }
}

function rotateLeft(value, bits) {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1HexSync(bytes) {
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

  return [h0, h1, h2, h3, h4].map((word) => word.toString(16).padStart(8, "0")).join("");
}

async function sha1Hex(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  return sha1HexSync(bytes);
}

function inferMimeType(name, bytes = new Uint8Array()) {
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

function getDecksFromCollection(colRows) {
  const first = colRows[0] ?? {};
  const deckMap = parseJson(first.decks, {});

  return Object.values(deckMap).map((deck) => ({
    id: String(deck.id ?? ""),
    name: deck.name ?? "Anki Deck",
  }));
}

function getModelsFromCollection(colRows) {
  const first = colRows[0] ?? {};
  return parseJson(first.models, {});
}

function buildDeckHierarchy(decks) {
  const nodeByPath = new Map();

  for (const deck of decks) {
    const parts = String(deck.name ?? "Anki Deck")
      .split("::")
      .map((part) => part.trim())
      .filter(Boolean);

    parts.forEach((part, index) => {
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

function splitDeckPath(value) {
  return String(value ?? "Anki Deck")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function hierarchyExternalId(node) {
  return String(node.id ?? "").startsWith("virtual_") ? `anki-deck-path-${node.path}` : `anki-deck-${String(node.id)}`;
}

function hierarchyDeckId({ fileName, sourceExternalId, path }) {
  return stableContentHash({ fileName, sourceExternalId, path }, "deck");
}

function createImportGroupId(normalizedDeck = {}) {
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

function splitNormalizedApkgDeckByHierarchy(normalizedDeck = {}) {
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

  const nodeByPath = new Map(hierarchy.map((node) => [node.path, node]));
  const idByPath = new Map();
  const itemsByPath = new Map();

  for (const item of normalizedDeck.items ?? []) {
    const itemMetadata = item.metadataJson ?? {};
    const ankiDeckName = itemMetadata.ankiDeckNames?.[0] ?? metadata.detectedDecks?.find((deck) => String(deck.id) === String(itemMetadata.ankiDeckId))?.name ?? normalizedDeck.title;
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

  const nodes = [...nodeByPath.values()].sort((left, right) => Number(left.depth ?? 0) - Number(right.depth ?? 0) || String(left.path).localeCompare(String(right.path)));
  const normalizedDecks = nodes.map((node) => {
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
      tags: unique(directItems.flatMap((item) => item.tags ?? [])),
      metadataJson: {
        ...metadata,
        importGroupId,
        hierarchyMode: "anki_subdecks",
        ankiDeckPath: node.path,
        ankiDeckDepth: node.depth ?? Math.max(0, hierarchyPath.length - 1),
        ankiParentPath: node.parentPath ?? null,
        isContainerDeck,
        detectedCards: directItems.reduce((sum, item) => sum + Math.max(1, item.variants?.length ?? 1), 0),
        importedScheduling: false,
      },
    };
  });

  return {
    importGroupId,
    rootDeckIds: normalizedDecks.filter((deck) => !deck.parentDeckId).map((deck) => deck.id),
    normalizedDecks,
  };
}

function extractMediaRefs(html) {
  const refs = [];
  const mediaPattern = /(?:src|href)=["']([^"']+)["']|\[sound:([^\]]+)\]/gi;
  let match = mediaPattern.exec(html ?? "");

  while (match) {
    refs.push(match[1] ?? match[2]);
    match = mediaPattern.exec(html ?? "");
  }

  return unique(refs);
}

function extractClozeText(value) {
  return String(value ?? "").replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1");
}

function fieldNamesForNote(note, models) {
  const model = models[String(note.mid)];
  const fields = Array.isArray(model?.flds) ? model.flds : [];
  return fields.map((field, index) => field.name ?? `Field ${index + 1}`);
}

function parseFields(note, models) {
  const values = String(note.flds ?? "").split(FIELD_SEPARATOR);
  const names = fieldNamesForNote(note, models);

  return values.map((value, index) => ({
    name: names[index] ?? `Field ${index + 1}`,
    value,
  }));
}

function chooseFrontBack(note, models) {
  const fields = parseFields(note, models);
  const first = fields[0]?.value ?? "";
  const second = fields[1]?.value ?? "";
  const clozeSource = fields.map((field) => field.value).find((value) => /\{\{c\d+::/i.test(value));

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
    back: second || fields.slice(1).map((field) => field.value).join("<br>"),
    isCloze: false,
    fields,
  };
}

function getMediaAssetCount(mediaMap = {}, mediaManifest = null) {
  return mediaManifest?.assets?.length ?? Object.keys(mediaMap).length;
}

function cardHasAnkiSchedulingData(card = {}) {
  return ["reps", "lapses", "ivl", "type", "queue", "odue", "odid"].some((key) => Number(card[key] ?? 0) > 0);
}

function createAnkiSchedulingSnapshot(card = {}) {
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

function getModelForNote(note, models) {
  return models[String(note?.mid)] ?? {};
}

function getTemplateForCard(card, model = {}) {
  const templates = Array.isArray(model.tmpls) ? model.tmpls : [];
  const ord = Number(card?.ord ?? 0);
  return templates.find((template) => Number(template.ord ?? -1) === ord) ?? templates[ord] ?? null;
}

function getTemplateName(card, model = {}) {
  return getTemplateForCard(card, model)?.name ?? (Number(card?.ord ?? 0) > 0 ? `Card ${Number(card.ord) + 1}` : "Card 1");
}

function extractClozeGroupsFromText(text) {
  const groups = new Set();
  const pattern = /\{\{c(\d+)::/g;
  let match = pattern.exec(String(text ?? ""));

  while (match) {
    groups.add(Number(match[1]));
    match = pattern.exec(String(text ?? ""));
  }

  return [...groups].sort((left, right) => left - right);
}

function renderAnkiClozeFront(text, groupId) {
  return String(text ?? "").replace(/\{\{c(\d+)::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, (_match, candidateGroup, value) => {
    if (Number(candidateGroup) !== groupId) return value;
    return "[...]";
  });
}

function resolveAnkiCardFace({ card, note, models, warnings }) {
  const fields = parseFields(note, models);
  const frontBack = chooseFrontBack(note, models);
  const model = getModelForNote(note, models);
  const modelName = model.name ?? "Unknown Note Type";
  const templateName = getTemplateName(card, model);
  const ord = Number(card.ord ?? 0);

  if (frontBack.isCloze) {
    const groups = extractClozeGroupsFromText(frontBack.front);
    const groupId = groups[ord] ?? groups[0] ?? 1;
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
  const canReverse = Boolean(first && second) && (ord > 0 || /reverse|card\s*2/i.test(`${modelName} ${templateName}`));

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

function createNormalizedMediaAssets(mediaManifest = null) {
  return (mediaManifest?.assets ?? []).map((asset) => ({
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

function buildWarnings({ cards, notes, mediaMap, mediaManifest, hasCloze, unsupportedNoteTypes, hasAnkiScheduling = false }) {
  const warnings = [];

  if (hasAnkiScheduling) {
    warnings.push("Anki-Lernfortschritt erkannt, aber in diesem Schritt nicht uebernommen.");
  }

  if (cards.some((card) => Number(card.ord ?? 0) > 0)) {
    warnings.push("Komplexere Card Templates wurden erkannt; CoRe bewahrt die Originaldaten und nutzt eine einfache Front/Back-Vorschau.");
  }

  if (hasCloze) {
    warnings.push("Cloze-Karten wurden erkannt und als solche markiert; eine spezialisierte Cloze-Review-Logik folgt spaeter.");
  }

  if (getMediaAssetCount(mediaMap, mediaManifest) > 0) {
    warnings.push("Medien wurden erkannt und fuer den lokalen Browser-Medienspeicher vorbereitet.");
  }

  if ((mediaManifest?.missingAssets?.length ?? 0) > 0) {
    warnings.push(`${mediaManifest.missingAssets.length} Medienreferenzen konnten nicht aus dem APKG gelesen werden.`);
  }

  if (unsupportedNoteTypes.length > 0) {
    warnings.push(`Nicht vollstaendig verstandene Note Types wurden roh gesichert: ${unsupportedNoteTypes.join(", ")}.`);
  }

  if (notes.length === 0 || cards.length === 0) {
    warnings.push("Die Collection enthaelt keine auslesbaren Notes oder Cards.");
  }

  return warnings;
}

export function validateApkgFile(file) {
  const errors = [];

  if (!file) {
    errors.push("Bitte waehle eine .apkg-Datei aus.");
  }

  if (file && !file.name.toLowerCase().endsWith(".apkg")) {
    errors.push("Es werden nur Anki-Decks im .apkg-Format akzeptiert.");
  }

  if (file && file.size > MAX_APKG_SIZE) {
    errors.push("Die Datei ist groesser als 250 MB und wird im MVP nicht direkt im Browser importiert.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function extractApkgArchive(file) {
  return readZipArchive(file);
}

export function findCollectionDatabase(archive) {
  const collectionName = COLLECTION_NAMES.find((name) => archive.getEntry(name));

  if (!collectionName) {
    throw new Error("Keine Anki-Collection gefunden. Erwartet wurde collection.anki2, collection.anki21 oder collection.anki21b.");
  }

  return archive.getEntry(collectionName);
}

function hasSqliteSignature(bytes) {
  return textDecoder.decode(bytes.slice(0, SQLITE_SIGNATURE.length)) === SQLITE_SIGNATURE;
}

function hasZstdSignature(bytes) {
  return ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function findReadableCollectionDatabase(archive) {
  const entries = COLLECTION_NAMES.map((name) => archive.getEntry(name)).filter(Boolean);

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

export async function readAnkiDatabase(collectionEntry) {
  const bytes = maybeDecompressZstdBytes(await collectionEntry.readBytes());
  return readSqliteDatabase(bytes);
}

export function parseAnkiDecks(database) {
  const deckRows = database.readTable("decks");

  if (deckRows.length > 0) {
    return deckRows
      .map((deck) => ({
        id: String(deck.id ?? deck.rowid ?? ""),
        name: deck.name ?? "Anki Deck",
      }))
      .sort((left, right) => {
        const leftDefault = left.name === "Default" ? 1 : 0;
        const rightDefault = right.name === "Default" ? 1 : 0;
        return leftDefault - rightDefault;
      });
  }

  return getDecksFromCollection(database.readTable("col"));
}

export function parseAnkiNotes(database) {
  return database.readTable("notes");
}

export function parseAnkiCards(database) {
  return database.readTable("cards");
}

export function parsePackageMetadataBytes(bytes) {
  const metadata = {
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

export function parseMediaEntriesBytes(bytes) {
  const entries = [];
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
    const entry = {
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

export async function parseAnkiPackageMetadata(archive) {
  const metaEntry = archive.getEntry("meta");

  if (!metaEntry) {
    return { version: archive.getEntry("collection.anki21") ? "legacy-2" : "legacy-1" };
  }

  const bytes = maybeDecompressZstdBytes(await metaEntry.readBytes());
  return parsePackageMetadataBytes(bytes);
}

function createEmptyMediaBundle(format = "none", metadata = {}) {
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

async function readArchiveMediaBytes(archive, entryName) {
  const entry = archive.getEntry(String(entryName));
  if (!entry) return null;
  return maybeDecompressZstdBytes(await entry.readBytes());
}

async function collectLegacyMediaBundle(archive, mediaMap, metadata) {
  const mediaFiles = [];

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
      assets: mediaFiles.map(({ bytes, ...asset }) => asset),
      missingAssets: Object.entries(mediaMap)
        .filter(([zipEntryName]) => !mediaFiles.some((file) => file.zipEntryName === String(zipEntryName)))
        .map(([zipEntryName, name]) => ({ name: normalizeMediaFileName(name), zipEntryName: String(zipEntryName) })),
    },
  };
}

function listNumericMediaEntries(archive) {
  if (typeof archive.listEntries !== "function") return [];

  return archive
    .listEntries()
    .filter((entry) => /^\d+$/.test(entry.name))
    .sort((left, right) => Number(left.name) - Number(right.name));
}

async function collectModernMediaBundle(archive, mediaEntries, metadata) {
  const mediaMap = {};
  const mediaFiles = [];
  const availableFiles = [];

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
        ? availableFiles.find((file) => file.zipEntryName === manifestEntry.legacyZipFileName)
        : null) ??
      availableFiles.find((file) => file.sha1 === manifestEntry.sha1 && file.size === manifestEntry.size);

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

  const matchedNames = new Set(mediaFiles.map((file) => file.name));

  return {
    format: "media-entries",
    mediaMap,
    mediaFiles,
    manifest: {
      format: "media-entries",
      packageVersion: metadata.version,
      assets: mediaEntries.map((entry) => {
        const normalizedName = normalizeMediaFileName(entry.name);
        const matched = mediaFiles.find((file) => file.name === normalizedName);
        return {
          name: normalizedName,
          zipEntryName: matched?.zipEntryName ?? entry.legacyZipFileName ?? null,
          sha1: entry.sha1,
          size: entry.size,
          mimeType: matched?.mimeType ?? inferMimeType(normalizedName),
        };
      }),
      missingAssets: mediaEntries
        .filter((entry) => !matchedNames.has(normalizeMediaFileName(entry.name)))
        .map((entry) => ({
          name: normalizeMediaFileName(entry.name),
          sha1: entry.sha1,
          size: entry.size,
        })),
    },
  };
}

export async function parseAnkiMedia(archive) {
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

export function mapAnkiToCoreDeck({ file, decks, notes, cards, colRows, mediaMap = {}, mediaManifest = null }) {
  const models = getModelsFromCollection(colRows);
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const noteById = new Map(notes.map((note) => [String(note.id), note]));
  const primaryDeck = decks[0] ?? { id: "unknown", name: file.name.replace(/\.apkg$/i, "") };
  const unsupportedNoteTypes = [];
  const createdAt = new Date().toISOString();
  let hasCloze = false;

  const coreCards = cards
    .map((card) => {
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
        ...Object.values(mediaMap).filter((name) => originalHtml.includes(String(name))),
        ...(mediaManifest?.assets ?? []).map((asset) => asset.name).filter((name) => originalHtml.includes(String(name))),
      ]);

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

  const deckTags = unique(coreCards.flatMap((card) => card.originalTags));

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

export function mapAnkiApkgToNormalizedDeck({ file = {}, decks = [], notes = [], cards = [], colRows = [], mediaMap = {}, mediaManifest = null } = {}) {
  const models = getModelsFromCollection(colRows);
  const deckById = new Map(decks.map((deck) => [String(deck.id), deck]));
  const noteById = new Map(notes.map((note) => [String(note.id), note]));
  const cardsByNoteId = new Map();
  const warnings = [];
  const errors = [];
  const unsupportedNoteTypes = [];
  const primaryDeck = decks[0] ?? { id: "unknown", name: String(file.name ?? "Anki Deck").replace(/\.apkg$/i, "") };
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

  const items = [];

  for (const note of notes) {
    const noteCards = (cardsByNoteId.get(String(note.id)) ?? []).sort((left, right) => {
      const byOrd = Number(left.ord ?? 0) - Number(right.ord ?? 0);
      return byOrd || String(left.id ?? "").localeCompare(String(right.id ?? ""));
    });

    if (noteCards.length === 0) continue;

    const itemWarnings = [];
    const model = getModelForNote(note, models);
    const modelName = model.name ?? "Unknown Note Type";
    const fields = parseFields(note, models);
    const tags = normalizeTags(note.tags);
    const sourceDeckIds = unique(noteCards.map((card) => String(card.did ?? "")));
    const sourceDeckNames = unique(sourceDeckIds.map((deckId) => deckById.get(deckId)?.name ?? primaryDeck.name));
    const noteHasScheduling = noteCards.some(cardHasAnkiSchedulingData);
    const variants = [];

    if (!modelName || (!/basic|cloze/i.test(modelName) && fields.length > 2)) {
      unsupportedNoteTypes.push(modelName);
    }

    hasAnkiScheduling = hasAnkiScheduling || noteHasScheduling;

    noteCards.forEach((card, index) => {
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

    const originalVariant = variants.find((variant) => variant.isOriginal) ?? variants[0] ?? null;
    const mediaRefs = unique([
      ...variants.flatMap((variant) => [...extractMediaRefs(variant.front), ...extractMediaRefs(variant.back)]),
      ...Object.values(mediaMap).filter((name) => variants.some((variant) => `${variant.front}${variant.back}`.includes(String(name)))),
      ...(mediaManifest?.assets ?? [])
        .map((asset) => asset.name)
        .filter((name) => variants.some((variant) => `${variant.front}${variant.back}`.includes(String(name)))),
    ]);

    warnings.push(...itemWarnings);

    items.push({
      title: stripHtml(originalVariant?.front ?? fields[0]?.value ?? `Anki Note ${String(note.id)}`).slice(0, 120),
      canonicalQuestion: originalVariant?.front ?? fields[0]?.value ?? "",
      canonicalAnswer: originalVariant?.back ?? fields[1]?.value ?? "",
      tags,
      sourceType: "anki_import",
      sourceExternalId: note.id == null ? null : `anki-note-${String(note.id)}`,
      cardType: originalVariant?.variantType === "cloze" ? "cloze" : "basic",
      mediaRefs,
      originalFields: fields,
      variants,
      metadataJson: {
        importFormat: "apkg",
        ankiNoteId: note.id == null ? null : String(note.id),
        ankiCardIds: noteCards.map((card) => String(card.id ?? "")),
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

  const missingNoteIds = unique(cards.map((card) => String(card.nid ?? "")).filter((noteId) => noteId && !noteById.has(noteId)));
  if (missingNoteIds.length > 0) {
    warnings.push(`${missingNoteIds.length} Anki-Cards referenzieren Notes, die nicht gelesen werden konnten.`);
  }

  if (decks.length > 1) {
    warnings.push("Mehrere Anki-Decks wurden erkannt; CoRe legt daraus sichtbare Stapel und Unterstapel an.");
  }

  if (hasCloze) {
    warnings.push("Cloze-Karten wurden erkannt und als cloze-Varianten importiert; spezialisierte Cloze-Review-UI bleibt ein Ausbaupunkt.");
  }

  if (getMediaAssetCount(mediaMap, mediaManifest) > 0) {
    warnings.push("APKG-Medien wurden erkannt; Referenzen und Manifest bleiben erhalten, produktive Medienablage bleibt ein spaeterer Ausbaupunkt.");
  }

  if ((mediaManifest?.missingAssets?.length ?? 0) > 0) {
    warnings.push(`${mediaManifest.missingAssets.length} APKG-Medien fehlen im Archiv und wurden nur im Report vermerkt.`);
  }

  if (hasAnkiScheduling) {
    warnings.push("Anki-Lernfortschritt erkannt, aber in diesem Schritt nicht uebernommen.");
  }

  if (unsupportedNoteTypes.length > 0) {
    warnings.push(`Nicht vollstaendig verstandene Note Types wurden roh in metadataJson gesichert: ${unique(unsupportedNoteTypes).join(", ")}.`);
  }

  if (items.length === 0) {
    errors.push("Keine importierbaren Anki-Notes mit Cards erkannt.");
  }

  const mediaAssets = createNormalizedMediaAssets(mediaManifest);
  const detectedDeckIds = unique(cards.map((card) => String(card.did ?? "")).filter(Boolean));

  return {
    normalizedDeck: {
      title: primaryDeck.name ?? String(file.name ?? "Anki Deck").replace(/\.apkg$/i, ""),
      description: `Import aus ${file.name ?? "Anki APKG"}`,
      sourceType: "anki_import",
      sourceExternalId: primaryDeck.id == null ? null : `anki-deck-${String(primaryDeck.id)}`,
      tags: unique(items.flatMap((item) => item.tags)),
      items,
      mediaAssets,
      metadataJson: {
        importFormat: "apkg",
        parser: "mapAnkiApkgToNormalizedDeck",
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

export function createImportPreview(coreDeck, warnings, mediaFiles = []) {
  return {
    deck: coreDeck,
    mediaFiles,
    sampleCards: coreDeck.cards.slice(0, 5).map((card) => ({
      ...card,
      plainFront: stripHtml(card.originalFront).slice(0, 240),
      plainBack: stripHtml(card.originalBack).slice(0, 240),
    })),
    warnings,
  };
}

async function readApkgPackage(file, onStep = () => {}) {
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
  const mediaBundle = await parseAnkiMedia(archive);

  return {
    file,
    archive,
    database,
    colRows,
    decks,
    notes,
    cards,
    mediaBundle,
  };
}

function isParsedAnkiPackage(input) {
  return Boolean(input && Array.isArray(input.decks) && Array.isArray(input.notes) && Array.isArray(input.cards));
}

function isApkgPreview(input) {
  return Boolean(input?.normalizedDeck || input?.preview?.normalizedDeck);
}

function emptyNormalizedApkgDeck(file = {}) {
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

function createApkgReportDetails(parsed, normalizedDeck) {
  const metadata = normalizedDeck?.metadataJson ?? {};
  const detectedDecks = metadata.detectedDecks ?? parsed?.decks ?? [];
  const detectedNotes = metadata.detectedNotes ?? parsed?.notes?.length ?? normalizedDeck?.items?.length ?? 0;
  const detectedCards = metadata.detectedCards ?? parsed?.cards?.length ?? 0;
  const detectedVariants = metadata.detectedVariants ?? normalizedDeck?.items?.reduce((sum, item) => sum + (item.variants?.length ?? 0), 0) ?? 0;
  const hasAnkiScheduling = Boolean(metadata.hasAnkiScheduling ?? parsed?.cards?.some(cardHasAnkiSchedulingData));
  const mediaManifest = metadata.mediaManifest ?? parsed?.mediaBundle?.manifest ?? { format: "none", assets: [], missingAssets: [] };

  return {
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
    missingMediaCount: mediaManifest?.missingAssets?.length ?? 0,
    mediaManifest,
  };
}

function attachApkgReportDetails(result, parsed, parsedWarnings = [], parsedErrors = []) {
  const report = result.report;
  const details = createApkgReportDetails(parsed, result.normalizedDeck);
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

function mergeImportReports(results = []) {
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

  report.createdDecks = results.reduce((sum, result) => sum + Number(result.report?.createdDecks ?? 0), 0);
  report.createdLearningItems = results.reduce((sum, result) => sum + Number(result.report?.createdLearningItems ?? 0), 0);
  report.createdCards = report.createdLearningItems;
  report.createdVariants = results.reduce((sum, result) => sum + Number(result.report?.createdVariants ?? 0), 0);
  report.skipped = results.flatMap((result) => result.report?.skipped ?? []);
  report.duplicates = results.flatMap((result) => result.report?.duplicates ?? []);
  report.warnings = unique(results.flatMap((result) => result.report?.warnings ?? []));
  report.errors = unique(results.flatMap((result) => result.report?.errors ?? []));
  report.summary = {
    ...(report.summary ?? {}),
    wouldCreateDecks: report.createdDecks,
    wouldCreateLearningItems: report.createdLearningItems,
    wouldCreateCards: report.createdCards,
    wouldCreateVariants: report.createdVariants,
    skipped: report.skipped.length,
    duplicates: report.duplicates.length,
    warnings: report.warnings.length,
    errors: report.errors.length,
  };

  return report;
}

function commitNormalizedApkgHierarchy(normalizedDeck, options = {}) {
  const hierarchy = splitNormalizedApkgDeckByHierarchy(normalizedDeck);
  const results = hierarchy.normalizedDecks.map((subDeck) =>
    importNormalizedDeck(subDeck, {
      ...options,
      dryRun: false,
      importScheduling: false,
    }),
  );
  const decks = results
    .map((result) => result.deck)
    .filter(Boolean)
    .map((createdDeck) => mergeImportedDeck(createdDeck, options.existingDecks ?? []));
  const rootOrder = new Map(hierarchy.normalizedDecks.map((deck, index) => [deck.id, index]));
  decks.sort((left, right) => (rootOrder.get(left.id) ?? 0) - (rootOrder.get(right.id) ?? 0));

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

export async function parseApkgToNormalizedImport(fileOrParsed, options = {}) {
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

export async function dryRunApkgImport(fileOrParsed, options = {}) {
  const parsed = await parseApkgToNormalizedImport(fileOrParsed, options);
  if (parsed.errors.length > 0) {
    const result = importNormalizedDeck(parsed.normalizedDeck, {
      ...options,
      dryRun: true,
      importScheduling: false,
    });
    return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors);
  }

  const result = importNormalizedDeck(parsed.normalizedDeck, {
    ...options,
    dryRun: true,
    importScheduling: false,
  });
  result.mediaFiles = parsed.mediaFiles;
  return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors);
}

export async function commitApkgImport(fileOrParsed, options = {}) {
  const parsed = await parseApkgToNormalizedImport(fileOrParsed, options);
  if (parsed.errors.length > 0) {
    const result = importNormalizedDeck(parsed.normalizedDeck, {
      ...options,
      dryRun: true,
      importScheduling: false,
    });
    result.deck = null;
    result.decks = [];
    result.rootDeckIds = [];
    result.importGroupId = null;
    result.mediaFiles = parsed.mediaFiles;
    return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors);
  }

  const result = commitNormalizedApkgHierarchy(parsed.normalizedDeck, options);
  result.mediaFiles = parsed.mediaFiles;
  return attachApkgReportDetails(result, parsed.parsedPackage, parsed.warnings, parsed.errors);
}

export async function importApkgDeck(fileOrParsed, options = {}) {
  return commitApkgImport(fileOrParsed, options);
}

export async function createApkgImportPreview(file, onStep = () => {}) {
  const startedAt = new Date().toISOString();
  const validation = validateApkgFile(file);

  if (!validation.valid) {
    return {
      job: {
        id: makeId("import"),
        fileName: file?.name ?? "",
        fileSize: file?.size ?? 0,
        status: "error",
        detectedDecks: [],
        detectedCards: 0,
        detectedNotes: 0,
        warnings: [],
        errors: validation.errors,
        createdAt: startedAt,
      },
      preview: null,
    };
  }

  const parsedPackage = await readApkgPackage(file, onStep);
  const { colRows, decks, notes, cards, mediaBundle } = parsedPackage;
  const coreDeck = mapAnkiToCoreDeck({
    file,
    decks,
    notes,
    cards,
    colRows,
    mediaMap: mediaBundle.mediaMap,
    mediaManifest: mediaBundle.manifest,
  });
  const warnings = buildWarnings({
    cards,
    notes,
    mediaMap: mediaBundle.mediaMap,
    mediaManifest: mediaBundle.manifest,
    hasCloze: coreDeck.importMeta.hasCloze,
    unsupportedNoteTypes: coreDeck.importMeta.unsupportedNoteTypes,
    hasAnkiScheduling: cards.some(cardHasAnkiSchedulingData),
  });
  const normalized = mapAnkiApkgToNormalizedDeck({
    file,
    decks,
    notes,
    cards,
    colRows,
    mediaMap: mediaBundle.mediaMap,
    mediaManifest: mediaBundle.manifest,
  });
  const normalizedPreview = importNormalizedDeck(normalized.normalizedDeck, {
    dryRun: true,
    importScheduling: false,
  });
  attachApkgReportDetails(normalizedPreview, parsedPackage, normalized.warnings, normalized.errors);
  onStep("preview");

  return {
    job: {
      id: makeId("import"),
      fileName: file.name,
      fileSize: file.size,
      status: "preview",
      detectedDecks: decks,
      detectedCards: cards.length,
      detectedNotes: notes.length,
      warnings,
      errors: [],
      createdAt: startedAt,
    },
    preview: {
      ...createImportPreview(coreDeck, unique([...warnings, ...normalized.warnings]), mediaBundle.mediaFiles),
      normalizedDeck: normalized.normalizedDeck,
      importReport: normalizedPreview.report,
    },
  };
}

function findExistingImportedDeck(importedDeck, existingDecks = []) {
  return (
    existingDecks.find((deck) => deck.source === "anki-apkg" && deck.originalDeckId === importedDeck.originalDeckId) ??
    existingDecks.find((deck) => deck.source === "anki-apkg" && deck.importMeta?.sourceExternalId && deck.importMeta.sourceExternalId === importedDeck.importMeta?.sourceExternalId) ??
    existingDecks.find(
      (deck) =>
        deck.source === "anki-apkg" &&
        deck.importMeta?.fileName === importedDeck.importMeta?.fileName &&
        deck.importMeta?.detectedNotes === importedDeck.importMeta?.detectedNotes &&
        deck.importMeta?.detectedCards === importedDeck.importMeta?.detectedCards,
    ) ??
    null
  );
}

function hasLocalContentEdit(card) {
  return (card.versionLog ?? []).some((entry) => entry.changeType === "content_updated");
}

function mergeImportedCard(incomingCard, existingCard) {
  if (!existingCard) return incomingCard;

  const preserveContent = hasLocalContentEdit(existingCard);
  const preservedContent = preserveContent
    ? {
        title: existingCard.title,
        canonicalQuestion: existingCard.canonicalQuestion,
        canonicalAnswer: existingCard.canonicalAnswer,
        originalFront: existingCard.originalFront,
        originalBack: existingCard.originalBack,
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
    variants: existingCard.variants?.length ? existingCard.variants : incomingCard.variants,
    versionLog: existingCard.versionLog?.length ? existingCard.versionLog : incomingCard.versionLog,
    sourceAnchors: existingCard.sourceAnchors?.length ? existingCard.sourceAnchors : incomingCard.sourceAnchors,
    mediaRefs: incomingCard.mediaRefs,
    meta: {
      ...(incomingCard.meta ?? {}),
      preservedLocalContent: preserveContent,
    },
  };
}

export function mergeImportedDeck(importedDeck, existingDecks = []) {
  const existingDeck = findExistingImportedDeck(importedDeck, existingDecks);
  if (!existingDeck) return importedDeck;

  const existingCardsBySourceId = new Map(
    existingDeck.cards.map((card) => [String(card.sourceCardId ?? card.sourceRefId ?? card.id), card]),
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
    cards: importedDeck.cards.map((card) => mergeImportedCard(card, existingCardsBySourceId.get(String(card.sourceCardId ?? card.sourceRefId ?? card.id)))),
  });
}

export async function commitImport(preview, options = {}) {
  if (!preview?.deck) {
    throw new Error("Es gibt keine Importvorschau, die gespeichert werden kann.");
  }

  return mergeImportedDeck(preview.deck, options.existingDecks ?? []);
}
