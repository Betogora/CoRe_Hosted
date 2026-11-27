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
  testId?: string;
  /** Opens the segment tooltips below the bar where content sits directly above it. */
  tooltipSide?: "bottom";
}


export function DailyReviewProgress({
  progress,
  testId = "study-daily-progress",
  tooltipSide,
}: DailyReviewProgressProps) {
  const segmentValueText = DAILY_REVIEW_PROGRESS_SEGMENTS
    .map((segment) => `${segment.label}: ${formatLearningCardCount(progress[segment.countKey])}`)
    .join(", ");
  // The share follows the drawn widths, which come from the four counts rather than from `total`.
  const drawnCount = DAILY_REVIEW_PROGRESS_SEGMENTS.reduce((sum, segment) => sum + progress[segment.countKey], 0);

  return (
    <div
      className="core-daily-progress flex h-2.5 rounded-round bg-core-subtle"
      role="progressbar"
      aria-label="Lernfortschritt"
      aria-valuemin={0}
      aria-valuemax={Math.max(1, progress.total)}
      aria-valuenow={progress.completedTodayCount}
      aria-valuetext={segmentValueText}
      data-testid={testId}
    >
      {DAILY_REVIEW_PROGRESS_SEGMENTS.map((segment) => {
        const count = progress[segment.countKey];
        const color = segment.key === "learned" ? "var(--core-learning-progress-completed)" : segment.color;
        return count > 0 ? (
          <CoreTooltip key={segment.key} label={segment.label} side={tooltipSide} swatchColor={color} value={`${Math.round((count / drawnCount) * 100)} %`}>
            <span
              aria-hidden="true"
              data-study-progress-segment={segment.key}
              className="core-daily-progress-segment"
              style={{ backgroundColor: color, flexBasis: 0, flexGrow: count }}
            />
          </CoreTooltip>
        ) : null;
      })}
    </div>
  );
}
