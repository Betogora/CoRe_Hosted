import React from "react";
import type { AppViewId } from "./appNavigation.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { getLearningDayKey, getLearningTimeZone, getNextLearningDayBoundaryDelay } from "./learningDay.ts";
import { getSimulatedNow, normalizeSimulationOffsetMinutes } from "./simulationClock.ts";
import { useWorkspaceValue } from "./useWorkspaceStore.ts";

/**
 * The app-wide learning time: the transient simulation offset, the account's day start and time zone, and the
 * learning day, which turns over on its own at the day boundary. `learningNow` is the time the shown counts use; it
 * moves with every applied workspace state, a view change and a new learning day.
 */
export function useLearningClock(activeView: AppViewId) {
  // Each answer changes the shell's `updatedAt`; the profile keeps its identity while its content stays.
  const profile = useWorkspaceValue((snapshot) => snapshot.state?.profile);
  const workspaceRevision = useWorkspaceValue((snapshot) => snapshot.revision);
  const [simulationOffsetMinutes, setSimulationOffsetMinutes] = React.useState(0);
  const [learningDayRevision, setLearningDayRevision] = React.useState(0);
  const getLearningNow = React.useCallback(
    () => getSimulatedNow(new Date(), simulationOffsetMinutes),
    [simulationOffsetMinutes],
  );
  const globalSchedulerPreferences = React.useMemo(() => getGlobalSchedulerPreferences(profile), [profile]);
  const learningTimeZone = getLearningTimeZone(profile);
  const learningNow = React.useMemo(getLearningNow, [activeView, getLearningNow, learningDayRevision, workspaceRevision]);
  const learningDayKey = getLearningDayKey(learningNow, {
    dayStartHour: globalSchedulerPreferences.dayStartHour,
    timeZone: learningTimeZone,
  }) ?? learningNow.slice(0, 10);

  React.useEffect(() => {
    const delay = getNextLearningDayBoundaryDelay(getLearningNow(), {
      dayStartHour: globalSchedulerPreferences.dayStartHour,
      timeZone: learningTimeZone,
    });
    if (delay == null) return undefined;
    const timerId = window.setTimeout(() => setLearningDayRevision((revision) => revision + 1), delay + 25);
    return () => window.clearTimeout(timerId);
  }, [getLearningNow, globalSchedulerPreferences.dayStartHour, learningDayRevision, learningTimeZone]);

  const changeSimulationOffset = React.useCallback((value: number) => {
    setSimulationOffsetMinutes(normalizeSimulationOffsetMinutes(value));
  }, []);

  return { getLearningNow, learningNow, learningDayKey, learningTimeZone, globalSchedulerPreferences, simulationOffsetMinutes, changeSimulationOffset };
}
