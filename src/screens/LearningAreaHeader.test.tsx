import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";

test("learning areas share control typography and keep settings before the area switch", () => {
  for (const area of ["overview", "cards"] as const) {
    const markup = renderToStaticMarkup(<LearningAreaHeader area={area} onAreaChange={() => undefined} onOpenCardSettings={() => undefined} />);
    assert.ok(markup.indexOf("Lerneinstellungen") < markup.indexOf('aria-label="Bereich in Lernen"'));
    assert.match(markup, /lucide-settings2/);
    assert.match(markup, /core-segmented-control[^>]*core-control-label/);
    assert.match(markup, /data-size="regular"/);
    assert.match(markup, new RegExp(`aria-pressed="true"[^>]*>${area === "overview" ? "Stapelübersicht" : "Kartenverwaltung"}`));
  }
});
