import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { CreationScreen } from "./CreationScreen.tsx";

const callbacks = {
  commitImport: async () => { throw new Error("Kein Import in der Darstellung."); },
  onMethodChange: () => undefined,
  onSaveManualNote: async () => null,
  onStartDeck: () => undefined,
  onReviewDeck: () => undefined,
  onOpenDashboard: () => undefined,
};

test("completed manual creation keeps its follow-up actions", () => {
  const deck = createCoreDeck({ id: "deck-anatomy", name: "Anatomie", source: "manual", cards: [] });
  const markup = renderToStaticMarkup(<CreationScreen decks={[deck]} completedDeckId={deck.id} {...callbacks} />);

  assert.match(markup, /Deine Karten sind bereit/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Karten prüfen/);
  assert.match(markup, /data-screen-heading[^>]*>Karte selbst erstellen<\/h2>/);
  assert.match(markup, /core-page-header-back[\s\S]*?>Erstellen<\/button>/);
  assert.doesNotMatch(markup, />Gespeichert</);
});

test("completed import shows the verified count and only study or dashboard actions", () => {
  const deck = createCoreDeck({ id: "deck-anatomy", name: "Anatomie", source: "manual", cards: [] });
  const markup = renderToStaticMarkup(
    <CreationScreen decks={[deck]} completedDeckId={deck.id} completedCount={46} completionKind="import" {...callbacks} />,
  );

  assert.match(markup, /data-screen-heading[^>]*>Karten importieren<\/h2>/);
  assert.match(markup, /Import erfolgreich/);
  assert.match(markup, /46 Karten wurden/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Zur Übersicht/);
  assert.doesNotMatch(markup, /Karten prüfen|Weitere Karten erstellen/);
});

test("creation entry presents all three creation methods", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} {...callbacks} />);

  assert.match(markup, /Neue Karte/);
  assert.match(markup, /Karten selbst erstellen/);
  assert.match(markup, /Karten automatisch erstellen lassen/);
  assert.match(markup, /md:grid-cols-3/);
  assert.doesNotMatch(markup, /Schreibe Karten selbst oder mit einer PDF-Datei\.|Übernimm bestehende Stapel\./);
  assert.doesNotMatch(markup, /Core ·|Karten manuell erstellen|Front\/Back-Listen/);
});

test("source creation offers readable files and settings without a generation action", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="ai-source" {...callbacks} />);
  assert.match(markup, /Die automatische Erstellung ist noch nicht verfügbar/);
  assert.match(markup, /accept="\.pdf,\.txt,\.md,\.markdown,\.csv,\.tsv"/);
  assert.match(markup, /data-screen-heading[^>]*>Karten automatisch erstellen lassen<\/h2>/);
  assert.match(markup, /<h3[^>]*>Quelle und Stapel<\/h3>/);
  for (const label of ["Quelle und Stapel", "Kartenformen", "Vorgaben"]) assert.match(markup, new RegExp(`class="core-steps-label">${label}<`), label);
  for (const label of ["Quelle", "Stapelname"]) assert.match(markup, new RegExp(`>${label}(?: <|</)`), label);
  assert.doesNotMatch(markup, /Kartenmenge|Antwortlänge|core-ai-source-format"/, "Kartenformen und Vorgaben folgen in eigenen Schritten");
  assert.match(markup, /role="switch"[\s\S]*?Neuen Stapel anlegen/);
  assert.doesNotMatch(markup, /Schritt 0|Schritt 1 von 3|\?</);
  assert.match(markup, /<ol aria-label="Schritte der automatischen Erstellung"/);
  assert.doesNotMatch(markup, /class="core-steps-step" disabled/, "Weiter und Schritte bleiben aktiv und markieren fehlende Angaben");
  assert.match(markup, /Weiter zu den Kartenformen/);
  assert.match(markup, /Bis 20 MB \(etwa 150 Seiten\)\. Die Quelle wird nur zum Erstellen genutzt und nicht gespeichert\./);
  assert.match(markup, />Quelldatei hier ablegen<\/p><p class="core-body text-core-secondary">PDF, Text, Markdown, CSV oder TSV<\/p>/);
  assert.match(markup, /type="checkbox" role="switch"[^>]*checked=""/);
  assert.doesNotMatch(markup, /type="range"|type="number"|>Karten erstellen<\/span>/);
});

test("import creation takes Anki packages and text or table files in one field without a format selector", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="import" {...callbacks} />);

  assert.match(markup, /core-page-header-back[\s\S]*?>Erstellen<\/button>/);
  assert.match(markup, /data-screen-heading[^>]*>Karten importieren<\/h2>/);
  assert.equal((markup.match(/<h2/g) ?? []).length, 1);
  assert.match(markup, /accept="\.apkg,\.colpkg,\.txt,\.csv,\.tsv"/);
  assert.match(markup, /APKG-, COLPKG-, TXT-, CSV- oder TSV-Datei hier ablegen/);
  assert.match(markup, /Tabellen aus Excel, Numbers oder Quizlet vorher als CSV oder Text speichern\./);
  assert.doesNotMatch(markup, /<a /);
  assert.equal((markup.match(/data-file-drop-field="true"/g) ?? []).length, 1);
  assert.match(markup, />Datei auswählen<\/span>/);
  assert.doesNotMatch(markup, /Importformat|>APKG<|>Text<|>CSV<|>Excel\/Tabelle</);
});

