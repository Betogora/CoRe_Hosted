import { applyLearningItemContent, createCoreDeck, createReviewState, makeId, stableContentHash } from "./coreModel.ts";
import { projectLearningItemContent } from "./coreModel/learningItemContent.ts";
import type { Deck, LearningItem, ReviewEvent, ReviewRating, ReviewSchedulerState, ReviewState } from "./coreTypes.ts";
import { createAnkiContentBundle } from "./ankiContentModel.ts";
import { stripHtml, stripSanitizedHtml } from "./htmlSafety.ts";
import { finalizeImportReport, importNormalizedDeck } from "./importService.ts";
import { readSqliteDatabase } from "./sqliteReader.ts";
import { readZipArchive } from "./zipReader.ts";
import { parseApkgWorkerResponse, type ApkgWorkerResult } from "./apkgImportWorkerProtocol.ts";
import { MAX_INTERACTIVE_DECK_LEVELS, projectImportedDeckHierarchy } from "./deckHierarchy.ts";
import { decompress as decompressZstd } from "fzstd";
import { scheduleWithFsrs } from "./scheduler.ts";

export const LOCAL_APKG_MAX_BYTES = 250_000_000;
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

export interface AnkiImportIdentityV1 {
  version: 1;
  kind: "card";
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
    classification: "basic" | "reverse" | "optional_reverse" | "cloze" | "image-occlusion" | "custom";
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
  reimport: { newItems: number; matchedItems: number; skippedItems: number };
  detectedDecks: Array<{ id: string; name: string }>;
  detectedNotes: number;
  detectedCards: number;
  hasAnkiScheduling: boolean;
  mediaCount: number;
  hasMedia: boolean;
  missingMediaCount: number;
  mediaManifest: { format: string; assets: unknown[]; missingAssets: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
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

export interface AnkiReviewHistoryPayload {
  entries: AnkiReviewHistoryEntry[];
  totalRows: number;
  skippedRows: number;
}

interface AnkiReviewHistoryImportSummary {
  detected: number;
  imported: number;
  duplicates: number;
  skipped: number;
  unmapped: number;
  directCards: number;
  replayedCards: number;
  heuristicCards: number;
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

function normalizeAnkiReviewHistoryPayload(value: unknown): AnkiReviewHistoryPayload {
  const record = value != null && typeof value === "object" ? value as Partial<AnkiReviewHistoryPayload> : {};
  if (Array.isArray(record.entries)) {
    return {
      entries: record.entries,
      totalRows: Number.isFinite(Number(record.totalRows)) ? Number(record.totalRows) : record.entries.length,
      skippedRows: Number.isFinite(Number(record.skippedRows)) ? Number(record.skippedRows) : 0,
    };
  }
  return normalizeAnkiReviewHistory(value);
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
    const pathItems = itemsByPath.get(path);
    if (pathItems) pathItems.push(item);
    else itemsByPath.set(path, [item]);
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
    const sourceHierarchyPath = splitDeckPath(node.path);
    const hierarchyProjection = projectImportedDeckHierarchy(sourceHierarchyPath);
    const directItems = itemsByPath.get(node.path) ?? [];
    const isContainerDeck = directItems.length === 0;

    return {
      ...normalizedDeck,
      id: idByPath.get(node.path),
      title: node.name,
      sourceExternalId,
      originalDeckId: sourceExternalId,
      parentDeckId: hierarchyProjection.visibleParentSourcePath ? idByPath.get(hierarchyProjection.visibleParentSourcePath) ?? null : null,
      hierarchyPath: hierarchyProjection.visiblePath,
      items: directItems,
      tags: unique(directItems.flatMap((item: any) => item.tags ?? [])),
      metadataJson: {
        ...metadata,
        importGroupId,
        hierarchyMode: "anki_subdecks",
        ankiDeckPath: node.path,
        ankiDeckDepth: node.depth ?? Math.max(0, sourceHierarchyPath.length - 1),
        ankiParentPath: node.parentPath ?? null,
        isContainerDeck,
        detectedCards: directItems.reduce((sum: any, item: any) => sum + Math.max(1, item.cards?.length ?? 1), 0),
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
  const mediaPattern = /(?:src|href)=["']([^"']+)["']|\[sound:([^\]]+)\]|url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match = mediaPattern.exec(html ?? "");

  while (match) {
    refs.push(match[1] ?? match[2] ?? match[3]);
    match = mediaPattern.exec(html ?? "");
  }

  return unique(refs);
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

function getMediaAssetCount(mediaMap: any = {}, mediaManifest: any = null) {
  return mediaManifest?.assets?.length ?? Object.keys(mediaMap).length;
}

function cardHasAnkiSchedulingData(card: any = {}) {
  return ["reps", "lapses", "ivl", "type", "queue", "odue", "odid"].some((key: any) => Number(card[key] ?? 0) > 0)
    || readAnkiFsrsMemoryState(card.data) !== null;
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
    flags: card.flags ?? null,
    data: typeof card.data === "string" ? card.data : null,
  };
}

function readAnkiFsrsMemoryState(data: unknown): {
  stability: number;
  difficulty: number;
  desiredRetention: number | null;
  lastReviewedAt: string | null;
  raw: Record<string, unknown>;
} | null {
  if (typeof data !== "string" || !data.trim()) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const stability = Number(parsed.s);
    const difficulty = Number(parsed.d);
    if (!Number.isFinite(stability) || stability <= 0 || !Number.isFinite(difficulty) || difficulty <= 0) return null;
    const desiredRetention = Number(parsed.dr);
    const lastReviewSeconds = Number(parsed.lrt);
    return {
      stability,
      difficulty,
      desiredRetention: Number.isFinite(desiredRetention) && desiredRetention > 0 && desiredRetention < 1
        ? desiredRetention
        : null,
      lastReviewedAt: Number.isFinite(lastReviewSeconds) && lastReviewSeconds > 0
        ? new Date(lastReviewSeconds * 1_000).toISOString()
        : null,
      raw: parsed,
    };
  } catch {
    return null;
  }
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

  if (file && file.size > LOCAL_APKG_MAX_BYTES) {
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

export function parseAnkiReviewHistory(database: { readTable(tableName: string): unknown }) {
  return normalizeAnkiReviewHistory(database.readTable("revlog"));
}

export async function parsePackageMetadataBytes(bytes: any) {
  try {
    const { decodePackageMetadata } = await loadProtobufDecoders();
    return decodePackageMetadata(bytes);
  } catch (error) {
    throw new Error("Ungültige Package-Metadaten im Protobuf-Format.", { cause: error });
  }
}

export async function parseMediaEntriesBytes(bytes: any) {
  try {
    const { decodeMediaEntries } = await loadProtobufDecoders();
    return decodeMediaEntries(bytes);
  } catch (error) {
    throw new Error("Ungültiges MediaEntries-Varint/Protobuf.", { cause: error });
  }
}

export async function parseAnkiPackageMetadata(archive: any) {
  const metaEntry = archive.getEntry("meta");

  if (!metaEntry) {
    return { version: archive.getEntry("collection.anki21") ? "legacy-2" : "legacy-1" };
  }

  const bytes = maybeDecompressZstdBytes(await metaEntry.readBytes());
  return await parsePackageMetadataBytes(bytes);
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

  const availableZipEntries = new Set(mediaFiles.map((file: any) => file.zipEntryName));
  return {
    format: "legacy-json",
    mediaMap,
    mediaFiles,
    manifest: {
      format: "legacy-json",
      packageVersion: metadata.version,
      assets: mediaFiles.map(({ bytes, ...asset }: any) => asset),
      missingAssets: Object.entries(mediaMap)
        .filter(([zipEntryName]: any) => !availableZipEntries.has(String(zipEntryName)))
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

  const availableByZipName = new Map(availableFiles.map((file: any) => [file.zipEntryName, file]));
  const availableByHashAndSize = new Map(availableFiles.map((file: any) => [`${file.sha1}:${file.size}`, file]));

  for (const manifestEntry of mediaEntries) {
    const matched =
      (manifestEntry.legacyZipFileName ? availableByZipName.get(manifestEntry.legacyZipFileName) : null)
      ?? availableByHashAndSize.get(`${manifestEntry.sha1}:${manifestEntry.size}`);

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
  const matchedByName = new Map(mediaFiles.map((file: any) => [file.name, file]));

  return {
    format: "media-entries",
    mediaMap,
    mediaFiles,
    manifest: {
      format: "media-entries",
      packageVersion: metadata.version,
      assets: mediaEntries.map((entry: any) => {
        const normalizedName = normalizeMediaFileName(entry.name);
        const matched = matchedByName.get(normalizedName);
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

  const mediaEntries = await parseMediaEntriesBytes(mediaBytes);
  if (mediaEntries.length > 0) {
    return collectModernMediaBundle(archive, mediaEntries, metadata);
  }

  return createEmptyMediaBundle("unknown", { packageVersion: metadata.version });
}

export function mapAnkiApkgToNormalizedDeck({ file = {}, decks = [], notes = [], cards = [], colRows = [], models: suppliedModels = null, mediaMap = {}, mediaManifest = null }: any = {}) {
  const models = suppliedModels ?? getModelsFromCollection(colRows);
  const deckById = new Map<any, any>(decks.map((deck: any) => [String(deck.id), deck]));
  const noteById = new Map(notes.map((note: any) => [String(note.id), note]));
  const cardsByNoteId = new Map();
  const mediaNameIndex = new Map<string, string>();
  for (const name of Object.values(mediaMap)) {
    const normalizedName = normalizeMediaFileName(name);
    if (normalizedName) mediaNameIndex.set(normalizedName, normalizedName);
  }
  for (const asset of mediaManifest?.assets ?? []) {
    const normalizedName = normalizeMediaFileName(asset.name);
    if (normalizedName) mediaNameIndex.set(normalizedName, normalizedName);
  }
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
    const noteCards = cardsByNoteId.get(noteId);
    if (noteCards) noteCards.push(card);
    else cardsByNoteId.set(noteId, [card]);
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

    hasAnkiScheduling = hasAnkiScheduling || noteHasScheduling;
    hasCloze = hasCloze || Number(model.config?.kind ?? model.type ?? 0) === 1;

    const templateSources = (model.tmpls ?? []).flatMap((template: any) => [template.qfmt, template.afmt, template.bqfmt, template.bafmt]);
    const mediaRefs = unique([...fields.map((field: any) => field.value), ...templateSources, model.css, model.config?.css]
      .flatMap((html: any) => extractMediaRefs(html))
      .map((reference: any) => normalizeMediaFileName(reference))
      .filter((reference: string | undefined): reference is string => Boolean(reference))
      .map((reference: string) => mediaNameIndex.get(reference) ?? reference)) as string[];
    const createdAt = Number.isFinite(Number(file.lastModified))
      ? new Date(Number(file.lastModified)).toISOString()
      : new Date().toISOString();
    const contentBundle = createAnkiContentBundle({
      model,
      fieldValues: fields,
      tags,
      mediaRefs,
      note,
      cards: noteCards,
      importFingerprint: importGroupId,
      createdAt,
    });
    const contentProjection = projectLearningItemContent({
      document: contentBundle.document,
      definition: contentBundle.definition,
    });
    const activeMaterializedVariants = contentProjection.cards;
    const projectedInputs = contentBundle.definition.kind === "image-occlusion"
      ? noteCards.map((sourceCard: any, index: number) => ({ variant: activeMaterializedVariants[0], sourceCard, index }))
      : activeMaterializedVariants.map((variant: any, index: number) => {
          const recipe = contentBundle.definition.recipes.find((candidate) => candidate.id === variant.projection.recipeId);
          const sourceCard = variant.projection.kind === "cloze"
            ? noteCards.find((card: any) => Number(card.ord ?? 0) + 1 === variant.projection.clozeOrdinal)
            : noteCards.find((card: any) => Number(card.ord ?? 0) === Number(recipe?.ordinal ?? index));
          return { variant, sourceCard, index };
        });
    const projectedCards = projectedInputs.map(({ variant, sourceCard, index }: any) => {
      if (!variant) return null;
      const recipe = contentBundle.definition.recipes.find((candidate) => candidate.id === variant.projection.recipeId);
      const sourceDeck = deckById.get(String(sourceCard?.did ?? "")) ?? primaryDeck;
      const projection = contentBundle.definition.kind === "image-occlusion"
        ? { kind: "image-occlusion", recipeId: recipe?.id ?? variant.projection.recipeId, regionKey: String(sourceCard?.id ?? index) }
        : variant.projection;
      return {
        front: variant.front,
        back: variant.back,
        cardType: variant.variantType,
        sourceExternalId: sourceCard?.id == null ? null : `anki-card-${String(sourceCard.id)}`,
        projection,
        metadataJson: {
          ankiImportIdentityV1: {
            version: 1,
            kind: "card",
            cardId: sourceCard?.id == null ? null : String(sourceCard.id),
            notetypeId,
            templateOrdinal: Number(recipe?.ordinal ?? sourceCard?.ord ?? 0),
            templateName: recipe?.name ?? getTemplateName(sourceCard, model),
            deckId: sourceDeck.id == null ? null : String(sourceDeck.id),
            deckPath: sourceDeck.name ?? null,
            importGroupId,
          } satisfies AnkiImportIdentityV1,
          ankiCardId: sourceCard?.id == null ? null : String(sourceCard.id),
          ankiTemplateOrd: recipe?.ordinal ?? sourceCard?.ord ?? null,
          ankiTemplateName: recipe?.name ?? null,
          ankiDefinitionId: contentBundle.definition.id,
          ankiModifiedAt: Number(note.mod) > 0 ? new Date(Number(note.mod) * 1_000).toISOString() : createdAt,
          sourceSchedulerData: sourceCard ? createAnkiSchedulingSnapshot(sourceCard) : null,
        },
      };
    }).filter((card: any) => card?.sourceExternalId);
    const firstCard = projectedCards[0] ?? null;

    warnings.push(...itemWarnings);

    items.push({
      title: firstCard?.front
        ? stripSanitizedHtml(firstCard.front).slice(0, 120)
        : stripHtml(fields[0]?.value ?? `Anki Note ${String(note.id)}`).slice(0, 120),
      canonicalQuestion: firstCard?.front ?? fields[0]?.value ?? "",
      canonicalAnswer: firstCard?.back ?? fields[1]?.value ?? "",
      tags,
      sourceType: "anki_import",
      sourceExternalId: null,
      cardType: contentBundle.definition.kind === "image-occlusion" ? "image-occlusion" : firstCard?.cardType === "cloze" ? "cloze" : "basic",
      mediaRefs,
      originalFields: fields,
      contentDocument: contentBundle.document,
      noteTypeDefinition: contentBundle.definition,
      cards: projectedCards,
      metadataJson: {
        importFormat: "apkg",
        ankiDeckId: sourceDeckIds[0] ?? null,
        ankiDeckIds: sourceDeckIds,
        ankiDeckNames: sourceDeckNames,
        ankiModelName: modelName,
        ankiTemplateName: firstCard?.metadataJson?.ankiTemplateName ?? null,
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

  const deckHierarchy = buildDeckHierarchy(decks);
  const flattenedDeckCount = deckHierarchy.reduce(
    (count: number, node: any) => count + (Number(node.depth ?? 0) >= MAX_INTERACTIVE_DECK_LEVELS ? 1 : 0),
    0,
  );
  if (flattenedDeckCount === 1) {
    warnings.push("Ein Anki-Stapel wurde ab Ebene 9 auf Ebene 8 abgeflacht. Der ursprüngliche Pfad bleibt erhalten.");
  } else if (flattenedDeckCount > 1) {
    warnings.push(`${flattenedDeckCount} Anki-Stapel wurden ab Ebene 9 auf Ebene 8 abgeflacht. Die ursprünglichen Pfade bleiben erhalten.`);
  }

  if (decks.length > 1) {
    warnings.push("Mehrere Anki-Decks wurden erkannt; CoRe legt daraus sichtbare Stapel und Unterstapel an.");
  }

  if (hasCloze) {
    warnings.push("Cloze-Karten wurden erkannt und als eigenständige Karten importiert.");
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
        deckHierarchy,
        unsupportedNoteTypes: unique(unsupportedNoteTypes),
      },
    },
    warnings: unique(warnings),
    errors,
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
  const reviewHistory = parseAnkiReviewHistory(database);
  const models = await getModelsFromDatabase(database, colRows);
  const mediaBundle = await parseAnkiMedia(archive);

  return {
    file,
    archive,
    database,
    colRows,
    decks,
    notes,
    cards,
    reviewHistory,
    models,
    mediaBundle,
  };
}

function isParsedAnkiPackage(input: any) {
  return Boolean(input && Array.isArray(input.decks) && Array.isArray(input.notes) && Array.isArray(input.cards));
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
  const fieldNames = (model?.flds ?? []).map((field: any) => String(field.name ?? ""));
  if (Number(model?.config?.originalStockKind ?? 0) === 6) return "image-occlusion";
  if (Number(model?.config?.kind ?? model?.type ?? 0) === 1) return "cloze";
  if (fieldNames.length > 2 || (model?.tmpls?.length ?? 0) > 1) return "custom";
  return "basic";
}

function normalizedReportCards(normalizedDeck: any): any[] {
  return (normalizedDeck?.items ?? []).flatMap((item: any) => Array.isArray(item.cards) && item.cards.length ? item.cards : [item]);
}

function sourceCardIdForReport(card: any): string | null {
  const raw = card?.sourceCardId
    ?? card?.metadataJson?.ankiImportIdentityV1?.cardId
    ?? card?.metadataJson?.ankiCardId
    ?? card?.sourceExternalId
    ?? null;
  return raw == null ? null : String(raw).replace(/^anki-card-/, "");
}

function createReimportSummary(normalizedDeck: any, existingDecks: any[], baseReport: any) {
  const existingSourceCardIds = new Set(existingDecks
    .flatMap((deck: any) => deck.cards ?? [])
    .map(sourceCardIdForReport)
    .filter(Boolean));
  const cards = normalizedReportCards(normalizedDeck);
  const matchedItems = cards.filter((card) => {
    const sourceCardId = sourceCardIdForReport(card);
    return sourceCardId ? existingSourceCardIds.has(sourceCardId) : false;
  }).length;
  return {
    newItems: Math.max(0, cards.length - matchedItems),
    matchedItems,
    skippedItems: Number(baseReport?.skipped?.length ?? 0) + Number(baseReport?.duplicates?.length ?? 0),
  };
}

export function createApkgReportDetails(parsed: any, normalizedDeck: any, existingDecks: any[] = [], baseReport: any = null): ApkgImportReportV1 {
  const metadata = normalizedDeck?.metadataJson ?? {};
  if (parsed?.reportDetails) {
    return {
      ...parsed.reportDetails,
      reimport: createReimportSummary(normalizedDeck, existingDecks, baseReport),
      duplicateCount: Number(baseReport?.duplicates?.length ?? parsed.reportDetails.duplicateCount ?? 0),
    };
  }
  const detectedDecks = metadata.detectedDecks ?? parsed?.decks ?? [];
  const detectedNotes = metadata.detectedNotes ?? parsed?.notes?.length ?? normalizedDeck?.items?.length ?? 0;
  const detectedCards = metadata.detectedCards ?? parsed?.cards?.length ?? 0;
  const hasAnkiScheduling = Boolean(metadata.hasAnkiScheduling ?? parsed?.cards?.some(cardHasAnkiSchedulingData));
  const mediaManifest = metadata.mediaManifest ?? parsed?.mediaBundle?.manifest ?? { format: "none", assets: [], missingAssets: [] };
  const parsedCards = parsed?.cards ?? [];
  const models = parsed?.models ?? getModelsFromCollection(parsed?.colRows ?? []);
  const cardsByDeckId = new Map<string, any[]>();
  for (const card of parsedCards) {
    const deckId = String(card.did ?? "");
    const deckCards = cardsByDeckId.get(deckId);
    if (deckCards) deckCards.push(card);
    else cardsByDeckId.set(deckId, [card]);
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
      const mappedFieldCount = fieldNames.length;
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
  const reimport = createReimportSummary(normalizedDeck, existingDecks, baseReport);

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
    reimport,
    detectedDecks,
    detectedNotes,
    detectedCards,
    createdCoreItems: normalizedReportCards(normalizedDeck).length,
    duplicateCount: 0,
    hasAnkiScheduling,
    schedulingImported: false,
    reviewHistory: {
      detected: Number(parsed?.reviewHistory?.totalRows ?? 0),
      imported: 0,
      duplicates: 0,
      skipped: Number(parsed?.reviewHistory?.skippedRows ?? 0),
      unmapped: 0,
    },
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
        skipped: [],
        duplicates: [],
        warnings: [],
        errors: [],
        summary: {},
      };

  report.createdDecks = results.reduce((sum: any, result: any) => sum + Number(result.report?.createdDecks ?? 0), 0);
  report.createdLearningItems = results.reduce((sum: any, result: any) => sum + Number(result.report?.createdLearningItems ?? 0), 0);
  report.createdCards = report.createdLearningItems;
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
  const noteTypeDefinitions = [...new Map(results
    .flatMap((result: any) => result.commitGraph?.noteTypeDefinitions ?? [])
    .map((definition: any) => [definition.id, definition])).values()];
  const content = {
    definitions: new Map(noteTypeDefinitions.map((definition: any) => [definition.id, definition])),
  };
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
    commitGraph: { decks, noteTypeDefinitions },
    report: mergeImportReports(results),
  };
}

function createImportedReviewEvent(
  entry: AnkiReviewHistoryEntry,
  deck: Deck,
  item: Deck["cards"][number],
): ReviewEvent {
  const eventId = stableContentHash({ source: "anki_revlog", reviewId: entry.reviewId, cardId: entry.cardId }, "review_anki");
  const beforeCard = {
    state: entry.beforeState,
    intervalDays: entry.beforeIntervalDays,
    intervalMinutes: entry.beforeIntervalMinutes,
    ease: entry.ease,
  };
  const afterCard = {
    state: entry.afterState,
    intervalDays: entry.afterIntervalDays,
    intervalMinutes: entry.afterIntervalMinutes,
    ease: entry.ease,
  };
  return {
    id: eventId,
    userId: deck.ownerId,
    deckId: deck.id,
    learningItemId: item.id,
    variantId: null,
    reviewableType: "card",
    reviewableId: item.id,
    sourceCardId: item.id,
    rating: entry.rating,
    answeredAt: entry.answeredAt,
    responseTimeMs: entry.responseTimeMs,
    schedulerBefore: { card: beforeCard },
    schedulerAfter: { card: afterCard },
    flags: {
      source: "anki_revlog",
      ankiReviewId: entry.reviewId,
      ankiCardId: entry.cardId,
      ankiReviewType: entry.reviewType,
      filteredDeckReview: entry.reviewType === 3,
    },
    createdAt: entry.answeredAt,
  };
}

function replayAnkiHistoryIntoCard(
  item: LearningItem,
  entries: AnkiReviewHistoryEntry[],
  deck: Deck,
): LearningItem {
  let state: ReviewState = item.reviewState;
  for (const entry of [...entries].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))) {
    state = scheduleWithFsrs(state, entry.rating, {
      now: entry.answeredAt,
      isVariant: false,
      variantId: null,
      variantIsOriginal: true,
      deckSettings: deck.deckSettings,
    });
  }
  const previousSource = state.sourceSchedulerData && typeof state.sourceSchedulerData === "object"
    ? state.sourceSchedulerData as Record<string, unknown>
    : {};
  return {
    ...item,
    reviewState: {
      ...state,
      sourceSchedulerData: {
        ...previousSource,
        source: "anki",
        migrationVersion: 1,
        migrationMethod: "revlog-replay",
        ankiReviewIds: entries.map((entry) => entry.reviewId),
        rawCardState: item.meta.sourceSchedulerData ?? null,
      },
    },
    meta: { ...item.meta, schedulingImported: true, schedulingMigrationMethod: "revlog-replay" },
  };
}

function migrateAnkiFsrsMemoryState(item: LearningItem, importedAt = new Date()): LearningItem | null {
  const raw = item.meta.sourceSchedulerData && typeof item.meta.sourceSchedulerData === "object"
    ? item.meta.sourceSchedulerData as Record<string, unknown>
    : null;
  const memory = readAnkiFsrsMemoryState(raw?.data);
  if (!raw || !memory) return null;
  const interval = intervalFromAnki(raw.interval);
  const type = Number(raw.type ?? 0);
  const queue = Number(raw.queue ?? type);
  const state: ReviewSchedulerState = type === 1 ? "learning" : type === 3 ? "relearning" : type === 2 ? "review" : "new";
  const originalDue = Number(raw.odue);
  const due = originalDue > 0 ? originalDue : Number(raw.due);
  const dueAt = (state === "learning" || state === "relearning") && due > 1_000_000_000
    ? new Date(due * 1_000).toISOString()
    : memory.lastReviewedAt
      ? new Date(new Date(memory.lastReviewedAt).getTime() + Math.max(0, interval.days) * 86_400_000).toISOString()
      : new Date(importedAt.getTime() + Math.max(0, interval.days) * 86_400_000).toISOString();
  const factor = Number(raw.factor ?? 2500);
  const ease = Number.isFinite(factor) && factor > 0 ? factor / 1000 : 2.5;
  const reviewState = createReviewState({
    ...item.reviewState,
    learningItemId: item.id,
    reviewableType: "card",
    reviewableId: item.id,
    state,
    dueAt,
    intervalDays: interval.days,
    intervalMinutes: interval.minutes,
    ease,
    stability: memory.stability,
    difficulty: Math.min(10, Math.max(1, memory.difficulty)),
    desiredRetention: memory.desiredRetention ?? item.reviewState.desiredRetention ?? 0.9,
    reps: Math.max(0, Number(raw.reps ?? 0)),
    repetitions: Math.max(0, Number(raw.reps ?? 0)),
    lapses: Math.max(0, Number(raw.lapses ?? 0)),
    lastReviewedAt: memory.lastReviewedAt,
    sourceSchedulerData: {
      source: "anki",
      migrationVersion: 1,
      migrationMethod: "fsrs-memory-state",
      rawCardState: raw,
      rawMemoryState: memory.raw,
    },
  });
  return {
    ...item,
    reviewState,
    status: queue === -1 ? "suspended" : item.status,
    meta: {
      ...item.meta,
      schedulingImported: true,
      schedulingMigrationMethod: "fsrs-memory-state",
      ankiSuspended: queue === -1,
      ankiBuried: queue === -2 || queue === -3,
    },
  };
}

function migrateAnkiCardStateHeuristically(item: LearningItem, importedAt = new Date()): LearningItem | null {
  const raw = item.meta.sourceSchedulerData && typeof item.meta.sourceSchedulerData === "object"
    ? item.meta.sourceSchedulerData as Record<string, unknown>
    : null;
  if (!raw || Number(raw.reps ?? 0) <= 0) return null;
  const interval = intervalFromAnki(raw.interval);
  const type = Number(raw.type ?? 0);
  const queue = Number(raw.queue ?? type);
  const state: ReviewSchedulerState = type === 1 ? "learning" : type === 3 ? "relearning" : type === 2 ? "review" : "new";
  const due = Number(raw.due);
  const dueAt = (state === "learning" || state === "relearning") && due > 1_000_000_000
    ? new Date(due * 1_000).toISOString()
    : new Date(importedAt.getTime() + Math.max(0, interval.days) * 86_400_000).toISOString();
  const factor = Number(raw.factor ?? 2500);
  const ease = Number.isFinite(factor) && factor > 0 ? factor / 1000 : 2.5;
  const reviewState = createReviewState({
    ...item.reviewState,
    learningItemId: item.id,
    reviewableType: "card",
    reviewableId: item.id,
    state,
    dueAt,
    intervalDays: interval.days,
    intervalMinutes: interval.minutes,
    ease,
    stability: Math.max(interval.days, interval.minutes ? interval.minutes / 1440 : 0.1),
    difficulty: Math.min(10, Math.max(1, 11 - ease * 2)),
    reps: Math.max(0, Number(raw.reps ?? 0)),
    repetitions: Math.max(0, Number(raw.reps ?? 0)),
    lapses: Math.max(0, Number(raw.lapses ?? 0)),
    sourceSchedulerData: {
      source: "anki",
      migrationVersion: 1,
      migrationMethod: "sm2-card-state",
      rawCardState: raw,
    },
  });
  return {
    ...item,
    reviewState,
    status: queue === -1 ? "suspended" : item.status,
    meta: {
      ...item.meta,
      schedulingImported: true,
      schedulingMigrationMethod: "sm2-card-state",
      ankiSuspended: queue === -1,
      ankiBuried: queue === -2 || queue === -3,
    },
  };
}

export function applyAnkiReviewHistory(decks: Deck[], payload: AnkiReviewHistoryPayload) {
  const targetByAnkiCardId = new Map<string, { deck: Deck; item: Deck["cards"][number] }>();
  for (const deck of decks) {
    for (const item of deck.cards) {
      const cardId = item.sourceCardId ?? String(item.meta.ankiCardId ?? "");
      if (cardId) targetByAnkiCardId.set(cardId, { deck, item });
    }
  }

  const existingIds = new Set(decks.flatMap((deck) => deck.reviewEvents.map((event) => event.id)));
  const additionsByDeckId = new Map<string, ReviewEvent[]>();
  const replayByCardId = new Map<string, AnkiReviewHistoryEntry[]>();
  let imported = 0;
  let duplicates = 0;
  let unmapped = 0;
  for (const entry of payload.entries) {
    const target = targetByAnkiCardId.get(entry.cardId);
    if (!target) { unmapped += 1; continue; }
    const event = createImportedReviewEvent(entry, target.deck, target.item);
    if (existingIds.has(event.id)) { duplicates += 1; continue; }
    existingIds.add(event.id);
    const additions = additionsByDeckId.get(target.deck.id);
    if (additions) additions.push(event);
    else additionsByDeckId.set(target.deck.id, [event]);
    const replayEntries = replayByCardId.get(target.item.id);
    if (replayEntries) replayEntries.push(entry);
    else replayByCardId.set(target.item.id, [entry]);
    imported += 1;
  }

  let directCards = 0;
  let replayedCards = 0;
  let heuristicCards = 0;
  const updatedDecks = decks.map((deck) => {
    const additions = additionsByDeckId.get(deck.id) ?? [];
    const cards = deck.cards.map((item) => {
      const schedulerData = item.reviewState.sourceSchedulerData;
      if (schedulerData && typeof schedulerData === "object" && "migrationMethod" in (schedulerData as Record<string, unknown>)) return item;
      const direct = migrateAnkiFsrsMemoryState(item);
      if (direct) { directCards += 1; return direct; }
      const replayEntries = replayByCardId.get(item.id) ?? [];
      if (replayEntries.length > 0) { replayedCards += 1; return replayAnkiHistoryIntoCard(item, replayEntries, deck); }
      const migrated = migrateAnkiCardStateHeuristically(item);
      if (migrated) heuristicCards += 1;
      return migrated ?? item;
    });
    if (additions.length === 0 && cards.every((item, index) => item === deck.cards[index])) return deck;
    return {
      ...deck,
      cards,
      reviewEvents: [...deck.reviewEvents, ...additions].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt)),
    };
  });
  const summary: AnkiReviewHistoryImportSummary = {
    detected: payload.totalRows,
    imported,
    duplicates,
    skipped: payload.skippedRows,
    unmapped,
    directCards,
    replayedCards,
    heuristicCards,
  };
  return { decks: updatedDecks, summary };
}

function mapParsedApkgPackage(parsedPackage: any) {
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
    reviewHistory: parsedPackage.reviewHistory,
    parsedPackage,
  };
}

export async function parseApkgToNormalizedImport(fileOrParsed: any, options: any = {}) {
  if (isParsedAnkiPackage(fileOrParsed)) {
    const parsedPackage = {
      ...fileOrParsed,
      file: fileOrParsed.file ?? { name: "anki.apkg", size: 0 },
      colRows: fileOrParsed.colRows ?? [],
      reviewHistory: normalizeAnkiReviewHistoryPayload(fileOrParsed.reviewHistory ?? fileOrParsed.revlog ?? []),
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
    return mapParsedApkgPackage(parsedPackage);
  }

  const file = fileOrParsed;
  const validation = validateApkgFile(file);
  if (!validation.valid) {
    return {
      normalizedDeck: emptyNormalizedApkgDeck(file),
      warnings: [],
      errors: validation.errors,
      mediaFiles: [],
      reviewHistory: EMPTY_ANKI_REVIEW_HISTORY,
      parsedPackage: null,
    };
  }

  try {
    const parsedPackage = await readApkgPackage(file, options.onStep ?? (() => {}));
    options.onStep?.("preview");
    return mapParsedApkgPackage(parsedPackage);
  } catch (error) {
    return {
      normalizedDeck: emptyNormalizedApkgDeck(file),
      warnings: [],
      errors: [error instanceof Error ? error.message : "APKG konnte nicht gelesen werden."],
      mediaFiles: [],
      reviewHistory: EMPTY_ANKI_REVIEW_HISTORY,
      parsedPackage: null,
    };
  }
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

function canUseApkgWorker(file: unknown): file is File {
  return typeof Worker === "function" && Boolean(file && typeof (file as File).arrayBuffer === "function");
}

export function prepareApkgWorkerResult(parsed: any) {
  const normalizedDeck = parsed.normalizedDeck;
  const committed: any = commitNormalizedApkgHierarchy(normalizedDeck, { existingDecks: [] });
  const history = applyAnkiReviewHistory(committed.decks, parsed.reviewHistory);
  committed.decks = history.decks;
  committed.deck = history.decks.find((deck) => deck.id === committed.deck?.id) ?? committed.deck;
  committed.commitGraph = { ...committed.commitGraph, decks: history.decks };
  attachApkgReportDetails(committed, parsed.parsedPackage, parsed.warnings, parsed.errors);
  committed.report.apkg.reviewHistory = history.summary;
  const migratedCards = history.summary.directCards + history.summary.replayedCards + history.summary.heuristicCards;
  committed.report.schedulingImported = migratedCards > 0;
  committed.report.apkg.schedulingImported = migratedCards > 0;
  committed.report.dryRun = true;
  const details = committed.report.apkg;
  const metadata = normalizedDeck.metadataJson ?? {};
  const summary = {
    ...createCoreDeck({
      id: normalizedDeck.id ?? undefined,
      name: normalizedDeck.title,
      description: normalizedDeck.description,
      source: "anki-apkg",
      parentDeckId: normalizedDeck.parentDeckId,
      hierarchyPath: normalizedDeck.hierarchyPath,
      originalDeckId: normalizedDeck.originalDeckId,
      tags: normalizedDeck.tags,
      cards: [],
    }),
    cardCount: details.createdCoreItems,
    importMeta: {
      detectedDecks: details.detectedDecks,
      detectedNotes: details.detectedNotes,
      detectedCards: details.detectedCards,
      hasAnkiScheduling: details.hasAnkiScheduling,
      hasMedia: details.hasMedia,
      mediaCount: details.mediaCount,
      mediaManifest: details.mediaManifest,
      deckHierarchy: metadata.deckHierarchy ?? [],
    },
  };
  const mediaByReference = new Map<string, any>();
  for (const file of parsed.mediaFiles ?? []) {
    const name = normalizeMediaFileName(file?.name);
    if (name) mediaByReference.set(name, file);
    if (file?.sha1) mediaByReference.set(String(file.sha1).toLowerCase(), file);
  }
  const mediaTargets = new Map<string, { deckId: string; name: string }>();
  for (const deck of committed.decks as Deck[]) {
    for (const card of deck.cards) {
      for (const reference of card.mediaRefs ?? []) {
        const referenceName = normalizeMediaFileName(reference);
        const file = (referenceName ? mediaByReference.get(referenceName) : undefined)
          ?? mediaByReference.get(String(reference).toLowerCase());
        if (!file) continue;
        const name = normalizeMediaFileName(file.name);
        if (name) mediaTargets.set(`${deck.id}\u0000${name}`, { deckId: deck.id, name });
      }
    }
  }
  return {
    summary,
    sampleCards: committed.decks.flatMap((deck: Deck) => deck.cards).slice(0, 5),
    report: committed.report,
    commitGraph: committed.commitGraph,
    mediaFiles: parsed.mediaFiles,
    mediaTargets: [...mediaTargets.values()],
  };
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
      if (response.output.type !== "result") {
        fail(new Error("APKG-Worker hat vorzeitig Commitdaten geliefert."));
        return;
      }
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      const result = response.output.result as any;
      const descriptor = result.commitGraph;
      result.commitGraph = {
        ...descriptor,
        dispose() { cleanup(); },
        streamChunks(visit: (chunk: unknown) => Promise<void>) {
          return new Promise<void>((resolveCommit, rejectCommit) => {
            worker.onmessage = (commitEvent: MessageEvent<unknown>) => {
              const commitResponse = parseApkgWorkerResponse(commitEvent.data);
              if (!commitResponse.success || commitResponse.output.requestId !== requestId) {
                cleanup();
                rejectCommit(new Error("APKG-Worker hat eine ungültige Commit-Nachricht geliefert."));
                return;
              }
              if (commitResponse.output.type === "error") {
                cleanup();
                rejectCommit(new Error(commitResponse.output.message));
                return;
              }
              if (commitResponse.output.type === "commit-chunk") {
                void visit(commitResponse.output.chunk)
                  .then(() => worker.postMessage({ type: "commit-next", requestId }))
                  .catch((error) => { cleanup(); rejectCommit(error); });
                return;
              }
              if (commitResponse.output.type === "commit-done") {
                cleanup();
                resolveCommit();
              }
            };
            worker.postMessage({ type: "commit", requestId });
          });
        },
      };
      resolve(result);
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
  if (!canUseApkgWorker(file) && typeof window !== "undefined") {
    throw new Error("APKG-Import benötigt einen unterstützten Web Worker.");
  }
  const prepared = canUseApkgWorker(file)
    ? await parseApkgInWorker(file, onStep, options.signal)
    : prepareApkgWorkerResult(await parseApkgToNormalizedImport(file, { onStep }));
  const commitGraph: any = prepared.commitGraph;
  const report: any = prepared.report;
  const details = commitGraph.kind === "worker-import"
    ? report.apkg
    : createApkgReportDetails({ reportDetails: report.apkg }, commitGraph, options.existingDecks ?? [], report);
  report.apkg = { ...details, reviewHistory: report.apkg.reviewHistory };
  report.dryRun = true;
  const job = {
    id: makeId("import"),
    fileName: file?.name ?? "",
    fileSize: file?.size ?? 0,
    status: report.errors.length > 0 ? "error" : "preview",
    detectedDecks: details.detectedDecks,
    detectedCards: details.detectedCards,
    detectedNotes: details.detectedNotes,
    warnings: unique(report.warnings),
    errors: unique(report.errors),
    createdAt: startedAt,
  };

  if (report.errors.length > 0) {
    if (commitGraph.kind === "worker-import") commitGraph.dispose();
    return { job, preview: null };
  }

  const preparedSummary = prepared.summary as Deck;
  const existingDeck = findExistingImportedDeck(preparedSummary, options.existingDecks ?? []);
  const summary = existingDeck ? {
    ...preparedSummary,
    id: existingDeck.id,
    name: existingDeck.name || preparedSummary.name,
    createdAt: existingDeck.createdAt,
    mediaAssets: existingDeck.mediaAssets ?? [],
  } : preparedSummary;

  return {
    job: {
      ...job,
      warnings: report.warnings,
    },
    preview: {
      summary: summary as Deck,
      sampleCards: prepared.sampleCards as LearningItem[],
      report,
      commitGraph,
      mediaFiles: prepared.mediaFiles,
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

function mergeImportedCard(incomingCard: any, existingCard: any) {
  if (!existingCard) return incomingCard;
  const incomingModifiedAt = Date.parse(String(incomingCard.meta?.ankiModifiedAt ?? incomingCard.updatedAt ?? ""));
  const existingModifiedAt = Date.parse(String(existingCard.meta?.ankiModifiedAt ?? existingCard.updatedAt ?? ""));
  if (Number.isFinite(existingModifiedAt) && (!Number.isFinite(incomingModifiedAt) || incomingModifiedAt <= existingModifiedAt)) return existingCard;
  return {
    ...incomingCard,
    id: existingCard.id,
    createdAt: existingCard.createdAt ?? incomingCard.createdAt,
    updatedAt: new Date().toISOString(),
    status: existingCard.status,
    reviewState: existingCard.reviewState,
    variants: existingCard.variants,
    meta: {
      ...incomingCard.meta,
      ...(Object.hasOwn(existingCard.meta ?? {}, "marked") ? { marked: existingCard.meta.marked === true } : {}),
    },
  };
}

export function mergeImportedDeck(importedDeck: any, existingDecks: any = []) {
  const existingDeck = findExistingImportedDeck(importedDeck, existingDecks);
  if (!existingDeck) return importedDeck;

  const existingCardsBySourceId = new Map(
    existingDeck.cards.filter((card: any) => card.sourceCardId).map((card: any) => [String(card.sourceCardId), card]),
  );
  const now = new Date().toISOString();

  return createCoreDeck({
    ...importedDeck,
    id: existingDeck.id,
    name: existingDeck.name || importedDeck.name,
    description: existingDeck.description ?? importedDeck.description,
    ownerId: existingDeck.ownerId ?? importedDeck.ownerId,
    hierarchyPath: existingDeck.hierarchyPath ?? importedDeck.hierarchyPath,
    createdAt: existingDeck.createdAt ?? importedDeck.createdAt,
    updatedAt: now,
    deckSettings: existingDeck.deckSettings,
    reviewEvents: existingDeck.reviewEvents ?? [],
    importMeta: {
      ...(existingDeck.importMeta ?? {}),
      ...importedDeck.importMeta,
      reimportedAt: now,
      replacedDeckId: existingDeck.id,
    },
    mediaAssets: existingDeck.mediaAssets ?? [],
    cards: importedDeck.cards.map((card: any) => {
      const existingCard = card.sourceCardId ? existingCardsBySourceId.get(String(card.sourceCardId)) : null;
      return mergeImportedCard(card, existingCard);
    }),
  });
}

export function commitApkgImport(preview: any, options: any = {}) {
  if (!preview?.commitGraph) throw new Error("Es gibt keine APKG-Vorschau, die gespeichert werden kann.");
  const graph = preview.commitGraph;
  if (graph.kind === "worker-import") {
    return { deck: preview.summary, decks: [preview.summary], commitGraph: graph, mediaFiles: preview.mediaFiles ?? [], report: preview.report };
  }
  const decks = graph.decks.map((deck: Deck) => mergeImportedDeck(deck, options.existingDecks ?? []));
  return { deck: decks[0] ?? null, decks, commitGraph: { ...graph, decks }, mediaFiles: preview.mediaFiles ?? [], report: preview.report };
}
