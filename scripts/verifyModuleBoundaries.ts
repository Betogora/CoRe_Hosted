import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SCRIPT = "scripts/verifyModuleBoundaries.ts";

type ImportReference = { target: string; typeOnly: boolean };
type ImportRule = {
  id: string;
  appliesTo: (file: string) => boolean;
  forbids: (target: string) => boolean;
  typeImportsAllowed: boolean;
  remedy: string;
};
type ImportException = { rule: string; file: string; target: string; reason: string };
type ModuleLimit = { file: string; measure: keyof typeof MEASURES; max: number };

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const inUiLayer = (file: string) => /^src\/(?:screens|ui)\//.test(file);

const IMPORT_RULES: readonly ImportRule[] = [
  {
    id: "1 Persistenz nicht in UI",
    appliesTo: (file) => inUiLayer(file) && !isTest(file),
    forbids: (target) =>
      /^src\/(?:cloudRepository|cloudRepositoryValidation|cloudMediaStore|syncEngine|supabaseClient)\.ts$/.test(target)
      || /^src\/indexedDb[^/]*\.ts$/.test(target)
      || target.startsWith("@supabase/"),
    typeImportsAllowed: true,
    remedy: "Daten und Befehle über App.tsx oder einen use*-Hook hereinreichen; erlaubt ist nur `import type`",
  },
  {
    id: "2 APKG-Interna privat",
    appliesTo: (file) => (inUiLayer(file) || file === "src/App.tsx") && !isTest(file),
    forbids: (target) =>
      /^src\/(?:apkgImportWorker|apkgImportWorkerProtocol|apkgImportInternal|zipReader|sqliteReader)\.ts$/.test(target),
    typeImportsAllowed: false,
    remedy: "nur die öffentliche Grenze src/apkgImport.ts verwenden, auch für Typen",
  },
  {
    id: "3 coreModel/ nur über coreModel.ts",
    appliesTo: (file) => file !== "src/coreModel.ts" && !file.startsWith("src/coreModel/"),
    forbids: (target) => target.startsWith("src/coreModel/"),
    typeImportsAllowed: false,
    remedy: "über src/coreModel.ts importieren und den Export dort ergänzen",
  },
  {
    id: "4 ui/ ohne screens/",
    appliesTo: (file) => file.startsWith("src/ui/") && !isTest(file),
    forbids: (target) => target.startsWith("src/screens/"),
    typeImportsAllowed: false,
    remedy: "Gemeinsames nach src/ui/ oder in ein Domänenmodul verschieben",
  },
  {
    id: "5 Domänenmodule ohne React",
    appliesTo: (file) =>
      /^src\/[^/]+\.ts$/.test(file) && !isTest(file) && !/^src\/use[A-Z][^/]*\.ts$/.test(file)
      && file !== "src/appScreenProps.ts",
    forbids: (target) => target === "react" || target.startsWith("react/") || inUiLayer(target),
    typeImportsAllowed: false,
    remedy: "React- und UI-Code in .tsx, einen use*-Hook oder ein Domänenmodul verschieben",
  },
];

/** Bekannte Verstöße; die Liste darf nur schrumpfen. */
const COREMODEL_RULE = "3 coreModel/ nur über coreModel.ts";
const TRANSLATION_REASON = "Übersetzer importiert Kernbausteine direkt, splitAnkiSystemTags fehlt in coreModel.ts";
const IMPORT_EXCEPTIONS: readonly ImportException[] = [
  ...["coreValues", "noteContent", "notes", "tags", "reviewState"].map((module) => ({
    rule: COREMODEL_RULE, file: "src/apkgNoteTranslation.ts", target: `src/coreModel/${module}.ts`, reason: TRANSLATION_REASON,
  })),
  { rule: COREMODEL_RULE, file: "src/notePresentation.ts", target: "src/coreModel/noteContent.ts", reason: "Renderer liest Medienverweise direkt aus dem Inhaltsmodul" },
  { rule: COREMODEL_RULE, file: "src/notePresentation.test.ts", target: "src/coreModel/notes.ts", reason: "Renderertest baut Notizen direkt" },
  { rule: "5 Domänenmodule ohne React", file: "src/notePresentation.ts", target: "src/ui/colorMath.ts", reason: "React-freie Farbrechnung liegt unter ui/" },
];

/** Obergrenzen, die nur sinken dürfen: Istwert darüber oder darunter bricht ab. */
const MODULE_LIMITS: readonly ModuleLimit[] = [
  { file: "src/App.tsx", measure: "Zeilen", max: 2487 },
  { file: "src/appScreenProps.ts", measure: "Zeilen", max: 409 },
  { file: "src/cloudRepository.ts", measure: "any-Typen", max: 182 },
  { file: "src/syncEngine.ts", measure: "any-Typen", max: 84 },
];

