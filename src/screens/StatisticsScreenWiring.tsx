import React from "react";
import type { StatisticsDeckSelection, StatisticsPeriod } from "../statisticsModel.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { StatisticsScreen } from "./StatisticsScreen.tsx";

export function StatisticsScreenWiring() {
  const { navigation, clock, hydration: workspaceHydrationService } = useAppServices();
  const decks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const { learningNow, learningTimeZone, globalSchedulerPreferences } = clock;
  const queryStatistics = React.useCallback(
    ({ period, deckIds }: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => {
      if (!workspaceHydrationService) throw new Error("Die Statistik ist noch nicht bereit.");
      return workspaceHydrationService.queryStatistics({ period, deckIds, now: learningNow, timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
    },
    [globalSchedulerPreferences.dayStartHour, learningNow, learningTimeZone, workspaceHydrationService],
  );
  if (!decks) return null;
  return (
    <StatisticsScreen
      decks={decks}
      queryStatistics={queryStatistics}
      timeZone={learningTimeZone}
      dayStartHour={globalSchedulerPreferences.dayStartHour}
      onNavigate={navigation.navigateToView}
    />
  );
}
