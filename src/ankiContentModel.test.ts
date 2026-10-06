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
  assert.equal("sourceDefinitionSnapshot" in bundle.definition, false);
  assert.equal(bundle.definition.recipes[0].sourceConfigBase64, "Aw==");
  assert.equal("snapshot" in bundle, false);
});

test("treats Anki requirement none as an existing card without a field gate", () => {
  const bundle = createAnkiContentBundle({
    model: {
      id: "43",
      name: "Vorhandene Karte ohne Feldanforderung",
      config: {
        format: "protobuf-v18",
        kind: 0,
        requirements: [{ cardOrdinal: 0, kind: 0, fieldOrdinals: [] }],
      },
      flds: [{ name: "Vorderseite", ord: 0 }, { name: "Rückseite", ord: 1 }],
      tmpls: [{
        name: "Karte 1",
        ord: 0,
        config: { questionFormat: "{{Vorderseite}}", answerFormat: "{{Rückseite}}" },
      }],
    },
    fieldValues: [{ name: "Vorderseite", value: "Frage" }, { name: "Rückseite", value: "Antwort" }],
    tags: [],
    mediaRefs: [],
    note: { id: "101" },
    cards: [{ id: "201", ord: 0 }],
    importFingerprint: "package-none-requirement",
  });

  assert.deepEqual(bundle.definition.recipes[0].generationRule, { kind: "always" });
});

test("maps the Anki Multiple Choice add-on fields to a native choice interaction", () => {
  const fields = [
    "Title",
    "Question",
    "QType (0=kprim,1=mc,2=sc)",
    "Q_1",
    "Q_2",
    "Q_3",
    "Answers",
    "Sources",
    "Extra 1",
  ];
  const bundle = createAnkiContentBundle({
    model: {
      id: "44",
      name: "AllInOne (kprim, mc, sc)",
      type: 0,
      flds: fields.map((name, ord) => ({ name, ord })),
      tmpls: [{
        name: "AllInOne (kprim, mc, sc)",
        ord: 0,
        qfmt: '<script>generateTable()</script>{{Question}}<table id="qtable"></table><div id="Q_solutions">{{Answers}}</div>',
        afmt: '<table id="qtable"></table><p>Correct answers: x %</p><script>onLoad()</script>',
      }],
    },
    fieldValues: [
      { name: "Title", value: "Medizin" },
      { name: "Question", value: "Was trifft zu?" },
      { name: "QType (0=kprim,1=mc,2=sc)", value: "1" },
      { name: "Q_1", value: "Antwort A" },
      { name: "Q_2", value: "Antwort B" },
      { name: "Q_3", value: "Antwort C" },
      { name: "Answers", value: "1 0 1" },
      { name: "Sources", value: "Leitlinie" },
      { name: "Extra 1", value: "Zusatzwissen" },
    ],
    tags: [],
    mediaRefs: [],
    note: { id: "102" },
    cards: [{ id: "202", ord: 0 }],
    importFingerprint: "package-choice",
  });

  assert.equal(bundle.definition.recipes[0].interaction, "choice");
  assert.doesNotMatch(bundle.definition.recipes[0].front.source, /<script/i);
  assert.match(String(bundle.definition.recipes[0].sourceConfig.originalQuestionFormat), /generateTable/);
  assert.deepEqual(bundle.document.interaction?.choice, {
    options: ["Antwort A", "Antwort B", "Antwort C"],
    correctAnswers: ["Antwort A", "Antwort C"],
    mode: "multiple",
    explanation: "<section><h3>Sources</h3>Leitlinie</section><section><h3>Extra 1</h3>Zusatzwissen</section>",
  });
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
