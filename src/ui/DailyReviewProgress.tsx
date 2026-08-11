import React from "react";
import type { DailyReviewProgressSummary } from "../reviewService.ts";
import { formatLearningCardCount, LEARNING_STATUS_UI } from "./learningStatusUi.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

export const DAILY_REVIEW_PROGRESS_SEGMENTS = [
  { key: "learned", countKey: "completedTodayCount", ...LEARNING_STATUS_UI.learned },
  { key: "new", countKey: "newCount", ...LEARNING_STATUS_UI.new },
  { key: "in-progress", countKey: "inProgressCount", ...LEARNING_STATUS_UI.inProgress },
  { key: "due", countKey: "dueCount", ...LEARNING_STATUS_UI.due },
] as const;

interface DailyReviewProgressProps {
  progress: DailyReviewProgressSummary;
  achieved?: boolean;
  ariaLabel?: string;
  testId?: string;
}

export function DailyReviewProgress({
  progress,
  achieved = false,
  ariaLabel = "Lernfortschritt",
  testId = "study-daily-progress",
}: DailyReviewProgressProps) {
  const segmentValueText = DAILY_REVIEW_PROGRESS_SEGMENTS
    .map((segment) => `${segment.label}: ${formatLearningCardCount(progress[segment.countKey])}`)
    .join(", ");
  const valueText = achieved ? `Tagesziel erreicht. ${segmentValueText}` : segmentValueText;
  const zeroGoalAchieved = achieved && progress.total === 0;

  return (
    <div
      className="flex h-3 overflow-hidden rounded-full bg-core-subtle"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, progress.total)}
      aria-valuenow={zeroGoalAchieved ? 1 : achieved ? progress.total : progress.completedTodayCount}
      aria-valuetext={valueText}
      data-testid={testId}
    >
      {achieved ? (
        <CoreTooltip label="Tagesziel erreicht" swatchColor="var(--core-learning-goal-achieved)" value={formatLearningCardCount(progress.total)}>
          <span
            aria-hidden="true"
            data-study-progress-segment="achieved"
            className="h-full flex-1"
            style={{ backgroundColor: "var(--core-learning-goal-achieved)" }}
          />
        </CoreTooltip>
      ) : DAILY_REVIEW_PROGRESS_SEGMENTS.map((segment) => {
        const count = progress[segment.countKey];
        return count > 0 ? (
          <CoreTooltip key={segment.key} label={segment.label} swatchColor={segment.color} value={formatLearningCardCount(count)}>
            <span
              aria-hidden="true"
              data-study-progress-segment={segment.key}
              className="h-full"
              style={{ backgroundColor: segment.color, flexBasis: 0, flexGrow: count }}
            />
          </CoreTooltip>
        ) : null;
      })}
    </div>
  );
}
