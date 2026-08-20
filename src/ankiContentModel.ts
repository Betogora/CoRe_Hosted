import { compileSafeTemplate } from "./safeTemplate.ts";
import type {
  FieldDefinition,
  LearningItemDocumentV1,
  NoteTypeDefinitionV1,
  ReviewRecipe,
  TemplateConditionAst,
} from "./coreTypes.ts";
import { stableContentHash } from "./coreModel.ts";
import { normalizeNoteTypeDefinition } from "./coreModel/learningItemContent.ts";

const definitionCache = new WeakMap<object, NoteTypeDefinitionV1>();

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" ? value as Record<string, any> : {};
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return { rawBase64: btoa(binary) };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]));
  }
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
  return String(value ?? "");
}

function sourceId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function createNoteBundle(
  input: Parameters<typeof createAnkiContentBundle>[0],
  definition: NoteTypeDefinitionV1,
): ReturnType<typeof createAnkiContentBundle> {
  const document: LearningItemDocumentV1 = {
    schemaVersion: 1,
    definitionVersionId: definition.id,
    fields: input.fieldValues.map((field, ordinal) => ({
      id: definition.fields[ordinal].id,
      sourceFieldId: definition.fields[ordinal].sourceFieldId,
      name: field.name,
      value: field.value,
      placement: "metadata",
      semanticRole: "unclassified",
    })),
    tags: [...input.tags],
    mediaRefs: [...new Set(input.mediaRefs)],
  };
  return { definition, document };
}

function generationRule(model: Record<string, any>, templateOrdinal: number, fields: FieldDefinition[]): TemplateConditionAst {
  const requirements = Array.isArray(model.config?.requirements)
    ? model.config.requirements
    : Array.isArray(model.req)
      ? model.req.map((requirement: any) => ({
          cardOrdinal: Number(requirement?.[0] ?? 0),
          kind: requirement?.[1] === "all" ? 2 : requirement?.[1] === "any" ? 1 : 0,
          fieldOrdinals: Array.isArray(requirement?.[2]) ? requirement[2].map(Number) : [],
        }))
      : [];
  const requirement = requirements.find((candidate: any) => Number(candidate.cardOrdinal) === templateOrdinal);
  if (!requirement) return { kind: "always" };
  const conditions = (requirement.fieldOrdinals ?? [])
    .map((ordinal: unknown) => fields[Number(ordinal)])
    .filter(Boolean)
    .map((field: FieldDefinition) => ({ kind: "field", fieldId: field.id, present: true } as const));
  if (Number(requirement.kind) === 0) return { kind: "any", conditions: [] };
  return { kind: Number(requirement.kind) === 2 ? "all" : "any", conditions };
}

