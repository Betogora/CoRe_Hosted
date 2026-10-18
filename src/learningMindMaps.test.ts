import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createLearningSummary, createSummarySettings } from "./learningSummaries.ts";
import { createLearningMindMap, createMindMapNode, loadLearningMindMaps, mindMapFromSummary, readLearningMindMap, removeMindMapNode, saveLearningMindMap, toggleMindMapEdge } from "./learningMindMaps.ts";

test("Zusammenfassung wird hierarchisch verknüpft; Textstellen bleiben exakt und unabhängig erhalten", () => {
  const summary = { ...createLearningSummary("deck", "Energie", createSummarySettings()), html: "<h2>ATP</h2><p>ATP und ADP sind Energieträger.</p><h3>Aufbau</h3><ul><li>Drei Phosphatgruppen.</li></ul><h2>ADP</h2><p>Zwei Phosphatgruppen.</p>" };
  const map = mindMapFromSummary(summary), byLabel = new Map(map.nodes.map((node) => [node.label, node]));
  assert.equal(map.nodes.length, 7);
  assert.equal(map.edges.length, 6);
  assert.ok(map.edges.some((edge) => edge.from === byLabel.get("ATP")!.id && edge.to === byLabel.get("Aufbau")!.id));
  assert.ok(map.edges.some((edge) => edge.from === map.nodes[0].id && edge.to === byLabel.get("ADP")!.id));
  assert.equal(byLabel.get("ATP und ADP sind Energieträger.")!.sourceText, "ATP und ADP sind Energieträger.");
  assert.match(byLabel.get("ATP")!.sourceText!, /Drei Phosphatgruppen/);
  assert.doesNotMatch(byLabel.get("ATP")!.sourceText!, /Zwei Phosphatgruppen/);
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
  assert.equal(map.edges[0].from, map.nodes[0].id);
  assert.equal(map.nodes[2].sourceText, "Zweiter Absatz.");
});

test("manuell bearbeitete Mischformen erhalten freie Texte, div-Absätze und verschachtelte Listen", () => {
  const map = mindMapFromSummary({ ...createLearningSummary("deck", "Manuell", createSummarySettings()), html: "Einleitung.<h2>Thema</h2><div>Erster Absatz.</div>Freier Nachsatz.<ul><li>Punkt eins.<ul><li>Unterpunkt.</li></ul></li><li>Punkt zwei.</li></ul>Ende." });
  assert.deepEqual(map.nodes.slice(1).map((node) => node.sourceText?.split("\n\n")[0]), ["Einleitung.", "Thema", "Erster Absatz.", "Freier Nachsatz.", "Punkt eins.", "Unterpunkt.", "Punkt zwei.", "Ende."]);
  assert.match(map.nodes.find((node) => node.label === "Thema")!.sourceText!, /Erster Absatz/);
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
  assert.throws(() => readLearningMindMap({ ...map, edges: [{ from: "missing", to: "other" }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [node], edges: [{ from: node.id, to: node.id }] }));
  assert.throws(() => readLearningMindMap({ ...map, nodes: [node], unexpected: true }));
});
