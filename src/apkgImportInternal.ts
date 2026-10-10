import type { ReviewRating, ReviewSchedulerState } from "./coreTypes.ts";
import { readSqliteDatabase } from "./sqliteReader.ts";
import { readZipArchive } from "./zipReader.ts";
import { decompress as decompressZstd } from "fzstd";

const COLLECTION_NAMES = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const FIELD_SEPARATOR = "\u001f";
const SQLITE_SIGNATURE = "SQLite format 3\0";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const textDecoder = new TextDecoder("utf-8");
let protobufDecoders: Promise<typeof import("./apkgImportProtobuf.ts")> | null = null;

function loadProtobufDecoders() {
  protobufDecoders ??= import("./apkgImportProtobuf.ts");
  return protobufDecoders;
}

export interface AnkiReviewHistoryEntry {
  reviewId: string;
  cardId: string;
  rating: ReviewRating;
  answeredAt: string;
  responseTimeMs: number | null;
  reviewType: number;
  beforeState: ReviewSchedulerState;
  afterState: ReviewSchedulerState;
  beforeIntervalDays: number;
  beforeIntervalMinutes: number | null;
  afterIntervalDays: number;
  afterIntervalMinutes: number | null;
  ease: number;
}

interface AnkiReviewHistoryPayload {
  entries: AnkiReviewHistoryEntry[];
  totalRows: number;
  skippedRows: number;
}

const EMPTY_ANKI_REVIEW_HISTORY: AnkiReviewHistoryPayload = { entries: [], totalRows: 0, skippedRows: 0 };
const ANKI_RATING_BY_EASE: Record<number, ReviewRating> = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

function intervalFromAnki(value: unknown): { days: number; minutes: number | null } {
  const interval = Number(value);
  if (!Number.isFinite(interval)) return { days: 0, minutes: null };
  if (interval < 0) return { days: 0, minutes: Math.max(1, Math.ceil(Math.abs(interval) / 60)) };
  return { days: Math.max(0, Math.round(interval)), minutes: null };
}

function reviewStateFromAnkiType(type: number, interval: { days: number; minutes: number | null }): ReviewSchedulerState {
  if (type === 0) return "learning";
  if (type === 2) return "relearning";
  if (type === 3 && interval.days === 0) return "learning";
  return "review";
}

export function normalizeAnkiReviewHistory(rows: unknown): AnkiReviewHistoryPayload {
  if (!Array.isArray(rows)) return EMPTY_ANKI_REVIEW_HISTORY;
  const entries: AnkiReviewHistoryEntry[] = [];
  let skippedRows = 0;

  for (const candidate of rows) {
    const row = candidate != null && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    const reviewId = String(row.id ?? "").trim();
    const cardId = String(row.cid ?? row.cardId ?? "").trim();
    const ease = Number(row.ease);
    const rating = ANKI_RATING_BY_EASE[ease];
    const answeredAtMs = Number(reviewId);
    const reviewType = Number(row.type);
    if (!reviewId || !cardId || !rating || !Number.isFinite(answeredAtMs) || answeredAtMs <= 0 || !Number.isInteger(reviewType) || reviewType < 0 || reviewType > 3) {
      skippedRows += 1;
      continue;
    }
    const before = intervalFromAnki(row.lastIvl ?? row.last_ivl);
    const after = intervalFromAnki(row.ivl);
    const responseTime = Number(row.time);
    entries.push({
      reviewId,
      cardId,
      rating,
      answeredAt: new Date(answeredAtMs).toISOString(),
      responseTimeMs: Number.isFinite(responseTime) && responseTime >= 0 ? Math.min(60_000, Math.round(responseTime)) : null,
      reviewType,
      beforeState: reviewStateFromAnkiType(reviewType, before),
      afterState: reviewStateFromAnkiType(reviewType, after),
      beforeIntervalDays: before.days,
      beforeIntervalMinutes: before.minutes,
      afterIntervalDays: after.days,
      afterIntervalMinutes: after.minutes,
      ease: Number.isFinite(Number(row.factor)) && Number(row.factor) > 0 ? Number(row.factor) / 1000 : 2.5,
    });
  }

  entries.sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
  return { entries, totalRows: rows.length, skippedRows };
}

function parseJson(value: any, fallback: any) {
  if (!value || typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    filtered: Number(deck.dyn ?? 0) === 1,
  }));
}

