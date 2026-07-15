import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createWorldCapitalsSeedDecks } from "../fixtures/worldCapitals.ts";
import { LearnScreen } from "./LearnScreen.tsx";

test("learning rows expose only counts, an explicit start and secondary deck options", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      onStartDeck={() => undefined}
      onCreateDeck={() => undefined}
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
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, /Stapelname/);
  assert.match(markup, /Als Hauptstapel/);
  assert.doesNotMatch(markup, /Iconfarbe|Icon auswählen/);
});
