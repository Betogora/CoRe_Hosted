import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreNoteTypeDefinition, getCardEditorValue, saveCardEditorValue } from "../coreModel.ts";
import { projectCardPreviewDraft } from "./cardEditor.ts";

test("Karteneditor liest und speichert den direkten Karteninhalt", () => {
  const card = createBasicLearningItem("deck", "Frage", "Antwort", { tags: ["alt"] });
  assert.deepEqual(getCardEditorValue(card), { cardType: "basic", front: "Frage", back: "Antwort", tags: ["alt"] });
  const updated = saveCardEditorValue(card, { cardType: "basic", front: "Neue Frage", back: "Neue Antwort", tags: ["neu"] });
  assert.equal(updated.originalFront, "Neue Frage");
  assert.equal(updated.originalBack, "Neue Antwort");
  assert.deepEqual(updated.reviewState, card.reviewState);
  assert.equal("versionLog" in updated, false);
});

test("Vorschau benötigt keine persistierte Originalvariante", () => {
  const card = createBasicLearningItem("deck", "Frage", "Antwort");
  const preview = projectCardPreviewDraft({ item: card, definition: createCoreNoteTypeDefinition({ document: card.contentDocument }), draft: { kind: "editor", value: { cardType: "basic", front: "Vorschau", back: "Antwort", tags: [] } } });
  assert.ok(preview);
  assert.equal(preview.item.originalFront, "Vorschau");
  assert.equal(preview.variant, null);
});
