import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Steps, type StepsProps } from "./Steps.tsx";

const items = [{ label: "Prüfung" }, { label: "Lernstoff" }, { label: "Lernzeit" }, { label: "Lernplan" }];

function buttons(props: StepsProps) {
  const found: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>[] = [];
  const visit = (node: React.ReactNode) => React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
    if (child.type === "button") found.push(child as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>);
    visit(child.props.children);
  });
  visit(Steps(props));
  return found;
}

test("steps form an ordered, numbered list with a check for done steps and one current step", () => {
  const markup = renderToStaticMarkup(<Steps ariaLabel="Schritte der Prüfungsplanung" items={items} current={2} />);

  assert.match(markup, /^<div class="core-steps"><ol aria-label="Schritte der Prüfungsplanung">/);
  assert.deepEqual([...markup.matchAll(/data-state="(\w+)"/g)].map((match) => match[1]), ["done", "done", "current", "upcoming"]);
  assert.equal(markup.match(/aria-current="step"/g)?.length, 1);
  assert.match(markup, /<li data-state="current" aria-current="step"><span aria-hidden="true" class="core-steps-line"><\/span><span class="core-steps-step"><span aria-hidden="true" class="core-steps-marker">3<\/span><span class="core-steps-label">Lernzeit<\/span><\/span><\/li>/);
  assert.match(markup, /<span aria-hidden="true" class="core-steps-marker">4<\/span><span class="core-steps-label">Lernplan/);
  assert.equal(markup.match(/class="core-steps-marker"><svg[^>]*lucide-check/g)?.length, 2, "done steps show a check instead of their number");
  assert.match(markup, /Prüfung<\/span><span class="sr-only">, erledigt<\/span>/);
  assert.doesNotMatch(markup, /Lernzeit<\/span><span class="sr-only">/);
  assert.equal(markup.match(/core-steps-line/g)?.length, 3, "one connecting line between neighbouring steps");
  assert.doesNotMatch(markup, /<button/);
});

test("current at the end marks every step as done", () => {
  const complete = renderToStaticMarkup(<Steps ariaLabel="Planung" items={items} current={items.length} />);
  assert.deepEqual([...complete.matchAll(/data-state="(\w+)"/g)].map((match) => match[1]), ["done", "done", "done", "done"]);
  assert.doesNotMatch(complete, /aria-current/);
});

test("selectable steps are buttons that report their index; locked steps cannot be chosen", () => {
  const selected: number[] = [];
  const props: StepsProps = { ariaLabel: "Planung", items: [...items.slice(0, 3), { label: "Lernplan", disabled: true }], current: 1, onSelect: (index) => selected.push(index) };
  const markup = renderToStaticMarkup(<Steps {...props} />);

  assert.equal(markup.match(/<button type="button" class="core-steps-step"/g)?.length, 4);
  assert.match(markup, /<button type="button" class="core-steps-step" disabled="">[\s\S]*Lernplan/);
  const steps = buttons(props);
  assert.deepEqual(steps.map((button) => Boolean(button.props.disabled)), [false, false, false, true]);
  steps[0].props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
  steps[2].props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
  assert.deepEqual(selected, [0, 2]);
});
