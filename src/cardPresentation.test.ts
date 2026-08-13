import assert from "node:assert/strict";
import test from "node:test";
import type { LearningItemDocumentV1 } from "./coreTypes.ts";
import {
  applyLearningItemContent,
  createCoreNoteTypeDefinition,
} from "./coreModel.ts";
import {
  renderLearningItemPresentation,
  resolvePresentationMedia,
} from "./cardPresentation.ts";
import { compileSafeTemplate } from "./safeTemplate.ts";

const now = "2026-08-11T12:00:00.000Z";

function fixture() {
  const document: LearningItemDocumentV1 = {
    schemaVersion: 1,
    definitionVersionId: "definition-render-v1",
    fields: [
      { id: "prompt", sourceFieldId: "anki-field-1", name: "Begriff", value: "Mitochondrium", placement: "front", semanticRole: "prompt" },
      { id: "answer", sourceFieldId: "anki-field-2", name: "Funktion", value: "ATP-Synthese", placement: "back", semanticRole: "answer" },
      { id: "context", sourceFieldId: "anki-field-3", name: "Kontext", value: "Zelle", placement: "both", semanticRole: "hint" },
    ],
    tags: ["Biologie"],
    mediaRefs: ["figure.png"],
  };
  const definition = createCoreNoteTypeDefinition({ document, createdAt: now });
  const item = applyLearningItemContent({ previous: null, document, definition, reason: "create" }).item;
  return { document, definition, item, variant: item.variants[0] };
}

test("compiles case-sensitive fields, nested conditionals and FrontSide", () => {
  const { definition } = fixture();
  const compiled = compileSafeTemplate(
    "{{#Kontext}}<b>{{Begriff}}</b>{{^Funktion}}leer{{/Funktion}}{{/Kontext}}{{FrontSide}}",
    definition.fields,
  );

  assert.equal(compiled.compatibility, "safe-equivalent");
  assert.equal(compiled.diagnostics.length, 0);
  assert.equal(compiled.ast.nodes[0]?.kind, "conditional");
  assert.equal(compiled.ast.nodes.at(-1)?.kind, "front-side");
});

test("renders front and back from the same safe template path with a locked-down srcdoc", async () => {
  const { definition, item, variant } = fixture();
  const recipe = {
    ...definition.recipes[0],
    front: { schemaVersion: 1 as const, source: '<div>{{Begriff}}</div><img src="figure.png" alt="Abbildung">', nodes: [] },
    back: { schemaVersion: 1 as const, source: "{{FrontSide}}<hr>{{Funktion}}", nodes: [] },
  };
  const importedDefinition = { ...definition, recipes: [recipe], css: ".card{font-weight:700;background:url(bg.png)}" };
  const question = await renderLearningItemPresentation({ item, variant, definition: importedDefinition, side: "question", surface: "review", theme: "dark" });
  const answer = await renderLearningItemPresentation({ item, variant, definition: importedDefinition, side: "answer", surface: "review", theme: "dark" });

  assert.equal(question.compatibility, "safe-equivalent");
  assert.match(question.srcdoc, /Content-Security-Policy/);
  assert.match(question.srcdoc, /script-src 'none'/);
  assert.match(question.srcdoc, /Mitochondrium/);
  assert.match(answer.srcdoc, /Mitochondrium/);
  assert.match(answer.srcdoc, /ATP-Synthese/);
  assert.deepEqual(question.mediaReferences.sort(), ["bg.png", "figure.png"]);
  const hydrated = resolvePresentationMedia(question.srcdoc, { "figure.png": "blob:https://core.local/image" });
  assert.match(hydrated, /src="blob:https:\/\/core.local\/image"/);
});

test("projects Anki sound markers through the same blob-only media path", async () => {
  const { definition, item, variant } = fixture();
  const audioItem = {
    ...item,
    mediaRefs: [...item.mediaRefs, "answer.mp3"],
    contentDocument: {
      ...item.contentDocument,
      mediaRefs: [...item.contentDocument.mediaRefs, "answer.mp3"],
      fields: item.contentDocument.fields.map((field) => field.id === "answer" ? { ...field, value: "[sound:answer.mp3]" } : field),
    },
  };
  const result = await renderLearningItemPresentation({ item: audioItem, variant, definition, side: "answer", surface: "review", theme: "light" });
  const hydrated = resolvePresentationMedia(result.srcdoc, { "answer.mp3": "blob:https://core.local/audio" });

  assert.deepEqual(result.interactions, ["audio"]);
  assert.match(hydrated, /<audio controls(?:="")? preload="none" src="blob:https:\/\/core.local\/audio"><\/audio>/);
  assert.doesNotMatch(hydrated, /\[sound:/i);
});

test("uses the ordered field fallback for scripts and custom filters", async () => {
  const { definition, item, variant } = fixture();
  const unsafeDefinition = {
    ...definition,
    recipes: [{
      ...definition.recipes[0],
      front: { schemaVersion: 1 as const, source: '<script>parent.postMessage("x", "*")</script>{{custom:Begriff}}', nodes: [] },
    }],
  };
  const result = await renderLearningItemPresentation({ item, variant, definition: unsafeDefinition, side: "question", surface: "card-management", theme: "light" });

  assert.equal(result.compatibility, "preserved-only");
  assert.match(result.srcdoc, /Das Anki-Template enthält aktiven Code/);
  assert.match(result.srcdoc, /Begriff/);
  assert.match(result.srcdoc, /Funktion/);
  assert.doesNotMatch(result.srcdoc, /<script>/i);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "template-script"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "custom-filter"));
});

test("review fallback never exposes back-only fields before reveal", async () => {
  const { definition, item, variant } = fixture();
  const missingRecipeDefinition = { ...definition, recipes: [] };

  const question = await renderLearningItemPresentation({ item, variant, definition: missingRecipeDefinition, side: "question", surface: "review", theme: "light" });
  const answer = await renderLearningItemPresentation({ item, variant, definition: missingRecipeDefinition, side: "answer", surface: "review", theme: "light" });

  assert.match(question.srcdoc, /Mitochondrium/);
  assert.doesNotMatch(question.srcdoc, /ATP-Synthese/);
  assert.match(answer.srcdoc, /ATP-Synthese/);
  assert.equal(question.compatibility, "preserved-only");
});

test("removes external HTML and CSS resources without silently claiming equivalence", async () => {
  const { definition, item, variant } = fixture();
  const networkDefinition = {
    ...definition,
    css: '@import "https://tracker.example/a.css";body{background:url(https://tracker.example/pixel)}',
    recipes: [{
      ...definition.recipes[0],
      front: { schemaVersion: 1 as const, source: '<img src="https://tracker.example/pixel"><form action="https://tracker.example/x"><input></form>{{Begriff}}', nodes: [] },
    }],
  };
  const result = await renderLearningItemPresentation({ item, variant, definition: networkDefinition, side: "question", surface: "editor-preview", theme: "light" });

  assert.equal(result.compatibility, "safe-with-differences");
  assert.doesNotMatch(result.srcdoc, /tracker\.example/);
  assert.doesNotMatch(result.srcdoc, /<form|<input/i);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "external-css"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "external-html-resource"));
});
