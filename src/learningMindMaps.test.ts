import "fake-indexeddb/auto";
import { fakeLearningCloud, freshDevice as resetDevice } from "../tests/support/fakeLearningCloud.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { createLearningSummary, createSummarySettings } from "./learningSummaries.ts";
import { clearMindMap, stepMindMapSummary, copyMindMapNodes, mindMapLimitError, mindMapNeighbor, pasteMindMapNodes, addMindMapFromSummary, mindMapSummaryTree, replaceMindMapFromSummary, connectMindMapElements, addMindMapRelativeNode, createMindMapBoundary, createMindMapSummary, editMindMapNode, mindMapMembersRect, mindMapBoundaryRect, mindMapNodeColor, mindMapNodeRect, mindMapSummaryRect, moveMindMapElement, removeMindMapElement, reparentMindMapNode, resizeMindMapSummary, appendMindMap, createLearningMindMap, createMindMapNode, loadInfinityMindMap, mindMapFromSummary, mindMapNodeSource, readLearningMindMap, storeMindMapImages, loadMindMapImages, removeMindMapNode, saveLearningMindMap, toggleMindMapEdge } from "./learningMindMaps.ts";

const IMAGE_ID = "0123456789abcdef0123456789abcdef01234567";
const local = (userId = `mindmap-test-${crypto.randomUUID()}`) => ({ userId, cloud: null });
const freshDevice = (userId: string) => resetDevice(`core.learningMindMaps.v2.${encodeURIComponent(userId)}`);
const png = (...bytes: number[]) => new File([new Uint8Array(bytes)], "bild.png", { type: "image/png" });

test("Zusammenfassung wird hierarchisch verknüpft; Textstellen bleiben exakt und unabhängig erhalten", () => {
  const summary = { ...createLearningSummary("deck", "Energie", createSummarySettings()), html: "<h2>ATP</h2><p>ATP und ADP sind Energieträger.</p><h3>Aufbau</h3><ul><li>Drei Phosphatgruppen.</li></ul><h2>ADP</h2><p>Zwei Phosphatgruppen.</p>" };
  const map = mindMapFromSummary(summary), byLabel = new Map(map.nodes.map((node) => [node.label, node]));
  assert.equal(map.nodes.length, 7);
  assert.equal(map.nodes.filter((node) => node.parentId).length, 6);
  assert.ok(byLabel.get("Aufbau")!.parentId === byLabel.get("ATP")!.id);
  assert.ok(byLabel.get("ADP")!.parentId === map.nodes[0].id);
  assert.equal(byLabel.get("ATP und ADP sind Energieträger.")!.sourceText, "ATP und ADP sind Energieträger.");
  assert.equal(byLabel.get("ATP")!.sourceText, undefined);
  assert.equal(byLabel.get("Drei Phosphatgruppen.")!.parentId, byLabel.get("Aufbau")!.id);
  summary.html = "<p>Geänderte Fassung</p>";
  assert.match(map.source!.text, /ATP und ADP/);
  assert.equal(map.source!.summaryId, summary.id);
  assert.throws(() => mindMapFromSummary({ ...summary, html: "<p><br></p>" }), /keinen Text/);
});

test("Absätze ohne Überschriften und langer Text verlieren keine Textstellen", () => {
  const passage = "Ein sehr langer Satz. ".repeat(60);
  const map = mindMapFromSummary({ ...createLearningSummary("deck", "Text", createSummarySettings()), html: `<p>${passage}</p><p>Zweiter Absatz.</p>` });
  assert.equal(map.nodes[1].sourceText, passage.trim());
  assert.ok(map.nodes[1].label.length <= 70);
  assert.equal(map.nodes[1].parentId, map.nodes[0].id);
  assert.equal(map.nodes[2].sourceText, "Zweiter Absatz.");
});

test("manuell bearbeitete Mischformen erhalten freie Texte, div-Absätze und verschachtelte Listen", () => {
  const map = mindMapFromSummary({ ...createLearningSummary("deck", "Manuell", createSummarySettings()), html: "Einleitung.<h2>Thema</h2><div>Erster Absatz.</div>Freier Nachsatz.<ul><li>Punkt eins.<ul><li>Unterpunkt.</li></ul></li><li>Punkt zwei.</li></ul>Ende." });
  assert.deepEqual(map.nodes.slice(1).map((node) => node.sourceText), ["Einleitung.", undefined, "Erster Absatz.", "Freier Nachsatz.", "Punkt eins.", "Unterpunkt.", "Punkt zwei.", "Ende."]);
  assert.ok(map.nodes.slice(3).every((node) => node.parentId === map.nodes.find((item) => item.label === "Thema")!.id));
});

test("freie Graphen erlauben neue Querverbindungen und lösen sie unabhängig von ihrer Richtung", () => {
  const map = createLearningMindMap("deck", "Frei");
  map.nodes = [createMindMapNode("keyword", { x: -100, y: 250 }), createMindMapNode("text", { x: 700, y: -300 })];
  const linked = toggleMindMapEdge(map, map.nodes[0].id, map.nodes[1].id);
  assert.equal(linked.edges.length, 1);
  assert.equal(toggleMindMapEdge(linked, map.nodes[1].id, map.nodes[0].id).edges.length, 0);
  assert.equal(toggleMindMapEdge(map, map.nodes[0].id, map.nodes[0].id), map);
  assert.equal(toggleMindMapEdge(map, map.nodes[0].id, "missing"), map);
  assert.equal(removeMindMapNode(linked, map.nodes[0].id).edges.length, 0);
  assert.equal(map.nodes.length, 2);
});

