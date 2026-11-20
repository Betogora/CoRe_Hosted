import React from "react";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { useLearningClock } from "./useLearningClock.ts";
import { useWorkspaceValue } from "./useWorkspaceStore.ts";
import type { WorkspaceStore } from "./workspaceStore.ts";

/** `null` means nothing to load. */
export function deckSummariesLoadKey({ countsShown, workspaceRevision, learningNow, learningDayKey, loadedDayKey }: {
  countsShown: boolean;
  workspaceRevision: number;
  learningNow: string;
  learningDayKey: string;
  loadedDayKey: string;
}): string | null {
  if (countsShown) return `${workspaceRevision} ${learningNow}`;
  return learningDayKey === loadedDayKey ? null : learningDayKey;
}

export function useDeckSummaries({ repository, store, countsShown, clock }: {
  repository: IndexedDbCoreRepository | null;
  store: WorkspaceStore;
  countsShown: boolean;
  clock: ReturnType<typeof useLearningClock>;
}) {
  const { learningNow, learningDayKey, learningTimeZone, globalSchedulerPreferences: { dayStartHour, learnAheadMinutes } } = clock;
  const hasState = useWorkspaceValue((snapshot) => snapshot.state !== null);
  const workspaceRevision = useWorkspaceValue((snapshot) => snapshot.revision);
  // The counts at start, loaded during boot, are for the day the app opens on.
  const loadedDayKey = React.useRef(learningDayKey);
  const loadKey = deckSummariesLoadKey({ countsShown, workspaceRevision, learningNow, learningDayKey, loadedDayKey: loadedDayKey.current });
  React.useEffect(() => {
    if (!repository || !hasState || loadKey === null) return;
    let active = true;
    void repository.listDeckSummaries({ now: learningNow, dayStartHour, learnAheadMinutes, timeZone: learningTimeZone }).then((result) => {
      if (!active) return;
      loadedDayKey.current = learningDayKey;
      store.set({ deckSummaries: result.summaries, studyHeatmap: result.studyHeatmap });
    });
    return () => { active = false; };
    // The key carries the time and day the counts are loaded for.
  }, [dayStartHour, hasState, learnAheadMinutes, learningTimeZone, loadKey, repository, store]);
}
