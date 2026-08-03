import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpScreen } from "./HelpScreen.tsx";

test("renders the FSRS explanation, interactive review points and variant disclaimer", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);

  assert.match(markup, /Wie CoRe und FSRS funktionieren/);
  assert.match(markup, /FSRS plant den richtigen Zeitpunkt/);
  assert.match(markup, /CoRe verändert zusätzlich die Fragestellung/);
  assert.match(markup, /Abrufwahrscheinlichkeit/);
  assert.match(markup, /Stabilität/);
  assert.match(markup, /Schwierigkeit/);
  assert.match(markup, /Zielerinnerung/);
  assert.match(markup, /Vereinfachtes Beispiel/);
  assert.match(markup, /Review 4 · CoRe-Variante/);
  assert.match(markup, /keine garantierte Produktionsschwelle/);
  assert.match(markup, /href="https:\/\/github\.com\/open-spaced-repetition\/awesome-fsrs\/wiki\/ABC-of-FSRS"/);
  assert.equal((markup.match(/data-testid="memory-review-point-/g) ?? []).length, 4);
});
