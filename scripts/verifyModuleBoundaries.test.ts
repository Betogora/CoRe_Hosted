import assert from "node:assert/strict";
import test from "node:test";
import { checkImportRules, checkModuleLimits, collectImports } from "./verifyModuleBoundaries.ts";

function importViolations(files: Record<string, string>, exceptions: Parameters<typeof checkImportRules>[1] = []) {
  const importsByFile = new Map(Object.entries(files).map(([file, text]) => [file, collectImports(file, text)] as const));
  return checkImportRules(importsByFile, exceptions);
}

test("Importe werden mit der Compiler-API gelesen und Typimporte von Wertimporten getrennt", () => {
  const text = [
    'import { a } from "./a.ts";',
    'import type { B } from "./b.ts";',
    'import { type C } from "./c.ts";',
    'import { d, type D } from "./d.js";',
    'export { e } from "./e.ts";',
    'export type { F } from "./f.ts";',
    'const g = () => import("./g.ts");',
    'type H = import("./h.ts").H;',
    'import React from "react";',
    '// import { kommentar } from "./kommentar.ts";',
  ].join("\n");
  assert.deepEqual(collectImports("src/x.ts", text), [
    { target: "src/a.ts", typeOnly: false },
    { target: "src/b.ts", typeOnly: true },
    { target: "src/c.ts", typeOnly: true },
    { target: "src/d.ts", typeOnly: false },
    { target: "src/e.ts", typeOnly: false },
    { target: "src/f.ts", typeOnly: true },
    { target: "src/g.ts", typeOnly: false },
    { target: "src/h.ts", typeOnly: true },
    { target: "react", typeOnly: false },
  ]);
});

test("Regel 1: Screens und UI importieren Persistenz nur als Typ", () => {
  const violations = importViolations({
    "src/screens/Liste.tsx": 'import { pushCards } from "../syncEngine.ts";\nimport type { Row } from "../cloudRepositoryValidation.ts";',
    "src/ui/Knopf.tsx": 'import type { SupabaseClient } from "@supabase/supabase-js";',
    "src/ui/Ablage.tsx": 'const store = await import("../indexedDbStore.ts");',
    "src/screens/Liste.test.tsx": 'import { pushCards } from "../syncEngine.ts";',
  });
  assert.deepEqual(violations, [
    "src/screens/Liste.tsx: Regel „1 Persistenz nicht in UI“ – importiert src/syncEngine.ts als Wert; Daten und Befehle über App.tsx oder einen use*-Hook hereinreichen; erlaubt ist nur `import type`.",
    "src/ui/Ablage.tsx: Regel „1 Persistenz nicht in UI“ – importiert src/indexedDbStore.ts als Wert; Daten und Befehle über App.tsx oder einen use*-Hook hereinreichen; erlaubt ist nur `import type`.",
  ]);
});

test("Regel 2: APKG-Interna bleiben auch als Typ hinter apkgImport.ts", () => {
  const violations = importViolations({
    "src/App.tsx": 'import type { WorkerMessage } from "./apkgImportWorkerProtocol.ts";\nimport { readApkg } from "./apkgImport.ts";',
    "src/screens/Import.tsx": 'import { readApkg } from "../apkgImport.ts";',
  });
  assert.deepEqual(violations, [
    "src/App.tsx: Regel „2 APKG-Interna privat“ – importiert src/apkgImportWorkerProtocol.ts als Typ; nur die öffentliche Grenze src/apkgImport.ts verwenden, auch für Typen.",
  ]);
});

test("Regel 3: coreModel/ ist nur über coreModel.ts erreichbar, auch für Tests", () => {
  const violations = importViolations({
    "src/coreModel.ts": 'export { createNote } from "./coreModel/notes.ts";',
    "src/coreModel/batch.ts": 'import { createNote } from "./notes.ts";',
    "src/coreModel/notes.ts": "",
    "src/review.test.ts": 'import { createNote } from "./coreModel/notes.ts";',
    "src/review.ts": 'import { createNote } from "./coreModel.ts";',
  });
  assert.deepEqual(violations, [
    "src/review.test.ts: Regel „3 coreModel/ nur über coreModel.ts“ – importiert src/coreModel/notes.ts als Wert; über src/coreModel.ts importieren und den Export dort ergänzen.",
  ]);
});

