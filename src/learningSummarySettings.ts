import * as v from "valibot";

export const summarySettingsSchema = v.strictObject({
  scope: v.picklist(["deck", "tree"]),
  material: v.picklist(["cards", "cards-and-source", "source"]),
  length: v.picklist(["short", "medium", "long"]),
  detail: v.picklist(["essentials", "balanced", "detailed"]),
  format: v.picklist(["bullets", "sections", "prose"]),
  goal: v.picklist(["understand", "repeat", "exam"]),
  register: v.picklist(["simple", "technical"]),
  focus: v.pipe(v.string(), v.maxLength(600)),
  includeExamples: v.boolean(),
  showReferences: v.boolean(),
});
export type SummarySettings = v.InferOutput<typeof summarySettingsSchema>;

export const summaryChoices = {
  scope: [{ value: "deck", label: "Nur dieser Stapel" }, { value: "tree", label: "Stapel und Unterstapel" }],
  length: [{ value: "short", label: "Kurz" }, { value: "medium", label: "Mittel" }, { value: "long", label: "Lang" }],
  detail: [{ value: "essentials", label: "Kernaussagen" }, { value: "balanced", label: "Ausgewogen" }, { value: "detailed", label: "Detailliert" }],
  format: [{ value: "bullets", label: "Stichpunkte" }, { value: "sections", label: "Gegliedert" }, { value: "prose", label: "Fließtext" }],
  goal: [{ value: "understand", label: "Verstehen" }, { value: "repeat", label: "Wiederholen" }, { value: "exam", label: "Prüfung" }],
  register: [{ value: "simple", label: "Einfach" }, { value: "technical", label: "Fachnah" }],
} as const;

export function createSummarySettings(): SummarySettings {
  return { scope: "tree", material: "cards", length: "medium", detail: "balanced", format: "sections", goal: "understand", register: "technical", focus: "", includeExamples: true, showReferences: true };
}

