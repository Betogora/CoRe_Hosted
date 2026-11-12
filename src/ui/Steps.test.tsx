import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Steps } from "./Steps.tsx";

const items = [{ label: "Prüfung" }, { label: "Lernstoff" }, { label: "Lernzeit" }, { label: "Dein Plan" }];

test("steps form an ordered list with done, current and upcoming states", () => {
  const markup = renderToStaticMarkup(<Steps ariaLabel="Schritte der Prüfungsplanung" items={items} current={1} />);

  assert.match(markup, /^<div class="core-steps"><ol aria-label="Schritte der Prüfungsplanung">/);
  assert.deepEqual([...markup.matchAll(/data-state="(\w+)"/g)].map((match) => match[1]), ["done", "current", "upcoming", "upcoming"]);
  assert.equal(markup.match(/aria-current="step"/g)?.length, 1);
  assert.match(markup, /<li data-state="current" aria-current="step"><span aria-hidden="true" class="core-steps-line"><\/span><span class="core-steps-step"><span aria-hidden="true" class="core-steps-dot"><\/span><span class="core-steps-label">Lernstoff<\/span><\/span><\/li>/);
  assert.match(markup, /Prüfung<\/span><span class="sr-only">, erledigt<\/span>/);
  assert.equal(markup.match(/core-steps-line/g)?.length, 3, "one connecting line between neighbouring steps");
  assert.doesNotMatch(markup, /<button/);
});

test("steps mark a failed step, stretch, animate the line after the current step and complete at the end", () => {
  const failed = renderToStaticMarkup(<Steps ariaLabel="Import" items={[{ label: "Analysieren" }, { label: "Übernehmen", failed: true }, { label: "Fertig" }]} current={1} stretch animated />);
  assert.match(failed, /^<div class="core-steps" data-stretch="true" data-animated="true">/);
  assert.match(failed, /<li data-state="failed" aria-current="step">[\s\S]*Übernehmen<\/span><span class="sr-only">, fehlgeschlagen<\/span>/);
  assert.match(failed, /<li data-state="upcoming" data-after-current="true">[\s\S]*Fertig/);

  const complete = renderToStaticMarkup(<Steps ariaLabel="Import" items={items} current={items.length} />);
  assert.deepEqual([...complete.matchAll(/data-state="(\w+)"/g)].map((match) => match[1]), ["done", "done", "done", "done"]);
  assert.doesNotMatch(complete, /aria-current/);
});

test("selectable steps become buttons and honour disabled steps", () => {
  const markup = renderToStaticMarkup(<Steps ariaLabel="Planung" items={[...items.slice(0, 2), { label: "Lernzeit", disabled: true }]} current={0} onSelect={() => undefined} />);

  assert.equal(markup.match(/<button type="button" class="core-steps-step"/g)?.length, 3);
  assert.match(markup, /<button type="button" class="core-steps-step" disabled="">[\s\S]*Lernzeit/);
});
