import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { affectedE2ESpecs } from "../scripts/affectedE2ESpecs.ts";
import { CATALOG_SPECS } from "../tests/e2e/support/catalogSpecs.ts";

test("affected browser gate runs changed Supabase specs and the Supabase specs mapped to changed screens", () => {
  assert.deepEqual(affectedE2ESpecs(["tests/e2e/card-lifecycle.spec.ts", "tests/e2e/mindmaps.spec.ts", "src/screens/SummaryDocumentEditor.tsx"]), {
    full: false,
    supabase: ["card-lifecycle", "navigation-context"],
    rls: false,
  });
});

test("affected browser gate leaves docs, unit tests and catalog sources to other jobs", () => {
  for (const file of ["docs/todo.md", "src/coreModel.test.ts", "docs/ui-elements.html", "scripts/uiCatalogDemos.tsx", "tests/e2e/mindmaps.spec.ts"]) {
    assert.deepEqual(affectedE2ESpecs([file]), { full: false, supabase: [], rls: false }, file);
  }
});

test("affected browser gate runs the full RLS suite for changed RLS tests", () => {
  assert.deepEqual(affectedE2ESpecs(["tests/rls/ownership-smoke.test.ts"]), { full: false, supabase: [], rls: true });
});

test("affected browser gate falls back to the full suite for shared infrastructure and unmapped product code", () => {
  for (const file of ["tests/e2e/support/appState.ts", "playwright.config.ts", "package-lock.json", "supabase/migrations/x.sql", "src/App.tsx", "src/workspaceStorage.ts"]) {
    assert.deepEqual(affectedE2ESpecs(["tests/e2e/mindmaps.spec.ts", file]), { full: true }, file);
  }
});

test("every selected spec exists and every Supabase spec is reachable from a product source", () => {
  const specs = readdirSync("tests/e2e").filter((name) => name.endsWith(".spec.ts")).map((name) => name.replace(/\.spec\.ts$/, "")).filter((name) => !CATALOG_SPECS.includes(name));
  const reached = new Set<string>();
  for (const file of readdirSync("src", { recursive: true, encoding: "utf8" }).map((name) => `src/${name.replaceAll("\\", "/")}`)) {
    const affected = affectedE2ESpecs([file]);
    if (affected.full) continue;
    for (const name of affected.supabase) {
      assert.ok(specs.includes(name), `${file} selects the missing spec ${name}`);
      reached.add(name);
    }
  }
  assert.deepEqual(specs.filter((name) => !reached.has(name)), []);
});
