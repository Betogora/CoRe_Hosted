import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpScreen } from "./HelpScreen.tsx";

test("help sections carry labelled headings and the method links jump to them", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);

  for (const [id, heading] of [
    ["help-intro-heading", "Wir wollen Lernen verbessern."],
    ["active-recall-heading", "Active Recall"],
    ["spaced-repetition-heading", "Spaced Repetition findet den passenden Zeitpunkt"],
    ["reference-heading", "Das Wichtigste auf einen Blick"],
  ]) {
    assert.match(markup, new RegExp(`<section[^>]*aria-labelledby="${id}"`));
    assert.match(markup, new RegExp(`<h2 id="${id}"[^>]*>${heading.replace(".", "\\.")}</h2>`));
  }
  for (const target of ["active-recall-heading", "spaced-repetition-heading"]) {
    assert.match(markup, new RegExp(`<a(?=[^>]*href="#${target}")(?=[^>]*data-help-method-navigation="animated")`));
  }
  for (const heading of ["So arbeitet ein Spaced-Repetition-Scheduler", "Transparenz zum aktuellen Scheduler", "So läuft eine Prüfungssitzung", "Was bei Varianten geschützt bleibt", "Mehr über FSRS"]) {
    assert.match(markup, new RegExp(`<h3[^>]*>${heading}</h3>`));
  }
  assert.match(markup, /href="https:\/\/github\.com\/open-spaced-repetition\/awesome-fsrs\/wiki\/ABC-of-FSRS"/);
});
