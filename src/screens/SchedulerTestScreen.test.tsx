import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SchedulerTestScreen } from "./SchedulerTestScreen.tsx";

test("scheduler test mode starts isolated on day one with a clickable test deck", () => {
  const markup = renderToStaticMarkup(<SchedulerTestScreen />);

  assert.match(markup, /FSRS-Testmodus/);
  assert.match(markup, /vollständig vom Account getrennt/);
  assert.match(markup, /Tag 1/);
  assert.match(markup, /Tag 2/);
  assert.match(markup, /Tag 7/);
  assert.match(markup, /5 Karten an Tag 1/);
  assert.match(markup, /Diesen Tag lernen/);
  assert.match(markup, /Was ist die Hauptstadt von Frankreich/);
  assert.match(markup, /Simulation zurücksetzen/);
});
