import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { DECK_ICON_PICKER_KEYS, DeckAppearanceIcon, deckIconOptions } from "./deckAppearance.tsx";

test("deck appearance uses the selected color for icon, border and translucent round surface", () => {
  const markup = renderToStaticMarkup(
    <DeckAppearanceIcon appearance={{ iconKey: "brain", iconColor: "#047857" }} className="size-11" />,
  );

  assert.match(markup, /rounded-full border-2/);
  assert.match(markup, /color:#047857/);
  assert.match(markup, /border-color:#047857/);
  assert.match(markup, /background-color:#0478571f/);
});

test("deck icon picker exposes the curated 5 by 5 selection without narrowing persisted icon support", () => {
  assert.equal(deckIconOptions.length, 25);
  assert.equal(new Set(DECK_ICON_PICKER_KEYS).size, 25);
  assert.equal(normalizeDeckAppearance({ iconKey: "palette", iconColor: "#6f7e9e" }).iconKey, "palette");
  assert.deepEqual(deckIconOptions.map(({ label }) => label), [
    "Ordner", "Finanzen", "Buch", "Studium", "Notiz",
    "Code", "Terminal", "Musik", "Geschenk", "Schere",
    "Medizin", "Stern", "Blume", "Koffer", "Diagramm",
    "Training", "Notizbuch", "Waage", "Globus", "Flugzeug",
    "Werkzeug", "Labor", "Gehirn", "Herz", "Tasche",
  ]);
});
