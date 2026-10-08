import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createApkgImportPreview, type ApkgImportPreview } from "../apkgImport.ts";
import { createEmptyApkgImportSession, type ApkgImportSession } from "../apkgImportSession.ts";
import type { ImportCloudSyncTask } from "../creationWorkflow.ts";
import type { MediaSyncTask } from "../mediaStore.ts";
import { ApkgImportPanel } from "./ApkgImportPanel.tsx";

async function fixturePreview(path: string): Promise<ApkgImportPreview> {
  const bytes = await readFile(new URL(`../../fixtures/apkg/${path}`, import.meta.url));
  return createApkgImportPreview(new File([bytes], path.split("/").at(-1)!));
}

function renderPanel(session: ApkgImportSession) {
  return renderToStaticMarkup(
    <ApkgImportPanel
      workflow={{} as React.ComponentProps<typeof ApkgImportPanel>["workflow"]}
      session={session}
      onSessionChange={() => undefined}
      isSessionCurrent={() => true}
      onResetSession={() => undefined}
      onCompleted={() => undefined}
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

function pendingCloudTask(): ImportCloudSyncTask {
  return {
    status: "local-pending",
    ready: new Promise<void>(() => undefined),
    async retry() { return { status: "local-pending", message: "Lokal gespeichert." }; },
    subscribe() { return () => undefined; },
  };
}

test("cloud-pending APKG session never projects a finished import", () => {
  const mediaTask: MediaSyncTask = {
    progress: { completed: 0, total: 1, uploaded: 0, reused: 0, currentName: "", processedBytes: 0, totalBytes: 1 },
    queued: Promise.resolve(),
    result: new Promise(() => undefined),
    async pause() {},
    resume() {},
    async cancel() {},
    subscribe() { return () => undefined; },
  };
  const session: ApkgImportSession = {
    ...createEmptyApkgImportSession(),
    selectedFile: { name: "karten.apkg", size: 4_300_000 } as File,
    job: { fileName: "karten.apkg", fileSize: 4_300_000, status: "syncing_cloud", warnings: [], errors: [] },
    cloudTask: pendingCloudTask(),
    mediaTask,
    phaseProgress: { phase: "syncing_cloud", percent: 95 },
  };
  const markup = renderPanel(session);

  assert.match(markup, /Cloud-Daten werden synchronisiert/);
  assert.match(markup, /Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus\./);
  assert.match(markup, />Cloud-Sync erneut versuchen</);
  assert.doesNotMatch(markup, /Import erfolgreich abgeschlossen/);
  assert.doesNotMatch(markup, /Pausieren|Upload abbrechen/);
  assert.match(markup, /aria-valuenow="95"/);
});

test("die Vorschau zeigt Kennzahlen, den Notiztyp-Bericht und Kartenbeispiele", async () => {
  const preview = await fixturePreview("matrix/standard-latest.apkg");
  const markup = renderPanel(previewSession(preview));

  assert.match(markup, />Importvorschau</);
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
  assert.match(media, /1 Warnung<\/h4>/);
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

test("die Reimport-Zusammenfassung nennt erhaltene lokale Bearbeitungen und fehlende Karten", async () => {
  const preview = await fixturePreview("world-capitals.apkg");
  const plural = renderPanel(previewSession(preview, { reimport: { keptLocalEdits: 2, missingInPackage: 3 } }));
  const singular = renderPanel(previewSession(preview, { reimport: { keptLocalEdits: 1, missingInPackage: 1 } }));
  const onlyMissing = renderPanel(previewSession(preview, { reimport: { keptLocalEdits: 0, missingInPackage: 1 } }));

  assert.match(plural, /data-testid="apkg-reimport-summary"/);
  assert.match(plural, /2 lokal bearbeitete Inhalte bleiben unverändert\./);
  assert.match(plural, /3 Karten fehlen im Paket und bleiben erhalten\./);
  assert.match(singular, /1 lokal bearbeitete\S* Inhalt bleibt unverändert\./);
  assert.match(singular, /1 Karte fehlt im Paket und bleibt erhalten\./);
  assert.doesNotMatch(onlyMissing, /lokal bearbeitete/);
  assert.doesNotMatch(renderPanel(previewSession(preview)), /apkg-reimport-summary/);
});

test("ein Analysefehler wird als Alarm ohne Vorschau angezeigt", () => {
  const markup = renderPanel({
    ...createEmptyApkgImportSession(),
    selectedFile: new File([], "gross.apkg"),
    job: { fileName: "gross.apkg", fileSize: 0, status: "error", warnings: [], errors: ["Die Anki-Datei ist größer als 2 GiB. Bitte wähle eine kleinere Datei aus."] },
  });

  assert.match(markup, /role="alert"[^>]*><p>Die Anki-Datei ist größer als 2 GiB\. Bitte wähle eine kleinere Datei aus\.<\/p>/);
  assert.doesNotMatch(markup, /Importvorschau|Import übernehmen/);
});
