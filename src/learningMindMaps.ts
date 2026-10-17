import * as v from "valibot";
import { SUMMARY_NOTES_HEADING, summaryPlainText, type LearningContentAccount, type LearningSummary } from "./learningSummaries.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadMindMapImage, listLearningDocuments, removeMindMapImages, uploadMindMapImage, writeLearningDocument } from "./cloudLearningDocuments.ts";
import { sanitizeCardHtml } from "./htmlSafety.ts";
import { compressImage } from "./imageDownscale.ts";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const coordinate = v.pipe(v.number(), v.finite());
const point = v.strictObject({ x: coordinate, y: coordinate });
const color = v.union([v.picklist(["default", "blue", "purple", "yellow", "red"]), v.pipe(v.string(), v.regex(/^#[a-f0-9]{6}$/i))]);
const appearance = { color: v.optional(color), fillColor: v.optional(color), opacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), strokeWidth: v.optional(v.picklist([2, 4, 8])) };
const members = v.pipe(v.array(id), v.minLength(1), v.maxLength(2000));
const bracketSchema = v.strictObject({ id, nodeIds: members, nodeId: id, side: v.picklist(["left", "right"]) });
const boundarySchema = v.strictObject({ id, nodeIds: members, label: v.pipe(v.string(), v.maxLength(120)), shape: v.picklist(["rectangle", "rounded", "ellipse"]), ...appearance });
const sourceSchema = v.strictObject({ summaryId: id, title: v.string(), text: v.pipe(v.string(), v.maxLength(100_000)), updatedAt: v.string(), signature: v.optional(v.string()) });
/** Cards reference images by the SHA-1 of their stored bytes; the bytes live in the `images` store. */
const imageSchema = v.strictObject({ id: v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/)), name: v.pipe(v.string(), v.minLength(1), v.maxLength(240)) });
const nodeSchema = v.strictObject({
  id, kind: v.picklist(["keyword", "text", "freeText"]), label: v.pipe(v.string(), v.maxLength(120)),
  text: v.pipe(v.string(), v.maxLength(100_000)), x: coordinate, y: coordinate,
  sourceText: v.optional(v.pipe(v.string(), v.maxLength(100_000))),
  sourceId: v.optional(id), color: v.optional(color),
  parentId: v.optional(id), autoPosition: v.optional(v.boolean()), side: v.optional(v.picklist(["left", "right"])), html: v.optional(v.pipe(v.string(), v.maxLength(100_000))),
  images: v.optional(v.pipe(v.array(imageSchema), v.maxLength(4))),
});
const mapSchema = v.strictObject({
  version: v.literal(1), id, deckId: id, title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  nodes: v.pipe(v.array(nodeSchema), v.maxLength(2000)),
  edges: v.pipe(v.array(v.strictObject({ from: id, to: id })), v.maxLength(10_000)),
  strokes: v.pipe(v.array(v.strictObject({ id, points: v.pipe(v.array(point), v.minLength(1), v.maxLength(20_000)), color: v.optional(color), width: v.optional(v.picklist([2, 4, 8])) })), v.maxLength(2000)),
  summaries: v.optional(v.pipe(v.array(bracketSchema), v.maxLength(500)), []),
  boundaries: v.optional(v.pipe(v.array(boundarySchema), v.maxLength(500)), []),
  connectionColor: v.optional(v.picklist(["gray", "node"]), "node"),
  source: v.optional(sourceSchema), sources: v.optional(v.record(id, sourceSchema)), infinity: v.optional(v.literal(true)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()), updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type LearningMindMap = v.InferOutput<typeof mapSchema>;
export type MindMapNode = v.InferOutput<typeof nodeSchema>;
export type MindMapImage = v.InferOutput<typeof imageSchema>;
export type MindMapPoint = v.InferOutput<typeof point>;
export type MindMapColor = v.InferOutput<typeof color>;
export type MindMapSummary = v.InferOutput<typeof bracketSchema>;
export type MindMapBoundary = v.InferOutput<typeof boundarySchema>;
export type MindMapElementKind = "node" | "summary" | "boundary";
export type MindMapRect = MindMapPoint & { width: number; height: number };
export const mindMapColors: ReadonlyArray<{ value: MindMapColor; label: string }> = [
  { value: "default", label: "Standard" }, { value: "blue", label: "Blau" },
  { value: "purple", label: "Violett" }, { value: "yellow", label: "Gelb" }, { value: "red", label: "Koralle" },
];

export const MIND_MAP_LIMITS = { nodes: 2_000, edges: 10_000, strokes: 2_000, summaries: 500, boundaries: 500, images: 10 } as const;
const LIMIT_LABELS: Record<keyof typeof MIND_MAP_LIMITS, string> = { nodes: "Karten und freie Texte", edges: "Querverbindungen", strokes: "Linien", summaries: "Zusammenfassungsklammern", boundaries: "Umrandungen", images: "Bilder" };

/** Distinct images of a map; a copied card shares its images with the original. */
export function mindMapImageIds(map: Pick<LearningMindMap, "nodes">): Set<string> {
  return new Set(map.nodes.flatMap((node) => node.images?.map((image) => image.id) ?? []));
}

/** Names the first exceeded size limit with the current count, or null when the map fits. */
export function mindMapLimitError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const nodes = (value as { nodes?: unknown }).nodes;
  const imageIds = [...new Set(Array.isArray(nodes) ? nodes.flatMap((node) => Array.isArray((node as { images?: unknown } | null)?.images) ? (node as { images: Array<{ id?: unknown } | null> }).images.map((image) => image?.id) : []) : [])];
  for (const key of Object.keys(MIND_MAP_LIMITS) as Array<keyof typeof MIND_MAP_LIMITS>) {
    const items = key === "images" ? imageIds : (value as Record<string, unknown>)[key], count = Array.isArray(items) ? items.length : 0;
    if (count > MIND_MAP_LIMITS[key]) return `Eine Mindmap umfasst höchstens ${MIND_MAP_LIMITS[key].toLocaleString("de-DE")} ${LIMIT_LABELS[key]} (jetzt ${count.toLocaleString("de-DE")}).`;
  }
  return null;
}

export function readLearningMindMap(value: unknown): LearningMindMap {
  const limit = mindMapLimitError(value);
  if (limit) throw new Error(limit);
  const parsed = v.safeParse(mapSchema, value);
  if (!parsed.success || !parsed.output.title.trim() || Date.parse(parsed.output.updatedAt) < Date.parse(parsed.output.createdAt)) {
    throw new Error("Die gespeicherte Mindmap ist ungültig.");
  }
  const map = parsed.output, nodes = new Set(map.nodes.map((node) => node.id));
  const edges = new Set(map.edges.map((edge) => [edge.from, edge.to].sort().join("\u0000")));
  const allIds = [...map.nodes, ...map.summaries, ...map.boundaries, ...map.strokes].map((item) => item.id);
  const validMembers = (ids: string[]) => new Set(ids).size === ids.length && ids.every((key) => nodes.has(key));
  if (new Set(allIds).size !== allIds.length || edges.size !== map.edges.length || map.nodes.some((node) => (node.sourceId !== undefined || node.sourceText !== undefined) && !mindMapNodeSource(map, node) || new Set(node.images?.map((image) => image.id)).size !== (node.images?.length ?? 0) || node.parentId && !nodes.has(node.parentId)) || map.edges.some((edge) => edge.from === edge.to || !nodes.has(edge.from) || !nodes.has(edge.to)) || map.boundaries.some((item) => !validMembers(item.nodeIds)) || map.summaries.some((item) => !nodes.has(item.nodeId) || item.nodeIds.includes(item.nodeId) || !validMembers(item.nodeIds) || new Set(item.nodeIds.map((key) => map.nodes.find((node) => node.id === key)!.parentId)).size !== 1)) {
    throw new Error("Die Mindmap enthält ungültige Verbindungen oder doppelte Elemente.");
  }
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  if (map.nodes.some((node) => node.kind === "freeText" && node.parentId || node.parentId && byId.get(node.parentId)?.kind === "freeText") || map.summaries.some((item) => [item.nodeId, ...item.nodeIds].some((key) => byId.get(key)?.kind === "freeText"))) throw new Error("Freier Flächentext gehört nicht zur Kartenhierarchie oder zu einer Zusammenfassungsklammer.");
  for (const node of map.nodes) {
    const seen = new Set<string>(); let current: MindMapNode | undefined = node;
    while (current) { if (seen.has(current.id)) throw new Error("Die Mindmap enthält eine zyklische Hierarchie."); seen.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; }
  }
  if (map.summaries.some((item) => descendantIds(map, item.nodeIds).includes(item.nodeId))) throw new Error("Ein Zusammenfassungsknoten darf nicht Teil seines eigenen Klammerbereichs sein.");
  return { ...map, title: map.title.trim(), nodes: map.nodes.map((node) => node.html === undefined ? node : { ...node, ...mindMapText(node.html) }) };
}

export function createLearningMindMap(deckId: string, title: string): LearningMindMap {
  const now = new Date().toISOString();
  return readLearningMindMap({ version: 1, id: `mindmap_${crypto.randomUUID()}`, deckId, title, nodes: [], edges: [], strokes: [], createdAt: now, updatedAt: now });
}

export function createMindMapNode(kind: MindMapNode["kind"], position: MindMapPoint): MindMapNode {
  return { id: `node_${crypto.randomUUID()}`, kind, label: kind === "freeText" ? "Freier Text" : kind === "keyword" ? "Neues Stichwort" : "Neue Notiz", text: "", ...position };
}

export function toggleMindMapEdge(map: LearningMindMap, from: string, to: string): LearningMindMap {
  if (from === to || !map.nodes.some((node) => node.id === from) || !map.nodes.some((node) => node.id === to)) return map;
  const matches = (edge: LearningMindMap["edges"][number]) => edge.from === from && edge.to === to || edge.from === to && edge.to === from;
  return { ...map, edges: map.edges.some(matches) ? map.edges.filter((edge) => !matches(edge)) : [...map.edges, { from, to }] };
}

/** Loose cards become ordinary branches; already attached cards keep cross-links. */
export function connectMindMapElements(map: LearningMindMap, from: string, to: string): LearningMindMap {
  const a = map.nodes.find((node) => node.id === from), b = map.nodes.find((node) => node.id === to);
  if (!a || !b || a.id === b.id || a.kind === "freeText" || b.kind === "freeText") return toggleMindMapEdge(map, from, to);
  if (a.parentId === b.id) return reparentMindMapNode(map, a.id, undefined);
  if (b.parentId === a.id) return reparentMindMapNode(map, b.id, undefined);
  const belongsToTree = (node: MindMapNode) => Boolean(node.parentId || map.nodes.some((child) => child.parentId === node.id));
  if (a.parentId && b.parentId) return toggleMindMapEdge(map, from, to);
  const child = !a.parentId && (b.parentId || !belongsToTree(a) && belongsToTree(b)) ? a : b, parent = child === a ? b : a;
  if (child.parentId) return toggleMindMapEdge(map, from, to);
  const descendants = new Set(descendantIds(map, [child.id]));
  if (descendants.has(parent.id)) throw new Error("Ein Ast kann nicht mit seinen eigenen Unterknoten verknüpft werden.");
  const withoutBranch = { ...map, nodes: map.nodes.filter((node) => !descendants.has(node.id)) };
  const placement = addMindMapRelativeNode(withoutBranch, parent.id, "child", child.kind).node;
  const delta = { x: placement.x - child.x, y: placement.y - child.y };
  const attached = reparentMindMapNode(map, child.id, parent.id);
  return readLearningMindMap({ ...attached, nodes: attached.nodes.map((node) => descendants.has(node.id)
    ? { ...node, x: node.x + delta.x, y: node.y + delta.y, side: placement.side, ...(node.id === child.id ? { autoPosition: true, color: undefined } : {}) }
    : node), edges: attached.edges.filter((edge) => !(edge.from === from && edge.to === to || edge.from === to && edge.to === from)) });
}

export function removeMindMapNode(map: LearningMindMap, nodeId: string): LearningMindMap {
  const removed = map.nodes.find((node) => node.id === nodeId);
  const nodes = map.nodes.filter((node) => node.id !== nodeId).map((node) => node.parentId === nodeId ? { ...node, parentId: removed?.parentId } : node), usedSources = new Set(nodes.map((node) => node.sourceId));
  return { ...map, nodes, edges: map.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    boundaries: map.boundaries.map((item) => ({ ...item, nodeIds: item.nodeIds.filter((key) => key !== nodeId) })).filter((item) => item.nodeIds.length),
    summaries: map.summaries.filter((item) => item.nodeId !== nodeId).map((item) => ({ ...item, nodeIds: item.nodeIds.filter((key) => key !== nodeId) })).filter((item) => item.nodeIds.length),
    ...(map.sources ? { sources: Object.fromEntries(Object.entries(map.sources).filter(([key]) => usedSources.has(key))) } : {}),
  };
}

export function mindMapNodeSource(map: LearningMindMap, node: MindMapNode) {
  if (!node.sourceId) return map.source;
  return map.sources && Object.hasOwn(map.sources, node.sourceId) ? map.sources[node.sourceId] : undefined;
}

/** Shrinks, hashes and stores picked images before a card references them, and uploads them when online; unreferenced ones are released later. */
export async function storeMindMapImages(account: LearningContentAccount, files: File[]): Promise<MindMapImage[]> {
  if (files.length > 4) throw new Error("Pro Kasten sind bis zu vier Bilder möglich.");
  const images = await Promise.all(files.map(async (file) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Bitte wähle ein PNG-, JPEG-, WebP- oder GIF-Bild.");
    if (file.size > 20_000_000) throw new Error("Ein Bild darf höchstens 20 MB groß sein.");
    const blob = await compressImage(file, 1_600);
    if (blob.size > 2_000_000) throw new Error("Ein Bild darf auch verkleinert höchstens 2 MB groß sein.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", await blob.arrayBuffer()));
    return { id: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""), name: file.name.slice(0, 240) || "Bild", blob };
  }));
  const createdAt = Date.now(), stored = images.map((image) => ({ id: image.id, blob: image.blob, createdAt, uploaded: false }));
  await writeMindMapStores(account.userId, { images: stored }, "Das Bild konnte nicht gespeichert werden.");
  if (account.cloud) await uploadImages({ ...account, cloud: account.cloud }, stored).catch(() => undefined);
  return images.map((image) => ({ id: image.id, name: image.name }));
}

