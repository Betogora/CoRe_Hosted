import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudyHeatmapModelFromCounts } from "../studyHeatmapModel.ts";
import { StudyHeatmap } from "./StudyHeatmap.tsx";

test("shared study heatmap owns the common panel, navigation and accessible day wording", () => {
  const heatmap = createStudyHeatmapModelFromCounts({
    rangeStartKey: "2026-07-01",
    rangeEndKey: "2026-07-07",
    todayKey: "2026-07-07",
    countsByDay: new Map([["2026-07-07", 3]]),
  });
  const markup = renderToStaticMarkup(
    <StudyHeatmap
      heatmap={heatmap}
      formatDayLabel={(day) => `${day.key}: ${day.count} Wiederholungen`}
    />,
  );

  assert.match(markup, /Lern-Heatmap/);
  assert.match(markup, /Frühere Wochen anzeigen/);
  assert.match(markup, /Spätere Wochen anzeigen/);
  assert.match(markup, /data-testid="study-heatmap-grid"/);
  assert.match(markup, /2026-07-07: 3 Wiederholungen/);
  assert.match(markup, /data-testid="study-heatmap-legend"[\s\S]*Weniger[\s\S]*Mehr/);
  for (let level = 0; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
});
