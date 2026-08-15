const FONT_STYLESHEET = "https://api.fontshare.com/v2/css?f[]=amulya@500,700&display=swap";
const FIGMA_CAPTURE_SCRIPT = "https://mcp.figma.com/mcp/html-to-design/capture.js";

interface DeferredAssetDocument {
  head: { append(...nodes: any[]): void };
  createElement(tagName: string): any;
  getElementById(id: string): unknown;
}

function appendLink(documentTarget: DeferredAssetDocument, id: string, attributes: Record<string, string>): void {
  if (documentTarget.getElementById(id)) return;
  const link = documentTarget.createElement("link");
  link.id = id;
  Object.assign(link, attributes);
  documentTarget.head.append(link);
}

export function loadDeferredBrowserAssets(
  documentTarget: DeferredAssetDocument,
  { enableFigmaCapture = false }: { enableFigmaCapture?: boolean } = {},
): void {
  appendLink(documentTarget, "core-fontshare-preconnect", { rel: "preconnect", href: "https://api.fontshare.com" });
  appendLink(documentTarget, "core-fontshare-cdn-preconnect", { rel: "preconnect", href: "https://cdn.fontshare.com", crossOrigin: "anonymous" });
  appendLink(documentTarget, "core-fontshare-styles", { rel: "stylesheet", href: FONT_STYLESHEET });
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
