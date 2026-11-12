import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionHeader } from "./SectionHeader.tsx";

test("section header renders the caller's heading level with count and action, without an icon", () => {
  const markup = renderToStaticMarkup(<SectionHeader level={3} id="decks-title" title="Aktive Stapel" count={8} action={<button type="button">Alle einklappen</button>} />);

  assert.match(markup, /^<div class="core-section-header"><h3 id="decks-title" class="core-section-header-title">Aktive Stapel<\/h3><span class="core-section-header-count">8<\/span><div class="core-section-header-action"><button type="button">Alle einklappen<\/button><\/div><\/div>$/);
  assert.doesNotMatch(markup, /<svg/);
});

test("section header leaves out empty count and action slots", () => {
  const markup = renderToStaticMarkup(<SectionHeader level={2} title="Lernaktivität" count={0} className="mb-2" />);

  assert.match(markup, /^<div class="core-section-header mb-2"><h2 class="core-section-header-title">Lernaktivität<\/h2><span class="core-section-header-count">0<\/span><\/div>$/);
  assert.doesNotMatch(renderToStaticMarkup(<SectionHeader level={4} title="Ohne" />), /count|action/);
});
