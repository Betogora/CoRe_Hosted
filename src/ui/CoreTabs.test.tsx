import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoreTabPanel, CoreTabs } from "./CoreTabs.tsx";

const tabs = [
  { value: "substacks", label: "Unterstapel" },
  { value: "cards", label: "Karten" },
  { value: "source", label: "Quelle" },
] as const;

test("underline tabs expose a named tablist with one selected, focusable tab and no icons", () => {
  const markup = renderToStaticMarkup(<CoreTabs ariaLabel="Stapelinhalte" tabs={tabs} value="cards" onValueChange={() => undefined} panelId="deck-content" />);

  assert.match(markup, /<div role="tablist" aria-label="Stapelinhalte" class="core-tabs-list">/);
  assert.equal(markup.match(/role="tab"/g)?.length, 3);
  assert.match(markup, /<button id="deck-content-tab-cards" type="button" role="tab" aria-selected="true" aria-controls="deck-content" tabindex="0" class="core-tabs-tab" data-label="Karten">Karten<\/button>/);
  assert.equal(markup.match(/tabindex="-1"/g)?.length, 2, "roving tab index");
  assert.doesNotMatch(markup, /<svg/);
});

test("the tab panel is labelled by the selected tab", () => {
  const markup = renderToStaticMarkup(<CoreTabPanel panelId="deck-content" value="cards">Inhalt</CoreTabPanel>);

  assert.equal(markup, '<div id="deck-content" role="tabpanel" aria-labelledby="deck-content-tab-cards" tabindex="0">Inhalt</div>');
});
