import { buildSrcdoc } from "./cardPresentationFrame.ts";
export { resolvePresentationMedia } from "./cardPresentationFrame.ts";
import type {
  CardVariant,
  LearningItem,
  NoteTypeDefinitionV1,
  SafeTemplateAst,
  SafeTemplateAstNode,
  VariantProjection,
} from "./coreTypes.ts";
import { sanitizeCardHtml, stripHtml } from "./htmlSafety.ts";
import { compileSafeTemplate, type CompiledSafeTemplate, type TemplateCompatibility, type TemplateDiagnostic } from "./safeTemplate.ts";

export type PresentationCompatibility = TemplateCompatibility;
export type PresentationDiagnostic = TemplateDiagnostic;

export interface PresentationResult {
  srcdoc: string;
  accessibleText: string;
  mediaReferences: string[];
  interactions: Array<"hint" | "typed-answer" | "tts" | "audio" | "video">;
  compatibility: PresentationCompatibility;
  diagnostics: PresentationDiagnostic[];
}

const compiledRecipeTemplates = new Map<string, CompiledSafeTemplate>();
const NETWORK_URL = /^(?:https?:)?\/\//i;
type PresentationVariant = CardVariant & { projection: VariantProjection };

function addDiagnostic(
  diagnostics: PresentationDiagnostic[],
  code: string,
  message: string,
  detail: string | null = null,
  level: PresentationDiagnostic["level"] = "warning",
) {
  if (!diagnostics.some((candidate) => candidate.code === code && candidate.detail === detail)) {
    diagnostics.push({ code, level, message, detail });
  }
}

function compileRecipeTemplate(
  definition: NoteTypeDefinitionV1,
  recipeId: string,
  side: "front" | "back",
  ast: SafeTemplateAst,
): CompiledSafeTemplate {
  if (!ast.source) return { ast, compatibility: "safe-equivalent", diagnostics: [] };
  const key = `${definition.semanticHash}:${recipeId}:${side}:${ast.source}`;
  const cached = compiledRecipeTemplates.get(key);
  if (cached) return cached;
  const compiled = compileSafeTemplate(ast.source, definition.fields);
  if (compiledRecipeTemplates.size >= 256) compiledRecipeTemplates.delete(compiledRecipeTemplates.keys().next().value!);
  compiledRecipeTemplates.set(key, compiled);
  return compiled;
}

function specialFieldValue(name: string, item: LearningItem, variant: PresentationVariant, definition: NoteTypeDefinitionV1): string {
  if (name === "Tags") return item.tags.join(" ");
  if (name === "Deck") return String(item.meta.sourceDeckName ?? item.deckId);
  if (name === "Subdeck") return String(item.meta.sourceSubdeckName ?? "");
  if (name === "Card") return String(variant.meta.recipeName ?? "");
  if (name === "Type") return definition.name;
  return "";
}

function clozeValue(value: string, ordinal: number, side: "question" | "answer"): string {
  return value.replace(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/gi, (_match, rawOrdinal, answer, hint) => {
    if (Number(rawOrdinal) !== ordinal || side === "answer") return answer;
    return `<span class="cloze" data-cloze-ordinal="${ordinal}">[${hint || "…"}]</span>`;
  });
}

function renderFilter(value: string, filters: string[], variant: PresentationVariant, side: "question" | "answer"): string {
  let rendered = value;
  for (const filter of filters) {
    if (filter === "text") rendered = stripHtml(rendered);
    if (filter === "cloze" && variant.projection.kind === "cloze") {
      rendered = clozeValue(rendered, variant.projection.clozeOrdinal, side);
    }
    if (filter === "furigana") rendered = rendered.replace(/([^\s >]+)\[([^\]]+)\]/g, "<ruby>$1<rt>$2</rt></ruby>");
    if (filter === "kanji") rendered = rendered.replace(/([^\s >]+)\[[^\]]+\]/g, "$1");
    if (filter === "kana") rendered = rendered.replace(/[^\s >]+\[([^\]]+)\]/g, "$1");
    if (filter === "hint" && rendered) rendered = `<span class="core-hint" data-core-interaction="hint">${rendered}</span>`;
    if (filter === "type") rendered = `<span data-core-interaction="typed-answer"></span>`;
  }
  return rendered;
}

