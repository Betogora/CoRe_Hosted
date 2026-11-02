import assert from "node:assert/strict";
import test from "node:test";
import { affectedE2ESpecs } from "../scripts/affectedE2ESpecs.ts";
import { CATALOG_SPECS } from "../tests/e2e/support/catalogSpecs.ts";

test("affected browser gate runs changed specs and the specs mapped to changed screens", () => {
  assert.deepEqual(affectedE2ESpecs(["tests/e2e/mindmaps.spec.ts", "src/screens/SummaryDocumentEditor.tsx"]), {
    full: false,
    catalog: ["learning-summaries", "mindmaps"],
    supabase: ["navigation-context"],
  });
});

test("affected browser gate skips docs and unit tests but sends catalog sources to every catalog spec", () => {
  assert.deepEqual(affectedE2ESpecs(["docs/todo.md", "src/coreModel.test.ts"]), { full: false, catalog: [], supabase: [] });
  assert.deepEqual(affectedE2ESpecs(["scripts/uiCatalogDemos.tsx"]), { full: false, catalog: CATALOG_SPECS, supabase: [] });
});

test("affected browser gate falls back to the full suite for shared infrastructure and unmapped product code", () => {
  for (const file of ["tests/e2e/support/appState.ts", "playwright.config.ts", "package-lock.json", "supabase/migrations/x.sql", "src/App.tsx", "src/workspaceStorage.ts"]) {
    assert.deepEqual(affectedE2ESpecs(["tests/e2e/mindmaps.spec.ts", file]), { full: true }, file);
  }
});