test("Je Stapel genau eine Map: Notizen, Positionen und Zeichnungen bleiben pro Konto und Stapel erhalten", async () => {
  const account = local(), map = createLearningMindMap("deck", "Meine Map");
  map.nodes.push({ ...createMindMapNode("text", { x: -2000, y: 4000 }), text: "Eigene freie Notiz" });
  map.strokes.push({ id: "ink", points: [{ x: -20, y: 5 }, { x: 20, y: -5 }] });
  const { map: saved } = await saveLearningMindMap(account, map);
  assert.deepEqual(await loadInfinityMindMap(account, "deck"), { map: saved, unsynced: false, overwritten: false });
  for (const [owner, deck] of [[account, "other-deck"], [local(`${account.userId}-other`), "deck"]] as const) {
    const fresh = (await loadInfinityMindMap(owner, deck)).map;
    assert.deepEqual([fresh.infinity, fresh.nodes.length, fresh.deckId], [true, 0, deck]);
  }
  await assert.rejects(saveLearningMindMap(account, { ...map, title: " " }));
  assert.deepEqual((await loadInfinityMindMap(account, "deck")).map, saved);
  await assert.rejects(saveLearningMindMap(local(""), map), /Konto/);
});

test("ungültige Payloads und Verbindungen werden vor dem Speichern abgelehnt", () => {
  const map = createLearningMindMap("deck", "Map"), node = createMindMapNode("keyword", { x: 0, y: 0 });
  assert.throws(() => readLearningMindMap({ ...map, nodes: [node, node] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, x: Infinity }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, sourceText: "Ohne Quelle" }] }));
  assert.throws(() => readLearningMindMap({ ...map, sources: {}, nodes: [{ ...node, sourceId: "toString" }] }));
  assert.throws(() => readLearningMindMap({ ...map, edges: [{ from: "missing", to: "other" }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [node], edges: [{ from: node.id, to: node.id }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [node], unexpected: true }));
  assert.equal(map.connectionColor, "node"); assert.throws(() => readLearningMindMap({ ...map, connectionColor: "unknown" }), /ungültig/);
});

test("mehrere Zusammenfassungen behalten ihre eigenen Quellen und können wiederholt ergänzt werden", () => {
  const make = (title: string) => mindMapFromSummary({ ...createLearningSummary("deck", title, createSummarySettings()), html: `<p>${title} Quelle.</p>` });
  const first = make("ATP"), second = make("ADP"), map = appendMindMap(appendMindMap(createLearningMindMap("deck", "Infinity Map"), first), second);
  assert.equal(mindMapNodeSource(map, map.nodes.find((node) => node.label === "ATP Quelle.")!)!.title, "ATP");
  assert.equal(mindMapNodeSource(map, map.nodes.find((node) => node.label === "ADP Quelle.")!)!.title, "ADP");
  assert.equal(appendMindMap(map, second).nodes.length, 6);
  const withoutFirst = map.nodes.filter((node) => node.sourceId === map.nodes[0].sourceId).reduce((current, node) => removeMindMapNode(current, node.id), map);
  assert.equal(Object.keys(withoutFirst.sources!).length, 1);
  assert.throws(() => appendMindMap(map, { ...second, deckId: "other" }), /anderen Stapel/);
});

test("Bild-, Kasten- und Stiftoptionen werden validiert; Linien ohne Farbe und Stärke bleiben lesbar", async () => {
  const map = createLearningMindMap("deck", "Map"), node = createMindMapNode("keyword", { x: 0, y: 0 });
  const image = { id: IMAGE_ID, name: "Bild.png" };
  assert.doesNotThrow(() => readLearningMindMap({ ...map, nodes: [{ ...node, color: "yellow", images: [image] }], strokes: [{ id: "ink", color: "blue", width: 2, points: [{ x: 0, y: 0 }] }] }));
  for (const id of ["image", "javascript:alert(1)", IMAGE_ID.toUpperCase()]) assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, images: [{ ...image, id }] }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, color: "unknown" }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, images: [image, image] }] }));
  assert.throws(() => readLearningMindMap({ ...map, strokes: [{ id: "ink", width: 99, points: [{ x: 0, y: 0 }] }] }));
  await assert.rejects(storeMindMapImages(local("images"), [new File(["svg"], "image.svg", { type: "image/svg+xml" })]), /PNG/);
  await assert.rejects(storeMindMapImages(local("images"), [new File([new Uint8Array(20_000_001)], "huge.png", { type: "image/png" })]), /20 MB/);
  await assert.rejects(storeMindMapImages(local("images"), [new File([new Uint8Array(2_000_001)], "big.gif", { type: "image/gif" })]), /2 MB/);
});

