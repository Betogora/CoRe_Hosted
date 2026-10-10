import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSrcdoc } from "../presentationFrame.ts";
import type { NotePresentationResult } from "../notePresentation.ts";
import { CardPresentationSurface, fitReviewFrameToContent } from "./CardPresentationSurface.tsx";

function fixture(): { presentation: NotePresentationResult } {
  return {
    presentation: {
      srcdoc: buildSrcdoc('<img src="figure.png"><p>Abbildung</p>', "", "light"),
      accessibleText: "Abbildung",
      mediaReferences: ["figure.png"],
      interactions: [],
      diagnostics: [],
    },
  };
}

test("renders a scriptless iframe and resolves only controlled media URLs", () => {
  const rendered = fixture();
  const markup = renderToStaticMarkup(
    <CardPresentationSurface
      {...rendered}
      mediaUrls={{ "figure.png": "blob:https://core.local/figure", unsafe: "https://tracker.example/x" }}
      title="Kartenvorschau"
    />,
  );

  assert.match(markup, /<iframe[^>]+sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(markup, /allow-scripts/);
  assert.doesNotMatch(markup, /scrolling="no"/);
  assert.match(markup, /blob:https:\/\/core.local\/figure/);
  assert.doesNotMatch(markup, /tracker\.example/);
});

test("renders review content without a framed card surface", () => {
  const markup = renderToStaticMarkup(
    <CardPresentationSurface {...fixture()} title="Reviewfrage" surface="review" />,
  );

  const iframe = markup.match(/<iframe[^>]+>/)?.[0] ?? "";
  assert.match(iframe, /scrolling="no"/);
  assert.doesNotMatch(iframe, /allow-scripts/);
  assert.match(iframe, /border-0 bg-transparent/);
  assert.doesNotMatch(iframe, /rounded-control|border-core-border|bg-core-surface/);
});

test("remeasures review content from a collapsed frame instead of retaining a tall previous card", () => {
  const style = { height: "900px" };
  const heightsAtMeasurement: string[] = [];
  const frameDocument = {
    documentElement: {
      get scrollHeight() {
        heightsAtMeasurement.push(style.height);
        return style.height === "1px" ? 48 : 900;
      },
    },
    body: {
      get scrollHeight() {
        heightsAtMeasurement.push(style.height);
        return style.height === "1px" ? 72.2 : 900;
      },
    },
  };

  fitReviewFrameToContent(
    { style } as unknown as HTMLIFrameElement,
    frameDocument as unknown as Document,
  );

  assert.deepEqual(heightsAtMeasurement, ["1px", "1px"]);
  assert.equal(style.height, "73px");
});
