import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoreTooltip } from "./tooltipUi.tsx";

test("CoreTooltip preserves child semantics and replaces native title hints", () => {
  let focused = false;
  const handleFocus = () => {
    focused = true;
  };
  const child = (
    <button
      type="button"
      aria-label="Frühere Wochen anzeigen"
      aria-describedby="bestehende-beschreibung"
      title="Nativer Hinweis"
      onFocus={handleFocus}
    >
      Zurück
    </button>
  );
  const tooltipChild = CoreTooltip({ label: "Frühere Wochen anzeigen", children: child });
  const markup = renderToStaticMarkup(tooltipChild);

  assert.equal(tooltipChild.props.onFocus, handleFocus);
  assert.match(markup, /^<button/);
  assert.match(markup, /aria-label="Frühere Wochen anzeigen"/);
  assert.match(markup, /aria-describedby="bestehende-beschreibung core-tooltip"/);
  assert.match(markup, /data-core-tooltip="Frühere Wochen anzeigen"/);
  assert.doesNotMatch(markup, /title=/);
  assert.doesNotMatch(markup, /<span/);
  assert.equal(focused, false);
});

test("CoreTooltip projects an optional statistics-style swatch and value", () => {
  const tooltipChild = CoreTooltip({
    label: "Neu",
    swatchColor: "var(--core-learning-status-new)",
    value: "5 Karten",
    children: <span aria-hidden="true" />,
  });
  const markup = renderToStaticMarkup(tooltipChild);

  assert.match(markup, /data-core-tooltip="Neu"/);
  assert.match(markup, /data-core-tooltip-swatch="var\(--core-learning-status-new\)"/);
  assert.match(markup, /data-core-tooltip-value="5 Karten"/);
});

test("CoreTooltip projects optional deck appearance without adding a wrapper", () => {
  const tooltipChild = CoreTooltip({
    label: "Stapeloptionen für Musik",
    deckAppearance: { iconKey: "music", iconColor: "#047857" },
    children: <button type="button">Öffnen</button>,
  });
  const markup = renderToStaticMarkup(tooltipChild);

  assert.match(markup, /^<button/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Musik"/);
  assert.match(markup, /data-core-tooltip-deck-icon-key="music"/);
  assert.match(markup, /data-core-tooltip-deck-icon-color="#047857"/);
  assert.doesNotMatch(markup, /^<span/);
});