test("Bilder liegen einmal je Inhalt im Bildspeicher; Kopien teilen sie und eine Map fasst höchstens zehn", async () => {
  const account = local(), bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const [first] = await storeMindMapImages(account, [new File([bytes], "a.png", { type: "image/png" })]);
  const [again] = await storeMindMapImages(account, [new File([bytes], "b.png", { type: "image/png" })]);
  assert.equal(first.id, Buffer.from(await crypto.subtle.digest("SHA-1", bytes)).toString("hex"));
  assert.equal(again.id, first.id);
  assert.deepEqual(new Uint8Array(await (await loadMindMapImages(account, [first.id, IMAGE_ID])).get(first.id)!.arrayBuffer()), bytes);
  assert.equal((await loadMindMapImages(account, [IMAGE_ID])).size, 0);
  const { map, a } = tree(), withImage = editMindMapNode(map, a.id, { images: [first] });
  const pasted = pasteMindMapNodes(withImage, copyMindMapNodes(withImage, [a.id]));
  assert.deepEqual(pasted.map.nodes.find((node) => node.id === pasted.ids[0])!.images, [first]);
  const ids = Array.from({ length: 11 }, (_, index) => index.toString(16).padStart(40, "0"));
  const full = { ...map, nodes: map.nodes.map((node, index) => index < 3 ? { ...node, images: ids.slice(index * 4, index * 4 + 4).map((id) => ({ id, name: "Bild.png" })) } : node) };
  assert.equal(mindMapLimitError(full), "Eine Mindmap umfasst höchstens 10 Bilder (jetzt 11).");
  assert.equal(mindMapLimitError({ ...full, nodes: full.nodes.map((node) => ({ ...node, images: node.images?.filter((item) => item.id !== ids[10]) })) }), null);
});

test("nicht mehr verwendete Bilder werden nach einem Tag beim Öffnen freigegeben", async () => {
  const account = local();
  const [used, unused] = await storeMindMapImages(account, [new File([new Uint8Array([1])], "a.png", { type: "image/png" }), new File([new Uint8Array([2])], "b.png", { type: "image/png" })]);
  const { map: surface } = await loadInfinityMindMap(account, "deck"), node = createMindMapNode("text", { x: 0, y: 0 });
  await saveLearningMindMap(account, { ...surface, nodes: [{ ...node, images: [used] }] });
  await loadInfinityMindMap(account, "deck");
  assert.equal((await loadMindMapImages(account, [used.id, unused.id])).size, 2);
  await loadInfinityMindMap(account, "deck", Date.now() + 25 * 60 * 60 * 1000);
  assert.deepEqual([...(await loadMindMapImages(account, [used.id, unused.id])).keys()], [used.id]);
});


function tree() {
  let map = createLearningMindMap("deck", "Baum");
  const root = addMindMapRelativeNode(map, null, "root"); map = root.map;
  const a = addMindMapRelativeNode(map, root.node.id, "child"); map = a.map;
  const b = addMindMapRelativeNode(map, a.node.id, "sibling");
  // Existing maps may have several main branches on the same side.
  b.node = { ...b.node, side: a.node.side, x: a.node.x, y: a.node.y + mindMapNodeRect(a.node).height + 32 };
  map = { ...b.map, nodes: b.map.nodes.map((node) => node.id === b.node.id ? b.node : node) };
  const c = addMindMapRelativeNode(map, a.node.id, "child"); map = c.map;
  return { map, root: root.node, a: a.node, b: b.node, c: c.node };
}

test("Neue Hauptäste verteilen Kinder- und Geschwisteraktionen auf alle vier Bereiche", () => {
  for (const relation of ["child", "sibling"] as const) {
    const root = addMindMapRelativeNode(createLearningMindMap("deck", "Verteilung"), null, "root", "text", { x: 800, y: 500 });
    let map = root.map, anchor = root.node.id;
    for (let i = 0; i < 12; i++) {
      const before = map.nodes;
      const added = addMindMapRelativeNode(map, i === 0 || relation === "child" ? root.node.id : anchor, i === 0 ? "child" : relation, i % 3 ? "keyword" : "text");
      assert.deepEqual(added.map.nodes.slice(0, before.length), before);
      map = added.map; anchor = added.node.id;
      assert.equal(added.node.parentId, root.node.id);
      const r = mindMapNodeRect(added.node);
      for (const existing of before) {
        const b = mindMapNodeRect(existing);
        assert.ok(r.x + r.width + 16 <= b.x || b.x + b.width + 16 <= r.x || r.y + r.height + 16 <= b.y || b.y + b.height + 16 <= r.y);
      }
      const branches = map.nodes.filter((node) => node.parentId === root.node.id);
      const right = branches.filter((node) => node.x > root.node.x), left = branches.filter((node) => node.x < root.node.x);
      assert.ok(Math.abs(right.length - left.length) <= 1);
      for (const side of [right, left]) assert.ok(Math.abs(side.filter((node) => node.y < root.node.y).length - side.filter((node) => node.y > root.node.y).length) <= 1);
    }
  }
});

test("Manuell verschobene Äste bestimmen die neue Unterknoten- und Geschwisterrichtung", () => {
  const { map, root, a, c } = tree();
  const moved = editMindMapNode(map, a.id, { x: root.x - 300, y: root.y + 200 });
  const child = addMindMapRelativeNode(moved, a.id, "child");
  assert.equal(child.node.side, "left"); assert.ok(child.node.x < root.x - 300);
  const detail = editMindMapNode(moved, c.id, { x: root.x - 600, y: root.y + 400 });
  const sibling = addMindMapRelativeNode(detail, c.id, "sibling");
  assert.equal(sibling.node.side, "left"); assert.ok(sibling.node.y > root.y + 400);
  const above = editMindMapNode(detail, c.id, { y: root.y - 400 });
  assert.ok(addMindMapRelativeNode(above, c.id, "sibling").node.y < root.y - 400);
});

