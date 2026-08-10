import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudyHeatmapModelFromCounts } from "../studyHeatmapModel.ts";
import { StudyHeatmap } from "./StudyHeatmap.tsx";

function renderHeatmapWeekAt(anchorKey: string, forecastCountsByDay: ReadonlyMap<string, number> = new Map()) {
  const originalUseState = React.useState;
  let stateIndex = 0;
  React.useState = (() => {
    const value = stateIndex === 0 ? "week" : anchorKey;
    stateIndex += 1;
    return [value, () => undefined];
  }) as typeof React.useState;

  try {
    return renderToStaticMarkup(
      <StudyHeatmap
        heatmap={createStudyHeatmapModelFromCounts({
          todayKey: "2026-08-10",
          countsByDay: new Map([["2026-08-10", 2]]),
          forecastCountsByDay,
        })}
        formatDayLabel={(day) => `${day.key}: ${day.count} Wiederholungen`}
      />,
    );
  } finally {
    React.useState = originalUseState;
  }
}

test("shared study heatmap defaults to seven days with the streak title and segmented period control", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    todayKey: "2026-07-07",
    countsByDay: new Map([["2026-07-07", 3]]),
  });
  const markup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={heatmap}
      formatDayLabel={(day) => `${day.key}: ${day.count} Wiederholungen`}
    />,
  );

  assert.match(markup, /1 Tag Streak/);
  assert.match(markup, /core-study-heatmap-container/);
  assert.match(markup, /core-study-heatmap-header/);
  assert.match(markup, /core-study-heatmap-controls/);
  assert.match(markup, /data-size="regular"/);
  assert.equal((markup.match(/core-segmented-control-option/g) ?? []).length, 3);
  assert.equal((markup.match(/inline-flex size-11 shrink-0/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /sm:w-auto/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /aria-pressed="true"[^>]*>Woche</);
  assert.match(markup, />Monat</);
  assert.match(markup, />Jahr</);
  assert.match(markup, /Frühere sieben Tage anzeigen/);
  assert.match(markup, /Spätere sieben Tage anzeigen/);
  assert.match(markup, /data-testid="study-heatmap-grid"[^>]*data-heatmap-period="week"/);
  assert.equal((markup.match(/data-heatmap-day=/g) ?? []).length, 7);
  assert.match(markup, /2026-07-07: 3 Wiederholungen/);
  assert.match(markup, /data-testid="study-heatmap-legend"[\s\S]*Weniger[\s\S]*Mehr/);
  for (let level = 0; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
});

test("shared study heatmap uses the plural streak title for zero and multiple days", () => {
  const emptyMarkup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={createStudyHeatmapModelFromCounts({ todayKey: "2026-07-07", countsByDay: new Map() })}
      formatDayLabel={(day) => day.key}
    />,
  );
  assert.match(emptyMarkup, /0 Tage Streak/);

  const streakMarkup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={createStudyHeatmapModelFromCounts({
        todayKey: "2026-07-07",
        countsByDay: new Map([["2026-07-05", 1], ["2026-07-06", 1], ["2026-07-07", 1]]),
      })}
      formatDayLabel={(day) => day.key}
    />,
  );
  assert.match(streakMarkup, /3 Tage Streak/);
});

test("shared study heatmap renders forecast copy and gray levels without changing the historical legend", () => {
  const markup = renderHeatmapWeekAt("2026-08-16", new Map([
    ["2026-08-12", 1],
    ["2026-08-13", 1_200],
  ]));

  assert.match(markup, /11\.08\.2026: voraussichtlich keine Karten fällig/);
  assert.match(markup, /12\.08\.2026: voraussichtlich 1 Karte fällig/);
  assert.match(markup, /13\.08\.2026: voraussichtlich 1\.200 Karten fällig/);
  assert.match(markup, /core-heatmap-forecast-level-0/);
  assert.match(markup, /core-heatmap-forecast-level-1/);
  assert.match(markup, /core-heatmap-forecast-level-4/);
  assert.match(markup, /data-heatmap-kind="forecast"/);
  const legend = markup.match(/data-testid="study-heatmap-legend"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(legend, /core-heatmap-level-4/);
  assert.doesNotMatch(legend, /core-heatmap-forecast-level/);
});

test("shared study heatmap labels days beyond the forecast boundary", () => {
  const markup = renderHeatmapWeekAt("2027-08-16", new Map([["2027-08-10", 2]]));

  assert.match(markup, /10\.08\.2027: voraussichtlich 2 Karten fällig/);
  assert.match(markup, /11\.08\.2027: außerhalb der 365-Tage-Prognose/);
  assert.match(markup, /data-heatmap-kind="unavailable"/);
});
