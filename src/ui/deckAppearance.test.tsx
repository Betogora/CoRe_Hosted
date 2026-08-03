import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";

test("deck appearance uses the selected color for icon, border and translucent round surface", () => {
  const markup = renderToStaticMarkup(
    <DeckAppearanceIcon appearance={{ iconKey: "brain", iconColor: "#047857" }} className="size-11" />,
  );

  assert.match(markup, /rounded-full border-2/);
  assert.match(markup, /color:#047857/);
  assert.match(markup, /border-color:#047857/);
  assert.match(markup, /background-color:#0478571f/);
});