test("Hierarchie, Plus-Aktionen und Astfarben lassen manuelle Positionen unverändert", () => {
  const { map, root, a, b, c } = tree();
  assert.equal(a.parentId, root.id); assert.equal(b.parentId, root.id); assert.equal(c.parentId, a.id);
  assert.equal(b.side, a.side);
  assert.notEqual(mindMapNodeColor(map, a).color, mindMapNodeColor(map, b).color);
  assert.equal(mindMapNodeColor(map, c).color, mindMapNodeColor(map, a).color);
  assert.equal(mindMapNodeColor(map, c).depth, 2);
  const next = addMindMapRelativeNode(map, c.id, "child");
  assert.deepEqual(next.map.nodes.slice(0, map.nodes.length), map.nodes);
  assert.throws(() => reparentMindMapNode(map, root.id, c.id), /zyklische/);
  const reparented = reparentMindMapNode(map, c.id, b.id);
  assert.equal(reparented.nodes.find((n) => n.id === c.id)!.parentId, b.id);
  assert.equal(mindMapNodeColor(reparented, reparented.nodes.find((n) => n.id === c.id)!).color, mindMapNodeColor(reparented, b).color);
  assert.equal(reparented.nodes.find((n) => n.id === c.id)!.x, c.x);
  const removed = removeMindMapNode(map, a.id);
  assert.equal(removed.nodes.find((n) => n.id === c.id)!.parentId, root.id);
  assert.doesNotThrow(() => readLearningMindMap(removed));
});

test("Direkte Textbearbeitung sanitisiert HTML und hält Klartext, Bilder und benutzerdefinierte Farbe", () => {
  const { map, a } = tree();
  const next = editMindMapNode(map, a.id, { html: '<p>Mein <strong>Text</strong>.</p><script>secret()</script><img src="https://example.com/image">', color: "#123abc" });
  const saved = readLearningMindMap(next).nodes.find((n) => n.id === a.id)!;
  assert.equal(saved.text, "Mein Text."); assert.match(saved.html!, /<strong>Text<\/strong>/);
  assert.doesNotMatch(saved.html!, /script|secret|img|example/);
  assert.equal(saved.color, "#123abc");
});

test("Zusammenfassung umfasst einen zusammenhängenden Geschwisterbereich und passt sich an", () => {
  const { map, a, b } = tree(), extra = addMindMapRelativeNode(map, b.id, "sibling");
  const result = createMindMapSummary(extra.map, [a.id, b.id]);
  assert.equal(result.map.summaries[0].nodeIds.length, 2);
  const current = mindMapSummaryRect(result.map, result.map.summaries[0]);
  assert.deepEqual(resizeMindMapSummary(result.map, result.id, "end", current.y + current.height + 5).summaries[0].nodeIds, result.map.summaries[0].nodeIds);
  const resized = resizeMindMapSummary(result.map, result.id, "end", extra.node.y + mindMapNodeRect(extra.node).height);
  assert.equal(resized.summaries[0].nodeIds.length, 3);
  const reduced = resizeMindMapSummary(resized, result.id, "end", a.y);
  assert.equal(reduced.summaries[0].nodeIds.length, 1);
  const child = addMindMapRelativeNode(resized, resized.summaries[0].nodeId, "child");
  const removed = removeMindMapElement(child.map, "summary", result.id);
  for (const id of [a.id, b.id, extra.node.id, child.node.id]) assert.ok(removed.nodes.some((n) => n.id === id));
  assert.equal(removed.summaries.length, 0); assert.doesNotThrow(() => readLearningMindMap(removed));
  assert.throws(() => createMindMapSummary(map, [a.id]), /mindestens zwei/);
  assert.throws(() => reparentMindMapNode(result.map, result.map.summaries[0].nodeId, a.id), /eigenen Klammerbereichs/);
  const changed = reparentMindMapNode(resized, b.id, a.id);
  assert.ok(!changed.summaries[0].nodeIds.includes(b.id));
});

test("Umrandung folgt ihrem Inhalt und Entfernen löscht keine Knoten", () => {
  const { map, a, b } = tree(), result = createMindMapBoundary(map, [a.id, b.id]);
  const before = mindMapMembersRect(result.map, [a.id, b.id]);
  const next = moveMindMapElement(result.map, "node", b.id, { x: 200, y: 100 });
  const after = mindMapMembersRect(next, [a.id, b.id]);
  assert.ok(after.width > before.width); assert.ok(after.height > before.height);
  const removed = removeMindMapElement(next, "boundary", result.id);
  assert.equal(removed.nodes.length, map.nodes.length); assert.equal(removed.boundaries.length, 0);
});

test("Hierarchie, Zusammenfassungen, Umrandungen und Erscheinungsbild überstehen Speicherung und Zusammenführung", async () => {
  const { map, a, b } = tree(), summary = createMindMapSummary(map, [a.id, b.id]);
  const boundary = createMindMapBoundary(summary.map, [a.id, b.id]);
  boundary.map.boundaries[0] = { ...boundary.map.boundaries[0], shape: "ellipse", label: "Mein Ast", fillColor: "#ff0011", opacity: 0.3, strokeWidth: 8 };
  const user = local(), { map: saved } = await saveLearningMindMap(user, boundary.map);
  assert.deepEqual((await loadInfinityMindMap(user, "deck")).map, saved);
  const merged = appendMindMap(createLearningMindMap("deck", "Infinity"), saved);
  assert.equal(merged.summaries.length, 1); assert.equal(merged.boundaries[0].shape, "ellipse");
  assert.doesNotThrow(() => readLearningMindMap(merged));
  for (const corrupt of [{ ...saved, boundaries: [{ ...saved.boundaries[0], strokeWidth: 5 }] }, { ...saved, summaries: [{ ...saved.summaries[0], nodeIds: ["missing"] }] }]) assert.throws(() => readLearningMindMap(corrupt));
});

