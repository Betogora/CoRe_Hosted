import { BinaryReader, WireType } from "@bufbuild/protobuf/wire";

export interface AnkiCardRequirementConfig {
  cardOrdinal: number;
  kind: number;
  fieldOrdinals: number[];
}

export interface AnkiNotetypeConfig {
  format: "protobuf-v18";
  rawBase64: string;
  kind: number;
  sortFieldIndex: number;
  css: string;
  targetDeckIdUnused: string | null;
  latexPre: string;
  latexPost: string;
  latexSvg: boolean;
  requirements: AnkiCardRequirementConfig[];
  originalStockKind: number;
  originalId: string | null;
  otherBase64: string | null;
}

export interface AnkiFieldConfig {
  format: "protobuf-v18";
  rawBase64: string;
  sticky: boolean;
  rtl: boolean;
  fontName: string;
  fontSize: number;
  description: string;
  plainText: boolean;
  collapsed: boolean;
  excludeFromSearch: boolean;
  id: string | null;
  tag: number | null;
  preventDeletion: boolean;
  otherBase64: string | null;
}

export interface AnkiTemplateConfig {
  format: "protobuf-v18";
  rawBase64: string;
  questionFormat: string;
  answerFormat: string;
  browserQuestionFormat: string;
  browserAnswerFormat: string;
  targetDeckId: string | null;
  browserFontName: string;
  browserFontSize: number;
  id: string | null;
  otherBase64: string | null;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Anki-Protobuf-Konfiguration ist kein Byte-Array.");
}

function bytesToBase64(bytes: Uint8Array) {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    output += second == null ? "=" : BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    output += third == null ? "=" : BASE64_ALPHABET[third & 0x3f];
  }
  return output;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function int64String(reader: BinaryReader) {
  return String(reader.int64());
}

function skip(reader: BinaryReader, fieldNumber: number, wireType: WireType) {
  reader.skip(wireType, fieldNumber);
}

function decodeCardRequirement(bytes: Uint8Array): AnkiCardRequirementConfig {
  const requirement: AnkiCardRequirementConfig = { cardOrdinal: 0, kind: 0, fieldOrdinals: [] };
  const reader = new BinaryReader(bytes);

  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber === 1 && wireType === WireType.Varint) {
      requirement.cardOrdinal = reader.uint32();
    } else if (fieldNumber === 2 && wireType === WireType.Varint) {
      requirement.kind = reader.uint32();
    } else if (fieldNumber === 3 && wireType === WireType.Varint) {
      requirement.fieldOrdinals.push(reader.uint32());
    } else if (fieldNumber === 3 && wireType === WireType.LengthDelimited) {
      const packed = new BinaryReader(reader.bytes());
      while (packed.pos < packed.len) requirement.fieldOrdinals.push(packed.uint32());
    } else {
      skip(reader, fieldNumber, wireType);
    }
  }

  return requirement;
}

export function decodeAnkiNotetypeConfig(value: unknown): AnkiNotetypeConfig {
  const bytes = asBytes(value);
  const config: AnkiNotetypeConfig = {
    format: "protobuf-v18",
    rawBase64: bytesToBase64(bytes),
    kind: 0,
    sortFieldIndex: 0,
    css: "",
    targetDeckIdUnused: null,
    latexPre: "",
    latexPost: "",
    latexSvg: false,
    requirements: [],
    originalStockKind: 0,
    originalId: null,
    otherBase64: null,
  };
  const reader = new BinaryReader(bytes);

  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber === 1 && wireType === WireType.Varint) config.kind = reader.uint32();
    else if (fieldNumber === 2 && wireType === WireType.Varint) config.sortFieldIndex = reader.uint32();
    else if (fieldNumber === 3 && wireType === WireType.LengthDelimited) config.css = reader.string();
    else if (fieldNumber === 4 && wireType === WireType.Varint) config.targetDeckIdUnused = int64String(reader);
    else if (fieldNumber === 5 && wireType === WireType.LengthDelimited) config.latexPre = reader.string();
    else if (fieldNumber === 6 && wireType === WireType.LengthDelimited) config.latexPost = reader.string();
    else if (fieldNumber === 7 && wireType === WireType.Varint) config.latexSvg = reader.bool();
    else if (fieldNumber === 8 && wireType === WireType.LengthDelimited) config.requirements.push(decodeCardRequirement(reader.bytes()));
    else if (fieldNumber === 9 && wireType === WireType.Varint) config.originalStockKind = reader.uint32();
    else if (fieldNumber === 10 && wireType === WireType.Varint) config.originalId = int64String(reader);
    else if (fieldNumber === 255 && wireType === WireType.LengthDelimited) config.otherBase64 = bytesToBase64(reader.bytes());
    else skip(reader, fieldNumber, wireType);
  }

  return config;
}

