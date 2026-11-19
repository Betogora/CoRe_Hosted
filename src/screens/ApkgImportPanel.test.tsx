import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createApkgImportPreview, type ApkgImportPreview } from "../apkgImport.ts";
import { createEmptyApkgImportSession, type ApkgImportSession } from "../apkgImportSession.ts";
import { ApkgImportPanel } from "./ApkgImportPanel.tsx";

async function fixturePreview(path: string): Promise<ApkgImportPreview> {
  const bytes = await readFile(new URL(`../../fixtures/apkg/${path}`, import.meta.url));
  return createApkgImportPreview(new File([bytes], path.split("/").at(-1)!));
}

function renderPanel(session: ApkgImportSession, props: Partial<React.ComponentProps<typeof ApkgImportPanel>> = {}) {
  return renderToStaticMarkup(
    <ApkgImportPanel
      workflow={{} as React.ComponentProps<typeof ApkgImportPanel>["workflow"]}
      session={session}
      onSessionChange={() => undefined}
      isSessionCurrent={() => true}
      onResetSession={() => undefined}
      onCompleted={() => undefined}
      onTextFile={() => undefined}
      {...props}
    />,
  );
}

function previewSession(preview: ApkgImportPreview, overrides: Partial<ApkgImportSession> = {}): ApkgImportSession {
  const file = new File([], preview.fileName);
  return {
    ...createEmptyApkgImportSession(),
    selectedFile: file,
    job: { fileName: preview.fileName, fileSize: preview.fileSize, status: "preview", warnings: preview.report.warnings, errors: [] },
    preview,
    ...overrides,
  };
}

test("die Übernahme zeigt einen Balken ohne interne Schritte", async () => {
  const preview = await fixturePreview("matrix/standard-latest.apkg");
  const markup = renderPanel(previewSession(preview, {
    job: { fileName: preview.fileName, fileSize: preview.fileSize, status: "committing", warnings: [], errors: [] },
    isParsing: true,
    phaseProgress: { phase: "committing", percent: 40 },
  }));

  assert.match(markup, /role="progressbar" aria-label="Übernahme von standard-latest\.apkg" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40"/);
  assert.match(markup, />40 %</);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>[\s\S]*?Import übernehmen/);
  assert.doesNotMatch(markup, /Importstatus|Cloud|Medien werden synchronisiert/);
});

test("die Vorschau zeigt Kennzahlen, den Notiztyp-Bericht und Kartenbeispiele", async () => {
  const preview = await fixturePreview("matrix/standard-latest.apkg");
  const markup = renderPanel(previewSession(preview));

  assert.match(markup, />Matrix Standard</);
  assert.match(markup, />Import übernehmen</);
  assert.match(markup, /Erkannte Stapel/);
  assert.match(markup, /Medien vorhanden/);
  assert.match(markup, /<h4 id="apkg-notetypes-heading"[^>]*>Notiztypen<\/h4>/);
  assert.equal((markup.match(/data-testid="apkg-notetype-report"/g) ?? []).length, preview.report.notetypes.length);
  assert.match(markup, />Basic \(and reversed card\)</);
  assert.match(markup, />Frage und Antwort</);
  assert.match(markup, />Lückentext</);
  assert.match(markup, />Generisch</);
  assert.match(markup, /2 Inhalte · 5 Karten · kein Lernstand/);
  assert.match(markup, /1 Inhalt · 2 Karten · kein Lernstand/);
  assert.match(markup, /Nur im Editor sichtbar: Add Reverse/);
  assert.match(markup, />Kartenbeispiele</);
  assert.equal((markup.match(/>Originalkarte</g) ?? []).length, 3);
  assert.doesNotMatch(markup, /Warnung/);
});

