import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudyHeatmapModelFromCounts } from "../studyHeatmapModel.ts";
import { StudyHeatmap } from "./StudyHeatmap.tsx";

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
