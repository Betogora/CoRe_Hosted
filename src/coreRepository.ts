import { createCoreNoteTypeDefinition, normalizeCoreDeck } from "./coreModel.ts";
import { normalizeNoteTypeDefinition } from "./coreModel/learningItemContent.ts";
import type { NoteTypeDefinitionV1 } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { withGlobalSchedulerPreferences } from "./deckSettings.ts";
import { createWorldCapitalsSeedDecks, ensureWorldCapitalsStudyHistory } from "./fixtures/worldCapitals.ts";
import { DEFAULT_UI_PREFERENCES, normalizeUiPreferences } from "./uiPreferences.ts";

const RETIRED_DECK_SOURCES = new Set(["ai-assisted", "community"]);

function createDefaultProfile() {
  return {
    userId: "local-user",
    email: "",
    displayName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    onboardingComplete: false,
    schedulerPreferences: { ...withGlobalSchedulerPreferences({}).schedulerPreferences },
    uiPreferences: DEFAULT_UI_PREFERENCES,
  };
}

function normalizeStoredDecks(decks: unknown): ReturnType<typeof normalizeCoreDeck>[] {
  if (!Array.isArray(decks)) return [];
  return decks
    .filter((deck) => !RETIRED_DECK_SOURCES.has(deck?.source))
    .map((deck) => normalizeCoreDeck({
      ...deck,
      cards: Array.isArray(deck?.cards)
        ? deck.cards.filter((card: any) => !RETIRED_DECK_SOURCES.has(card?.source) && card?.sourceType !== "ai_generated")
        : [],
    }));
}

export function normalizeContentEntities(
  inputDecks: any[],
  storedDefinitions: unknown[],
): { decks: ReturnType<typeof normalizeCoreDeck>[]; definitions: NoteTypeDefinitionV1[] } {
  const definitions = new Map<string, NoteTypeDefinitionV1>();
  for (const candidate of storedDefinitions) {
    if (!candidate || typeof candidate !== "object") continue;
    const normalized = normalizeNoteTypeDefinition(candidate as NoteTypeDefinitionV1);
    definitions.set(normalized.id, normalized);
  }
  const decks = inputDecks.map((deck) => ({
    ...deck,
    cards: (deck.cards ?? []).map((card: any) => {
      if (!definitions.has(card.noteTypeDefinitionId) && card.contentDocument) {
        const definition = createCoreNoteTypeDefinition({
          document: card.contentDocument,
          kind: card.kind === "cloze" ? "cloze" : card.kind === "image-occlusion" ? "image-occlusion" : "normal",
          interaction: card.kind === "single-choice" || card.kind === "multiple-choice" ? "choice" : undefined,
          createdAt: card.createdAt,
        });
        definitions.set(definition.id, definition);
      }
      return card;
    }),
  }));
  return { decks, definitions: [...definitions.values()] };
}

function createDefaultState({ seedDefaultDecks = false }: { seedDefaultDecks?: boolean } = {}): WorkspaceState {
  const content = normalizeContentEntities(seedDefaultDecks ? createWorldCapitalsSeedDecks() : [], []);
  return {
    version: 5,
    profile: createDefaultProfile(),
    decks: content.decks,
    noteTypeDefinitions: content.definitions,
    cloudTombstones: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkspaceState(rawState: any): WorkspaceState {
  const fallback = createDefaultState();
  const content = normalizeContentEntities(
    ensureWorldCapitalsStudyHistory(normalizeStoredDecks(rawState?.decks)),
    Array.isArray(rawState?.noteTypeDefinitions) ? rawState.noteTypeDefinitions : [],
  );
  const profile = rawState?.profile ?? {};
  return {
    version: 5,
    profile: withGlobalSchedulerPreferences({
      ...fallback.profile,
      userId: profile.userId ?? fallback.profile.userId,
      email: profile.email ?? fallback.profile.email,
      displayName: profile.displayName ?? fallback.profile.displayName,
      timezone: profile.timezone ?? fallback.profile.timezone,
      onboardingComplete: profile.onboardingComplete ?? fallback.profile.onboardingComplete,
      schedulerPreferences: profile.schedulerPreferences,
      uiPreferences: normalizeUiPreferences(profile.uiPreferences),
      ...(profile.account && typeof profile.account === "object" ? { account: profile.account } : {}),
    }),
    decks: content.decks,
    noteTypeDefinitions: content.definitions,
    cloudTombstones: Array.isArray(rawState?.cloudTombstones) ? rawState.cloudTombstones : [],
    updatedAt: typeof rawState?.updatedAt === "string" ? rawState.updatedAt : fallback.updatedAt,
  };
}

export function createCoreRepository(options: { seedDefaultDecks?: boolean } = {}): { getState(): WorkspaceState } {
  return { getState: () => createDefaultState({ seedDefaultDecks: options.seedDefaultDecks === true }) };
}
