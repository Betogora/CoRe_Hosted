import type {
  CardType,
  CardVariant,
  FieldDefinition,
  ForeignNoteSnapshot,
  LearningItem,
  LearningItemDocumentV1,
  NoteTypeDefinitionV1,
  ReviewRecipe,
  SafeTemplateAst,
  SafeTemplateAstNode,
  TemplateConditionAst,
  VariantProjection,
} from "../coreTypes.ts";
import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import { makeId, stableContentHash } from "./coreValues.ts";
import { createCardVariant, createCoreCard, getOriginalVariant } from "./learningItems.ts";
import { normalizeLearningItemDocument } from "./learningItemDocument.ts";
import { createVersionEntry } from "./reviewState.ts";
import { compileSafeTemplate } from "../safeTemplate.ts";

export type ContentApplicationReason = "create" | "edit" | "import" | "reimport" | "migration";

export interface ContentApplicationResult {
  item: LearningItem;
  definition: NoteTypeDefinitionV1;
  sourceSnapshot: ForeignNoteSnapshot | null;
  createdVariantIds: string[];
  updatedVariantIds: string[];
  disabledVariantIds: string[];
}

interface VariantSeed {
  projection: VariantProjection;
  recipe: ReviewRecipe;
  front: string;
  back: string;
}

export interface ProjectedLearningItemVariant extends VariantSeed {
  variantType: CardVariant["variantType"];
  variantLevel: number;
}

