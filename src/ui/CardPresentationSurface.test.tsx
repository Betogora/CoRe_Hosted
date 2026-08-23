import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LearningItemDocumentV1 } from "../coreTypes.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "../coreModel.ts";
import { CardPresentationSurface, fitReviewFrameToContent } from "./CardPresentationSurface.tsx";

const now = "2026-08-11T12:00:00.000Z";

function fixture(source = '<img src="figure.png">{{Frage}}') {
  const document: LearningItemDocumentV1 = {
    schemaVersion: 1,
    definitionVersionId: "surface-definition",
    fields: [{ id: "front", sourceFieldId: null, name: "Frage", value: "Abbildung", placement: "front", semanticRole: "prompt" }],
    tags: [],
    mediaRefs: ["figure.png"],
  };
  const basicDefinition = createCoreNoteTypeDefinition({ document, createdAt: now });
  const definition = {
    ...basicDefinition,
    recipes: basicDefinition.recipes.map((recipe) => ({
      ...recipe,
      front: { schemaVersion: 1 as const, source, nodes: [] },
    })),
  };
  const item = applyLearningItemContent({ previous: null, document, definition, reason: "create" }).item;
  return { item, variant: item.variants[0], definition };
}

test("renders an opaque scriptless iframe and resolves only controlled media URLs", () => {
  const rendered = fixture();
  const markup = renderToStaticMarkup(
    <CardPresentationSurface
      {...rendered}
      mediaUrls={{ "figure.png": "blob:https://core.local/figure", unsafe: "https://tracker.example/x" }}
      title="Kartenvorschau"
    />,
  );

  assert.match(markup, /<iframe[^>]+sandbox=""/);
  assert.doesNotMatch(markup, /allow-scripts|allow-same-origin/);
  assert.doesNotMatch(markup, /scrolling="no"/);
  assert.match(markup, /blob:https:\/\/core.local\/figure/);
  assert.doesNotMatch(markup, /tracker\.example/);
});

test("shows a color-independent compatibility warning with diagnostics", () => {
  const rendered = fixture("{{custom:Frage}}");
  const markup = renderToStaticMarkup(<CardPresentationSurface {...rendered} title="Importierte Karte" showCompatibility="warnings-only" />);

  assert.match(markup, /Originaldaten erhalten/);
  assert.match(markup, /benutzerdefinierte Filter/);
  const statusTag = markup.match(/<div[^>]*role="status"[^>]*>/)?.[0] ?? "";
  const descriptionId = statusTag.match(/id="([^"]+)"/)?.[1];
  assert.ok(descriptionId);
  assert.ok(markup.includes(`aria-describedby="${descriptionId}"`));
});

test("hides equivalent compatibility advertising while keeping a corner badge inside the card frame", () => {
  const markup = renderToStaticMarkup(
    <CardPresentationSurface
      {...fixture()}
      title="Importierte Vorderseite"
      showCompatibility="warnings-only"
      cornerBadge={<span>Vorderseite</span>}
    />,
  );

  assert.doesNotMatch(markup, /Originalgetreu und sicher dargestellt/);
  assert.doesNotMatch(markup, /aria-describedby=/);
  assert.match(markup, /class="relative min-w-0"[^>]*>[\s\S]*Vorderseite[\s\S]*<iframe/);
});

test("renders review content without a framed card surface", () => {
  const markup = renderToStaticMarkup(
    <CardPresentationSurface {...fixture()} title="Reviewfrage" surface="review" showCompatibility={false} />,
  );

  const iframe = markup.match(/<iframe[^>]+>/)?.[0] ?? "";
  assert.match(iframe, /sandbox="allow-same-origin"/);
  assert.match(iframe, /scrolling="no"/);
  assert.doesNotMatch(iframe, /allow-scripts/);
  assert.match(iframe, /border-0 bg-transparent/);
  assert.doesNotMatch(iframe, /rounded-xl|border-\[var\(--core-border\)\]|bg-core-surface/);
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
