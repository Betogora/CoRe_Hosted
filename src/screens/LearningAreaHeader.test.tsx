import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";

test("learning and card management headers keep learning settings without an area switch", () => {
  for (const [area, title] of [["overview", "Lernen"], ["cards", "Kartenverwaltung"]] as const) {
    const markup = renderToStaticMarkup(<LearningAreaHeader area={area} onOpenCardSettings={() => undefined} />);
    assert.match(markup, new RegExp(`<div class="min-w-0 space-y-1"><h2[^>]*>${title}</h2></div>`), "kein Eyebrow über dem Titel");
    assert.ok(markup.indexOf(`>${title}</h2>`) < markup.indexOf("Lerneinstellungen"));
    assert.match(markup, /lucide-settings2/);
    assert.doesNotMatch(markup, /role="group"|aria-pressed|Bereich in Lernen/);
  }
});
