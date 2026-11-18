import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudyHeatmapModelFromCounts } from "../studyHeatmapModel.ts";
import {
  HEATMAP_HISTORY_COLOR_STORAGE_KEY,
  HEATMAP_HISTORY_DEFAULT_COLOR,
  normalizeHeatmapHistoryColor,
  StudyHeatmap,
} from "./StudyHeatmap.tsx";

function renderHeatmapAt(
  period: "week" | "month" | "year",
  anchorKey: string,
  forecastCountsByDay: ReadonlyMap<string, number> = new Map(),
  historyColor = HEATMAP_HISTORY_DEFAULT_COLOR,
) {
  const originalUseState = React.useState;
  let stateIndex = 0;
  React.useState = ((initialState: unknown) => {
    const controlledValues = [period, anchorKey, historyColor];
    if (stateIndex >= controlledValues.length) return originalUseState(initialState);
    const value = controlledValues[stateIndex];
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

function renderHeatmapWeekAt(anchorKey: string, forecastCountsByDay: ReadonlyMap<string, number> = new Map()) {
  return renderHeatmapAt("week", anchorKey, forecastCountsByDay);
}

test("shared study heatmap defaults to seven days with the streak band and period switch", () => {
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

  assert.match(markup, /data-testid="study-heatmap-header"[^>]*><h3[^>]*><span[^>]*>1<\/span> <span class="core-heading-3">Tag Streak<\/span><\/h3>/);
  assert.match(markup, /style="background:#b55b43;color:var\(--core-heatmap-on-strong\)" data-testid="study-heatmap-header"/);
  assert.match(markup, /<dt[^>]*>Lerntage<\/dt><dd[^>]*>1 \/ 1<\/dd>[\s\S]*<dt[^>]*>Morgen fällig<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(markup, /--core-heatmap-on-strong:#ffffff/);
  assert.match(markup, /data-heatmap-history-color="#b55b43"/);
  assert.doesNotMatch(markup, /Heatmap-Farbe ändern/);
  assert.match(markup, /data-testid="study-heatmap-controls"[\s\S]*Frühere sieben Tage anzeigen[\s\S]*role="group" aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /aria-pressed="true"[^>]*>Woche</);
  assert.match(markup, /Frühere sieben Tage anzeigen/);
  assert.match(markup, /Spätere sieben Tage anzeigen/);
  assert.match(markup, /data-testid="study-heatmap-grid"[^>]*data-heatmap-period="week"/);
  assert.equal((markup.match(/data-heatmap-day=/g) ?? []).length, 7);
  assert.match(markup, />Mo<\/span><span[^>]*>06\.07\.<\/span>/);
  assert.match(markup, /2026-07-07: 3 Wiederholungen/);
  assert.match(markup, /data-testid="study-heatmap-legend"[\s\S]*Gelernt[\s\S]*Fällig/);
  assert.match(markup, />Heute<\/span><span[^>]*>07\.07\.<\/span>/);
  for (let level = 1; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
});

test("shared study heatmap uses the plural streak title for zero and multiple days", () => {
  const emptyMarkup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={createStudyHeatmapModelFromCounts({ todayKey: "2026-07-07", countsByDay: new Map() })}
      formatDayLabel={(day) => day.key}
    />,
  );
  assert.match(emptyMarkup, /0<\/span> <span class="core-heading-3">Tage Streak/);

  const streakMarkup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={createStudyHeatmapModelFromCounts({
        todayKey: "2026-07-07",
        countsByDay: new Map([["2026-07-05", 1], ["2026-07-06", 1], ["2026-07-07", 1]]),
      })}
      formatDayLabel={(day) => day.key}
    />,
  );
  assert.match(streakMarkup, /3<\/span> <span class="core-heading-3">Tage Streak/);
});

test("shared study heatmap tints its history levels with the freely picked color", () => {
  assert.equal(HEATMAP_HISTORY_COLOR_STORAGE_KEY, "core.studyHeatmap.historyColor.v2");
  const markup = renderHeatmapAt("week", "2026-08-10", new Map(), "#3fa66b");
  assert.match(markup, /data-heatmap-history-color="#3fa66b"/);
  assert.match(markup, /--core-heatmap-history-level-1:color-mix\(in srgb, var\(--core-surface\) 84%, #3fa66b\)/);
  assert.match(markup, /--core-heatmap-history-level-4:#3fa66b/);
});

test("shared study heatmap normalizes stored colors and otherwise uses the CoRe accent", () => {
  assert.equal(normalizeHeatmapHistoryColor("#3FA66B"), "#3fa66b");
  for (const value of [null, "", "lila", "#12345"]) assert.equal(normalizeHeatmapHistoryColor(value), HEATMAP_HISTORY_DEFAULT_COLOR);
});

test("shared study heatmap renders forecast copy and levels and explains both scales in the legend", () => {
  const markup = renderHeatmapWeekAt("2026-08-16", new Map([
    ["2026-08-12", 1],
    ["2026-08-13", 1_200],
  ]));

  assert.match(markup, /11\.08\.2026: voraussichtlich keine Karten fällig/);
  assert.match(markup, /12\.08\.2026: voraussichtlich 1 Karte fällig/);
  assert.match(markup, /13\.08\.2026: voraussichtlich 1\.200 Karten fällig/);
  assert.match(markup, /data-heatmap-day="2026-08-11" data-heatmap-kind="forecast"[^>]*><\/span>/);
  assert.match(markup, /core-heatmap-forecast-level-1/);
  assert.match(markup, /core-heatmap-forecast-level-4/);
  assert.match(markup, /data-heatmap-kind="forecast"/);
  const legend = markup.match(/data-testid="study-heatmap-legend"[\s\S]*$/)?.[0] ?? "";
  assert.match(legend, /Gelernt[\s\S]*core-heatmap-level-4[\s\S]*Fällig[\s\S]*core-heatmap-forecast-level-4/);
});

test("shared study heatmap labels days beyond the forecast boundary", () => {
  const markup = renderHeatmapWeekAt("2027-08-16", new Map([["2027-08-10", 2]]));

  assert.match(markup, /10\.08\.2027: voraussichtlich 2 Karten fällig/);
  assert.match(markup, /11\.08\.2027: außerhalb der 365-Tage-Prognose/);
  assert.match(markup, /data-heatmap-kind="unavailable"/);
});
