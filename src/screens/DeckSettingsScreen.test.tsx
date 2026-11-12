import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createBasicNote, createCoreDeck } from "../coreModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { DeckSettingsSection } from "../appNavigation.ts";
import type { Deck } from "../coreTypes.ts";
import type { OfflineDeckRecord } from "../workspaceReplica.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deckId = "deck-biologie";
const deck = createCoreDeck({ id: deckId, name: "Biologie", cards: createBasicNote(deckId, "Was ist ATP?", "Ein Energieträger.").cards });

function renderScreen(currentDeck: Deck | null = deck, decks: Deck[] = [deck], offlineDeck: OfflineDeckRecord | null = null, section: DeckSettingsSection = "stapel") {
  return renderToStaticMarkup(
    <DeckSettingsScreen
      section={section}
      onSelectSection={() => undefined}
      deck={currentDeck}
      decks={decks}
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
      onClose={() => undefined}
    />,
  );
}

test("deck settings are one dialog in the shared settings frame with three areas, a deck switch and the defaults link", () => {
  const html = renderScreen();
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="[^"]+" data-testid="deck-settings-dialog"/);
  assert.match(html, /<nav aria-label="Bereiche der Stapeleinstellungen"/);
  for (const section of ["stapel", "tagesrunde", "scheduler"]) assert.match(html, new RegExp(`data-settings-section="${section}"`));
  assert.match(html, /aria-current="page" data-settings-section="stapel"/);
  assert.match(html, /data-testid="deck-settings-select"/);
  assert.match(html, />Standardwerte</);
  assert.match(html, /aria-label="Stapeleinstellungen schließen"/);
  assert.doesNotMatch(html, /Zurück zu (?:Lernen|zur|der)|>Lerneinstellungen</);
  assert.doesNotMatch(html, /CoRe Automatisch|CoRe auto/);
});

test("each deck area renders alone and `start` shows the area list on narrow screens", () => {
  const ids = { stapel: "deck-identity", tagesrunde: "deck-daily-profiles", scheduler: "deck-scheduler-core" } as const;
  for (const [section, id] of Object.entries(ids) as Array<[keyof typeof ids, string]>) {
    const html = renderScreen(deck, [deck], null, section);
    for (const otherId of Object.values(ids)) {
      if (otherId === id) assert.match(html, new RegExp(`id="${otherId}"`));
      else assert.doesNotMatch(html, new RegExp(`id="${otherId}"`));
    }
  }
  const start = renderScreen(deck, [deck], null, "start");
  assert.match(start, /data-settings-view="areas"/);
  assert.match(start, /id="deck-identity"/);
});

test("deck appearance controls live in the Stack section instead of the page header", () => {
  const html = renderScreen();
  const identity = html.slice(html.indexOf('id="deck-identity"'));
  assert.doesNotMatch(identity, /core-surface-raised|rounded-panel|bg-core-subtle p-4/);
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
  const daily = renderScreen(deck, [deck], null, "tagesrunde");
  const scheduler = renderScreen(deck, [deck], null, "scheduler");
  const html = daily + scheduler;
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
  assert.match(renderScreen(forgottenFirstDeck, [forgottenFirstDeck], null, "tagesrunde"), /Wahrscheinlich vergessen zuerst/);
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
  assert.doesNotMatch(html, /Stapel nicht gefunden|gelten je Stapel/);
});

test("the new-card target points at the stable daily-limit field", () => {
  const html = renderScreen(deck, [deck], null, "neue-karten");

  assert.match(html, /id="learning-settings-new-cards"/);
  assert.match(html, /data-testid="learning-settings-new-cards"/);
});

test("offline usage distinguishes cache, protected download and pending updates", () => {
  assert.match(renderScreen(), /Teilweise zwischengespeichert/);
  assert.match(renderScreen(deck, [deck], {
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
  const outdated = renderScreen(deck, [deck], {
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

test("variant generation is offered only for decks with CoRe switched on and locks while running", () => {
  const render = (currentDeck: Deck, running: boolean) => renderToStaticMarkup(
    <DeckSettingsScreen
      section="stapel"
      onSelectSection={() => undefined}
      deck={currentDeck}
      decks={[currentDeck]}
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
      onGenerateVariants={() => undefined}
      variantGenerationRunning={running}
      onClose={() => undefined}
    />,
  );
  const coreOn = { ...deck, deckSettings: { ...deck.deckSettings, coreMode: "on" as const } };
  const coreOff = { ...deck, deckSettings: { ...deck.deckSettings, coreMode: "off" as const } };

  assert.doesNotMatch(render(coreOff, false), /deck-settings-variant-generation/);
  const idle = render(coreOn, false);
  assert.match(idle, /data-testid="deck-settings-variant-generation"/);
  assert.match(idle, />Varianten generieren</);
  assert.match(idle, />Varianten neu generieren</);
  assert.match(idle, /Je eine Variante für bis zu 50 Karten/);
  assert.match(render(coreOn, true), /<button[^>]*disabled=""[^>]*>.*Varianten generieren/);
});

test("the Stack section sets the leech threshold and action (default: only mark)", () => {
  const markup = renderScreen();
  const leech = markup.slice(markup.indexOf('data-testid="deck-settings-leech"'));
  assert.match(leech, /<label for="deck-settings-leech-threshold"[^>]*>Lernbremse ab Fehlern<\/label><div class="core-settings-row-control"><span[^>]*><input id="deck-settings-leech-threshold" type="number"[^>]*min="1" max="99"[^>]*value="8"/);
  assert.match(leech, /aria-label="Aktion der Lernbremse"[\s\S]*?aria-pressed="true"[^>]*>Nur kennzeichnen[\s\S]*?Aussetzen/);
});
