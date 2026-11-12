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
  for (const heading of ["So arbeitet ein Spaced-Repetition-Scheduler", "Transparenz zum aktuellen Scheduler", "So läuft eine Prüfungssitzung", "So arbeitest du in der Kartenverwaltung", "Was bei Varianten geschützt bleibt", "Mehr über FSRS"]) {
    assert.match(markup, new RegExp(`<h3[^>]*>${heading}</h3>`));
  }
  assert.match(markup, /href="https:\/\/github\.com\/open-spaced-repetition\/awesome-fsrs\/wiki\/ABC-of-FSRS"/);
});

test("help opens right below its title without eyebrows or icon tiles", () => {
  const markup = renderToStaticMarkup(<HelpScreen />);

  assert.doesNotMatch(markup, /Lernen, das wirklich bleibt|Methode 1|Methode 2|Zum Nachlesen|01 · Viele Karten|07 · S/);
  assert.doesNotMatch(markup, /min-h-\[72svh\]/);
  assert.doesNotMatch(markup, /grid size-10 shrink-0 place-items-center/);
  assert.match(markup, /<svg[^>]*class="lucide lucide-clock3 shrink-0 text-core-secondary"[^>]*>[\s\S]*?<h3 class="core-heading-2 text-core-text">So arbeitet ein Spaced-Repetition-Scheduler<\/h3>/);
});
