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

test("lädt Figma-Capture ausschließlich auf ausdrückliche Entwicklungsfreigabe und keine externen Schriften", () => {
  const production = fakeDocument();
  loadDeferredBrowserAssets(production);
  assert.deepEqual(production.nodes, []);

  const development = fakeDocument();
  loadDeferredBrowserAssets(development, { enableFigmaCapture: true });
  loadDeferredBrowserAssets(development, { enableFigmaCapture: true });
  assert.equal(development.nodes.filter((node) => node.id === "core-figma-capture").length, 1);
});
