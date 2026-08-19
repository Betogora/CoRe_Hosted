import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LearningItemDocumentV1 } from "../coreTypes.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "../coreModel.ts";
import { CardPreviewDialog } from "./CardPreviewDialog.tsx";
import { StudyCardContent } from "./StudyCardContent.tsx";

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

test("CardPreviewDialog renders the learning front in an accessible larger dialog", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open {...fixture()} onOpenChange={() => undefined} />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Kartenvorschau/);
  assert.match(markup, /title="Frage"/);
  assert.match(markup, /sandbox="allow-same-origin"/);
  assert.match(markup, /aria-label="Kartenseite anzeigen"/);
  assert.match(markup, />Vorderseite<\/button>/);
  assert.match(markup, />Rückseite<\/button>/);
  assert.match(markup, /sm:max-h-\[92dvh\].*sm:max-w-6xl/);
  assert.doesNotMatch(markup, /title="Antwort"/);
  assert.doesNotMatch(markup, /Antwort anzeigen|Bewertung Gut/);
  assert.doesNotMatch(markup, /Originalgetreu und sicher dargestellt/);
});

test("CardPreviewDialog stays unmounted while closed", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open={false} {...fixture()} onOpenChange={() => undefined} />,
  );
  assert.equal(markup, "");
});

test("StudyCardContent reveals one separate answer without duplicating the question", () => {
  const rendered = fixture();
  const front = renderToStaticMarkup(<StudyCardContent {...rendered} revealed={false} selectedChoice="" onSelectChoice={() => undefined} />);
  const back = renderToStaticMarkup(<StudyCardContent {...rendered} revealed selectedChoice="" onSelectChoice={() => undefined} />);

  assert.doesNotMatch(front, /title="Antwort"|Antwort anzeigen/);
  assert.equal((back.match(/data-testid="study-card-answer-separator"/g) ?? []).length, 1);
  assert.equal((back.match(/title="Frage"/g) ?? []).length, 1);
  assert.equal((back.match(/title="Antwort"/g) ?? []).length, 1);
});
