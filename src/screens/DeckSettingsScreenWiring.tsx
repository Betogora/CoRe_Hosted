import React from "react";
import { createViewRoute } from "../appNavigation.ts";
import type { DeckLearningSettingsDraft } from "../settingsDraft.ts";
import { SettingsSaveBar } from "../ui/SettingsSaveBar.tsx";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceStore, useWorkspaceValue } from "../useWorkspaceStore.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

export function DeckSettingsScreenWiring() {
  const { navigation, settings, clock, deckCommands, variantBatch, hydration: workspaceHydrationService } = useAppServices();
  const workspaceStore = useWorkspaceStore();
  const decks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const { deckSettings, focusedDeckId, getCurrentRoute, navigateToRoute, navigateToView } = navigation;
  const offlineDeck = useWorkspaceValue((snapshot) => deckSettings ? snapshot.offlineDecks[deckSettings.deckId] ?? null : null);
  const [focusedDeckBodyCache, setFocusedDeckBodyCache] = React.useState<{ total: number; cached: number; downloaded: number } | null>(null);
  const deckId = deckSettings?.deckId;
  React.useEffect(() => {
    if (!deckId) return undefined;
    let active = true;
    void deckCommands.getDeckBodyCache(deckId).then((summary) => {
      if (active) setFocusedDeckBodyCache(summary);
    });
    return () => { active = false; };
  }, [deckCommands, deckId, offlineDeck]);
  const [cardsWithoutVariant, setCardsWithoutVariant] = React.useState<number | null>(null);
  const { countWithoutVariant, running: variantsRunning } = variantBatch;
  React.useEffect(() => {
    setCardsWithoutVariant(null);
    const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
    if (!deck || variantsRunning) return undefined;
    let active = true;
    void countWithoutVariant(deck).then((count) => { if (active) setCardsWithoutVariant(count); }, () => undefined);
    return () => { active = false; };
  }, [countWithoutVariant, deckId, variantsRunning, workspaceStore]);
  if (!deckSettings || !decks) return null;
  return (
    <DeckSettingsScreen
      section={deckSettings.section}
      onSelectSection={(section) => settings.selectSettingsOverlay({ deckSettings: { deckId: deckSettings.deckId, section } })}
      deck={decks.find((deck) => deck.id === deckSettings.deckId) ?? null}
      decks={decks}
      learningProfiles={clock.globalSchedulerPreferences.learningProfiles}
      onSaveSettings={deckCommands.saveDeckSettings}
      onApplyLearningProfile={(deckId, learning: DeckLearningSettingsDraft) => deckCommands.saveDeckLearningSettings(deckId, learning)}
      onSaveLearningProfiles={deckCommands.saveLearningProfiles}
      onDraftStateChange={settings.handleSettingsDraftStateChange}
      onRequestContextAction={settings.requestSettingsContextAction}
      onCreateSubdeck={(parentDeckId = "") => navigateToView("lernen", {
        focusedDeckId: parentDeckId || focusedDeckId,
        deckCreationParentId: parentDeckId || "",
      })}
      onDeleteDeck={async (deckId) => {
        const result = await deckCommands.deleteDeck(deckId);
        if (result) settings.leaveDeckSettings(() => {
          const current = getCurrentRoute();
          const deleted = new Set(result.deletedDeckIds);
          navigateToRoute(current.mode === "study"
            ? createViewRoute("lernen")
            : createViewRoute(current.viewId, { ...current, deckSettings: undefined, ...(current.focusedDeckId && deleted.has(current.focusedDeckId) ? { focusedDeckId: undefined, selectedCardId: undefined } : {}) }), { replace: true });
        });
        return result;
      }}
      onSelectDeck={(deckId) => settings.selectSettingsOverlay({ deckSettings: { deckId, section: deckSettings.section } })}
      onOpenGlobalSettings={getCurrentRoute().mode === "study" ? undefined : settings.returnToSettings}
      variantGeneration={workspaceHydrationService ? { start: (deck, mode) => variantBatch.start(deck, { mode }), running: variantBatch.running, cardsWithoutVariant } : undefined}
      offlineDeck={offlineDeck}
      bodyCache={focusedDeckBodyCache}
      onDownloadDeck={workspaceHydrationService ? deckCommands.downloadDeck : undefined}
      onRemoveDeckDownload={workspaceHydrationService ? deckCommands.removeDeckDownload : undefined}
      onClose={settings.closeSettings}
      footer={settings.settingsDraftOpen ? (
        <SettingsSaveBar
          {...settings.saveBar}
          open
          mode={decks.some((deck) => deck.parentDeckId === deckSettings.deckId) ? "deck-tree" : "deck"}
        />
      ) : null}
    />
  );
}