function hasTemplateFieldValue(value: string): boolean {
  return value.trim().length > 0;
}

function renderAst(
  nodes: SafeTemplateAstNode[],
  context: {
    values: Map<string, string>;
    item: LearningItem;
    variant: PresentationVariant;
    definition: NoteTypeDefinitionV1;
    side: "question" | "answer";
    frontSide: string;
  },
): string {
  return nodes.map((node) => {
    if (node.kind === "text") return node.value;
    if (node.kind === "front-side") return context.frontSide;
    const rawValue = node.fieldId.startsWith("special:")
      ? specialFieldValue(node.sourceName, context.item, context.variant, context.definition)
      : context.values.get(node.fieldId) ?? "";
    if (node.kind === "conditional") {
      const present = hasTemplateFieldValue(rawValue);
      return present !== node.inverted ? renderAst(node.children, context) : "";
    }
    return renderFilter(rawValue, node.filters, context.variant, context.side);
  }).join("");
}

function safeCss(css: string, diagnostics: PresentationDiagnostic[]): string {
  let output = css.replace(/@import\s+(?:url\()?\s*[^;]+;?/gi, () => {
    addDiagnostic(diagnostics, "external-css", "Externe CSS-Imports wurden aus Sicherheitsgründen entfernt.");
    return "";
  });
  output = output.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote, rawUrl) => {
    const url = String(rawUrl).trim();
    if (!NETWORK_URL.test(url) && !/^javascript:/i.test(url)) return match;
    addDiagnostic(diagnostics, "external-css-resource", "Eine externe CSS-Ressource wurde aus Sicherheitsgründen entfernt.", url);
    return "none";
  });
  return output.replace(/<\/style/gi, "<\\/style");
}