export function createAnkiContentBundle(input: {
  model: unknown;
  fieldValues: Array<{ name: string; value: string }>;
  tags: string[];
  mediaRefs: string[];
  note: unknown;
  cards: unknown[];
  importFingerprint: string;
  previousSnapshotId?: string | null;
  createdAt?: string;
}): {
  definition: NoteTypeDefinitionV1;
  document: LearningItemDocumentV1;
} {
  const model = record(input.model);
  const cachedDefinition = definitionCache.get(model);
  if (cachedDefinition) return createNoteBundle(input, cachedDefinition);
  const modelId = String(model.id ?? "unknown");
  const definitionFingerprint = stableContentHash({
    modelId,
    name: model.name,
    config: jsonSafe(model.config),
    fields: jsonSafe(model.flds),
    templates: jsonSafe(model.tmpls),
  }, "anki-definition");
  const definitionId = `anki-${modelId}-${definitionFingerprint}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const modelFields = Array.isArray(model.flds) ? model.flds : [];
  const fields: FieldDefinition[] = input.fieldValues.map((fieldValue, ordinal) => {
    const sourceField = record(modelFields[ordinal]);
    const config = record(sourceField.config);
    const stableSourceId = sourceId(config.id ?? sourceField.id);
    return {
      id: stableSourceId ? `anki-field-${stableSourceId}` : stableContentHash({ definitionId, ordinal, name: fieldValue.name }, "anki-field"),
      sourceFieldId: stableSourceId,
      name: fieldValue.name,
      ordinal,
      rtl: config.rtl === true || sourceField.rtl === true,
      sticky: config.sticky === true || sourceField.sticky === true,
      fontName: sourceId(config.fontName ?? sourceField.font),
      fontSize: Number.isFinite(Number(config.fontSize ?? sourceField.size)) ? Number(config.fontSize ?? sourceField.size) : null,
      description: String(config.description ?? sourceField.description ?? ""),
      plainText: config.plainText === true || sourceField.plainText === true,
      collapsed: config.collapsed === true || sourceField.collapsed === true,
      excludeFromSearch: config.excludeFromSearch === true || sourceField.excludeFromSearch === true,
      preventDeletion: config.preventDeletion === true || sourceField.preventDeletion === true,
      sourceConfigBase64: sourceId(config.rawBase64),
      sourceConfig: jsonSafe(config) as Record<string, unknown>,
    };
  });
  const templates = Array.isArray(model.tmpls) ? model.tmpls : [];
  const kind: NoteTypeDefinitionV1["kind"] = Number(model.config?.originalStockKind ?? 0) === 6
    ? "image-occlusion"
    : Number(model.config?.kind ?? model.type ?? 0) === 1
      ? "cloze"
      : "normal";
  const recipes: ReviewRecipe[] = templates.map((candidate: unknown, ordinal: number) => {
    const template = record(candidate);
    const config = record(template.config);
    const templateOrdinal = Number(template.ord ?? ordinal);
    const templateId = sourceId(config.id ?? template.id);
    const frontSource = String(config.questionFormat ?? template.qfmt ?? "");
    const backSource = String(config.answerFormat ?? template.afmt ?? "");
    const browserFrontSource = String(config.browserQuestionFormat ?? template.bqfmt ?? "");
    const browserBackSource = String(config.browserAnswerFormat ?? template.bafmt ?? "");
    return {
      id: templateId ? `anki-template-${templateId}` : `${definitionId}-template-${templateOrdinal}`,
      sourceTemplateId: templateId,
      name: String(template.name ?? `Karte ${templateOrdinal + 1}`),
      ordinal: templateOrdinal,
      generationRule: generationRule(model, templateOrdinal, fields),
      front: compileSafeTemplate(frontSource, fields).ast,
      back: compileSafeTemplate(backSource, fields).ast,
      browserFront: browserFrontSource ? compileSafeTemplate(browserFrontSource, fields).ast : null,
      browserBack: browserBackSource ? compileSafeTemplate(browserBackSource, fields).ast : null,
      targetDeckId: sourceId(config.targetDeckId ?? template.did),
      interaction: kind === "image-occlusion" ? "image-occlusion" : kind === "cloze" ? "cloze" : "reveal",
      sourceConfigBase64: sourceId(config.rawBase64),
      sourceConfig: jsonSafe(config) as Record<string, unknown>,
    };
  });
  const definition = normalizeNoteTypeDefinition({
    id: definitionId,
    revision: 1,
    semanticHash: definitionFingerprint,
    origin: "anki",
    kind,
    name: String(model.name ?? "Anki-Notiztyp"),
    fields,
    recipes,
    css: String(model.config?.css ?? model.css ?? ""),
    latexConfig: {
      pre: String(model.config?.latexPre ?? model.latexPre ?? ""),
      post: String(model.config?.latexPost ?? model.latexPost ?? ""),
      svg: Boolean(model.config?.latexSvg ?? model.latexsvg),
    },
    supersedesId: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  });
  definitionCache.set(model, definition);
  return createNoteBundle(input, definition);
}
