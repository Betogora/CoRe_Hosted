import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyApkgImportSession, disposeApkgImportPreview, hasVisibleApkgImportSession, resolveApkgCreationMethod } from "./apkgImportSession.ts";

test("account session restores the APKG method after app navigation without persisting a file", () => {
  const empty = createEmptyApkgImportSession();
  assert.equal(hasVisibleApkgImportSession(empty), false);
  assert.equal(resolveApkgCreationMethod("", empty), "");

  const active = {
    ...empty,
    job: { fileName: "karten.apkg", fileSize: 42, status: "syncing_cloud", warnings: [], errors: [] },
    selectedFile: { name: "karten.apkg", size: 42 } as File,
  };
  assert.equal(resolveApkgCreationMethod("", active), "import");
  assert.equal(resolveApkgCreationMethod("manual", active), "manual");

  const afterReload = createEmptyApkgImportSession(active.version + 1);
  assert.equal(afterReload.selectedFile, null);
  assert.equal(resolveApkgCreationMethod("", afterReload), "");
});

test("reset disposal closes only the visible worker preview", () => {
  let disposed = 0;
  const session = {
    ...createEmptyApkgImportSession(),
    preview: { commitGraph: { kind: "worker-import", dispose() { disposed += 1; } } } as any,
  };

  disposeApkgImportPreview(session);
  assert.equal(disposed, 1);
  assert.equal(hasVisibleApkgImportSession(createEmptyApkgImportSession(session.version + 1)), false);
});