function mediaReferences(html: string, css: string): string[] {
  const refs = new Set<string>();
  const collect = (value: string) => {
    const cleaned = value.trim().replace(/^['"]|['"]$/g, "");
    if (cleaned && !/^(?:data:|blob:|#|javascript:)/i.test(cleaned) && !NETWORK_URL.test(cleaned)) refs.add(cleaned);
  };
  for (const match of html.matchAll(/\s(?:src|poster)=(["'][^"']+["']|[^\s>]+)/gi)) collect(match[1]);
  for (const match of css.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) collect(match[1]);
  return [...refs];
}

function projectAnkiAudio(html: string): string {
  return html.replace(/\[sound:([^\]\r\n]+)\]/gi, (_match, rawName: string) => {
    const name = rawName.trim();
    return name ? `<audio controls preload="none" src="${escapeHtml(name)}"></audio>` : "";
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldFallback(
  item: LearningItem,
  variant: PresentationVariant,
  reason: string,
  side: "question" | "answer",
  surface: "editor-preview" | "card-management" | "review",
): string {
  if (surface === "review") {
    const content = side === "question" ? variant.front : variant.back;
    if (stripHtml(content).trim()) return sanitizeCardHtml(content);
  }
  const sideFields = surface === "review"
    ? item.contentDocument.fields.filter((field) => side === "question"
      ? field.placement === "front" || field.placement === "both"
      : field.placement === "back" || field.placement === "both")
    : item.contentDocument.fields;
  const fields = sideFields.map((field) =>
    `<section class="core-fallback-field"><h3>${escapeHtml(field.name)}</h3><div>${sanitizeCardHtml(field.value)}</div></section>`,
  ).join("");
  const emptyMessage = surface === "review" && !fields
    ? `<p>${side === "question" ? "Keine sichere Vorderseitenprojektion verfügbar." : "Keine sichere Rückseitenprojektion verfügbar."}</p>`
    : "";
  return `<div class="core-compatibility-notice" role="note">${escapeHtml(reason)}</div>${fields}${emptyMessage}`;
}

export function renderLearningItemPresentation(input: {
  item: LearningItem;
  variant?: CardVariant | null;
  definition: NoteTypeDefinitionV1;
  side: "question" | "answer";
  surface: "editor-preview" | "card-management" | "review";
  theme: "light" | "dark";
  fontFaceCss?: string;
}): PresentationResult {
  const variant = {
    ...(input.variant ?? {}),
    front: input.variant?.front ?? input.item.originalFront,
    back: input.variant?.back ?? input.item.originalBack,
    meta: input.variant?.meta ?? input.item.meta,
    projection: input.item.projection,
  } as PresentationVariant;
  const recipe = input.definition.recipes.find((candidate) => candidate.id === input.item.projection.recipeId) ?? null;
  const diagnostics: PresentationDiagnostic[] = [];
  if (!recipe) {
    addDiagnostic(diagnostics, "missing-recipe", "Das zugehörige Kartenrezept fehlt. Die Darstellung wird auf sicher zugeordnete Felder begrenzt.", null, "error");
  }
  const sourceAst = recipe ? (input.side === "question" ? recipe.front : recipe.back) : null;
  const compiled = recipe && sourceAst
    ? compileRecipeTemplate(input.definition, recipe.id, input.side === "question" ? "front" : "back", sourceAst)
    : { ast: sourceAst, compatibility: "safe-equivalent" as const, diagnostics: [] };
  diagnostics.push(...compiled.diagnostics);
  const preservedOnly = !recipe || compiled.compatibility === "preserved-only";
  let rawBodyHtml: string;
  if (input.definition.origin === "core") {
    rawBodyHtml = input.side === "question"
      ? variant.front
      : input.surface === "review"
        ? variant.back
        : [variant.front, variant.back]
          .filter((part) => stripHtml(part).trim())
          .join('<hr class="core-card-answer-separator" aria-hidden="true">');
  } else {
    const values = new Map(input.item.contentDocument.fields.map((field) => [field.id, field.value]));
    const omitFrontSide = input.surface === "review" && input.side === "answer";
    const frontAst = recipe && !omitFrontSide
      ? compileRecipeTemplate(input.definition, recipe.id, "front", recipe.front).ast
      : null;
    const frontSide = frontAst
      ? sanitizeCardHtml(renderAst(frontAst.nodes, { ...input, variant, values, side: "question", frontSide: "" }))
      : "";
    rawBodyHtml = preservedOnly || !compiled.ast
      ? fieldFallback(input.item, variant, diagnostics[0]?.message ?? "Die Originaldarstellung ist nicht sicher ausführbar.", input.side, input.surface)
      : renderAst(compiled.ast.nodes, { ...input, variant, values, frontSide });
    if (omitFrontSide && compiled.ast?.nodes.some((node) => node.kind === "front-side")) {
      rawBodyHtml = rawBodyHtml.replace(/^\s*<hr\b[^>]*>\s*/i, "");
    }
  }
  if (/\s(?:src|poster|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(rawBodyHtml)) {
    addDiagnostic(diagnostics, "external-html-resource", "Eine externe Ressource wurde aus Sicherheitsgründen entfernt.");
  }
  if (/<(?:form|iframe|object|embed)\b/i.test(rawBodyHtml)) {
    addDiagnostic(diagnostics, "active-html", "Ein aktives HTML-Element wurde aus Sicherheitsgründen entfernt.");
  }
  const bodyHtml = sanitizeCardHtml(projectAnkiAudio(rawBodyHtml));
  const css = safeCss(input.definition.css, diagnostics);
  const references = [...new Set([...input.item.mediaRefs, ...mediaReferences(bodyHtml, css)])];
  const interactions: PresentationResult["interactions"] = [];
  if (/data-core-interaction="hint"/.test(bodyHtml)) interactions.push("hint");
  if (/data-core-interaction="typed-answer"/.test(bodyHtml)) interactions.push("typed-answer");
  if (/<audio\b/i.test(bodyHtml)) interactions.push("audio");
  if (/<video\b/i.test(bodyHtml)) interactions.push("video");
  if (/\{\{tts\b|\btts:/i.test(sourceAst?.source ?? "")) interactions.push("tts");
  let compatibility: PresentationCompatibility = preservedOnly ? "preserved-only" : compiled.compatibility;
  if (diagnostics.some((diagnostic) => (diagnostic.code.startsWith("external-") || diagnostic.code === "active-html") && compatibility === "safe-equivalent")) {
    compatibility = "safe-with-differences";
  }
  return {
    srcdoc: buildSrcdoc(bodyHtml, css, input.theme, input.fontFaceCss, input.surface === "review"),
    accessibleText: stripHtml(bodyHtml).replace(/\s+/g, " ").trim(),
    mediaReferences: references,
    interactions,
    compatibility,
    diagnostics,
  };
}
