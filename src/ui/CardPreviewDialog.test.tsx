import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LearningItemDocumentV1 } from "../coreTypes.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "../coreModel.ts";
import { CardPreviewDialog } from "./CardPreviewDialog.tsx";

function fixture() {
  const document: LearningItemDocumentV1 = {
    schemaVersion: 1,
    definitionVersionId: "preview-dialog-definition",
    fields: [
      { id: "front", sourceFieldId: null, name: "Vorderseite", value: "Frage", placement: "front", semanticRole: "prompt" },
      { id: "back", sourceFieldId: null, name: "Rückseite", value: "Antwort", placement: "back", semanticRole: "answer" },
    ],
    tags: [],
    mediaRefs: [],
  };
  const definition = createCoreNoteTypeDefinition({ document });
  const item = applyLearningItemContent({ previous: null, document, definition, reason: "create" }).item;
  return { item, definition, variant: item.variants[0] };
}

test("CardPreviewDialog renders an accessible front-side dialog without compatibility advertising", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open {...fixture()} onOpenChange={() => undefined} />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Kartenvorschau/);
  assert.match(markup, /title="Kartenvorschau der Vorderseite"/);
  assert.match(markup, /aria-label="Kartenseite anzeigen"/);
  assert.match(markup, />Vorderseite<\/button>/);
  assert.match(markup, />Rückseite<\/button>/);
  assert.doesNotMatch(markup, /Originalgetreu und sicher dargestellt/);
});

test("CardPreviewDialog stays unmounted while closed", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open={false} {...fixture()} onOpenChange={() => undefined} />,
  );
  assert.equal(markup, "");
});
