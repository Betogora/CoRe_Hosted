import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createWorldCapitalsSeedDecks } from "../fixtures/worldCapitals.ts";
import { createCoreDeck } from "../coreModel.ts";
import { LearnScreen } from "./LearnScreen.tsx";

test("learning rows expose only counts, an explicit start and secondary deck options", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      onStartDeck={() => undefined}
      onCreateDeck={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, /Welt-Hauptstädte lernen/);
  assert.match(markup, /Stapeloptionen für Welt-Hauptstädte/);
  assert.match(markup, /data-learn-count-cell="new"/);
  assert.match(markup, /data-learn-count-cell="due"/);
  assert.match(markup, /data-learn-count-cell="total"/);
  assert.doesNotMatch(markup, /draggable=/);
  assert.doesNotMatch(markup, /Icon auswählen|Iconfarbe|CoRe aktiv/);
});

test("quick deck creation asks only for a name and optional parent deck", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      initialParentDeckId="deck_world_capitals"
      onStartDeck={() => undefined}
      onCreateDeck={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, /Stapelname/);
  assert.match(markup, /Als Hauptstapel/);
  assert.doesNotMatch(markup, /Iconfarbe|Icon auswählen/);
});

test("learning keeps duplicate subdeck names distinguishable and handles unavailable links safely", () => {
  const decks = [
    createCoreDeck({ id: "root-a", name: "Bereich A", hierarchyPath: ["Bereich A"], source: "manual", cards: [] }),
    createCoreDeck({ id: "child-a", parentDeckId: "root-a", name: "Gemeinsam", hierarchyPath: ["Bereich A", "Gemeinsam"], source: "manual", cards: [] }),
    createCoreDeck({ id: "root-b", name: "Bereich B", hierarchyPath: ["Bereich B"], source: "manual", cards: [] }),
    createCoreDeck({ id: "child-b", parentDeckId: "root-b", name: "Gemeinsam", hierarchyPath: ["Bereich B", "Gemeinsam"], source: "manual", cards: [] }),
  ];
  const hierarchyMarkup = renderToStaticMarkup(
    <LearnScreen
      decks={decks}
      onStartDeck={() => undefined}
      onCreateDeck={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );
  const fallbackMarkup = renderToStaticMarkup(
    <LearnScreen
      decks={decks}
      focusedDeckId="missing-deck"
      onStartDeck={() => undefined}
      onCreateDeck={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(hierarchyMarkup, /aria-label="Bereich A \/ Gemeinsam auswählen"/);
  assert.match(hierarchyMarkup, /aria-label="Bereich B \/ Gemeinsam auswählen"/);
  assert.match(fallbackMarkup, /Stapel nicht gefunden oder nicht verfügbar\./);
  assert.match(fallbackMarkup, /Zu Lernen/);
  assert.match(fallbackMarkup, /Zur Kartenverwaltung/);
  assert.match(fallbackMarkup, /Karten verwalten/);
});
