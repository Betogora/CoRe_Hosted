import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck } from "../coreModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { Deck } from "../coreTypes.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deck = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." } });

function renderScreen(currentDeck: Deck | null = deck, decks: Deck[] = [deck], settingsTarget: "new-cards-per-day" | null = null) {
  return renderToStaticMarkup(
    <DeckSettingsScreen
      deck={currentDeck}
      decks={decks}
      settingsTarget={settingsTarget}
      learningProfiles={getGlobalSchedulerPreferences({}).learningProfiles}
      onSave={() => undefined}
      onSaveLearningProfiles={() => undefined}
      onSaveAppearance={() => undefined}
      onRenameDeck={() => null}
      onCreateSubdeck={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={async () => null}
      onSelectDeck={() => undefined}
      onOpenGlobalSettings={() => undefined}
      onBack={() => undefined}
      backLabel="Zurück zur Kartenverwaltung"
    />,
  );
}

test("deck settings expose three responsive areas and both navigation paths", () => {
  const html = renderScreen();
  for (const heading of ["Stapel", "Tagesrunde &amp; Lernprofile", "Scheduler &amp; CoRe"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der Stapeleinstellungen"/);
  assert.match(html, /md:grid-cols-3/);
  assert.match(html, />Globale Einstellungen</);
  assert.match(html, />Zurück zur Kartenverwaltung</);
  assert.match(html, /CoRe Automatisch/);
  assert.doesNotMatch(html, /CoRe auto/);
});

test("deck appearance controls live in the Stack section instead of the page header", () => {
  const html = renderScreen();
  assert.match(html, /data-testid="deck-settings-title-name"[^>]*>Biologie/);
  assert.match(html, /data-testid="deck-settings-name-input"/);
  assert.match(html, /aria-label="Icon auswählen"/);
  assert.match(html, /aria-label="Farbe auswählen"/);
  assert.match(html, />Name und Darstellung speichern</);
  assert.doesNotMatch(html, /deck-settings-appearance-toolbar/);
});

test("deck profiles are copy-on-apply and global learn-ahead is absent", () => {
  const html = renderScreen();
  assert.match(html, />Lernprofil-Vorlage</);
  assert.match(html, />Auf diesen Stapel anwenden</);
  assert.match(html, /Spätere Änderungen an der Vorlage wirken nicht automatisch weiter/);
  assert.match(html, />Neue Karten pro Tag</);
  assert.match(html, />Wiederholungen pro Tag</);
  assert.match(html, />Kartenreihenfolge</);
  assert.doesNotMatch(html, />Neue und fällige Karten</);
  assert.match(html, />Neue Karten sortieren</);
  assert.match(html, />Fällige Karten sortieren</);
  const forgottenFirstDeck = {
    ...deck,
    deckSettings: {
      ...deck.deckSettings,
      reviewCardSortOrder: "lowest-retrievability" as const,
      schedulerProfile: { ...deck.deckSettings.schedulerProfile, presetId: "custom" as const },
    },
  };
  assert.match(renderScreen(forgottenFirstDeck, [forgottenFirstDeck]), /Wahrscheinlich vergessen zuerst/);
  assert.match(html, /Wiederholungen haben Vorrang/);
  assert.match(html, />Gewünschte Erinnerungsrate</);
  assert.match(html, />Content Repetition</);
  assert.doesNotMatch(html, /Lernkarten vorziehen|Neuer Tag beginnt/);
});

test("deckless settings route offers a real searchable deck selector", () => {
  const html = renderScreen(null, [deck]);
  assert.match(html, />Stapel auswählen</);
  assert.match(html, /data-testid="deck-settings-select"/);
  assert.doesNotMatch(html, /Stapel nicht gefunden/);
});

test("the new-card target points at the stable daily-limit field", () => {
  const html = renderScreen(deck, [deck], "new-cards-per-day");

  assert.match(html, /id="learning-settings-new-cards"/);
  assert.match(html, /data-testid="learning-settings-new-cards"/);
});