test("größere Karten rücken automatisch platzierte Karten nach; manuell gesetzte Positionen bleiben erhalten", async () => {
  const { map, a, b } = tree();
  const grown = editMindMapNode(map, a.id, { kind: "text", images: [{ id: IMAGE_ID, name: "Bild.png" }] });
  const moved = grown.nodes.find((node) => node.id === b.id)!;
  assert.ok(moved.y >= a.y + mindMapNodeRect(grown.nodes.find((node) => node.id === a.id)!).height + 32);
  assert.equal(grown.nodes.find((node) => node.id === a.id)!.y, a.y);
  const manual = moveMindMapElement(map, "node", b.id, { x: 0, y: 20 });
  const preserved = editMindMapNode(manual, a.id, { kind: "text", images: [{ id: IMAGE_ID, name: "Bild.png" }] });
  assert.deepEqual(preserved.nodes.find((node) => node.id === b.id), manual.nodes.find((node) => node.id === b.id));
  const coordinate = editMindMapNode(map, b.id, { y: 1000 });
  assert.equal(coordinate.nodes.find((node) => node.id === b.id)!.autoPosition, false);
  const account = local(), { map: saved } = await saveLearningMindMap(account, grown);
  assert.deepEqual((await loadInfinityMindMap(account, "deck")).map.nodes, saved.nodes);
  const legacy = { ...map, nodes: map.nodes.map(({ autoPosition: _auto, ...node }) => node) };
  assert.deepEqual(editMindMapNode(legacy, a.id, { kind: "text" }).nodes.find((node) => node.id === b.id), legacy.nodes.find((node) => node.id === b.id));
});


test("Astfarben beginnen sanft, werden kräftiger und Zusammenfassungsknoten bleiben neutral", () => {
  const { map, root, a, b, c } = tree();
  assert.equal(mindMapNodeColor(map, root).color, "default");
  assert.ok(mindMapNodeColor(map, c).strength > mindMapNodeColor(map, a).strength);
  const result = createMindMapSummary(map, [a.id, b.id]), id = result.map.summaries[0].nodeId;
  const colored = editMindMapNode(result.map, id, { color: "red" });
  assert.deepEqual(mindMapNodeColor(colored, colored.nodes.find((n) => n.id === id)!), { color: "default", depth: 0, strength: 0 });
  assert.equal(createMindMapNode("text", { x: 0, y: 0 }).label, "Neue Notiz");
});

test("Lose Karten werden normale Äste; Verknüpfungen bestehender Äste bleiben separat", () => {
  let map = createLearningMindMap("deck", "Infinity Map");
  const main = addMindMapRelativeNode(map, null, "root"); map = main.map;
  const branch = addMindMapRelativeNode(map, main.node.id, "child"); map = branch.map;
  const loose = addMindMapRelativeNode(map, null, "root", "text", { x: 900, y: 500 }); map = loose.map;
  const attached = connectMindMapElements(map, loose.node.id, branch.node.id);
  const node = attached.nodes.find((item) => item.id === loose.node.id)!;
  assert.equal(node.parentId, branch.node.id);
  assert.equal(node.kind, "text");
  assert.equal(mindMapNodeColor(attached, node).color, mindMapNodeColor(attached, branch.node).color);
  assert.equal(attached.edges.length, 0);
  assert.notEqual(node.x, loose.node.x);
  const sibling = addMindMapRelativeNode(attached, branch.node.id, "sibling");
  const cross = connectMindMapElements(sibling.map, node.id, sibling.node.id);
  assert.equal(cross.edges.length, 1);
  assert.equal(cross.nodes.find((item) => item.id === node.id)!.parentId, branch.node.id);
  const detached = connectMindMapElements(attached, node.id, branch.node.id);
  assert.equal(detached.nodes.find((item) => item.id === node.id)!.parentId, undefined);
  assert.equal(readLearningMindMap(detached).nodes.length, 3);
});

test("Angehängte Unterbäume behalten Inhalt und relative manuelle Positionen", () => {
  let map = createLearningMindMap("deck", "Infinity Map");
  const main = addMindMapRelativeNode(map, null, "root"); map = main.map;
  const child = addMindMapRelativeNode(map, main.node.id, "child"); map = child.map;
  const loose = addMindMapRelativeNode(map, null, "root", "text", { x: 1400, y: 800 }); map = loose.map;
  const detail = addMindMapRelativeNode(map, loose.node.id, "child"); map = editMindMapNode(detail.map, detail.node.id, { html: "<p>Bleibt erhalten</p>", x: 1715, y: 910 });
  const attached = connectMindMapElements(map, main.node.id, loose.node.id);
  const a = attached.nodes.find((item) => item.id === loose.node.id)!, b = attached.nodes.find((item) => item.id === detail.node.id)!;
  assert.equal(a.parentId, main.node.id);
  assert.equal(b.parentId, loose.node.id);
  assert.equal(b.x - a.x, 315); assert.equal(b.y - a.y, 110);
  assert.equal(b.text, "Bleibt erhalten"); assert.equal(b.autoPosition, false);
  assert.equal(readLearningMindMap(attached).nodes.length, 4);
});