export function decodeAnkiFieldConfig(value: unknown): AnkiFieldConfig {
  const bytes = asBytes(value);
  const config: AnkiFieldConfig = {
    format: "protobuf-v18",
    rawBase64: bytesToBase64(bytes),
    sticky: false,
    rtl: false,
    fontName: "",
    fontSize: 0,
    description: "",
    plainText: false,
    collapsed: false,
    excludeFromSearch: false,
    id: null,
    tag: null,
    preventDeletion: false,
    otherBase64: null,
  };
  const reader = new BinaryReader(bytes);

  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber === 1 && wireType === WireType.Varint) config.sticky = reader.bool();
    else if (fieldNumber === 2 && wireType === WireType.Varint) config.rtl = reader.bool();
    else if (fieldNumber === 3 && wireType === WireType.LengthDelimited) config.fontName = reader.string();
    else if (fieldNumber === 4 && wireType === WireType.Varint) config.fontSize = reader.uint32();
    else if (fieldNumber === 5 && wireType === WireType.LengthDelimited) config.description = reader.string();
    else if (fieldNumber === 6 && wireType === WireType.Varint) config.plainText = reader.bool();
    else if (fieldNumber === 7 && wireType === WireType.Varint) config.collapsed = reader.bool();
    else if (fieldNumber === 8 && wireType === WireType.Varint) config.excludeFromSearch = reader.bool();
    else if (fieldNumber === 9 && wireType === WireType.Varint) config.id = int64String(reader);
    else if (fieldNumber === 10 && wireType === WireType.Varint) config.tag = reader.uint32();
    else if (fieldNumber === 11 && wireType === WireType.Varint) config.preventDeletion = reader.bool();
    else if (fieldNumber === 255 && wireType === WireType.LengthDelimited) config.otherBase64 = bytesToBase64(reader.bytes());
    else skip(reader, fieldNumber, wireType);
  }

  return config;
}

export function decodeAnkiTemplateConfig(value: unknown): AnkiTemplateConfig {
  const bytes = asBytes(value);
  const config: AnkiTemplateConfig = {
    format: "protobuf-v18",
    rawBase64: bytesToBase64(bytes),
    questionFormat: "",
    answerFormat: "",
    browserQuestionFormat: "",
    browserAnswerFormat: "",
    targetDeckId: null,
    browserFontName: "",
    browserFontSize: 0,
    id: null,
    otherBase64: null,
  };
  const reader = new BinaryReader(bytes);

  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber === 1 && wireType === WireType.LengthDelimited) config.questionFormat = reader.string();
    else if (fieldNumber === 2 && wireType === WireType.LengthDelimited) config.answerFormat = reader.string();
    else if (fieldNumber === 3 && wireType === WireType.LengthDelimited) config.browserQuestionFormat = reader.string();
    else if (fieldNumber === 4 && wireType === WireType.LengthDelimited) config.browserAnswerFormat = reader.string();
    else if (fieldNumber === 5 && wireType === WireType.Varint) config.targetDeckId = int64String(reader);
    else if (fieldNumber === 6 && wireType === WireType.LengthDelimited) config.browserFontName = reader.string();
    else if (fieldNumber === 7 && wireType === WireType.Varint) config.browserFontSize = reader.uint32();
    else if (fieldNumber === 8 && wireType === WireType.Varint) config.id = int64String(reader);
    else if (fieldNumber === 255 && wireType === WireType.LengthDelimited) config.otherBase64 = bytesToBase64(reader.bytes());
    else skip(reader, fieldNumber, wireType);
  }

  return config;
}

export function decodePackageMetadata(value: unknown) {
  const reader = new BinaryReader(asBytes(value));
  let rawVersion: number | undefined;
  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber === 1 && wireType === WireType.Varint) rawVersion = reader.uint32();
    else skip(reader, fieldNumber, wireType);
  }
  return {
    version: rawVersion == null ? "unknown" : rawVersion === 3 ? "latest" : `legacy-${rawVersion}`,
    ...(rawVersion == null ? {} : { rawVersion }),
  };
}

export function decodeMediaEntries(value: unknown) {
  const reader = new BinaryReader(asBytes(value));
  const entries: Array<{ name: string; size: number; sha1: string; legacyZipFileName: string | null }> = [];

  while (reader.pos < reader.len) {
    const [fieldNumber, wireType] = reader.tag();
    if (fieldNumber !== 1 || wireType !== WireType.LengthDelimited) {
      skip(reader, fieldNumber, wireType);
      continue;
    }

    const entryReader = new BinaryReader(reader.bytes());
    const entry = { name: "", size: 0, sha1: "", legacyZipFileName: null as string | null };
    while (entryReader.pos < entryReader.len) {
      const [entryFieldNumber, entryWireType] = entryReader.tag();
      if (entryFieldNumber === 1 && entryWireType === WireType.LengthDelimited) entry.name = entryReader.string();
      else if (entryFieldNumber === 2 && entryWireType === WireType.Varint) entry.size = entryReader.uint32();
      else if (entryFieldNumber === 3 && entryWireType === WireType.LengthDelimited) entry.sha1 = bytesToHex(entryReader.bytes());
      else if (entryFieldNumber === 255 && entryWireType === WireType.Varint) entry.legacyZipFileName = String(entryReader.uint32());
      else skip(entryReader, entryFieldNumber, entryWireType);
    }
    if (entry.name && entry.sha1) entries.push(entry);
  }

  return entries;
}
