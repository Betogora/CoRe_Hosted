import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudyHeatmapModelFromCounts } from "../studyHeatmapModel.ts";
import {
  HEATMAP_HISTORY_COLOR_OPTIONS,
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
  assert.match(markup, /data-heatmap-history-color="#d6a3d2"/);
  assert.match(markup, /aria-label="Heatmap-Farbe ändern"/);
  assert.match(markup, /background-color:var\(--core-learning-status-new\)/);
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
  assert.match(markup, /<span class="[^"]*whitespace-nowrap[^"]*font-semibold[^"]*">Di, 7\.7\.<\/span>/);
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

test("shared study heatmap fills wide panels with compact month gutters", () => {
  const markup = renderHeatmapAt("month", "2026-08-10");

  assert.match(markup, /class="w-full" role="img" data-testid="study-heatmap-grid" data-heatmap-period="month"/);
  assert.match(markup, /class="grid grid-cols-7 gap-1\.5 sm:gap-2"/);
  assert.match(markup, /h-14 w-full rounded-lg/);
  assert.doesNotMatch(markup, /max-w-\[30rem\]|max-w-14/);
});

test("shared study heatmap offers exactly the four learning-status colors", () => {
  assert.equal(HEATMAP_HISTORY_COLOR_STORAGE_KEY, "core.studyHeatmap.historyColor.v1");
  assert.equal(HEATMAP_HISTORY_DEFAULT_COLOR, "#d6a3d2");
  assert.deepEqual(HEATMAP_HISTORY_COLOR_OPTIONS, [
    { color: "#6f7e9e", label: "Gelernt", tone: "var(--core-learning-status-learned)" },
    { color: "#d6a3d2", label: "Neu", tone: "var(--core-learning-status-new)" },
    { color: "#e28b68", label: "Offen", tone: "var(--core-learning-status-in-progress)" },
    { color: "#e4bf63", label: "Fällig", tone: "var(--core-learning-status-due)" },
  ]);

  const markup = renderHeatmapAt("week", "2026-08-10", new Map(), "#e28b68");
  assert.match(markup, /data-heatmap-history-color="#e28b68"/);
  assert.match(markup, /--core-heatmap-history-level-1:color-mix\(in srgb, var\(--core-surface\) 84%, var\(--core-learning-status-in-progress\)\)/);
  assert.match(markup, /--core-heatmap-history-level-4:var\(--core-learning-status-in-progress\)/);
});

test("shared study heatmap accepts only current palette colors and otherwise uses CoRe lilac", () => {
  for (const option of HEATMAP_HISTORY_COLOR_OPTIONS) assert.equal(normalizeHeatmapHistoryColor(option.color.toUpperCase()), option.color);
  for (const value of [null, "", "#123456", "lila"]) assert.equal(normalizeHeatmapHistoryColor(value), HEATMAP_HISTORY_DEFAULT_COLOR);
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