test("Freier Flächentext nutzt Bearbeitung, Bewegung, Löschung und lokale Persistenz", async () => {
  let map = createLearningMindMap("free-text-deck", "Infinity Map");
  const created = addMindMapRelativeNode(map, null, "root", "freeText", { x: 100, y: 200 });
  map = editMindMapNode(created.map, created.node.id, { html: '<p><b>Direkt auf der Fläche</b></p>' });
  assert.throws(() => addMindMapRelativeNode(map, created.node.id, "child"), /keine Unterknoten/);
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...map.nodes[0], parentId: map.nodes[0].id }] }), /Flächentext gehört nicht/);
  assert.equal(map.nodes[0].text, "Direkt auf der Fläche");
  map = moveMindMapElement(map, "node", created.node.id, { x: 30, y: -20 });
  const account = local();
  await saveLearningMindMap(account, map);
  const { map: loaded } = await loadInfinityMindMap(account, "free-text-deck");
  assert.equal(loaded.nodes[0].kind, "freeText");
  assert.equal(loaded.nodes[0].x, 130); assert.equal(loaded.nodes[0].y, 180);
  assert.match(loaded.nodes[0].html!, /<b>/);
  assert.equal(removeMindMapElement(loaded, "node", loaded.nodes[0].id).nodes.length, 0);
});

test("Fette Stichworte werden Kartentitel, Belegzeilen werden nicht zu Karten", () => {
  const summary = { ...createLearningSummary("deck", "Energie", createSummarySettings()), html: "<h2>Zellatmung</h2><ul><li><strong>ATP</strong>: Universeller Energieträger der Zelle.</li></ul><p><small>Grundlage: Biologie · Was ist ATP?</small></p>" };
  const map = mindMapFromSummary(summary);
  assert.deepEqual(map.nodes.map((node) => node.label), ["Energie", "Zellatmung", "ATP"]);
  assert.equal(map.nodes[2].sourceText, "Universeller Energieträger der Zelle.");
  assert.equal(map.nodes[2].text, "Universeller Energieträger der Zelle.");
});

test("Jeder Ast endet mit einer Textkarte; übergeordnete Karten behalten ihren Abschnittstext eingeklappt", () => {
  const passage = "Eine ausführliche Erklärung zur Energiegewinnung, die als Text zur Abschnittskarte gehört und vollständig erhalten bleibt.";
  const summary = { ...createLearningSummary("deck", "Energie", createSummarySettings()), html: `<h2>Zellatmung</h2><p>${passage}</p><h3>Glykolyse</h3><ul><li><strong>ATP</strong>: Energie und Transport.</li></ul><h2>Gärung</h2><p>${passage}</p><h2>Offene Frage</h2>` };
  const map = mindMapFromSummary(summary);
  for (const node of map.nodes) {
    assert.equal(node.kind, map.nodes.some((child) => child.parentId === node.id) ? "keyword" : "text", node.label);
    assert.equal(node.text, node.sourceText ?? "", node.label);
  }
  const section = map.nodes.find((node) => node.label === "Zellatmung")!;
  assert.equal(section.text, passage);
  const leaf = map.nodes.find((node) => node.label === "ATP")!;
  assert.equal(leaf.text, "Energie und Transport.");
  const edited = editMindMapNode(map, leaf.id, { html: "<p>Eigener Text.</p>" });
  assert.equal(edited.nodes.find((node) => node.id === leaf.id)!.text, "Eigener Text.");
  assert.equal(edited.nodes.find((node) => node.id === leaf.id)!.sourceText, "Energie und Transport.");
  for (const a of map.nodes) for (const b of map.nodes) {
    if (a.id === b.id) continue;
    const r = mindMapNodeRect(a), s = mindMapNodeRect(b);
    assert.ok(r.x + r.width <= s.x || s.x + s.width <= r.x || r.y + r.height <= s.y || s.y + s.height <= r.y);
  }
});

test("Neu erzeugen erkennt Bearbeitungen und ersetzt nur den erzeugten Baum an seiner Stelle", () => {
  const summary = { ...createLearningSummary("deck", "Energie", createSummarySettings()), html: "<h2>Zellatmung</h2><p>ATP liefert Energie.</p>" };
  const manual = addMindMapRelativeNode(createLearningMindMap("deck", "Infinity Map"), null, "root", "keyword", { x: -900, y: 0 }).map;
  const generated = addMindMapFromSummary(manual, summary);
  const tree = mindMapSummaryTree(generated, summary.id)!;
  assert.deepEqual([tree.cards, tree.edited], [3, false]);
  const root = generated.nodes.find((node) => node.label === "Energie")!;
  const edited = addMindMapRelativeNode(editMindMapNode(generated, root.id, { x: root.x + 40 }), root.id, "child").map;
  assert.deepEqual([mindMapSummaryTree(edited, summary.id)!.cards, mindMapSummaryTree(edited, summary.id)!.edited], [4, true]);
  const replaced = replaceMindMapFromSummary(edited, tree.sourceId, { ...summary, html: "<h2>Gärung</h2>" });
  assert.deepEqual(replaced.nodes.map((node) => node.label).sort(), ["Energie", "Gärung", "Neues Stichwort"]);
  assert.equal(Object.keys(replaced.sources ?? {}).length, 1);
  assert.equal(replaced.nodes.find((node) => node.label === "Energie")!.x, root.x + 40);
  assert.equal(mindMapSummaryTree(replaced, summary.id)!.edited, false);
});

