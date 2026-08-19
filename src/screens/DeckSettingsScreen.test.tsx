import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck } from "../coreModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { Deck } from "../coreTypes.ts";
import type { OfflineDeckRecord } from "../workspaceReplica.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deck = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." } });

function renderScreen(currentDeck: Deck | null = deck, decks: Deck[] = [deck], settingsTarget: "new-cards-per-day" | null = null, offlineDeck: OfflineDeckRecord | null = null) {
  return renderToStaticMarkup(
    <DeckSettingsScreen
      deck={currentDeck}
      decks={decks}
      settingsTarget={settingsTarget}
      learningProfiles={getGlobalSchedulerPreferences({}).learningProfiles}
      onSaveSettings={() => null}
      onApplyLearningProfile={() => null}
      onSaveLearningProfiles={() => undefined}
      onDraftStateChange={() => undefined}
      onRequestContextAction={(action) => action()}
      onCreateSubdeck={() => undefined}
      onDeleteDeck={async () => null}
      onSelectDeck={() => undefined}
      onOpenGlobalSettings={() => undefined}
      offlineDeck={offlineDeck}
      bodyCache={{ total: 1, cached: offlineDeck ? 0 : 1, downloaded: offlineDeck?.state === "available" ? 1 : 0 }}
      onDownloadDeck={async () => undefined}
      onRemoveDeckDownload={async () => undefined}
      onBack={() => undefined}
      backLabel="Zurück zur Kartenverwaltung"
    />,
  );
}

test("deck settings expose three responsive in-page links and both navigation paths", () => {
  const html = renderScreen();
  for (const heading of ["Stapel", "Tagesrunde &amp; Lernprofile", "Scheduler &amp; CoRe"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der Stapeleinstellungen"/);
  for (const target of ["deck-identity", "deck-daily-profiles", "deck-scheduler-core"]) assert.match(html, new RegExp(`href="#${target}"`));
  assert.match(html, /data-in-page-navigation="desktop"/);
  assert.match(html, /data-in-page-navigation="compact"/);
  assert.doesNotMatch(html, /md:grid-cols-3|Alle Bereiche|\d+\s*\/\s*\d+/);
  assert.match(html, />Globale Einstellungen</);
  assert.match(html, />Zurück zur Kartenverwaltung</);
  assert.doesNotMatch(html, /CoRe Automatisch|CoRe auto/);
});

test("deck appearance controls live in the Stack section instead of the page header", () => {
  const html = renderScreen();
  assert.match(html, /data-testid="deck-settings-title-name"[^>]*>Biologie/);
  assert.match(html, /data-testid="deck-settings-name-input"/);
  assert.match(html, /aria-label="Icon auswählen"/);
  assert.match(html, /aria-label="Farbe auswählen"/);
  assert.doesNotMatch(html, />Name und Darstellung speichern</);
  assert.doesNotMatch(html, /deck-settings-appearance-toolbar/);
});

test("deck primary controls place CoRe mode beside management actions without study starts or separator", () => {
  const html = renderScreen();
  const container = html.match(/<div class="([^"]*)" data-testid="deck-settings-primary-controls">/);
  const controlsStart = html.indexOf('data-testid="deck-settings-primary-controls"');
  const nextSectionStart = html.indexOf('id="deck-daily-profiles"', controlsStart);
  const controls = html.slice(controlsStart, nextSectionStart);

  assert.ok(container);
  assert.doesNotMatch(container[1], /border-t|pt-5/);
  assert.match(controls, />Unterstapel anlegen<\/span><\/button>/);
  assert.match(controls, /aria-label="CoRe-Modus"/);
  assert.match(controls, />Löschen<\/span><\/button>/);
  assert.doesNotMatch(html, /<span>(?:Lernen|Varianten lernen)<\/span>/);
  assert.equal(html.match(/aria-label="CoRe-Modus"/g)?.length, 1);
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
  assert.match(html, />Lernschritte</);
  assert.match(html, />Nach einem Fehler erneut zeigen</);
  assert.doesNotMatch(html, /Kurze Abstände verdoppeln/);
  assert.match(html, />Gewünschte Erinnerungsrate</);
  assert.match(html, />Content Repetition</);
  assert.doesNotMatch(html, />Stapeleinstellungen speichern</);
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

test("offline usage distinguishes cache, protected download and pending updates", () => {
  assert.match(renderScreen(), /Teilweise zwischengespeichert/);
  assert.match(renderScreen(deck, [deck], null, {
    id: deck.id,
    deckId: deck.id,
    state: "available",
    expectedCardCount: 1,
    verifiedCardCount: 1,
    expectedMediaCount: 0,
    verifiedMediaCount: 0,
    expectedBytes: 128,
    downloadedBytes: 128,
    manifestCursor: "card-1",
    failureMessage: null,
    updatedAt: "2026-08-17T12:00:00.000Z",
  }), /Offline verfügbar/);
  const outdated = renderScreen(deck, [deck], null, {
    id: deck.id,
    deckId: deck.id,
    state: "outdated",
    expectedCardCount: 1,
    verifiedCardCount: 1,
    expectedMediaCount: 0,
    verifiedMediaCount: 0,
    expectedBytes: 128,
    downloadedBytes: 128,
    manifestCursor: "card-1",
    failureMessage: null,
    updatedAt: "2026-08-17T12:00:00.000Z",
  });
  assert.match(outdated, /Aktualisierung ausstehend/);
  assert.match(outdated, />Aktualisieren</);
  assert.match(outdated, />Offline-Daten entfernen</);
});
