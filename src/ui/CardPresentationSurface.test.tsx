import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LearningItemDocumentV1 } from "../coreTypes.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "../coreModel.ts";
import { CardPresentationSurface } from "./CardPresentationSurface.tsx";

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
  assert.match(markup, /blob:https:\/\/core.local\/figure/);
  assert.doesNotMatch(markup, /tracker\.example/);
});

test("shows a color-independent compatibility warning with diagnostics", () => {
  const rendered = fixture("{{custom:Frage}}");
  const markup = renderToStaticMarkup(<CardPresentationSurface {...rendered} title="Importierte Karte" />);

  assert.match(markup, /Originaldaten erhalten/);
  assert.match(markup, /benutzerdefinierte Filter/);
  assert.match(markup, /role="status"/);
});
