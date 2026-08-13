import type {
  CardField,
  FieldPlacement,
  FieldSemanticRole,
  LearningItemDocumentFieldV1,
  LearningItemDocumentV1,
  MediaRef,
} from "../coreTypes.ts";
import { sanitizeCardHtml } from "../htmlSafety.ts";
import { normalizeTags, stableContentHash, unique } from "./coreValues.ts";

const PLACEMENTS = new Set<FieldPlacement>(["front", "back", "both", "metadata"]);
const SEMANTIC_ROLES = new Set<FieldSemanticRole>([
  "prompt",
  "answer",
  "hint",
  "explanation",
  "source",
  "unclassified",
]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stableFieldId(definitionVersionId: string, name: string, ordinal: number): string {
  return stableContentHash({ definitionVersionId, name, ordinal }, "field");
}

function normalizeField(
  value: unknown,
  definitionVersionId: string,
  ordinal: number,
): LearningItemDocumentFieldV1 {
  const input = record(value);
  const name = String(input.name ?? `Feld ${ordinal + 1}`).trim() || `Feld ${ordinal + 1}`;
  const placement = PLACEMENTS.has(input.placement as FieldPlacement)
    ? input.placement as FieldPlacement
    : ordinal === 0 ? "front" : ordinal === 1 ? "back" : "metadata";
  const semanticRole = SEMANTIC_ROLES.has(input.semanticRole as FieldSemanticRole)
    ? input.semanticRole as FieldSemanticRole
    : placement === "front" ? "prompt" : placement === "back" ? "answer" : "unclassified";

  return {
    id: String(input.id ?? "").trim() || stableFieldId(definitionVersionId, name, ordinal),
    sourceFieldId: typeof input.sourceFieldId === "string" && input.sourceFieldId ? input.sourceFieldId : null,
    name,
    value: sanitizeCardHtml(input.value),
    placement,
    semanticRole,
  };
}

function normalizeInteraction(value: unknown): LearningItemDocumentV1["interaction"] | undefined {
  const choice = record(record(value).choice);
  if (!Array.isArray(choice.options) || typeof choice.correctAnswer !== "string") return undefined;
  const options = choice.options.map(String).map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) return undefined;
  return {
    choice: {
      options,
      correctAnswer: choice.correctAnswer,
      explanation: sanitizeCardHtml(choice.explanation),
    },
  };
}

export function createLearningItemDocumentFromLegacy(input: {
  definitionVersionId: string;
  fields?: CardField[];
  front?: string;
  back?: string;
  tags?: unknown;
  mediaRefs?: MediaRef[];
}): LearningItemDocumentV1 {
  const sourceFields = input.fields?.length
    ? input.fields
    : [
        { name: "Vorderseite", value: input.front ?? "" },
        { name: "Rückseite", value: input.back ?? "" },
      ];

  return {
    schemaVersion: 1,
    definitionVersionId: input.definitionVersionId,
    fields: sourceFields.map((field, ordinal) => normalizeField(field, input.definitionVersionId, ordinal)),
    tags: normalizeTags(input.tags),
    mediaRefs: unique(input.mediaRefs ?? []),
  };
}

export function normalizeLearningItemDocument(
  value: unknown,
  fallback: Parameters<typeof createLearningItemDocumentFromLegacy>[0],
): LearningItemDocumentV1 {
  const input = record(value);
  const definitionVersionId = String(input.definitionVersionId ?? fallback.definitionVersionId).trim()
    || fallback.definitionVersionId;
  if (!Array.isArray(input.fields)) return createLearningItemDocumentFromLegacy({ ...fallback, definitionVersionId });

  const seenIds = new Set<string>();
  const fields = input.fields.map((field, ordinal) => {
    const normalized = normalizeField(field, definitionVersionId, ordinal);
    if (seenIds.has(normalized.id)) {
      normalized.id = stableFieldId(definitionVersionId, normalized.name, ordinal);
    }
    seenIds.add(normalized.id);
    return normalized;
  });
  const interaction = normalizeInteraction(input.interaction);

  return {
    schemaVersion: 1,
    definitionVersionId,
    fields,
    tags: normalizeTags(input.tags ?? fallback.tags),
    mediaRefs: unique(Array.isArray(input.mediaRefs) ? input.mediaRefs.map(String) : fallback.mediaRefs ?? []),
    ...(interaction ? { interaction } : {}),
  };
}

export function projectDocumentSide(document: LearningItemDocumentV1, side: "front" | "back"): string {
  const fields = document.fields.filter((field) => field.placement === side || field.placement === "both");
  return fields.map((field) => field.value).filter(Boolean).join('<div class="core-field-separator" aria-hidden="true"></div>');
}
