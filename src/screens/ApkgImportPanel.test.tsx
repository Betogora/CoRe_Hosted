import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyApkgImportSession } from "../apkgImportSession.ts";
import { ApkgImportPanel } from "./ApkgImportPanel.tsx";

test("cloud-pending APKG session never projects a finished import", () => {
  const neverReady = new Promise<void>(() => undefined);
  const cloudTask: any = {
    status: "local-pending",
    ready: neverReady,
    async retry() { return { status: "local-pending", message: "Lokal gespeichert." }; },
    subscribe() { return () => undefined; },
  };
  const mediaTask: any = {
    progress: { completed: 0, total: 1, uploaded: 0, reused: 0, currentName: "", processedBytes: 0, totalBytes: 1 },
    queued: Promise.resolve(),
    result: new Promise(() => undefined),
    async pause() {},
    resume() {},
    async cancel() {},
    subscribe() { return () => undefined; },
  };
  const session = {
    ...createEmptyApkgImportSession(),
    selectedFile: { name: "karten.apkg", size: 4_300_000 } as File,
    job: { fileName: "karten.apkg", fileSize: 4_300_000, status: "syncing_cloud", warnings: [], errors: [] },
    cloudTask,
    mediaTask,
    phaseProgress: { phase: "syncing_cloud" as const, percent: 95 },
  };
  const markup = renderToStaticMarkup(
    <ApkgImportPanel
      existingDecks={[]}
      workflow={{} as any}
      mediaStore={null}
      session={session}
      onSessionChange={() => undefined}
      isSessionCurrent={() => true}
      onResetSession={() => undefined}
      onCompleted={() => undefined}
    />,
  );

  assert.match(markup, /Cloud-Daten werden synchronisiert/);
  assert.match(markup, /Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus/);
  assert.doesNotMatch(markup, /Import erfolgreich abgeschlossen/);
  assert.doesNotMatch(markup, /Pausieren|Upload abbrechen/);
  assert.match(markup, /aria-valuenow="95"/);
});
