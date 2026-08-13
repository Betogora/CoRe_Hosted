import type { FieldDefinition, SafeTemplateAst, SafeTemplateAstNode } from "./coreTypes.ts";

export type TemplateCompatibility = "safe-equivalent" | "safe-with-differences" | "preserved-only";
export interface TemplateDiagnostic { code: string; level: "info" | "warning" | "error"; message: string; detail: string | null }
export interface CompiledSafeTemplate { ast: SafeTemplateAst; compatibility: TemplateCompatibility; diagnostics: TemplateDiagnostic[] }

const SAFE_FILTERS = new Set(["cloze", "furigana", "hint", "kana", "kanji", "text", "tts", "type"]);
const SPECIAL_FIELDS = new Set(["Tags", "Deck", "Subdeck", "Card", "Type"]);

function addDiagnostic(diagnostics: TemplateDiagnostic[], code: string, message: string, detail: string | null = null, level: TemplateDiagnostic["level"] = "warning") {
  if (!diagnostics.some((candidate) => candidate.code === code && candidate.detail === detail)) diagnostics.push({ code, level, message, detail });
}

export function compileSafeTemplate(source: string, fields: readonly FieldDefinition[]): CompiledSafeTemplate {
  const diagnostics: TemplateDiagnostic[] = [];
  let compatibility: TemplateCompatibility = "safe-equivalent";
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(source)) {
    compatibility = "preserved-only";
    addDiagnostic(diagnostics, "template-script", "Das Anki-Template enthält aktiven Code und wird deshalb nicht ausgeführt.");
  }
  const root: SafeTemplateAstNode[] = [];
  const stack: Array<{ sourceName: string; nodes: SafeTemplateAstNode[] }> = [{ sourceName: "", nodes: root }];
  let cursor = 0;
  for (const match of source.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const index = match.index ?? 0;
    if (index > cursor) stack.at(-1)?.nodes.push({ kind: "text", value: source.slice(cursor, index) });
    cursor = index + match[0].length;
    const expression = match[1].trim();
    const control = expression[0];
    if (control === "#" || control === "^") {
      const sourceName = expression.slice(1).trim();
      const field = fields.find((candidate) => candidate.name === sourceName);
      if (!field && !SPECIAL_FIELDS.has(sourceName)) addDiagnostic(diagnostics, "unknown-field", `Das Template referenziert das unbekannte Feld „${sourceName}“.`, sourceName);
      const node: SafeTemplateAstNode = { kind: "conditional", fieldId: field?.id ?? `special:${sourceName}`, sourceName, inverted: control === "^", children: [] };
      stack.at(-1)?.nodes.push(node);
      stack.push({ sourceName, nodes: node.children });
      continue;
    }
    if (control === "/") {
      const sourceName = expression.slice(1).trim();
      if (stack.length === 1 || stack.at(-1)?.sourceName !== sourceName) {
        compatibility = "preserved-only";
        addDiagnostic(diagnostics, "invalid-conditional", "Das Template enthält eine nicht ausbalancierte Bedingung.", sourceName, "error");
      } else stack.pop();
      continue;
    }
    if (expression === "FrontSide") {
      stack.at(-1)?.nodes.push({ kind: "front-side" });
      continue;
    }
    const segments = expression.split(":").map((segment) => segment.trim());
    const sourceName = segments.pop() ?? "";
    const customFilter = segments.find((filter) => filter && !SAFE_FILTERS.has(filter));
    if (customFilter) {
      compatibility = "preserved-only";
      addDiagnostic(diagnostics, "custom-filter", `Der benutzerdefinierte Filter „${customFilter}“ ist erhalten, wird aber nicht ausgeführt.`, customFilter);
    } else if (segments.some((filter) => ["hint", "tts", "type"].includes(filter)) && compatibility === "safe-equivalent") compatibility = "safe-with-differences";
    const field = fields.find((candidate) => candidate.name === sourceName);
    if (!field && !SPECIAL_FIELDS.has(sourceName)) addDiagnostic(diagnostics, "unknown-field", `Das Template referenziert das unbekannte Feld „${sourceName}“.`, sourceName);
    stack.at(-1)?.nodes.push({ kind: "field", fieldId: field?.id ?? `special:${sourceName}`, sourceName, filters: segments });
  }
  if (cursor < source.length) stack.at(-1)?.nodes.push({ kind: "text", value: source.slice(cursor) });
  if (stack.length > 1) {
    compatibility = "preserved-only";
    addDiagnostic(diagnostics, "invalid-conditional", "Das Template enthält eine nicht geschlossene Bedingung.", stack.at(-1)?.sourceName ?? null, "error");
  }
  return { ast: { schemaVersion: 1, source, nodes: root }, compatibility, diagnostics };
}
