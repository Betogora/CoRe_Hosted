import assert from "node:assert/strict";
import test from "node:test";
import { loadDeferredBrowserAssets } from "./deferredBrowserAssets.ts";

function fakeDocument() {
  const nodes: any[] = [];
  return {
    nodes,
    head: { append(...items: any[]) { nodes.push(...items); } },
    createElement(tagName: string) { return { tagName }; },
    getElementById(id: string) { return nodes.find((node) => node.id === id) ?? null; },
  };
}

test("lädt Fonts nachgelagert und Figma-Capture ausschließlich auf ausdrückliche Entwicklungsfreigabe", () => {
  const production = fakeDocument();
  loadDeferredBrowserAssets(production);
  assert.equal(production.nodes.some((node) => node.id === "core-fontshare-styles"), true);
  assert.equal(production.nodes.find((node) => node.id === "core-fontshare-styles")?.href.includes("synonym"), false);
  assert.equal(production.nodes.some((node) => node.id === "core-figma-capture"), false);

  const development = fakeDocument();
  loadDeferredBrowserAssets(development, { enableFigmaCapture: true });
  loadDeferredBrowserAssets(development, { enableFigmaCapture: true });
  assert.equal(development.nodes.filter((node) => node.id === "core-figma-capture").length, 1);
  assert.equal(development.nodes.filter((node) => node.id === "core-fontshare-styles").length, 1);
});
