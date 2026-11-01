import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";

test("learning areas use the shared regular area switch and keep settings before it", () => {
  for (const area of ["overview", "cards"] as const) {
    const markup = renderToStaticMarkup(<LearningAreaHeader area={area} onAreaChange={() => undefined} onOpenCardSettings={() => undefined} />);
    assert.ok(markup.indexOf("Lerneinstellungen") < markup.indexOf('aria-label="Bereich in Lernen"'));
    assert.match(markup, /lucide-settings2/);
    assert.match(markup, /role="group" aria-label="Bereich in Lernen" data-size="regular"/);
    assert.match(markup, new RegExp(`aria-pressed="true"[^>]*>${area === "overview" ? "Stapelübersicht" : "Kartenverwaltung"}`));
  }
});
