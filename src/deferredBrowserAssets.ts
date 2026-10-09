const FIGMA_CAPTURE_SCRIPT = "https://mcp.figma.com/mcp/html-to-design/capture.js";

interface DeferredAssetDocument {
  head: { append(...nodes: any[]): void };
  createElement(tagName: string): any;
  getElementById(id: string): unknown;
}

export function loadDeferredBrowserAssets(
  documentTarget: DeferredAssetDocument,
  { enableFigmaCapture = false }: { enableFigmaCapture?: boolean } = {},
): void {
  if (!enableFigmaCapture || documentTarget.getElementById("core-figma-capture")) return;
  const script = documentTarget.createElement("script");
  script.id = "core-figma-capture";
  script.src = FIGMA_CAPTURE_SCRIPT;
  script.async = true;
  documentTarget.head.append(script);
}

export function scheduleDeferredBrowserAssets({ enableFigmaCapture = false }: { enableFigmaCapture?: boolean } = {}): () => void {
  if (typeof document === "undefined") return () => {};
  const load = () => loadDeferredBrowserAssets(document, { enableFigmaCapture });
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(load, { timeout: 2_000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(load, 0);
  return () => clearTimeout(handle);
}