function getModelsFromCollection(colRows: any) {
  const first = colRows[0] ?? {};
  const rawModels = parseJson(first.models, {});
  return Object.fromEntries(Object.entries(rawModels).map(([modelKey, candidate]: [string, any]) => {
    const model = candidate && typeof candidate === "object" ? candidate : {};
    const requirements = Array.isArray(model.req)
      ? model.req.map((requirement: any) => ({
        cardOrdinal: Number(requirement?.[0] ?? 0),
        kind: requirement?.[1] === "all" ? 2 : requirement?.[1] === "any" ? 1 : 0,
        fieldOrdinals: Array.isArray(requirement?.[2]) ? requirement[2].map(Number) : [],
      }))
      : [];
    const config = {
      format: "legacy-json",
      rawBase64: null,
      kind: Number(model.type ?? 0),
      sortFieldIndex: Number(model.sortf ?? 0),
      css: String(model.css ?? ""),
      targetDeckIdUnused: model.did == null ? null : String(model.did),
      latexPre: String(model.latexPre ?? ""),
      latexPost: String(model.latexPost ?? ""),
      latexSvg: Boolean(model.latexsvg),
      requirements,
      originalStockKind: Number(model.originalStockKind ?? 0),
      originalId: model.originalId == null ? null : String(model.originalId),
      otherBase64: null,
    };
    const fields = Array.isArray(model.flds) ? model.flds : [];
    const templates = Array.isArray(model.tmpls) ? model.tmpls : [];

    return [modelKey, {
      ...model,
      id: String(model.id ?? modelKey),
      type: config.kind,
      config,
      flds: fields.map((field: any, index: number) => ({
        ...field,
        name: String(field?.name ?? ""),
        ord: Number(field?.ord ?? index),
        config: {
          format: "legacy-json",
          rawBase64: null,
          sticky: Boolean(field?.sticky),
          rtl: Boolean(field?.rtl),
          fontName: String(field?.font ?? ""),
          fontSize: Number(field?.size ?? 0),
          description: String(field?.description ?? ""),
          plainText: Boolean(field?.plainText),
          collapsed: Boolean(field?.collapsed),
          excludeFromSearch: Boolean(field?.excludeFromSearch),
          id: field?.id == null ? null : String(field.id),
          tag: field?.tag == null ? null : Number(field.tag),
          preventDeletion: Boolean(field?.preventDeletion),
          otherBase64: null,
        },
      })),
      tmpls: templates.map((template: any, index: number) => ({
        ...template,
        name: String(template?.name ?? ""),
        ord: Number(template?.ord ?? index),
        config: {
          format: "legacy-json",
          rawBase64: null,
          questionFormat: String(template?.qfmt ?? ""),
          answerFormat: String(template?.afmt ?? ""),
          browserQuestionFormat: String(template?.bqfmt ?? ""),
          browserAnswerFormat: String(template?.bafmt ?? ""),
          targetDeckId: template?.did == null ? null : String(template.did),
          browserFontName: String(template?.bfont ?? ""),
          browserFontSize: Number(template?.bsize ?? 0),
          id: template?.id == null ? null : String(template.id),
          otherBase64: null,
        },
      })),
    }];
  }));
}

async function extractApkgArchive(file: any) {
  return readZipArchive(file);
}

function hasSqliteSignature(bytes: any) {
  return textDecoder.decode(bytes.slice(0, SQLITE_SIGNATURE.length)) === SQLITE_SIGNATURE;
}

function hasZstdSignature(bytes: any) {
  return ZSTD_MAGIC.every((byte: any, index: any) => bytes[index] === byte);
}

