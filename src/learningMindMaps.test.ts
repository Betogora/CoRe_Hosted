import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createLearningSummary, createSummarySettings } from "./learningSummaries.ts";
import { copyMindMapNodes, mindMapLimitError, mindMapNeighbor, pasteMindMapNodes, addMindMapFromSummary, mindMapSummaryTree, replaceMindMapFromSummary, connectMindMapElements, addMindMapRelativeNode, createMindMapBoundary, createMindMapSummary, editMindMapNode, mindMapMembersRect, mindMapBoundaryRect, mindMapNodeColor, mindMapNodeRect, mindMapSummaryRect, moveMindMapElement, removeMindMapElement, reparentMindMapNode, resizeMindMapSummary, appendMindMap, createLearningMindMap, createMindMapNode, loadInfinityMindMap, loadLearningMindMaps, mindMapFromSummary, mindMapNodeSource, readLearningMindMap, readMindMapImages, removeMindMapNode, saveLearningMindMap, toggleMindMapEdge } from "./learningMindMaps.ts";

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

test("Mindmaps, Notizen, Positionen und Zeichnungen bleiben pro Konto und Stapel erhalten", async () => {
  const account = `mindmap-test-${crypto.randomUUID()}`, map = createLearningMindMap("deck", "Meine Map");
  map.nodes.push({ ...createMindMapNode("text", { x: -2000, y: 4000 }), text: "Eigene freie Notiz" });
  map.strokes.push({ id: "ink", points: [{ x: -20, y: 5 }, { x: 20, y: -5 }] });
  const saved = await saveLearningMindMap(account, map);
  assert.deepEqual(await loadLearningMindMaps(account, "deck"), [saved]);
  assert.deepEqual(await loadLearningMindMaps(account, "other-deck"), []);
  assert.deepEqual(await loadLearningMindMaps(`${account}-other`, "deck"), []);
  await assert.rejects(saveLearningMindMap(account, { ...map, title: " " }));
  assert.deepEqual(await loadLearningMindMaps(account, "deck"), [saved]);
  await assert.rejects(saveLearningMindMap("", map), /Konto/);
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
});

test("ein Stapel erhält auch bei parallelem Öffnen genau eine Infinity Map", async () => {
  const account = `infinity-${crypto.randomUUID()}`;
  const maps = await Promise.all([loadInfinityMindMap(account, "deck"), loadInfinityMindMap(account, "deck")]);
  assert.equal(maps[0].id, maps[1].id);
  assert.equal(maps[0].infinity, true);
  assert.equal((await loadLearningMindMaps(account, "deck")).length, 1);
  assert.notEqual((await loadInfinityMindMap(account, "other")).id, maps[0].id);
  assert.notEqual((await loadInfinityMindMap(`${account}-other`, "deck")).id, maps[0].id);
});

test("alte Mindmaps werden nebeneinander zusammengeführt; Quellen, Texte und Linien bleiben erhalten", async () => {
  const account = `migration-${crypto.randomUUID()}`;
  const summary = { ...createLearningSummary("deck", "ATP", createSummarySettings()), html: "<h2>Aufbau</h2><p>Drei Phosphate.</p>" };
  const first = mindMapFromSummary(summary), second = createLearningMindMap("deck", "Notizen");
  second.nodes = [{ ...createMindMapNode("text", { x: -900, y: -500 }), text: "Mein Text", color: "purple", images: [{ id: "img", name: "Bild.png", dataUrl: "data:image/png;base64,YQ==" }] }];
  second.strokes = [{ id: "stroke", color: "red", width: 8, points: [{ x: -950, y: -600 }, { x: -800, y: -500 }] }];
  await saveLearningMindMap(account, first); await saveLearningMindMap(account, second);
  const map = await loadInfinityMindMap(account, "deck");
  assert.equal(map.nodes.length, first.nodes.length + second.nodes.length);
  assert.equal(map.edges.length, first.edges.length);
  assert.equal(map.nodes.find((node) => node.text === "Mein Text")!.images![0].name, "Bild.png");
  assert.equal(mindMapNodeSource(map, map.nodes.find((node) => node.label === "Drei Phosphate.")!)!.summaryId, summary.id);
  const note = map.nodes.find((node) => node.text === "Mein Text")!, sourceNodes = map.nodes.filter((node) => node.sourceId);
  assert.ok(note.x > Math.max(...sourceNodes.map((node) => node.x + 220)) || note.x + 220 < Math.min(...sourceNodes.map((node) => node.x)));
  assert.equal(map.strokes[0].width, 8);
  assert.equal(map.strokes[0].points[1].x - map.strokes[0].points[0].x, 150);
  assert.deepEqual(await loadLearningMindMaps(account, "deck"), [map]);
  assert.deepEqual(await loadInfinityMindMap(account, "deck"), map);
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

test("zu große Migrationen brechen atomar ab und erhalten alle alten Mindmaps", async () => {
  const account = `migration-limit-${crypto.randomUUID()}`, first = createLearningMindMap("deck", "Erste"), second = createLearningMindMap("deck", "Zweite");
  first.nodes = Array.from({ length: 2000 }, (_, i) => createMindMapNode("keyword", { x: i, y: 0 }));
  second.nodes = [createMindMapNode("keyword", { x: 0, y: 0 })];
  await saveLearningMindMap(account, first); await saveLearningMindMap(account, second);
  await assert.rejects(loadInfinityMindMap(account, "deck"));
  assert.equal((await loadLearningMindMaps(account, "deck")).length, 2);
});

test("Bild-, Kasten- und Stiftoptionen werden validiert; alte Linien bleiben lesbar", async () => {
  const map = createLearningMindMap("deck", "Map"), node = createMindMapNode("keyword", { x: 0, y: 0 });
  const image = { id: "image", name: "Bild.png", dataUrl: "data:image/png;base64,YQ==" };
  assert.doesNotThrow(() => readLearningMindMap({ ...map, nodes: [{ ...node, color: "yellow", images: [image] }], strokes: [{ id: "ink", color: "blue", width: 2, points: [{ x: 0, y: 0 }] }] }));
  for (const dataUrl of ["javascript:alert(1)", "https://example.com/image.png", "data:image/svg+xml;base64,YQ=="]) assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, images: [{ ...image, dataUrl }] }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, color: "unknown" }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [{ ...node, images: [image, image] }] }));
  assert.throws(() => readLearningMindMap({ ...map, strokes: [{ id: "ink", width: 99, points: [{ x: 0, y: 0 }] }] }));
  await assert.rejects(readMindMapImages([new File(["svg"], "image.svg", { type: "image/svg+xml" })]), /PNG/);
  await assert.rejects(readMindMapImages([new File([new Uint8Array(2_000_001)], "big.png", { type: "image/png" })]), /2 MB/);
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
  const user = `elements-${crypto.randomUUID()}`, saved = await saveLearningMindMap(user, boundary.map);
  assert.deepEqual(await loadLearningMindMaps(user, "deck"), [saved]);
  const merged = appendMindMap(createLearningMindMap("deck", "Infinity"), saved);
  assert.equal(merged.summaries.length, 1); assert.equal(merged.boundaries[0].shape, "ellipse");
  assert.doesNotThrow(() => readLearningMindMap(merged));
  for (const corrupt of [{ ...saved, boundaries: [{ ...saved.boundaries[0], strokeWidth: 5 }] }, { ...saved, summaries: [{ ...saved.summaries[0], nodeIds: ["missing"] }] }]) assert.throws(() => readLearningMindMap(corrupt));
});

