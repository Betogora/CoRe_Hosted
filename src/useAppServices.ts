import React from "react";
import type { CardEditorServices } from "./appScreenProps.ts";
import type { CardCommands } from "./cardCommands.ts";
import type { CoreMode } from "./coreTypes.ts";
import type { DeckCommands } from "./deckCommands.ts";
import type { ImportCommands } from "./importCommands.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AccountMediaStore } from "./mediaStore.ts";
import type { StudyPreparationCommands } from "./studyPreparation.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { useCardVariantBatch } from "./useCardVariantBatch.ts";
import type { useImportSession } from "./useImportSession.ts";
import type { useLearningClock } from "./useLearningClock.ts";
import type { useNavigationGuard } from "./useNavigationGuard.ts";
import type { usePomodoroTimer } from "./usePomodoroTimer.ts";
import type { useSettingsOverlay } from "./useSettingsOverlay.ts";
import type { useStudySession } from "./useStudySession.ts";
import type { useStudyStart } from "./useStudyStart.ts";
import type { useWorkspaceSync } from "./useWorkspaceSync.ts";
import type { WorkspaceHydrationService } from "./workspaceHydrationService.ts";

/** What the screen wirings take from the open workspace besides the store: its owners, commands and services. */
export interface AppServices {
  navigation: ReturnType<typeof useNavigationGuard>;
  settings: ReturnType<typeof useSettingsOverlay>;
  clock: ReturnType<typeof useLearningClock>;
  pomodoro: ReturnType<typeof usePomodoroTimer>;
  sync: ReturnType<typeof useWorkspaceSync>;
  study: ReturnType<typeof useStudySession>;
  studyStart: ReturnType<typeof useStudyStart>;
  studyPreparation: StudyPreparationCommands;
  cardCommands: CardCommands;
  cardEditorServices: CardEditorServices;
  deckCommands: DeckCommands;
  importCommands: ImportCommands;
  importSession: ReturnType<typeof useImportSession>;
  variantBatch: ReturnType<typeof useCardVariantBatch>;
  /** Switching CoRe on first explains it in a dialog that offers generating variants right away. */
  requestDeckCoreMode: (deckId: string, coreMode: CoreMode) => unknown;
  signOut: () => Promise<void>;
  repository: IndexedDbCoreRepository;
  hydration: WorkspaceHydrationService | null;
  cloud: ReturnType<typeof createSupabaseBrowserClient> | null;
  mediaStore: AccountMediaStore | null;
}

/** Provided by `App` while a workspace is open; the screen wirings render only inside it. */
export const AppServicesContext = React.createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const services = React.useContext(AppServicesContext);
  if (!services) throw new Error("Die App-Dienste fehlen; Bildschirm-Verdrahtungen laufen nur innerhalb von App.");
  return services;
}