test("Regel 4: ui/ importiert nichts aus screens/", () => {
  const violations = importViolations({
    "src/ui/Kachel.tsx": 'import type { ScreenProps } from "../screens/Start.tsx";',
    "src/screens/Start.tsx": 'import { Kachel } from "../ui/Kachel.tsx";',
  });
  assert.deepEqual(violations, [
    "src/ui/Kachel.tsx: Regel „4 ui/ ohne screens/“ – importiert src/screens/Start.tsx als Typ; Gemeinsames nach src/ui/ oder in ein Domänenmodul verschieben.",
  ]);
});

test("Regel 5: Domänenmodule direkt unter src/ bleiben frei von React und UI", () => {
  const violations = importViolations({
    "src/planung.ts": 'import type { ReactNode } from "react";\nimport { farbe } from "./ui/farbe.ts";',
    "src/useplanung.ts": 'import { useState } from "react";',
    "src/usePlanung.ts": 'import { useState } from "react";',
    "src/appScreenProps.ts": 'import type { ReactNode } from "react";',
    "src/Planung.tsx": 'import { useState } from "react";',
    "src/planung.test.ts": 'import { render } from "react";',
    "src/ui/farbe.ts": "",
  });
  assert.deepEqual(violations, [
    "src/planung.ts: Regel „5 Domänenmodule ohne React“ – importiert react als Typ; React- und UI-Code in .tsx, einen use*-Hook oder ein Domänenmodul verschieben.",
    "src/planung.ts: Regel „5 Domänenmodule ohne React“ – importiert src/ui/farbe.ts als Wert; React- und UI-Code in .tsx, einen use*-Hook oder ein Domänenmodul verschieben.",
    "src/useplanung.ts: Regel „5 Domänenmodule ohne React“ – importiert react als Wert; React- und UI-Code in .tsx, einen use*-Hook oder ein Domänenmodul verschieben.",
  ]);
});

test("Eingetragene Ausnahmen werden geduldet, veraltete zum Streichen gemeldet", () => {
  const files = { "src/render.ts": 'import { refs } from "./coreModel/noteContent.ts";', "src/coreModel/noteContent.ts": "" };
  const rule = "3 coreModel/ nur über coreModel.ts";
  const known = { rule, file: "src/render.ts", target: "src/coreModel/noteContent.ts", reason: "bekannt" };
  const stale = { rule, file: "src/render.ts", target: "src/coreModel/notes.ts", reason: "behoben" };
  assert.deepEqual(importViolations(files, [known]), []);
  assert.deepEqual(importViolations(files, [known, stale]), [
    "src/render.ts: Ausnahme zu Regel „3 coreModel/ nur über coreModel.ts“ für src/coreModel/notes.ts trifft nicht mehr zu; aus IMPORT_EXCEPTIONS in scripts/verifyModuleBoundaries.ts streichen.",
  ]);
});

test("Obergrenzen melden Wachstum, verlangen bei Rückgang das Senken und schweigen bei Gleichstand", () => {
  const textByFile = new Map([
    ["src/App.tsx", "a\nb\nc\n"],
    ["src/sync.ts", "const a: any = 1 as any; // any\nlet b: Array<any> = [] as any[]; const any = 'any';\n"],
  ]);
  assert.deepEqual(checkModuleLimits(textByFile, [
    { file: "src/App.tsx", measure: "Zeilen", max: 3 },
    { file: "src/sync.ts", measure: "any-Typen", max: 4 },
  ]), []);
  assert.deepEqual(checkModuleLimits(textByFile, [
    { file: "src/App.tsx", measure: "Zeilen", max: 2 },
    { file: "src/sync.ts", measure: "any-Typen", max: 5 },
  ]), [
    "src/App.tsx: Zeilen auf 3 gewachsen, Obergrenze 2; den Zuwachs abbauen statt die Grenze anzuheben.",
    "src/sync.ts: any-Typen auf 4 gesunken; Obergrenze in MODULE_LIMITS in scripts/verifyModuleBoundaries.ts von 5 auf 4 senken.",
  ]);
});
