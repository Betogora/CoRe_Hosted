import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SimulatorScreen } from "./SimulatorScreen.tsx";

test("simulator exposes bounded calendar controls without the retired test deck", () => {
  const markup = renderToStaticMarkup(
    <SimulatorScreen
      systemNow="2026-08-06T10:00:00.000Z"
      offsetMinutes={3 * 24 * 60}
      onOffsetChange={() => undefined}
    />,
  );

  assert.match(markup, /Simulator/);
  assert.match(markup, /In 3 Tagen/);
  assert.match(markup, /Heute/);
  assert.match(markup, /\+10 Min\./);
  assert.match(markup, /\+15 Min\./);
  assert.match(markup, /\+30 Min\./);
  assert.match(markup, /\+1 Std\./);
  assert.match(markup, /\+4 Std\./);
  assert.match(markup, /Morgen/);
  assert.match(markup, /\+3 Tage/);
  assert.match(markup, /\+30 Tage/);
  assert.match(markup, /type="date"/);
  assert.match(markup, /min="2026-08-06"/);
  assert.match(markup, /max="2036-08-03"/);
  assert.match(markup, /\d{2}:\d{2} Uhr/);
  assert.match(markup, /echte Reviews/);
  assert.match(markup, /nicht bereits gespeicherte Reviews/);
  assert.doesNotMatch(markup, /FSRS-Teststapel|Diesen Tag lernen|Simulationsverlauf/);
});
