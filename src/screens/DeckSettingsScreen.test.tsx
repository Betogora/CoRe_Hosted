import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck } from "../coreModel.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deck = createManualCoreDeck({
  deckName: "Biologie",
  card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
});

function renderScreen(backLabel?: string, currentDeck = deck) {
  return renderToStaticMarkup(
    <DeckSettingsScreen
      deck={currentDeck}
      decks={[currentDeck]}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onRenameDeck={() => null}
      onCreateSubdeck={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={async () => null}
      onBack={() => undefined}
      backLabel={backLabel}
    />,
  );
}

test("deck settings label the URL-derived return destination", () => {
  const decksOrigin = renderScreen("Zurück zur Kartenverwaltung");
  const directLinkFallback = renderScreen();

  assert.match(decksOrigin, /Zurück zur Kartenverwaltung/);
  assert.doesNotMatch(decksOrigin, /Zurück zu Lernen/);
  assert.match(directLinkFallback, /Zurück zu Lernen/);
});

test("deck settings show appearance and the borderless rename action in the page title", () => {
  const markup = renderScreen();
  const headerForm = markup.match(/<form[^>]*>([\s\S]*?)<\/form>/)?.[1] ?? "";

  assert.equal(markup.match(/data-testid="deck-settings-title-name"/g)?.length, 1);
  assert.match(markup, /data-testid="deck-settings-title-name"[^>]*>Biologie/);
  assert.match(markup, /data-testid="deck-settings-title-icon"[^>]*style="color:#[^;]+;border-color:#[^;]+;/);
  assert.match(markup, /<button(?=[^>]*aria-label="Stapel umbenennen")(?=[^>]*class="[^"]*border-0)(?=[^>]*data-core-tooltip="Stapel umbenennen")(?=[^>]*data-core-tooltip-deck-icon-key="[^"]+")(?=[^>]*data-core-tooltip-deck-icon-color="#[0-9A-Fa-f]{6}")/);
  assert.doesNotMatch(markup, /core-heading-3[^>]*>Biologie/);
  assert.match(markup, /data-testid="deck-settings-appearance-toolbar"/);
  assert.match(markup, />Icon</);
  assert.match(markup, /aria-label="Icon auswählen"/);
  assert.match(markup, />Farbe</);
  assert.match(markup, /aria-label="Farbe auswählen"/);
  assert.match(markup, />Name und Darstellung speichern</);
  assert.doesNotMatch(headerForm, /core-surface-raised/);
  assert.doesNotMatch(markup, /Nur dieser Stapel|Andere Stapel behalten|Stapel-Icon|Iconfarbe|type="color"/);
});

test("deck learning options use concise copy, full limits, and deck-only CoRe parameters", () => {
  const markup = renderScreen();

  assert.equal(markup.match(/>Lernoptionen</g)?.length, 1);
  assert.doesNotMatch(markup, /Lernen mit|Begrenzt, wie viele|Deckelt fällige|Legt fest, wie neue|Wann eine bereits gelernte|Kein einzelner Abstand|Änderungen werden erst/);
  assert.match(markup, /Der erste Wert gilt nach/);
  assert.match(markup, /Verdoppelt kurze Lern- und Wiederlern-Abstände/);
  assert.match(markup, /Höhere Werte erzeugen kürzere Intervalle/);
  assert.match(markup, /Steuert, ob Varianten automatisch/);
  assert.match(markup, /max="500"[^>]*data-testid="learning-settings-new-cards"/);
  assert.match(markup, /max="2000"[^>]*data-testid="learning-settings-max-reviews"/);
  assert.match(markup, /max="720"[^>]*data-testid="learning-settings-learn-ahead"[^>]*value="20"/);
  assert.match(markup, />Lernkarten vorziehen</);
  assert.match(markup, /Zeigt vorgemerkte Lernwiederholungen am Sitzungsende bis zu diesem Zeitraum früher/);
  assert.match(markup, />Wiederholungen pro Tag</);
  assert.match(markup, />Nach einem Fehler erneut zeigen</);
  assert.match(markup, />Kurze Abstände verdoppeln</);
  assert.match(markup, />Gewünschte Erinnerungsrate</);
  assert.match(markup, />Content Repetition</);
  assert.match(markup, /lg:grid-cols-2 xl:grid-cols-4/);
  assert.match(markup, /lg:grid-cols-2 xl:grid-cols-3/);
  assert.match(markup, />Varianten einsetzen ab Lernstufe</);
  assert.match(markup, />Aktive Varianten pro Karte</);
  assert.match(markup, />CoRe-ready · Standard</);
  assert.match(markup, />2 Varianten</);
  assert.match(markup, />Lernoptionen speichern</);
});

test("deck learning options retain imported custom CoRe values", () => {
  const customDeck = {
    ...deck,
    deckSettings: {
      ...deck.deckSettings,
      variantThresholdXp: 132.5,
      maxActiveVariantsPerCard: 4,
    },
  };
  const markup = renderScreen(undefined, customDeck);

  assert.match(markup, />Eigener Wert · 132.5 XP</);
  assert.match(markup, />Eigener Wert · 4</);
});

test("deck settings own the administrative and learning actions", () => {
  const markup = renderScreen();

  assert.match(markup, />Stapelaktionen<\/h2>/);
  assert.match(markup, />Unterstapel anlegen<\/span>/);
  assert.match(markup, />Lernen<\/span>/);
  assert.match(markup, />Varianten lernen<\/span>/);
  assert.match(markup, />Löschen<\/span>/);
});