export interface LearningItemContentProjection {
  definition: NoteTypeDefinitionV1;
  document: LearningItemDocumentV1;
  variants: ProjectedLearningItemVariant[];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeFieldDefinition(value: unknown, ordinal: number, definitionId: string): FieldDefinition {
  const input = objectRecord(value);
  const name = String(input.name ?? `Feld ${ordinal + 1}`).trim() || `Feld ${ordinal + 1}`;
  const id = String(input.id ?? "").trim()
    || stableContentHash({ definitionId, ordinal, name }, "field-definition");
  return {
    id,
    sourceFieldId: typeof input.sourceFieldId === "string" && input.sourceFieldId ? input.sourceFieldId : null,
    name,
    ordinal,
    rtl: input.rtl === true,
    sticky: input.sticky === true,
    fontName: typeof input.fontName === "string" && input.fontName ? input.fontName : null,
    fontSize: Number.isFinite(Number(input.fontSize)) ? Number(input.fontSize) : null,
    description: String(input.description ?? ""),
    plainText: input.plainText === true,
    collapsed: input.collapsed === true,
    excludeFromSearch: input.excludeFromSearch === true,
    preventDeletion: input.preventDeletion === true,
    sourceConfigBase64: typeof input.sourceConfigBase64 === "string" ? input.sourceConfigBase64 : null,
    sourceConfig: objectRecord(input.sourceConfig),
  };
}

function normalizeTemplateAst(value: unknown): SafeTemplateAst {
  const input = objectRecord(value);
  return {
    schemaVersion: 1,
    source: String(input.source ?? ""),
    nodes: Array.isArray(input.nodes) ? input.nodes as SafeTemplateAstNode[] : [],
  };
}

function normalizeCondition(value: unknown): TemplateConditionAst {
  const input = objectRecord(value);
  if (input.kind === "field") {
    return { kind: "field", fieldId: String(input.fieldId ?? ""), present: input.present !== false };
  }
  if ((input.kind === "all" || input.kind === "any") && Array.isArray(input.conditions)) {
    return { kind: input.kind, conditions: input.conditions.map(normalizeCondition) };
  }
  return { kind: "always" };
}

function normalizeRecipe(value: unknown, ordinal: number, definitionId: string): ReviewRecipe {
  const input = objectRecord(value);
  const interaction = ["reveal", "cloze", "choice", "image-occlusion"].includes(String(input.interaction))
    ? input.interaction as ReviewRecipe["interaction"]
    : "reveal";
  return {
    id: String(input.id ?? "").trim() || `${definitionId}-recipe-${ordinal + 1}`,
    sourceTemplateId: typeof input.sourceTemplateId === "string" && input.sourceTemplateId ? input.sourceTemplateId : null,
    name: String(input.name ?? `Karte ${ordinal + 1}`),
    ordinal,
    generationRule: normalizeCondition(input.generationRule),
    front: normalizeTemplateAst(input.front),
    back: normalizeTemplateAst(input.back),
    browserFront: input.browserFront ? normalizeTemplateAst(input.browserFront) : null,
    browserBack: input.browserBack ? normalizeTemplateAst(input.browserBack) : null,
    targetDeckId: typeof input.targetDeckId === "string" && input.targetDeckId ? input.targetDeckId : null,
    interaction,
    sourceConfigBase64: typeof input.sourceConfigBase64 === "string" ? input.sourceConfigBase64 : null,
    sourceConfig: objectRecord(input.sourceConfig),
  };
}

export function normalizeNoteTypeDefinition(value: NoteTypeDefinitionV1): NoteTypeDefinitionV1 {
  const input = objectRecord(value);
  const id = String(input.id ?? "").trim() || makeId("note-type");
  const fields = Array.isArray(input.fields)
    ? input.fields.map((field, ordinal) => normalizeFieldDefinition(field, ordinal, id))
    : [];
  const recipes = Array.isArray(input.recipes)
    ? input.recipes.map((recipe, ordinal) => normalizeRecipe(recipe, ordinal, id))
    : [];
  const sourceSnapshot = input.sourceDefinitionSnapshot ? objectRecord(input.sourceDefinitionSnapshot) : null;
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString();
  const definition: NoteTypeDefinitionV1 = {
    id,
    revision: Number.isFinite(Number(input.revision)) && Number(input.revision) > 0 ? Math.floor(Number(input.revision)) : 1,
    semanticHash: "",
    origin: input.origin === "anki" ? "anki" : "core",
    kind: input.kind === "cloze" || input.kind === "image-occlusion" ? input.kind : "normal",
    name: String(input.name ?? "Dynamische Karte"),
    fields,
    recipes,
    css: String(input.css ?? ""),
    latexConfig: input.latexConfig ? objectRecord(input.latexConfig) : null,
    sourceDefinitionSnapshot: sourceSnapshot ? {
      sourceFormat: sourceSnapshot.sourceFormat === "latest" ? "latest" : "legacy",
      sourceNotetypeId: String(sourceSnapshot.sourceNotetypeId ?? ""),
      sourceName: String(sourceSnapshot.sourceName ?? input.name ?? ""),
      rawConfigBase64: typeof sourceSnapshot.rawConfigBase64 === "string" ? sourceSnapshot.rawConfigBase64 : null,
      decodedConfig: objectRecord(sourceSnapshot.decodedConfig),
      unknownData: objectRecord(sourceSnapshot.unknownData),
    } : null,
    supersedesId: typeof input.supersedesId === "string" && input.supersedesId ? input.supersedesId : null,
    createdAt,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : createdAt,
    deletedAt: typeof input.deletedAt === "string" ? input.deletedAt : null,
  };
  definition.semanticHash = stableContentHash({
    origin: definition.origin,
    kind: definition.kind,
    fields: definition.fields,
    recipes: definition.recipes,
    css: definition.css,
    latexConfig: definition.latexConfig,
  }, "note-type");
  return definition;
}

function fieldNodes(document: LearningItemDocumentV1, side: "front" | "back"): SafeTemplateAstNode[] {
  return document.fields
    .filter((field) => field.placement === side || field.placement === "both")
    .flatMap((field, index) => [
      ...(index ? [{ kind: "text", value: '<div class="core-field-separator" aria-hidden="true"></div>' } as const] : []),
      { kind: "field", fieldId: field.id, sourceName: field.name, filters: [] } as const,
    ]);
}

export function createCoreNoteTypeDefinition(input: {
  document: LearningItemDocumentV1;
  name?: string;
  kind?: NoteTypeDefinitionV1["kind"];
  reverse?: boolean;
  interaction?: ReviewRecipe["interaction"];
  createdAt?: string;
}): NoteTypeDefinitionV1 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const definitionId = input.document.definitionVersionId;
  const withInteractionFilters = (nodes: SafeTemplateAstNode[]) => nodes.map((node) =>
    node.kind === "field" && input.kind === "cloze" ? { ...node, filters: ["cloze"] } : node,
  );
  const front: SafeTemplateAst = { schemaVersion: 1, source: "", nodes: withInteractionFilters(fieldNodes(input.document, "front")) };
  const back: SafeTemplateAst = { schemaVersion: 1, source: "", nodes: withInteractionFilters(fieldNodes(input.document, "back")) };
  const recipes: ReviewRecipe[] = [{
    id: `${definitionId}-forward`,
    sourceTemplateId: null,
    name: "Vorwärts",
    ordinal: 0,
    generationRule: { kind: "always" },
    front,
    back,
    browserFront: null,
    browserBack: null,
    targetDeckId: null,
    interaction: input.interaction ?? (input.kind === "cloze" ? "cloze" : "reveal"),
    sourceConfigBase64: null,
    sourceConfig: {},
  }];
  if (input.reverse && (input.interaction ?? "reveal") === "reveal") {
    recipes.push({ ...recipes[0], id: `${definitionId}-reverse`, name: "Rückwärts", ordinal: 1, front: back, back: front });
  }
  return normalizeNoteTypeDefinition({
    id: definitionId,
    revision: 1,
    semanticHash: "",
    origin: "core",
    kind: input.kind ?? "normal",
    name: input.name ?? "Dynamische Karte",
    fields: input.document.fields.map((field, ordinal) => ({
      id: field.id,
      sourceFieldId: field.sourceFieldId,
      name: field.name,
      ordinal,
      rtl: false,
      sticky: false,
      fontName: null,
      fontSize: null,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      preventDeletion: false,
      sourceConfigBase64: null,
      sourceConfig: {},
    })),
    recipes,
    css: "",
    latexConfig: null,
    sourceDefinitionSnapshot: null,
    supersedesId: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  });
}