/** Image bytes by id from this browser, otherwise from the cloud; ids without bytes are missing from the result. */
export async function loadMindMapImages(account: LearningContentAccount, ids: string[]): Promise<Map<string, Blob>> {
  const { userId, cloud } = account, result = new Map((await readImages(userId, ids)).map((image) => [image.id, image.blob]));
  const missing = ids.filter((key) => !result.has(key));
  if (cloud && missing.length) {
    const downloaded = (await Promise.all(missing.map(async (key) => ({ id: key, blob: await downloadMindMapImage(cloud, userId, key) }))))
      .flatMap((image) => image.blob ? [{ id: image.id, blob: image.blob, createdAt: Date.now(), uploaded: true }] : []);
    await writeMindMapStores(userId, { images: downloaded }, "Die Bilder konnten nicht gespeichert werden.");
    for (const image of downloaded) result.set(image.id, image.blob);
  }
  return result;
}

/** Place another graph beside existing content; nodes reference one snapshot per source. */
/** `at` places the incoming graph with its top-left corner there instead of right of all content. */
export function appendMindMap(map: LearningMindMap, addition: LearningMindMap, at?: MindMapPoint): LearningMindMap {
  if (map.deckId !== addition.deckId) throw new Error("Die Mindmap gehört zu einem anderen Stapel.");
  const occupied = [...map.nodes.map((node) => node.x + 220), ...map.strokes.flatMap((stroke) => stroke.points.map((p) => p.x)), ...map.boundaries.map((item) => { const rect = mindMapBoundaryRect(map, item); return rect.x + rect.width; })];
  const incoming = [...addition.nodes.map((node) => node.x), ...addition.strokes.flatMap((stroke) => stroke.points.map((p) => p.x)), ...addition.boundaries.map((item) => mindMapBoundaryRect(addition, item).x)];
  const offset = at && addition.nodes.length ? at.x - Math.min(...addition.nodes.map((node) => node.x))
    : occupied.length && incoming.length ? occupied.reduce((a, b) => Math.max(a, b)) + 180 - incoming.reduce((a, b) => Math.min(a, b)) : 0;
  const lift = at && addition.nodes.length ? at.y - Math.min(...addition.nodes.map((node) => node.y)) : 0;
  const ids = new Map(addition.nodes.map((node) => [node.id, `node_${crypto.randomUUID()}`]));
  const sourceIds = new Map(Object.keys(addition.sources ?? {}).map((key) => [key, `source_${crypto.randomUUID()}`]));
  const legacySourceId = addition.source ? `source_${crypto.randomUUID()}` : undefined;
  const sources = { ...map.sources, ...Object.fromEntries(Object.entries(addition.sources ?? {}).map(([key, value]) => [sourceIds.get(key)!, value])), ...(legacySourceId ? { [legacySourceId]: addition.source! } : {}) };
  return readLearningMindMap({ ...map,
    ...(Object.keys(sources).length ? { sources } : {}),
    nodes: [...map.nodes, ...addition.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, x: node.x + offset, y: node.y + lift, ...(node.parentId ? { parentId: ids.get(node.parentId)! } : {}), ...(node.sourceId || legacySourceId ? { sourceId: node.sourceId ? sourceIds.get(node.sourceId)! : legacySourceId } : {}) }))],
    edges: [...map.edges, ...addition.edges.map((edge) => ({ from: ids.get(edge.from)!, to: ids.get(edge.to)! }))],
    boundaries: [...map.boundaries, ...addition.boundaries.map((item) => ({ ...item, id: `boundary_${crypto.randomUUID()}`, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    summaries: [...map.summaries, ...addition.summaries.map((item) => ({ ...item, id: `summary_${crypto.randomUUID()}`, nodeId: ids.get(item.nodeId)!, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    strokes: [...map.strokes, ...addition.strokes.map((stroke) => ({ ...stroke, id: `stroke_${crypto.randomUUID()}`, points: stroke.points.map((p) => ({ x: p.x + offset, y: p.y + lift })) }))],
  });
}

function mindMapText(html: string) {
  const safe = sanitizeCardHtml(html).replace(/<(?:img|audio|video|source|track)\b[^>]*>/gi, "");
  return { html: safe, text: summaryPlainText(safe.replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")) };
}

export function editMindMapNode(map: LearningMindMap, nodeId: string, patch: Partial<MindMapNode>): LearningMindMap {
  const before = map.nodes.find((node) => node.id === nodeId);
  let next = { ...map, nodes: map.nodes.map((node) => node.id === nodeId ? { ...node, ...patch, ...(patch.x !== undefined || patch.y !== undefined ? { autoPosition: false } : {}), ...(patch.html !== undefined ? mindMapText(patch.html) : {}) } : node) };
  const after = next.nodes.find((node) => node.id === nodeId);
  if (!before || !after || mindMapNodeRect(before).height === mindMapNodeRect(after).height) return next;
  const fixed = next.nodes.filter((node) => !node.autoPosition || node.id === nodeId);
  const automatic = next.nodes.filter((node) => node.autoPosition && node.id !== nodeId).sort((a, b) => a.y - b.y);
  for (const node of automatic) {
    let placed = node;
    for (let attempt = 0; attempt < next.nodes.length; attempt++) {
      const r = mindMapNodeRect(placed), overlaps = fixed.filter((item) => { const b = mindMapNodeRect(item); return r.x < b.x + b.width + 16 && r.x + r.width + 16 > b.x && r.y < b.y + b.height + 16 && r.y + r.height + 16 > b.y; });
      if (!overlaps.length) break;
      placed = { ...placed, y: Math.max(...overlaps.map((item) => item.y + mindMapNodeRect(item).height)) + 32 };
    }
    if (placed !== node) next = { ...next, nodes: next.nodes.map((item) => item.id === placed.id ? placed : item) };
    fixed.push(placed);
  }
  return next;
}

export function mindMapNodeRect(node: MindMapNode, expanded = false): MindMapRect {
  if (node.kind === "freeText") return { x: node.x, y: node.y, width: 260, height: expanded ? 220 : Math.min(300, Math.max(64, (Math.ceil(node.text.length / 28) + node.text.split("\n").length - 1) * 24 + 24)) };
  return { x: node.x, y: node.y, width: 220, height: expanded ? 300 + (node.images?.length ? 136 : 0) : node.kind === "text" ? 160 + (node.images?.length ? 136 : 0) : node.text.trim() || node.sourceText?.trim() || node.images?.length ? 120 : 88 };
}

export function mindMapBounds(rects: MindMapRect[], padding = 24): MindMapRect {
  if (!rects.length) return { x: 0, y: 0, width: 220, height: 140 };
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const rect of rects) { left = Math.min(left, rect.x); top = Math.min(top, rect.y); right = Math.max(right, rect.x + rect.width); bottom = Math.max(bottom, rect.y + rect.height); }
  return { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
}

export function mindMapMembersRect(map: LearningMindMap, ids: readonly string[], padding = 24) {
  const members = new Set(ids);
  return mindMapBounds(map.nodes.filter((node) => members.has(node.id)).map((node) => mindMapNodeRect(node)), padding);
}

export function mindMapBoundaryRect(map: LearningMindMap, boundary: MindMapBoundary): MindMapRect {
  const rect = mindMapMembersRect(map, boundary.nodeIds);
  if (boundary.shape !== "ellipse") return rect;
  return { x: rect.x - rect.width * 0.25, y: rect.y - rect.height * 0.25, width: rect.width * 1.5, height: rect.height * 1.5 };
}

let colorCache: { map: LearningMindMap; byId: Map<string, MindMapNode>; siblingIndex: Map<string, number>; summaryNodeIds: Set<string> } | null = null;
function colorContext(map: LearningMindMap) {
  if (colorCache?.map !== map) {
    const siblingIndex = new Map<string, number>(), counts = new Map<string, number>();
    for (const item of map.nodes) if (item.parentId) { const index = counts.get(item.parentId) ?? 0; siblingIndex.set(item.id, index); counts.set(item.parentId, index + 1); }
    colorCache = { map, byId: new Map(map.nodes.map((item) => [item.id, item])), siblingIndex, summaryNodeIds: new Set(map.summaries.map((item) => item.nodeId)) };
  }
  return colorCache;
}

export function mindMapNodeColor(map: LearningMindMap, node: MindMapNode): { color: MindMapColor; depth: number; strength: number } {
  const { byId, siblingIndex, summaryNodeIds } = colorContext(map);
  if (summaryNodeIds.has(node.id)) return { color: "default", depth: 0, strength: 0 };
  let current = node, depth = 0, chosen: MindMapColor | undefined = node.color;
  while (current.parentId) {
    depth++;
    const parent = byId.get(current.parentId);
    if (!parent) break;
    if (!chosen && current.color) chosen = current.color;
    if (!chosen && !parent.parentId) chosen = mindMapColors[1 + (siblingIndex.get(current.id) ?? -1) % (mindMapColors.length - 1)].value;
    current = parent;
  }
  return { color: chosen ?? "default", depth, strength: Math.min(72, 18 + Math.max(0, depth - 1) * 14) };
}

export function mindMapNodeDirection(node: MindMapNode, parent?: MindMapNode) {
  return {
    side: parent ? (node.x >= parent.x ? "right" : "left") : node.side ?? "right",
    vertical: parent && node.y + mindMapNodeRect(node).height / 2 < parent.y + mindMapNodeRect(parent).height / 2 ? "above" : "below",
  } as const;
}

/** `content` (label, texts) is applied before placement so the card height is already final. */
export function addMindMapRelativeNode(map: LearningMindMap, anchorId: string | null, relation: "root" | "sibling" | "child", kind: MindMapNode["kind"] = "keyword", position: MindMapPoint = { x: 0, y: 0 }, content: Pick<Partial<MindMapNode>, "label" | "text" | "sourceText"> = {}): { map: LearningMindMap; node: MindMapNode } {
  const anchor = map.nodes.find((node) => node.id === anchorId);
  if (relation !== "root" && (anchor?.kind === "freeText" || kind === "freeText")) throw new Error("Freier Flächentext hat keine Unterknoten oder Geschwisterkarten.");
  const parent = relation === "child" ? anchor : relation === "sibling" && anchor?.parentId ? map.nodes.find((node) => node.id === anchor.parentId) : undefined;
  const siblings = map.nodes.filter((node) => node.parentId === parent?.id && node.kind !== "freeText");
  const mainBranch = parent && !parent.parentId && !map.summaries.some((item) => item.nodeId === parent.id);
  const parentDirection = parent ? mindMapNodeDirection(parent, map.nodes.find((node) => node.id === parent.parentId)) : undefined;
  const anchorDirection = anchor ? mindMapNodeDirection(anchor, parent) : undefined;
  const rightCount = parent ? siblings.filter((node) => mindMapNodeDirection(node, parent).side === "right").length : 0;
  const side = mainBranch ? (rightCount <= siblings.length - rightCount ? "right" : "left") : relation === "sibling" ? anchorDirection?.side ?? "right" : parentDirection?.side ?? "right";
  const sameSide = siblings.filter((node) => mindMapNodeDirection(node, parent).side === side);
  const aboveCount = sameSide.filter((node) => mindMapNodeDirection(node, parent).vertical === "above").length;
  const vertical = mainBranch ? (aboveCount < sameSide.length - aboveCount || aboveCount === sameSide.length - aboveCount && side === "right" ? "above" : "below") : relation === "sibling" ? anchorDirection?.vertical ?? "below" : parentDirection?.vertical ?? "below";
  const node: MindMapNode = { ...createMindMapNode(kind, position), ...content,
    ...((parent || relation === "sibling") ? { autoPosition: true } : {}),
    ...(parent ? { parentId: parent.id, side } : {}),
  };
  if (parent) {
    node.x = parent.x + (side === "right" ? 300 : -300);
    const outward = sameSide.filter((item) => mindMapNodeDirection(item, parent).vertical === vertical);
    node.y = mainBranch || outward.length
      ? vertical === "above" ? Math.min(parent.y - 32, ...outward.map((item) => item.y - 32)) - mindMapNodeRect(node).height
        : Math.max(parent.y + mindMapNodeRect(parent).height + 32, ...outward.map((item) => item.y + mindMapNodeRect(item).height + 32))
      : parent.y;
  } else if (relation === "sibling" && anchor) { node.x = anchor.x; node.y = anchor.y + mindMapNodeRect(anchor).height + 32; }
  for (let attempt = 0; attempt < 2000 && map.nodes.some((item) => { const r = mindMapNodeRect(item), n = mindMapNodeRect(node); return n.x < r.x + r.width + 16 && n.x + n.width + 16 > r.x && n.y < r.y + r.height + 16 && n.y + n.height + 16 > r.y; }); attempt++) node.y += (vertical === "above" ? -1 : 1) * (mindMapNodeRect(node).height + 32);
  return { map: { ...map, nodes: [...map.nodes, node] }, node };
}

export function reparentMindMapNode(map: LearningMindMap, nodeId: string, parentId: string | undefined): LearningMindMap {
  if (!map.nodes.some((node) => node.id === nodeId) || parentId !== undefined && !map.nodes.some((node) => node.id === parentId)) throw new Error("Der gewählte Knoten ist nicht verfügbar.");
  const next = editMindMapNode(map, nodeId, { parentId });
  next.summaries = next.summaries.map((item) => ({ ...item, nodeIds: item.nodeIds.filter((id) => id !== nodeId || item.nodeIds.every((key) => next.nodes.find((n) => n.id === key)?.parentId === parentId)) })).filter((item) => item.nodeIds.length);
  return readLearningMindMap(next);
}

function descendantIds(map: LearningMindMap, nodeIds: string[]): string[] {
  const children = new Map<string, string[]>();
  for (const node of map.nodes) if (node.parentId) { const siblings = children.get(node.parentId) ?? []; siblings.push(node.id); children.set(node.parentId, siblings); }
  const ids = new Set(nodeIds), queue = [...ids];
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) ?? []) if (!ids.has(child)) { ids.add(child); queue.push(child); }
  return [...ids];
}

export function mindMapSummaryRect(map: LearningMindMap, summary: Pick<MindMapSummary, "nodeIds">) {
  return mindMapMembersRect(map, descendantIds(map, summary.nodeIds), 12);
}

export function createMindMapSummary(map: LearningMindMap, nodeIds: string[]): { map: LearningMindMap; id: string } {
  const nodes = map.nodes.filter((node) => nodeIds.includes(node.id));
  if (nodes.length < 2 || nodes.some((node) => node.kind === "freeText") || new Set(nodes.map((node) => node.parentId)).size !== 1) throw new Error("Wähle mindestens zwei Karten auf derselben Ebene eines Astes. Nutze die Mehrfachauswahl oder Umschalt + Klick.");
  const sorted = map.nodes.filter((node) => node.kind !== "freeText" && node.parentId === nodes[0].parentId).sort((a, b) => a.y - b.y || a.x - b.x);
  const indices = nodes.map((node) => sorted.findIndex((item) => item.id === node.id)), ids = sorted.slice(Math.min(...indices), Math.max(...indices) + 1).map((node) => node.id);
  const rect = mindMapSummaryRect(map, { nodeIds: ids }), side = nodes[0].side ?? "right";
  const node = { ...createMindMapNode("text", { x: side === "right" ? rect.x + rect.width + 80 : rect.x - 300, y: rect.y + rect.height / 2 - 80 }), label: "Zusammenfassung", color: "default" };
  const summary = { id: `summary_${crypto.randomUUID()}`, nodeIds: ids, nodeId: node.id, side };
  return { map: { ...map, nodes: [...map.nodes, node], summaries: [...map.summaries, summary] }, id: summary.id };
}

export function resizeMindMapSummary(map: LearningMindMap, id: string, end: "start" | "end", y: number): LearningMindMap {
  const summary = map.summaries.find((item) => item.id === id);
  if (!summary) return map;
  const first = map.nodes.find((node) => node.id === summary.nodeIds[0])!;
  const siblings = map.nodes.filter((node) => node.kind !== "freeText" && node.id !== summary.nodeId && node.parentId === first.parentId).sort((a, b) => a.y - b.y || a.x - b.x);
  const edge = (node: MindMapNode) => { const rect = mindMapMembersRect(map, descendantIds(map, [node.id]), 0); return end === "start" ? rect.y : rect.y + rect.height; };
  const closest = siblings.reduce((a, b) => Math.abs(edge(a) - y) <= Math.abs(edge(b) - y) ? a : b);
  const anchor = end === "start" ? summary.nodeIds.at(-1)! : summary.nodeIds[0];
  const indices = [siblings.findIndex((node) => node.id === anchor), siblings.findIndex((node) => node.id === closest.id)];
  const nodeIds = siblings.slice(Math.min(...indices), Math.max(...indices) + 1).map((node) => node.id);
  return { ...map, summaries: map.summaries.map((item) => item.id === id ? { ...item, nodeIds } : item) };
}

/** Keyboard alternative to the bracket handles: grows (1) or shrinks (−1) the range by one sibling at its lower end. */
export function stepMindMapSummary(map: LearningMindMap, id: string, step: 1 | -1): LearningMindMap {
  const summary = map.summaries.find((item) => item.id === id), first = summary && map.nodes.find((node) => node.id === summary.nodeIds[0]);
  if (!summary || !first) return map;
  const siblings = map.nodes.filter((node) => node.kind !== "freeText" && node.id !== summary.nodeId && node.parentId === first.parentId).sort((a, b) => a.y - b.y || a.x - b.x);
  const start = siblings.findIndex((node) => node.id === summary.nodeIds[0]), end = siblings.findIndex((node) => node.id === summary.nodeIds.at(-1));
  const last = Math.min(siblings.length - 1, Math.max(start, end + step));
  return { ...map, summaries: map.summaries.map((item) => item.id === id ? { ...item, nodeIds: siblings.slice(start, last + 1).map((node) => node.id) } : item) };
}

export function createMindMapBoundary(map: LearningMindMap, nodeIds: string[]): { map: LearningMindMap; id: string } {
  const ids = [...new Set(nodeIds)].filter((key) => map.nodes.some((node) => node.id === key));
  if (!ids.length) throw new Error("Wähle zuerst die Knoten für die Umrandung.");
  const boundary: MindMapBoundary = { id: `boundary_${crypto.randomUUID()}`, nodeIds: ids, label: "", shape: "rounded", color: "blue", fillColor: "blue", opacity: 0.08, strokeWidth: 2 };
  return { map: { ...map, boundaries: [...map.boundaries, boundary] }, id: boundary.id };
}

export function moveMindMapElement(map: LearningMindMap, kind: MindMapElementKind, id: string, delta: MindMapPoint): LearningMindMap {
  const ids = new Set(kind === "node" ? [id] : kind === "boundary" ? map.boundaries.find((item) => item.id === id)?.nodeIds : [map.summaries.find((item) => item.id === id)?.nodeId]);
  return { ...map, nodes: map.nodes.map((node) => ids.has(node.id) ? { ...node, x: node.x + delta.x, y: node.y + delta.y, autoPosition: false } : node) };
}

export function removeMindMapElement(map: LearningMindMap, kind: MindMapElementKind, id: string): LearningMindMap {
  if (kind === "node") return removeMindMapNode(map, id);
  if (kind === "boundary") return { ...map, boundaries: map.boundaries.filter((item) => item.id !== id) };
  const summary = map.summaries.find((item) => item.id === id);
  return summary ? removeMindMapNode(map, summary.nodeId) : map;
}

const CARD_TITLE_CHARS = 60;
type SummaryTreeItem = { label: string; sourceText?: string; paragraphs: string[]; children: SummaryTreeItem[] };

/** Keyboard navigation: ←/→ move towards the parent or the nearest child on that side, ↑/↓ step through the siblings by position. */
export function mindMapNeighbor(map: LearningMindMap, nodeId: string, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): string | undefined {
  const node = map.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  if (key === "ArrowUp" || key === "ArrowDown") {
    const siblings = map.nodes.filter((item) => item.parentId === node.parentId).sort((a, b) => a.y - b.y || a.x - b.x);
    return siblings[siblings.indexOf(node) + (key === "ArrowUp" ? -1 : 1)]?.id;
  }
  const right = key === "ArrowRight", parent = node.parentId ? map.nodes.find((item) => item.id === node.parentId) : undefined;
  if (parent && (node.x >= parent.x) !== right) return parent.id;
  const children = map.nodes.filter((item) => item.parentId === node.id && (item.x >= node.x) === right);
  return children.sort((a, b) => Math.abs(a.y - node.y) - Math.abs(b.y - node.y))[0]?.id;
}

export interface MindMapClipboard { nodes: MindMapNode[]; edges: LearningMindMap["edges"]; boundaries: MindMapBoundary[]; summaries: MindMapSummary[] }

/** Copies the cards with their subtrees plus links, frames and brackets that lie completely inside. */
export function copyMindMapNodes(map: LearningMindMap, nodeIds: string[]): MindMapClipboard {
  const ids = new Set(descendantIds(map, nodeIds));
  return {
    nodes: map.nodes.filter((node) => ids.has(node.id)),
    edges: map.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    boundaries: map.boundaries.filter((item) => item.nodeIds.every((key) => ids.has(key))),
    summaries: map.summaries.filter((item) => ids.has(item.nodeId) && item.nodeIds.every((key) => ids.has(key))),
  };
}

/** An empty surface with the same title and settings; generated-source snapshots go with their cards. */
export function clearMindMap(map: LearningMindMap): LearningMindMap {
  const { source: _source, sources: _sources, ...rest } = map;
  return { ...rest, nodes: [], edges: [], strokes: [], summaries: [], boundaries: [] };
}

/** Inserts a copy with fresh ids, offset by `offset`; copied top cards keep their parent if it still exists. Returns the top cards. */
export function pasteMindMapNodes(map: LearningMindMap, clipboard: MindMapClipboard, offset: MindMapPoint = { x: 40, y: 40 }): { map: LearningMindMap; ids: string[] } {
  const ids = new Map(clipboard.nodes.map((node) => [node.id, `node_${crypto.randomUUID()}`]));
  const existing = new Set(map.nodes.map((node) => node.id));
  const nodes = clipboard.nodes.map((node) => {
    const { sourceId, sourceText, parentId, ...rest } = node;
    const parent = parentId ? ids.get(parentId) ?? (existing.has(parentId) ? parentId : undefined) : undefined;
    const sourceKnown = sourceId ? Boolean(map.sources?.[sourceId]) : Boolean(map.source);
    return { ...rest, id: ids.get(node.id)!, x: node.x + offset.x, y: node.y + offset.y, autoPosition: false,
      ...(parent ? { parentId: parent } : {}), ...(sourceKnown && sourceId ? { sourceId } : {}), ...(sourceKnown && sourceText !== undefined ? { sourceText } : {}) };
  });
  const next = readLearningMindMap({ ...map, nodes: [...map.nodes, ...nodes],
    edges: [...map.edges, ...clipboard.edges.map((edge) => ({ from: ids.get(edge.from)!, to: ids.get(edge.to)! }))],
    boundaries: [...map.boundaries, ...clipboard.boundaries.map((item) => ({ ...item, id: `boundary_${crypto.randomUUID()}`, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    summaries: [...map.summaries, ...clipboard.summaries.map((item) => ({ ...item, id: `summary_${crypto.randomUUID()}`, nodeId: ids.get(item.nodeId)!, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
  });
  return { map: next, ids: clipboard.nodes.filter((node) => !node.parentId || !ids.has(node.parentId)).map((node) => ids.get(node.id)!) };
}

/**
 * No provider call. Headings become branches, bold lead words and short blocks become cards, longer paragraphs
 * stay verbatim as text of their section; the notes section and evidence lines create no cards.
 * Cards are placed like manually added ones; relations of the generation become cross links.
 */
export function mindMapFromSummary(summary: LearningSummary): LearningMindMap {
  const text = summaryPlainText(summary.html);
  if (!text) throw new Error("Diese Zusammenfassung enthält noch keinen Text.");
  const content: Array<{ tag: string; text: string; body: string; keyword?: string }> = [];
  let tag = "p", passage = "";
  const flush = () => {
    const lead = /^\s*<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>\s*:/i.exec(passage), keyword = lead ? summaryPlainText(lead[2]).slice(0, 120) : "";
    const body = keyword ? summaryPlainText(passage.slice(lead![0].length)) : summaryPlainText(passage);
    if ((keyword || body) && !/^\s*<small\b/i.test(passage)) content.push({ tag, text: keyword ? `${keyword}: ${body}` : body, body, ...(keyword ? { keyword } : {}) });
    passage = "";
  };
  for (const token of summary.html.split(/(<[^>]*>)/g)) {
    if (token.startsWith("<!--")) continue;
    const boundary = token.match(/^<(\/?)(h[1-6]|p|div|li|blockquote|pre|tr|ul|ol)\b/i);
    if (boundary) { flush(); tag = boundary[1] ? "p" : boundary[2].toLowerCase(); }
    else passage += token;
  }
  flush();

  const title = (value: string) => value.length > 70 ? `${value.slice(0, 67).trimEnd()}…` : value;
  const root: SummaryTreeItem = { label: summary.title, paragraphs: [], children: [] };
  const stack: Array<{ level: number; item: SummaryTreeItem }> = [{ level: 0, item: root }];
  let skipBelow: number | null = null;
  for (const block of content) {
    const level = /^h[1-6]$/.test(block.tag) ? Number(block.tag[1]) : null;
    if (skipBelow !== null) { if (level === null || level > skipBelow) continue; skipBelow = null; }
    if (level !== null) {
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      if (block.text === SUMMARY_NOTES_HEADING) { skipBelow = level; continue; }
      const item = { label: title(block.text), paragraphs: [], children: [] };
      stack[stack.length - 1].item.children.push(item); stack.push({ level, item });
    } else if (block.keyword || block.text.length <= CARD_TITLE_CHARS || stack.length === 1) {
      stack[stack.length - 1].item.children.push({ label: block.keyword ?? title(block.text), sourceText: block.body || undefined, paragraphs: [], children: [] });
    } else stack[stack.length - 1].item.paragraphs.push(block.text);
  }

  let map: LearningMindMap = { ...createLearningMindMap(summary.deckId, summary.title), source: { summaryId: summary.id, title: summary.title, text, updatedAt: summary.updatedAt } };
  const ids = new Map<SummaryTreeItem, string>();
  const place = (item: SummaryTreeItem, parentId: string | null) => {
    if (map.nodes.length >= 2000) throw new Error("Die Zusammenfassung ist für diesen ersten Mindmap-Versuch zu umfangreich. Verwende eine kürzere Fassung.");
    const sourceText = item.sourceText ?? (item.paragraphs.join("\n\n") || undefined);
    const added = addMindMapRelativeNode(map, parentId, parentId ? "child" : "root", item.children.length ? "keyword" : "text", { x: 0, y: 0 }, { label: item.label, text: sourceText ?? "", ...(sourceText ? { sourceText } : {}) });
    map = added.map; ids.set(item, added.node.id);
  };
  // Breadth first, so the main branches spread around the root before their cards are stacked outward.
  place(root, null);
  for (let level = [root]; level.length; level = level.flatMap((item) => item.children)) {
    for (const item of level) for (const child of item.children) place(child, ids.get(item)!);
  }
  const byLabel = new Map(map.nodes.slice(1).map((node) => [node.label.toLocaleLowerCase("de"), node]));
  const edges = new Set<string>();
  for (const relation of summary.generation?.relations ?? []) {
    const from = byLabel.get(relation.from.trim().toLocaleLowerCase("de")), to = byLabel.get(relation.to.trim().toLocaleLowerCase("de"));
    const key = from && to ? [from.id, to.id].sort().join("\u0000") : "";
    if (!from || !to || from.id === to.id || from.parentId === to.id || to.parentId === from.id || edges.has(key)) continue;
    edges.add(key); map = { ...map, edges: [...map.edges, { from: from.id, to: to.id }] };
  }
  return readLearningMindMap(map);
}

function generatedTreeIds(map: LearningMindMap, sourceId: string): Set<string> {
  const ids = new Set(map.nodes.filter((node) => node.sourceId === sourceId).map((node) => node.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const node of map.nodes) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); grew = true; }
  }
  return ids;
}

/** Fingerprint of a generated tree including manual children, positions and attached links; any edit changes it. */
function generatedTreeSignature(map: LearningMindMap, sourceId: string): string {
  const ids = generatedTreeIds(map, sourceId);
  const value = JSON.stringify([
    map.nodes.filter((node) => ids.has(node.id)).map((node) => [node.id, node.kind, node.label, node.text, node.html, node.x, node.y, node.parentId, node.color, node.side, node.images?.map((image) => image.id)]),
    map.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to)),
    [...map.boundaries, ...map.summaries].filter((item) => item.nodeIds.some((key) => ids.has(key))).map((item) => [item.id, item.nodeIds]),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(36);
}

/** The latest tree generated from this summary, its size and whether it changed since generation. */
export function mindMapSummaryTree(map: LearningMindMap, summaryId: string): { sourceId: string; cards: number; edited: boolean } | null {
  const sourceId = Object.entries(map.sources ?? {}).filter(([key, source]) => source.summaryId === summaryId && map.nodes.some((node) => node.sourceId === key)).at(-1)?.[0];
  if (!sourceId) return null;
  return { sourceId, cards: generatedTreeIds(map, sourceId).size, edited: map.sources![sourceId].signature !== generatedTreeSignature(map, sourceId) };
}

/** Adds the summary as a new tree, beside existing content or with its root at `rootAt`, and remembers its signature. */
export function addMindMapFromSummary(map: LearningMindMap, summary: LearningSummary, rootAt?: MindMapPoint): LearningMindMap {
  const known = new Set(Object.keys(map.sources ?? {})), addition = mindMapFromSummary(summary), root = addition.nodes[0];
  const at = rootAt && { x: rootAt.x - root.x + Math.min(...addition.nodes.map((node) => node.x)), y: rootAt.y - root.y + Math.min(...addition.nodes.map((node) => node.y)) };
  const next = appendMindMap(map, addition, at);
  const sourceId = Object.keys(next.sources ?? {}).find((key) => !known.has(key))!;
  return { ...next, sources: { ...next.sources, [sourceId]: { ...next.sources![sourceId], signature: generatedTreeSignature(next, sourceId) } } };
}

/** Replaces one generated tree, including manual children and links attached to it, at the same place. */
export function replaceMindMapFromSummary(map: LearningMindMap, sourceId: string, summary: LearningSummary): LearningMindMap {
  const ids = generatedTreeIds(map, sourceId), root = map.nodes.find((node) => node.sourceId === sourceId && !(node.parentId && ids.has(node.parentId)));
  const { [sourceId]: _replaced, ...sources } = map.sources ?? {};
  const remaining: LearningMindMap = { ...map, sources,
    nodes: map.nodes.filter((node) => !ids.has(node.id)),
    edges: map.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)),
    boundaries: map.boundaries.map((item) => ({ ...item, nodeIds: item.nodeIds.filter((key) => !ids.has(key)) })).filter((item) => item.nodeIds.length),
    summaries: map.summaries.filter((item) => !ids.has(item.nodeId) && !item.nodeIds.some((key) => ids.has(key))),
  };
  return addMindMapFromSummary(remaining, summary, root && { x: root.x, y: root.y });
}

/** Local copy of a deck's map: `revision` is the cloud revision it builds on, `pending` marks a change not yet in the cloud. */
interface StoredMindMap { deckId: string; map: LearningMindMap; revision: number | null; pending: boolean }
/** Local image bytes; `uploaded` once the cloud holds them. */
interface StoredImage { id: string; blob: Blob; createdAt: number; uploaded: boolean }
type MindMapStores = { maps: IDBObjectStore; images: IDBObjectStore };
const TABLE = "learning_mind_maps";

async function withMindMapStores<T>(userId: string, mode: IDBTransactionMode, run: (stores: MindMapStores) => IDBRequest | (() => T) | void, failure: string): Promise<T> {
  if (!v.safeParse(id, userId).success) throw new Error("Zum Speichern ist ein aktives Konto erforderlich.");
  if (typeof indexedDB === "undefined") throw new Error("Der lokale Mindmap-Speicher ist nicht verfügbar.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`core.learningMindMaps.v2.${encodeURIComponent(userId)}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("maps", { keyPath: "deckId" });
      request.result.createObjectStore("images", { keyPath: "id" });
      indexedDB.deleteDatabase(`core.learningMindMaps.v1.${encodeURIComponent(userId)}`); // Nur lokal gespeicherte Altstände entfallen (ADR-043, I2).
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Der Mindmap-Speicher konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der Mindmap-Speicher ist blockiert. Schließe andere CoRe-Tabs und versuche es erneut."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(["maps", "images"], mode);
      const outcome = run({ maps: transaction.objectStore("maps"), images: transaction.objectStore("images") });
      transaction.oncomplete = () => resolve(typeof outcome === "function" ? outcome() : outcome?.result as T);
      transaction.onabort = transaction.onerror = () => reject(new Error(failure));
    });
  } finally { db.close(); }
}
const readMap = (userId: string, deckId: string) => withMindMapStores<StoredMindMap | undefined>(userId, "readonly", ({ maps }) => maps.get(deckId), "Die Infinity Map konnte nicht geladen werden.");
function readImages(userId: string, ids: string[]) {
  return withMindMapStores<StoredImage[]>(userId, "readonly", ({ images }) => {
    const found: StoredImage[] = [];
    for (const key of ids) { const request = images.get(key); request.onsuccess = () => { if (request.result?.blob instanceof Blob) found.push(request.result); }; }
    return () => found;
  }, "Die Bilder konnten nicht geladen werden.");
}
function writeMindMapStores(userId: string, { maps = [], images = [], removedMaps = [], removedImages = [] }: { maps?: StoredMindMap[]; images?: StoredImage[]; removedMaps?: string[]; removedImages?: string[] }, failure: string) {
  return withMindMapStores<void>(userId, "readwrite", (stores) => {
    for (const record of maps) stores.maps.put(record);
    for (const image of images) stores.images.put(image);
    for (const deckId of removedMaps) stores.maps.delete(deckId);
    for (const key of removedImages) stores.images.delete(key);
  }, failure);
}

async function uploadImages(account: LearningContentAccount & { cloud: SupabaseClient }, images: StoredImage[]) {
  const pending = images.filter((image) => !image.uploaded);
  for (const image of pending) await uploadMindMapImage(account.cloud, account.userId, image.id, image.blob);
  if (pending.length) await writeMindMapStores(account.userId, { images: pending.map((image) => ({ ...image, uploaded: true })) }, "Die Bilder konnten nicht gespeichert werden.");
}

/** Uploads the map after its images. A save from another device in between is replaced: the latest save wins (ADR-043, I3). */
async function pushMindMap(account: LearningContentAccount & { cloud: SupabaseClient }, record: StoredMindMap): Promise<{ overwritten: boolean }> {
  const { userId, cloud } = account;
  await uploadImages(account, await readImages(userId, [...mindMapImageIds(record.map)]));
  const write = (baseRevision: number | null) => writeLearningDocument(cloud, TABLE, { userId, id: record.deckId, deckId: record.deckId, document: record.map, baseRevision });
  const first = await write(record.revision), result = "conflict" in first ? await write(first.conflict?.revision ?? null) : first;
  if ("conflict" in result) throw new Error("Die Mindmap wurde gleichzeitig auf einem anderen Gerät gespeichert.");
  await writeMindMapStores(userId, { maps: [{ ...record, revision: result.revision, pending: false }] }, "Die Mindmap konnte nicht gespeichert werden. Dein Entwurf bleibt geöffnet.");
  return { overwritten: "conflict" in first };
}

/** Unreferenced images survive a day, so undo in an open map and unsaved drafts in other tabs keep them; online ones go once no cloud map uses them. */
const IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

async function releaseUnusedMindMapImages(account: LearningContentAccount, now: number) {
  const { userId, cloud } = account;
  const { maps, images } = await withMindMapStores<{ maps: StoredMindMap[]; images: StoredImage[] }>(userId, "readonly", (stores) => {
    const mapRequest = stores.maps.getAll(), imageRequest = stores.images.getAll();
    return () => ({ maps: mapRequest.result, images: imageRequest.result });
  }, "Die Bilder konnten nicht geladen werden.");
  const used = mindMapImageIds({ nodes: maps.flatMap((record) => record.map.nodes) });
  const unused = images.filter((image) => !used.has(image.id) && now - image.createdAt >= IMAGE_GRACE_MS);
  if (!unused.length) return;
  await writeMindMapStores(userId, { removedImages: unused.map((image) => image.id) }, "Die Bilder konnten nicht freigegeben werden.");
  const uploaded = unused.filter((image) => image.uploaded).map((image) => image.id);
  if (!cloud || !uploaded.length) return;
  const online = mindMapImageIds({ nodes: (await listLearningDocuments(cloud, TABLE)).flatMap((row) => row.deleted ? [] : readLearningMindMap(row.document).nodes) });
  await removeMindMapImages(cloud, userId, uploaded.filter((key) => !online.has(key)));
}

/** The deck's single surface: the cloud state unless this browser holds an unsent change, which is uploaded here. Offline the last local copy is shown. */
export async function loadInfinityMindMap(account: LearningContentAccount, deckId: string, now = Date.now()): Promise<{ map: LearningMindMap; unsynced: boolean; overwritten: boolean }> {
  const { userId, cloud } = account;
  await releaseUnusedMindMapImages(account, now).catch(() => undefined);
  let record = await readMap(userId, deckId);
  const remote = cloud ? await listLearningDocuments(cloud, TABLE, deckId).catch(() => null) : null;
  if (remote && !record?.pending) {
    const row = remote.find((item) => !item.deleted);
    record = row && { deckId, map: readLearningMindMap(row.document), revision: row.revision, pending: false };
    await writeMindMapStores(userId, record ? { maps: [record] } : { removedMaps: [deckId] }, "Die Infinity Map konnte nicht geladen werden.");
  }
  const pushed = cloud && remote && record?.pending ? await pushMindMap({ ...account, cloud }, record).catch(() => null) : null;
  if (record && pushed) record = { ...record, pending: false };
  return { map: record ? readLearningMindMap(record.map) : { ...createLearningMindMap(deckId, "Infinity Map"), infinity: true }, unsynced: Boolean(record?.pending), overwritten: Boolean(pushed?.overwritten) };
}

/** Saves locally first and then to the cloud; offline the map stays marked as not yet synchronised. `overwritten` reports a replaced save from another device. */
export async function saveLearningMindMap(account: LearningContentAccount, value: unknown): Promise<{ map: LearningMindMap; unsynced: boolean; overwritten: boolean }> {
  const map = readLearningMindMap(value), { userId, cloud } = account, existing = await readMap(userId, map.deckId);
  const record: StoredMindMap = { deckId: map.deckId, map, revision: existing?.revision ?? null, pending: Boolean(cloud) };
  await writeMindMapStores(userId, { maps: [record] }, "Die Mindmap konnte nicht gespeichert werden. Dein Entwurf bleibt geöffnet.");
  if (!cloud) return { map, unsynced: false, overwritten: false };
  return pushMindMap({ ...account, cloud }, record).then(({ overwritten }) => ({ map, unsynced: false, overwritten }), () => ({ map, unsynced: true, overwritten: false }));
}
