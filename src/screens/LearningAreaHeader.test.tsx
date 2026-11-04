import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";

test("learning and card management headers keep learning settings without an area switch", () => {
  for (const [area, eyebrow, title] of [["overview", "Review", "Lernen"], ["cards", "Alle Stapel", "Kartenverwaltung"]] as const) {
    const markup = renderToStaticMarkup(<LearningAreaHeader area={area} onOpenCardSettings={() => undefined} />);
    assert.match(markup, new RegExp(`>${eyebrow}</p><h2[^>]*>${title}</h2>`));
    assert.ok(markup.indexOf(`>${title}</h2>`) < markup.indexOf("Lerneinstellungen"));
    assert.match(markup, /lucide-settings2/);
    assert.doesNotMatch(markup, /role="group"|aria-pressed|Bereich in Lernen/);
  }
});
