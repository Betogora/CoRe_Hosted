import * as v from "valibot";
import { summaryPlainText, type LearningSummary } from "./learningSummaries.ts";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const coordinate = v.pipe(v.number(), v.finite());
const point = v.strictObject({ x: coordinate, y: coordinate });
const nodeSchema = v.strictObject({
  id, kind: v.picklist(["keyword", "text"]), label: v.pipe(v.string(), v.maxLength(120)),
  text: v.pipe(v.string(), v.maxLength(100_000)), x: coordinate, y: coordinate,
  sourceText: v.optional(v.pipe(v.string(), v.maxLength(100_000))),
});
const mapSchema = v.strictObject({
  version: v.literal(1), id, deckId: id, title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  nodes: v.pipe(v.array(nodeSchema), v.maxLength(2000)),
  edges: v.pipe(v.array(v.strictObject({ from: id, to: id })), v.maxLength(10_000)),
  strokes: v.pipe(v.array(v.strictObject({ id, points: v.pipe(v.array(point), v.minLength(1), v.maxLength(20_000)) })), v.maxLength(2000)),
  source: v.optional(v.strictObject({ summaryId: id, title: v.string(), text: v.pipe(v.string(), v.maxLength(100_000)), updatedAt: v.string() })),
  createdAt: v.pipe(v.string(), v.isoTimestamp()), updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type LearningMindMap = v.InferOutput<typeof mapSchema>;
export type MindMapNode = v.InferOutput<typeof nodeSchema>;
export type MindMapPoint = v.InferOutput<typeof point>;

export function readLearningMindMap(value: unknown): LearningMindMap {
  const parsed = v.safeParse(mapSchema, value);
  if (!parsed.success || !parsed.output.title.trim() || Date.parse(parsed.output.updatedAt) < Date.parse(parsed.output.createdAt)) {
    throw new Error("Die gespeicherte Mindmap ist ungültig.");
  }
  const map = parsed.output, nodes = new Set(map.nodes.map((node) => node.id));
  const edges = new Set(map.edges.map((edge) => [edge.from, edge.to].sort().join("\u0000")));
  if (nodes.size !== map.nodes.length || edges.size !== map.edges.length || new Set(map.strokes.map((stroke) => stroke.id)).size !== map.strokes.length || map.nodes.some((node) => node.sourceText !== undefined && !map.source) || map.edges.some((edge) => edge.from === edge.to || !nodes.has(edge.from) || !nodes.has(edge.to))) {
    throw new Error("Die Mindmap enthält ungültige Verbindungen oder doppelte Elemente.");
  }
  return { ...map, title: map.title.trim() };
}

export function createLearningMindMap(deckId: string, title: string): LearningMindMap {
  const now = new Date().toISOString();
  return readLearningMindMap({ version: 1, id: `mindmap_${crypto.randomUUID()}`, deckId, title, nodes: [], edges: [], strokes: [], createdAt: now, updatedAt: now });
}

export function createMindMapNode(kind: MindMapNode["kind"], position: MindMapPoint): MindMapNode {
  return { id: `node_${crypto.randomUUID()}`, kind, label: kind === "keyword" ? "Neues Stichwort" : "Notiz", text: "", ...position };
}

export function toggleMindMapEdge(map: LearningMindMap, from: string, to: string): LearningMindMap {
  if (from === to || !map.nodes.some((node) => node.id === from) || !map.nodes.some((node) => node.id === to)) return map;
  const matches = (edge: LearningMindMap["edges"][number]) => edge.from === from && edge.to === to || edge.from === to && edge.to === from;
  return { ...map, edges: map.edges.some(matches) ? map.edges.filter((edge) => !matches(edge)) : [...map.edges, { from, to }] };
}

export function removeMindMapNode(map: LearningMindMap, nodeId: string): LearningMindMap {
  return { ...map, nodes: map.nodes.filter((node) => node.id !== nodeId), edges: map.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId) };
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
    const node = { ...createMindMapNode("keyword", { x: headings.length * 300, y: row++ * 112 }), label, sourceText: block.text };
    map.nodes.push(node); map.edges.push({ from: parent.id, to: node.id });
    if (level !== null) headings.push({ level, node });
    else for (const heading of headings.slice(1)) heading.node.sourceText += `\n\n${block.text}`;
  }
  root.y = Math.max(0, (row - 1) * 56);
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