async function findReadableCollectionDatabase(archive: any) {
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

function parseAnkiDecks(database: any) {
  const deckRows = database.readTable("decks");

  if (deckRows.length > 0) {
    return deckRows
      .map((deck: any) => ({
        id: String(deck.id ?? deck.rowid ?? ""),
        name: normalizeAnkiDeckPath(deck.name),
        // V18 `kind` is a protobuf oneof: field 1 = normal, field 2 = filtered.
        filtered: deck.kind instanceof Uint8Array && deck.kind[0] === 0x12,
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

function parseAnkiNotes(database: any) {
  return database.readTable("notes");
}

function parseAnkiCards(database: any) {
  return database.readTable("cards");
}

function parseAnkiReviewHistory(database: { readTable(tableName: string): unknown }) {
  return normalizeAnkiReviewHistory(database.readTable("revlog"));
}

async function parsePackageMetadataBytes(bytes: any) {
  try {
    const { decodePackageMetadata } = await loadProtobufDecoders();
    return decodePackageMetadata(bytes);
  } catch (error) {
    throw new Error("Ungültige Package-Metadaten im Protobuf-Format.", { cause: error });
  }
}

async function parseMediaEntriesBytes(bytes: any) {
  try {
    const { decodeMediaEntries } = await loadProtobufDecoders();
    return decodeMediaEntries(bytes);
  } catch (error) {
    throw new Error("Ungültiges MediaEntries-Varint/Protobuf.", { cause: error });
  }
}

async function parseAnkiPackageMetadata(archive: any) {
  const metaEntry = archive.getEntry("meta");

  if (!metaEntry) {
    return { version: archive.getEntry("collection.anki21") ? "legacy-2" : "legacy-1" };
  }

  const bytes = maybeDecompressZstdBytes(await metaEntry.readBytes());
  return await parsePackageMetadataBytes(bytes);
}

export const ANKI_PACKAGE_MAX_BYTES = 2 * 1024 ** 3;

export interface AnkiPackageMediaFile {
  name: string;
  sha1: string;
  size: number;
  mimeType: string;
  readBytes(): Promise<Uint8Array>;
}

/** Raw package contents for the note translation (K5.0); media bytes stay in the archive until read. */
export interface AnkiPackage {
  file: { name: string; size: number };
  packageFormat: string;
  collectionCreatedAt: number | null;
  decks: Array<{ id: string; name: string; filtered: boolean }>;
  notes: any[];
  cards: any[];
  models: Record<string, any>;
  reviewHistory: AnkiReviewHistoryPayload;
  media: { format: string; files: AnkiPackageMediaFile[]; missing: string[] };
}

async function readAnkiMediaIndex(archive: any): Promise<AnkiPackage["media"]> {
  const mediaEntry = archive.getEntry("media");
  if (!mediaEntry) return { format: "none", files: [], missing: [] };
  const mediaBytes = maybeDecompressZstdBytes(await mediaEntry.readBytes());
  const legacyMap = parseJson(textDecoder.decode(mediaBytes), null);
  const isLegacy = legacyMap !== null && typeof legacyMap === "object" && !Array.isArray(legacyMap);
  // Modern packages store media file i as ZIP entry "i" and list its SHA-1; legacy packages need hashing.
  const descriptors = isLegacy
    ? Object.entries(legacyMap).map(([zipEntryName, name]) => ({ zipEntryName, name: normalizeMediaFileName(name), sha1: null as string | null, size: 0 }))
    : (await parseMediaEntriesBytes(mediaBytes)).map((entry, index) => ({
      zipEntryName: entry.legacyZipFileName ?? String(index),
      name: normalizeMediaFileName(entry.name),
      sha1: entry.sha1 as string | null,
      size: entry.size,
    }));
  const files: AnkiPackageMediaFile[] = [];
  const missing: string[] = [];
  for (const descriptor of descriptors) {
    const entry = archive.getEntry(descriptor.zipEntryName);
    if (!descriptor.name) continue;
    if (!entry) {
      missing.push(descriptor.name);
      continue;
    }
    const readBytes = async () => maybeDecompressZstdBytes(await entry.readBytes()) as Uint8Array;
    let { sha1, size } = descriptor;
    if (sha1 === null) {
      const bytes = await readBytes();
      sha1 = await sha1Hex(bytes);
      size = bytes.length;
    }
    files.push({ name: descriptor.name, sha1, size, mimeType: inferMimeType(descriptor.name), readBytes });
  }
  return { format: isLegacy ? "legacy-json" : "media-entries", files, missing };
}

/** Reads `.apkg` and `.colpkg` files up to 2 GiB without materializing the archive or its media. */
export async function readAnkiPackage(file: Blob & { name: string }, onStep: (step: string) => void = () => {}): Promise<AnkiPackage> {
  if (!/\.(?:apkg|colpkg)$/i.test(file.name)) throw new Error("Es werden nur Anki-Pakete im Format .apkg oder .colpkg akzeptiert.");
  if (file.size > ANKI_PACKAGE_MAX_BYTES) throw new Error("Die Datei ist größer als 2 GiB und wird nicht im Browser importiert.");
  onStep("validate");
  const archive = await extractApkgArchive(file);
  onStep("collection");
  const { bytes } = await findReadableCollectionDatabase(archive);
  const database = readSqliteDatabase(bytes);
  const colRows = database.readTable("col");
  onStep("cards");
  const metadata = await parseAnkiPackageMetadata(archive);
  const createdAt = Number(colRows[0]?.crt);
  return {
    file: { name: file.name, size: file.size },
    packageFormat: String(metadata.version ?? "unknown"),
    collectionCreatedAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
    decks: parseAnkiDecks(database),
    notes: parseAnkiNotes(database),
    cards: parseAnkiCards(database),
    models: await getModelsFromDatabase(database, colRows),
    reviewHistory: parseAnkiReviewHistory(database),
    media: await readAnkiMediaIndex(archive),
  };
}

function normalizeAnkiDeckPath(value: unknown) {
  return String(value ?? "Anki Deck")
    .replaceAll(FIELD_SEPARATOR, "::")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("::");
}

async function getModelsFromDatabase(database: any, colRows: any) {
  const legacyModels = getModelsFromCollection(colRows);
  if (Object.keys(legacyModels).length > 0) return legacyModels;
  const {
    decodeAnkiFieldConfig,
    decodeAnkiNotetypeConfig,
    decodeAnkiTemplateConfig,
  } = await loadProtobufDecoders();

  const notetypes = database.readTable("notetypes");
  const fields = database.readTable("fields");
  const templates = database.readTable("templates");
  const fieldsByNotetype = new Map<string, any[]>();
  const templatesByNotetype = new Map<string, any[]>();

  for (const field of fields) {
    const id = String(field.ntid ?? "");
    const notetypeFields = fieldsByNotetype.get(id);
    if (notetypeFields) notetypeFields.push(field);
    else fieldsByNotetype.set(id, [field]);
  }
  for (const template of templates) {
    const id = String(template.ntid ?? "");
    const notetypeTemplates = templatesByNotetype.get(id);
    if (notetypeTemplates) notetypeTemplates.push(template);
    else templatesByNotetype.set(id, [template]);
  }

  return Object.fromEntries(
    notetypes.map((notetype: any) => {
      const id = String(notetype.id ?? notetype.rowid ?? "");
      const name = String(notetype.name ?? "Unknown Note Type");
      const config = decodeAnkiNotetypeConfig(notetype.config);
      return [
        id,
        {
          ...notetype,
          id,
          name,
          type: config.kind,
          sortf: config.sortFieldIndex,
          css: config.css,
          did: config.targetDeckIdUnused,
          latexPre: config.latexPre,
          latexPost: config.latexPost,
          latexsvg: config.latexSvg,
          req: config.requirements.map((requirement) => [
            requirement.cardOrdinal,
            requirement.kind === 2 ? "all" : requirement.kind === 1 ? "any" : "none",
            requirement.fieldOrdinals,
          ]),
          config,
          flds: (fieldsByNotetype.get(id) ?? [])
            .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
            .map((field) => {
              const fieldConfig = decodeAnkiFieldConfig(field.config);
              return {
                ...field,
                name: String(field.name ?? ""),
                ord: Number(field.ord ?? 0),
                sticky: fieldConfig.sticky,
                rtl: fieldConfig.rtl,
                font: fieldConfig.fontName,
                size: fieldConfig.fontSize,
                description: fieldConfig.description,
                plainText: fieldConfig.plainText,
                collapsed: fieldConfig.collapsed,
                excludeFromSearch: fieldConfig.excludeFromSearch,
                id: fieldConfig.id,
                tag: fieldConfig.tag,
                preventDeletion: fieldConfig.preventDeletion,
                config: fieldConfig,
              };
            }),
          tmpls: (templatesByNotetype.get(id) ?? [])
            .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
            .map((template) => {
              const templateConfig = decodeAnkiTemplateConfig(template.config);
              return {
                ...template,
                name: String(template.name ?? ""),
                ord: Number(template.ord ?? 0),
                qfmt: templateConfig.questionFormat,
                afmt: templateConfig.answerFormat,
                bqfmt: templateConfig.browserQuestionFormat,
                bafmt: templateConfig.browserAnswerFormat,
                did: templateConfig.targetDeckId,
                bfont: templateConfig.browserFontName,
                bsize: templateConfig.browserFontSize,
                id: templateConfig.id,
                config: templateConfig,
              };
            }),
        },
      ];
    }),
  );
}
