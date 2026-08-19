import { createCoreNoteTypeDefinition, normalizeCoreDeck } from "./coreModel.ts";
import { normalizeNoteTypeDefinition } from "./coreModel/learningItemContent.ts";
import type { ForeignNoteSnapshot, NoteTypeDefinitionV1 } from "./coreTypes.ts";
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

function createDefaultState({ seedDefaultDecks = false }: { seedDefaultDecks?: boolean } = {}): WorkspaceState {
  const content = normalizeContentEntities(seedDefaultDecks ? createWorldCapitalsSeedDecks() : [], [], []);
  return {
    version: 4,
    profile: createDefaultProfile(),
    decks: content.decks,
    documents: [],
    noteTypeDefinitions: content.definitions,
    learningItemSourceSnapshots: content.snapshots,
    cloudTombstones: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStoredDecks(decks: any) {
  if (!Array.isArray(decks)) return [];
  return decks
    .filter((deck: any) => !RETIRED_DECK_SOURCES.has(deck?.source))
    .map((deck: any) => normalizeCoreDeck({
      ...deck,
      cards: Array.isArray(deck?.cards)
        ? deck.cards.filter((card: any) => !RETIRED_DECK_SOURCES.has(card?.source) && card?.sourceType !== "ai_generated")
        : [],
    }));
}

function normalizeSnapshot(value: unknown): ForeignNoteSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : "";
  const sourceKind = String(input.sourceKind ?? "");
  if (!id || !["anki-apkg", "csv"].includes(sourceKind)) return null;
  return {
    id,
    schemaVersion: 1,
    sourceKind: sourceKind as ForeignNoteSnapshot["sourceKind"],
    importFingerprint: String(input.importFingerprint ?? ""),
    previousSnapshotId: typeof input.previousSnapshotId === "string" ? input.previousSnapshotId : null,
    definitionVersionId: typeof input.definitionVersionId === "string" ? input.definitionVersionId : null,
    sourcePayload: input.sourcePayload && typeof input.sourcePayload === "object"
      ? input.sourcePayload as Record<string, unknown>
      : {},
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString(),
  };
}

export function normalizeContentEntities(
  inputDecks: any[],
  storedDefinitions: unknown[],
  storedSnapshots: unknown[],
): { decks: any[]; definitions: NoteTypeDefinitionV1[]; snapshots: ForeignNoteSnapshot[] } {
  const definitions = new Map<string, NoteTypeDefinitionV1>();
  const snapshots = new Map<string, ForeignNoteSnapshot>();
  for (const candidate of storedDefinitions) {
    if (!candidate || typeof candidate !== "object") continue;
    const normalized = normalizeNoteTypeDefinition(candidate as NoteTypeDefinitionV1);
    definitions.set(normalized.id, normalized);
  }
  for (const candidate of storedSnapshots) {
    const normalized = normalizeSnapshot(candidate);
    if (normalized) snapshots.set(normalized.id, normalized);
  }

  const decks = inputDecks.map((deck) => ({
    ...deck,
    cards: (deck.cards ?? []).map((card: any) => {
      const transportedDefinition = card.meta?.noteTypeDefinitionV1;
      const transportedSnapshot = normalizeSnapshot(card.meta?.sourceSnapshotV1);
      if (transportedDefinition && typeof transportedDefinition === "object") {
        const normalized = normalizeNoteTypeDefinition(transportedDefinition as NoteTypeDefinitionV1);
        definitions.set(normalized.id, normalized);
      }
      if (!definitions.has(card.noteTypeDefinitionId) && card.contentDocument) {
        const normalized = createCoreNoteTypeDefinition({
          document: card.contentDocument,
          kind: card.kind === "cloze" ? "cloze" : card.kind === "image-occlusion" ? "image-occlusion" : "normal",
          interaction: card.kind === "single-choice" || card.kind === "multiple-choice" ? "choice" : undefined,
          reverse: card.kind === "basic-reversed",
          createdAt: card.createdAt,
        });
        definitions.set(normalized.id, normalized);
      }
      if (transportedSnapshot) snapshots.set(transportedSnapshot.id, transportedSnapshot);
      if (!card.meta?.noteTypeDefinitionV1 && !card.meta?.sourceSnapshotV1) return card;
      const { noteTypeDefinitionV1: _definition, sourceSnapshotV1: _snapshot, ...meta } = card.meta;
      return { ...card, meta };
    }),
  }));
  return { decks, definitions: [...definitions.values()], snapshots: [...snapshots.values()] };
}

export function normalizeWorkspaceState(rawState: any) {
  const fallback = createDefaultState({ seedDefaultDecks: false });
  const normalizedDecks = ensureWorldCapitalsStudyHistory(normalizeStoredDecks(rawState?.decks));
  const content = normalizeContentEntities(
    normalizedDecks,
    Array.isArray(rawState?.noteTypeDefinitions) ? rawState.noteTypeDefinitions : [],
    Array.isArray(rawState?.learningItemSourceSnapshots) ? rawState.learningItemSourceSnapshots : [],
  );

  const profile = rawState?.profile ?? {};
  return {
    version: 4,
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
    documents: Array.isArray(rawState?.documents) ? rawState.documents : [],
    noteTypeDefinitions: content.definitions,
    learningItemSourceSnapshots: content.snapshots,
    cloudTombstones: Array.isArray(rawState?.cloudTombstones) ? rawState.cloudTombstones : [],
    updatedAt: typeof rawState?.updatedAt === "string" ? rawState.updatedAt : fallback.updatedAt,
  };
}

export function createCoreRepository(options: { seedDefaultDecks?: boolean } = {}): { getState(): WorkspaceState } {
  return {
    getState() {
      return createDefaultState({ seedDefaultDecks: options.seedDefaultDecks === true });
    },
  };
}
