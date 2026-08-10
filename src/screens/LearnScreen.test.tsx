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
      now="2026-08-06T10:00:00.000Z"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      focusedDeckId={null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      collapsedDeckIds={[]}
      onSetDeckExpanded={() => undefined}
    />,
  );

  assert.match(markup, /Welt-Hauptstädte lernen/);
  assert.match(markup, /Stapeloptionen für Welt-Hauptstädte/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="in-progress"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.doesNotMatch(markup, /data-deck-count="total"/);
  assert.match(markup, /data-donut-segment="due"/);
  assert.match(markup, /data-donut-segment="learned"/);
  assert.match(markup, /Gesamtfortschritt für Welt-Hauptstädte:/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Welt-Hauptstädte"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-testid="learn-deck-list-header"/);
  assert.match(markup, />Aktive Stapel<\/h3>/);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"/);
  assert.match(markup, />Stapel<[\s\S]*>Neu<[\s\S]*>In Arbeit<[\s\S]*>Fällig</);
  assert.match(markup, /core-action-ghost/);
  assert.doesNotMatch(markup, /Lernen öffnen/);
  assert.doesNotMatch(markup, /Icon auswählen|Iconfarbe|CoRe aktiv/);
});

test("quick deck creation asks only for a name and optional parent deck", () => {
  const markup = renderToStaticMarkup(
    <LearnScreen
      decks={createWorldCapitalsSeedDecks()}
      now="2026-08-06T10:00:00.000Z"
      initialParentDeckId="deck_world_capitals"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      focusedDeckId={null}
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      collapsedDeckIds={[]}
      onSetDeckExpanded={() => undefined}
    />,
  );

  assert.match(markup, /Stapelname/);
  assert.match(markup, /role="combobox"[^>]*aria-label="Ebene"/);
  assert.match(markup, /data-deck-select-trigger="true"/);
  assert.match(markup, /data-deck-icon="true"/);
  assert.match(markup, />Welt-Hauptstädte</);
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
      now="2026-08-06T10:00:00.000Z"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      focusedDeckId={null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      collapsedDeckIds={[]}
      onSetDeckExpanded={() => undefined}
    />,
  );
  const fallbackMarkup = renderToStaticMarkup(
    <LearnScreen
      decks={decks}
      now="2026-08-06T10:00:00.000Z"
      focusedDeckId="missing-deck"
      onStartDeck={() => undefined}
      onCreateDeck={() => null}
      initialParentDeckId=""
      onDeckCreationHandled={() => undefined}
      onFocusDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onOpenDecks={() => undefined}
      onOpenDeckSettings={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      collapsedDeckIds={[]}
      onSetDeckExpanded={() => undefined}
    />,
  );

  assert.match(hierarchyMarkup, /aria-label="Bereich A \/ Gemeinsam lernen"/);
  assert.match(hierarchyMarkup, /aria-label="Bereich B \/ Gemeinsam lernen"/);
  assert.match(fallbackMarkup, /Stapel nicht gefunden oder nicht verfügbar\./);
  assert.match(fallbackMarkup, /Zu Lernen/);
  assert.match(fallbackMarkup, /Zur Kartenverwaltung/);
  assert.match(fallbackMarkup, /Karten verwalten/);
});
