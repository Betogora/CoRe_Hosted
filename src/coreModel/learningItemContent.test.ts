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

test("Anki-Generierungsregeln behandeln eine reine Bild-Vorderseite als Inhalt", () => {
  const base = createBasicLearningItem("deck", '<img src="person.jpg">', "Antwort");
  const coreDefinition = createCoreNoteTypeDefinition({ document: base.contentDocument, kind: "normal" });
  const definition = {
    ...coreDefinition,
    origin: "anki" as const,
    recipes: coreDefinition.recipes.map((recipe) => ({
      ...recipe,
      generationRule: { kind: "field" as const, fieldId: coreDefinition.fields[0].id, present: true },
      back: {
        schemaVersion: 1 as const,
        source: "{{FrontSide}}<hr>{{Rückseite}}",
        nodes: [
          { kind: "front-side" as const },
          { kind: "text" as const, value: "<hr>" },
          { kind: "field" as const, fieldId: coreDefinition.fields[1].id, sourceName: "Rückseite", filters: [] },
        ],
      },
    })),
  };
  const result = projectLearningItemContent({
    definition,
    document: {
      ...base.contentDocument,
      definitionVersionId: definition.id,
      fields: [
        { ...base.contentDocument.fields[0], id: definition.fields[0].id, name: definition.fields[0].name, value: '<img src="person.jpg">' },
        { ...base.contentDocument.fields[1], id: definition.fields[1].id, name: definition.fields[1].name, value: "Antwort" },
      ],
    },
  });

  assert.equal(result.cards.length, 1);
  assert.deepEqual(result.cards[0].projection, { kind: "template", recipeId: definition.recipes[0].id, instanceKey: "default" });
  assert.match(result.cards[0].front, /person\.jpg/);
  assert.doesNotMatch(result.cards[0].front, /Antwort/);
  assert.match(result.cards[0].back, /person\.jpg/);
  assert.match(result.cards[0].back, /Antwort/);
  assert.notEqual(result.cards[0].front, result.cards[0].back);
});
