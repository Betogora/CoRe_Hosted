import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleAlert, Languages } from "lucide-react";
import { createCoreDeck } from "../coreModel.ts";
import { CoreSelect, DeckSelect } from "./selectUi.tsx";

test("CoreSelect renders the controlled value with an accessible combobox trigger", () => {
  const ref = React.createRef<HTMLButtonElement>();
  const markup = renderToStaticMarkup(
    <CoreSelect
      ref={ref}
      ariaLabel="Kartentyp"
      value="basic"
      options={[
        { value: "basic", label: "Basic" },
        { value: "cloze", label: "Lückentext" },
      ]}
      onValueChange={() => undefined}
      leadingIcon={Languages}
    />,
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-label="Kartentyp"/);
  assert.match(markup, />Basic</);
  assert.match(markup, /px-4/);
  assert.match(markup, /lucide-languages/);
  assert.equal(ref.current, null);
});

test("CoreSelect accepts an empty external value without losing its label", () => {
  const markup = renderToStaticMarkup(
    <CoreSelect
      ariaLabel="Ebene"
      value=""
      options={[
        { value: "", label: "Als Hauptstapel" },
        { value: "deck-parent", label: "Bereich / Unterstapel" },
      ]}
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, />Als Hauptstapel</);
});

test("DeckSelect renders the selected deck icon and complete hierarchy path", () => {
  const parent = createCoreDeck({ id: "deck-parent", name: "Biologie", hierarchyPath: ["Biologie"], source: "manual", cards: [] });
  const child = createCoreDeck({
    id: "deck-child",
    parentDeckId: parent.id,
    name: "Zelle",
    hierarchyPath: ["Biologie", "Zelle"],
    source: "manual",
    deckSettings: { appearance: { iconKey: "microscope", iconColor: "#047857" } },
    cards: [],
  });
  const markup = renderToStaticMarkup(
    <DeckSelect
      ariaLabel="Kartenstapel"
      value={child.id}
      decks={[parent, child]}
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-label="Kartenstapel"/);
  assert.match(markup, /data-deck-select-trigger="true"/);
  assert.match(markup, /data-deck-icon="true"/);
  assert.match(markup, /lucide-microscope/);
  assert.match(markup, /color:#047857/);
  assert.match(markup, />Biologie \/ Zelle</);
});

test("DeckSelect keeps an empty special value visible with its warning icon", () => {
  const deck = createCoreDeck({ id: "deck-parent", name: "Biologie", source: "manual", cards: [] });
  const markup = renderToStaticMarkup(
    <DeckSelect
      ariaLabel="Kartenstapel"
      value=""
      decks={[deck]}
      selectableDeckIds={[]}
      specialOption={{ value: "", label: "Zielstapel nicht gefunden", icon: CircleAlert, tone: "danger" }}
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, />Zielstapel nicht gefunden</);
  assert.match(markup, /lucide-circle-alert/);
  assert.match(markup, /var\(--core-danger-surface\)/);
});