test("Absätze werden Abschnittstext, Hinweise keine Äste; Hauptäste verteilt und belegte Querbezüge verbunden", () => {
  const long = "Die Zellatmung gewinnt aus Glucose Energie und liefert vollständig etwa 30 bis 32 ATP je Glucose.";
  const base = createLearningSummary("deck", "Energiestoffwechsel", createSummarySettings());
  const summary = { ...base, html: `<h2>Zellatmung</h2><p>${long}</p><ul><li><strong>Glykolyse</strong>: Im Cytoplasma, 2 ATP.</li></ul><h2>Gärung</h2><ul><li><strong>Hefe</strong>: Ethanol und CO2.</li></ul><h2>Hinweise zum Material</h2><p>Die Reaktionsfolge fehlt.</p>`,
    generation: { model: "openai/gpt-6-luna", privacyMode: "zdr" as const, promptVersion: "learning-summary-v3" as const, generatedAt: base.createdAt, materialUnits: 3, relations: [{ from: "Glykolyse", to: "hefe" }, { from: "Unbekannt", to: "Hefe" }] } };
  const map = mindMapFromSummary(summary), byLabel = new Map(map.nodes.map((node) => [node.label, node]));
  assert.deepEqual(map.nodes.map((node) => node.label), ["Energiestoffwechsel", "Zellatmung", "Gärung", "Glykolyse", "Hefe"]);
  assert.equal(byLabel.get("Zellatmung")!.sourceText, long);
  assert.equal(byLabel.get("Energiestoffwechsel")!.sourceText, undefined);
  assert.ok(Math.sign(byLabel.get("Zellatmung")!.x) !== Math.sign(byLabel.get("Gärung")!.x));
  assert.deepEqual(map.edges, [{ from: byLabel.get("Glykolyse")!.id, to: byLabel.get("Hefe")!.id }]);
});

test("Pfeiltasten-Navigation folgt der Astrichtung zu Eltern und Kindern und den Geschwistern nach Lage", () => {
  const { map, root, a, b, c } = tree();
  assert.equal(mindMapNeighbor(map, a.id, "ArrowLeft"), root.id);
  assert.equal(mindMapNeighbor(map, a.id, "ArrowRight"), c.id);
  assert.equal(mindMapNeighbor(map, a.id, "ArrowDown"), b.id);
  assert.equal(mindMapNeighbor(map, b.id, "ArrowUp"), a.id);
  assert.equal(mindMapNeighbor(map, c.id, "ArrowLeft"), a.id);
  assert.ok([a.id, b.id].includes(mindMapNeighbor(map, root.id, "ArrowRight")!));
  assert.equal(mindMapNeighbor(map, c.id, "ArrowRight"), undefined);
});

test("Kopieren und Einfügen dupliziert Unterbäume samt Umrandung versetzt und lässt das Original unverändert", () => {
  const { map, root, a, c } = tree();
  const framed = createMindMapBoundary(map, [a.id, c.id]).map;
  const pasted = pasteMindMapNodes(framed, copyMindMapNodes(framed, [a.id]));
  assert.equal(pasted.map.nodes.length, framed.nodes.length + 2);
  assert.equal(pasted.ids.length, 1);
  const copy = pasted.map.nodes.find((node) => node.id === pasted.ids[0])!, copyChild = pasted.map.nodes.find((node) => node.parentId === copy.id)!;
  assert.deepEqual([copy.parentId, copy.x, copy.y, copy.label], [root.id, a.x + 40, a.y + 40, a.label]);
  assert.equal(copyChild.label, c.label);
  assert.equal(pasted.map.boundaries.length, 2);
  assert.deepEqual(pasted.map.boundaries[1].nodeIds.sort(), [copy.id, copyChild.id].sort());
  assert.deepEqual(pasted.map.nodes.slice(0, framed.nodes.length), framed.nodes);
});

test("Größengrenzen werden mit Grenze und aktuellem Wert gemeldet, beim Lesen wie beim Einfügen", () => {
  assert.equal(mindMapLimitError({ nodes: [], edges: [] }), null);
  assert.equal(mindMapLimitError({ nodes: new Array(2_001).fill(null) }), "Eine Mindmap umfasst höchstens 2.000 Karten und freie Texte (jetzt 2.001).");
  assert.match(mindMapLimitError({ boundaries: new Array(501).fill(null) })!, /500 Umrandungen \(jetzt 501\)/);
  const { map, a } = tree();
  assert.throws(() => readLearningMindMap({ ...map, edges: new Array(10_001).fill({ from: a.id, to: a.id }) }), /10.000 Querverbindungen/);
});

test("Klammerbereich lässt sich per Tastatur um je eine Geschwisterkarte vergrößern und verkleinern", () => {
  const { map, root } = tree();
  const third = addMindMapRelativeNode(map, root.id, "child").map;
  const siblings = third.nodes.filter((node) => node.parentId === root.id).sort((a, b) => a.y - b.y);
  const bracket = createMindMapSummary(third, [siblings[0].id, siblings[1].id]);
  const grown = stepMindMapSummary(bracket.map, bracket.id, 1);
  assert.equal(grown.summaries[0].nodeIds.length, bracket.map.summaries[0].nodeIds.length + 1);
  assert.deepEqual(stepMindMapSummary(grown, bracket.id, -1).summaries[0].nodeIds, bracket.map.summaries[0].nodeIds);
  const single = stepMindMapSummary(stepMindMapSummary(bracket.map, bracket.id, -1), bracket.id, -1);
  assert.equal(single.summaries[0].nodeIds.length, 1);
});


