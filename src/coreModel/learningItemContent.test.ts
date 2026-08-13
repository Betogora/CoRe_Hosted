import assert from "node:assert/strict";
import test from "node:test";
import type { ForeignNoteSnapshot, LearningItemDocumentV1 } from "../coreTypes.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition, saveLearningItemDocumentValues } from "../coreModel.ts";

const now = "2026-08-11T12:00:00.000Z";

function dynamicDocument(): LearningItemDocumentV1 {
  return {
    schemaVersion: 1,
    definitionVersionId: "definition-dynamic-v1",
    fields: [
      { id: "term", sourceFieldId: null, name: "Begriff", value: "Mitochondrium", placement: "front", semanticRole: "prompt" },
      { id: "answer", sourceFieldId: null, name: "Funktion", value: "ATP-Synthese", placement: "back", semanticRole: "answer" },
      { id: "context", sourceFieldId: null, name: "Kontext", value: "Eukaryotische Zelle", placement: "both", semanticRole: "explanation" },
      { id: "source", sourceFieldId: null, name: "Quelle", value: "Kapitel 4", placement: "metadata", semanticRole: "source" },
    ],
    tags: ["Biologie"],
    mediaRefs: ["figure.png"],
  };
}

test("applies a dynamic document atomically and materializes stable forward/reverse variants", () => {
  const document = dynamicDocument();
  const definition = createCoreNoteTypeDefinition({ document, reverse: true, createdAt: now });
  const result = applyLearningItemContent({ previous: null, document, definition, reason: "create" });

  assert.equal(result.item.noteTypeDefinitionId, definition.id);
  assert.equal(result.item.contentDocument.fields.length, 4);
  assert.deepEqual(result.item.originalFields.map((field) => field.name), ["Begriff", "Funktion", "Kontext", "Quelle"]);
  assert.deepEqual(result.item.mediaRefs, ["figure.png"]);
  assert.equal(result.item.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.equal(result.item.variants.filter((variant) => variant.isActive).length, 2);
  assert.match(result.item.variants[0].front, /Mitochondrium/);
  assert.match(result.item.variants[1].front, /ATP-Synthese/);
});

test("preserves matching variant identity and review data while disabling a removed recipe", () => {
  const document = dynamicDocument();
  const definition = createCoreNoteTypeDefinition({ document, reverse: true, createdAt: now });
  const created = applyLearningItemContent({ previous: null, document, definition, reason: "create" }).item;
  const forwardId = created.variants[0].id;
  const reverse = created.variants[1];
  const previous = {
    ...created,
    variants: created.variants.map((variant) => variant.id === reverse.id
      ? { ...variant, performance: { ...variant.performance, reviewCount: 3, attempts: 3 } }
      : variant),
  };
  const editedDocument = {
    ...document,
    fields: document.fields.map((field) => field.id === "answer" ? { ...field, value: "Energiegewinnung" } : field),
  };
  const forwardOnly = { ...definition, recipes: definition.recipes.slice(0, 1) };
  const edited = applyLearningItemContent({ previous, document: editedDocument, definition: forwardOnly, reason: "edit" });

  assert.equal(edited.item.variants.find((variant) => variant.isOriginal)?.id, forwardId);
  const disabledReverse = edited.item.variants.find((variant) => variant.id === reverse.id);
  assert.equal(disabledReverse?.isActive, false);
  assert.equal(disabledReverse?.qualityStatus, "disabled");
  assert.equal(disabledReverse?.performance.reviewCount, 3);
  assert.deepEqual(edited.disabledVariantIds, [reverse.id]);
  assert.match(edited.item.variants[0].back, /Energiegewinnung/);
});

test("creates one independently reviewable projection per cloze ordinal", () => {
  const document: LearningItemDocumentV1 = {
    schemaVersion: 1,
    definitionVersionId: "definition-cloze-v1",
    fields: [
      {
        id: "cloze-text",
        sourceFieldId: null,
        name: "Text",
        value: "Die {{c1::Zelle}} enthält {{c2::Mitochondrien::Organellen}}.",
        placement: "both",
        semanticRole: "prompt",
      },
    ],
    tags: [],
    mediaRefs: [],
  };
  const definition = createCoreNoteTypeDefinition({ document, kind: "cloze", interaction: "cloze", createdAt: now });
  const result = applyLearningItemContent({ previous: null, document, definition, reason: "create" });

  assert.deepEqual(
    result.item.variants.filter((variant) => variant.isActive).map((variant) => variant.projection),
    [
      { kind: "cloze", recipeId: "definition-cloze-v1-forward", clozeOrdinal: 1 },
      { kind: "cloze", recipeId: "definition-cloze-v1-forward", clozeOrdinal: 2 },
    ],
  );
  assert.match(result.item.variants[0].front, /\[…\]/);
  assert.match(result.item.variants[1].front, /\[Organellen\]/);
  assert.equal(result.item.originalFront, document.fields[0].value);
  assert.equal(result.item.originalBack, document.fields[0].value);
  assert.equal(result.item.canonicalQuestion, document.fields[0].value);
});

test("keeps an immutable source snapshot reference across a local field edit", () => {
  const document = dynamicDocument();
  const definition = createCoreNoteTypeDefinition({ document, createdAt: now });
  const snapshot: ForeignNoteSnapshot = {
    id: "snapshot-1",
    schemaVersion: 1,
    sourceKind: "anki-apkg",
    importFingerprint: "package-1",
    previousSnapshotId: null,
    definitionVersionId: definition.id,
    sourcePayload: { raw: "unchanged" },
    createdAt: now,
  };
  const imported = applyLearningItemContent({ previous: null, document, definition, sourceSnapshot: snapshot, reason: "import" });
  const edited = applyLearningItemContent({
    previous: imported.item,
    document: { ...document, fields: document.fields.map((field) => field.id === "term" ? { ...field, value: "Chloroplast" } : field) },
    definition,
    reason: "edit",
  });

  assert.equal(edited.item.latestSourceSnapshotId, snapshot.id);
  assert.equal(edited.sourceSnapshot, null);
  assert.deepEqual(snapshot.sourcePayload, { raw: "unchanged" });
});

test("edits imported field values without allowing a schema change", () => {
  const document = dynamicDocument();
  const definition = createCoreNoteTypeDefinition({ document, createdAt: now });
  const imported = applyLearningItemContent({ previous: null, document, definition, reason: "import" }).item;
  const values = imported.contentDocument.fields.map((field) => ({
    id: field.id,
    value: field.id === "answer" ? "Zellatmung" : field.value,
  }));
  const edited = saveLearningItemDocumentValues({ previous: imported, definition, fields: values }).item;

  assert.equal(edited.contentDocument.fields.find((field) => field.id === "answer")?.value, "Zellatmung");
  assert.deepEqual(edited.contentDocument.fields.map((field) => field.name), imported.contentDocument.fields.map((field) => field.name));
  assert.equal(edited.variants[0].id, imported.variants[0].id);
  assert.throws(
    () => saveLearningItemDocumentValues({ previous: imported, definition, fields: values.slice(1) }),
    /nicht strukturell verändert/,
  );
});
