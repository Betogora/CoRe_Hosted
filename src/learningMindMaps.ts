import * as v from "valibot";
import { summaryPlainText, type LearningSummary } from "./learningSummaries.ts";
import { sanitizeCardHtml } from "./htmlSafety.ts";
import { downscaleImageToFullHd } from "./imageDownscale.ts";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const coordinate = v.pipe(v.number(), v.finite());
const point = v.strictObject({ x: coordinate, y: coordinate });
const color = v.union([v.picklist(["default", "blue", "purple", "yellow", "red"]), v.pipe(v.string(), v.regex(/^#[a-f0-9]{6}$/i))]);
const appearance = { color: v.optional(color), fillColor: v.optional(color), opacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), strokeWidth: v.optional(v.picklist([2, 4, 8])) };
const members = v.pipe(v.array(id), v.minLength(1), v.maxLength(2000));
const bracketSchema = v.strictObject({ id, nodeIds: members, nodeId: id, side: v.picklist(["left", "right"]) });
const boundarySchema = v.strictObject({ id, nodeIds: members, label: v.pipe(v.string(), v.maxLength(120)), shape: v.picklist(["rectangle", "rounded", "ellipse"]), ...appearance });
const zoneSchema = v.strictObject({ id, title: v.pipe(v.string(), v.maxLength(120)), x: coordinate, y: coordinate,
  width: v.pipe(coordinate, v.minValue(180)), height: v.pipe(coordinate, v.minValue(100)),
  collapsed: v.boolean(), autoSize: v.boolean(), layer: v.pipe(v.number(), v.integer(), v.minValue(0)), ...appearance });
const sourceSchema = v.strictObject({ summaryId: id, title: v.string(), text: v.pipe(v.string(), v.maxLength(100_000)), updatedAt: v.string() });
const imageSchema = v.strictObject({
  id, name: v.pipe(v.string(), v.minLength(1), v.maxLength(240)),
  dataUrl: v.pipe(v.string(), v.maxLength(2_800_000), v.regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/)),
});
const nodeSchema = v.strictObject({
  id, kind: v.picklist(["keyword", "text", "freeText"]), label: v.pipe(v.string(), v.maxLength(120)),
  text: v.pipe(v.string(), v.maxLength(100_000)), x: coordinate, y: coordinate,
  sourceText: v.optional(v.pipe(v.string(), v.maxLength(100_000))),
  sourceId: v.optional(id), color: v.optional(color),
  parentId: v.optional(id), zoneId: v.optional(id), autoPosition: v.optional(v.boolean()), side: v.optional(v.picklist(["left", "right"])), html: v.optional(v.pipe(v.string(), v.maxLength(100_000))),
  images: v.optional(v.pipe(v.array(imageSchema), v.maxLength(4))),
});
const mapSchema = v.strictObject({
  version: v.literal(1), id, deckId: id, title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  nodes: v.pipe(v.array(nodeSchema), v.maxLength(2000)),
  edges: v.pipe(v.array(v.strictObject({ from: id, to: id })), v.maxLength(10_000)),
  strokes: v.pipe(v.array(v.strictObject({ id, points: v.pipe(v.array(point), v.minLength(1), v.maxLength(20_000)), color: v.optional(color), width: v.optional(v.picklist([2, 4, 8])), zoneId: v.optional(id) })), v.maxLength(2000)),
  summaries: v.optional(v.pipe(v.array(bracketSchema), v.maxLength(500)), []),
  boundaries: v.optional(v.pipe(v.array(boundarySchema), v.maxLength(500)), []),
  zones: v.optional(v.pipe(v.array(zoneSchema), v.maxLength(500)), []),
  connectionColor: v.optional(v.picklist(["gray", "node"]), "node"),
  source: v.optional(sourceSchema), sources: v.optional(v.record(id, sourceSchema)), infinity: v.optional(v.literal(true)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()), updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type LearningMindMap = v.InferOutput<typeof mapSchema>;
export type MindMapNode = v.InferOutput<typeof nodeSchema>;
export type MindMapPoint = v.InferOutput<typeof point>;
export type MindMapColor = v.InferOutput<typeof color>;
export type MindMapSummary = v.InferOutput<typeof bracketSchema>;
export type MindMapBoundary = v.InferOutput<typeof boundarySchema>;
export type MindMapZone = v.InferOutput<typeof zoneSchema>;
export type MindMapElementKind = "node" | "summary" | "boundary" | "zone";
export type MindMapRect = MindMapPoint & { width: number; height: number };
export const mindMapColors: ReadonlyArray<{ value: MindMapColor; label: string }> = [
  { value: "default", label: "Standard" }, { value: "blue", label: "Blau" },
  { value: "purple", label: "Violett" }, { value: "yellow", label: "Gelb" }, { value: "red", label: "Koralle" },
];

export function readLearningMindMap(value: unknown): LearningMindMap {
  const parsed = v.safeParse(mapSchema, value);
  if (!parsed.success || !parsed.output.title.trim() || Date.parse(parsed.output.updatedAt) < Date.parse(parsed.output.createdAt)) {
    throw new Error("Die gespeicherte Mindmap ist ungültig.");
  }
  const map = parsed.output, nodes = new Set(map.nodes.map((node) => node.id)), zones = new Set(map.zones.map((zone) => zone.id));
  const edges = new Set(map.edges.map((edge) => [edge.from, edge.to].sort().join("\u0000")));
  const allIds = [...map.nodes, ...map.zones, ...map.summaries, ...map.boundaries, ...map.strokes].map((item) => item.id);
  const validMembers = (ids: string[]) => new Set(ids).size === ids.length && ids.every((key) => nodes.has(key));
  const endpoints = new Set([...nodes, ...zones]);
  if (new Set(allIds).size !== allIds.length || edges.size !== map.edges.length || map.nodes.some((node) => (node.sourceId !== undefined || node.sourceText !== undefined) && !mindMapNodeSource(map, node) || new Set(node.images?.map((image) => image.id)).size !== (node.images?.length ?? 0) || node.parentId && !nodes.has(node.parentId) || node.zoneId && !zones.has(node.zoneId)) || map.edges.some((edge) => edge.from === edge.to || !endpoints.has(edge.from) || !endpoints.has(edge.to)) || map.strokes.some((stroke) => stroke.zoneId && !zones.has(stroke.zoneId)) || map.boundaries.some((item) => !validMembers(item.nodeIds)) || map.summaries.some((item) => !nodes.has(item.nodeId) || item.nodeIds.includes(item.nodeId) || !validMembers(item.nodeIds) || new Set(item.nodeIds.map((key) => map.nodes.find((node) => node.id === key)!.parentId)).size !== 1)) {
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
  if (from === to || ![...map.nodes, ...map.zones].some((node) => node.id === from) || ![...map.nodes, ...map.zones].some((node) => node.id === to)) return map;
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
    ? { ...node, x: node.x + delta.x, y: node.y + delta.y, side: placement.side, ...(node.id === child.id ? { autoPosition: true, color: undefined, zoneId: parent.zoneId } : {}) }
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

export async function readMindMapImages(files: File[]): Promise<NonNullable<MindMapNode["images"]>> {
  if (files.length > 4) throw new Error("Pro Kasten sind bis zu vier Bilder möglich.");
  return Promise.all(files.map(async (file) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Bitte wähle ein PNG-, JPEG-, WebP- oder GIF-Bild.");
    if (file.size > 2_000_000) throw new Error("Ein Bild darf höchstens 2 MB groß sein.");
    const scaled = await downscaleImageToFullHd(file);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Das Bild konnte nicht gelesen werden."));
      reader.onerror = () => reject(new Error("Das Bild konnte nicht gelesen werden."));
      reader.readAsDataURL(scaled);
    });
    const image = v.safeParse(imageSchema, { id: `image_${crypto.randomUUID()}`, name: file.name.slice(0, 240), dataUrl });
    if (!image.success) throw new Error("Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Bilddatei.");
    return image.output;
  }));
}

/** Place another graph beside existing content; nodes reference one snapshot per source. */
export function appendMindMap(map: LearningMindMap, addition: LearningMindMap): LearningMindMap {
  if (map.deckId !== addition.deckId) throw new Error("Die Mindmap gehört zu einem anderen Stapel.");
  const occupied = [...map.nodes.map((node) => node.x + 220), ...map.strokes.flatMap((stroke) => stroke.points.map((p) => p.x)), ...map.zones.map((zone) => { const rect = mindMapZoneRect(map, zone); return rect.x + rect.width; }), ...map.boundaries.map((item) => { const rect = mindMapBoundaryRect(map, item); return rect.x + rect.width; })];
  const incoming = [...addition.nodes.map((node) => node.x), ...addition.strokes.flatMap((stroke) => stroke.points.map((p) => p.x)), ...addition.zones.map((zone) => mindMapZoneRect(addition, zone).x), ...addition.boundaries.map((item) => mindMapBoundaryRect(addition, item).x)];
  const offset = occupied.length && incoming.length ? occupied.reduce((a, b) => Math.max(a, b)) + 180 - incoming.reduce((a, b) => Math.min(a, b)) : 0;
  const ids = new Map(addition.nodes.map((node) => [node.id, `node_${crypto.randomUUID()}`]));
  const zoneIds = new Map(addition.zones.map((zone) => [zone.id, `zone_${crypto.randomUUID()}`]));
  const endpoint = (key: string) => ids.get(key) ?? zoneIds.get(key)!;
  const sourceIds = new Map(Object.keys(addition.sources ?? {}).map((key) => [key, `source_${crypto.randomUUID()}`]));
  const legacySourceId = addition.source ? `source_${crypto.randomUUID()}` : undefined;
  const sources = { ...map.sources, ...Object.fromEntries(Object.entries(addition.sources ?? {}).map(([key, value]) => [sourceIds.get(key)!, value])), ...(legacySourceId ? { [legacySourceId]: addition.source! } : {}) };
  return readLearningMindMap({ ...map,
    ...(Object.keys(sources).length ? { sources } : {}),
    nodes: [...map.nodes, ...addition.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, x: node.x + offset, ...(node.parentId ? { parentId: ids.get(node.parentId)! } : {}), ...(node.zoneId ? { zoneId: zoneIds.get(node.zoneId)! } : {}), ...(node.sourceId || legacySourceId ? { sourceId: node.sourceId ? sourceIds.get(node.sourceId)! : legacySourceId } : {}) }))],
    edges: [...map.edges, ...addition.edges.map((edge) => ({ from: endpoint(edge.from), to: endpoint(edge.to) }))],
    zones: [...map.zones, ...addition.zones.map((zone) => ({ ...zone, id: zoneIds.get(zone.id)!, x: zone.x + offset, layer: zone.layer + 1 + Math.max(-1, ...map.zones.map((item) => item.layer)) }))],
    boundaries: [...map.boundaries, ...addition.boundaries.map((item) => ({ ...item, id: `boundary_${crypto.randomUUID()}`, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    summaries: [...map.summaries, ...addition.summaries.map((item) => ({ ...item, id: `summary_${crypto.randomUUID()}`, nodeId: ids.get(item.nodeId)!, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    strokes: [...map.strokes, ...addition.strokes.map((stroke) => ({ ...stroke, id: `stroke_${crypto.randomUUID()}`, ...(stroke.zoneId ? { zoneId: zoneIds.get(stroke.zoneId)! } : {}), points: stroke.points.map((p) => ({ x: p.x + offset, y: p.y })) }))],
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
  for (const zoneId of new Set(next.nodes.map((node) => node.zoneId))) if (zoneId) next = containMindMapZone(next, zoneId);
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

export function mindMapZoneRect(map: LearningMindMap, zone: MindMapZone): MindMapRect {
  const nodes = map.nodes.filter((node) => node.zoneId === zone.id);
  const points = map.strokes.filter((stroke) => stroke.zoneId === zone.id).flatMap((stroke) => stroke.points);
  const rect = zone.autoSize && (nodes.length || points.length)
    ? mindMapBounds([...nodes.map((node) => mindMapNodeRect(node)), ...points.map((p) => ({ ...p, width: 0, height: 0 }))], 64)
    : { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
  return { ...rect, width: Math.max(180, rect.width), height: zone.collapsed ? 52 : Math.max(100, rect.height) };
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

export function addMindMapRelativeNode(map: LearningMindMap, anchorId: string | null, relation: "root" | "sibling" | "child", kind: MindMapNode["kind"] = "keyword", position: MindMapPoint = { x: 0, y: 0 }): { map: LearningMindMap; node: MindMapNode } {
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
  const node: MindMapNode = { ...createMindMapNode(kind, position),
    ...((parent || relation === "sibling") ? { autoPosition: true } : {}),
    ...(parent ? { parentId: parent.id, side, ...(parent.zoneId ? { zoneId: parent.zoneId } : {}) } : {}),
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
  let next = { ...map, nodes: [...map.nodes, node] };
  if (node.zoneId) next = containMindMapZone(next, node.zoneId);
  return { map: next, node };
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
  const node = { ...createMindMapNode("text", { x: side === "right" ? rect.x + rect.width + 80 : rect.x - 300, y: rect.y + rect.height / 2 - 80 }), label: "Zusammenfassung", color: "default",
    ...(nodes.every((item) => item.zoneId === nodes[0].zoneId) && nodes[0].zoneId ? { zoneId: nodes[0].zoneId } : {}) };
  const summary = { id: `summary_${crypto.randomUUID()}`, nodeIds: ids, nodeId: node.id, side };
  let next = { ...map, nodes: [...map.nodes, node], summaries: [...map.summaries, summary] };
  if (node.zoneId) next = containMindMapZone(next, node.zoneId);
  return { map: next, id: summary.id };
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

export function createMindMapBoundary(map: LearningMindMap, nodeIds: string[]): { map: LearningMindMap; id: string } {
  const ids = [...new Set(nodeIds)].filter((key) => map.nodes.some((node) => node.id === key));
  if (!ids.length) throw new Error("Wähle zuerst die Knoten für die Umrandung.");
  const boundary: MindMapBoundary = { id: `boundary_${crypto.randomUUID()}`, nodeIds: ids, label: "", shape: "rounded", color: "blue", fillColor: "blue", opacity: 0.08, strokeWidth: 2 };
  return { map: { ...map, boundaries: [...map.boundaries, boundary] }, id: boundary.id };
}

export function createMindMapZone(map: LearningMindMap, nodeIds: string[], position: MindMapPoint): { map: LearningMindMap; id: string } {
  const included = new Set(descendantIds(map, nodeIds));
  const nodes = map.nodes.filter((node) => included.has(node.id));
  const rect = nodes.length ? mindMapBounds(nodes.map((node) => mindMapNodeRect(node)), 64) : { ...position, width: 520, height: 360 };
  const zone: MindMapZone = { id: `zone_${crypto.randomUUID()}`, title: "Neue Zone", ...rect, collapsed: false, autoSize: false, layer: 1 + Math.max(-1, ...map.zones.map((item) => item.layer)), color: "blue", fillColor: "blue", opacity: 0.06, strokeWidth: 2 };
  return { map: { ...map, zones: [...map.zones, zone], nodes: map.nodes.map((node) => included.has(node.id) ? { ...node, zoneId: zone.id } : node) }, id: zone.id };
}

function containMindMapZone(map: LearningMindMap, id: string): LearningMindMap {
  const zone = map.zones.find((item) => item.id === id);
  if (!zone || zone.autoSize) return map;
  const members = map.nodes.filter((node) => node.zoneId === id);
  const points = map.strokes.filter((stroke) => stroke.zoneId === id).flatMap((stroke) => stroke.points);
  const content = [...members.map((node) => mindMapNodeRect(node)), ...points.map((p) => ({ ...p, width: 0, height: 0 }))];
  const rect = mindMapBounds([mindMapZoneRect(map, { ...zone, collapsed: false }), ...(content.length ? [mindMapBounds(content, 64)] : [])], 0);
  return { ...map, zones: map.zones.map((item) => item.id === id ? { ...item, ...rect } : item) };
}

export function moveMindMapElement(map: LearningMindMap, kind: MindMapElementKind, id: string, delta: MindMapPoint): LearningMindMap {
  const ids = new Set(kind === "node" ? [id] : kind === "boundary" ? map.boundaries.find((item) => item.id === id)?.nodeIds : kind === "summary" ? [map.summaries.find((item) => item.id === id)?.nodeId] : map.nodes.filter((node) => node.zoneId === id).map((node) => node.id));
  return { ...map, nodes: map.nodes.map((node) => ids.has(node.id) ? { ...node, x: node.x + delta.x, y: node.y + delta.y, ...(kind !== "zone" ? { autoPosition: false } : {}) } : node),
    zones: map.zones.map((zone) => kind === "zone" && zone.id === id ? { ...zone, x: zone.x + delta.x, y: zone.y + delta.y } : zone),
    strokes: map.strokes.map((stroke) => kind === "zone" && stroke.zoneId === id ? { ...stroke, points: stroke.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) } : stroke),
  };
}

export function placeMindMapNode(map: LearningMindMap, nodeId: string): LearningMindMap {
  const node = map.nodes.find((item) => item.id === nodeId);
  if (!node) return map;
  const center = { x: node.x + 110, y: node.y + mindMapNodeRect(node).height / 2 };
  const zone = [...map.zones].sort((a, b) => a.layer - b.layer).reverse().find((item) => { const r = mindMapZoneRect(map, item); return !item.collapsed && center.x >= r.x && center.x <= r.x + r.width && center.y >= r.y && center.y <= r.y + r.height; });
  const next = editMindMapNode(map, nodeId, { zoneId: zone?.id });
  return zone ? containMindMapZone(next, zone.id) : next;
}

export function resizeMindMapZone(map: LearningMindMap, id: string, corner: "nw" | "ne" | "sw" | "se", delta: MindMapPoint): LearningMindMap {
  const zone = map.zones.find((item) => item.id === id);
  if (!zone) return map;
  const rect = mindMapZoneRect(map, { ...zone, collapsed: false });
  const members = map.nodes.filter((node) => node.zoneId === id);
  const points = map.strokes.filter((stroke) => stroke.zoneId === id).flatMap((stroke) => stroke.points);
  const content = [...members.map((node) => mindMapNodeRect(node)), ...points.map((p) => ({ ...p, width: 0, height: 0 }))];
  const bounds = content.length ? mindMapBounds(content, 64) : null;
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  if (corner.includes("w")) left = Math.min(right - 180, bounds?.x ?? Infinity, left + delta.x);
  else right = Math.max(left + 180, bounds ? bounds.x + bounds.width : -Infinity, right + delta.x);
  if (corner.includes("n")) top = Math.min(bottom - 100, bounds?.y ?? Infinity, top + delta.y);
  else bottom = Math.max(top + 100, bounds ? bounds.y + bounds.height : -Infinity, bottom + delta.y);
  return { ...map, zones: map.zones.map((item) => item.id === id ? { ...item, x: left, y: top, width: right - left, height: bottom - top, autoSize: false } : item) };
}

export function setMindMapZoneLayer(map: LearningMindMap, id: string, direction: "front" | "back"): LearningMindMap {
  const ordered = [...map.zones].sort((a, b) => a.layer - b.layer).filter((zone) => zone.id !== id), zone = map.zones.find((item) => item.id === id);
  if (!zone) return map;
  if (direction === "front") ordered.push(zone); else ordered.unshift(zone);
  return { ...map, zones: ordered.map((item, layer) => ({ ...item, layer })) };
}

export function removeMindMapElement(map: LearningMindMap, kind: MindMapElementKind, id: string, withContent = false): LearningMindMap {
  if (kind === "node") return removeMindMapNode(map, id);
  if (kind === "boundary") return { ...map, boundaries: map.boundaries.filter((item) => item.id !== id) };
  if (kind === "summary") { const summary = map.summaries.find((item) => item.id === id); return summary ? removeMindMapNode(map, summary.nodeId) : map; }
  const next = withContent ? map.nodes.filter((node) => node.zoneId === id).reduce((current, node) => removeMindMapNode(current, node.id), map) : map;
  return { ...next, zones: next.zones.filter((zone) => zone.id !== id), nodes: next.nodes.map((node) => node.zoneId === id ? { ...node, zoneId: undefined } : node),
    edges: next.edges.filter((edge) => edge.from !== id && edge.to !== id), strokes: withContent ? next.strokes.filter((stroke) => stroke.zoneId !== id) : next.strokes.map((stroke) => stroke.zoneId === id ? { ...stroke, zoneId: undefined } : stroke),
  };
}

export function duplicateMindMapZone(map: LearningMindMap, id: string): { map: LearningMindMap; id: string } {
  const zone = map.zones.find((item) => item.id === id);
  if (!zone) throw new Error("Die Zone ist nicht verfügbar.");
  const offset = mindMapZoneRect(map, { ...zone, collapsed: false }).width + 80;
  const nodes = map.nodes.filter((node) => node.zoneId === id), ids = new Map(nodes.map((node) => [node.id, `node_${crypto.randomUUID()}`])), nextId = `zone_${crypto.randomUUID()}`;
  const sources = new Set(nodes.map((node) => node.id));
  const next: LearningMindMap = { ...map, zones: [...map.zones, { ...zone, id: nextId, title: `${zone.title.slice(0, 110)} (Kopie)`, x: zone.x + offset, layer: 1 + Math.max(-1, ...map.zones.map((item) => item.layer)) }],
    nodes: [...map.nodes, ...nodes.map((node) => ({ ...node, id: ids.get(node.id)!, zoneId: nextId, color: mindMapNodeColor(map, node).color, x: node.x + offset, parentId: node.parentId ? ids.get(node.parentId) ?? node.parentId : undefined, images: node.images?.map((image) => ({ ...image, id: `image_${crypto.randomUUID()}` })) }))],
    edges: [...map.edges, ...map.edges.filter((edge) => (sources.has(edge.from) || edge.from === id || sources.has(edge.to) || edge.to === id)).map((edge) => ({ from: edge.from === id ? nextId : ids.get(edge.from) ?? edge.from, to: edge.to === id ? nextId : ids.get(edge.to) ?? edge.to }))],
    strokes: [...map.strokes, ...map.strokes.filter((stroke) => stroke.zoneId === id).map((stroke) => ({ ...stroke, id: `stroke_${crypto.randomUUID()}`, zoneId: nextId, points: stroke.points.map((p) => ({ x: p.x + offset, y: p.y })) }))],
    boundaries: [...map.boundaries, ...map.boundaries.filter((item) => item.nodeIds.every((key) => sources.has(key))).map((item) => ({ ...item, id: `boundary_${crypto.randomUUID()}`, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
    summaries: [...map.summaries, ...map.summaries.filter((item) => sources.has(item.nodeId) && item.nodeIds.every((key) => sources.has(key))).map((item) => ({ ...item, id: `summary_${crypto.randomUUID()}`, nodeId: ids.get(item.nodeId)!, nodeIds: item.nodeIds.map((key) => ids.get(key)!) }))],
  };
  return { map: readLearningMindMap(next), id: nextId };
}

/** Keep source passages verbatim; only the labels are shortened. No provider call. */
export function mindMapFromSummary(summary: LearningSummary): LearningMindMap {
  const text = summaryPlainText(summary.html);
  if (!text) throw new Error("Diese Zusammenfassung enthält noch keinen Text.");
  const map = createLearningMindMap(summary.deckId, summary.title);
  map.source = { summaryId: summary.id, title: summary.title, text, updatedAt: summary.updatedAt };
  const root = { ...createMindMapNode("keyword", { x: 0, y: 0 }), label: summary.title, sourceText: text };
  map.nodes.push(root);
  const headings: Array<{ level: number; node: MindMapNode }> = [{ level: 0, node: root }];
  let row = 0;
  const content: Array<{ tag: string; text: string }> = [];
  let tag = "p", passage = "";
  const flush = () => {
    const value = summaryPlainText(passage);
    if (value) content.push({ tag, text: value });
    passage = "";
  };
  for (const token of summary.html.split(/(<[^>]*>)/g)) {
    if (token.startsWith("<!--")) continue;
    const boundary = token.match(/^<(\/?)(h[1-6]|p|div|li|blockquote|pre|tr|ul|ol)\b/i);
    if (boundary) { flush(); tag = boundary[1] ? "p" : boundary[2].toLowerCase(); }
    else passage += token;
  }
  flush();
  for (const block of content) {
    if (!block.text.trim()) continue;
    if (map.nodes.length >= 2000) throw new Error("Die Zusammenfassung ist für diesen ersten Mindmap-Versuch zu umfangreich. Verwende eine kürzere Fassung.");
    const level = /^h[1-6]$/.test(block.tag) ? Number(block.tag[1]) : null;
    if (level !== null) while (headings.length > 1 && headings[headings.length - 1].level >= level) headings.pop();
    const parent = headings[headings.length - 1].node;
    const label = block.text.length > 70 ? `${block.text.slice(0, 67).trimEnd()}…` : block.text;
    const node = { ...createMindMapNode("keyword", { x: headings.length * 300, y: row++ * 152 }), label, sourceText: block.text, parentId: parent.id, autoPosition: true };
    map.nodes.push(node);
    if (level !== null) headings.push({ level, node });
    else for (const heading of headings.slice(1)) heading.node.sourceText += `\n\n${block.text}`;
  }
  root.y = Math.max(0, (row - 1) * 76);
  return readLearningMindMap(map);
}

async function openDatabase(userId: string): Promise<IDBDatabase> {
  if (!v.safeParse(id, userId).success) throw new Error("Zum Speichern ist ein aktives Konto erforderlich.");
  if (typeof indexedDB === "undefined") throw new Error("Der lokale Mindmap-Speicher ist nicht verfügbar.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`core.learningMindMaps.v1.${encodeURIComponent(userId)}`, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("maps", { keyPath: "id" }).createIndex("deckId", "deckId"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Der Mindmap-Speicher konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der Mindmap-Speicher ist blockiert. Schließe andere CoRe-Tabs und versuche es erneut."));
  });
}

export async function loadLearningMindMaps(userId: string, deckId: string): Promise<LearningMindMap[]> {
  const db = await openDatabase(userId);
  try {
    const rows = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction("maps", "readonly"), request = transaction.objectStore("maps").index("deckId").getAll(deckId);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new Error("Die Mindmaps konnten nicht geladen werden."));
    });
    if (!Array.isArray(rows)) throw new Error("Der Mindmap-Speicher ist ungültig.");
    return rows.map(readLearningMindMap).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

/** Read/create the single surface; migrating older separate maps is atomic and account-scoped. */
export async function loadInfinityMindMap(userId: string, deckId: string): Promise<LearningMindMap> {
  const db = await openDatabase(userId);
  try {
    return await new Promise<LearningMindMap>((resolve, reject) => {
      const transaction = db.transaction("maps", "readwrite"), store = transaction.objectStore("maps");
      const request = store.index("deckId").getAll(deckId);
      let result: LearningMindMap;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const maps = request.result.map((row: unknown) => readLearningMindMap(row)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
          const existing = maps.find((map) => map.infinity);
          result = existing ?? { ...createLearningMindMap(deckId, "Infinity Map"), infinity: true };
          for (const map of maps) if (map.id !== result.id) result = appendMindMap(result, map);
          if (!existing || maps.length > 1) {
            result = { ...result, updatedAt: new Date().toISOString() };
            store.put(result);
            for (const map of maps) if (map.id !== result.id) store.delete(map.id);
          }
        } catch (cause: unknown) { failure = cause; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(failure ?? new Error("Die Infinity Map konnte nicht geladen werden. Deine gespeicherten Mindmaps bleiben erhalten."));
    });
  } finally { db.close(); }
}

export async function saveLearningMindMap(userId: string, value: unknown): Promise<LearningMindMap> {
  const map = readLearningMindMap(value), db = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("maps", "readwrite");
      transaction.objectStore("maps").put(map);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error("Die Mindmap konnte nicht gespeichert werden. Dein Entwurf bleibt geöffnet."));
    });
    return map;
  } finally { db.close(); }
}