test("manual source entry stays compact until the document field is requested", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /data-screen-heading[^>]*>Karte selbst erstellen<\/h2>/);
  assert.equal((markup.match(/<h2/g) ?? []).length, 1);
  assert.match(markup, /core-page-header-action[\s\S]*?PDF\/Text anfügen[\s\S]*?>Vorschau<\/span><\/button>/);
  assert.doesNotMatch(markup, /Markiere Text und wähle/);
  assert.equal((markup.match(/PDF\/Text anfügen/g) ?? []).length, 1);
  assert.equal((markup.match(/data-file-drop-field="true"/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /Quelldatei auswählen oder ablegen/);
  assert.doesNotMatch(markup, /accept="\.pdf,\.txt,\.md,\.markdown"/);
  assert.doesNotMatch(markup, /Live-Vorschau/);
  assert.doesNotMatch(markup, /Manuelle Erstellung|Karten manuell erstellen/);
  assert.doesNotMatch(markup, /\.docx/i);
});

test("manual creation restores this tab's draft of the account and says which images did not survive", () => {
  const deck = createCoreDeck({ id: "deck-anatomy", name: "Anatomie", source: "manual", cards: [] });
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  try {
    values.set("core.manualDraft.v1.konto-a", JSON.stringify({ version: 1, accountId: "konto-a", snapshot: {
      targetDeckId: deck.id, useNewDeck: false, deckName: "Manueller Kartenstapel", typeIn: false, occlusion: null, additionalFields: [],
      draft: { kind: "basic", front: `<p>Gerettete Frage<img src="${"b".repeat(40)}" alt="bild.png"></p>`, back: "<p>Gerettete Antwort</p>", answerOptions: ["", ""], correctOptionIndices: [0], tags: [] },
      pinnedFields: { front: false, back: false },
    } }));
    const markup = renderToStaticMarkup(<CreationScreen accountId="konto-a" decks={[deck]} initialMethod="manual" initialTargetDeckId={deck.id} {...callbacks} />);

    // The editors take their HTML only after mounting, so static markup cannot show the restored text.
    assert.match(markup, /Bilder des Entwurfs gehen beim Neuladen verloren\. Füge sie erneut ein\./);
    assert.match(markup, /<button type="button" class="core-action-secondary core-action-destructive-secondary [^"]*">(?:<span>)?Entwurf verwerfen/);

    const otherAccount = renderToStaticMarkup(<CreationScreen accountId="konto-b" decks={[deck]} initialMethod="manual" initialTargetDeckId={deck.id} {...callbacks} />);
    assert.doesNotMatch(otherAccount, /Bilder des Entwurfs/);
    assert.match(otherAccount, /<button type="button" disabled="" class="core-action-secondary core-action-destructive-secondary [^"]*">(?:<span>)?Entwurf verwerfen/);
    assert.equal(values.size, 0, "der Entwurf eines anderen Kontos verlässt den Tab");
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  }
});

test("manual target selection shows complete deck paths", () => {
  const parent = createCoreDeck({ id: "deck-parent", name: "Biologie", source: "manual", cards: [] });
  const child = createCoreDeck({ id: "deck-child", parentDeckId: parent.id, name: "Zelle", hierarchyPath: ["Biologie", "Zelle"], source: "manual", cards: [] });
  const markup = renderToStaticMarkup(
    <CreationScreen decks={[parent, child]} initialMethod="manual" initialTargetDeckId={child.id} {...callbacks} />,
  );

  assert.match(markup, /Biologie \/ Zelle/);
  assert.match(markup, /data-deck-select-trigger="true"/);
  assert.match(markup, /data-deck-icon="true"/);
  assert.doesNotMatch(markup, />Fertig</, "Fertig erscheint erst mit der ersten gespeicherten Karte");
  assert.match(markup, /data-testid="manual-actions"[\s\S]*?Karte speichern[\s\S]*?Entwurf verwerfen/);
});

test("the question type leads the shared editor toolbar; learning direction and typing stay a labeled row", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /class="core-editor-toolbar core-surface-raised core-manual-tools"[^>]*>[\s\S]*?aria-label="Fragentyp"[^>]*core-segmented-control/);
  assert.match(markup, />Single Choice</);
  assert.match(markup, />Multiple Choice</);
  assert.match(markup, />Bildverdeckung</);
  assert.match(markup, /data-testid="manual-card-options"[\s\S]*?>Lernrichtung</);
  assert.match(markup, /aria-label="Lernrichtung"[^>]*core-segmented-control/);
  assert.match(markup, />Beide Richtungen</);
  assert.match(markup, /role="switch" aria-checked="false" aria-label="Vorderseite nach dem Speichern behalten" class="core-keep-pin"/, "keeping a field is a bare pin");
  assert.match(markup, /data-testid="manual-card-options"[\s\S]*?role="switch"[^>]*aria-label="Antwort eintippen"/, "Antwort eintippen steht bei der Lernrichtung, nicht bei den Bausteinen");
  assert.doesNotMatch(markup, /Weitere Optionen|Antwortoptionen statt freier Antwort verwenden|Vorder- und Rückseite zusätzlich umgekehrt abfragen/);
});

test("manual fields share one toolbar and have no separate image drop fields", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.doesNotMatch(markup, /Werkzeuge zur Textformatierung/, "the fields render no own toolbar; the shared bar fills after mounting");
  assert.doesNotMatch(markup, /Bild zur (?:Vorder|Rück)seite einfügen|kind="image"/);
  const blocks = markup.slice(markup.indexOf('data-testid="note-blocks"'));
  assert.doesNotMatch(blocks, /Antwort eintippen/);
  for (const label of ["Zusatzfrage", "Hinweis", "Zusatz", "Quelle"]) assert.match(blocks, new RegExp(`${label}</button>`));
  assert.doesNotMatch(markup, /<details|<summary|Weitere Felder/);
});
