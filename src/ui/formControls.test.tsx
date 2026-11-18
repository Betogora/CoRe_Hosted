import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoreCheckbox, CoreRadio, CoreSlider, CoreSwitch } from "./formControls.tsx";

const inputOf = (markup: string) => markup.match(/<input[^>]*>/)?.[0] ?? "";

test("checkbox keeps a native, labelled and controlled checkbox with its description", () => {
  const markup = renderToStaticMarkup(<CoreCheckbox label="Beispiele aufnehmen" description="Nur aus dem eigenen Material." checked onCheckedChange={() => undefined} data-testid="examples" />);
  const input = inputOf(markup);

  assert.match(input, /^<input type="checkbox"/);
  assert.match(input, /checked=""/);
  assert.match(input, /data-testid="examples"/);
  assert.match(markup, /<label class="core-checkbox-content">[\s\S]*Beispiele aufnehmen<\/span><\/label>/);
  const descriptionId = markup.match(/<span id="([^"]+)" class="core-checkbox-description">Nur aus dem eigenen Material\.<\/span>/)?.[1];
  assert.ok(descriptionId);
  assert.match(input, new RegExp(`aria-describedby="${descriptionId}"`));
  assert.match(markup, /data-state="checked"/);
});

test("checkbox marks unchecked, indeterminate, invalid and disabled states", () => {
  const unchecked = renderToStaticMarkup(<CoreCheckbox aria-label="Karte auswählen" checked={false} />);
  assert.match(unchecked, /data-state="unchecked"/);
  assert.doesNotMatch(inputOf(unchecked), /checked=""/);
  assert.match(inputOf(unchecked), /aria-label="Karte auswählen"/);
  assert.doesNotMatch(unchecked, /<label/);

  const mixed = renderToStaticMarkup(<CoreCheckbox label="Alle" checked={false} indeterminate />);
  assert.match(mixed, /data-state="indeterminate"/);
  assert.match(mixed, /data-mark="indeterminate"/);

  const invalid = renderToStaticMarkup(<CoreCheckbox label="Pflicht" checked={false} invalid disabled />);
  assert.match(invalid, /data-invalid="true"/);
  assert.match(invalid, /data-disabled="true"/);
  assert.match(inputOf(invalid), /disabled=""/);
  assert.match(inputOf(invalid), /aria-invalid="true"/);
});

test("checkbox accent colours the box through local custom properties", () => {
  const markup = renderToStaticMarkup(<CoreCheckbox aria-label="Erledigt" checked accent={{ fill: "#123456", on: "#ffffff" }} />);
  assert.match(markup, /style="--core-check-accent:#123456;--core-check-on-accent:#ffffff"/);
});

test("radio stays a native radio of its group", () => {
  const markup = renderToStaticMarkup(<CoreRadio name="goal" value="0.9" label="Gute Note" checked onCheckedChange={() => undefined} />);
  assert.match(inputOf(markup), /^<input type="radio" name="goal"/);
  assert.match(inputOf(markup), /checked="" value="0.9"/);
  assert.match(markup, /class="core-radio-dot"/);
});

test("switch exposes the switch role on a native checkbox in every size", () => {
  for (const size of ["sm", "md", "lg"] as const) {
    const markup = renderToStaticMarkup(<CoreSwitch size={size} label="Varianten einbeziehen" checked={size === "md"} onCheckedChange={() => undefined} />);
    assert.match(inputOf(markup), /^<input type="checkbox" role="switch"/);
    assert.match(markup, new RegExp(`data-size="${size}"`));
    assert.match(markup, new RegExp(`data-state="${size === "md" ? "checked" : "unchecked"}"`));
  }
  const start = renderToStaticMarkup(<CoreSwitch aria-label="CoRe-Modus" labelPlacement="start" checked={false} disabled />);
  assert.match(start, /data-label-placement="start"/);
  assert.match(inputOf(start), /aria-label="CoRe-Modus"/);
  assert.match(inputOf(start), /disabled=""/);
});


test("slider keeps a native range with the formatted value as output and spoken text", () => {
  const markup = renderToStaticMarkup(<CoreSlider id="retention" label="Erinnerungsrate" min={70} max={99} value={90} formatValue={(value) => `${value} %`} onValueChange={() => undefined} data-testid="retention" />);
  const input = inputOf(markup);
  assert.match(input, /id="retention"/);
  assert.match(input, /type="range"/);
  assert.match(input, /min="70"/);
  assert.match(input, /max="99"/);
  assert.match(input, /aria-valuetext="90 %"/);
  assert.match(input, /value="90"/);
  assert.match(markup, /<label for="retention" class="core-slider-label">Erinnerungsrate<\/label>/);
  assert.match(markup, /<output for="retention" class="core-slider-output">90 %<\/output>/);
  assert.match(markup, /--core-slider-ratio:0\.6896/);

  const bare = renderToStaticMarkup(<CoreSlider aria-label="Transparenz" min={0} max={100} value={140} formatValue={null} disabled onValueChange={() => undefined} />);
  assert.doesNotMatch(bare, /<output|<label/);
  assert.match(bare, /--core-slider-ratio:1/);
  assert.match(bare, /data-disabled="true"/);
  assert.match(inputOf(bare), /disabled=""/);
  assert.doesNotMatch(inputOf(bare), /aria-valuetext/);
});
