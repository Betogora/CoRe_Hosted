import { normalizeLearningSettings, type LearningSettingsInput } from "../deckSettings.ts";
import type { CardType, CardVariantType, CoreMode, DeckAppearance, DeckSettings, DeckSource, DeckVisibility, LearningItemSourceType, MaturityBand, ReviewRating, TransformType, VariantGenerationSource, VariantQualityStatus } from "../coreTypes.ts";

interface DeckSettingsInput extends LearningSettingsInput {
  appearance?: Partial<DeckAppearance>;
  newCardsTodayOverride?: { date?: unknown; limit?: unknown } | null;
  variantThresholdXp?: number;
  maxActiveVariantsPerCard?: number;
  aiPolicy?: Partial<DeckSettings["aiPolicy"]>;
  blacklist?: Partial<DeckSettings["blacklist"]>;
}
export const CORE_CARD_TYPES = [
  "basic",
  "basic-reversed",
  "cloze",
  "image-occlusion",
  "multiple-choice",
  "free-text",
  "multi-field",
  "case-vignette",
] as const satisfies readonly CardType[];

export const CORE_DECK_SOURCES = [
  "anki-apkg",
  "manual",
  "ai-assisted",
  "community",
  "text-import",
  "csv-import",
  "json-import",
  "spreadsheet-import",
] as const satisfies readonly DeckSource[];

export const CORE_MODES = ["off", "auto", "manual"] as const satisfies readonly CoreMode[];
export const DECK_ICON_KEYS = [
  "book-open",
  "folder",
  "graduation-cap",
  "notebook",
  "pencil",
  "pen-line",
  "braces",
  "terminal",
  "music",
  "gift",
  "scissors",
  "palette",
  "stethoscope",
  "asterisk",
  "flower",
  "briefcase",
  "chart-column",
  "circle",
  "dumbbell",
  "scale",
  "microscope",
  "plane",
  "globe",
  "wrench",
  "flask",
  "brain",
  "heart",
  "shopping-bag",
  "badge-dollar",
  "school",
];
export const DEFAULT_DECK_APPEARANCE = {
  iconKey: "book-open",
  iconColor: "#4f5eb1",
};
export const DECK_VISIBILITIES = ["private", "community", "unlisted", "public"] as const satisfies readonly DeckVisibility[];
export const VARIANT_TRANSFORMS = ["original", "rephrase", "front_back_style_shift", "cloze_conversion"] as const satisfies readonly TransformType[];
export const VARIANT_STATUSES = ["draft", "active", "rejected", "flagged", "disabled"] as const satisfies readonly VariantQualityStatus[];
export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const satisfies readonly ReviewRating[];
export const LEARNING_ITEM_SOURCE_TYPES = ["manual", "text_import", "csv_import", "json_import", "anki_import", "ai_generated", "mixed"] as const satisfies readonly LearningItemSourceType[];
export const CARD_VARIANT_TYPES = ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"] as const satisfies readonly CardVariantType[];
export const VARIANT_GENERATION_SOURCES = ["original", "ai_generated", "user_edited", "imported"] as const satisfies readonly VariantGenerationSource[];
const CREATABLE_CARD_TYPES = new Set<CardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);

export const MATURITY_BANDS = [
  { id: "new", min: 0, max: 20, label: "Neu" },
  { id: "learning", min: 21, max: 50, label: "Aufbau" },
  { id: "young", min: 51, max: 80, label: "Jung" },
  { id: "mature", min: 81, max: 120, label: "Stabil" },
  { id: "variant_ready", min: 121, max: 180, label: "CoRe-ready" },
  { id: "mastered", min: 181, max: Number.POSITIVE_INFINITY, label: "Sicher" },
] as const satisfies readonly { id: MaturityBand; min: number; max: number; label: string }[];

export function makeId(prefix: string): string {
  const cryptoPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${cryptoPart}`;
}

export function stableContentHash(value: unknown, prefix = "hash"): string {
  const input = JSON.stringify(value ?? "");
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))];
}

export function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return unique(tags.map((tag) => String(tag).trim()).filter(Boolean));
  }

  return unique(
    String(tags ?? "")
      .split(/[\s,;#]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

export function getMaturityBand(maturityXp = 0): MaturityBand {
  return MATURITY_BANDS.find((band) => maturityXp >= band.min && maturityXp <= band.max)?.id ?? "new";
}
const deckIconColorPattern = /^#[0-9a-f]{6}$/i;

export function normalizeDeckAppearance(appearance: Partial<DeckAppearance> = {}): DeckAppearance {
  const requestedIconKey = appearance.iconKey;
  const iconKey = typeof requestedIconKey === "string" && DECK_ICON_KEYS.includes(requestedIconKey as typeof DECK_ICON_KEYS[number])
    ? requestedIconKey
    : DEFAULT_DECK_APPEARANCE.iconKey;
  const iconColor = String(appearance?.iconColor ?? "").trim();

  return {
    iconKey,
    iconColor: deckIconColorPattern.test(iconColor) ? iconColor.toLowerCase() : DEFAULT_DECK_APPEARANCE.iconColor,
  };
}

export function createDefaultDeckSettings(settings: DeckSettingsInput = {}): DeckSettings {
  const coreMode = typeof settings.coreMode === "string" && CORE_MODES.includes(settings.coreMode as CoreMode)
    ? settings.coreMode as CoreMode
    : "auto";
  const learningSettings = normalizeLearningSettings(settings);
  const override = settings.newCardsTodayOverride;
  const newCardsTodayOverride =
    override && typeof override === "object" && String(override.date ?? "").trim()
      ? {
          date: String(override.date).slice(0, 10),
          limit: Math.max(0, Math.round(Number(override.limit ?? learningSettings.newCardsPerDay) || 0)),
        }
      : null;

  return {
    ...learningSettings,
    coreMode,
    appearance: normalizeDeckAppearance(settings.appearance),
    newCardsTodayOverride,
    variantThresholdXp: typeof settings.variantThresholdXp === "number" && Number.isFinite(settings.variantThresholdXp) ? settings.variantThresholdXp : 121,
    maxActiveVariantsPerCard: typeof settings.maxActiveVariantsPerCard === "number" && Number.isFinite(settings.maxActiveVariantsPerCard) ? settings.maxActiveVariantsPerCard : 2,
    aiPolicy: {
      costTier: settings.aiPolicy?.costTier ?? "balanced",
      allowLocalModels: settings.aiPolicy?.allowLocalModels ?? true,
      allowExternalModels: settings.aiPolicy?.allowExternalModels ?? false,
      maxCostPerJob: settings.aiPolicy?.maxCostPerJob ?? 0,
      requireSourceAnchors: settings.aiPolicy?.requireSourceAnchors ?? true,
      requireHumanApprovalForNewCards: settings.aiPolicy?.requireHumanApprovalForNewCards ?? true,
    },
    blacklist: {
      cardTypes: settings.blacklist?.cardTypes ?? ["image-occlusion"],
      tags: settings.blacklist?.tags ?? [],
      transforms: settings.blacklist?.transforms ?? [],
      cardIds: settings.blacklist?.cardIds ?? [],
      variantIds: settings.blacklist?.variantIds ?? [],
    },
  };
}
