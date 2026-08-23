import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ColorWheelPicker } from "./ColorWheelPicker.tsx";

test("color wheel picker renders an accessible compact swatch without a native color input", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ColorWheelPicker, {
      value: "#4F5EB1",
      ariaLabel: "Iconfarbe auswählen",
      onValueCommit: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Iconfarbe auswählen"/);
  assert.match(markup, /size-11/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /background-color:#4f5eb1/);
  assert.doesNotMatch(markup, /<input|type="color"|font-mono/);
});

test("color wheel picker accepts named color suggestions", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ColorWheelPicker, {
      value: "#975c92",
      ariaLabel: "Heatmap-Farbe ändern",
      presetColors: [
        { color: "#975c92", label: "CoRe-Standard" },
        { color: "#6f7e9e", label: "CoRe Slate" },
      ],
      onValueCommit: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Heatmap-Farbe ändern"/);
  assert.match(markup, /background-color:#975c92/);
});
