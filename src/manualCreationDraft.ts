import type { AddableFieldRole, ManualContentKind, OcclusionMode } from "./coreModel.ts";
import type { OcclusionMask } from "./coreTypes.ts";
import type { ManualImageAttachment } from "./creationWorkflow.ts";

/** Text lives in `sessionStorage` (survives a reload, not closing the tab), images only in this page's memory. */
export interface ManualDraftSnapshot {
  targetDeckId: string;
  useNewDeck: boolean;
  deckName: string;
  draft: { kind: ManualContentKind; front: string; back: string; answerOptions: string[]; correctOptionIndices: number[]; tags: string[] };
  pinnedFields: { front: boolean; back: boolean };
  additionalFields: Array<{ id: string; name: string; value: string; role: AddableFieldRole }>;
  typeIn: boolean;
  occlusion: { image: string | null; mode: OcclusionMode; masks: OcclusionMask[] } | null;
}

export interface RestoredManualDraft {
  snapshot: ManualDraftSnapshot;
  images: ManualImageAttachment[];
  /** `true` when referenced images did not survive a reload and were removed from the draft. */
  imagesLost: boolean;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const SCHEMA_VERSION = 1;
const KEY_PREFIX = "core.manualDraft.v1.";
// Exhaustive per type, so a new kind, role or mode cannot silently discard stored drafts.
const KINDS: readonly string[] = Object.keys({ basic: 1, "basic-reversed": 1, cloze: 1, "single-choice": 1, "multiple-choice": 1 } satisfies Record<ManualContentKind, 1>);
const ROLES: readonly string[] = Object.keys({ prompt: 1, hint: 1, extra: 1, source: 1 } satisfies Record<AddableFieldRole, 1>);
const MODES: readonly string[] = Object.keys({ "hide-all-guess-one": 1, "hide-one-guess-one": 1 } satisfies Record<OcclusionMode, 1>);
const IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const SHA1_PATTERN = /^[a-f0-9]{40}$/;

let heldImages: { accountId: string; images: ManualImageAttachment[] } | null = null;

function sessionDraftStorage(): DraftStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const isString = (value: unknown): value is string => typeof value === "string";
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isUnit = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function isMask(value: unknown): value is OcclusionMask {
  if (!isRecord(value) || !isString(value.id) || !Number.isSafeInteger(value.ordinal) || Number(value.ordinal) < 0 || typeof value.alwaysOccluded !== "boolean") return false;
  const shape = value.shape;
  if (!isRecord(shape)) return false;
  if (shape.kind === "rect" || shape.kind === "ellipse") return [shape.left, shape.top, shape.width, shape.height, shape.angle].every(isUnit);
  if (shape.kind === "polygon") return Array.isArray(shape.points) && shape.points.every((point) => Array.isArray(point) && point.length === 2 && point.every(isUnit));
  return shape.kind === "text" && isString(shape.text) && [shape.left, shape.top, shape.scale, shape.angle].every(isUnit) && (shape.fontSize === null || isUnit(shape.fontSize));
}

function isSnapshot(value: unknown): value is ManualDraftSnapshot {
  if (!isRecord(value) || !isString(value.targetDeckId) || typeof value.useNewDeck !== "boolean" || !isString(value.deckName) || typeof value.typeIn !== "boolean") return false;
  const { draft, pinnedFields, additionalFields, occlusion } = value;
  return isRecord(draft) && KINDS.includes(String(draft.kind)) && isString(draft.front) && isString(draft.back)
    && isStringList(draft.answerOptions) && draft.answerOptions.length >= 2 && isStringList(draft.tags)
    && Array.isArray(draft.correctOptionIndices) && draft.correctOptionIndices.every((index) => Number.isSafeInteger(index) && index >= 0)
    && isRecord(pinnedFields) && typeof pinnedFields.front === "boolean" && typeof pinnedFields.back === "boolean"
    && Array.isArray(additionalFields) && additionalFields.every((field) => isRecord(field) && isString(field.id) && isString(field.name) && isString(field.value) && ROLES.includes(String(field.role)))
    && (occlusion === null || (isRecord(occlusion) && (occlusion.image === null || isString(occlusion.image)) && MODES.includes(String(occlusion.mode)) && Array.isArray(occlusion.masks) && occlusion.masks.every(isMask)));
}

/** Only SHA-1-named images are the draft's own; other sources stay. */
function withoutLostImages(html: string, available: ReadonlySet<string>) {
  return html.replace(IMAGE_PATTERN, (tag, double, single, bare) => {
    const reference = String(double ?? single ?? bare ?? "").trim().toLowerCase();
    return SHA1_PATTERN.test(reference) && !available.has(reference) ? "" : tag;
  });
}

/** `false` when the tab could not keep the draft, so leaving would lose it. */
export function storeManualDraft(accountId: string, snapshot: ManualDraftSnapshot, images: readonly ManualImageAttachment[], storage = sessionDraftStorage()): boolean {
  if (!accountId || !storage) return false;
  heldImages = { accountId, images: [...images] };
  try {
    storage.setItem(`${KEY_PREFIX}${accountId}`, JSON.stringify({ version: SCHEMA_VERSION, accountId, snapshot }));
    return true;
  } catch {
    // Full storage would otherwise restore an older draft; without access there is nothing to remove.
    try { storage.removeItem(`${KEY_PREFIX}${accountId}`); } catch { /* blocked storage */ }
    return false;
  }
}

export function clearManualDraft(accountId: string, storage = sessionDraftStorage()) {
  if (heldImages?.accountId === accountId) heldImages = null;
  try {
    storage?.removeItem(`${KEY_PREFIX}${accountId}`);
  } catch {
    // Nothing to clear without storage access.
  }
}

/** Also removes drafts of other accounts and unreadable ones. */
export function restoreManualDraft(accountId: string, storage = sessionDraftStorage()): RestoredManualDraft | null {
  if (heldImages && heldImages.accountId !== accountId) heldImages = null;
  if (!storage || !accountId) return null;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(KEY_PREFIX)));
    for (const key of keys) if (key !== `${KEY_PREFIX}${accountId}`) storage.removeItem(key);
    const raw = storage.getItem(`${KEY_PREFIX}${accountId}`);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== SCHEMA_VERSION || stored.accountId !== accountId || !isSnapshot(stored.snapshot)) {
      clearManualDraft(accountId, storage);
      return null;
    }
    const snapshot = stored.snapshot;
    const images = heldImages?.images ?? [];
    const available = new Set(images.map((image) => image.sha1));
    const clean = (html: string) => withoutLostImages(html, available);
    const occlusionLost = Boolean(snapshot.occlusion?.image && !available.has(snapshot.occlusion.image));
    const restored: ManualDraftSnapshot = {
      ...snapshot,
      draft: { ...snapshot.draft, front: clean(snapshot.draft.front), back: clean(snapshot.draft.back) },
      additionalFields: snapshot.additionalFields.map((field) => ({ ...field, value: clean(field.value) })),
      occlusion: snapshot.occlusion && occlusionLost ? { ...snapshot.occlusion, image: null, masks: [] } : snapshot.occlusion,
    };
    return { snapshot: restored, images, imagesLost: JSON.stringify(restored) !== JSON.stringify(snapshot) };
  } catch {
    clearManualDraft(accountId, storage);
    return null;
  }
}