function evaluateCondition(condition: TemplateConditionAst, fields: Map<string, string>): boolean {
  if (condition.kind === "always") return true;
  if (condition.kind === "field") return Boolean(stripHtml(fields.get(condition.fieldId) ?? "").trim()) === condition.present;
  return condition.kind === "all"
    ? condition.conditions.every((child) => evaluateCondition(child, fields))
    : condition.conditions.some((child) => evaluateCondition(child, fields));
}

function renderNodes(nodes: SafeTemplateAstNode[], fields: Map<string, string>, frontSide = ""): string {
  return nodes.map((node) => {
    if (node.kind === "text") return node.value;
    if (node.kind === "front-side") return frontSide;
    const value = fields.get(node.fieldId) ?? "";
    if (node.kind === "conditional") {
      return Boolean(stripHtml(value).trim()) !== node.inverted ? renderNodes(node.children, fields, frontSide) : "";
    }
    return node.filters.includes("text") ? stripHtml(value) : value;
  }).join("");
}

function clozeOrdinals(document: LearningItemDocumentV1): number[] {
  const ordinals = new Set<number>();
  for (const field of document.fields) {
    for (const match of field.value.matchAll(/\{\{c(\d+)::/gi)) ordinals.add(Number(match[1]));
  }
  return [...ordinals].filter((value) => value > 0).sort((a, b) => a - b);
}

function clozeDetails(document: LearningItemDocumentV1, ordinal: number) {
  const matches = document.fields.flatMap((field) => [...field.value.matchAll(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/gi)]);
  return matches.filter((match) => Number(match[1]) === ordinal);
}

function renderCloze(value: string, ordinal: number, side: "question" | "answer"): string {
  return value.replace(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/gi, (_match, rawOrdinal, answer, hint) => {
    if (Number(rawOrdinal) !== ordinal || side === "answer") return answer;
    return `<span class="cloze" data-cloze-ordinal="${ordinal}">[${hint || "…"}]</span>`;
  });
}

function projectionKey(projection: VariantProjection): string {
  if (projection.kind === "cloze") return `cloze:${projection.recipeId}:${projection.clozeOrdinal}`;
  if (projection.kind === "image-occlusion") return `image-occlusion:${projection.recipeId}:${projection.regionKey}`;
  return `template:${projection.recipeId}:${projection.instanceKey}`;
}

function createVariantSeeds(document: LearningItemDocumentV1, definition: NoteTypeDefinitionV1): VariantSeed[] {
  const fields = new Map(document.fields.map((field) => [field.id, field.value]));
  const safeFallback = document.fields.map((field) =>
    `<section><h3>${field.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h3>${field.value}</section>`,
  ).join("");
  const seeds: VariantSeed[] = [];
  for (const recipe of definition.recipes) {
    if (!evaluateCondition(recipe.generationRule, fields)) continue;
    const compiledFront = recipe.front.nodes.length === 0 && recipe.front.source
      ? compileSafeTemplate(recipe.front.source, definition.fields)
      : null;
    const compiledBack = recipe.back.nodes.length === 0 && recipe.back.source
      ? compileSafeTemplate(recipe.back.source, definition.fields)
      : null;
    if (compiledFront?.compatibility === "preserved-only" || compiledBack?.compatibility === "preserved-only") {
      seeds.push({
        recipe,
        projection: { kind: "template", recipeId: recipe.id, instanceKey: "safe-fallback" },
        front: sanitizeCardHtml(safeFallback),
        back: sanitizeCardHtml(safeFallback),
      });
      continue;
    }
    let frontNodes = compiledFront?.ast.nodes ?? recipe.front.nodes;
    let backNodes = compiledBack?.ast.nodes ?? recipe.back.nodes;
    if (frontNodes.length === 0 && backNodes.length === 0) {
      if (recipe.interaction === "cloze") {
        const clozeNodes: SafeTemplateAstNode[] = definition.fields.flatMap((field, index): SafeTemplateAstNode[] => [
          ...(index ? [{ kind: "text", value: "<br>" } as SafeTemplateAstNode] : []),
          { kind: "field", fieldId: field.id, sourceName: field.name, filters: ["cloze"] },
        ]);
        frontNodes = clozeNodes;
        backNodes = clozeNodes;
      } else {
        seeds.push({
          recipe,
          projection: { kind: "template", recipeId: recipe.id, instanceKey: "safe-fallback" },
          front: sanitizeCardHtml(safeFallback),
          back: sanitizeCardHtml(safeFallback),
        });
        continue;
      }
    }
    if (recipe.interaction === "cloze") {
      for (const ordinal of clozeOrdinals(document)) {
        const clozeFields = new Map([...fields].map(([id, value]) => [id, renderCloze(value, ordinal, "question")]));
        const front = renderNodes(frontNodes, clozeFields);
        const answerFields = new Map([...fields].map(([id, value]) => [id, renderCloze(value, ordinal, "answer")]));
        seeds.push({
          recipe,
          projection: { kind: "cloze", recipeId: recipe.id, clozeOrdinal: ordinal },
          front: sanitizeCardHtml(front),
          back: sanitizeCardHtml(renderNodes(backNodes, answerFields, front)),
        });
      }
      continue;
    }
    const front = sanitizeCardHtml(renderNodes(frontNodes, fields));
    const choice = recipe.interaction === "choice" ? document.interaction?.choice : null;
    const choiceBack = choice
      ? `<p><strong>Richtige Antwort:</strong> ${choice.correctAnswer.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>${choice.explanation}`
      : null;
    seeds.push({
      recipe,
      projection: recipe.interaction === "image-occlusion"
        ? { kind: "image-occlusion", recipeId: recipe.id, regionKey: "default" }
        : { kind: "template", recipeId: recipe.id, instanceKey: "default" },
      front,
      back: sanitizeCardHtml(choiceBack ?? renderNodes(backNodes, fields, front)),
    });
  }
  return seeds;
}

function compatibilityCardType(definition: NoteTypeDefinitionV1, previousType?: CardType): CardType {
  if (definition.kind === "cloze") return "cloze";
  if (definition.kind === "image-occlusion") return "image-occlusion";
  if (definition.recipes.some((recipe) => recipe.interaction === "choice")) return "multiple-choice";
  if (definition.origin === "core" && (previousType === "basic-reversed" || definition.recipes.length > 1)) return "basic-reversed";
  return "basic";
}

export function projectLearningItemContent(input: {
  previous?: LearningItem | null;
  document: LearningItemDocumentV1;
  definition: NoteTypeDefinitionV1;
}): LearningItemContentProjection {
  const definition = normalizeNoteTypeDefinition(input.definition);
  const document = normalizeLearningItemDocument(
    { ...input.document, definitionVersionId: definition.id },
    {
      definitionVersionId: definition.id,
      fields: input.previous?.originalFields,
      front: input.previous?.originalFront,
      back: input.previous?.originalBack,
      tags: input.previous?.tags,
      mediaRefs: input.previous?.mediaRefs,
    },
  );
  const seeds = createVariantSeeds(document, definition);
  if (seeds.length === 0) {
    const recipe = createCoreNoteTypeDefinition({ document }).recipes[0];
    const fallbackHtml = sanitizeCardHtml(document.fields.map((field) =>
      `<section><h3>${field.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h3>${field.value}</section>`,
    ).join(""));
    seeds.push({
      recipe,
      projection: { kind: "template", recipeId: recipe.id, instanceKey: "fallback" },
      front: fallbackHtml,
      back: fallbackHtml,
    });
  }
  return {
    definition,
    document,
    variants: seeds.map((seed, index) => ({
      ...seed,
      variantType: seed.projection.kind === "cloze"
        ? "cloze"
        : seed.projection.kind === "image-occlusion"
          ? "image_occlusion"
          : seed.recipe.interaction === "choice"
            ? "mcq"
            : definition.origin === "core" && seed.recipe.ordinal > 0
              ? "reverse"
              : "basic",
      variantLevel: index === 0 ? 1 : 2,
    })),
  };
}

export function applyLearningItemContent(input: {
  previous: LearningItem | null;
  base?: Partial<LearningItem>;
  document: LearningItemDocumentV1;
  definition: NoteTypeDefinitionV1;
  sourceSnapshot?: ForeignNoteSnapshot | null;
  reason: ContentApplicationReason;
}): ContentApplicationResult {
  const projection = projectLearningItemContent(input);
  const { definition, document } = projection;
  const applicationTime = input.previous && input.reason !== "migration" ? new Date().toISOString() : definition.updatedAt;
  const itemId = input.previous?.id ?? input.base?.id ?? makeId("card");

  const previousVariants = input.previous?.variants ?? [];
  const previousByProjection = new Map<string, CardVariant>();
  for (const variant of previousVariants) {
    const key = projectionKey(variant.projection);
    const existing = previousByProjection.get(key);
    if (!existing || (existing.isOriginal && !variant.isOriginal)) previousByProjection.set(key, variant);
  }
  const usedPreviousIds = new Set<string>();
  const createdVariantIds: string[] = [];
  const updatedVariantIds: string[] = [];
  const activeVariants = projection.variants.map((seed, index) => {
    const key = projectionKey(seed.projection);
    const clozeOrdinal = seed.projection.kind === "cloze" ? seed.projection.clozeOrdinal : null;
    const previous = previousByProjection.get(key)
      ?? (clozeOrdinal !== null
        ? previousVariants.find((variant) => !usedPreviousIds.has(variant.id) && variant.variantType === "cloze" && Number(variant.meta.clozeGroup) === clozeOrdinal)
        : previousVariants.find((variant) => !usedPreviousIds.has(variant.id) && (seed.variantType === "reverse" ? variant.variantType === "reverse" : variant.isOriginal)));
    if (previous) usedPreviousIds.add(previous.id);
    const id = previous?.id ?? stableContentHash({ itemId, definitionId: definition.id, projection: seed.projection }, "variant");
    if (previous) updatedVariantIds.push(id); else createdVariantIds.push(id);
    const clozes = seed.projection.kind === "cloze" ? clozeDetails(document, seed.projection.clozeOrdinal) : [];
    const choice = seed.recipe.interaction === "choice" ? document.interaction?.choice : null;
    return createCardVariant({
      ...(previous ?? {}),
      id,
      learningItemId: itemId,
      cardId: itemId,
      sourceCardId: input.previous?.sourceCardId ?? input.base?.sourceCardId ?? itemId,
      variantType: seed.variantType,
      variantLevel: index === 0 ? 1 : Math.max(seed.variantLevel, previous?.variantLevel ?? 2),
      front: seed.front,
      back: seed.back,
      generationSource: definition.origin === "anki" ? "imported" : index === 0 ? "original" : "user_edited",
      parentVariantId: index === 0 ? null : undefined,
      anchorVariantId: index === 0 ? null : undefined,
      isOriginal: index === 0,
      isActive: true,
      qualityStatus: "active",
      transformType: index === 0 ? "original" : seed.projection.kind === "cloze" ? "cloze_conversion" : "front_back_style_shift",
      projection: seed.projection,
      studyDeckId: seed.recipe.targetDeckId,
      schedulingMode: "independent-card",
      renderRevision: (previous?.renderRevision ?? 0) + 1,
      updatedAt: applicationTime,
      sourceAnchors: input.previous?.sourceAnchors ?? input.base?.sourceAnchors ?? [],
      explanation: choice?.explanation ?? (definition.kind === "cloze" ? document.fields[1]?.value : null) ?? previous?.explanation,
      answerOptionsJson: choice?.options ?? previous?.answerOptionsJson,
      expectedAnswerJson: choice?.correctAnswer ?? (clozes.length ? clozes.map((match) => match[2]) : previous?.expectedAnswerJson),
      hintsJson: clozes.length ? clozes.map((match) => match[3]).filter(Boolean) : previous?.hintsJson,
      meta: {
        ...(previous?.meta ?? {}),
        recipeName: seed.recipe.name,
        definitionVersionId: definition.id,
        ...(seed.projection.kind === "cloze" ? { clozeGroup: seed.projection.clozeOrdinal } : {}),
      },
    });
  });
  const anchorId = activeVariants[0].id;
  const disabledVariants = previousVariants
    .filter((variant) => !usedPreviousIds.has(variant.id))
    .map((variant) => createCardVariant({
      ...variant,
      isOriginal: false,
      isActive: false,
      qualityStatus: "disabled",
      parentVariantId: anchorId,
      anchorVariantId: anchorId,
    }));
  const disabledVariantIds = disabledVariants.map((variant) => variant.id);
  const first = activeVariants[0];
  const compatibilityFront = definition.kind === "cloze"
    ? document.fields[0]?.value ?? ""
    : first.front;
  const compatibilityBack = definition.kind === "cloze"
    ? document.fields[1]?.value ?? ""
    : first.back;
  const nextContentRevision = input.previous ? input.previous.contentRevision + 1 : 1;
  const item = createCoreCard({
    ...(input.base ?? {}),
    ...(input.previous ?? {}),
    id: itemId,
    cardType: compatibilityCardType(definition, input.previous?.cardType ?? input.base?.cardType),
    canonicalQuestion: compatibilityFront,
    canonicalAnswer: compatibilityBack,
    originalFront: compatibilityFront,
    originalBack: compatibilityBack,
    originalFields: document.fields.map((field) => ({ name: field.name, value: field.value })),
    originalTags: document.tags,
    tags: document.tags,
    mediaRefs: document.mediaRefs,
    variants: [...activeVariants, ...disabledVariants],
    noteTypeDefinitionId: definition.id,
    contentDocument: document,
    latestSourceSnapshotId: input.sourceSnapshot?.id ?? input.previous?.latestSourceSnapshotId ?? null,
    contentRevision: nextContentRevision,
    source: input.previous?.source ?? input.base?.source ?? (definition.origin === "anki" ? "anki-apkg" : "manual"),
    sourceType: input.previous?.sourceType ?? input.base?.sourceType ?? (definition.origin === "anki" ? "anki_import" : "manual"),
    createdAt: input.previous?.createdAt ?? input.base?.createdAt ?? definition.createdAt,
    updatedAt: applicationTime,
    revision: input.previous ? input.previous.revision + 1 : input.base?.revision ?? 1,
    immutableOriginal: input.previous?.immutableOriginal ?? null,
    versionLog: [
      ...(input.previous?.versionLog ?? []),
      createVersionEntry({
        objectType: "card",
        objectId: itemId,
        changeType: input.reason === "edit" ? "content_updated" : `content_${input.reason}`,
        before: input.previous?.contentDocument ?? null,
        after: document,
        reason: input.reason,
        createdAt: applicationTime,
      }),
    ],
    meta: {
      ...(input.previous?.meta ?? {}),
      contentModelVersion: 1,
      noteTypeSemanticHash: definition.semanticHash,
      ...(document.interaction?.choice ? {
        answerOptions: document.interaction.choice.options,
        correctAnswer: document.interaction.choice.correctAnswer,
        expectedAnswer: document.interaction.choice.correctAnswer,
      } : {}),
      ...(definition.kind === "cloze" ? { clozeGroupCount: activeVariants.length } : {}),
    },
  });

  const original = getOriginalVariant(item);
  if (!original || projectionKey(original.projection) !== projectionKey(first.projection)) {
    throw new Error("Die atomare Inhaltsanwendung konnte keine stabile Originalvariante erzeugen.");
  }
  return { item, definition, sourceSnapshot: input.sourceSnapshot ?? null, createdVariantIds, updatedVariantIds, disabledVariantIds };
}

export function saveLearningItemDocumentValues(input: {
  previous: LearningItem;
  definition: NoteTypeDefinitionV1;
  fields: Array<{ id: string; value: string }>;
  tags?: string[];
}): ContentApplicationResult {
  const definition = normalizeNoteTypeDefinition(input.definition);
  if (definition.id !== input.previous.noteTypeDefinitionId) {
    throw new Error("Die Notetype-Definition gehört nicht zu dieser Karte.");
  }
  const values = new Map(input.fields.map((field) => [field.id, field.value]));
  const knownIds = new Set(input.previous.contentDocument.fields.map((field) => field.id));
  if (values.size !== knownIds.size || [...values.keys()].some((id) => !knownIds.has(id))) {
    throw new Error("Importierte Feldschemas können hier nicht strukturell verändert werden.");
  }
  const result = applyLearningItemContent({
    previous: input.previous,
    definition,
    document: {
      ...input.previous.contentDocument,
      fields: input.previous.contentDocument.fields.map((field) => ({ ...field, value: values.get(field.id) ?? field.value })),
      tags: input.tags ?? input.previous.contentDocument.tags,
    },
    reason: "edit",
  });
  if (Array.isArray(input.previous.meta.reimportConflicts) && input.previous.meta.reimportConflicts.length > 0) {
    result.item.meta = {
      ...result.item.meta,
      reimportConflicts: [],
      reimportConflictDefault: null,
      reimportConflictsResolvedAt: result.item.updatedAt,
    };
  }
  return result;
}
