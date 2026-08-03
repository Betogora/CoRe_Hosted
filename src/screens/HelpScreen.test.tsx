import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpScreen } from "./HelpScreen.tsx";

test("renders the sketched help-page order and decision graph", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);
  const orderedHeadings = [
    "Spaced Repetition bildet die Grundlage",
    "Der Gedächtniszustand verständlich erklärt",
    "Wie eine Bewertung das nächste Intervall verändert",
    "Vier Antworten steuern das nächste Intervall",
    "So arbeitet ein Spaced-Repetition-Scheduler",
    "Gleiches Wissen, neue Fragestellung",
  ];

  assert.match(markup, /Wie CoRe und FSRS funktionieren/);
  orderedHeadings.reduce((previousPosition, heading) => {
    const position = markup.indexOf(heading);
    assert.ok(position > previousPosition, `${heading} steht in der vorgesehenen Reihenfolge`);
    return position;
  }, -1);

  assert.match(markup, /id="grundbegriffe"/);
  assert.match(markup, /id="bewertungen"/);
  assert.match(markup, /id="spaced-repetition"/);
  assert.match(markup, /id="content-repetition"/);
  assert.equal((markup.match(/id="grundbegriff-[rsd]"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-testid="memory-parameter-/g) ?? []).length, 3);
  assert.equal((markup.match(/data-testid="memory-rating-curve-/g) ?? []).length, 4);
  assert.equal((markup.match(/href="#grundbegriffe"/g) ?? []).length, 3);
  assert.equal((markup.match(/href="#bewertungen"/g) ?? []).length, 4);
  assert.equal((markup.match(/href="#spaced-repetition"/g) ?? []).length, 1);
  assert.equal((markup.match(/href="#content-repetition"/g) ?? []).length, 1);

  assert.match(markup, /data-testid="memory-rating-curve-1" data-active="false"/);
  assert.match(markup, /data-testid="memory-rating-curve-2" data-active="false"/);
  assert.match(markup, /data-testid="memory-rating-curve-3" data-active="false"/);
  assert.match(markup, /data-testid="memory-rating-curve-4" data-active="true"/);
  assert.match(markup, /data-testid="memory-variant-link"/);
  assert.match(markup, /data-testid="memory-y-axis-break"/);
  assert.match(markup, /Ausschnitt 90-100 %/);
  assert.match(markup, /Vereinfachtes Beispiel/);
  assert.match(markup, /offiziellen 21 Standardparametern/);
  assert.match(markup, /persönliche Optimierung[^.]+noch nicht aktiviert/);
});

test("omits the former supplemental help panels and external link", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);

  assert.doesNotMatch(markup, /Transparenz zum aktuellen Scheduler/);
  assert.doesNotMatch(markup, /FSRS plant den richtigen Zeitpunkt/);
  assert.doesNotMatch(markup, /CoRe verändert zusätzlich die Fragestellung/);
  assert.doesNotMatch(markup, /memory-explorer-detail/);
  assert.doesNotMatch(markup, /memory-review-summary/);
  assert.doesNotMatch(markup, /memory-review-point/);
  assert.doesNotMatch(markup, /Original und Variante/);
  assert.doesNotMatch(markup, /Was bei Varianten geschützt bleibt/);
  assert.doesNotMatch(markup, /ABC of FSRS/);
  assert.doesNotMatch(markup, /github\.com\/open-spaced-repetition/);
});