test("Maps aus der Zeit mit Zonen öffnen sich; Zonen und ihre Verbindungen entfallen, Karten und Linien bleiben", async () => {
  const { map, a, b } = tree();
  const legacy = { ...map, zones: [{ id: "zone_old", title: "Bereich", x: 0, y: 0, width: 400, height: 300, collapsed: true, autoSize: false, layer: 0 }],
    nodes: map.nodes.map((node) => node.id === a.id ? { ...node, zoneId: "zone_old" } : node),
    edges: [{ from: a.id, to: "zone_old" }, { from: a.id, to: b.id }],
    strokes: [{ id: "ink", zoneId: "zone_old", points: [{ x: 1, y: 2 }] }] };
  const opened = readLearningMindMap(legacy);
  assert.equal("zones" in opened, false);
  assert.deepEqual(opened.nodes.map((node) => node.id), map.nodes.map((node) => node.id));
  assert.ok(opened.nodes.every((node) => !("zoneId" in node)));
  assert.deepEqual(opened.edges, [{ from: a.id, to: b.id }]);
  assert.deepEqual(opened.strokes, [{ id: "ink", points: [{ x: 1, y: 2 }] }]);
  const user = `legacy-${crypto.randomUUID()}`;
  await saveLearningMindMap(user, legacy);
  assert.equal("zones" in (await loadLearningMindMaps(user, map.deckId))[0], false);
});



test("größere Karten rücken automatisch platzierte Karten nach; manuell gesetzte Positionen bleiben erhalten", async () => {
  const { map, a, b } = tree();
  const grown = editMindMapNode(map, a.id, { kind: "text", images: [{ id: "image-growth", name: "Bild.png", dataUrl: "data:image/png;base64,YQ==" }] });
  const moved = grown.nodes.find((node) => node.id === b.id)!;
  assert.ok(moved.y >= a.y + mindMapNodeRect(grown.nodes.find((node) => node.id === a.id)!).height + 32);
  assert.equal(grown.nodes.find((node) => node.id === a.id)!.y, a.y);
  const manual = moveMindMapElement(map, "node", b.id, { x: 0, y: 20 });
  const preserved = editMindMapNode(manual, a.id, { kind: "text", images: [{ id: "image-growth", name: "Bild.png", dataUrl: "data:image/png;base64,YQ==" }] });
  assert.deepEqual(preserved.nodes.find((node) => node.id === b.id), manual.nodes.find((node) => node.id === b.id));
  const coordinate = editMindMapNode(map, b.id, { y: 1000 });
  assert.equal(coordinate.nodes.find((node) => node.id === b.id)!.autoPosition, false);
  const account = `layout-${crypto.randomUUID()}`, saved = await saveLearningMindMap(account, grown);
  assert.deepEqual((await loadLearningMindMaps(account, "deck"))[0].nodes, saved.nodes);
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

test("Linienfarben werden validiert und accountgebunden gespeichert", async () => {
  const map = createLearningMindMap("connection-colors", "Farben");
  assert.equal(map.connectionColor, "node");
  assert.throws(() => readLearningMindMap({ ...map, connectionColor: "unknown" }), /ungültig/);
  await saveLearningMindMap("connection-colors", { ...map, connectionColor: "gray" });
  assert.equal((await loadLearningMindMaps("connection-colors", map.deckId))[0].connectionColor, "gray");
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
  await saveLearningMindMap("free-text-user", map);
  const loaded = await loadInfinityMindMap("free-text-user", "free-text-deck");
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
