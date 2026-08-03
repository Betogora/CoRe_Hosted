import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpScreen } from "./HelpScreen.tsx";

test("renders the truncated FSRS graph, interactive parameters and variant disclaimer", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);

  assert.match(markup, /Wie CoRe und FSRS funktionieren/);
  assert.match(markup, /FSRS plant den richtigen Zeitpunkt/);
  assert.match(markup, /CoRe verändert zusätzlich die Fragestellung/);
  assert.match(markup, /So arbeitet ein Spaced-Repetition-Scheduler/);
  assert.match(markup, /alle Reviews einschließlich mehrerer Abrufe am selben Tag/);
  assert.match(markup, /21 Modellparameter/);
  assert.match(markup, /höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag/);
  assert.match(markup, /bereit für Varianten/);
  assert.match(markup, /keine garantierte Reviewnummer/);
  assert.match(markup, /Abrufwahrscheinlichkeit/);
  assert.match(markup, /Stabilität/);
  assert.match(markup, /Schwierigkeit/);
  assert.match(markup, /Zielerinnerung/);
  assert.match(markup, /Ausschnitt 90–100 %/);
  assert.match(markup, /Zwei diagonale Striche/);
  assert.match(markup, /Vereinfachtes Beispiel/);
  assert.match(markup, /Review 4 · CoRe-Variante/);
  assert.match(markup, /keine garantierte Produktionsschwelle/);
  assert.match(markup, /href="https:\/\/github\.com\/open-spaced-repetition\/awesome-fsrs\/wiki\/ABC-of-FSRS"/);
  assert.equal((markup.match(/data-testid="memory-parameter-/g) ?? []).length, 3);
  assert.equal((markup.match(/data-testid="memory-review-point-/g) ?? []).length, 4);
  assert.equal((markup.match(/data-testid="memory-review-summary-/g) ?? []).length, 4);
  assert.equal((markup.match(/data-testid="memory-y-axis-break"/g) ?? []).length, 1);
});