test("Fläche leeren entfernt alle Elemente und Quellen, behält Titel und Linienfarbe", () => {
  const summary = { ...createLearningSummary("deck", "ATP", createSummarySettings()), html: "<h2>Aufbau</h2><p>Drei Phosphate.</p>" };
  let map = addMindMapFromSummary({ ...createLearningMindMap("deck", "Map"), connectionColor: "gray" }, summary);
  const [first, second] = map.nodes;
  map = createMindMapBoundary(map, [first.id, second.id]).map;
  map = { ...map, strokes: [{ id: "ink", points: [{ x: 0, y: 0 }] }] };
  const cleared = clearMindMap(map);
  assert.deepEqual([cleared.nodes, cleared.edges, cleared.strokes, cleared.summaries, cleared.boundaries], [[], [], [], [], []]);
  assert.equal("sources" in cleared, false);
  assert.deepEqual([cleared.id, cleared.title, cleared.connectionColor], [map.id, "Map", "gray"]);
  assert.deepEqual(readLearningMindMap(cleared), cleared);
});

test("Online gespeicherte Maps und ihre Bilder erscheinen auf einem neuen Gerät; offline Gespeichertes folgt beim nächsten Öffnen", async () => {
  const cloud = fakeLearningCloud(), account = cloud.account(`mindmap-cloud-${crypto.randomUUID()}`), maps = cloud.table("learning_mind_maps");
  const [image] = await storeMindMapImages(account, [png(1, 2, 3)]), { map } = await loadInfinityMindMap(account, "deck");
  const withImage = { ...map, nodes: [{ ...createMindMapNode("text", { x: 0, y: 0 }), images: [image] }] };
  assert.deepEqual(await saveLearningMindMap(account, withImage), { map: withImage, unsynced: false, overwritten: false });
  assert.deepEqual([maps.get("deck")?.revision, cloud.objects.has(`${account.userId}/${image.id}`)], [1, true]);
  await freshDevice(account.userId);
  assert.deepEqual((await loadInfinityMindMap(account, "deck")).map, withImage);
  assert.deepEqual(new Uint8Array(await (await loadMindMapImages(account, [image.id])).get(image.id)!.arrayBuffer()), new Uint8Array([1, 2, 3]));
  cloud.state.offline = true;
  const [offlineImage] = await storeMindMapImages(account, [png(4, 5)]), changed = { ...withImage, nodes: [...withImage.nodes, { ...createMindMapNode("keyword", { x: 300, y: 0 }), images: [offlineImage] }] };
  assert.equal((await saveLearningMindMap(account, changed)).unsynced, true);
  assert.equal((await loadInfinityMindMap(account, "deck")).unsynced, true);
  cloud.state.offline = false;
  assert.deepEqual(await loadInfinityMindMap(account, "deck"), { map: changed, unsynced: false, overwritten: false });
  assert.deepEqual([maps.get("deck")?.revision, maps.get("deck")?.document.nodes.length, cloud.objects.has(`${account.userId}/${offlineImage.id}`)], [2, 2, true]);
});

test("Der zuletzt gespeicherte Stand gewinnt und meldet das Ersetzen; Bilder anderer Stapel bleiben online erhalten", async () => {
  const cloud = fakeLearningCloud(), account = cloud.account(`mindmap-conflict-${crypto.randomUUID()}`), maps = cloud.table("learning_mind_maps");
  const { map } = await loadInfinityMindMap(account, "deck");
  await saveLearningMindMap(account, map);
  Object.assign(maps.get("deck")!, { document: { ...map, title: "Anderes Gerät" }, revision: 2 });
  const mine = { ...map, title: "Dieses Gerät" };
  assert.deepEqual(await saveLearningMindMap(account, mine), { map: mine, unsynced: false, overwritten: true });
  assert.deepEqual([maps.get("deck")?.document.title, maps.get("deck")?.revision], ["Dieses Gerät", 3]);
  cloud.state.offline = true; await saveLearningMindMap(account, { ...mine, title: "Offline" }); cloud.state.offline = false;
  Object.assign(maps.get("deck")!, { document: { ...map, title: "Wieder anderes Gerät" }, revision: 4 });
  assert.deepEqual(await loadInfinityMindMap(account, "deck"), { map: { ...mine, title: "Offline" }, unsynced: false, overwritten: true });
  const [shared, unused] = await storeMindMapImages(account, [png(7), png(8)]), other = (await loadInfinityMindMap(account, "other-deck")).map;
  await saveLearningMindMap(account, { ...other, nodes: [{ ...createMindMapNode("text", { x: 0, y: 0 }), images: [shared] }] });
  await freshDevice(account.userId);
  await storeMindMapImages(account, [png(7), png(8)]);
  await loadInfinityMindMap(account, "deck", Date.now() + 25 * 60 * 60 * 1000);
  assert.deepEqual([cloud.objects.has(`${account.userId}/${shared.id}`), cloud.objects.has(`${account.userId}/${unused.id}`)], [true, false]);
});
