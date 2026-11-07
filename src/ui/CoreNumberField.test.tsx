import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { commitNumberInput, CoreNumberField } from "./CoreNumberField.tsx";

test("CoreNumberField renders an integer field with its range, unit and stable test id", () => {
  const markup = renderToStaticMarkup(<CoreNumberField id="learn-ahead" testId="card-settings-learn-ahead" value={20} min={0} max={720} unit="Min." ariaDescribedBy="learn-ahead-hint" onChange={() => undefined} />);

  assert.match(markup, /<input id="learn-ahead" type="number" inputMode="numeric" min="0" max="720" step="1"[^>]*value="20"/);
  assert.match(markup, /aria-describedby="learn-ahead-hint"/);
  assert.match(markup, /data-testid="card-settings-learn-ahead"/);
  assert.match(markup, /aria-hidden="true"[^>]*>Min\.</);
});

test("CoreNumberField uses its id as test id and leaves room only for a unit", () => {
  const markup = renderToStaticMarkup(<CoreNumberField id="learning-settings-new-cards" value={20} min={0} max={500} onChange={() => undefined} />);

  assert.match(markup, /data-testid="learning-settings-new-cards"/);
  assert.doesNotMatch(markup, /pr-14/);
});

test("committing rounds and clamps numbers and restores the value for unusable text", () => {
  assert.equal(commitNumberInput("3", 0, 0, 23), 3);
  assert.equal(commitNumberInput("30", 0, 0, 23), 23);
  assert.equal(commitNumberInput("-4", 5, 0, 23), 0);
  assert.equal(commitNumberInput("7.6", 0, 0, 23), 8);
  assert.equal(commitNumberInput("", 9, 0, 23), 9);
  assert.equal(commitNumberInput("abc", 9, 0, 23), 9);
});
