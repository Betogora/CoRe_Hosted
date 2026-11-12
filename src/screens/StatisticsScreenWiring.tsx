import React from "react";
import { getLearningDayRange } from "../learningDay.ts";
import type { StatisticsDeckSelection, StatisticsPeriod } from "../statisticsModel.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { StatisticsScreen } from "./StatisticsScreen.tsx";

/** `Statistik` over the local projection, completed with the cloud snapshot and the answers still waiting to sync. */
export function StatisticsScreenWiring() {
  const { navigation, clock, repository: workspaceRepository, hydration: workspaceHydrationService } = useAppServices();
  const decks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const { learningNow, learningTimeZone, globalSchedulerPreferences } = clock;
  const queryStatistics = React.useCallback(
    async ({ period, deckIds }: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => {
      const projection = await workspaceRepository.queryStatistics({ period, deckIds, now: learningNow, timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
      if (!workspaceHydrationService) throw new Error("Die Statistik ist noch nicht bereit.");
      const periodDays = period === "30d" ? 30 : period === "90d" ? 90 : period === "365d" ? 365 : null;
      const startReference = periodDays == null ? null : new Date(Date.parse(learningNow) - (periodDays - 1) * 86_400_000).toISOString();
      const startRange = startReference ? getLearningDayRange(startReference, { timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour }) : null;
      const endRange = getLearningDayRange(learningNow, { timeZone: learningTimeZone, dayStartHour: globalSchedulerPreferences.dayStartHour });
      try {
        const snapshot = await workspaceHydrationService.refreshStatistics(
          projection.scopeDeckIds,
          startRange ? new Date(startRange.start).toISOString() : null,
          endRange ? new Date(endRange.end).toISOString() : null,
          learningTimeZone,
          globalSchedulerPreferences.dayStartHour,
        );
        if (!snapshot) throw new Error("Für diese Auswahl ist noch keine vollständige Offline-Statistik gespeichert.");
        const pendingReviews = workspaceRepository.outbox.listPending().flatMap((mutation) => mutation.type === "review-atomic" && (mutation.payload as any)?.event
          ? [(mutation.payload as any).event]
          : []);
        const { mergeAccountStatisticsSnapshot } = await import("../statisticsModel.ts");
        return mergeAccountStatisticsSnapshot(projection, snapshot, pendingReviews);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Statistik konnte nicht geladen werden.");
      }
    },
    [globalSchedulerPreferences.dayStartHour, learningNow, learningTimeZone, workspaceHydrationService, workspaceRepository],
  );
  if (!decks) return null;
  return (
    <StatisticsScreen
      decks={decks}
      queryStatistics={queryStatistics}
      now={learningNow}
      timeZone={learningTimeZone}
      dayStartHour={globalSchedulerPreferences.dayStartHour}
      onNavigate={navigation.navigateToView}
    />
  );
}
