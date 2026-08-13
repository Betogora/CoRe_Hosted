import assert from "node:assert/strict";
import test from "node:test";
import { createAnkiContentBundle } from "./ankiContentModel.ts";

test("maps arbitrary Anki fields and templates without front/back name or position heuristics", () => {
  const bundle = createAnkiContentBundle({
    model: {
      id: "42",
      name: "Eigener Typ",
      config: { format: "protobuf-v18", kind: 0, css: ".card{color:purple}", rawBase64: "AA==", requirements: [] },
      flds: [
        { name: "Erklärung", ord: 0, config: { id: "9001", rawBase64: "AQ==" } },
        { name: "Frage", ord: 1, config: { id: "9002", rawBase64: "Ag==" } },
      ],
      tmpls: [{
        name: "Prüfung",
        ord: 0,
        config: { id: "7001", questionFormat: "{{Frage}}", answerFormat: "{{FrontSide}}<hr>{{Erklärung}}", rawBase64: "Aw==" },
      }],
    },
    fieldValues: [
      { name: "Erklärung", value: "Antwort" },
      { name: "Frage", value: "Prompt" },
    ],
    tags: ["tag"],
    mediaRefs: [],
    note: { id: "100", guid: "guid-100", flds: "Antwort\u001fPrompt" },
    cards: [{ id: "200", ord: 0, due: 12 }],
    importFingerprint: "package-1",
    createdAt: "2026-08-11T12:00:00.000Z",
  });

  assert.deepEqual(bundle.document.fields.map((field) => field.name), ["Erklärung", "Frage"]);
  assert.deepEqual(bundle.document.fields.map((field) => field.sourceFieldId), ["9001", "9002"]);
  assert.equal(bundle.definition.recipes[0].front.nodes[0]?.kind, "field");
  assert.equal(bundle.definition.recipes[0].front.nodes[0]?.kind === "field" && bundle.definition.recipes[0].front.nodes[0].sourceName, "Frage");
  assert.equal(bundle.definition.sourceDefinitionSnapshot?.rawConfigBase64, "AA==");
  assert.equal(bundle.definition.recipes[0].sourceConfigBase64, "Aw==");
  assert.equal(bundle.snapshot.sourcePayload.cards instanceof Array, true);
});

test("recognizes Anki's native image-occlusion stock identity without relying on field names", () => {
  const bundle = createAnkiContentBundle({
    model: {
      id: "77",
      name: "Native IO",
      config: { format: "protobuf-v18", kind: 1, originalStockKind: 6, requirements: [] },
      flds: [{ name: "A", ord: 0, config: { id: "1" } }],
      tmpls: [{ name: "Maske", ord: 0, config: { id: "2", questionFormat: "{{cloze:A}}", answerFormat: "{{cloze:A}}" } }],
    },
    fieldValues: [{ name: "A", value: '<img src="diagram.png">' }],
    tags: [],
    mediaRefs: ["diagram.png"],
    note: { id: "100" },
    cards: [{ id: "200", ord: 0 }],
    importFingerprint: "package-io",
  });

  assert.equal(bundle.definition.kind, "image-occlusion");
  assert.equal(bundle.definition.recipes[0].interaction, "image-occlusion");
});
