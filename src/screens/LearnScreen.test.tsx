import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createWorldCapitalsSeedDecks } from "../fixtures/worldCapitals.ts";
import { createCoreDeck } from "../coreModel.ts";
import { LearnScreen } from "./LearnScreen.tsx";

test("learning rows expose shared counts, direct activation, settings and drag-and-drop", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      focusedDeckId={null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onMoveDeck={() => null}
    />,
  );

  assert.match(markup, /Welt-Hauptstädte lernen/);
  assert.match(markup, /Stapeloptionen für Welt-Hauptstädte/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.match(markup, /data-deck-count="total"/);
  assert.match(markup, /conic-gradient/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.doesNotMatch(markup, /learn-deck-list-header/);
  assert.doesNotMatch(markup, />Lernen<\/span><\/button>/);
  assert.doesNotMatch(markup, /Icon auswählen|Iconfarbe|CoRe aktiv/);
});

test("quick deck creation asks only for a name and optional parent deck", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      initialParentDeckId="deck_world_capitals"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      focusedDeckId={null}
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onMoveDeck={() => null}
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
      onCreateDeck={() => null}
      focusedDeckId={null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onMoveDeck={() => null}
    />,
  );
  const fallbackMarkup = renderToStaticMarkup(
    <LearnScreen
      decks={decks}
      focusedDeckId="missing-deck"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onMoveDeck={() => null}
    />,
  );

  assert.match(hierarchyMarkup, /aria-label="Bereich A \/ Gemeinsam lernen"/);
  assert.match(hierarchyMarkup, /aria-label="Bereich B \/ Gemeinsam lernen"/);
  assert.match(fallbackMarkup, /Stapel nicht gefunden oder nicht verfügbar\./);
  assert.match(fallbackMarkup, /Zu Lernen/);
  assert.match(fallbackMarkup, /Zur Kartenverwaltung/);
  assert.match(fallbackMarkup, /Karten verwalten/);
});
