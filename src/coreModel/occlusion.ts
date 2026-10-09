import type { MediaRef, NoteContent, NoteFieldRole, NoteInteraction, OcclusionMask, OcclusionShape } from "../coreTypes.ts";
import { normalizeTags } from "./coreValues.ts";

export type OcclusionInteraction = Extract<NoteInteraction, { kind: "image-occlusion" }>;
export type OcclusionMode = OcclusionInteraction["mode"];
/** Shapes the editor draws; overlay masks only come from imports. */
export type DrawnOcclusionShape = Exclude<OcclusionShape, { kind: "overlay" }>;

export interface OcclusionNoteInput {
  image: MediaRef;
  mode: OcclusionMode;
  masks: OcclusionMask[];
  /** Optional heading above the image. */
  header?: string;
  /** Shown after reveal below the image. */
  extra?: string;
  /** Further fields with a role, e.g. a hint or a source. */
  additionalFields?: Array<{ name?: string; role?: NoteFieldRole; value?: string }>;
  tags?: unknown;
}

/** Image occlusion content with a heading and an extra field; the content parser still guards the stored form. */
export function createOcclusionNoteContent(input: OcclusionNoteInput): NoteContent {
  return {
    schemaVersion: 1,
    fields: [
      { id: "header", name: "Überschrift", role: "prompt", html: input.header?.trim() ? input.header : "" },
      { id: "extra", name: "Zusatz", role: "extra", html: input.extra?.trim() ? input.extra : "" },
      ...(input.additionalFields ?? []).map((field, index) => ({ id: `field-${index + 1}`, name: field.name?.trim() || `Feld ${index + 1}`, role: field.role ?? "extra", html: field.value ?? "" })),
    ],
    interaction: { kind: "image-occlusion", image: input.image, mode: input.mode, masks: input.masks },
    speech: [],
    tags: normalizeTags(input.tags ?? []),
  };
}

/** German messages for the editor; an image and one queried mask are required. */
export function validateOcclusionInput(input: Pick<OcclusionNoteInput, "image" | "masks">): { image?: string; masks?: string } {
  return {
    ...(input.image ? {} : { image: "Bitte ein Bild wählen." }),
    ...(input.masks.some((mask) => mask.ordinal > 0) ? {} : { masks: "Bitte mindestens eine Maske zeichnen, die abgefragt wird." }),
  };
}

function nextOrdinal(masks: OcclusionMask[]): number {
  return Math.max(0, ...masks.map((mask) => mask.ordinal)) + 1;
}

function nextId(masks: OcclusionMask[]): string {
  const ids = new Set(masks.map((mask) => mask.id));
  let index = masks.length + 1;
  while (ids.has(`mask-${index}`)) index += 1;
  return `mask-${index}`;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Keeps a drawn shape inside the image; rectangles, ellipses and labels keep at least a minimal size. */
export function clampOcclusionShape(shape: DrawnOcclusionShape): DrawnOcclusionShape {
  if (shape.kind === "polygon") return { kind: "polygon", points: shape.points.map(([x, y]) => [clamp(x), clamp(y)]) };
  if (shape.kind === "text") return { ...shape, left: clamp(shape.left), top: clamp(shape.top) };
  const width = Math.min(1, Math.max(0.01, shape.width));
  const height = Math.min(1, Math.max(0.01, shape.height));
  return { ...shape, width, height, left: Math.min(1 - width, clamp(shape.left)), top: Math.min(1 - height, clamp(shape.top)) };
}

/** A new mask becomes its own card group. */
export function addOcclusionMask(masks: OcclusionMask[], shape: DrawnOcclusionShape): { masks: OcclusionMask[]; id: string } {
  const id = nextId(masks);
  return { masks: [...masks, { id, ordinal: nextOrdinal(masks), shape: clampOcclusionShape(shape), alwaysOccluded: false }], id };
}

export function updateOcclusionMaskShape(masks: OcclusionMask[], id: string, shape: DrawnOcclusionShape): OcclusionMask[] {
  return masks.map((mask) => mask.id === id ? { ...mask, shape: clampOcclusionShape(shape) } : mask);
}

/** Moves masks by a fraction of the image size; overlay masks stay where they are. */
export function moveOcclusionMasks(masks: OcclusionMask[], ids: readonly string[], dx: number, dy: number): OcclusionMask[] {
  const selected = new Set(ids);
  return masks.map((mask) => {
    if (!selected.has(mask.id) || mask.shape.kind === "overlay") return mask;
    const shape = mask.shape;
    const moved: DrawnOcclusionShape = shape.kind === "polygon"
      ? { kind: "polygon", points: shape.points.map(([x, y]) => [x + dx, y + dy]) }
      : { ...shape, left: shape.left + dx, top: shape.top + dy };
    return { ...mask, shape: clampOcclusionShape(moved) };
  });
}

/**
 * Removes masks. Group numbers stay as they are, so the cards of the remaining groups keep their study state;
 * a group without masks becomes a removed card when the content is saved.
 */
export function removeOcclusionMasks(masks: OcclusionMask[], ids: readonly string[]): OcclusionMask[] {
  const selected = new Set(ids);
  return masks.filter((mask) => !selected.has(mask.id));
}

/** The selected masks are asked together on one card: the lowest group number among them. */
export function groupOcclusionMasks(masks: OcclusionMask[], ids: readonly string[]): OcclusionMask[] {
  const selected = new Set(ids);
  const ordinals = masks.filter((mask) => selected.has(mask.id) && mask.ordinal > 0).map((mask) => mask.ordinal);
  const ordinal = ordinals.length ? Math.min(...ordinals) : nextOrdinal(masks);
  return masks.map((mask) => selected.has(mask.id) ? { ...mask, ordinal, alwaysOccluded: false } : mask);
}

/** Every selected mask after the first in its group gets a card of its own. */
export function ungroupOcclusionMasks(masks: OcclusionMask[], ids: readonly string[]): OcclusionMask[] {
  const selected = new Set(ids);
  const kept = new Set<number>();
  let next = nextOrdinal(masks);
  return masks.map((mask) => {
    if (!selected.has(mask.id) || mask.ordinal === 0) return mask;
    if (!kept.has(mask.ordinal)) {
      kept.add(mask.ordinal);
      return mask;
    }
    return { ...mask, ordinal: next++ };
  });
}

/** An always occluded mask stays hidden on every card and asks nothing itself. */
export function setOcclusionMasksAlwaysOccluded(masks: OcclusionMask[], ids: readonly string[], always: boolean): OcclusionMask[] {
  const selected = new Set(ids);
  let next = nextOrdinal(masks);
  return masks.map((mask) => {
    if (!selected.has(mask.id)) return mask;
    if (always) return { ...mask, ordinal: 0, alwaysOccluded: true };
    return mask.ordinal > 0 ? { ...mask, alwaysOccluded: false } : { ...mask, ordinal: next++, alwaysOccluded: false };
  });
}

/** Queried groups in ascending order with their masks, as the cards they become. */
export function occlusionGroups(masks: OcclusionMask[]): Array<{ ordinal: number; masks: OcclusionMask[] }> {
  const ordinals = [...new Set(masks.map((mask) => mask.ordinal).filter((ordinal) => ordinal > 0))].sort((left, right) => left - right);
  return ordinals.map((ordinal) => ({ ordinal, masks: masks.filter((mask) => mask.ordinal === ordinal) }));
}
