import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleAlert, Languages, Scale, SlidersHorizontal } from "lucide-react";
import { createCoreDeck } from "../coreModel.ts";
import { CoreSelect, DeckMultiSelect, DeckSelect } from "./selectUi.tsx";

test("CoreSelect renders the controlled value with an accessible combobox trigger", () => {
  const markup = renderToStaticMarkup(
    <CoreSelect
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
  assert.match(markup, /lucide-languages/);
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

test("CoreSelect shows the selected option icon before its label", () => {
  const markup = renderToStaticMarkup(
    <CoreSelect
      ariaLabel="Lernprofil"
      value="custom"
      options={[
        { value: "builtin:standard", label: "Standard", icon: Scale },
        { value: "custom", label: "Eigene Einstellungen", icon: SlidersHorizontal },
      ]}
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, /lucide-sliders-horizontal/);
  assert.match(markup, />Eigene Einstellungen</);
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

test("DeckSelect keeps a complete deep logical hierarchy path", () => {
  const decks = Array.from({ length: 12 }, (_, index) => createCoreDeck({
    id: `deep-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `deep-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "manual",
    cards: [],
  }));
  const markup = renderToStaticMarkup(
    <DeckSelect ariaLabel="Kartenstapel" value={decks.at(-1)!.id} decks={decks} onValueChange={() => undefined} />,
  );

  assert.match(markup, />Ebene 1 \/ Ebene 2 \/ Ebene 3 \/ Ebene 4 \/ Ebene 5 \/ Ebene 6 \/ Ebene 7 \/ Ebene 8 \/ Ebene 9 \/ Ebene 10 \/ Ebene 11 \/ Ebene 12</);
});

test("DeckSelect projects a large deep hierarchy without recursive traversal", () => {
  const decks = Array.from({ length: 2_000 }, (_, index) => createCoreDeck({
    id: `large-${index + 1}`,
    name: `Stapel ${index + 1}`,
    parentDeckId: index === 0 ? null : `large-${index}`,
    hierarchyPath: [`Stapel ${index + 1}`],
    source: "manual",
    cards: [],
  }));
  const markup = renderToStaticMarkup(
    <DeckSelect ariaLabel="Kartenstapel" value={decks.at(-1)!.id} decks={decks} onValueChange={() => undefined} />,
  );

  assert.match(markup, />Stapel 2000</);
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
  assert.match(markup, /bg-core-danger-soft/);
});

test("DeckSelect shows search from five selectable decks and excludes special options from the threshold", () => {
  const decks = Array.from({ length: 5 }, (_, index) => createCoreDeck({
    id: `deck-search-${index}`,
    name: `Stapel ${index + 1}`,
    source: "manual",
    cards: [],
  }));
  const fiveDeckMarkup = renderToStaticMarkup(
    <DeckSelect ariaLabel="Kartenstapel" value={decks[0].id} decks={decks} onValueChange={() => undefined} />,
  );
  const fourDeckMarkup = renderToStaticMarkup(
    <DeckSelect
      ariaLabel="Ebene"
      value=""
      decks={decks}
      selectableDeckIds={decks.slice(0, 4).map((deck) => deck.id)}
      specialOption={{ value: "", label: "Als Hauptstapel", icon: Languages }}
      onValueChange={() => undefined}
    />,
  );

  assert.match(fiveDeckMarkup, /data-deck-select-searchable="true"/);
  assert.match(fourDeckMarkup, /data-deck-select-searchable="false"/);
});

test("DeckMultiSelect exposes the shared searchable combobox trigger", () => {
  const decks = Array.from({ length: 5 }, (_, index) => createCoreDeck({
    id: `deck-multi-${index}`,
    name: `Stapel ${index + 1}`,
    source: "manual",
    cards: [],
  }));
  const markup = renderToStaticMarkup(
    <DeckMultiSelect decks={decks} value="all" onValueChange={() => undefined} />,
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /data-deck-multi-select-trigger="true"/);
  assert.match(markup, /data-deck-select-searchable="true"/);
  assert.match(markup, />Gesamte Sammlung</);
});

test("DeckMultiSelect labels the requested selection before statistics finish refreshing", () => {
  const decks = [createCoreDeck({ id: "biology", name: "Biologie", source: "manual" }), createCoreDeck({ id: "physics", name: "Physik", source: "manual" })];
  const single = renderToStaticMarkup(<DeckMultiSelect decks={decks} value={["biology"]} onValueChange={() => undefined} />);
  assert.match(single, /Stapel filtern\. Aktuell: Biologie/);
  const multiple = renderToStaticMarkup(<DeckMultiSelect decks={decks} value={["biology", "physics"]} onValueChange={() => undefined} />);
  assert.match(multiple, /Stapel filtern\. Aktuell: 2 Stapel ausgewählt/);
});