test("der Notiztyp-Bericht nennt Lernstände, fehlende Medien und Warnungen", async () => {
  const learning = renderPanel(previewSession(await fixturePreview("matrix/learning-latest.apkg")));
  assert.match(learning, /8 Inhalte · 8 Karten · 6 mit Lernstand/);

  const media = renderPanel(previewSession(await fixturePreview("matrix/media-latest.apkg")));
  assert.match(media, /1 Medium fehlt im Paket\./);
  assert.match(media, /1 referenziertes Medium fehlt im Paket\. Betroffene Karten können ohne Bild oder Ton erscheinen\./);
  assert.match(media, /<details><summary id="apkg-warnings-heading"[^>]*>[\s\S]*?1 Warnung/, "Warnungen sind zugeklappt zusammengefasst");
  assert.match(media, /<li>1 referenziertes Medium fehlt im Paket\.<\/li>/);
});

test("Feldlisten-Rückfälle und übersprungene Inhalte werden je Notiztyp gemeldet", async () => {
  const preview = await fixturePreview("world-capitals.apkg");
  const [notetype] = preview.report.notetypes;
  const markup = renderPanel(previewSession({
    ...preview,
    report: {
      ...preview.report,
      notetypes: [{ ...notetype, translator: { id: "field-list", version: 1 }, fallbackNotes: 2, untranslatableNotes: 1, missingMedia: ["a.png", "b.png"] }],
    },
  }));

  assert.match(markup, />Feldliste</);
  assert.match(markup, /2 Inhalte werden generisch als Feldliste übernommen\./);
  assert.match(markup, /1 Inhalt ohne darstellbares Feld wird übersprungen\./);
  assert.match(markup, /2 Medien fehlen im Paket\./);
});

test("ein Analysefehler wird als Alarm ohne Vorschau angezeigt", () => {
  const markup = renderPanel({
    ...createEmptyApkgImportSession(),
    selectedFile: new File([], "gross.apkg"),
    job: { fileName: "gross.apkg", fileSize: 0, status: "error", warnings: [], errors: ["Die Anki-Datei ist größer als 2 GiB. Bitte wähle eine kleinere Datei aus."] },
  });

  assert.match(markup, /role="alert"[^>]*><p>Die Anki-Datei ist größer als 2 GiB\. Bitte wähle eine kleinere Datei aus\.<\/p>/);
  assert.equal((markup.match(/>Fehlgeschlagen</g) ?? []).length, 1);
  assert.doesNotMatch(markup, /Import übernehmen/);
});

test("eine laufende Analyse lässt sich abbrechen und endet ohne übernommene Karten", () => {
  const file = { name: "gross.apkg", size: 900_000_000 } as File;
  const analyzing = renderPanel({
    ...createEmptyApkgImportSession(),
    selectedFile: file,
    job: { fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] },
    isParsing: true,
    analysisAbort: new AbortController(),
    phaseProgress: { phase: "analyzing", percent: 25 },
  });
  assert.match(analyzing, />Analyse abbrechen</);
  assert.match(analyzing, /role="progressbar" aria-label="Analyse von gross\.apkg"[^>]*aria-valuenow="25"/);

  const cancelled = renderPanel({
    ...createEmptyApkgImportSession(),
    selectedFile: file,
    job: { fileName: file.name, fileSize: file.size, status: "cancelled", warnings: [], errors: [] },
  });
  assert.match(cancelled, /Analyse abgebrochen\. Es wurden keine Karten übernommen/);
  assert.match(cancelled, />Abgebrochen</);
  assert.doesNotMatch(cancelled, />Analyse abbrechen</);
});

test("ein unterbrochener Import wird vor der Dateiauswahl gemeldet", () => {
  const interruptedImport = { fileName: "Anki.apkg", fileSize: 1_234, deckIds: ["deck"], cardCount: 2_500, committedCards: 1_000 };
  const markup = renderPanel(createEmptyApkgImportSession(), { interruptedImport });
  assert.match(markup, /Der Import von „Anki\.apkg“ wurde unterbrochen: 1\.000 von 2\.500 Karten sind übernommen\. Wähle dieselbe Datei erneut, um ihn zu vervollständigen\./);

  const running = renderPanel({ ...createEmptyApkgImportSession(), selectedFile: new File([], "Anki.apkg"), isParsing: true, job: { fileName: "Anki.apkg", fileSize: 0, status: "parsing", warnings: [], errors: [] } }, { interruptedImport });
  assert.doesNotMatch(running, /wurde unterbrochen/);
});
