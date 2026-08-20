import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreNoteTypeDefinition } from "../coreModel.ts";
import { projectLearningItemContent } from "./learningItemContent.ts";

test("eine Definition projiziert reale Karten statt persistierter Originalvarianten", () => {
  const base = createBasicLearningItem("deck", "Frage", "Antwort");
  const definition = createCoreNoteTypeDefinition({ document: base.contentDocument, kind: "normal" });
  const result = projectLearningItemContent({
    definition,
    document: {
      schemaVersion: 1,
      definitionVersionId: definition.id,
      fields: [
        { id: definition.fields[0].id, sourceFieldId: null, name: definition.fields[0].name, value: "Frage", placement: "front", semanticRole: "prompt" },
        { id: definition.fields[1].id, sourceFieldId: null, name: definition.fields[1].name, value: "Antwort", placement: "back", semanticRole: "answer" },
      ],
      tags: [],
      mediaRefs: [],
    },
  });
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].front, "Frage");
  assert.equal(result.cards[0].back, "Antwort");
});
