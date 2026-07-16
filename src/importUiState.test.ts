import assert from "node:assert/strict";
import test from "node:test";
import { projectImportUiState } from "./importUiState.ts";

test("import UI projection separates every active and terminal phase", () => {
  assert.equal(projectImportUiState({}).status, "idle");
  assert.equal(projectImportUiState({ isBusy: true }).status, "analyzing");
  assert.equal(projectImportUiState({ hasPreview: true }).status, "preview");
  assert.equal(projectImportUiState({ jobStatus: "committing", hasPreview: true }).status, "committing");
  assert.equal(projectImportUiState({ jobStatus: "syncing_media", hasPreview: true }).status, "syncing_media");
  assert.equal(projectImportUiState({ jobStatus: "done" }).status, "succeeded");
  assert.equal(projectImportUiState({ mediaStatus: "local-pending" }).status, "partial");
  assert.equal(projectImportUiState({ progressStatus: "failed", retryable: true }).status, "failed_retryable");
  assert.equal(projectImportUiState({ jobStatus: "error" }).status, "failed_terminal");
  assert.equal(projectImportUiState({ jobStatus: "cancelled", hasPreview: true }).status, "cancelled");
});