const MEASURES = {
  Zeilen: (_file: string, text: string) => text.split("\n").length - 1,
  "any-Typen": (file: string, text: string) => {
    let count = 0;
    const visit = (node: ts.Node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) count += 1;
      ts.forEachChild(node, visit);
    };
    visit(parseSource(file, text));
    return count;
  },
} satisfies Record<string, (file: string, text: string) => number>;

function parseSource(file: string, text: string) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
}

/** Relative Importe als Pfad ab Repository-Wurzel; `.js`-Endungen meinen die gleichnamige TypeScript-Datei. */
function resolveTarget(file: string, specifier: string) {
  if (!specifier.startsWith(".")) return specifier;
  return path.posix.join(path.posix.dirname(file), specifier).replace(/\.js$/, ".ts");
}

/** Liest statische, re-exportierende und dynamische Importe samt Typimporten (`import("x").T`). */
export function collectImports(file: string, text: string): ImportReference[] {
  const references: ImportReference[] = [];
  const add = (specifier: ts.Node | undefined, typeOnly: boolean) => {
    if (specifier && ts.isStringLiteralLike(specifier)) {
      references.push({ target: resolveTarget(file, specifier.text), typeOnly });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypeElements = !clause?.name && bindings !== undefined && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly) || onlyTypeElements);
    } else if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      const onlyTypeElements = clause !== undefined && ts.isNamedExports(clause)
        && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly);
      add(node.moduleSpecifier, node.isTypeOnly || onlyTypeElements);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0], false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(file, text));
  return references;
}

export function checkImportRules(
  importsByFile: ReadonlyMap<string, readonly ImportReference[]>,
  exceptions: readonly ImportException[] = IMPORT_EXCEPTIONS,
): string[] {
  const findings = new Map<string, { rule: ImportRule; file: string; target: string; typeOnly: boolean }>();
  for (const [file, references] of importsByFile) {
    for (const rule of IMPORT_RULES) {
      if (!rule.appliesTo(file)) continue;
      for (const { target, typeOnly } of references) {
        if (!rule.forbids(target) || (typeOnly && rule.typeImportsAllowed)) continue;
        const key = `${rule.id}\0${file}\0${target}`;
        const known = findings.get(key);
        findings.set(key, { rule, file, target, typeOnly: typeOnly && (known?.typeOnly ?? true) });
      }
    }
  }
  const messages: string[] = [];
  const usedExceptions = new Set<ImportException>();
  for (const { rule, file, target, typeOnly } of findings.values()) {
    const exception = exceptions.find((entry) => entry.rule === rule.id && entry.file === file && entry.target === target);
    if (exception) {
      usedExceptions.add(exception);
      continue;
    }
    messages.push(`${file}: Regel „${rule.id}“ – importiert ${target} ${typeOnly ? "als Typ" : "als Wert"}; ${rule.remedy}.`);
  }
  for (const exception of exceptions) {
    if (!usedExceptions.has(exception)) {
      messages.push(`${exception.file}: Ausnahme zu Regel „${exception.rule}“ für ${exception.target} trifft nicht mehr zu; aus IMPORT_EXCEPTIONS in ${SCRIPT} streichen.`);
    }
  }
  return messages;
}

export function checkModuleLimits(
  textByFile: ReadonlyMap<string, string>,
  limits: readonly ModuleLimit[] = MODULE_LIMITS,
): string[] {
  return limits.flatMap(({ file, measure, max }) => {
    const text = textByFile.get(file);
    if (text === undefined) return [`${file}: Datei für die Obergrenze „${measure}“ fehlt; Eintrag in MODULE_LIMITS in ${SCRIPT} anpassen.`];
    const actual = MEASURES[measure](file, text);
    if (actual > max) return [`${file}: ${measure} auf ${actual} gewachsen, Obergrenze ${max}; den Zuwachs abbauen statt die Grenze anzuheben.`];
    if (actual < max) return [`${file}: ${measure} auf ${actual} gesunken; Obergrenze in MODULE_LIMITS in ${SCRIPT} von ${max} auf ${actual} senken.`];
    return [];
  });
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(entryPath) : /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await listSourceFiles("src");
  const textByFile = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const)));
  const importsByFile = new Map([...textByFile].map(([file, text]) => [file, collectImports(file, text)] as const));
  const violations = [...checkImportRules(importsByFile), ...checkModuleLimits(textByFile)];
  if (violations.length > 0) {
    console.error("Modulgrenzen oder Obergrenzen verletzt:");
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
  }
}
