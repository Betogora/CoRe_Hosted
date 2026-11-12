import type { DeckSettingsSaveScope, GlobalLearningSettingsSaveScope } from "./appScreenProps.ts";
import { createDefaultDeckSettings } from "./coreModel.ts";
import type { CoreMode, Deck, ExamDailyTask, ExamPlanningSettings, LearningProfileTemplate, SavedCardSearch } from "./coreTypes.ts";
import { collectDeckTreeIds, createWorkspaceDeck, updateDeckTreePlacement } from "./coreWorkspace.ts";
import { getGlobalSchedulerPreferences, normalizeLearningProfileSource, normalizeLearningSettings, withGlobalSchedulerPreferences, type LearningSettingsInput } from "./deckSettings.ts";
import { validateExamPlanningSettings } from "./examPlanSettings.ts";
import { applyGlobalLearningDefaultsToDeck, createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { applyDeckSettingsDraftChanges, createDeckSettingsDraft, normalizeDeckSettingsDraft, type DeckSettingsDraft, type GeneralSettingsDraft, type GlobalCardSettingsDraft } from "./settingsDraft.ts";
import { setDeckExpanded, type DeckExpansionSurface } from "./uiPreferences.ts";
import type { WorkspaceStore } from "./workspaceStore.ts";

type RefreshOptions = { preserveCardPages?: boolean };
type CreateDeckInput = Parameters<typeof createWorkspaceDeck>[1];

export interface DeckCommandsContext {
  store: WorkspaceStore;
  repository: IndexedDbCoreRepository;
  /** Applies the repository's shell state to the store; without `preserveCardPages` it empties the card pages. */
  refresh: (options?: RefreshOptions) => unknown;
  requestSync: () => void;
  /** Syncs at once, for a changed sync interval. */
  syncNow: () => Promise<unknown>;
  /** Changes the decks of a running study session, which keep their cards while their settings follow a save. */
  updateStudyDecks: (update: (decks: Deck[] | null) => Deck[] | null) => void;
}

export type DeckCommands = ReturnType<typeof createDeckCommands>;

function withDeckLearningSettings(deck: Deck, settings: LearningSettingsInput): Deck {
  const normalized = normalizeLearningSettings(settings);
  const variantThresholdDays = settings.variantThresholdDays == null ? undefined : Number(settings.variantThresholdDays);
  const maxActiveVariantsPerCard = settings.maxActiveVariantsPerCard == null ? undefined : Number(settings.maxActiveVariantsPerCard);
  const nextDeckSettings = createDefaultDeckSettings({
    ...deck.deckSettings,
    ...normalized,
    learningProfileSource: normalizeLearningProfileSource(settings.learningProfileSource),
    coreMode: settings.coreMode === "on" || settings.coreMode === "off" ? settings.coreMode : deck.deckSettings.coreMode,
    ...(Number.isFinite(variantThresholdDays) ? { variantThresholdDays } : {}),
    ...(Number.isFinite(maxActiveVariantsPerCard) ? { maxActiveVariantsPerCard } : {}),
    ...(settings.newCardsPerDay !== undefined && settings.newCardsPerDay !== deck.deckSettings.newCardsPerDay
      ? { newCardsTodayOverride: null }
      : {}),
  });

  return {
    ...deck,
    deckSettings: nextDeckSettings,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deck and settings commands of the open workspace: decks with their placement and settings in the scopes `deck`,
 * `deck-tree`, `all-decks` and `new-decks`, learning profiles, general settings, exam planning, expanded decks and
 * saved searches. Each write is local first, then refreshes the store and asks for a sync.
 */
export function createDeckCommands({ store, repository, refresh, requestSync, syncNow, updateStudyDecks }: DeckCommandsContext) {
  function runRepositoryMutation<T>(mutation: (current: IndexedDbCoreRepository) => T, refreshOptions?: RefreshOptions): T {
    const result = mutation(repository);
    refresh(refreshOptions);
    requestSync();
    return result;
  }

  function synchronizeStudyDeckMetadata(savedDecks: Deck[]) {
    const metadataById = new Map(savedDecks.map(({ cards: _cards, reviewEvents: _reviewEvents, ...metadata }) => [metadata.id, metadata]));
    updateStudyDecks((current) => current?.map((deck) => {
      const metadata = metadataById.get(deck.id);
      return metadata ? { ...deck, ...metadata } : deck;
    }) ?? current);
  }

  function createDeck(input: CreateDeckInput = {}) {
    const state = store.get().state;
    const created = state ? createWorkspaceDeck(state.decks, {
      ...input,
      deckSettings: createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences(state.profile), input.deckSettings),
    }) : null;
    return created ? runRepositoryMutation((current) => current.saveDeckMetadata([created])[0] ?? null) : null;
  }

  function updateDeck(deckId: string, updater: (deck: Deck) => Deck) {
    const deck = store.get().state?.decks.find((candidate) => candidate.id === deckId);
    const saved = deck ? runRepositoryMutation((current) => current.saveDeckMetadata([updater(deck)])[0] ?? null) : null;
    if (saved) synchronizeStudyDeckMetadata([saved]);
    return saved;
  }

  async function deleteDeck(deckId: string) {
    const result = await repository.deleteDeckTree(deckId);
    if (!result) return null;
    refresh();
    requestSync();
    return result;
  }

  function moveDeck(deckId: string, parentDeckId: string | null = null) {
    const state = store.get().state;
    if (!state) return null;
    const result = updateDeckTreePlacement(state, { deckId, parentDeckId, changeType: "deck_moved", reason: parentDeckId ? "Stapel als Unterstapel verschoben" : "Stapel auf Hauptebene verschoben" });
    if (!result) return null;
    if (result.ok && result.updatedDecks.length) runRepositoryMutation((current) => current.saveDeckMetadata(result.updatedDecks));
    return result;
  }

  function setDeckCoreMode(deckId: string, coreMode: CoreMode) {
    return runRepositoryMutation((current) => current.updateDeckSettings(deckId, { coreMode }));
  }

  function saveDeckLearningSettings(
    deckId: string,
    settings: LearningSettingsInput = {},
  ) {
    return updateDeck(deckId, (deck) => withDeckLearningSettings(deck, settings));
  }

  function saveDeckSettings(deckId: string, input: DeckSettingsDraft, scope: DeckSettingsSaveScope, baseline: DeckSettingsDraft) {
    const currentState = store.get().state;
    if (!currentState) return null;
    const draft = normalizeDeckSettingsDraft(input);
    const placement = updateDeckTreePlacement(currentState, {
      deckId,
      name: draft.name,
      changeType: "deck_settings_saved",
      reason: "Stapeleinstellungen gespeichert",
    });
    if (!placement.ok || !placement.deck) return placement;

    const placedDecks = placement.nextDecks ?? currentState.decks;
    const treeDeckIds = scope === "deck-tree"
      ? collectDeckTreeIds(placedDecks, deckId)
      : new Set([deckId, ...placement.changedDeckIds]);
    const updatedDecks = placedDecks
      .filter((candidate) => treeDeckIds.has(candidate.id))
      .map((candidate) => {
        if (candidate.id !== deckId && scope === "deck") return candidate;
        const candidateDraft = candidate.id === deckId
          ? draft
          : applyDeckSettingsDraftChanges(baseline, draft, createDeckSettingsDraft(candidate));
        const learningDeck = withDeckLearningSettings(candidate, candidateDraft.learning);
        return {
          ...learningDeck,
          deckSettings: createDefaultDeckSettings({
            ...learningDeck.deckSettings,
            ...candidateDraft.leech,
            appearance: candidateDraft.appearance,
          }),
        };
      });
    const savedDecks = runRepositoryMutation((current) => current.saveDeckMetadata(updatedDecks), { preserveCardPages: true });
    synchronizeStudyDeckMetadata(savedDecks);
    const savedDeck = savedDecks.find((candidate) => candidate.id === deckId) ?? null;
    return {
      ...placement,
      ok: Boolean(savedDeck),
      error: savedDeck ? null : "Die Stapeleinstellungen konnten nicht gespeichert werden.",
      deck: savedDeck,
      updatedDecks: savedDecks,
      changedDeckIds: savedDecks.map((candidate) => candidate.id),
    };
  }

  function saveLearningProfiles(learningProfiles: LearningProfileTemplate[]) {
    const state = store.get().state;
    if (!state) return null;
    return runRepositoryMutation((current) => current.saveProfile(withGlobalSchedulerPreferences(state.profile, { learningProfiles })));
  }

  function saveGeneralSettings(draft: GeneralSettingsDraft) {
    const currentState = store.get().state;
    if (!currentState) return null;
    const syncIntervalChanged = currentState.profile.uiPreferences.syncIntervalMinutes !== draft.syncIntervalMinutes;
    const profile = {
      ...currentState.profile,
      displayName: draft.displayName,
      uiPreferences: {
        ...currentState.profile.uiPreferences,
        syncIntervalMinutes: draft.syncIntervalMinutes,
      },
    };
    const saved = runRepositoryMutation((current) => current.saveProfile(profile));
    if (saved && syncIntervalChanged) void syncNow().catch(() => undefined);
    return saved;
  }

  function saveGlobalCardSettings(draft: GlobalCardSettingsDraft, scope: GlobalLearningSettingsSaveScope) {
    const currentState = store.get().state;
    if (!currentState) return null;
    const nextProfile = withGlobalSchedulerPreferences({
      ...currentState.profile,
      uiPreferences: { ...currentState.profile.uiPreferences, flagNames: draft.flagNames },
    }, {
      dayStartHour: draft.dayStartHour,
      learnAheadMinutes: draft.learnAheadMinutes,
      easyDays: draft.easyDays,
      defaultLearningSettings: draft.learning,
    });
    let updatedDecks: Deck[] = [];
    const saved = runRepositoryMutation((current) => {
      const savedProfile = current.saveProfile(nextProfile);
      if (scope === "all-decks") {
        updatedDecks = current.saveDeckMetadata(currentState.decks.map((deck) => applyGlobalLearningDefaultsToDeck(deck, nextProfile.schedulerPreferences)));
      }
      return savedProfile;
    }, { preserveCardPages: true });
    if (updatedDecks.length > 0) synchronizeStudyDeckMetadata(updatedDecks);
    return saved;
  }

  async function saveExamPlanning(settings: ExamPlanningSettings) {
    const currentState = store.get().state;
    const saved = currentState
      ? runRepositoryMutation((current) => current.saveProfile(withGlobalSchedulerPreferences(currentState.profile, { examPlanning: validateExamPlanningSettings(settings) })), { preserveCardPages: true })
      : null;
    if (!saved) throw new Error("Die Prüfungsplanung konnte nicht gespeichert werden.");
  }

  async function saveExamTasks(dailyTasks: ExamDailyTask[]) {
    const latest = store.get().state;
    if (!latest) throw new Error("Die Prüfungsplanung ist noch nicht bereit.");
    const { withExamDailyTasks } = await import("./examDailyTasks.ts");
    await saveExamPlanning(withExamDailyTasks(getGlobalSchedulerPreferences(latest.profile).examPlanning, dailyTasks));
  }

  function saveDeckExpansion(surface: DeckExpansionSurface, deckId: string | readonly string[], expanded: boolean) {
    const currentState = store.get().state;
    if (!currentState) return null;
    const profile = currentState.profile;
    return runRepositoryMutation((current) => current.saveProfile({
      ...profile,
      uiPreferences: setDeckExpanded(profile.uiPreferences, surface, deckId, expanded),
    }), { preserveCardPages: true });
  }

  function saveSearches(searches: SavedCardSearch[]) {
    const currentState = store.get().state;
    if (!currentState) return null;
    const profile = currentState.profile;
    return runRepositoryMutation((current) => current.saveProfile({
      ...profile,
      // saveProfile normalizes the preferences (limit, lengths, duplicate ids).
      uiPreferences: { ...profile.uiPreferences, savedSearches: searches },
    }), { preserveCardPages: true });
  }

  return {
    createDeck,
    updateDeck,
    deleteDeck,
    moveDeck,
    setDeckCoreMode,
    saveDeckLearningSettings,
    saveDeckSettings,
    saveLearningProfiles,
    saveGeneralSettings,
    saveGlobalCardSettings,
    saveExamPlanning,
    saveExamTasks,
    saveDeckExpansion,
    saveSearches,
  };
}
