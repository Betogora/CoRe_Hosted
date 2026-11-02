import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Highlighter } from "lucide-react";
import { ColorPicker } from "./ColorPicker.tsx";

test("color picker renders an accessible swatch trigger without a native color input", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ColorPicker, {
      value: "#4F5EB1",
      ariaLabel: "Iconfarbe auswählen",
      onValueCommit: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Iconfarbe auswählen"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /background-color:#4f5eb1/);
  assert.doesNotMatch(markup, /<input|type="color"/);
});

test("color picker tool variant shows its icon with the current color as a bar", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ColorPicker, {
      value: "#f6dd8e",
      ariaLabel: "Markerfarbe",
      variant: "tool",
      icon: Highlighter,
      onValueCommit: () => undefined,
    }),
  );

  assert.match(markup, /class="core-rich-text-tool relative /);
  assert.match(markup, /lucide-highlighter/);
  assert.match(markup, /background-color:#f6dd8e/);
  assert.match(markup, /data-core-tooltip="Markerfarbe"/);
});
