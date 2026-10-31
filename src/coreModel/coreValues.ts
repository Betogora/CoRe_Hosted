import { normalizeLearningProfileSource, normalizeLearningSettings, type LearningSettingsInput } from "../deckSettings.ts";
import type { CoreMode, DeckAppearance, DeckSettings, DeckSource, ReviewRating, VariantQualityStatus } from "../coreTypes.ts";

interface DeckSettingsInput extends LearningSettingsInput {
  appearance?: Partial<DeckAppearance>;
  newCardsTodayOverride?: { date?: unknown; limit?: unknown } | null;
  variantThresholdDays?: number;
  maxActiveVariantsPerCard?: number;
  leechThreshold?: number;
  leechAction?: string;
}
export const CORE_DECK_SOURCES = ["anki-apkg", "manual"] as const satisfies readonly DeckSource[];

const CORE_MODES = ["on", "off"] as const satisfies readonly CoreMode[];
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
const DEFAULT_DECK_APPEARANCE = {
  iconKey: "book-open",
  iconColor: "#6f7e9e",
};
export const VARIANT_STATUSES = ["draft", "active", "rejected", "flagged", "disabled"] as const satisfies readonly VariantQualityStatus[];
export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const satisfies readonly ReviewRating[];

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
    : "on";
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
    learningProfileSource: normalizeLearningProfileSource(settings.learningProfileSource)
      ?? (learningSettings.schedulerProfile.presetId === "custom"
        ? null
        : { id: `builtin:${learningSettings.schedulerProfile.presetId}`, contentVersion: 1 }),
    newCardsTodayOverride,
    variantThresholdDays: typeof settings.variantThresholdDays === "number" && Number.isFinite(settings.variantThresholdDays) ? settings.variantThresholdDays : 21,
    maxActiveVariantsPerCard: typeof settings.maxActiveVariantsPerCard === "number" && Number.isFinite(settings.maxActiveVariantsPerCard) ? settings.maxActiveVariantsPerCard : 2,
    leechThreshold: typeof settings.leechThreshold === "number" && Number.isFinite(settings.leechThreshold) ? Math.min(99, Math.max(1, Math.round(settings.leechThreshold))) : 8,
    leechAction: settings.leechAction === "suspend" ? "suspend" : "tag",
  };
}
